import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpenCheck, ChevronRight, Download, Eye, Facebook, Globe, Instagram,
  LockKeyhole, Save, ShieldCheck, Sparkles, Trash2, Upload, Youtube,
} from 'lucide-react';
import { MENU_ITEMS } from '../../constants/menuItems.jsx';
import { getUsageStats, fetchRealStats, trackVisit } from '../../utils/usageStats';
import { ADMIN_PASSWORD } from '../../constants/adminAuth';

const TikTokIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

const StatItem = ({ icon: Icon, label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
    <div className="flex items-center gap-2 text-slate-500">
      <Icon size={13} className="text-blue-600" />
      <span className="text-[11px] flex-1">{label}</span>
    </div>
    <div className="mt-1 text-sm font-bold text-slate-900">{Number(value || 0).toLocaleString()}</div>
  </div>
);

const Sidebar = ({ activeMenu, setActiveMenu, onMobileClose, moduleStatus, onExportProject, onImportProject, onSecretBatchTrigger, onOpenAdminPool }) => {
  const [stats, setStats] = useState({ totalVisits: 0, totalDownloads: 0, totalGenerations: 0 });
  const isLabMode = new URLSearchParams(window.location.search).has('lab');
  const importRef = useRef(null);
  const logoClickCountRef = useRef(0);
  const logoClickTimerRef = useRef(null);

  const handleAdminAccess = () => {
    const input = window.prompt('รหัสผ่าน Admin');
    if (input === null) return;
    if (input.trim() === ADMIN_PASSWORD) {
      onOpenAdminPool?.();
    } else if (input.trim() !== '') {
      alert('รหัสผ่านไม่ถูกต้อง');
    }
  };

  const handleLogoClick = () => {
    logoClickCountRef.current += 1;
    if (logoClickTimerRef.current) clearTimeout(logoClickTimerRef.current);
    if (logoClickCountRef.current >= 3) {
      logoClickCountRef.current = 0;
      onSecretBatchTrigger?.();
      return;
    }
    logoClickTimerRef.current = setTimeout(() => {
      logoClickCountRef.current = 0;
    }, 1200);
  };

  useEffect(() => {
    trackVisit();
    setStats(getUsageStats());
    fetchRealStats().then((real) => setStats(real)).catch(() => {});
    const interval = setInterval(() => {
      fetchRealStats().then((real) => setStats(real)).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = (id) => {
    setActiveMenu(id);
    onMobileClose?.();
  };

  const mainItems = MENU_ITEMS.filter((item) => !item.isAdmin && !item.isLab);
  const adminItems = MENU_ITEMS.filter((item) => item.isAdmin);
  const labItems = isLabMode ? MENU_ITEMS.filter((item) => item.isLab) : [];
  const completedCount = mainItems.filter((item) => moduleStatus?.[item.id]).length;

  return (
    <div className="pnp-shell-card rounded-xl sticky top-4 h-auto md:min-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
      <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 px-4 py-5 text-white">
        <div
          onClick={handleLogoClick}
          className="flex items-center gap-3 cursor-pointer select-none active:scale-[0.99] transition"
          title="กด 3 ครั้งติดต่อกันเพื่อเรียกใช้ปุ่มลับ"
        >
          <div className="h-12 w-12 rounded-xl bg-white/12 border border-white/15 flex items-center justify-center shadow-inner">
            <BookOpenCheck size={25} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-sky-200 font-semibold">PNP Platform</div>
            <h1 className="text-lg font-extrabold leading-tight">PNP AI Lesson Planner</h1>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/12 bg-white/10 px-3 py-3">
          <div className="flex items-center justify-between text-xs text-blue-50">
            <span>Workflow Progress</span>
            <span className="font-bold">{completedCount}/{mainItems.length}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-300 to-cyan-200 transition-all"
              style={{ width: `${mainItems.length ? (completedCount / mainItems.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Lesson Workflow
        </div>
        <div className="space-y-1">
          {mainItems.map((item, idx) => {
            const active = activeMenu === item.id;
            const done = !!moduleStatus?.[item.id];
            return (
              <button
                key={item.id}
                onClick={() => handleClick(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition border ${
                  active
                    ? 'bg-blue-50 border-blue-200 text-blue-800 shadow-sm'
                    : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-200'
                }`}
              >
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  done ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={active ? 'text-blue-700' : 'text-slate-400'}>{item.icon}</span>
                    <span className="text-sm font-semibold leading-snug">{item.label}</span>
                  </div>
                </div>
                {done && <ShieldCheck size={15} className="text-emerald-500 shrink-0" />}
                {active && <ChevronRight size={15} className="text-blue-500 shrink-0" />}
              </button>
            );
          })}
        </div>

        {adminItems.length > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Administration
            </div>
            {adminItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleClick(item.id)}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition border ${
                  activeMenu === item.id
                    ? 'bg-slate-100 border-slate-200 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-3 text-sm">
                  {item.icon} {item.label}
                </span>
                {activeMenu === item.id && <ChevronRight size={14} />}
              </button>
            ))}
          </div>
        )}

        {labItems.length > 0 && (
          <div className="mt-3 space-y-1">
            {labItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleClick(item.id)}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-purple-600 hover:bg-purple-50"
              >
                <span className="flex items-center gap-2 text-xs font-semibold">{item.icon} {item.label}</span>
                <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold">LAB</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          <StatItem icon={Eye} label="เข้าใช้งาน" value={stats.totalVisits} />
          <StatItem icon={Download} label="Downloads" value={stats.totalDownloads} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {onExportProject && (
            <button onClick={onExportProject} className="pnp-btn-secondary rounded-lg px-2 py-2 text-xs font-semibold flex items-center justify-center gap-1.5">
              <Save size={13} /> Backup
            </button>
          )}
          {onImportProject && (
            <>
              <input
                ref={importRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && window.confirm('กู้คืนข้อมูลจากไฟล์สำรอง?\n\nข้อมูลปัจจุบันจะถูกแทนที่ด้วยข้อมูลจากไฟล์ที่เลือก')) {
                    onImportProject(f);
                  }
                  e.target.value = '';
                }}
              />
              <button onClick={() => importRef.current?.click()} className="pnp-btn-secondary rounded-lg px-2 py-2 text-xs font-semibold flex items-center justify-center gap-1.5">
                <Upload size={13} /> Restore
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => {
            if (window.confirm('ต้องการล้างข้อมูลทั้งหมดหรือไม่?\n\n- API Key\n- ข้อมูลผู้ใช้\n- สถิติการใช้งาน\n- แคชทั้งหมด\n\nหน้าเว็บจะรีโหลดใหม่')) {
              localStorage.clear();
              sessionStorage.clear();
              if ('caches' in window) caches.keys().then((names) => names.forEach((name) => caches.delete(name)));
              window.location.reload();
            }
          }}
          className="mt-2 w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 flex items-center justify-center gap-1.5"
        >
          <Trash2 size={13} /> ล้างข้อมูลแคชทั้งหมด
        </button>

        <button
          onClick={handleAdminAccess}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50 flex items-center justify-center gap-1.5"
          title="Admin: ใส่ ThaiLLM Pool Keys"
        >
          <LockKeyhole size={12} /> Admin · ใส่ Key
        </button>

        <div className="mt-3 pt-3 border-t border-slate-200 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <Sparkles size={12} className="text-blue-500" /> Professional AI Lesson Platform
          </div>
          <div className="mt-2 flex justify-center gap-3 text-slate-400">
            <a href="https://www.facebook.com/kruarm55" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition" title="Facebook"><Facebook size={15} /></a>
            <a href="https://www.youtube.com/@kruarm55" target="_blank" rel="noopener noreferrer" className="hover:text-red-600 transition" title="Youtube"><Youtube size={15} /></a>
            <a href="https://www.tiktok.com/@kruarm55" target="_blank" rel="noopener noreferrer" className="hover:text-pink-500 transition" title="TikTok"><TikTokIcon /></a>
            <a href="https://www.instagram.com/kruarm555" target="_blank" rel="noopener noreferrer" className="hover:text-pink-600 transition" title="Instagram"><Instagram size={15} /></a>
            <a href="http://www.kruarm.net" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition" title="Website"><Globe size={15} /></a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
