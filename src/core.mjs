import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export class RelayError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export function tokenMatches(actual, expected) {
  return typeof actual === 'string' && Boolean(expected) &&
    timingSafeEqual(Buffer.from(digest(actual)), Buffer.from(digest(expected)));
}
export function text(value, name, max, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069\u200b-\u200f\u2060\ufeff]/u.test(value)) {
    throw new RelayError(`${name} must be nonempty plain text, at most ${max} characters`);
  }
  return value;
}
export function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RelayError('Expected an object');
  const allowed = ['kind','channel','title','message','action','ttlSeconds','idempotencyKey'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new RelayError('Unknown request field');
  const { kind, channel = 'telegram', ttlSeconds = 3600 } = input;
  if (!['notify','ask','approve'].includes(kind)) throw new RelayError('Invalid kind');
  if (!['telegram','wechat'].includes(channel)) throw new RelayError('Invalid channel');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 86400) throw new RelayError('ttlSeconds must be 30–86400');
  const action = text(input.action, 'action', 1600, kind !== 'approve');
  if (kind !== 'approve' && action) throw new RelayError('action is only valid for approvals');
  return { kind, channel, title: text(input.title, 'title', 100),
    message: text(input.message, 'message', 1000, true), action, ttlSeconds,
    idempotencyKey: text(input.idempotencyKey ?? randomUUID(), 'idempotencyKey', 120) };
}
export function loadConfig(env = process.env) {
  const apiToken = env.DONERELAY_API_TOKEN ?? '';
  const wechatToken = env.DONERELAY_WECHAT_TOKEN ?? '';
  if (apiToken.length < 32) throw new RelayError('DONERELAY_API_TOKEN needs at least 32 characters');
  const telegram = { token: env.TELEGRAM_BOT_TOKEN ?? '', chat: env.TELEGRAM_CHAT_ID ?? '', user: env.TELEGRAM_USER_ID ?? '' };
  const hasTelegram = Boolean(telegram.token || telegram.chat || telegram.user);
  if (hasTelegram && (!/^\d+:[\w-]+$/.test(telegram.token) || !/^[1-9]\d*$/.test(telegram.chat) || !/^[1-9]\d*$/.test(telegram.user))) {
    throw new RelayError('Set Telegram token, positive private chat ID, and user ID together');
  }
  const wechatUser = env.WECHAT_USER_ID ?? '';
  if ((wechatToken || wechatUser) && (wechatToken.length < 32 || !wechatUser || tokenMatches(wechatToken, apiToken))) {
    throw new RelayError('WeChat requires a user ID and a distinct transport key of at least 32 characters');
  }
  if (!hasTelegram && !wechatUser) throw new RelayError('Configure at least one messaging channel');
  const port = Number(env.PORT ?? 8787), retention = Number(env.RETENTION_DAYS ?? 7);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RelayError('Invalid PORT');
  if (!Number.isInteger(retention) || retention < 1 || retention > 365) throw new RelayError('Invalid RETENTION_DAYS');
  return { apiToken, wechatToken, telegram, wechatUser, wechatTarget: env.WECHAT_TARGET || wechatUser,
    host: env.HOST || '127.0.0.1', port, retention, database: env.DATABASE_PATH || './data/donerelay.sqlite' };
}

// Synchronous SQLite transactions serialize claims and decisions; one daemon owns a database.
export class Store {
  constructor(path = ':memory:', now = Date.now) {
    this.now = now;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL,
        kind TEXT NOT NULL, channel TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
        action TEXT NOT NULL, action_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        answer TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, resolved_at INTEGER,
        delivery TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
        remote_id TEXT, last_error TEXT);
      CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, request_id TEXT NOT NULL,
        event TEXT NOT NULL, actor TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS pending_delivery ON requests(channel,status,delivery,next_attempt);
      CREATE INDEX IF NOT EXISTS remote_message ON requests(channel,remote_id);`);
  }
  atomic(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  event(id, event, actor = 'system') {
    this.db.prepare('INSERT INTO audit(request_id,event,actor,at) VALUES(?,?,?,?)').run(id,event,actor,this.now());
  }
  expire() {
    this.atomic(() => {
      const rows = this.db.prepare("SELECT id FROM requests WHERE status='pending' AND expires_at<=?").all(this.now());
      for (const {id} of rows) {
        this.db.prepare("UPDATE requests SET status='expired',resolved_at=? WHERE id=?").run(this.now(),id);
        this.event(id,'expired');
      }
    });
  }
  create(input) {
    this.expire();
    const value = validate(input), { idempotencyKey: key, ...payload } = value;
    const fingerprint = digest(JSON.stringify(payload));
    const id = this.atomic(() => {
      const old = this.db.prepare('SELECT * FROM requests WHERE idem=?').get(key);
      if (old) {
        if (old.fingerprint !== fingerprint) throw new RelayError('Idempotency key reused with different content',409);
        return old.id;
      }
      if (this.db.prepare("SELECT count(*) AS n FROM requests WHERE status='pending'").get().n >= 1000) throw new RelayError('Too many pending requests',429);
      const id = randomBytes(12).toString('hex'), created = this.now();
      this.db.prepare(`INSERT INTO requests(id,idem,fingerprint,kind,channel,title,message,action,action_hash,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,key,fingerprint,value.kind,value.channel,value.title,value.message,
          value.action,value.action ? digest(value.action) : '',created,created + value.ttlSeconds*1000);
      this.event(id,'created','agent'); return id;
    });
    return this.get(id);
  }
  row(id) {
    const row = this.db.prepare('SELECT * FROM requests WHERE id=?').get(id);
    if (!row) throw new RelayError('Request not found',404);
    return row;
  }
  get(id) {
    this.expire(); const r = this.row(id);
    return { id:r.id, kind:r.kind, channel:r.channel, title:r.title, message:r.message, action:r.action,
      actionHash:r.action_hash, status:r.status, answer:r.answer, createdAt:r.created_at, expiresAt:r.expires_at,
      resolvedAt:r.resolved_at, delivery:{ status:r.delivery, attempts:r.attempts, lastError:r.last_error } };
  }
  claim(channel) {
    this.expire();
    return this.atomic(() => {
      // A worker that crashes on its last lease must eventually fail, not stay pending forever.
      this.db.prepare(`UPDATE requests SET status='failed',resolved_at=?,last_error='delivery_attempts_exhausted'
        WHERE status='pending' AND attempts>=5 AND delivery!='sent' AND lease_until<=?`).run(this.now(),this.now());
      const r = this.db.prepare(`SELECT * FROM requests WHERE channel=? AND status='pending' AND attempts<5
        AND ((delivery='queued' AND next_attempt<=?) OR (delivery='sending' AND lease_until<=?))
        ORDER BY created_at LIMIT 1`).get(channel,this.now(),this.now());
      if (!r) return null;
      const lease = randomBytes(16).toString('hex');
      this.db.prepare("UPDATE requests SET delivery='sending',attempts=attempts+1,lease=?,lease_until=? WHERE id=?")
        .run(lease,this.now()+60000,r.id);
      return { ...r, lease };
    });
  }
  ack(id,lease,ok,remoteId='') {
    this.expire();
    return this.atomic(() => {
      const r = this.row(id);
      if (r.lease !== lease || r.delivery !== 'sending' || r.status !== 'pending') return false;
      if (ok) {
        this.db.prepare(`UPDATE requests SET delivery='sent',remote_id=?,lease=NULL,
          status=?,resolved_at=? WHERE id=?`).run(String(remoteId),r.kind==='notify'?'completed':'pending',
            r.kind==='notify'?this.now():null,id);
        this.event(id,'delivered');
      } else {
        this.db.prepare(`UPDATE requests SET delivery='queued',lease=NULL,lease_until=0,next_attempt=?,
          last_error='transport_error',status=?,resolved_at=? WHERE id=?`)
          .run(this.now()+Math.min(30000,1000*2**r.attempts),r.attempts>=5?'failed':'pending',r.attempts>=5?this.now():null,id);
        this.event(id,'delivery_failed');
      }
      return true;
    });
  }
  resolve(id,channel,actor,decision,answer='') {
    this.expire();
    this.atomic(() => {
      const r = this.row(id);
      if (r.channel !== channel) throw new RelayError('Wrong channel',403);
      if (r.status !== 'pending' || r.delivery !== 'sent') throw new RelayError('Request is not awaiting a reply',409);
      let status;
      if (r.kind === 'approve' && ['approve','reject'].includes(decision)) status = decision==='approve'?'approved':'rejected';
      else if (r.kind === 'ask' && decision === 'reply') { text(answer,'answer',2000); status='answered'; }
      else throw new RelayError('Reply type does not match request');
      this.db.prepare("UPDATE requests SET status=?,answer=?,resolved_at=? WHERE id=? AND status='pending'")
        .run(status,status==='answered'?answer:null,this.now(),id);
      this.event(id,status,actor);
    });
    return this.get(id);
  }
  cancel(id) {
    this.expire();
    this.atomic(() => {
      const r=this.row(id);
      if (r.status==='pending') {
        this.db.prepare("UPDATE requests SET status='cancelled',resolved_at=? WHERE id=?").run(this.now(),id);
        this.event(id,'cancelled','agent');
      }
    }); return this.get(id);
  }
  findRemote(channel,remote) { return this.db.prepare('SELECT id FROM requests WHERE channel=? AND remote_id=?').get(channel,String(remote))?.id; }
  meta(key,value) {
    if (value !== undefined) this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));
    return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;
  }
  purge(days) {
    this.expire(); this.atomic(() => {
      const cutoff=this.now()-days*86400000;
      this.db.prepare("DELETE FROM audit WHERE request_id IN (SELECT id FROM requests WHERE status!='pending' AND resolved_at<?)").run(cutoff);
      this.db.prepare("DELETE FROM requests WHERE status!='pending' AND resolved_at<?").run(cutoff);
    });
  }
  close() { this.db.close(); }
}
export function messageFor(r, wechat = false) {
  const heading={approve:'Approval required',ask:'Question',notify:'Notification'}[r.kind];
  const lines=[`DoneRelay · ${heading}`,r.title,r.message];
  if (r.kind==='approve') lines.push('Exact operation:',r.action,`SHA-256: ${r.action_hash || r.actionHash}`);
  lines.push(`Request: ${r.id}`,`Expires: ${new Date(r.expires_at ?? r.expiresAt).toISOString()}`);
  if (wechat && r.kind==='approve') lines.push(`/donerelay approve ${r.id}`,`/donerelay reject ${r.id}`);
  if (wechat && r.kind==='ask') lines.push(`/donerelay reply ${r.id} YOUR ANSWER`);
  if (!wechat && r.kind==='ask') lines.push('Reply to this message with your answer.');
  return lines.filter(Boolean).join('\n\n');
}
export function parseReply(value) {
  if (typeof value !== 'string') return null;
  const match=value.trim().match(/^(?:\/donerelay\s+|\/)?(approve|reject|reply|批准|拒绝|回复)\s+([a-f0-9]{24})(?:\s+([\s\S]+))?$/u);
  if (!match) return null;
  const decision=({'批准':'approve','拒绝':'reject','回复':'reply'})[match[1]] || match[1];
  if (decision!=='reply' && match[3]) return null;
  return { id:match[2], decision, answer:match[3] ?? '' };
}
