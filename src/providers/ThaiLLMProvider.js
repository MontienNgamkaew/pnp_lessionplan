import { BaseProvider } from './BaseProvider';

/**
 * ThaiLLM Provider — โมเดลภาษาไทย โดย thaillm.or.th
 *
 * 4 โมเดล (8B parameters, OpenAI-compatible):
 *   - openthaigpt (AIEAT)
 *   - pathumma (NECTEC)
 *   - typhoon (SCB 10X)
 *   - thalle / kbtg (KBTG)
 *
 * Auto-fallback: ถ้าโมเดลแรก fail → ลองตัวถัดไปตามลำดับ
 *
 * 🚨 CORS Note: thaillm.or.th ไม่ใส่ CORS headers — browser fetch ตรงๆ จะถูก block
 * → ใช้ Cloudflare Worker proxy ระหว่างกลาง (URL ใน import.meta.env.VITE_THAILLM_PROXY_URL)
 * → ถ้าไม่ตั้ง env → fallback ไปยิง thaillm.or.th ตรงๆ (จะ fail บน browser แต่ใช้ได้บน Node/Postman)
 */

const MODEL_CHAIN = [
  'openthaigpt',  // AIEAT — default
  'pathumma',     // NECTEC
  'typhoon',      // SCB 10X
  'thalle',       // KBTG (shorthand: thalle หรือ kbtg)
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Endpoint detection — ถ้ามี proxy ใช้ proxy, ไม่งั้น ยิงตรงไป thaillm.or.th
// Cloudflare Worker proxy รองรับ nested path → ใช้ path มาตรฐาน /api/v1/chat/completions
const PROXY_BASE = import.meta.env?.VITE_THAILLM_PROXY_URL || 'https://thaillm.or.th';
const ENDPOINT = `${PROXY_BASE.replace(/\/$/, '')}/api/v1/chat/completions`;

// ── 🚦 Token bucket rate limiter — shared across instances ─────────────
// ThaiLLM rate limit: 5 req/sec, 200 req/min — ตั้งไว้ที่ 4/sec ให้ปลอดภัย
const RATE_LIMIT_PER_SEC = 4;
const _bucket = {
  tokens: RATE_LIMIT_PER_SEC,
  capacity: RATE_LIMIT_PER_SEC,
  refillPerSec: RATE_LIMIT_PER_SEC,
  lastRefill: Date.now(),
};

function _refill() {
  const now = Date.now();
  const elapsedSec = (now - _bucket.lastRefill) / 1000;
  _bucket.tokens = Math.min(_bucket.capacity, _bucket.tokens + elapsedSec * _bucket.refillPerSec);
  _bucket.lastRefill = now;
}

async function _acquireToken() {
  // รอจนกว่าจะมี token พอ
  while (true) {
    _refill();
    if (_bucket.tokens >= 1) {
      _bucket.tokens -= 1;
      return;
    }
    // คำนวณว่าต้องรอกี่ ms ก่อนจะมี token พอ (cap ที่ 250ms ต่อ tick)
    const waitMs = Math.min(Math.ceil(((1 - _bucket.tokens) / _bucket.refillPerSec) * 1000), 250);
    await sleep(waitMs);
  }
}

export class ThaiLLMProvider extends BaseProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = ENDPOINT;
    this.models = [...MODEL_CHAIN];
    this.model = this.models[0];
    this.lastUsedModel = null;
  }

  static get displayName() { return 'ThaiLLM'; }
  static get providerId() { return 'thaillm'; }
  static get apiKeyPlaceholder() { return '2f59...sNdf'; }
  static get apiKeyHelpUrl() { return 'https://thaillm.or.th/'; }
  static get apiKeyHelpText() {
    return 'โมเดลภาษาไทย 4 ตัว (OpenThaiGPT/Pathumma/Typhoon/THaLLE) — ใช้ผ่าน proxy';
  }

  async checkHealth() {
    if (!this.apiKey) return { ok: false, status: 0, message: 'No API key' };
    try {
      const base = this.baseUrl.replace(/\/chat\/completions$/, '');
      const url = `${base}/models`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (res.ok) return { ok: true, status: res.status };
      const txt = await res.text();
      return { ok: false, status: res.status, message: txt.slice(0, 200) };
    } catch (err) {
      return { ok: false, status: 0, message: err.message };
    }
  }

  async sendMessage(systemPrompt, contents = [], options = {}) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    // ThaiLLM ตอนนี้รองรับเฉพาะ text (8B chat models — ยังไม่ multimodal)
    // → รวม text ทั้งหมดเป็น content เดียว, ตัด image/pdf
    const textParts = [];
    for (const content of contents) {
      if (content.type === 'text') textParts.push(content.data);
      else if (content.type === 'word') textParts.push(content.data);
      else if (content.type === 'pdf' && content.extractedText) textParts.push(content.extractedText);
      // image: ข้าม (8B chat-only ไม่รองรับ vision)
    }
    if (textParts.length === 0) textParts.push('Please process the instruction above.');
    messages.push({ role: 'user', content: textParts.join('\n\n') });

    // ── Auto-fallback chain ───────────────────────────────────────
    let lastError = null;
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      try {
        console.log(`[ThaiLLM] Trying model ${i + 1}/${this.models.length}: ${model}`);
        const result = await this._callOneModel(model, messages, options);
        this.lastUsedModel = model;
        if (i > 0) {
          console.log(`[ThaiLLM] ✅ Fallback success — used "${model}"`);
        }
        return result;
      } catch (err) {
        lastError = err;
        const status = err.status || 0;

        // Auth error → ไม่ลองโมเดลอื่น (key ผิดเหมือนกัน)
        if (status === 401 || status === 403) {
          console.error('[ThaiLLM] Auth error — stopping fallback chain');
          throw err;
        }

        // Context overflow → ลอง model อื่นใน chain ไม่ช่วย (ทุก model ของ ThaiLLM context 16K)
        if (/context|too.?large|max.?tokens|ใหญ่เกิน/i.test(err.message || '')) {
          console.error('[ThaiLLM] Context overflow — stopping model chain, signal fallback to other provider');
          throw err;
        }

        console.warn(`[ThaiLLM] ❌ Model "${model}" failed (${status || 'network'}) → fallback`);
        if (i < this.models.length - 1) await sleep(500);
      }
    }

    const lastMsg = lastError?.message || 'unknown error';
    const isNetwork = /failed.*fetch|network|cors/i.test(lastMsg);
    const proxyUrl = (import.meta.env?.VITE_THAILLM_PROXY_URL || '(ไม่ได้ตั้ง — ยิงตรงไป thaillm.or.th จะติด CORS)');
    throw new Error(
      `ThaiLLM: ลองทุกโมเดล (${this.models.length} ตัว) แล้วใช้ไม่ได้\n` +
      `(${lastMsg})\n` +
      (isNetwork
        ? `🌐 Network error — ตรวจสอบ:\n` +
          `   1. Proxy URL: ${proxyUrl}\n` +
          `   2. เปิด ${proxyUrl}/api/health ใน browser ดูว่าตอบไหม\n` +
          `   3. ถ้า Vercel proxy ตาย → redeploy proxy\n` +
          `   4. Hard refresh เว็บ (Cmd+Shift+R)`
        : `→ ตรวจสอบ API key หรือ proxy ทำงานไหม`)
    );
  }

  async _callOneModel(model, messages, options) {
    // ── 🧮 Dynamic max_tokens — ThaiLLM 8B context = 16,384 tokens ──
    // Thai sentencepiece tokenizer: ~1 token per 1.5-2 chars (mixed Thai/English)
    // ใช้ /2 เป็นค่ากลาง (เซฟกว่า /3 ที่ underestimate)
    const inputChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const estInputTokens = Math.ceil(inputChars / 2);
    const CONTEXT_LIMIT = 16384;
    const SAFETY_MARGIN = 500;
    let maxOutputTokens = Math.min(
      8192,
      Math.max(512, CONTEXT_LIMIT - estInputTokens - SAFETY_MARGIN)
    );

    // ── 🚨 Fail fast: input ใหญ่เกิน context ──
    if (estInputTokens > CONTEXT_LIMIT - 1000) {
      throw new Error(
        `Input ใหญ่เกิน context window ของ ThaiLLM (ประมาณ ${estInputTokens} > ${CONTEXT_LIMIT - 1000} tokens)\n` +
        `💡 Module นี้มี context ใหญ่เกินสำหรับ ThaiLLM 8B (16K) — กรุณาเปลี่ยน Provider เป็น Gemini/GPT-4/Claude ที่มี context window 100K+`
      );
    }

    await _acquireToken();
    const RETRY_DELAYS = [5000, 10000, 20000];
    let rateAttempt = 0;
    let contextRetried = false;

    while (true) {
      const payload = { model, messages, max_tokens: maxOutputTokens };
      if (options.requireJson) payload.response_format = { type: 'json_object' };

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('AI ไม่ส่งข้อมูลกลับมา กรุณาลองใหม่อีกครั้ง');
        return text;
      }

      // 429 = rate limit → retry หลังรอ
      if (response.status === 429 && rateAttempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[rateAttempt];
        console.warn(`[ThaiLLM] 429 rate limit — รอ ${delay / 1000}s แล้ว retry (${rateAttempt + 1}/${RETRY_DELAYS.length})`);
        await sleep(delay);
        await _acquireToken();
        rateAttempt += 1;
        continue;
      }

      // 🆕 400/422 + "too large" → parse actual input tokens จาก error + retry กับ max_tokens ที่คำนวณจริง
      if ((response.status === 400 || response.status === 422) && !contextRetried) {
        const errText = await response.clone().text();
        const match = errText.match(/maximum context length is (\d+).*?has (\d+) input tokens/);
        if (match) {
          const ctxLimit = parseInt(match[1], 10);
          const actualInput = parseInt(match[2], 10);
          const adjustedMax = ctxLimit - actualInput - 200;
          if (adjustedMax >= 512) {
            console.warn(`[ThaiLLM] context overflow → retry max_tokens=${adjustedMax} (input=${actualInput}, ctx=${ctxLimit})`);
            maxOutputTokens = adjustedMax;
            contextRetried = true;
            continue;
          }
          // ถ้าเหลือพื้นที่ output < 512 → fail + signal fallback
          throw new Error(
            `Input (${actualInput} tokens) เกือบเต็ม context ของ ThaiLLM (${ctxLimit}) — เหลือพื้นที่ output แค่ ${ctxLimit - actualInput} tokens\n` +
            `💡 ใหญ่เกินสำหรับ ThaiLLM — ระบบจะ fallback ไป provider ที่ context ใหญ่กว่า`
          );
        }
      }

      // อื่นๆ → throw แบบ provider เดิม
      throw await this._parseErrorResponse(response);
    }
  }

  // Override _friendlyMessage ให้เหมาะกับ ThaiLLM (ไม่ใช่ Google AI Studio)
  _friendlyMessage(status, detail) {
    const d = detail ? `\n(${detail})` : '';
    if (status === 401 || status === 403) {
      // ThaiLLM 403 อาจเป็น quota exhausted ก็ได้
      if (/quota|limit|exhausted/i.test(detail || '')) {
        return '⚠️ ThaiLLM quota หมด — กรุณาขอ key ใหม่จาก thaillm.or.th' + d;
      }
      return 'API Key ไม่ถูกต้องหรือหมดอายุ — กรุณาตรวจสอบ API Key ของ ThaiLLM' + d;
    }
    if (status === 429) {
      return '⚠️ ThaiLLM rate limit (5 req/วินาที) — รอสักครู่แล้วลองใหม่\n' +
             'หากเจอบ่อย: ลองลดความถี่การกด หรือใช้ Provider อื่นชั่วคราว' + d;
    }
    if (status === 400 && /too large|context/i.test(detail || '')) {
      return '⚠️ Input ใหญ่เกิน context ของ ThaiLLM (16K tokens) — Module นี้ต้องใช้ provider ที่ context ใหญ่กว่า' + d;
    }
    if (status === 404) return 'โมเดล ThaiLLM ไม่พร้อมใช้งาน' + d;
    if (status >= 500) return 'เซิร์ฟเวอร์ ThaiLLM มีปัญหาชั่วคราว — ลองใหม่ภายหลัง' + d;
    if (detail) return detail;
    return `เกิดข้อผิดพลาด (${status})` + d;
  }
}
