// /api/v1/models → forward to thaillm.or.th/api/v1/models
import { proxyTo } from '../_proxy.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  return proxyTo(request, '/api/v1/models');
}
