// /api/v1/chat-completions → forward to thaillm.or.th/api/v1/chat/completions
// (Vercel rewrite /api/v1/chat/completions → /api/v1/chat-completions ใน vercel.json)
import { proxyTo } from '../_proxy.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  return proxyTo(request, '/api/v1/chat/completions');
}
