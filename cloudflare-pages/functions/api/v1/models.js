// GET /api/v1/models → forward to thaillm.or.th/api/v1/models
import { proxyTo } from '../../_proxy.js';

export async function onRequest({ request }) {
  return proxyTo(request, '/api/v1/models');
}
