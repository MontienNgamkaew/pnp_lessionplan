import { BaseProvider } from './BaseProvider';

export class ClaudeProvider extends BaseProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = 'https://api.anthropic.com/v1/messages';
    this.model = 'claude-sonnet-4-20250514';
  }

  static get displayName() { return 'Anthropic Claude'; }
  static get providerId() { return 'claude'; }
  static get apiKeyPlaceholder() { return 'sk-ant-...'; }
  static get apiKeyHelpUrl() { return 'https://console.anthropic.com/settings/keys'; }
  static get apiKeyHelpText() { return 'ขอรับ API Key จาก Anthropic Console'; }

  async sendMessage(systemPrompt, contents = [], options = {}) {
    const userContent = [];
    for (const content of contents) {
      if (content.type === 'text') {
        userContent.push({ type: 'text', text: content.data });
      } else if (content.type === 'image') {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: content.mimeType || 'image/jpeg', data: this.fileToBase64(content.data) },
        });
      } else if (content.type === 'pdf') {
        userContent.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: this.fileToBase64(content.data) },
        });
      } else if (content.type === 'word') {
        userContent.push({ type: 'text', text: content.data });
      }
    }
    if (userContent.length === 0) userContent.push({ type: 'text', text: 'Please process the instruction.' });

    const payload = { model: this.model, max_tokens: 8192, messages: [{ role: 'user', content: userContent }] };
    if (systemPrompt) payload.system = systemPrompt;

    return this.withRetry(async () => {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw await this._parseErrorResponse(response);
      const data = await response.json();
      const text = data.content?.find((b) => b.type === 'text')?.text;
      if (!text) throw new Error('AI ไม่ส่งข้อมูลกลับมา กรุณาลองใหม่อีกครั้ง');
      return text;
    });
  }
}
