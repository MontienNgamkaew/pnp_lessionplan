import { BaseProvider } from './BaseProvider';

/**
 * ThaiLLMAdminProvider — virtual provider ที่ใช้ admin key (เก็บใน CF Worker KV)
 *
 * Differences vs ThaiLLMProvider:
 *   - ไม่ต้องใช้ user API key — Worker จัดให้
 *   - Endpoint: /admin/api/v1/chat/completions (ไม่ใช่ /api/v1/...)
 *   - Worker ดึง admin key จาก KV → ใส่ Authorization header แทน
 *
 * ใช้เป็น fallback chain เท่านั้น (ไม่ register ใน providers/index.js ให้ user เลือกตรง)
 * เรียกโดย useAiApi เมื่อ provider หลักหมด quota
 */

const MODEL_CHAIN = ['openthaigpt', 'pathumma', 'typhoon', 'thalle'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROXY_BASE = import.meta.env?.VITE_THAILLM_PROXY_URL || '';
const ADMIN_ENDPOINT = PROXY_BASE
  ? `${PROXY_BASE.replace(/\/$/, '')}/admin/api/v1/chat/completions`
  : '';

// Shared rate limiter — same bucket as user ThaiLLM (กัน account-wide rate limit)
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
  while (true) {
    _refill();
    if (_bucket.tokens >= 1) {
      _bucket.tokens -= 1;
      return;
    }
    const waitMs = Math.min(Math.ceil(((1 - _bucket.tokens) / _bucket.refillPerSec) * 1000), 250);
    await sleep(waitMs);
  }
}

export class ThaiLLMAdminProvider extends BaseProvider {
  constructor() {
    super('admin'); // dummy key — ไม่ใช้จริง
    this.baseUrl = ADMIN_ENDPOINT;
    this.models = [...MODEL_CHAIN];
    this.model = this.models[0];
  }

  static get displayName() { return 'ThaiLLM (Admin Fallback)'; }
  static get providerId() { return 'thaillm-admin'; }

  async sendMessage(systemPrompt, contents = [], options = {}) {
    if (!this.baseUrl) {
      throw new Error('VITE_THAILLM_PROXY_URL ยังไม่ได้ตั้งค่าใน Render → ไม่สามารถใช้ admin fallback');
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    const textParts = [];
    for (const content of contents) {
      if (content.type === 'text') textParts.push(content.data);
      else if (content.type === 'word') textParts.push(content.data);
      else if (content.type === 'pdf' && content.extractedText) textParts.push(content.extractedText);
    }
    if (textParts.length === 0) textParts.push('Please process the instruction above.');
    messages.push({ role: 'user', content: textParts.join('\n\n') });

    // ── Fallback chain ผ่านโมเดล ──
    let lastError = null;
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      try {
        const result = await this._callOneModel(model, messages, options);
        if (i > 0) console.log(`[ThaiLLM Admin] ✅ Fallback success — used "${model}"`);
        return result;
      } catch (err) {
        lastError = err;
        const status = err.status || 0;
        if (status === 401 || status === 403) {
          // 401/403 = admin key invalid/quota หมด → ลอง model อื่นไม่ช่วย, throw เลย
          throw err;
        }
        if (i < this.models.length - 1) await sleep(500);
      }
    }
    throw lastError || new Error('ThaiLLM Admin: ทุกโมเดลใช้ไม่ได้');
  }

  async _callOneModel(model, messages, options) {
    // ── 🧮 Dynamic max_tokens — Thai sentencepiece: chars/2 (เซฟกว่า /3) ──
    const inputChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const estInputTokens = Math.ceil(inputChars / 2);
    const CONTEXT_LIMIT = 16384;
    const SAFETY_MARGIN = 500;
    let maxOutputTokens = Math.min(
      8192,
      Math.max(512, CONTEXT_LIMIT - estInputTokens - SAFETY_MARGIN)
    );

    if (estInputTokens > CONTEXT_LIMIT - 1000) {
      throw new Error(
        `Input ใหญ่เกิน context ของ ThaiLLM admin (ประมาณ ${estInputTokens} > ${CONTEXT_LIMIT - 1000} tokens)\n` +
        `💡 Module นี้ใหญ่เกินสำหรับ ThaiLLM 8B — ระบบ fallback ไป provider ใหญ่กว่า`
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('AI ไม่ส่งข้อมูลกลับมา');
        return text;
      }

      if (response.status === 429 && rateAttempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[rateAttempt]);
        await _acquireToken();
        rateAttempt += 1;
        continue;
      }

      // 🆕 Retry with adjusted max_tokens เมื่อเจอ context overflow
      if ((response.status === 400 || response.status === 422) && !contextRetried) {
        const errText = await response.clone().text();
        const match = errText.match(/maximum context length is (\d+).*?has (\d+) input tokens/);
        if (match) {
          const ctxLimit = parseInt(match[1], 10);
          const actualInput = parseInt(match[2], 10);
          const adjustedMax = ctxLimit - actualInput - 200;
          if (adjustedMax >= 512) {
            console.warn(`[ThaiLLM Admin] context overflow → retry max_tokens=${adjustedMax}`);
            maxOutputTokens = adjustedMax;
            contextRetried = true;
            continue;
          }
          throw new Error(
            `Input (${actualInput}) เกือบเต็ม context ของ ThaiLLM Admin — เหลือ output แค่ ${ctxLimit - actualInput} tokens\n` +
            `💡 Module นี้ใหญ่เกิน ThaiLLM — ระบบจะ fallback ไป provider ใหญ่กว่า`
          );
        }
      }

      throw await this._parseErrorResponse(response);
    }
  }
}
