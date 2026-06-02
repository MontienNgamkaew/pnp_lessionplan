/**
 * Provider Capabilities — context window + features ของแต่ละ provider
 *
 * contextWindow: total tokens (input + output combined)
 * maxOutput: ค่าสูงสุดของ output ที่ provider อนุญาต
 * supportsJson: รองรับ JSON mode (response_format: json_object)
 * supportsVision: รองรับ image input
 * tier: 'small' | 'medium' | 'large' — ใช้จัดอันดับ
 */

export const PROVIDER_CAPABILITIES = {
  // ── Google Gemini (large context, fast, free tier) ──
  gemini: {
    name: 'Google Gemini',
    contextWindow: 1000000,  // 1M tokens (Flash 2.5)
    maxOutput: 8192,
    supportsJson: true,
    supportsVision: true,
    tier: 'large',
  },

  // ── OpenAI (mid-large context) ──
  openai: {
    name: 'OpenAI GPT-4o',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsJson: true,
    supportsVision: true,
    tier: 'large',
  },

  // ── Anthropic Claude (large context) ──
  claude: {
    name: 'Anthropic Claude',
    contextWindow: 200000,
    maxOutput: 8192,
    supportsJson: false, // Claude ไม่มี strict JSON mode แต่ตอบ JSON ผ่าน prompt ได้ดี
    supportsVision: true,
    tier: 'large',
  },

  // ── DeepSeek (medium) ──
  deepseek: {
    name: 'DeepSeek',
    contextWindow: 64000,
    maxOutput: 8192,
    supportsJson: true,
    supportsVision: false,
    tier: 'medium',
  },

  // ── OpenRouter (varies by model — ใช้ค่า worst-case ของ free chain) ──
  openrouter: {
    name: 'OpenRouter',
    contextWindow: 32000,  // safe lower bound (free models บางตัว 8K, บางตัว 128K)
    maxOutput: 8192,
    supportsJson: true,
    supportsVision: true,  // มี Gemini Flash ใน chain
    tier: 'medium',
  },

  // ── ThaiLLM 8B (small context — Thai-focused, ผ่าน proxy) ──
  thaillm: {
    name: 'ThaiLLM',
    contextWindow: 16384,
    maxOutput: 8192,
    supportsJson: true,
    supportsVision: false,
    tier: 'small',
  },
};

/**
 * ดึง capability ของ provider — ถ้าไม่เจอ return conservative default
 */
export function getProviderCapability(providerId) {
  return PROVIDER_CAPABILITIES[providerId] || {
    name: providerId,
    contextWindow: 8000,
    maxOutput: 4096,
    supportsJson: false,
    supportsVision: false,
    tier: 'unknown',
  };
}

/**
 * Provider ไหนเหมาะกับ moduleProfile?
 *   - context ของ provider ต้อง >= required total
 *   - ถ้าต้องการ vision → provider ต้องรองรับ
 */
export function isProviderCompatible(providerId, requiredContext, opts = {}) {
  const cap = getProviderCapability(providerId);
  if (cap.contextWindow < requiredContext) return false;
  if (opts.requiresVision && !cap.supportsVision) return false;
  return true;
}
