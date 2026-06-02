import { BaseProvider } from './BaseProvider';

/**
 * Gemini Provider — รองรับ multi-key rotation
 *
 * 🔑 Multi-key rotation: User สามารถใส่ keys หลายตัวคั่นด้วย comma
 *   "AIzaSy_key1, AIzaSy_key2, AIzaSy_key3"
 *   → ระบบหมุนเวียน round-robin
 *   → ถ้า key ตัวไหน 429 หรือ quota หมด (403) → mark cooldown 10 นาที
 *   → ลอง key ถัดไป โดยที่ user ไม่ต้องทำอะไร
 *
 * 🔁 Model fallback: ถ้า server error (503/500/404) → ลอง model สำรอง
 *
 * 💡 ขยาย quota: Gemini free tier ให้ 1500 req/day ต่อ project
 *    → ใส่ keys จาก 3 projects = 4500 req/day
 */

const COOLDOWN_MS = 10 * 60 * 1000; // 10 นาที

export class GeminiProvider extends BaseProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.model = 'gemini-2.5-flash';
    this.fallbackModels = ['gemini-2.5-flash-lite', 'gemini-2.5-pro'];

    // ── Multi-key rotation state ──────────────────────────────
    this.keys = (apiKey || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    this.currentKeyIdx = 0;
    this.keyCooldown = new Map(); // key string → cooldownUntilTimestamp
  }

  static get displayName() { return 'Google Gemini'; }
  static get providerId() { return 'gemini'; }
  static get apiKeyPlaceholder() { return 'AIzaSy... (ใส่หลาย keys คั่นด้วย , เพื่อขยาย quota)'; }
  static get apiKeyHelpUrl() { return 'https://aistudio.google.com/app/apikey'; }
  static get apiKeyHelpText() {
    return 'ขอรับ API Key ฟรีจาก Google AI Studio — ใส่หลาย keys คั่นด้วย , เพื่อขยาย quota (เช่น key1,key2,key3)';
  }

  // Override _friendlyMessage — Gemini-specific 429 tip (สร้าง project ใหม่)
  _friendlyMessage(status, detail) {
    const d = detail ? `\n(${detail})` : '';
    if (status === 429) {
      return '⚠️ Gemini quota หมด — มี 3 ทางเลือก:\n' +
             '  1. ใส่หลาย keys คั่นด้วย "," เพื่อขยาย quota (สร้าง keys ใน "Create API key in new project")\n' +
             '  2. รอ ~1 ชั่วโมง quota จะ reset\n' +
             '  3. ใส่ OpenRouter key (ฟรี — มี Gemini Flash 1M context)' + d;
    }
    if (status === 401 || status === 403) {
      return 'Gemini API Key ไม่ถูกต้อง — ตรวจสอบที่ https://aistudio.google.com/app/apikey' + d;
    }
    return super._friendlyMessage(status, detail);
  }

  async checkHealth() {
    if (this.keys.length === 0) return { ok: false, status: 0, message: 'No API key' };
    // ลอง key แรกที่ยังไม่ cooldown
    const next = this._nextActiveKey();
    if (!next) return { ok: false, status: 429, message: 'ทุก key cooldown' };
    try {
      const url = `${this.baseUrl}?key=${next.key}`;
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return { ok: true, status: res.status, activeKeys: this.keys.length };
      const txt = await res.text();
      return { ok: false, status: res.status, message: txt.slice(0, 200) };
    } catch (err) {
      return { ok: false, status: 0, message: err.message };
    }
  }

  // ── Helper: หา key ถัดไปที่ยังไม่ cooldown ─────────────────
  _nextActiveKey() {
    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentKeyIdx + i) % this.keys.length;
      const key = this.keys[idx];
      const cooldownUntil = this.keyCooldown.get(key) || 0;
      if (cooldownUntil <= now) {
        // เปลี่ยน pointer ไป key ถัดไป (round-robin)
        this.currentKeyIdx = (idx + 1) % this.keys.length;
        return { key, idx };
      }
    }
    return null; // ทุก key cooldown
  }

  _markCooldown(key, ms = COOLDOWN_MS) {
    this.keyCooldown.set(key, Date.now() + ms);
    const mins = Math.ceil(ms / 60000);
    console.log(`[Gemini] Key ${key.slice(0, 12)}... → cooldown ${mins} นาที`);
  }

  // ── สรุปสถานะ keys (เผื่อแสดงใน error) ──────────────────
  _keyStatusSummary() {
    const now = Date.now();
    const active = this.keys.filter((k) => (this.keyCooldown.get(k) || 0) <= now).length;
    return `${active}/${this.keys.length} key(s) พร้อมใช้`;
  }

  async sendMessage(systemPrompt, contents = [], options = {}) {
    if (this.keys.length === 0) {
      throw new Error('กรุณาใส่ Gemini API Key ใน "ตั้งค่า AI"');
    }

    const userParts = [];
    for (const content of contents) {
      if (content.type === 'text') {
        userParts.push({ text: content.data });
      } else if (content.type === 'image') {
        userParts.push({ inlineData: { mimeType: content.mimeType || 'image/jpeg', data: this.fileToBase64(content.data) } });
      } else if (content.type === 'pdf') {
        userParts.push({ inlineData: { mimeType: 'application/pdf', data: this.fileToBase64(content.data) } });
      } else if (content.type === 'word') {
        userParts.push({ text: `\n\n--- Document Content ---\n${content.data}` });
      }
    }
    if (userParts.length === 0) userParts.push({ text: 'Please process the instruction above.' });

    const payload = {
      contents: [{ role: 'user', parts: userParts }],
    };
    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    if (options.requireJson) {
      payload.generationConfig = { responseMimeType: 'application/json' };
    }

    // ── Key rotation loop ───────────────────────────────────
    // ลองทุก key (ที่ยังไม่ cooldown) ก่อน throw error
    let lastError = null;
    const triedKeys = new Set();

    while (triedKeys.size < this.keys.length) {
      const next = this._nextActiveKey();
      if (!next) break; // ทุก key cooldown

      const { key, idx } = next;
      if (triedKeys.has(key)) break; // วนครบรอบแล้ว
      triedKeys.add(key);

      try {
        const result = await this._callWithKey(key, payload);
        if (this.keys.length > 1) {
          console.log(`[Gemini] ✅ ใช้ key #${idx + 1}/${this.keys.length}`);
        }
        return result;
      } catch (err) {
        const status = err.status || 0;
        lastError = err;

        // 429 (rate limit) หรือ 403 (quota exhausted) → cooldown + ลอง key ถัดไป
        if (status === 429 || status === 403) {
          // 429 = rate limit ระยะสั้น → cooldown สั้น (1 นาที)
          // 403 = quota หมด → cooldown ยาว (10 นาที)
          const cooldownMs = status === 429 ? 60 * 1000 : COOLDOWN_MS;
          this._markCooldown(key, cooldownMs);
          console.warn(`[Gemini] Key #${idx + 1} ติด ${status} → ลอง key ถัดไป (${this._keyStatusSummary()})`);
          continue;
        }

        // 401 (key ผิด) → ไม่ลอง key อื่น (ทั้งหมดน่าจะผิดเหมือนกัน)
        if (status === 401) throw err;

        // 5xx (server error) → ลอง key ถัดไป (อาจเป็นปัญหา project นั้น)
        if (status >= 500) {
          console.warn(`[Gemini] Key #${idx + 1} server error ${status} → ลอง key ถัดไป`);
          continue;
        }

        // อื่นๆ → throw เลย
        throw err;
      }
    }

    // ── ทุก key หมด / cooldown ──────────────────────────────
    const summary = this._keyStatusSummary();
    if (this.keys.length > 1) {
      throw new Error(
        `Gemini: ทุก key (${this.keys.length} ตัว) ติด quota/rate limit แล้ว (${summary})\n` +
        `→ รอสักครู่ให้ cooldown ผ่อนคลาย หรือเพิ่ม key ใหม่ (สร้าง project ใหม่ที่ aistudio.google.com)\n` +
        `(${lastError?.message || 'unknown error'})`
      );
    }
    // กรณีมี key เดียว → throw error เดิม
    throw lastError || new Error('Gemini: API call ล้มเหลว');
  }

  // ── Single-key call พร้อม model fallback ─────────────────
  async _callWithKey(key, payload) {
    const modelsToTry = [this.model, ...this.fallbackModels];

    for (let i = 0; i < modelsToTry.length; i++) {
      const modelName = modelsToTry[i];
      const url = `${this.baseUrl}/${modelName}:generateContent?key=${key}`;

      try {
        // Only retry 1 time for 503 (switch model faster instead)
        const savedRetries = this.maxRetries;
        if (i < modelsToTry.length - 1) this.maxRetries = 1;

        const result = await this.withRetry(async () => {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw await this._parseErrorResponse(response);
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error('AI ไม่ส่งข้อมูลกลับมา กรุณาลองใหม่อีกครั้ง');
          if (i > 0) console.log(`[Gemini] ใช้โมเดลสำรอง: ${modelName}`);
          return text;
        });

        this.maxRetries = savedRetries;
        return result;
      } catch (err) {
        this.maxRetries = this.maxRetries || 5;
        const status = err.status || 0;

        // 503/500/404 → ลองโมเดลสำรอง
        if ((status >= 500 || status === 404) && i < modelsToTry.length - 1) {
          console.warn(`[Gemini] ${modelName} → ${status} — ลองโมเดลสำรอง ${modelsToTry[i + 1]}`);
          continue;
        }

        // 429/403/401 → throw ออกไปให้ key rotation จัดการ
        throw err;
      }
    }
  }
}
