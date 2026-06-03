import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle, FolderDown, Loader2, Scissors, Settings2,
  ShieldAlert, Video, XCircle,
} from 'lucide-react';
import { createProvider } from '../../providers';
import ProviderBadge from '../common/ProviderBadge';

const STATUS = {
  unchecked: { label: 'ยังไม่ได้ตั้งค่า', color: 'border-slate-200 bg-white text-slate-600', dot: 'bg-slate-300', icon: ShieldAlert },
  checking: { label: 'กำลังตรวจสอบ...', color: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-400', icon: Loader2, spin: true },
  ok: { label: 'พร้อมใช้งาน', color: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle },
  quota: { label: 'โควต้าเต็ม', color: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500', icon: AlertTriangle },
  rate_limit: { label: 'Rate Limit', color: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500', icon: AlertTriangle },
  error: { label: 'ใช้งานไม่ได้', color: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500', icon: XCircle },
};

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const HEALTH_RETRY_INTERVAL_MS = 30 * 1000;

const ToolButton = ({ children, className = '', ...props }) => (
  <button
    {...props}
    className={`h-10 rounded-lg px-3 text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    {children}
  </button>
);

const TopToolsBar = ({ onOpenPdfTool, onOpenApiKeyModal, providerName, providerId, apiKey, onExportAll, exportAllLoading, embedded = false }) => {
  const [status, setStatus] = useState('unchecked');
  const [errorDetail, setErrorDetail] = useState('');

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

  useEffect(() => {
    if (!apiKey || !providerId) {
      setStatus('unchecked');
      setErrorDetail('');
      return;
    }
    runHealthCheck();
  }, [providerId, apiKey, runHealthCheck]);

  useEffect(() => {
    if (!apiKey || !providerId) return;
    const interval = status === 'ok' ? HEALTH_CHECK_INTERVAL_MS : HEALTH_RETRY_INTERVAL_MS;
    const id = setInterval(runHealthCheck, interval);
    return () => clearInterval(id);
  }, [status, apiKey, providerId, runHealthCheck]);

  const s = STATUS[status] || STATUS.unchecked;
  const Icon = s.icon;
  const wrapperClass = embedded
    ? 'w-full xl:flex-1 xl:min-w-0'
    : 'pnp-shell-card rounded-xl mb-4 px-3 sm:px-4 py-3';
  const innerClass = embedded
    ? 'flex flex-col 2xl:flex-row 2xl:items-center gap-3 justify-end'
    : 'flex flex-col xl:flex-row xl:items-center gap-3 justify-between';
  const centerClass = embedded
    ? 'flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm'
    : 'flex min-w-0 items-center gap-3';

  return (
    <div className={wrapperClass}>
      <div className={innerClass}>
        <div className={centerClass}>
          <ProviderBadge providerId={providerId} size={embedded ? 'md' : 'lg'} />
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Command Center</div>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
              <span className="font-semibold text-slate-900 truncate">{providerName || 'AI Provider'}</span>
              <span className="text-slate-400">/</span>
              <span className="whitespace-nowrap">{s.label}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <button
            onClick={onOpenApiKeyModal}
            title={errorDetail ? `${s.label}\n${errorDetail}\n\n(คลิกเพื่อตั้งค่า / เปลี่ยน API Key)` : `${s.label}\n\n(คลิกเพื่อตั้งค่า / เปลี่ยน API Key)`}
            className={`h-10 rounded-lg px-3 text-sm font-semibold transition flex items-center gap-2 border ${s.color} hover:brightness-[0.98]`}
          >
            <Icon size={15} className={s.spin ? 'animate-spin' : ''} />
            ตั้งค่า AI
          </button>

          <a
            href="https://youtu.be/FjoTMFQMmnI"
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 rounded-lg px-3 text-sm font-semibold transition flex items-center gap-2 pnp-btn-secondary no-underline"
          >
            <Video size={15} className="text-red-500" /> วิธีใช้งาน
          </a>

          <ToolButton onClick={onOpenPdfTool} className="pnp-btn-secondary">
            <Scissors size={15} className="text-sky-600" /> ตัด PDF
          </ToolButton>

          {onExportAll && (
            <ToolButton onClick={onExportAll} disabled={exportAllLoading} className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              {exportAllLoading ? <Loader2 size={15} className="animate-spin" /> : <FolderDown size={15} />}
              {exportAllLoading ? 'กำลังสร้าง...' : 'Export ZIP'}
            </ToolButton>
          )}

          <ToolButton onClick={onOpenApiKeyModal} className="pnp-btn-primary">
            <Settings2 size={15} /> Provider
          </ToolButton>
        </div>
      </div>
    </div>
  );
};

export default TopToolsBar;
