import React from 'react';
import { GraduationCap, LogOut, Clock } from 'lucide-react';

/**
 * Training mode banner — แสดงด้านบนของแอปเมื่ออยู่ใน training session
 */
const TrainingBanner = ({ session, onLeave }) => {
  if (!session) return null;

  const timeLeft = session.expiresAt ? session.expiresAt - Date.now() : 0;
  const minutesLeft = Math.max(0, Math.floor(timeLeft / 60000));
  const hoursLeft = Math.floor(minutesLeft / 60);
  const remainingMin = minutesLeft % 60;
  const timeLabel = hoursLeft > 0
    ? `${hoursLeft}ชม ${remainingMin}น`
    : `${minutesLeft}น`;

  return (
    <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 flex items-center justify-between gap-3 sticky top-0 z-40 shadow-md">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <GraduationCap size={18} className="flex-shrink-0" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0">
          <span className="font-semibold text-sm whitespace-nowrap">🎓 Training Mode</span>
          <span className="text-xs opacity-90 truncate">
            {session.name} <span className="opacity-70">({session.code})</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xs flex items-center gap-1 opacity-90">
          <Clock size={12} /> {timeLabel}
        </span>
        {session.allowLeave && (
          <button
            onClick={onLeave}
            className="text-xs flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition"
            title="ออกจาก Training Mode"
          >
            <LogOut size={12} /> ออก
          </button>
        )}
      </div>
    </div>
  );
};

export default TrainingBanner;

/**
 * Module Gate — แสดง overlay เมื่อ module ถูก lock โดย instructor
 */
export const ModuleGate = ({ enabled, children, moduleName }) => {
  if (enabled) return children;

  return (
    <div className="relative">
      <div className="opacity-30 pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-10">
        <div className="bg-white border-2 border-purple-300 rounded-2xl shadow-xl p-6 max-w-md text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="text-lg font-bold text-purple-800 mb-2">รอ Instructor เปิด Module</h3>
          <p className="text-sm text-gray-600">
            ตอนนี้ instructor ยังไม่เปิด Module นี้สำหรับคลาส<br />
            ระบบจะอัพเดทอัตโนมัติเมื่อ instructor เปิด (ภายใน 10 วินาที)
          </p>
          <p className="text-xs text-gray-400 mt-3 italic">
            Module: <code className="bg-gray-100 px-2 py-0.5 rounded">{moduleName || 'unknown'}</code>
          </p>
        </div>
      </div>
    </div>
  );
};
