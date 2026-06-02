// Shared proxy logic — imported by api/v1/chat/completions.js + api/v1/models.js
// (Vercel Edge functions ต้องการไฟล์ตรงเส้นทาง — catch-all [...path].js ไม่ทำงาน)

const THAILLM_BASE = 'https://thaillm.or.th';

const ALLOWED_ORIGINS = [
  'https://ai-lesson-plannerv3.onrender.com',
  'https://ai-lesson-plannerv3-full.onrender.com',
  'https://plan.kruarm.net',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
];

export function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Proxy request → thaillm.or.th
 * @param {Request} request — incoming request
 * @param {string} upstreamPath — full path to forward, e.g. '/api/v1/chat/completions'
 */
export async function proxyTo(request, upstreamPath) {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);

  // Preflight OPTIONS
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const upstreamUrl = `${THAILLM_BASE}${upstreamPath}${url.search}`;

  // Forward headers — preserve Authorization, drop Vercel/CF internal
  const fwdHeaders = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const lk = k.toLowerCase();
    if ([
      'host', 'connection', 'cf-connecting-ip', 'cf-ray', 'cf-visitor',
      'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'x-vercel-id',
      'x-vercel-deployment-url', 'forwarded',
    ].includes(lk)) continue;
    fwdHeaders.set(k, v);
  }

  let upstreamResp;
  try {
    upstreamResp = await fetch(upstreamUrl, {
      method: request.method,
      headers: fwdHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? null : await request.arrayBuffer(),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: `Proxy upstream error: ${err.message}` } }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }

  const respHeaders = new Headers();
  for (const [k, v] of upstreamResp.headers.entries()) {
    respHeaders.set(k, v);
  }
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    respHeaders.set(k, v);
  }

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: respHeaders,
  });
}
