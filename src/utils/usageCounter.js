/**
 * usageCounter — เก็บสถิติ AI usage per provider per day ใน localStorage
 *
 * Storage shape:
 *   localStorage["ai_usage_<providerId>"] = {
 *     "2026-05-21": { success: 142, error: 4 },
 *     "2026-05-20": { success: 90, error: 1 },
 *     ...
 *   }
 *
 * Auto-cleanup: เก็บไว้ 7 วันล่าสุดเท่านั้น
 */

const PREFIX = 'ai_usage_';
const MAX_DAYS = 7;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function loadHistory(providerId) {
  try {
    const raw = localStorage.getItem(PREFIX + providerId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveHistory(providerId, history) {
  try {
    // Cleanup: เก็บแค่ 7 วันล่าสุด
    const sortedDates = Object.keys(history).sort().reverse();
    const trimmed = {};
    sortedDates.slice(0, MAX_DAYS).forEach((d) => (trimmed[d] = history[d]));
    localStorage.setItem(PREFIX + providerId, JSON.stringify(trimmed));
  } catch {}
}

/**
 * บันทึก 1 request (success หรือ error)
 */
export function recordUsage(providerId, type) {
  if (!providerId) return;
  if (type !== 'success' && type !== 'error') return;
  const history = loadHistory(providerId);
  const d = today();
  if (!history[d]) history[d] = { success: 0, error: 0 };
  history[d][type] = (history[d][type] || 0) + 1;
  saveHistory(providerId, history);
}

/**
 * ดึง stats ของวันนี้
 */
export function getUsageToday(providerId) {
  if (!providerId) return { success: 0, error: 0 };
  const history = loadHistory(providerId);
  return history[today()] || { success: 0, error: 0 };
}

/**
 * ดึง stats ทั้ง 7 วัน (เรียงจากใหม่ → เก่า)
 */
export function getUsageHistory(providerId) {
  if (!providerId) return [];
  const history = loadHistory(providerId);
  const out = [];
  for (let i = 0; i < MAX_DAYS; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const data = history[d] || { success: 0, error: 0 };
    out.push({ date: d, success: data.success, error: data.error });
  }
  return out;
}

/**
 * ล้างข้อมูล provider เฉพาะตัว
 */
export function clearUsage(providerId) {
  if (!providerId) return;
  try {
    localStorage.removeItem(PREFIX + providerId);
  } catch {}
}
