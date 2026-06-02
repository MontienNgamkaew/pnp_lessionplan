// /api/v1/chat-completions → forward to thaillm.or.th/api/v1/chat/completions
// (ใช้ flat path ในเส้น CF Pages — แม้ CF Pages จะรองรับ nested ลึก
//  แต่ใช้ flat ให้ตรงกับ frontend ThaiLLMProvider ที่ตั้งไว้)
import { proxyTo } from '../../_proxy.js';

export async function onRequest({ request }) {
  return proxyTo(request, '/api/v1/chat/completions');
}
