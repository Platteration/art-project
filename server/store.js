/* The service keeps users, entitlements and orders in a key-value store with
   the Cloudflare KV surface (get / put / delete / list by prefix). In
   production that is a KV namespace bound as STORE; MemoryStore stands in for
   it in tests and in `node server/dev.mjs`, optionally persisted to a JSON file
   so a local account survives a restart. */

export class MemoryStore {
  constructor({ file, fs } = {}) {
    this.map = new Map();
    this.file = file;
    this.fs = fs;
    if (file && fs && fs.existsSync(file)) {
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const [k, v] of Object.entries(saved)) this.map.set(k, v);
      } catch (e) {
        console.warn(`Could not read ${file}, starting with an empty store: ${e.message}`);
      }
    }
  }

  _live(entry) {
    return entry && (!entry.expires || entry.expires > Date.now() / 1000);
  }

  async get(key, type) {
    const entry = this.map.get(key);
    if (!this._live(entry)) return null;
    return type === 'json' ? JSON.parse(entry.value) : entry.value;
  }

  async put(key, value, { expirationTtl } = {}) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    this.map.set(key, { value: text, expires: expirationTtl ? Date.now() / 1000 + expirationTtl : 0 });
    this._save();
  }

  async delete(key) {
    this.map.delete(key);
    this._save();
  }

  async list({ prefix = '' } = {}) {
    const keys = [...this.map.entries()]
      .filter(([k, e]) => k.startsWith(prefix) && this._live(e))
      .map(([name]) => ({ name }));
    return { keys, list_complete: true };
  }

  _save() {
    if (!this.file || !this.fs) return;
    const out = {};
    for (const [k, e] of this.map) if (this._live(e)) out[k] = e;
    this.fs.writeFileSync(this.file, JSON.stringify(out, null, 1));
  }
}

/* Key layout, shared by the Worker and the docs. */
export const keys = {
  user: (id) => `user:${id}`,
  entitlements: (userId) => `ent:${userId}`,
  order: (userId, created, sessionId) => `order:${userId}:${String(created).padStart(12, '0')}:${sessionId}`,
  orderPrefix: (userId) => `order:${userId}:`,
  stripeSession: (sessionId) => `cs:${sessionId}`,
  event: (eventId) => `evt:${eventId}`,
};
