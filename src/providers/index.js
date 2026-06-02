import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { DeepSeekProvider } from './DeepSeekProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { ThaiLLMProvider } from './ThaiLLMProvider';
import { ThaiLLMAdminProvider } from './ThaiLLMAdminProvider';

// ── User-selectable providers (โชว์ใน dropdown) ──
const PROVIDERS = [GeminiProvider, OpenAIProvider, ClaudeProvider, DeepSeekProvider, OpenRouterProvider, ThaiLLMProvider];

// ── Internal providers (ใช้ fallback อัตโนมัติ ไม่โชว์ใน dropdown) ──
const INTERNAL_PROVIDERS = [ThaiLLMAdminProvider];

const ALL_PROVIDERS = [...PROVIDERS, ...INTERNAL_PROVIDERS];

export const DEFAULT_PROVIDER = 'gemini';

export function getAvailableProviders() {
  return PROVIDERS.map((P) => ({
    id: P.providerId,
    name: P.displayName,
    placeholder: P.apiKeyPlaceholder,
    helpUrl: P.apiKeyHelpUrl,
    helpText: P.apiKeyHelpText,
  }));
}

export function createProvider(providerId, apiKey) {
  const ProviderClass = ALL_PROVIDERS.find((P) => P.providerId === providerId);
  if (!ProviderClass) throw new Error(`Unknown AI provider: ${providerId}`);
  // Internal providers (เช่น thaillm-admin) ไม่ต้องการ apiKey — constructor รับ () หรือ ('admin')
  return new ProviderClass(apiKey);
}

export function getProviderMeta(providerId) {
  const ProviderClass = PROVIDERS.find((P) => P.providerId === providerId);
  if (!ProviderClass) return null;
  return {
    id: ProviderClass.providerId,
    name: ProviderClass.displayName,
    placeholder: ProviderClass.apiKeyPlaceholder,
    helpUrl: ProviderClass.apiKeyHelpUrl,
    helpText: ProviderClass.apiKeyHelpText,
  };
}
