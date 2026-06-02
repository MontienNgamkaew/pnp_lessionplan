import { BaseProvider } from './BaseProvider';

/**
 * OpenRouter Provider — gateway สำหรับเรียกโมเดล AI หลายค่ายผ่าน API เดียว
 * ผู้ใช้ใส่ API Key ของตัวเอง (sk-or-v1-...) — ไม่มี hardcoded key
 * ใช้ format เดียวกับ OpenAI (chat completions)
 *
 * 🔄 Auto-Fallback Chain:
 * ลองโมเดลฟรีเรียงตามลำดับ — ถ้าตัวแรก fail (404/429/5xx) → ลองตัวถัดไป
 * ทำให้ระบบ resilient ต่อโมเดลที่ถูกปิด/หมดโควต้า
 */

// ลำดับลองโมเดลฟรี — เรียงตาม "ความเร็ว + JSON ดี" ก่อน (อัพเดท 2026-05-23)
//
// Priority:
//   1. fast response (small-medium params, ตอบใน <5s)
//   2. JSON instruction-following ดี
//   3. context window พอ (>100K = ใช้ได้ทุก Module)
//   4. Thai language ok
//
// ทุก model = pricing.prompt = "0" + pricing.completion = "0" (free 100%)
// Verified จาก: GET https://openrouter.ai/api/v1/models
const MODEL_CHAIN = [
  'google/gemma-4-26b-a4b-it:free',                     // 1. Gemma 4 26B — เร็วสุด + context 262K
  'meta-llama/llama-3.3-70b-instruct:free',             // 2. Llama 3.3 70B — เร็ว + stable + context 131K
  'deepseek/deepseek-v4-flash:free',                    // 3. DeepSeek V4 flash — fast + JSON ดี + 1M ctx
  'openai/gpt-oss-120b:free',                           // 4. GPT-OSS 120B — เร็วปานกลาง + general strong
  'qwen/qwen3-coder:free',                              // 5. Qwen3 Coder — JSON ดีแต่ช้านิด + 1M ctx
  'qwen/qwen3-next-80b-a3b-instruct:free',              // 6. Qwen3-Next 80B — ช้าแต่ context 262K
  'nvidia/nemotron-3-super-120b-a12b:free',             // 7. Nemotron 120B — ช้าสุด last resort + 1M ctx
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class OpenRouterProvider extends BaseProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.models = [...MODEL_CHAIN];
    this.model = this.models[0]; // default = first in chain
    this.lastUsedModel = null;
  }

  static get displayName() { return 'OpenRouter'; }
  static get providerId() { return 'openrouter'; }
  static get apiKeyPlaceholder() { return 'sk-or-v1-...'; }
  static get apiKeyHelpUrl() { return 'https://openrouter.ai/settings/keys'; }
  static get apiKeyHelpText() {
    return 'ขอรับ API Key จาก OpenRouter — ระบบ auto-fallback ระหว่าง 7 โมเดลฟรี (DeepSeek V4, Qwen3, Nemotron, Gemma 4, Llama 3.3, GPT-OSS)';
  }

  async checkHealth() {
    if (!this.apiKey) return { ok: false, status: 0, message: 'No API key' };
    try {
      // OpenRouter มี /auth/key ที่คืน credits/limit ของ key
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, status: res.status, extra: data?.data };
      }
      const txt = await res.text();
      return { ok: false, status: res.status, message: txt.slice(0, 200) };
    } catch (err) {
      return { ok: false, status: 0, message: err.message };
    }
  }

  async sendMessage(systemPrompt, contents = [], options = {}) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    const userParts = [];
    for (const content of contents) {
      if (content.type === 'text') {
        userParts.push({ type: 'text', text: content.data });
      } else if (content.type === 'image') {
        const base64 = this.fileToBase64(content.data);
        userParts.push({
          type: 'image_url',
          image_url: { url: `data:${content.mimeType || 'image/jpeg'};base64,${base64}` },
        });
      } else if (content.type === 'pdf') {
        const base64 = this.fileToBase64(content.data);
        userParts.push({
          type: 'image_url',
          image_url: { url: `data:application/pdf;base64,${base64}` },
        });
      } else if (content.type === 'word') {
        userParts.push({ type: 'text', text: content.data });
      }
    }
    if (userParts.length === 0) {
      userParts.push({ type: 'text', text: 'Please process the above instructions.' });
    }
    messages.push({ role: 'user', content: userParts });

    // ─── Auto-Fallback Chain ─────────────────────────────────────────────
    // ลองแต่ละโมเดลตามลำดับ — fail fast (ไม่ retry ทีเดิม, ข้ามไปตัวถัดไป)
    let lastError = null;
    const total = this.models.length;
    for (let i = 0; i < total; i++) {
      const model = this.models[i];
      const shortName = model.split('/').pop().replace(':free', '');
      // 🆕 broadcast progress event — useAiApi ฟัง + update loadingText
      try {
        window.dispatchEvent(new CustomEvent('ai-model-progress', {
          detail: { provider: 'openrouter', idx: i, total, model: shortName },
        }));
      } catch {}
      try {
        console.log(`[OpenRouter] Trying model ${i + 1}/${total}: ${model}`);
        const result = await this._callOneModel(model, messages, options);
        this.lastUsedModel = model;
        if (i > 0) {
          console.log(`[OpenRouter] ✅ Fallback success — used "${model}" (โมเดลที่ ${i + 1})`);
        }
        return result;
      } catch (err) {
        lastError = err;
        const status = err.status || 0;

        // Auth error (401/403) → คีย์ไม่ถูก, ไม่มีประโยชน์ลองโมเดลอื่น
        if (status === 401 || status === 403) {
          console.error('[OpenRouter] Auth error — stopping fallback chain');
          throw err;
        }

        // Model failed (404 / 429 / 5xx / network) → ลองโมเดลถัดไป
        console.warn(`[OpenRouter] ❌ Model "${model}" failed (${status || 'network'}: ${err.message?.slice(0, 60) || ''}) → fallback`);

        // Brief delay between attempts (ไม่ hammering server)
        if (i < this.models.length - 1) {
          await sleep(500);
        }
      }
    }

    // All models exhausted
    const lastMsg = (lastError?.message || 'unknown error').slice(0, 300);
    throw new Error(
      `OpenRouter: ลองโมเดลฟรีทั้ง ${total} ตัวแล้วใช้ไม่ได้เลย\n` +
      `Last error: ${lastMsg}\n` +
      `→ ตรวจสอบ:\n` +
      `   1. API key ถูกต้อง (sk-or-v1-...)\n` +
      `   2. มี credit/quota เหลือ — บางโมเดลฟรีอาจต้อง buy credit ขั้นต่ำ $5\n` +
      `   3. ลองภายหลัง — free model อาจปิดชั่วคราว`
    );
  }

  // ─── Single-model call (no retry — fallback chain เป็น retry strategy) ──
  async _callOneModel(model, messages, options) {
    const payload = { model, messages };
    if (options.requireJson) payload.response_format = { type: 'json_object' };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'AI Lesson Planner v3',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await this._parseErrorResponse(response);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('AI ไม่ส่งข้อมูลกลับมา กรุณาลองใหม่อีกครั้ง');
    return text;
  }
}
