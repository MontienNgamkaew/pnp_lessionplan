/**
 * BaseProvider — Abstract AI Provider Interface
 */
export class BaseProvider {
  constructor(apiKey) {
    if (new.target === BaseProvider) {
      throw new Error('BaseProvider is abstract and cannot be instantiated directly.');
    }
    this.apiKey = apiKey;
    this.maxRetries = 5;
  }

  static get displayName() { throw new Error('Not implemented'); }
  static get providerId() { throw new Error('Not implemented'); }
  static get apiKeyPlaceholder() { return 'Enter your API key...'; }
  static get apiKeyHelpUrl() { return '#'; }
  static get apiKeyHelpText() { return 'Get your API key from the provider\'s website'; }

  async sendMessage(systemPrompt, contents = [], options = {}) {
    throw new Error('sendMessage() must be implemented by subclass');
  }

  /**
   * Health check — verify ว่า API key ใช้ได้ไหม (ใช้ /models endpoint ถ้ามี)
   * Returns: { ok: boolean, status?: number, message?: string }
   *
   * Default: optimistic (ถือว่า ok ถ้ามี key) — subclass ควร override ถ้ามี endpoint ตรวจได้
   */
  async checkHealth() {
    if (!this.apiKey) return { ok: false, status: 0, message: 'No API key' };
    return { ok: true }; // optimistic default
  }

  /**
   * Retry with exponential backoff.
   * 429: wait 10-60s; 5xx: wait 2-16s; 4xx(not 429): fail immediately
   */
  async withRetry(fn) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const status = err.status || 0;

        if (status >= 400 && status < 500 && status !== 429) {
          throw err;
        }

        if (attempt >= this.maxRetries) break;

        if (status === 429) {
          const delays = [10000, 20000, 30000, 45000, 60000];
          const delay = delays[Math.min(attempt, delays.length - 1)];
          console.log(`[AI] Rate limit — รอ ${delay / 1000}s ก่อน retry ${attempt + 1}/${this.maxRetries}...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        const delays = [2000, 4000, 8000, 12000, 16000];
        const delay = delays[Math.min(attempt, delays.length - 1)];
        console.log(`[AI] Error ${status || 'network'} — รอ ${delay / 1000}s ก่อน retry...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  fileToBase64(dataUrl) {
    return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  }

  /**
   * Read error body from API response and create a friendly error
   */
  async _parseErrorResponse(response) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message || body?.message || '';
    } catch { /* ignore */ }

    const msg = this._friendlyMessage(response.status, detail);
    const err = new Error(msg);
    err.status = response.status;
    err.detail = detail;
    return err;
  }

  /**
   * Convert HTTP status to Thai-friendly message
   */
  _friendlyMessage(status, detail) {
    const d = detail ? `\n(${detail})` : '';
    if (status === 401 || status === 403) return 'API Key ไม่ถูกต้องหรือหมดอายุ — กรุณาตรวจสอบ API Key' + d;
    if (status === 429) {
      return '⚠️ Rate limit / Quota เต็ม — ลองอีกครั้งใน 30 วินาที หรือเปลี่ยน Provider' + d;
    }
    if (status === 404) return 'โมเดล AI ไม่พร้อมใช้งาน' + d;
    if (status >= 500) return 'เซิร์ฟเวอร์ AI มีปัญหาชั่วคราว' + d;
    if (detail) return detail;
    return `เกิดข้อผิดพลาด (${status})` + d;
  }
}
