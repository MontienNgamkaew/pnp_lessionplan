import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createProvider, DEFAULT_PROVIDER, getAvailableProviders } from '../providers/index';
import { cleanAndParseJSON } from '../utils/jsonParser';
import { recordUsage } from '../utils/usageCounter';
import { pickProviderForModule, shouldSkipProvider } from '../utils/smartRouter';
import { getProviderCapability, isProviderCompatible } from '../constants/providerCapabilities';
import { getRequiredTotalContext, getModuleProfile } from '../constants/moduleProfiles';
import { buildCacheKey, getCached, setCached, clearCache, getCacheStats } from '../utils/persistentCache';
import { pickProviderSmart } from '../utils/loadBalancer';

// ── ThaiLLM Admin Pool — เฉพาะ module ที่อนุญาตให้ใช้ admin pool ──
// (สื่อ/ใบงาน/ใบความรู้/ใบปฏิบัติ/ใบมอบหมาย/เครื่องมือวัดประเมิน)
const THAILLM_ADMIN_MODULES = new Set([
  'media',
  'jobSheet',
  'infoSheet',
  'operationSheet',
  'assignmentSheet',
  'assessment',
  'assessmentTools',
  'affectiveAssessment',
  'jobSheetEval',
  'activitiesAssessmentTools',
  'activitiesQuestionBank',
]);

const STORAGE_PREFIX = 'ai_apikey_';
const PROVIDER_KEY = 'ai_provider';

// Valid provider IDs (used to clean up stale localStorage)
const VALID_IDS = new Set(getAvailableProviders().map((p) => p.id));

// ── 💾 AI Response Cache — persistent (localStorage, 24h TTL) ──────────
// ใช้ utils/persistentCache.js (cross-session, survives refresh)
// re-export ให้ component อื่นใช้ได้
export const clearAiCache = clearCache;
export const getAiCacheStats = getCacheStats;

// --- localStorage helpers with auto-cleanup ---
export const getStoredProvider = () => {
  const stored = localStorage.getItem(PROVIDER_KEY);
  // If stored provider is no longer valid, reset to default
  if (stored && !VALID_IDS.has(stored)) {
    console.log(`[useAiApi] Stored provider "${stored}" no longer valid, resetting to "${DEFAULT_PROVIDER}"`);
    localStorage.removeItem(PROVIDER_KEY);
    // Clean up old keys too
    localStorage.removeItem(STORAGE_PREFIX + stored);
    return DEFAULT_PROVIDER;
  }
  return stored || DEFAULT_PROVIDER;
};
export const setStoredProvider = (id) => localStorage.setItem(PROVIDER_KEY, id);
export const getStoredApiKey = (providerId) => localStorage.getItem(STORAGE_PREFIX + providerId) || '';
export const setStoredApiKey = (providerId, key) => localStorage.setItem(STORAGE_PREFIX + providerId, key);

/**
 * Convert Gemini-style "parts" array into the provider-agnostic "contents" format.
 */
function convertPartsToContents(parts) {
  const systemTexts = [];
  const contents = [];
  let isFirstText = true;

  for (const part of parts) {
    if (part.text) {
      if (isFirstText) {
        systemTexts.push(part.text);
        isFirstText = false;
      } else {
        contents.push({ type: 'text', data: part.text });
      }
    } else if (part.inlineData) {
      const { mimeType, data } = part.inlineData;
      if (mimeType === 'application/pdf') {
        contents.push({ type: 'pdf', data: `data:${mimeType};base64,${data}`, mimeType });
      } else {
        contents.push({ type: 'image', data: `data:${mimeType};base64,${data}`, mimeType });
      }
    }
  }

  return { systemPrompt: systemTexts.join('\n'), contents };
}

/**
 * Reusable hook for calling any AI provider.
 *
 * Options:
 *   json: parse output as JSON
 *   statusText: text to show while loading
 *   skipCache: true → bypass cache (force fresh API call)
 */
export const useAiApi = (providerId, apiKey) => {
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  // Synchronous double-click prevention — useRef updates immediately (no re-render)
  // กัน case user double-click ใน 200ms ก่อน React state จะ update
  const isCallingRef = useRef(false);

  // 🆕 Listen ai-model-progress event — แสดงให้ user รู้ว่าระบบกำลังลอง model ไหน
  // ป้องกัน UI เหมือนค้าง ตอน OpenRouter fallback ระหว่างโมเดล
  const baseStatusRef = useRef('');
  useEffect(() => {
    const handler = (e) => {
      const { idx, total, model } = e.detail || {};
      if (typeof idx !== 'number' || !isCallingRef.current) return;
      const base = baseStatusRef.current || 'กำลังประมวลผล...';
      if (idx === 0) {
        setLoadingText(`${base} (โมเดล: ${model})`);
      } else {
        setLoadingText(`${base}\n(ลองโมเดลที่ ${idx + 1}/${total}: ${model}...)`);
      }
    };
    window.addEventListener('ai-model-progress', handler);
    return () => window.removeEventListener('ai-model-progress', handler);
  }, []);

  const provider = useMemo(() => {
    if (!providerId || !apiKey) return null;
    try { return createProvider(providerId, apiKey); } catch { return null; }
  }, [providerId, apiKey]);

  const callApi = useCallback(
    async (parts, { json = false, statusText = '', skipCache = false, moduleName = '' } = {}) => {
      if (!provider) {
        throw new Error('กรุณาตั้งค่า API Key ก่อนใช้งาน — กดปุ่ม "ตั้งค่า AI" ด้านบนขวา');
      }

      // 🛡️ Double-click prevention (synchronous)
      if (isCallingRef.current) {
        throw new Error('กำลังประมวลผลอยู่ — กรุณารอให้เสร็จก่อน (ป้องกันการคลิกซ้อน)');
      }

      const { systemPrompt, contents } = convertPartsToContents(parts);

      // 💾 Cache check (persistent — 24h TTL, localStorage)
      if (!skipCache) {
        const cacheKey = buildCacheKey(providerId, systemPrompt, contents);
        const cached = getCached(cacheKey);
        if (cached !== undefined) {
          console.log(`[AI Cache HIT 💾] saved 1 API call (key=${cacheKey.slice(0, 30)}...)`);
          return cached;
        }
      }

      isCallingRef.current = true;
      setLoading(true);
      const baseStatus = statusText || 'กำลังประมวลผล...';
      baseStatusRef.current = baseStatus;
      setLoadingText(baseStatus);

      // ── Helper: เรียก provider พร้อมจัดการ result + cache + usage counter ─────
      const callProvider = async (prov, pid) => {
        try {
          const text = await prov.sendMessage(systemPrompt, contents, { requireJson: json });
          if (!text) throw new Error('No data returned from AI');
          const result = json ? cleanAndParseJSON(text) : text;
          // 📊 Record success
          recordUsage(pid, 'success');
          // 💾 Store in persistent cache (keyed by providerId ของจริงที่ใช้)
          if (!skipCache) {
            const cacheKey = buildCacheKey(pid, systemPrompt, contents);
            setCached(cacheKey, result);
          }
          return result;
        } catch (e) {
          // 📊 Record error
          recordUsage(pid, 'error');
          throw e;
        }
      };

      // ── ⚖️ Load Balancing — Smart Auto-Switch (ถ้า user เปิด) ──
      // ตรวจก่อน Smart Router: ถ้า primary ใกล้หมด quota วันนี้ → switch ไป provider ที่ใช้น้อย
      let effectiveProvider = provider;
      let effectiveProviderId = providerId;
      const lbPick = pickProviderSmart(providerId, moduleName);
      if (lbPick.reason === 'switched' && lbPick.providerId !== providerId) {
        try {
          const altKey = localStorage.getItem(STORAGE_PREFIX + lbPick.providerId);
          if (altKey) {
            const altProvider = createProvider(lbPick.providerId, altKey);
            const capName = getProviderCapability(lbPick.providerId).name;
            console.log(`[LoadBalance] ${providerId} ใกล้หมด (${lbPick.primaryUsage} calls/วัน) → switch ${lbPick.providerId} (${lbPick.fallbackUsage} calls)`);
            setLoadingText(`${statusText || 'กำลังประมวลผล...'} (Load Balance: ${capName})`);
            effectiveProvider = altProvider;
            effectiveProviderId = lbPick.providerId;
          }
        } catch (lbErr) {
          console.warn('[LoadBalance] prep failed:', lbErr.message);
        }
      }

      // ── 🧠 Smart Routing — เลือก provider ที่เหมาะกับ module ──
      // (ทำหลัง Load Balance — อาจ override ถ้า module ต้องการ context ใหญ่)
      if (moduleName && shouldSkipProvider(moduleName, effectiveProviderId)) {
        const pick = pickProviderForModule(moduleName, effectiveProviderId);
        if (pick.reason === 'primary-incompatible' && pick.providerId !== effectiveProviderId) {
          try {
            const altKey = localStorage.getItem(STORAGE_PREFIX + pick.providerId);
            if (altKey) {
              const altProvider = createProvider(pick.providerId, altKey);
              const capName = getProviderCapability(pick.providerId).name;
              console.log(`[SmartRouter] ${moduleName}: ${effectiveProviderId} → ${pick.providerId}`);
              setLoadingText(`${statusText || 'กำลังประมวลผล...'} (สลับไป ${capName} อัตโนมัติ)`);
              effectiveProvider = altProvider;
              effectiveProviderId = pick.providerId;
            }
          } catch (routeErr) {
            console.warn('[SmartRouter] fallback prep failed:', routeErr.message);
          }
        }
      }

      try {
        return await callProvider(effectiveProvider, effectiveProviderId);
      } catch (err) {
        const status = err.status || 0;
        const isQuotaError = status === 429 || status === 403 || /quota|rate.?limit/i.test(err.message || '');
        // 🆕 ถ้า AI ตอบ JSON ผิด → ลอง provider อื่น (model เล็กอ่อน JSON instruction)
        const isParseError = /parse|JSON|ไม่ถูกต้อง|ไม่สามารถ.*parse|ผิดโครงสร้าง|invalid.*format|ตอบใน?รูปแบบ/i.test(err.message || '');
        // 🆕 ถ้า context ใหญ่เกิน window ของ model → ลอง provider ที่มี context ใหญ่กว่า
        const isContextError = /context.*length|max.?tokens|too.?large|context.?window|ใหญ่เกิน context/i.test(err.message || '');
        const shouldFallback = isQuotaError || isParseError || isContextError;

        // ── 🔁 Cross-provider auto-fallback ────────────────────────
        // ถ้า provider หลักเจอ quota/rate limit หรือ JSON parse error → ลอง fallback ตามลำดับ:
        //   1. thaillm-admin (key ของแอด์มินที่เก็บใน CF Worker KV — shared)
        //   2. openrouter (key ของ user เอง — free chain)
        //
        // หมายเหตุ:
        //   - thaillm-admin = virtual provider (ไม่ต้องใช้ user key)
        //   - ถ้าผู้ใช้เป็น thaillm อยู่แล้ว → ข้าม thaillm-admin (provider เดียวกัน)
        // 🆕 thaillm-admin = shared pool ของ admin (ใช้เฉพาะ module ที่อยู่ใน THAILLM_ADMIN_MODULES)
        // ใส่เป็น fallback ตัวแรก — Gemini หมด → admin pool ช่วยรอง
        const FALLBACK_CHAIN = {
          gemini: ['thaillm-admin', 'thaillm', 'openrouter', 'openai'],
          openrouter: ['thaillm-admin', 'thaillm', 'gemini'],
          openai: ['thaillm-admin', 'thaillm', 'openrouter', 'gemini'],
          claude: ['thaillm-admin', 'thaillm', 'openrouter', 'gemini'],
          deepseek: ['thaillm-admin', 'thaillm', 'openrouter', 'gemini'],
          thaillm: ['thaillm-admin', 'openrouter', 'gemini'],
        };

        if (shouldFallback) {
          const fallbacks = FALLBACK_CHAIN[providerId] || [];
          const reason = isQuotaError ? 'quota' : isContextError ? 'context-too-large' : 'parse-error';
          // 🆕 ถ้ามี moduleName + เกิด context error → กรอง fallback ให้เหมาะกับ module
          const required = moduleName ? getRequiredTotalContext(moduleName) : 0;
          let filteredFallbacks = (isContextError && required > 0)
            ? fallbacks.filter((fbId) => isProviderCompatible(fbId, required))
            : fallbacks;

          // 🆕 thaillm-admin = เฉพาะ module ที่อยู่ใน THAILLM_ADMIN_MODULES
          filteredFallbacks = filteredFallbacks.filter((fbId) => {
            if (fbId !== 'thaillm-admin') return true;
            return moduleName && THAILLM_ADMIN_MODULES.has(moduleName);
          });

          let attemptedFallbacks = [];
          let missingKeyProviders = [];

          for (const fbId of filteredFallbacks) {
            try {
              let fbProvider;
              if (fbId === 'thaillm-admin') {
                // Virtual provider — ไม่ต้องใช้ user key (Worker จัดให้)
                fbProvider = createProvider(fbId, '');
              } else {
                const fbKey = localStorage.getItem(STORAGE_PREFIX + fbId);
                if (!fbKey) {
                  missingKeyProviders.push(fbId);
                  continue;
                }
                fbProvider = createProvider(fbId, fbKey);
              }
              console.warn(`[useAiApi] ${providerId} ${reason} → fallback ไป ${fbId}`);
              setLoadingText(`${statusText || 'กำลังประมวลผล...'} (สลับไป ${fbId})`);
              attemptedFallbacks.push(fbId);
              return await callProvider(fbProvider, fbId);
            } catch (fbErr) {
              console.warn(`[useAiApi] Fallback ${fbId} ล้มเหลว:`, fbErr.message);
            }
          }

          // 🆕 ทุก fallback fail → ส่ง error ที่ actionable
          if (attemptedFallbacks.length === 0 && missingKeyProviders.length > 0) {
            const moduleLabel = moduleName ? getModuleProfile(moduleName).label : 'Module นี้';
            const suggestion = required > 32000
              ? 'แนะนำ: สร้าง Gemini API key (ฟรี 1M context) ที่ https://aistudio.google.com/app/apikey'
              : 'แนะนำ: สร้าง OpenRouter API key (ฟรี — มี Gemini Flash 1M context) ที่ https://openrouter.ai/keys';
            throw new Error(
              `${moduleLabel} ใช้กับ ${providerId} ไม่ได้ (${err.message?.slice(0, 80) || reason})\n` +
              `Provider สำรองที่เหมาะ (${missingKeyProviders.join('/')}) ท่านยังไม่ได้ใส่ key\n` +
              `💡 ${suggestion}`
            );
          }
        }

        console.error(`[useAiApi] ${providerId} error:`, err);
        throw err;
      } finally {
        isCallingRef.current = false;
        setLoading(false);
        setLoadingText('');
      }
    },
    [provider, providerId]
  );

  return { callApi, loading, loadingText, setLoadingText };
};
