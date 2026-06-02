/**
 * Cloudflare Worker — ThaiLLM API Proxy + Admin Key Management + Usage Monitoring
 *
 * KV bindings: env.ADMIN_CONFIG (Workers KV namespace)
 * KV keys:
 *   thaillm_admin_key — admin ThaiLLM API key
 *   usage:YYYY-MM-DD  — { success, error } counter ต่อวัน (TTL 7 วัน)
 *   recent_errors     — JSON array ของ error ล่าสุด 10 ตัว
 */

const THAILLM_BASE = 'https://thaillm.or.th';
const KV_KEY_NAME = 'thaillm_admin_key';
const USAGE_KEY_PREFIX = 'usage:';
const ERRORS_KEY = 'recent_errors';
const MAX_ERRORS = 10;
const DEFAULT_ADMIN_PASSWORD = 'a1d9GH10%';

const ALLOWED_ORIGINS = [
  'https://plan.kruarm.net',
  'https://ai-lesson-plannerv3.onrender.com',
  'https://ai-lesson-plannerv3-full.onrender.com',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
];

// ── Training mode (URL ?class=ABC123) ─────────────────────────
const TRAINING_KEY_PREFIX = 'training:class:';
const TRAINING_LIST_KEY = 'training:list';

// ── ThaiLLM Admin Pool (load balance pool ของ admin keys) ────
const POOL_KEYS_KV = 'admin:thaillm:pool:keys';     // JSON array of keys
const POOL_USAGE_PREFIX = 'admin:thaillm:pool:usage:'; // + YYYY-MM-DD → { keyIdx: { success, error } }
const POOL_NEAR_LIMIT = 800; // calls/วัน — เกินนี้ถือว่าใกล้หมด

function generateClassCode() {
  // 6-char uppercase alphanumeric (e.g. "AB12CD")
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Hash key เพื่อแสดง preview แบบไม่เปิดเผยเต็ม
function previewKey(key) {
  if (!key || key.length < 8) return '***';
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

// Pick key ที่ใช้น้อยที่สุดวันนี้ (least-used selection)
async function pickPoolKey(env) {
  const keys = await env.ADMIN_CONFIG.get(POOL_KEYS_KV, 'json');
  if (!keys || !Array.isArray(keys) || keys.length === 0) return null;
  const today = todayISO();
  const usage = (await env.ADMIN_CONFIG.get(POOL_USAGE_PREFIX + today, 'json')) || {};
  // หา key ที่ usage.success น้อยที่สุด (skip keys ที่เกิน threshold)
  let bestIdx = -1;
  let bestUsage = Infinity;
  for (let i = 0; i < keys.length; i++) {
    const u = usage[i]?.success || 0;
    if (u >= POOL_NEAR_LIMIT) continue;
    if (u < bestUsage) {
      bestUsage = u;
      bestIdx = i;
    }
  }
  // ถ้าทุก key เกิน threshold → ใช้ key ที่น้อยที่สุดอยู่ดี (round-robin)
  if (bestIdx === -1) {
    for (let i = 0; i < keys.length; i++) {
      const u = usage[i]?.success || 0;
      if (u < bestUsage) {
        bestUsage = u;
        bestIdx = i;
      }
    }
  }
  return { key: keys[bestIdx], idx: bestIdx, usageToday: bestUsage };
}

// Track pool usage (non-blocking)
async function recordPoolUsage(env, keyIdx, type) {
  if (!env.ADMIN_CONFIG) return;
  try {
    const today = todayISO();
    const k = POOL_USAGE_PREFIX + today;
    const data = (await env.ADMIN_CONFIG.get(k, 'json')) || {};
    if (!data[keyIdx]) data[keyIdx] = { success: 0, error: 0 };
    data[keyIdx][type] = (data[keyIdx][type] || 0) + 1;
    await env.ADMIN_CONFIG.put(k, JSON.stringify(data), {
      expirationTtl: 60 * 60 * 24 * 7, // 7 วัน
    });
  } catch {}
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Admin-Password',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function getAdminPassword(env) {
  return env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
}

async function checkAdminPassword(request, env) {
  const pwd = request.headers.get('X-Admin-Password') || '';
  return pwd === getAdminPassword(env);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Stats helpers ─────────────────────────────────────────────
async function recordUsage(env, type) {
  // type: 'success' | 'error' — fail silently ถ้า KV quota เกิน
  if (!env.ADMIN_CONFIG) return;
  try {
    const key = `${USAGE_KEY_PREFIX}${todayISO()}`;
    const data = (await env.ADMIN_CONFIG.get(key, { type: 'json' })) || { success: 0, error: 0 };
    data[type] = (data[type] || 0) + 1;
    await env.ADMIN_CONFIG.put(key, JSON.stringify(data), {
      expirationTtl: 60 * 60 * 24 * 7, // 7 วัน
    });
  } catch {}
}

async function recordError(env, status, message) {
  if (!env.ADMIN_CONFIG) return;
  try {
    const errors = (await env.ADMIN_CONFIG.get(ERRORS_KEY, { type: 'json' })) || [];
    errors.unshift({
      ts: new Date().toISOString(),
      status,
      message: (message || '').slice(0, 200),
    });
    while (errors.length > MAX_ERRORS) errors.pop();
    await env.ADMIN_CONFIG.put(ERRORS_KEY, JSON.stringify(errors));
  } catch {}
}

async function getUsageStats(env) {
  if (!env.ADMIN_CONFIG) return null;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const data = (await env.ADMIN_CONFIG.get(`${USAGE_KEY_PREFIX}${d}`, { type: 'json' })) || { success: 0, error: 0 };
    days.push({ date: d, success: data.success || 0, error: data.error || 0 });
  }
  const recent_errors = (await env.ADMIN_CONFIG.get(ERRORS_KEY, { type: 'json' })) || [];
  return { days, recent_errors };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      const hasKV = !!env.ADMIN_CONFIG;
      const hasAdminKey = hasKV ? !!(await env.ADMIN_CONFIG.get(KV_KEY_NAME)) : false;
      return jsonResponse({
        status: 'ok',
        service: 'thaillm-proxy',
        upstream: THAILLM_BASE,
        kv_bound: hasKV,
        admin_key_set: hasAdminKey,
        allowed_origins: ALLOWED_ORIGINS,
      }, 200, origin);
    }

    // ════════════════════════════════════════════════════════════
    // TRAINING MODE ENDPOINTS
    // ════════════════════════════════════════════════════════════

    // GET /training/:code — public, return class config (trainee poll)
    const trainingMatch = url.pathname.match(/^\/training\/([A-Z0-9]{6})$/);
    if (trainingMatch && request.method === 'GET') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      const code = trainingMatch[1];
      const data = await env.ADMIN_CONFIG.get(`${TRAINING_KEY_PREFIX}${code}`, 'json');
      if (!data) return jsonResponse({ error: 'Class not found', code }, 404, origin);
      if (data.expiresAt && data.expiresAt < Date.now()) {
        return jsonResponse({ error: 'Class ended', code, expiresAt: data.expiresAt }, 410, origin);
      }
      return jsonResponse({ code, ...data }, 200, origin);
    }

    // POST /admin/training/create — admin create new class
    if (url.pathname === '/admin/training/create' && request.method === 'POST') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      if (!(await checkAdminPassword(request, env))) return jsonResponse({ error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' }, 401, origin);
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400, origin); }
      const code = generateClassCode();
      const classData = {
        name: (body.name || 'Untitled Class').slice(0, 100),
        modules: Array.isArray(body.modules) ? body.modules : [],  // array of moduleName ที่ enabled
        allowLeave: body.allowLeave === true,  // default false = ห้าม trainee กดออก
        createdAt: Date.now(),
        expiresAt: body.expiresAt || (Date.now() + 24 * 3600 * 1000), // default 24h
      };
      await env.ADMIN_CONFIG.put(`${TRAINING_KEY_PREFIX}${code}`, JSON.stringify(classData));
      // Update list
      const list = (await env.ADMIN_CONFIG.get(TRAINING_LIST_KEY, 'json')) || [];
      if (!list.includes(code)) {
        list.push(code);
        await env.ADMIN_CONFIG.put(TRAINING_LIST_KEY, JSON.stringify(list));
      }
      return jsonResponse({ code, ...classData }, 201, origin);
    }

    // POST /admin/training/update/:code — admin update modules
    const updateMatch = url.pathname.match(/^\/admin\/training\/update\/([A-Z0-9]{6})$/);
    if (updateMatch && request.method === 'POST') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      if (!(await checkAdminPassword(request, env))) return jsonResponse({ error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' }, 401, origin);
      const code = updateMatch[1];
      const existing = await env.ADMIN_CONFIG.get(`${TRAINING_KEY_PREFIX}${code}`, 'json');
      if (!existing) return jsonResponse({ error: 'Class not found' }, 404, origin);
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400, origin); }
      const updated = {
        ...existing,
        ...(body.name !== undefined && { name: String(body.name).slice(0, 100) }),
        ...(Array.isArray(body.modules) && { modules: body.modules }),
        ...(body.allowLeave !== undefined && { allowLeave: body.allowLeave === true }),
        ...(body.expiresAt && { expiresAt: body.expiresAt }),
        updatedAt: Date.now(),
      };
      await env.ADMIN_CONFIG.put(`${TRAINING_KEY_PREFIX}${code}`, JSON.stringify(updated));
      return jsonResponse({ code, ...updated }, 200, origin);
    }

    // DELETE /admin/training/delete/:code
    const deleteMatch = url.pathname.match(/^\/admin\/training\/delete\/([A-Z0-9]{6})$/);
    if (deleteMatch && (request.method === 'DELETE' || request.method === 'POST')) {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      if (!(await checkAdminPassword(request, env))) return jsonResponse({ error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' }, 401, origin);
      const code = deleteMatch[1];
      await env.ADMIN_CONFIG.delete(`${TRAINING_KEY_PREFIX}${code}`);
      const list = (await env.ADMIN_CONFIG.get(TRAINING_LIST_KEY, 'json')) || [];
      const newList = list.filter((c) => c !== code);
      await env.ADMIN_CONFIG.put(TRAINING_LIST_KEY, JSON.stringify(newList));
      return jsonResponse({ ok: true, deleted: code }, 200, origin);
    }

    // GET /admin/training/list — admin list all classes (with detail)
    if (url.pathname === '/admin/training/list' && request.method === 'GET') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      if (!(await checkAdminPassword(request, env))) return jsonResponse({ error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' }, 401, origin);
      const list = (await env.ADMIN_CONFIG.get(TRAINING_LIST_KEY, 'json')) || [];
      const classes = [];
      for (const code of list) {
        const data = await env.ADMIN_CONFIG.get(`${TRAINING_KEY_PREFIX}${code}`, 'json');
        if (data) {
          const expired = data.expiresAt && data.expiresAt < Date.now();
          classes.push({ code, ...data, expired });
        }
      }
      return jsonResponse({ classes }, 200, origin);
    }

    // ── Admin endpoints ─────────────────────────────────────
    if (url.pathname === '/admin/status') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      const key = await env.ADMIN_CONFIG.get(KV_KEY_NAME);
      return jsonResponse({
        has_admin_key: !!key,
        key_preview: key ? `${key.slice(0, 4)}***${key.slice(-4)}` : null,
      }, 200, origin);
    }

    if (url.pathname === '/admin/usage' && request.method === 'GET') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      const stats = await getUsageStats(env);
      return jsonResponse(stats || {}, 200, origin);
    }

    if (url.pathname === '/admin/set-key' && request.method === 'POST') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      if (!(await checkAdminPassword(request, env))) return jsonResponse({ error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' }, 401, origin);
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400, origin); }
      const newKey = (body.key || '').trim();
      if (!newKey) return jsonResponse({ error: 'key required' }, 400, origin);
      await env.ADMIN_CONFIG.put(KV_KEY_NAME, newKey);
      return jsonResponse({ ok: true, message: 'บันทึก admin key เรียบร้อย', key_preview: `${newKey.slice(0, 4)}***${newKey.slice(-4)}` }, 200, origin);
    }

    if (url.pathname === '/admin/clear-key' && request.method === 'POST') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      if (!(await checkAdminPassword(request, env))) return jsonResponse({ error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' }, 401, origin);
      await env.ADMIN_CONFIG.delete(KV_KEY_NAME);
      return jsonResponse({ ok: true, message: 'ลบ admin key แล้ว' }, 200, origin);
    }

    if (url.pathname === '/admin/clear-stats' && request.method === 'POST') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      if (!(await checkAdminPassword(request, env))) return jsonResponse({ error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' }, 401, origin);
      await env.ADMIN_CONFIG.delete(ERRORS_KEY);
      // ลบ counter ของ 7 วันล่าสุด
      for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        await env.ADMIN_CONFIG.delete(`${USAGE_KEY_PREFIX}${d}`);
      }
      return jsonResponse({ ok: true, message: 'ล้างสถิติแล้ว' }, 200, origin);
    }

    // ════════════════════════════════════════════════════════
    // THAILLM POOL — Admin management endpoints
    // ════════════════════════════════════════════════════════

    // POST /admin/thaillm-pool/upsert — set keys (admin password)
    if (url.pathname === '/admin/thaillm-pool/upsert' && request.method === 'POST') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      if (!(await checkAdminPassword(request, env))) return jsonResponse({ error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' }, 401, origin);
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400, origin); }
      const keys = Array.isArray(body.keys) ? body.keys.map((k) => String(k).trim()).filter(Boolean) : [];
      if (keys.length === 0) return jsonResponse({ error: 'ต้องใส่อย่างน้อย 1 key' }, 400, origin);
      if (keys.length > 50) return jsonResponse({ error: 'pool size สูงสุด 50 keys' }, 400, origin);
      await env.ADMIN_CONFIG.put(POOL_KEYS_KV, JSON.stringify(keys));
      return jsonResponse({
        ok: true,
        message: `บันทึก ${keys.length} keys แล้ว`,
        pool_size: keys.length,
        keys_preview: keys.map(previewKey),
      }, 200, origin);
    }

    // GET /admin/thaillm-pool/status — see pool + usage today (admin password)
    if (url.pathname === '/admin/thaillm-pool/status' && request.method === 'GET') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      if (!(await checkAdminPassword(request, env))) return jsonResponse({ error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' }, 401, origin);
      const keys = (await env.ADMIN_CONFIG.get(POOL_KEYS_KV, 'json')) || [];
      const today = todayISO();
      const usage = (await env.ADMIN_CONFIG.get(POOL_USAGE_PREFIX + today, 'json')) || {};
      const keysStatus = keys.map((k, i) => ({
        idx: i,
        preview: previewKey(k),
        success: usage[i]?.success || 0,
        error: usage[i]?.error || 0,
      }));
      const totalToday = keysStatus.reduce((acc, k) => acc + k.success + k.error, 0);
      return jsonResponse({
        pool_size: keys.length,
        keys: keysStatus,
        total_today: totalToday,
        near_limit_threshold: POOL_NEAR_LIMIT,
      }, 200, origin);
    }

    // POST /admin/thaillm-pool/clear — ลบ pool ทั้งหมด (admin password)
    if (url.pathname === '/admin/thaillm-pool/clear' && request.method === 'POST') {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);
      if (!(await checkAdminPassword(request, env))) return jsonResponse({ error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' }, 401, origin);
      await env.ADMIN_CONFIG.delete(POOL_KEYS_KV);
      return jsonResponse({ ok: true, message: 'ลบ pool keys ทั้งหมดแล้ว' }, 200, origin);
    }

    // ── Admin proxy — ใช้ pool ก่อน (rotate keys) — fallback: legacy single key ──
    if (url.pathname.startsWith('/admin/api/')) {
      if (!env.ADMIN_CONFIG) return jsonResponse({ error: 'KV namespace ไม่ได้ผูก' }, 503, origin);

      // 🆕 ลองใช้ pool ก่อน (10 keys rotate)
      const picked = await pickPoolKey(env);
      let adminKey;
      let keyIdx = -1;
      let usingPool = false;
      if (picked) {
        adminKey = picked.key;
        keyIdx = picked.idx;
        usingPool = true;
      } else {
        // Fallback: legacy single admin key
        adminKey = await env.ADMIN_CONFIG.get(KV_KEY_NAME);
        if (!adminKey) return jsonResponse({ error: { message: 'Admin pool และ admin key ยังไม่ได้ตั้งค่า' } }, 503, origin);
      }

      const upstreamPath = url.pathname.replace(/^\/admin/, '');
      const upstreamUrl = `${THAILLM_BASE}${upstreamPath}${url.search}`;

      const fwdHeaders = new Headers();
      for (const [k, v] of request.headers.entries()) {
        const lk = k.toLowerCase();
        if (['host', 'connection', 'cf-connecting-ip', 'cf-ray', 'cf-visitor',
             'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip',
             'authorization', 'apikey'].includes(lk)) continue;
        fwdHeaders.set(k, v);
      }
      fwdHeaders.set('Authorization', `Bearer ${adminKey}`);
      if (!fwdHeaders.has('Content-Type')) fwdHeaders.set('Content-Type', 'application/json');

      let upstreamResp;
      try {
        upstreamResp = await fetch(upstreamUrl, {
          method: request.method,
          headers: fwdHeaders,
          body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
        });
      } catch (err) {
        // network error
        ctx.waitUntil(recordError(env, 0, `network: ${err.message}`));
        ctx.waitUntil(recordUsage(env, 'error'));
        if (usingPool) ctx.waitUntil(recordPoolUsage(env, keyIdx, 'error'));
        return jsonResponse({ error: { message: `Admin proxy error: ${err.message}` } }, 502, origin);
      }

      // ── 📊 Record stats (non-blocking) ───────────────────
      if (upstreamResp.ok) {
        ctx.waitUntil(recordUsage(env, 'success'));
        if (usingPool) ctx.waitUntil(recordPoolUsage(env, keyIdx, 'success'));
      } else {
        const errText = await upstreamResp.clone().text();
        let errMsg = errText.slice(0, 200);
        try {
          const j = JSON.parse(errText);
          errMsg = (j?.error?.message || j?.message || errText).slice(0, 200);
        } catch {}
        ctx.waitUntil(recordError(env, upstreamResp.status, errMsg));
        ctx.waitUntil(recordUsage(env, 'error'));
        if (usingPool) ctx.waitUntil(recordPoolUsage(env, keyIdx, 'error'));
      }

      const respHeaders = new Headers(upstreamResp.headers);
      for (const [k, v] of Object.entries(corsHeaders(origin))) respHeaders.set(k, v);
      // เพิ่ม custom header เพื่อให้ frontend รู้ว่าใช้ key idx ไหน (debug)
      if (usingPool) respHeaders.set('X-Pool-Key-Idx', String(keyIdx));
      return new Response(upstreamResp.body, { status: upstreamResp.status, statusText: upstreamResp.statusText, headers: respHeaders });
    }

    // ── User proxy (forward ด้วย key ของ user) ───────────────
    const upstreamUrl = `${THAILLM_BASE}${url.pathname}${url.search}`;
    const fwdHeaders = new Headers();
    for (const [k, v] of request.headers.entries()) {
      if (['host', 'connection', 'cf-connecting-ip', 'cf-ray', 'cf-visitor',
           'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip'].includes(k.toLowerCase())) continue;
      fwdHeaders.set(k, v);
    }

    let upstreamResp;
    try {
      upstreamResp = await fetch(upstreamUrl, {
        method: request.method,
        headers: fwdHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      });
    } catch (err) {
      return jsonResponse({ error: { message: `Proxy upstream error: ${err.message}` } }, 502, origin);
    }

    const respHeaders = new Headers(upstreamResp.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) respHeaders.set(k, v);
    return new Response(upstreamResp.body, { status: upstreamResp.status, statusText: upstreamResp.statusText, headers: respHeaders });
  },
};
