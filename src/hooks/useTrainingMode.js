/**
 * useTrainingMode — Training session via URL ?class=ABC123
 *
 * Workflow:
 *   1. ตอน mount: detect URL param ?class=... → save localStorage + fetch config
 *   2. Poll Worker ทุก 10 วินาที — admin update โมดูล → trainee เห็นภายใน 10s
 *   3. Module Gate: ใช้ isModuleEnabled(moduleName) เพื่อ check ว่า admin เปิดโมดูลนี้หรือยัง
 *   4. Leave training → ล้าง localStorage
 *
 * Storage:
 *   localStorage["training_session"] = { code, name, modules, expiresAt }
 *
 * URL pattern:
 *   https://plan.kruarm.net/?class=ABC123
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'training_session';
const POLL_INTERVAL_MS = 10 * 1000;
const PROXY_BASE = import.meta.env?.VITE_THAILLM_PROXY_URL || '';

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveStored(data) {
  try {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function getCodeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('class');
    if (code && /^[A-Z0-9]{6}$/i.test(code)) return code.toUpperCase();
    return null;
  } catch { return null; }
}

/**
 * Hook ใช้ใน App.jsx — ส่ง training state ไปยัง modules
 */
export function useTrainingMode() {
  // session = { code, name, modules: [...], expiresAt }
  const [session, setSession] = useState(() => loadStored());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollingRef = useRef(null);

  // Fetch class config จาก Worker
  const fetchConfig = useCallback(async (code) => {
    if (!code || !PROXY_BASE) return null;
    try {
      const res = await fetch(`${PROXY_BASE.replace(/\/$/, '')}/training/${code}`);
      if (res.status === 404) {
        setError('ไม่พบรหัสคลาส (Class not found)');
        return null;
      }
      if (res.status === 410) {
        setError('คลาสนี้สิ้นสุดแล้ว (Class ended)');
        return null;
      }
      if (!res.ok) {
        setError(`โหลด class config ไม่ได้ (${res.status})`);
        return null;
      }
      const data = await res.json();
      setError(null);
      return data;
    } catch (err) {
      setError(`Network error: ${err.message}`);
      return null;
    }
  }, []);

  // Init: detect URL → fetch → save
  useEffect(() => {
    const codeFromUrl = getCodeFromUrl();
    const stored = loadStored();
    const initialCode = codeFromUrl || stored?.code;

    if (!initialCode) return;
    setLoading(true);
    fetchConfig(initialCode).then((data) => {
      if (data) {
        const newSession = {
          code: data.code,
          name: data.name,
          modules: data.modules || [],
          allowLeave: data.allowLeave === true,
          expiresAt: data.expiresAt,
        };
        setSession(newSession);
        saveStored(newSession);
      } else if (codeFromUrl) {
        // URL มี code แต่ fetch fail (เช่น expired / not found) → clear
        setSession(null);
        saveStored(null);
      }
      setLoading(false);
    });
  }, [fetchConfig]);

  // Poll Worker ทุก 10s
  useEffect(() => {
    if (!session?.code) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    pollingRef.current = setInterval(async () => {
      const data = await fetchConfig(session.code);
      if (data) {
        const newSession = {
          code: data.code,
          name: data.name,
          modules: data.modules || [],
          allowLeave: data.allowLeave === true,
          expiresAt: data.expiresAt,
        };
        setSession(newSession);
        saveStored(newSession);
      } else {
        // Class ended/not found → leave
        setSession(null);
        saveStored(null);
      }
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [session?.code, fetchConfig]);

  const leaveTraining = useCallback(() => {
    setSession(null);
    saveStored(null);
    setError(null);
    // Remove ?class= from URL bar
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('class');
      window.history.replaceState({}, document.title, url.toString());
    } catch {}
  }, []);

  // Helper: ตรวจว่า module เปิดอยู่ไหม
  const isModuleEnabled = useCallback((moduleName) => {
    if (!session) return true; // ไม่อยู่ใน training → ใช้ปกติ
    if (moduleName === 'admin') return true; // Admin ต้องเข้าได้เสมอเพื่อจัดการระบบ
    return (session.modules || []).includes(moduleName);
  }, [session]);

  return {
    isTraining: !!session,
    session,
    loading,
    error,
    leaveTraining,
    isModuleEnabled,
  };
}
