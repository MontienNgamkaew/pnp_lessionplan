import React from 'react';

const PROVIDER_BADGES = {
  gemini: {
    label: 'G',
    name: 'Google Gemini',
    className: 'from-blue-500 to-cyan-400 text-white',
  },
  openai: {
    label: 'AI',
    name: 'OpenAI',
    className: 'from-slate-900 to-slate-600 text-white',
  },
  claude: {
    label: 'C',
    name: 'Anthropic Claude',
    className: 'from-orange-500 to-amber-400 text-white',
  },
  deepseek: {
    label: 'DS',
    name: 'DeepSeek',
    className: 'from-blue-700 to-indigo-500 text-white',
  },
  openrouter: {
    label: 'OR',
    name: 'OpenRouter',
    className: 'from-violet-600 to-sky-500 text-white',
  },
  thaillm: {
    label: 'TH',
    name: 'ThaiLLM',
    className: 'from-emerald-600 to-teal-400 text-white',
  },
  'thaillm-admin': {
    label: 'TH',
    name: 'ThaiLLM',
    className: 'from-emerald-700 to-blue-600 text-white',
  },
};

const SIZE_CLASS = {
  sm: 'h-8 w-8 text-[11px] rounded-lg',
  md: 'h-10 w-10 text-xs rounded-xl',
  lg: 'h-12 w-12 text-sm rounded-xl',
};

const ProviderBadge = ({ providerId, size = 'md', className = '' }) => {
  const badge = PROVIDER_BADGES[providerId] || {
    label: 'AI',
    name: 'AI Provider',
    className: 'from-blue-700 to-sky-500 text-white',
  };

  return (
    <span
      className={`${SIZE_CLASS[size] || SIZE_CLASS.md} inline-flex shrink-0 items-center justify-center bg-gradient-to-br font-black shadow-sm ring-1 ring-white/60 ${badge.className} ${className}`}
      title={badge.name}
      aria-label={badge.name}
    >
      {badge.label}
    </span>
  );
};

export default ProviderBadge;
