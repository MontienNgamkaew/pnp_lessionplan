import React, { useState, useEffect } from 'react';
import { X, Key, ExternalLink, Eye, EyeOff, ShieldCheck, Scale } from 'lucide-react';
import { getAvailableProviders } from '../../providers/index';
import { getStoredApiKey as getKeyForProvider } from '../../hooks/useAiApi';
import { getLoadBalanceMode, setLoadBalanceMode, LOAD_BALANCE_THRESHOLD } from '../../utils/loadBalancer';
import ProviderBadge from '../common/ProviderBadge';

const PROVIDERS = getAvailableProviders();

const ApiKeyModal = ({ isOpen, onClose, onSave, currentProvider, currentKey }) => {
  const [selectedProvider, setSelectedProvider] = useState(currentProvider || 'gemini');
  const [inputKey, setInputKey] = useState(currentKey || '');
  const [showKey, setShowKey] = useState(false);
  const [lbMode, setLbMode] = useState(() => getLoadBalanceMode());

  const meta = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];

  useEffect(() => {
    setInputKey(getKeyForProvider(selectedProvider) || '');
  }, [selectedProvider]);

  useEffect(() => {
    if (isOpen) {
      setSelectedProvider(currentProvider || 'gemini');
      setInputKey(currentKey || '');
      setLbMode(getLoadBalanceMode());
    }
  }, [isOpen, currentProvider, currentKey]);

  const handleLbChange = (mode) => {
    setLbMode(mode);
    setLoadBalanceMode(mode);
  };

  if (!isOpen) return null;

  const handleSave = () => {
    if (!inputKey.trim()) return;
    onSave(selectedProvider, inputKey.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 z-[70] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="pnp-shell-card rounded-xl w-full max-w-md my-3 sm:my-0 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2rem)] flex flex-col relative">
        <button onClick={onClose} className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-gray-600 z-10">
          <X size={24} />
        </button>

        <div className="flex items-center gap-3 p-5 sm:p-6 pb-3 sm:pb-4 pr-12 shrink-0 border-b border-gray-100">
          <div className="bg-blue-100 p-3 rounded-full">
            <Key className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">ตั้งค่า AI Provider</h3>
            <p className="text-xs text-gray-500">เลือกค่ายและใส่ API Key ของท่าน</p>
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 sm:px-6 py-4 sm:py-5">
          {/* Provider selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">เลือก AI Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProvider(p.id)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-all flex items-center gap-2 text-left ${
                    selectedProvider === p.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <ProviderBadge providerId={p.id} size="sm" />
                  <span className="min-w-0 leading-tight">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Help link */}
          <div className="bg-blue-50 p-3 sm:p-4 rounded-xl border border-blue-200 text-sm text-blue-800">
            <p className="font-bold mb-1">{meta.helpText}</p>
            {meta.helpUrl && (
              <a
                href={meta.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-blue-600 hover:text-blue-800 font-medium underline"
              >
                <ExternalLink size={14} /> เปิดหน้าขอ API Key
              </a>
            )}
          </div>

          {/* API Key input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{meta.name} API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder={meta.placeholder}
                className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            <ShieldCheck size={16} className="flex-shrink-0 mt-0.5 text-green-500" />
            <p>API Key จะถูกเก็บไว้ในเบราว์เซอร์ของคุณเท่านั้น (localStorage)</p>
          </div>

          {/* ⚖️ Load Balance Mode */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <label className="flex items-center gap-1.5 text-sm font-medium text-purple-900 mb-2">
              <Scale size={14} /> Load Balance Mode
            </label>
            <select
              value={lbMode}
              onChange={(e) => handleLbChange(e.target.value)}
              className="w-full bg-white border border-purple-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="off">Off — ใช้ provider หลักเสมอ (default)</option>
              <option value="smart">Smart Auto-Switch — สลับเมื่อใกล้หมด</option>
            </select>
            <p className="text-[11px] text-purple-700 mt-1.5 leading-snug">
              {lbMode === 'smart'
                ? `✅ ระบบจะใช้ ${meta.name} เป็นหลัก — ถ้าถึง ${LOAD_BALANCE_THRESHOLD} calls/วัน → สลับไป provider ที่ใช้น้อยกว่าอัตโนมัติ (ใส่ key หลาย provider เพื่อให้มี fallback)`
                : '💡 เปิดเพื่อกระจาย load ข้าม provider เมื่อ quota ใกล้หมด — ป้องกัน rate limit'}
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={!inputKey.trim()}
            className="pnp-action-primary py-3 font-semibold disabled:opacity-50"
          >
            บันทึกและใช้งาน {meta.name}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
