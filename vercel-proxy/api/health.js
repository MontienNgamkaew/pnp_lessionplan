/**
 * Health check endpoint
 * GET /api/health → { status: "ok", ... }
 */
export const config = { runtime: 'edge' };

const ALLOWED_ORIGINS = [
  'https://ai-lesson-plannerv3.onrender.com',
  'https://ai-lesson-plannerv3-full.onrender.com',
  'https://plan.kruarm.net',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:5176',
];

export default function handler(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'thaillm-proxy (Vercel Edge)',
      upstream: 'https://thaillm.or.th',
      allowed_origins: ALLOWED_ORIGINS,
    }, null, 2),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowed,
      },
    }
  );
}
