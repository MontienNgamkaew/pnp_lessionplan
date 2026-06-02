/**
 * loadBalancer — Smart Auto-Switch Provider เพื่อไม่ติด quota limit
 *
 * Strategy:
 *   1. ใช้ primary provider ปกติ (เพื่อ quality consistent)
 *   2. ถ้า primary "ใกล้หมด quota" (success calls วันนี้ >= threshold)
 *      → switch ไป fallback ที่:
 *         a) มี key
 *         b) context พอกับ module
 *         c) ใช้น้อยที่สุด (least used today)
 *   3. ถ้าทุก fallback ก็ใกล้หมด — ใช้ primary ต่อ (จะติด 429 ก็ค่อย fallback ระดับ useAiApi)
 *
 * Mode:
 *   'off'   — ใช้ primary เสมอ (default — เหมือนเดิม)
 *   'smart' — Smart Auto-Switch (เปิดโดย user)
 */

import { getUsageToday } from './usageCounter';
import { isProviderCompatible } from '../constants/providerCapabilities';
import { getRequiredTotalContext } from '../constants/moduleProfiles';

const STORAGE_PREFIX = 'ai_apikey_';
const MODE_KEY = 'ai_load_balance_mode';

// Threshold: success calls/วัน ของ provider ที่ถือว่า "ใกล้หมด"
// Gemini free tier 1500/วัน — threshold 800 = เหลือ buffer ~700 calls
// ค่ากลางที่ใช้ได้กับ provider ส่วนใหญ่
const NEAR_LIMIT_THRESHOLD = 800;

// Fallback chain เดียวกับ useAiApi
const FALLBACK_CHAIN = {
  gemini: ['thaillm', 'openrouter', 'openai', 'claude', 'deepseek'],
  openrouter: ['thaillm', 'gemini', 'openai', 'claude', 'deepseek'],
  openai: ['thaillm', 'openrouter', 'gemini', 'claude', 'deepseek'],
  claude: ['thaillm', 'openrouter', 'gemini', 'openai', 'deepseek'],
  deepseek: ['thaillm', 'openrouter', 'gemini', 'openai', 'claude'],
  thaillm: ['openrouter', 'gemini', 'openai', 'claude', 'deepseek'],
};

export function getLoadBalanceMode() {
  try {
    return localStorage.getItem(MODE_KEY) || 'off';
  } catch {
    return 'off';
  }
}

export function setLoadBalanceMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {}
}

function hasKey(providerId) {
  if (providerId === 'thaillm-admin') return true;
  try {
    return !!localStorage.getItem(STORAGE_PREFIX + providerId);
  } catch {
    return false;
  }
}

/**
 * Pick best provider ตาม Smart Auto-Switch logic
 *
 * @param {string} primaryProviderId — user's primary choice
 * @param {string} moduleName — optional (จาก callApi)
 * @returns {{ providerId, reason }} — provider ที่จะใช้ + เหตุผล
 */
export function pickProviderSmart(primaryProviderId, moduleName = '') {
  const mode = getLoadBalanceMode();

  // Off → ใช้ primary เสมอ
  if (mode === 'off') {
    return { providerId: primaryProviderId, reason: 'mode-off' };
  }

  // Smart mode: เช็คว่า primary ใกล้หมดไหม
  const primaryUsage = getUsageToday(primaryProviderId).success;

  if (primaryUsage < NEAR_LIMIT_THRESHOLD) {
    return { providerId: primaryProviderId, reason: 'primary-ok' };
  }

  // Primary ใกล้หมด → หา fallback
  const required = moduleName ? getRequiredTotalContext(moduleName) : 0;
  const fallbacks = FALLBACK_CHAIN[primaryProviderId] || [];
  const eligible = [];

  for (const fbId of fallbacks) {
    if (!hasKey(fbId)) continue;
    if (required > 0 && !isProviderCompatible(fbId, required)) continue;
    const fbUsage = getUsageToday(fbId).success;
    eligible.push({ id: fbId, usage: fbUsage });
  }

  if (eligible.length === 0) {
    // ไม่มี fallback เลย → ใช้ primary ต่อ (แม้จะใกล้หมด)
    return { providerId: primaryProviderId, reason: 'no-fallback' };
  }

  // Sort ascending by usage → เลือกตัวที่ใช้น้อยที่สุด
  eligible.sort((a, b) => a.usage - b.usage);
  const best = eligible[0];

  // ถ้า fallback ที่ดีที่สุดก็เกิน threshold แล้ว → ใช้ primary ต่อ (ไม่มี ROI)
  if (best.usage >= NEAR_LIMIT_THRESHOLD) {
    return { providerId: primaryProviderId, reason: 'all-near-limit' };
  }

  return {
    providerId: best.id,
    reason: 'switched',
    primaryUsage,
    fallbackUsage: best.usage,
  };
}

export const LOAD_BALANCE_THRESHOLD = NEAR_LIMIT_THRESHOLD;
