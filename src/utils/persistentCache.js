/**
 * Persistent AI Response Cache — localStorage-backed, TTL 24 ชม.
 *
 * ทำไม persist ใน localStorage:
 *   - User กดสร้างซ้ำ (regenerate / refresh) → ใช้ผลเดิม ไม่ยิง API
 *   - ปกติ user generate รหัสวิชาเดิม + module เดิม → ผลควรเหมือนกัน
 *   - ประหยัด API quota มหาศาล (~70-90% ของ accidental re-clicks)
 *
 * คุณภาพไม่ลด:
 *   - TTL 24 ชม. — ถ้า user อยากผลใหม่ → รอ 1 วัน หรือกด "regenerate"
 *   - Schema version — ถ้า prompt/schema เปลี่ยน → bump version → invalidate ทั้งหมด
 *   - Cache key รวม: providerId + systemPrompt + contents → ถ้า input ต่างนิดหน่อย → cache miss
 *   - Manual clear button + per-call skipCache: true
 *
 * Storage limit:
 *   - localStorage ~5-10 MB total
 *   - 1 entry ประมาณ 5-20 KB
 *   - cap ที่ 50 entries (LRU eviction)
 *   - ถ้า quota exceeded → clear oldest 25 entries
 */

const STORAGE_KEY = 'ai_response_cache_v2';
const TTL_MS = 24 * 60 * 60 * 1000;  // 24 ชม.
const MAX_ENTRIES = 50;

// 🔖 Schema version — เปลี่ยนเมื่อ prompt/schema เปลี่ยน → invalidate cache เดิม
const CACHE_VERSION = '2026-05-22-v1';

// ── Stats (in-memory — สำหรับ session ปัจจุบัน) ─────────────
const _stats = {
  hits: 0,
  misses: 0,
  writes: 0,
  startedAt: Date.now(),
};

// ── Hashing ────────────────────────────────────────────────
const hashKey = (text) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
};

export const buildCacheKey = (providerId, systemPrompt, contents) => {
  const summary = JSON.stringify({
    v: CACHE_VERSION,
    p: providerId,
    s: systemPrompt || '',
    c: contents.map((c) => ({
      t: c.type,
      d: c.type === 'text' ? c.data : String(c.data || '').slice(0, 200),
    })),
  });
  return `${providerId}:${hashKey(summary)}:${summary.length}`;
};

// ── Load/Save with quota handling ──────────────────────────
function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    // Invalidate ถ้า version ไม่ตรง
    if (data._version !== CACHE_VERSION) {
      console.log(`[Cache] schema version changed (${data._version} → ${CACHE_VERSION}) — clearing all`);
      saveAll({ _version: CACHE_VERSION, entries: {} });
      return { _version: CACHE_VERSION, entries: {} };
    }
    return data;
  } catch {
    return { _version: CACHE_VERSION, entries: {} };
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // Quota exceeded → clear half entries (LRU-ish) + retry
    if (e.name === 'QuotaExceededError') {
      console.warn('[Cache] localStorage quota exceeded — clearing oldest 50%');
      const entries = Object.entries(data.entries || {});
      entries.sort((a, b) => (a[1].savedAt || 0) - (b[1].savedAt || 0));
      const kept = entries.slice(entries.length / 2).reduce((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, {});
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ _version: CACHE_VERSION, entries: kept }));
      } catch {
        // ยังเกินอีก → ลบทั้งหมด
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }
}

// ── Auto-cleanup expired entries on app start ───────────────
function evictExpired(data) {
  const now = Date.now();
  const entries = data.entries || {};
  const keys = Object.keys(entries);
  let removed = 0;
  for (const k of keys) {
    if ((entries[k].expiresAt || 0) < now) {
      delete entries[k];
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[Cache] evicted ${removed} expired entries`);
    saveAll(data);
  }
  return data;
}

// LRU eviction ถ้าเกิน MAX_ENTRIES
function enforceLimit(data) {
  const entries = Object.entries(data.entries || {});
  if (entries.length <= MAX_ENTRIES) return data;
  // เรียงจาก savedAt เก่า → ใหม่, ลบเก่า
  entries.sort((a, b) => (a[1].savedAt || 0) - (b[1].savedAt || 0));
  const removeCount = entries.length - MAX_ENTRIES;
  for (let i = 0; i < removeCount; i++) {
    delete data.entries[entries[i][0]];
  }
  console.log(`[Cache] LRU evicted ${removeCount} oldest entries (over ${MAX_ENTRIES} limit)`);
  return data;
}

// ── Public API ─────────────────────────────────────────────

/**
 * ดู cached value — return undefined ถ้าไม่มี/หมดอายุ
 */
export function getCached(cacheKey) {
  const data = loadAll();
  const entry = data.entries?.[cacheKey];
  if (!entry) {
    _stats.misses++;
    return undefined;
  }
  if ((entry.expiresAt || 0) < Date.now()) {
    _stats.misses++;
    return undefined;
  }
  _stats.hits++;
  // Touch — update LRU timestamp (savedAt) เพื่อกัน eviction ของที่ใช้บ่อย
  entry.lastAccess = Date.now();
  try { saveAll(data); } catch {}
  return entry.value;
}

/**
 * บันทึก value ใน cache
 */
export function setCached(cacheKey, value) {
  let data = loadAll();
  if (!data.entries) data.entries = {};
  const now = Date.now();
  data.entries[cacheKey] = {
    value,
    savedAt: now,
    expiresAt: now + TTL_MS,
    lastAccess: now,
  };
  data = enforceLimit(data);
  saveAll(data);
  _stats.writes++;
}

/**
 * ลบ cache ทั้งหมด
 */
export function clearCache() {
  try { localStorage.removeItem(STORAGE_KEY); }
  catch {}
  _stats.hits = 0;
  _stats.misses = 0;
  _stats.writes = 0;
  _stats.startedAt = Date.now();
  console.log('[Cache] cleared all entries');
}

/**
 * ดูสถิติ
 */
export function getCacheStats() {
  const data = loadAll();
  const entries = Object.values(data.entries || {});
  const totalEntries = entries.length;
  const totalSize = JSON.stringify(data).length;

  // นับจำนวน entry ที่ยังไม่หมดอายุ
  const now = Date.now();
  const active = entries.filter((e) => (e.expiresAt || 0) >= now).length;

  return {
    hits: _stats.hits,
    misses: _stats.misses,
    writes: _stats.writes,
    totalEntries,
    activeEntries: active,
    sizeBytes: totalSize,
    sizeKB: Math.round(totalSize / 1024),
    sessionSavedCalls: _stats.hits,
    ttlHours: TTL_MS / (60 * 60 * 1000),
    maxEntries: MAX_ENTRIES,
    version: CACHE_VERSION,
  };
}

// ── Init: auto-cleanup expired on load ───────────────────
try {
  const data = loadAll();
  evictExpired(data);
} catch {}
