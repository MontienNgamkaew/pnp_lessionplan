/**
 * Smart Router — เลือก Provider ที่เหมาะสำหรับแต่ละ Module
 *
 * Strategy:
 *   1. ถ้า user's primary provider เหมาะกับ module → ใช้ตามนั้น
 *   2. ถ้าไม่เหมาะ → หา provider สำรองที่ user มี key อยู่ + เหมาะกับ module
 *   3. ถ้าไม่มี → return primary + warning (ระบบจะ fallback ทีหลัง)
 */

import { getModuleProfile, getRequiredTotalContext } from '../constants/moduleProfiles';
import { isProviderCompatible, getProviderCapability } from '../constants/providerCapabilities';

const STORAGE_PREFIX = 'ai_apikey_';

/**
 * ดู provider ที่ user มี key อยู่ (จาก localStorage)
 */
function getProvidersWithKey() {
  const ids = ['gemini', 'openai', 'claude', 'deepseek', 'openrouter', 'thaillm'];
  return ids.filter((id) => {
    try { return !!localStorage.getItem(STORAGE_PREFIX + id); }
    catch { return false; }
  });
}

/**
 * เรียง provider จาก best fit สำหรับ module นี้
 *   - tier เรียง: large > medium > small
 *   - context: ใกล้กับ requirement ที่สุด แต่ไม่น้อยกว่า (avoid waste)
 */
function rankProviders(providers, requiredContext) {
  const tierWeight = { large: 3, medium: 2, small: 1, unknown: 0 };
  return [...providers].sort((a, b) => {
    const capA = getProviderCapability(a);
    const capB = getProviderCapability(b);
    // tier descending (larger = better)
    const tierDiff = (tierWeight[capB.tier] || 0) - (tierWeight[capA.tier] || 0);
    if (tierDiff !== 0) return tierDiff;
    // context descending (larger = better — safer)
    return capB.contextWindow - capA.contextWindow;
  });
}

/**
 * Pick best provider for module
 *
 * @param {string} moduleName — key จาก moduleProfiles
 * @param {string} userProvider — provider ที่ user เลือก
 * @returns {{ providerId, reason, alternative }}
 *   - providerId: provider id ที่ระบบแนะนำ
 *   - reason: 'primary-ok' | 'primary-incompatible' | 'no-better-option'
 *   - alternative: ถ้า reason !== 'primary-ok' → alternative ที่จะใช้แทน
 */
export function pickProviderForModule(moduleName, userProvider) {
  const profile = getModuleProfile(moduleName);
  const required = getRequiredTotalContext(moduleName);

  // เช็ค primary
  if (isProviderCompatible(userProvider, required)) {
    return { providerId: userProvider, reason: 'primary-ok' };
  }

  // หา fallback ที่ user มี key + เหมาะกับ module
  const userKeys = getProvidersWithKey();
  const candidates = userKeys.filter((id) => id !== userProvider);
  const compatible = candidates.filter((id) => isProviderCompatible(id, required));

  if (compatible.length === 0) {
    return {
      providerId: userProvider,
      reason: 'no-better-option',
      message: `Module "${profile.label}" ต้องการ context ≥ ${required.toLocaleString()} tokens แต่ provider ของท่านไม่รองรับ — ระบบจะลองใช้ ${userProvider} ก่อน หาก fail จะ fallback`,
    };
  }

  const ranked = rankProviders(compatible, required);
  const best = ranked[0];
  return {
    providerId: best,
    reason: 'primary-incompatible',
    alternative: best,
    message: `Module "${profile.label}" ต้องการ context ใหญ่ → สลับไป "${getProviderCapability(best).name}"`,
  };
}

/**
 * Should skip user's provider ทันที (ไม่เสีย API call) ?
 *   - module ต้องการ context > provider context window อย่างชัดเจน
 */
export function shouldSkipProvider(moduleName, providerId) {
  const required = getRequiredTotalContext(moduleName);
  const cap = getProviderCapability(providerId);
  return cap.contextWindow < required;
}
