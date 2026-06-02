// Shared proxy helper for Cloudflare Pages Functions

const THAILLM_BASE = 'https://thaillm.or.th';

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

export { ALLOWED_ORIGINS };

/**
 * Proxy request → thaillm.or.th
 * @param {Request} request
 * @param {string} upstreamPath — เส้นทางจริงของ ThaiLLM API
 */
export async function proxyTo(request, upstreamPath) {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);

  // Preflight OPTIONS
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const upstreamUrl = `${THAILLM_BASE}${upstreamPath}${url.search}`;

  // Forward headers — drop CF internals
  const fwdHeaders = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const lk = k.toLowerCase();
    if ([
      'host', 'connection', 'cf-connecting-ip', 'cf-ray', 'cf-visitor',
      'cf-ipcountry', 'cf-worker', 'cf-ew-via',
      'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip',
      'forwarded',
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
