

/* 存储适配层：claude.ai Artifact 环境使用 window.storage；独立部署回落到 IndexedDB。
   注意：独立部署下 shared 数据仅存本机（无多人同步后端），见 README。 */
const hasArtifact = () => typeof window !== "undefined" && !!window.storage;
let idbPromise = null;
function openIdb() {
  if (!idbPromise) idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open("phr-db", 1);
    req.onupgradeneeded = () => { const db = req.result; db.createObjectStore("local"); db.createObjectStore("shared"); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}
function idbOp(store, mode, fn) {
  return openIdb().then((db) => new Promise((resolve, reject) => {
    const r = fn(db.transaction(store, mode).objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
const idbBackend = {
  async get(key, shared) {
    const v = await idbOp(shared ? "shared" : "local", "readonly", (os) => os.get(key));
    if (v === undefined) throw new Error("key not found: " + key);
    return { key, value: v, shared: !!shared };
  },
  async set(key, value, shared) { await idbOp(shared ? "shared" : "local", "readwrite", (os) => os.put(value, key)); return { key, value, shared: !!shared }; },
  async delete(key, shared) { await idbOp(shared ? "shared" : "local", "readwrite", (os) => os.delete(key)); return { key, deleted: true, shared: !!shared }; },
  async list(prefix, shared) {
    const keys = await idbOp(shared ? "shared" : "local", "readonly", (os) => os.getAllKeys());
    return { keys: keys.map(String).filter((k) => k.startsWith(prefix || "")), prefix, shared: !!shared };
  },
};
const backend = () => (hasArtifact() ? window.storage : idbBackend);
const storageCapabilities = { get sharedIsGlobal() { return hasArtifact(); } };
async function probeStorage() { try { await backend().list("rec:"); return true; } catch { return false; } }
async function storSetRaw(key, value, shared) { try { return !!(await backend().set(key, value, shared)); } catch { return false; } }
async function storDelete(key, shared) { try { await backend().delete(key, shared); return true; } catch { return false; } }

/* ---------- 本地持久化 ---------- */
async function storGetJson(key) {
  try { const r = await backend().get(key); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function storSetJson(key, obj) {
  try { return !!(await backend().set(key, JSON.stringify(obj))); }
  catch { return false; }
}
async function loadAllRecords() {
  try {
    const res = await backend().list("rec:");
    const keys = (res?.keys || []).map((k) => (typeof k === "string" ? k : k?.key)).filter(Boolean);
    const out = [];
    for (const k of keys) { const r = await storGetJson(k); if (r?.recordId) out.push(r); }
    out.sort((a, b) => (b.eventStart || "").localeCompare(a.eventStart || ""));
    return out;
  } catch { return []; }
}


async function storSetJsonShared(key, obj) {
  try { return !!(await backend().set(key, JSON.stringify(obj), true)); }
  catch { return false; }
}

async function getAnonId() {
  try { const r = await backend().get("anonid"); if (r?.value) return r.value; } catch {}
  const id = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
  try { await backend().set("anonid", id); } catch {}
  return id;
}

async function loadKb() {
  try {
    const res = await backend().list("kb:", true);
    const keys = (res?.keys || []).map((k) => (typeof k === "string" ? k : k?.key)).filter(Boolean);
    const items = [];
    for (const k of keys) {
      try { const r = await backend().get(k, true); const o = JSON.parse(r.value); if (o?.id && o?.title) items.push(o); } catch {}
    }
    const votes = {}, flags = {};
    try {
      const v = await backend().list("kbv:", true);
      for (const k of (v?.keys || []).map((x) => (typeof x === "string" ? x : x?.key)).filter(Boolean)) {
        const id = k.split(":")[1]; if (id) votes[id] = (votes[id] || 0) + 1;
      }
    } catch {}
    try {
      const f = await backend().list("kbf:", true);
      for (const k of (f?.keys || []).map((x) => (typeof x === "string" ? x : x?.key)).filter(Boolean)) {
        const id = k.split(":")[1]; if (id) flags[id] = (flags[id] || 0) + 1;
      }
    } catch {}
    items.forEach((i) => { i.helpful = votes[i.id] || 0; i.flagCount = flags[i.id] || 0; });
    return items.filter((i) => i.flagCount < 3)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  } catch { return []; }
}

export { storageCapabilities, probeStorage, storSetRaw, storDelete, storGetJson, storSetJson, loadAllRecords, storSetJsonShared, getAnonId, loadKb };
