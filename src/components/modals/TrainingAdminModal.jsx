import React, { useState, useEffect, useCallback } from 'react';
import {
  X, GraduationCap, Save, Trash2, Plus, Copy, CheckCircle, AlertCircle,
  Loader2, Info, Eye, EyeOff, RefreshCw, Clock, Check, Lock, Unlock, Zap,
  Database, Key,
} from 'lucide-react';

/**
 * TrainingAdminModal — สร้าง/จัดการ Training class
 *
 * Trigger: Ctrl+Shift+T (หรือ URL ?admin=training)
 * Backend: Cloudflare Worker (thaillm-proxy) endpoints:
 *   - POST /admin/training/create
 *   - POST /admin/training/update/:code
 *   - DELETE /admin/training/delete/:code
 *   - GET  /admin/training/list
 */

const PROXY_BASE = import.meta.env?.VITE_THAILLM_PROXY_URL || '';

// รายการ Module ทั้งหมดในระบบ (ตรงกับ activeMenu IDs)
const ALL_MODULES = [
  { id: 'analysis',         label: '1. วิเคราะห์งาน/หน่วยการเรียนรู้' },
  { id: 'learningOutcomes', label: '2. ผลลัพธ์การเรียนรู้ประจำหน่วย' },
  { id: 'competency',       label: '3. สมรรถนะประจำหน่วย' },
  { id: 'objectives',       label: '4. จุดประสงค์เชิงพฤติกรรม' },
  { id: 'concept',          label: '5. สาระการเรียนรู้' },
  { id: 'behaviorTable',    label: '6. ตารางวิเคราะห์พฤติกรรม' },
  { id: 'activities',       label: '7. กิจกรรมการเรียนรู้' },
  { id: 'media',            label: '8. สื่อและแหล่งการเรียนรู้' },
  { id: 'evidence',         label: '9. หลักฐานการเรียนรู้' },
  { id: 'assessment',       label: '10. การวัดและประเมินผล' },
  { id: 'admin',            label: 'Admin Dashboard' },
];

const TrainingAdminModal = ({ isOpen, onClose, initialTab = 'classes' }) => {
  const [activeTab, setActiveTab] = useState(initialTab); // 'classes' | 'pool'

  // Sync เมื่อ open ใหม่
  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDuration, setNewClassDuration] = useState(8); // hours
  const [newClassAllowLeave, setNewClassAllowLeave] = useState(false); // default ห้าม trainee ออก
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  // ── Pool tab state ──
  const [poolKeysText, setPoolKeysText] = useState('');
  const [poolStatus, setPoolStatus] = useState(null);
  const [poolLoading, setPoolLoading] = useState(false);

  // Load classes when password ready
  const loadClasses = useCallback(async () => {
    if (!password.trim() || !PROXY_BASE) return;
    setLoading(true);
    try {
      const res = await fetch(`${PROXY_BASE.replace(/\/$/, '')}/admin/training/list`, {
        headers: { 'X-Admin-Password': password.trim() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setClasses(data.classes || []);
      setMessage(null);
    } catch (err) {
      setMessage({ type: 'error', text: `โหลด classes ไม่ได้: ${err.message}` });
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    if (!isOpen) return;
    setMessage(null);
    if (!PROXY_BASE) {
      setMessage({ type: 'error', text: 'VITE_THAILLM_PROXY_URL ไม่ได้ตั้งใน Render — ต้อง deploy Cloudflare Worker proxy ก่อน' });
    }
  }, [isOpen]);

  // Create new class — default = ทุก module locked (modules: [])
  const handleCreate = async () => {
    if (!password.trim()) return setMessage({ type: 'error', text: 'กรุณาใส่รหัสผู้ดูแล' });
    if (!newClassName.trim()) return setMessage({ type: 'error', text: 'กรุณาใส่ชื่อ class' });

    setBusy(true);
    try {
      const res = await fetch(`${PROXY_BASE.replace(/\/$/, '')}/admin/training/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password.trim() },
        body: JSON.stringify({
          name: newClassName.trim(),
          modules: [], // 🔒 default lock ทุก module — admin ปลดล็อคทีละตัวเมื่อพร้อม
          allowLeave: newClassAllowLeave,
          expiresAt: Date.now() + newClassDuration * 3600 * 1000,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setMessage({ type: 'success', text: `สร้าง class สำเร็จ — code: ${data.code} (ทุก module locked — กดปลดล็อคทีละตัวด้านล่าง)` });
      setNewClassName('');
      setCreating(false);
      await loadClasses();
    } catch (err) {
      setMessage({ type: 'error', text: `สร้างไม่ได้: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  // Toggle allowLeave on existing class
  const handleToggleAllowLeave = async (code, newValue) => {
    try {
      const res = await fetch(`${PROXY_BASE.replace(/\/$/, '')}/admin/training/update/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password.trim() },
        body: JSON.stringify({ allowLeave: newValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setClasses((prev) => prev.map((c) => c.code === code ? { ...c, allowLeave: newValue } : c));
    } catch (err) {
      setMessage({ type: 'error', text: `Update ไม่ได้: ${err.message}` });
    }
  };

  // Quick action: unlock/lock all modules in a class
  const handleBulkToggle = async (code, action) => {
    // action: 'unlock-all' | 'lock-all'
    const newModules = action === 'unlock-all' ? ALL_MODULES.map((m) => m.id) : [];
    try {
      const res = await fetch(`${PROXY_BASE.replace(/\/$/, '')}/admin/training/update/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password.trim() },
        body: JSON.stringify({ modules: newModules }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setClasses((prev) => prev.map((c) => c.code === code ? { ...c, modules: newModules } : c));
    } catch (err) {
      setMessage({ type: 'error', text: `${action} ไม่ได้: ${err.message}` });
    }
  };

  // Update class modules
  const handleToggleModule = async (code, moduleId) => {
    const cls = classes.find((c) => c.code === code);
    if (!cls) return;
    const newModules = cls.modules.includes(moduleId)
      ? cls.modules.filter((m) => m !== moduleId)
      : [...cls.modules, moduleId];
    try {
      const res = await fetch(`${PROXY_BASE.replace(/\/$/, '')}/admin/training/update/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password.trim() },
        body: JSON.stringify({ modules: newModules }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      // optimistic update
      setClasses((prev) => prev.map((c) => c.code === code ? { ...c, modules: newModules } : c));
    } catch (err) {
      setMessage({ type: 'error', text: `Update ไม่ได้: ${err.message}` });
    }
  };

  // Delete
  const handleDelete = async (code) => {
    if (!confirm(`ลบ class "${code}"? Trainees จะถูก kick ออกจาก training mode`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${PROXY_BASE.replace(/\/$/, '')}/admin/training/delete/${code}`, {
        method: 'POST',
        headers: { 'X-Admin-Password': password.trim() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setMessage({ type: 'success', text: `ลบ ${code} แล้ว` });
      await loadClasses();
    } catch (err) {
      setMessage({ type: 'error', text: `ลบไม่ได้: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  // Copy URL
  const handleCopy = async (code) => {
    const url = `${window.location.origin}/?class=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {}
  };

  // ──────────────────────────────────────────────────────────
  // POOL TAB — ThaiLLM admin pool management
  // ──────────────────────────────────────────────────────────
  const loadPoolStatus = useCallback(async () => {
    if (!password.trim() || !PROXY_BASE) return;
    setPoolLoading(true);
    try {
      const res = await fetch(`${PROXY_BASE.replace(/\/$/, '')}/admin/thaillm-pool/status`, {
        headers: { 'X-Admin-Password': password.trim() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setPoolStatus(data);
      setMessage(null);
    } catch (err) {
      setMessage({ type: 'error', text: `โหลด pool status ไม่ได้: ${err.message}` });
      setPoolStatus(null);
    } finally {
      setPoolLoading(false);
    }
  }, [password]);

  const handlePoolSave = async () => {
    if (!password.trim()) return setMessage({ type: 'error', text: 'กรุณาใส่รหัสผู้ดูแล' });
    const keys = poolKeysText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (keys.length === 0) return setMessage({ type: 'error', text: 'ต้องใส่อย่างน้อย 1 key' });
    setBusy(true);
    try {
      const res = await fetch(`${PROXY_BASE.replace(/\/$/, '')}/admin/thaillm-pool/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password.trim() },
        body: JSON.stringify({ keys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setMessage({ type: 'success', text: `บันทึก ${data.pool_size} keys เรียบร้อย` });
      setPoolKeysText(''); // clear input หลัง save (security)
      await loadPoolStatus();
    } catch (err) {
      setMessage({ type: 'error', text: `บันทึกไม่ได้: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const handlePoolClear = async () => {
    if (!password.trim()) return setMessage({ type: 'error', text: 'กรุณาใส่รหัสผู้ดูแล' });
    if (!confirm('ลบ pool keys ทั้งหมด? — ครูทุกคนจะใช้ fallback admin ไม่ได้อีก')) return;
    setBusy(true);
    try {
      const res = await fetch(`${PROXY_BASE.replace(/\/$/, '')}/admin/thaillm-pool/clear`, {
        method: 'POST',
        headers: { 'X-Admin-Password': password.trim() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setMessage({ type: 'success', text: 'ลบ pool แล้ว' });
      setPoolStatus(null);
    } catch (err) {
      setMessage({ type: 'error', text: `ลบไม่ได้: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  // Auto load pool when switching to tab
  useEffect(() => {
    if (isOpen && activeTab === 'pool' && password.trim() && !poolStatus) {
      loadPoolStatus();
    }
  }, [isOpen, activeTab, password, poolStatus, loadPoolStatus]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <GraduationCap className="text-purple-600" size={22} />
            <h2 className="text-lg font-bold text-gray-800">Training Admin Panel</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5 sticky top-[60px] bg-white z-10">
          <button
            onClick={() => setActiveTab('classes')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'classes'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <GraduationCap size={14} /> Training Classes
          </button>
          <button
            onClick={() => setActiveTab('pool')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'pool'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Database size={14} /> ThaiLLM Pool
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Info */}
          {activeTab === 'classes' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 flex gap-2">
              <Info size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">วิธีใช้ Training Classes:</p>
                <ol className="text-xs mt-1 list-decimal pl-4 space-y-0.5">
                  <li>สร้าง class + Copy URL ส่งให้ trainees (เช่น plan.kruarm.net/?class=ABC123)</li>
                  <li>ระหว่างคลาส — กด ปลดล็อค Module ทีละตัวตามลำดับการสอน</li>
                </ol>
              </div>
            </div>
          )}
          {activeTab === 'pool' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-900 flex gap-2">
              <Info size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">ThaiLLM Admin Pool — Load Balance อัตโนมัติ</p>
                <p className="text-xs mt-1">
                  ใส่ ThaiLLM keys หลายตัว (1 บรรทัด/key) → Worker หมุนเวียนใช้ → กระจาย load ไม่ติด 429
                </p>
                <p className="text-xs mt-1 text-indigo-700">
                  ใช้เฉพาะ module: <strong>สื่อ, ใบงาน, ใบความรู้, ใบปฏิบัติงาน, ใบมอบหมายงาน, เครื่องมือวัดประเมิน</strong>
                  (Module อื่นจะใช้ provider ของ user เอง)
                </p>
              </div>
            </div>
          )}

          {/* Password input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">รหัสผู้ดูแลระบบ</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="default: a1d9GH10%"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                onClick={loadClasses}
                disabled={!password.trim() || loading}
                className="flex items-center gap-1 bg-purple-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-300 text-sm"
              >
                {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                โหลด
              </button>
            </div>
          </div>

          {/* Message */}
          {message && (
            <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              <span className="break-all">{message.text}</span>
            </div>
          )}

          {/* ════════ CLASSES TAB ════════ */}
          {activeTab === 'classes' && (<>
          {/* Create new class */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                <Plus size={14} /> สร้าง Training Class ใหม่
              </h3>
              {!creating && (
                <button onClick={() => setCreating(true)} className="text-xs text-purple-600 hover:underline">
                  + เริ่มสร้าง
                </button>
              )}
            </div>
            {creating && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="ชื่อ class เช่น 'อบรมครู สอศ. รุ่น 2'"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-700">หมดอายุใน:</label>
                  <select
                    value={newClassDuration}
                    onChange={(e) => setNewClassDuration(Number(e.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 text-xs"
                  >
                    <option value={1}>1 ชั่วโมง</option>
                    <option value={4}>4 ชั่วโมง</option>
                    <option value={8}>8 ชั่วโมง</option>
                    <option value={24}>1 วัน</option>
                    <option value={72}>3 วัน</option>
                  </select>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 flex items-start gap-1.5">
                  <Lock size={12} className="flex-shrink-0 mt-0.5" />
                  <span>
                    ตอนสร้าง class — <strong>ทุก module จะถูก lock</strong> ก่อน
                    หลังสร้างเสร็จ คุณกดปุ่ม <strong>"🔓 ปลดล็อค"</strong> ทีละ module ระหว่างคลาส
                  </span>
                </div>
                <div>
                  <label className="flex items-start gap-2 text-xs cursor-pointer bg-white border rounded p-2 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={newClassAllowLeave}
                      onChange={(e) => setNewClassAllowLeave(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>อนุญาตให้ trainee กดออกจากคลาส</strong> ได้เอง
                      <span className="block text-[10px] text-gray-500 mt-0.5">
                        ถ้าไม่ติ๊ก (default) → trainee อยู่ในคลาสจนกว่าจะหมดเวลา (ปุ่ม "ออก" จะถูกซ่อน)
                      </span>
                    </span>
                  </label>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setCreating(false)} className="text-xs text-gray-600 hover:underline px-3 py-1.5">
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={busy}
                    className="flex items-center gap-1 bg-purple-600 text-white px-3 py-1.5 rounded text-xs hover:bg-purple-700 disabled:bg-gray-300"
                  >
                    {busy ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
                    สร้าง Class
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* List classes */}
          <div className="border-t pt-4">
            <h3 className="font-bold text-gray-800 text-sm mb-2">Active Classes ({classes.length})</h3>
            {classes.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-4">
                ยังไม่มี class — กดโหลด หรือสร้างใหม่
              </p>
            ) : (
              <div className="space-y-2">
                {classes.map((cls) => {
                  const expired = cls.expired || (cls.expiresAt && cls.expiresAt < Date.now());
                  const timeLeft = cls.expiresAt - Date.now();
                  const hoursLeft = Math.max(0, Math.floor(timeLeft / 3600000));
                  const minutesLeft = Math.max(0, Math.floor((timeLeft % 3600000) / 60000));
                  const url = `${window.location.origin}/?class=${cls.code}`;
                  return (
                    <div key={cls.code} className={`border rounded-lg p-3 ${expired ? 'bg-gray-50 border-gray-300 opacity-60' : 'bg-white border-purple-200'}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-purple-700 font-bold">{cls.code}</span>
                            <span className="font-medium text-gray-800 truncate">{cls.name}</span>
                            {expired && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">หมดอายุ</span>}
                          </div>
                          <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-0.5">
                            <Clock size={10} /> {expired ? 'หมดอายุแล้ว' : `เหลือ ${hoursLeft}ชม ${minutesLeft}น`}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleCopy(cls.code)}
                            title="Copy URL"
                            className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 p-1.5 rounded"
                          >
                            {copiedCode === cls.code ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                          <button
                            onClick={() => handleDelete(cls.code)}
                            title="ลบ class"
                            className="text-xs bg-red-100 hover:bg-red-200 text-red-700 p-1.5 rounded"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        readOnly
                        value={url}
                        className="w-full text-[10px] font-mono bg-gray-100 border-0 px-2 py-1 rounded mb-2 cursor-text select-all"
                      />
                      {!expired && (
                        <>
                          {/* Status summary + Quick actions */}
                          <div className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded px-2 py-1 mb-2">
                            <div className="text-[10px] text-gray-700">
                              ปลดล็อคแล้ว: <strong className="text-green-700">{cls.modules.length}</strong>
                              <span className="text-gray-400"> / {ALL_MODULES.length}</span>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleBulkToggle(cls.code, 'unlock-all')}
                                title="ปลดล็อคทุก module"
                                className="text-[10px] bg-green-100 hover:bg-green-200 text-green-800 px-2 py-0.5 rounded font-medium flex items-center gap-0.5"
                              >
                                <Zap size={10} /> ปลดล็อคทั้งหมด
                              </button>
                              <button
                                onClick={() => handleBulkToggle(cls.code, 'lock-all')}
                                title="ล็อคทุก module"
                                className="text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-0.5 rounded font-medium flex items-center gap-0.5"
                              >
                                <Lock size={10} /> ล็อคทั้งหมด
                              </button>
                            </div>
                          </div>

                          {/* allowLeave toggle */}
                          <label className="flex items-center gap-2 text-[10px] cursor-pointer bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2 hover:bg-amber-100">
                            <input
                              type="checkbox"
                              checked={cls.allowLeave === true}
                              onChange={(e) => handleToggleAllowLeave(cls.code, e.target.checked)}
                            />
                            <span className="text-amber-900">
                              {cls.allowLeave
                                ? '🚪 อนุญาตให้ trainee กด "ออก" จากคลาสได้'
                                : '🔒 ห้าม trainee กด "ออก" จากคลาส (default — ปุ่มออกถูกซ่อน)'}
                            </span>
                          </label>

                          {/* Module list — big unlock/lock buttons */}
                          <div className="space-y-1">
                            {ALL_MODULES.map((mod) => {
                              const unlocked = cls.modules.includes(mod.id);
                              return (
                                <div
                                  key={mod.id}
                                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded border ${
                                    unlocked
                                      ? 'bg-green-50 border-green-200'
                                      : 'bg-gray-50 border-gray-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {unlocked ? (
                                      <Unlock size={14} className="text-green-600 flex-shrink-0" />
                                    ) : (
                                      <Lock size={14} className="text-gray-400 flex-shrink-0" />
                                    )}
                                    <span className={`text-xs truncate ${unlocked ? 'text-green-900 font-medium' : 'text-gray-600'}`}>
                                      {mod.label}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => handleToggleModule(cls.code, mod.id)}
                                    className={`text-[11px] px-2.5 py-1 rounded font-medium transition flex items-center gap-1 flex-shrink-0 ${
                                      unlocked
                                        ? 'bg-white border border-red-300 text-red-700 hover:bg-red-50'
                                        : 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                                    }`}
                                  >
                                    {unlocked ? (
                                      <><Lock size={11} /> ล็อค</>
                                    ) : (
                                      <><Unlock size={11} /> ปลดล็อค</>
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </>)}
          {/* ════════ END CLASSES TAB ════════ */}

          {/* ════════ POOL TAB ════════ */}
          {activeTab === 'pool' && (
            <div className="border-t pt-4 space-y-4">
              {/* Paste keys */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Key size={14} /> ใส่ ThaiLLM API Keys (1 บรรทัด/key)
                </label>
                <textarea
                  value={poolKeysText}
                  onChange={(e) => setPoolKeysText(e.target.value)}
                  placeholder={'YK4zVZ4An2LmqfsM31JsEEG9lFoO2jKe\n6QAQAk644SQxtcAFMqEKjpStP7x3phtc\n...'}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Keys จะถูก save ใน Cloudflare Worker KV ของคุณเท่านั้น (ไม่อยู่ใน frontend code)
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handlePoolSave}
                    disabled={busy || !poolKeysText.trim()}
                    className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {busy ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    บันทึก Pool
                  </button>
                  <button
                    onClick={loadPoolStatus}
                    disabled={!password.trim() || poolLoading}
                    className="flex items-center gap-1 bg-white border border-gray-300 px-3 py-1.5 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    {poolLoading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                    Refresh Status
                  </button>
                  {poolStatus?.pool_size > 0 && (
                    <button
                      onClick={handlePoolClear}
                      disabled={busy}
                      className="flex items-center gap-1 bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded text-sm hover:bg-red-50 ml-auto"
                    >
                      <Trash2 size={14} /> ลบ Pool
                    </button>
                  )}
                </div>
              </div>

              {/* Pool status */}
              {poolStatus && (
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                      <Database size={14} /> Pool Status
                    </h4>
                    <span className="text-xs text-gray-500">
                      Pool size: <strong>{poolStatus.pool_size}</strong> keys
                      {' • '}
                      Today: <strong>{poolStatus.total_today}</strong> calls
                    </span>
                  </div>
                  {poolStatus.keys && poolStatus.keys.length > 0 ? (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {poolStatus.keys.map((k) => {
                        const total = k.success + k.error;
                        const nearLimit = k.success >= (poolStatus.near_limit_threshold || 800);
                        return (
                          <div
                            key={k.idx}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs ${
                              nearLimit
                                ? 'bg-amber-50 border border-amber-300'
                                : 'bg-gray-50 border border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-gray-600">#{k.idx + 1}</span>
                              <span className="font-mono text-gray-800">{k.preview}</span>
                              {nearLimit && (
                                <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">ใกล้หมด</span>
                              )}
                            </div>
                            <div className="flex gap-3 text-[10px]">
                              <span className="text-green-700">✓ {k.success}</span>
                              {k.error > 0 && <span className="text-red-700">✗ {k.error}</span>}
                              <span className="text-gray-500">รวม {total}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic text-center py-4">
                      ยังไม่มี keys ใน pool — paste keys ด้านบนแล้วกด "บันทึก Pool"
                    </p>
                  )}
                  <p className="text-[10px] text-gray-500 mt-2 italic">
                    💡 Worker เลือก key ที่ใช้น้อยที่สุด (least-used) — keys ที่ใกล้หมด (≥800/วัน) จะถูกข้าม
                  </p>
                </div>
              )}
            </div>
          )}
          {/* ════════ END POOL TAB ════════ */}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-5 py-3 rounded-b-2xl border-t border-gray-100 text-xs text-gray-500">
          เปิด panel ด้วย <kbd className="bg-gray-200 px-1.5 py-0.5 rounded font-mono">Ctrl+Shift+T</kbd>
          {' '}(Mac: <kbd className="bg-gray-200 px-1 py-0.5 rounded font-mono">⌃</kbd>
          +<kbd className="bg-gray-200 px-1 py-0.5 rounded font-mono">⇧</kbd>+T)
          {' '}หรือ URL <code className="bg-gray-200 px-1.5 py-0.5 rounded font-mono">?admin=training</code>
        </div>
      </div>
    </div>
  );
};

/**
 * Hook: TrainingAdminPanel trigger
 */
export const useTrainingAdminTrigger = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [initialTab, setInitialTab] = useState('classes');
  const open = useCallback((tab = 'classes') => {
    setInitialTab(tab);
    setIsOpen(true);
  }, []);
  const openPool = useCallback(() => {
    setInitialTab('pool');
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    // 1) URL trigger — ?admin=training → เปิดทันทีตอน mount
    try {
      const params = new URLSearchParams(window.location.search);
      const adminParam = params.get('admin');
      if (adminParam === 'training') {
        setInitialTab('classes');
        setIsOpen(true);
      } else if (adminParam === 'pool') {
        setInitialTab('pool');
        setIsOpen(true);
      }
    } catch {}

    // 2) Keyboard trigger
    // - Windows/Linux: Ctrl+Shift+T
    // - Mac: Control+Shift+T (ใช้ปุ่ม ⌃ Control — ไม่ใช่ ⌘ Cmd เพราะ Chrome เอาไปใช้ reopen tab)
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        setInitialTab('classes');
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { isOpen, initialTab, open, openPool, close };
};

export default TrainingAdminModal;
