import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { check, RelayError } from './util.js';

// One process per state file. Decisions are synchronous, durable state transitions.
export class Store {
  constructor(file, now = Date.now) {
    this.file = path.resolve(file); this.now = now;
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    this.lock = `${this.file}.lock`;
    try { this.lockFd = fs.openSync(this.lock, 'wx', 0o600); }
    catch { throw new RelayError('State file is locked. Stop the other instance; remove a stale .lock only after verifying it is stopped.', 503); }
    try {
      fs.writeFileSync(this.lockFd, String(process.pid));
      this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { version: 1, requests: {}, meta: {} };
      check(this.data.version === 1 && this.data.requests && this.data.meta, 'Unsupported state format');
      for (const r of Object.values(this.data.requests)) {
        if (r.status === 'pending') { r.status = 'cancelled'; r.reason = 'service_restarted'; r.resolvedAt = now(); }
      }
      this.save();
    } catch (error) { this.close(); throw error; }
  }
  save() {
    const tmp = `${this.file}.${randomBytes(6).toString('hex')}.tmp`;
    let fd;
    try {
      fd = fs.openSync(tmp, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(this.data)); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      fs.renameSync(tmp, this.file);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  change(fn) {
    const before = structuredClone(this.data);
    try { const result = fn(this.data); this.save(); return structuredClone(result); }
    catch (error) { this.data = before; throw error; }
  }
  get(id) {
    const r = this.data.requests[id]; check(r, 'Unknown request', 404);
    if (r.status === 'pending' && r.expiresAt <= this.now()) {
      return this.change(() => { r.status = 'expired'; r.resolvedAt = this.now(); return r; });
    }
    return structuredClone(r);
  }
  put(r) { return this.change((d) => { d.requests[r.id] = r; return r; }); }
  patch(id, fields) { return this.change((d) => { Object.assign(d.requests[id], fields); return d.requests[id]; }); }
  meta(key, value) {
    if (value === undefined) return structuredClone(this.data.meta[key]);
    return this.change((d) => { d.meta[key] = value; return value; });
  }
  decide(id, action, answer, actor) {
    const r = this.get(id);
    check(r.status === 'pending', `Request is already ${r.status}`, 409);
    check(r.channels.includes(actor.channel), 'Request was not sent to this channel', 403);
    check(r.deliveries[actor.channel]?.status === 'sent', 'Request delivery is not confirmed for this channel', 409);
    check(r.kind === 'approval' ? ['approve', 'deny'].includes(action) : action === 'answer', 'Reply type does not match request');
    return this.patch(id, { status: action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : 'answered',
      answer: action === 'answer' ? answer : null, resolvedAt: this.now(), resolvedBy: actor });
  }
  sweep() {
    let changed = false;
    for (const [id, r] of Object.entries(this.data.requests)) {
      if (r.status === 'pending' && r.expiresAt <= this.now()) { this.get(id); }
      if (r.status !== 'pending' && (r.resolvedAt ?? r.createdAt) < this.now() - 7 * 86400000) {
        delete this.data.requests[id]; changed = true;
      }
    }
    if (changed) this.save();
  }
  close() {
    if (this.lockFd !== undefined) { fs.closeSync(this.lockFd); this.lockFd = undefined; fs.unlinkSync(this.lock); }
  }
}
