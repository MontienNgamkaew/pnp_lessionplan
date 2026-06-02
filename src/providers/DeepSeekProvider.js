import { BaseProvider } from './BaseProvider';

export class DeepSeekProvider extends BaseProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = 'https://api.deepseek.com/v1/chat/completions';
    this.model = 'deepseek-chat';
  }

  static get displayName() { return 'DeepSeek'; }
  static get providerId() { return 'deepseek'; }
  static get apiKeyPlaceholder() { return 'sk-...'; }
  static get apiKeyHelpUrl() { return 'https://platform.deepseek.com/api_keys'; }
  static get apiKeyHelpText() { return 'ขอรับ API Key จาก DeepSeek Platform'; }

  async checkHealth() {
    if (!this.apiKey) return { ok: false, status: 0, message: 'No API key' };
    try {
      const res = await fetch('https://api.deepseek.com/v1/models', {
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

    const userParts = [];
    for (const content of contents) {
      if (content.type === 'text') {
        userParts.push({ type: 'text', text: content.data });
      } else if (content.type === 'image') {
        userParts.push({ type: 'image_url', image_url: { url: content.data, detail: 'high' } });
      } else if (content.type === 'pdf') {
        userParts.push({ type: 'text', text: '[PDF Document Attached]' });
        if (content.extractedText) userParts.push({ type: 'text', text: content.extractedText });
      } else if (content.type === 'word') {
        userParts.push({ type: 'text', text: content.data });
      }
    }
    if (userParts.length === 0) userParts.push({ type: 'text', text: 'Please process the instruction above.' });

    messages.push({ role: 'user', content: userParts });

    const payload = { model: this.model, messages, max_tokens: 16000 };
    if (options.requireJson) payload.response_format = { type: 'json_object' };

    return this.withRetry(async () => {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw await this._parseErrorResponse(response);
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('AI ไม่ส่งข้อมูลกลับมา กรุณาลองใหม่อีกครั้ง');
      return text;
    });
  }
}
