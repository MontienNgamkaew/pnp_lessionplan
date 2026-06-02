import React, { useState, useEffect, useCallback } from 'react';
import { Youtube, Scissors, CheckCircle, XCircle, Loader2, AlertTriangle, FolderDown } from 'lucide-react';
import { createProvider } from '../../providers';

const STATUS = {
  unchecked: { label: 'ยังไม่ได้ตั้งค่า', color: 'bg-gray-100 border-gray-300 text-gray-600', icon: AlertTriangle, iconColor: 'text-gray-400' },
  checking: { label: 'กำลังตรวจสอบ...', color: 'bg-yellow-50 border-yellow-300 text-yellow-700', icon: Loader2, iconColor: 'text-yellow-500', spin: true },
  ok: { label: 'พร้อมใช้งาน', color: 'bg-green-50 border-green-300 text-green-700', icon: CheckCircle, iconColor: 'text-green-500' },
  quota: { label: 'โควต้าเต็ม', color: 'bg-amber-50 border-amber-300 text-amber-700', icon: AlertTriangle, iconColor: 'text-amber-500' },
  rate_limit: { label: 'Rate Limit', color: 'bg-amber-50 border-amber-300 text-amber-700', icon: AlertTriangle, iconColor: 'text-amber-500' },
  error: { label: 'ใช้งานไม่ได้', color: 'bg-red-50 border-red-300 text-red-700', icon: XCircle, iconColor: 'text-red-500' },
};

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 นาที
const HEALTH_RETRY_INTERVAL_MS = 30 * 1000;     // 30 วินาที (ถ้า error)

const TopToolsBar = ({ onOpenPdfTool, onOpenApiKeyModal, providerName, providerId, apiKey, onExportAll, exportAllLoading }) => {
  const [status, setStatus] = useState('unchecked');
  const [errorDetail, setErrorDetail] = useState('');

  // ── Health check ─────────────────────────────────────────────
  const runHealthCheck = useCallback(async () => {
    if (!apiKey || !providerId) {
      setStatus('unchecked');
      setErrorDetail('');
      return;
    }
    setStatus('checking');
    try {
      const provider = createProvider(providerId, apiKey);
      const result = await provider.checkHealth();
      if (result.ok) {
        setStatus('ok');
        setErrorDetail('');
      } else {
        const st = result.status;
        if (st === 401 || st === 403) setStatus('quota');
        else if (st === 429) setStatus('rate_limit');
        else setStatus('error');
        setErrorDetail(result.message || `HTTP ${st}`);
      }
    } catch (err) {
      setStatus('error');
      setErrorDetail(err.message);
    }
  }, [providerId, apiKey]);

  // Initial check
  useEffect(() => {
    if (!apiKey || !providerId) {
      setStatus('unchecked');
      setErrorDetail('');
      return;
    }
    runHealthCheck();
  }, [providerId, apiKey, runHealthCheck]);

  // Auto re-check
  useEffect(() => {
    if (!apiKey || !providerId) return;
    const interval = (status === 'ok' ? HEALTH_CHECK_INTERVAL_MS : HEALTH_RETRY_INTERVAL_MS);
    const id = setInterval(runHealthCheck, interval);
    return () => clearInterval(id);
  }, [status, apiKey, providerId, runHealthCheck]);

  const s = STATUS[status] || STATUS.unchecked;
  const Icon = s.icon;

  return (
    <div className="flex justify-end mb-4 gap-3 flex-wrap">
      {/* API Status Badge — คลิกเปิด ApiKeyModal ตรงๆ */}
      <button
        onClick={onOpenApiKeyModal}
        title={errorDetail ? `${s.label}\n${errorDetail}\n\n(คลิกเพื่อตั้งค่า / เปลี่ยน API Key)` : `${s.label}\n\n(คลิกเพื่อตั้งค่า / เปลี่ยน API Key)`}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-1.5 border hover:opacity-80 ${s.color}`}
      >
        <Icon size={14} className={`${s.iconColor} ${s.spin ? 'animate-spin' : ''}`} />
        {providerName || 'AI'}: {s.label}
      </button>

      <a
        href="https://youtu.be/FjoTMFQMmnI"
        target="_blank"
        rel="noopener noreferrer"
        className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-3 py-2 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-1.5 no-underline"
      >
        <Youtube size={16} className="text-red-500" /> ดูวิธีใช้งาน
      </a>
      <button
        onClick={onOpenPdfTool}
        className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-3 py-2 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-1.5"
      >
        <Scissors size={14} className="text-pink-500" /> เครื่องมือตัด PDF
      </button>
      {onExportAll && (
        <button
          onClick={onExportAll}
          disabled={exportAllLoading}
          className="bg-white hover:bg-green-50 text-green-700 border border-green-300 px-3 py-2 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {exportAllLoading ? <Loader2 size={14} className="animate-spin" /> : <FolderDown size={14} />}
          {exportAllLoading ? 'กำลังสร้าง...' : 'Export ทั้งหมด (.zip)'}
        </button>
      )}
    </div>
  );
};

export default TopToolsBar;
