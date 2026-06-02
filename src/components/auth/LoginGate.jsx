import React, { useMemo, useState } from 'react';
import { BookOpenCheck, Eye, EyeOff, Lock, Sparkles, User } from 'lucide-react';

const SESSION_KEY = 'lp_auth_session';
const LOCAL_USER_KEY = 'lp_auth_user';
const LOCAL_HASH_KEY = 'lp_auth_password_hash';

async function hashText(value) {
  const text = String(value || '');
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return `fallback:${hash}`;
}

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function clearLoginSession() {
  localStorage.removeItem(SESSION_KEY);
  window.location.reload();
}

export default function LoginGate({ children }) {
  const envUser = (import.meta.env?.VITE_APP_LOGIN_USER || '').trim();
  const envPassword = import.meta.env?.VITE_APP_LOGIN_PASSWORD || '';
  const localUser = localStorage.getItem(LOCAL_USER_KEY) || 'admin';
  const hasLocalPassword = !!localStorage.getItem(LOCAL_HASH_KEY);
  const authMode = envPassword ? 'env' : hasLocalPassword ? 'local' : 'setup';

  const initialSession = getStoredSession();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (!initialSession) return false;
    if (authMode === 'env') return initialSession.mode === 'env';
    if (authMode === 'local') return initialSession.mode === 'local';
    return false;
  });
  const [username, setUsername] = useState(envUser || localUser);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => (
    authMode === 'setup' ? 'ตั้งค่าการเข้าใช้งานครั้งแรก' : 'เข้าสู่ระบบ'
  ), [authMode]);

  const helper = useMemo(() => {
    if (authMode === 'env') return 'ใช้บัญชีที่ตั้งไว้ในไฟล์ .env.local ของระบบนี้';
    if (authMode === 'local') return 'ใช้รหัสที่ตั้งไว้ใน browser เครื่องนี้';
    return 'สร้างผู้ใช้และรหัสผ่านสำหรับ browser เครื่องนี้ก่อนเข้าใช้งาน';
  }, [authMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }

    if (authMode === 'setup') {
      if (password.length < 6) {
        setError('รหัสผ่านควรมีอย่างน้อย 6 ตัวอักษร');
        return;
      }
      if (password !== confirmPassword) {
        setError('รหัสผ่านยืนยันไม่ตรงกัน');
        return;
      }
    }

    setLoading(true);
    try {
      if (authMode === 'env') {
        const expectedUser = envUser || cleanUser;
        if (cleanUser !== expectedUser || password !== envPassword) {
          setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
          return;
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify({ mode: 'env', username: cleanUser, loginAt: Date.now() }));
        setIsAuthenticated(true);
        return;
      }

      if (authMode === 'setup') {
        const passwordHash = await hashText(password);
        localStorage.setItem(LOCAL_USER_KEY, cleanUser);
        localStorage.setItem(LOCAL_HASH_KEY, passwordHash);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ mode: 'local', username: cleanUser, loginAt: Date.now() }));
        setIsAuthenticated(true);
        return;
      }

      const expectedHash = localStorage.getItem(LOCAL_HASH_KEY);
      const passwordHash = await hashText(password);
      if (cleanUser !== localUser || passwordHash !== expectedHash) {
        setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        return;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({ mode: 'local', username: cleanUser, loginAt: Date.now() }));
      setIsAuthenticated(true);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) return children;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,42,74,0.96),rgba(29,78,216,0.88)_48%,rgba(14,165,233,0.78))]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-white/10 blur-3xl" />
      <div className="relative w-full max-w-5xl grid lg:grid-cols-[1.05fr_0.95fr] gap-6 items-stretch">
        <div className="hidden lg:flex rounded-xl border border-white/15 bg-white/10 backdrop-blur-xl p-8 text-white flex-col justify-between shadow-2xl">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-100">
              <Sparkles size={14} /> Professional Education AI
            </div>
            <h1 className="mt-8 text-4xl font-extrabold leading-tight">
              PNP AI<br />Lesson Planner
            </h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-blue-50">
              ระบบผู้ช่วย AI สำหรับครูอาชีวศึกษา ออกแบบให้ทำงานเป็นขั้นตอน น่าเชื่อถือ และพร้อมใช้ในงานวิชาการ
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            {['วิเคราะห์หลักสูตร', 'สร้างแผนรายหน่วย', 'ส่งออกเอกสาร'].map((item) => (
              <div key={item} className="rounded-lg border border-white/15 bg-white/10 p-3 text-blue-50">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="pnp-shell-card rounded-xl p-6 sm:p-7 self-center">
          <div className="flex items-center gap-3 mb-7">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-700 to-sky-500 text-white flex items-center justify-center shadow-lg shadow-blue-700/20">
              <BookOpenCheck size={25} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-950 leading-tight">PNP AI Lesson Planner</h1>
              <p className="text-xs text-slate-500 leading-snug">{helper}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{title}</label>
              <div className="relative">
                <User size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full h-11 pl-10 pr-3 rounded-lg pnp-field text-sm"
                  placeholder="ชื่อผู้ใช้"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <Lock size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={authMode === 'setup' ? 'new-password' : 'current-password'}
                  className="w-full h-11 pl-10 pr-11 rounded-lg pnp-field text-sm"
                  placeholder="รหัสผ่าน"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-slate-500 hover:bg-slate-100"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {authMode === 'setup' && (
              <div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full h-11 px-3 rounded-lg pnp-field text-sm"
                  placeholder="ยืนยันรหัสผ่าน"
                  disabled={loading}
                />
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg pnp-btn-primary font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? 'กำลังตรวจสอบ...' : authMode === 'setup' ? 'บันทึกและเข้าใช้งาน' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
