import React, { useMemo, useState } from 'react';
import { BookOpen, Eye, EyeOff, Lock, User } from 'lucide-react';

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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-lg bg-blue-700 text-white flex items-center justify-center">
              <BookOpen size={23} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 leading-tight">PNP Lesson Plan</h1>
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
                  className="w-full h-11 pl-10 pr-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
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
                  className="w-full h-11 pl-10 pr-11 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
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
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
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
              className="w-full h-11 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? 'กำลังตรวจสอบ...' : authMode === 'setup' ? 'บันทึกและเข้าใช้งาน' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
