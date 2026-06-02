const STATS_KEY = 'usage_stats';
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyxjQPVEx1FGPOvkCZ43V4STKKhY6VCgodo-A25ykPGiCWaIJGxDe8IvWBvNXcP7GLz/exec';

// Cache for real stats from Google Sheet
let cachedRealStats = null;
let lastFetchTime = 0;
const CACHE_TTL = 60000; // 1 minute cache

const getLocalStats = () => {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch { return {}; }
};

const saveLocalStats = (stats) => localStorage.setItem(STATS_KEY, JSON.stringify(stats));

/**
 * Send event to Google Sheet (fire-and-forget)
 */
const sendToSheet = (data) => {
  if (!GOOGLE_SHEET_URL) return;
  try {
    fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data),
    }).catch(() => {});
  } catch { /* silent */ }
};

/**
 * Track a page visit (once per session)
 */
export const trackVisit = () => {
  const stats = getLocalStats();
  const today = new Date().toISOString().split('T')[0];
  if (stats.lastVisitDate === today) return;

  stats.totalVisits = (stats.totalVisits || 0) + 1;
  stats.lastVisitDate = today;
  saveLocalStats(stats);

  sendToSheet({
    type: 'usage_stats',
    event: 'เข้าใช้งาน',
    detail: `ครั้งที่ ${stats.totalVisits}`,
    userAgent: navigator.userAgent,
  });

  // Invalidate cache so next fetch gets fresh data
  cachedRealStats = null;
};

/**
 * Track a download + send to Google Sheet
 */
export const trackDownload = (module = '', courseInfo = '') => {
  const stats = getLocalStats();
  stats.totalDownloads = (stats.totalDownloads || 0) + 1;
  saveLocalStats(stats);

  sendToSheet({
    type: 'usage_stats',
    event: 'ดาวน์โหลด',
    detail: `${module}${courseInfo ? ' — ' + courseInfo : ''} (ครั้งที่ ${stats.totalDownloads})`,
    userAgent: navigator.userAgent,
  });

  cachedRealStats = null;
};

/**
 * Track AI generation + send to Google Sheet
 */
export const trackGeneration = (module = '', courseInfo = '') => {
  const stats = getLocalStats();
  stats.totalGenerations = (stats.totalGenerations || 0) + 1;
  saveLocalStats(stats);

  sendToSheet({
    type: 'usage_stats',
    event: 'สร้างแผนฯ',
    detail: `${module}${courseInfo ? ' — ' + courseInfo : ''} (ครั้งที่ ${stats.totalGenerations})`,
    userAgent: navigator.userAgent,
  });

  cachedRealStats = null;
};

/**
 * Send user download info to Google Sheet (ข้อมูลผู้ใช้)
 */
export const sendUserDownloadInfo = (userInfo, courseInfo = {}, module = '') => {
  sendToSheet({
    type: 'user_download',
    ...userInfo,
    courseCode: courseInfo.courseCode || '',
    courseName: courseInfo.courseName || '',
    module,
  });
};

/**
 * Fetch REAL stats from Google Sheet (with 1-minute cache)
 * Falls back to localStorage if fetch fails
 */
export const fetchRealStats = async () => {
  const now = Date.now();
  if (cachedRealStats && (now - lastFetchTime) < CACHE_TTL) {
    return cachedRealStats;
  }

  try {
    const res = await fetch(`${GOOGLE_SHEET_URL}?action=dashboard`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const summary = json?.summary || {};
    cachedRealStats = {
      totalVisits: summary.totalVisits || 0,
      totalDownloads: summary.totalDownloads || 0,
      totalGenerations: summary.totalGenerations || 0,
    };
    lastFetchTime = now;
    return cachedRealStats;
  } catch {
    // Fallback to localStorage
    return getUsageStats();
  }
};

/**
 * Get stats from localStorage (for immediate display before fetch completes)
 */
export const getUsageStats = () => {
  const stats = getLocalStats();
  return {
    totalVisits: stats.totalVisits || 0,
    totalDownloads: stats.totalDownloads || 0,
    totalGenerations: stats.totalGenerations || 0,
  };
};
