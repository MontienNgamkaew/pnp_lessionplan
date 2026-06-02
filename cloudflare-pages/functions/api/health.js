// GET /api/health → status check
import { corsHeaders, ALLOWED_ORIGINS } from '../_proxy.js';

export async function onRequest({ request }) {
  const origin = request.headers.get('Origin') || '';
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'thaillm-proxy (Cloudflare Pages)',
      upstream: 'https://thaillm.or.th',
      allowed_origins: ALLOWED_ORIGINS,
    }, null, 2),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    }
  );
}
