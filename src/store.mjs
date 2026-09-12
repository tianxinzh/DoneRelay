import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, openSync, closeSync, unlinkSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { invariant, randomId, text, formatRequest } from './common.mjs';

export class Store {
  constructor(path = ':memory:', { clock = Date.now } = {}) {
    this.clock = clock;
    this.lock = null;
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      this.lock = `${path}.lock`;
      let fd;
      try { fd = openSync(this.lock, 'wx', 0o600); }
      catch { throw new Error('State is locked. Stop the other relay; after a crash, verify it is stopped before removing the .lock file.'); }
      writeSync(fd, `${process.pid}\n`); closeSync(fd);
    }
    try {
      this.db = new DatabaseSync(path);
      if (path !== ':memory:') chmodSync(path, 0o600);
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS requests (
          id TEXT PRIMARY KEY, status TEXT NOT NULL, expires INTEGER NOT NULL,
          created INTEGER NOT NULL, data TEXT NOT NULL, response TEXT);
        CREATE TABLE IF NOT EXISTS deliveries (
          id TEXT NOT NULL, channel TEXT NOT NULL, message_id TEXT NOT NULL,
          PRIMARY KEY(channel, message_id));
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, time INTEGER, id TEXT, event TEXT);`);
      // Lost process ownership is not evidence that an old operation is safe to resume.
      this.db.exec("UPDATE requests SET status='cancelled', response=NULL WHERE status IN ('pending','approved','answered')");
    } catch (error) { this.close(); throw error; }
  }
  close() {
    this.db?.close(); this.db = null;
    if (this.lock) { try { unlinkSync(this.lock); } catch {} this.lock = null; }
  }
  audit(id, event) { this.db.prepare('INSERT INTO audit(time,id,event) VALUES(?,?,?)').run(this.clock(), id, event); }
  create(input) {
    invariant(input && typeof input === 'object' && !Array.isArray(input), 'Expected an object');
    invariant(['approval', 'question'].includes(input.kind), 'kind must be approval or question');
    const allowed = new Set(['kind', 'taskId', 'title', 'ttlSeconds', 'context', 'action', 'question', 'choices', 'allowOther']);
    invariant(Object.keys(input).every(key => allowed.has(key)), 'Unsupported request field');
    const ttl = input.ttlSeconds ?? 3600;
    invariant(Number.isInteger(ttl) && ttl >= 1 && ttl <= 86400, 'ttlSeconds must be 1..86400');
    this.expire();
    invariant(this.db.prepare("SELECT count(*) AS n FROM requests WHERE status='pending'").get().n < 100, 'Too many pending requests', 429);
    const r = {
      id: randomId(), nonce: randomId(), kind: input.kind,
      taskId: text(input.taskId, 'taskId', 120), title: text(input.title, 'title', 160),
      context: {}, createdAt: this.clock(), expiresAt: this.clock() + ttl * 1000,
    };
    invariant(input.context == null || (typeof input.context === 'object' && !Array.isArray(input.context)), 'context must be an object');
    for (const [key, value] of Object.entries(input.context || {})) {
      invariant(['threadId', 'turnId', 'itemId', 'sessionId'].includes(key), 'Unsupported context field');
      r.context[key] = text(value, key, 160);
    }
    if (r.kind === 'approval') r.action = text(input.action, 'action', 2600);
    else {
      r.question = text(input.question, 'question', 2200);
      invariant(input.choices == null || (Array.isArray(input.choices) && input.choices.length <= 12), 'choices must be an array with at most 12 entries');
      r.choices = (input.choices || []).map(v => text(v, 'choice', 120));
      invariant(new Set(r.choices).size === r.choices.length, 'Choices must be unique');
      r.allowOther = !r.choices.length || input.allowOther === true;
    }
    r.digest = createHash('sha256').update(JSON.stringify(r)).digest('hex');
    formatRequest(r);
    this.db.prepare('INSERT INTO requests(id,status,expires,created,data) VALUES(?,?,?,?,?)')
      .run(r.id, 'pending', r.expiresAt, r.createdAt, JSON.stringify(r));
    this.audit(r.id, 'created');
    return this.get(r.id);
  }
  get(id) {
    this.expire();
    const row = this.db.prepare('SELECT * FROM requests WHERE id=?').get(id);
    invariant(row, 'Unknown request', 404);
    return { ...JSON.parse(row.data), status: row.status, response: row.response ? JSON.parse(row.response) : null };
  }
  pending() { this.expire(); return this.db.prepare("SELECT id FROM requests WHERE status='pending' ORDER BY created").all().map(r => this.get(r.id)); }
  expire() {
    this.db.prepare("UPDATE requests SET status='expired', response=NULL WHERE status IN ('pending','approved','answered') AND expires <= ?").run(this.clock());
  }
  resolve(id, decision, actor) {
    const r = this.get(id);
    invariant(r.status === 'pending', `Request is ${r.status}; no action taken`, 409);
    let status, response;
    if (r.kind === 'approval') {
      invariant(['approve', 'reject'].includes(decision.type), 'Use explicit approve/reject for approvals');
      status = decision.type === 'approve' ? 'approved' : 'rejected';
      response = { decision: decision.type, actor, at: this.clock(), digest: r.digest };
    } else {
      invariant(decision.type === 'reply', 'This request expects an answer, not an approval');
      const answer = text(decision.text, 'answer', 4000);
      invariant(r.allowOther || r.choices.includes(answer), 'Reply with one of the exact choice labels');
      status = 'answered'; response = { answer, actor, at: this.clock(), digest: r.digest };
    }
    const changed = this.db.prepare("UPDATE requests SET status=?, response=? WHERE id=? AND status='pending' AND expires > ?")
      .run(status, JSON.stringify(response), id, this.clock()).changes;
    invariant(changed === 1, 'Request expired or was already answered', 409);
    this.audit(id, status);
    return this.get(id);
  }
  cancel(id) {
    this.db.prepare("UPDATE requests SET status='cancelled', response=NULL WHERE id=? AND status IN ('pending','approved','answered')").run(id);
    this.audit(id, 'cancelled');
  }
  delivered(id, channel, messageId) {
    this.db.prepare('INSERT OR REPLACE INTO deliveries(id,channel,message_id) VALUES(?,?,?)').run(id, channel, String(messageId));
  }
  forMessage(channel, messageId) { return this.db.prepare('SELECT id FROM deliveries WHERE channel=? AND message_id=?').get(channel, String(messageId))?.id; }
  messages(id) { return this.db.prepare('SELECT channel,message_id FROM deliveries WHERE id=?').all(id); }
  getState(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  }
  setState(key, value) { this.db.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)').run(key, JSON.stringify(value)); }
  prune(days = 7) {
    const threshold = this.clock() - days * 86400000;
    this.db.prepare("DELETE FROM deliveries WHERE id IN (SELECT id FROM requests WHERE created < ? AND status!='pending')").run(threshold);
    this.db.prepare("DELETE FROM requests WHERE created < ? AND status!='pending'").run(threshold);
    this.db.prepare('DELETE FROM audit WHERE time < ?').run(threshold);
  }
}
