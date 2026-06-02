import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Mail, User, Building2, MapPin, GraduationCap, Briefcase, Shield, Award, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { trackDownload } from '../../utils/usageStats';
import { COLLEGES } from '../../data/colleges';

const STORAGE_KEY = 'user_info';
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyxjQPVEx1FGPOvkCZ43V4STKKhY6VCgodo-A25ykPGiCWaIJGxDe8IvWBvNXcP7GLz/exec';

// 📜 ข้อความข้อตกลงก่อน download — บันทึกใน user_info พร้อม timestamp เป็นหลักฐาน
export const DISCLAIMER_TEXT = 'ข้าพเจ้ารับทราบว่าเอกสารนี้สร้างโดย AI และจะตรวจสอบความถูกต้องก่อนนำไปใช้งานจริง โดย ครูอาร์ม จะปฏิเสธทุกข้อกล่าวหา หากพบว่าท่านนำแผนด้วย AI ไปใช้โดยไม่ผ่านการตรวจสอบ อิอิ';

const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'อื่นๆ'];

const POSITIONS = [
  'ครูอัตราจ้าง', 'พนักงานราชการครู', 'ครูผู้ช่วย', 'ครู',
  'รองผู้อำนวยการ', 'ผู้อำนวยการ', 'ศึกษานิเทศก์', 'อื่นๆ',
];

const ACADEMIC_RANKS = [
  'ไม่มี', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ', 'เชี่ยวชาญพิเศษ',
];

const REGIONS = ['ภาคใต้', 'ภาคกลาง', 'ภาคเหนือ', 'ภาคตะวันออกเฉียงเหนือ', 'ภาคตะวันออกและกรุงเทพมหานคร'];

const AFFILIATIONS = ['รัฐบาล', 'เอกชน'];

const PROVINCES = [
  'กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น','จันทบุรี','ฉะเชิงเทรา',
  'ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก',
  'นครปฐม','นครพนม','นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี','นราธิวาส','น่าน',
  'บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา',
  'พะเยา','พังงา','พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','ภูเก็ต',
  'มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด','ระนอง','ระยอง','ราชบุรี',
  'ลพบุรี','ลำปาง','ลำพูน','เลย','ศรีสะเกษ','สกลนคร','สงขลา','สตูล','สมุทรปราการ',
  'สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี',
  'สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู','อ่างทอง','อำนาจเจริญ','อุดรธานี',
  'อุตรดิตถ์','อุทัยธานี','อุบลราชธานี',
];

export const getStoredUserInfo = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
};
export const setStoredUserInfo = (info) => localStorage.setItem(STORAGE_KEY, JSON.stringify(info));

export const logDownloadToSheet = (userInfo, meta = {}) => {
  if (!GOOGLE_SHEET_URL) return;
  try {
    fetch(GOOGLE_SHEET_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        type: 'user_download',
        ...userInfo,
        // ── Forensic fields เพิ่มเติม (เป็นหลักฐานภายหลัง) ──
        downloadTimestamp: new Date().toISOString(), // เวลาที่กด download ครั้งนี้
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '', // browser/OS info
        screenResolution: typeof window !== 'undefined' ? `${window.screen?.width || 0}x${window.screen?.height || 0}` : '',
        timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '',
        courseCode: meta.courseCode || '',
        courseName: meta.courseName || '',
        module: meta.module || '',
      }),
    }).catch(() => {});
  } catch { /* silent */ }
};

export const useDownloadWithUserInfo = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingDownload, setPendingDownload] = useState(null);
  const [pendingMeta, setPendingMeta] = useState(null);
  const triggerDownload = (downloadFn, meta) => {
    const existing = getStoredUserInfo();
    if (existing) {
      logDownloadToSheet(existing, meta);
      trackDownload();
      try {
        const result = downloadFn();
        if (result && typeof result.catch === 'function') {
          result.catch(err => console.error('Download error:', err));
        }
      } catch (err) {
        console.error('Download error:', err);
      }
    } else {
      setPendingDownload(() => downloadFn);
      setPendingMeta(meta || null);
      setIsOpen(true);
    }
  };
  const handleSubmit = async (info) => {
    setStoredUserInfo(info);
    logDownloadToSheet(info, pendingMeta);
    trackDownload();
    setIsOpen(false);
    if (pendingDownload) {
      try {
        await pendingDownload();
      } catch (err) {
        console.error('Download error after user info:', err);
      }
      setPendingDownload(null);
    }
    setPendingMeta(null);
  };
  const handleClose = () => { setIsOpen(false); setPendingDownload(null); setPendingMeta(null); };
  return { isOpen, triggerDownload, handleSubmit, handleClose };
};

// --- College Autocomplete Component ---
const CollegeAutocomplete = ({ value, onChange, onSelectCollege, inputCls }) => {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const wrapRef = useRef(null);

  // Sync external value changes (e.g. when form loads from storage)
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowDrop(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setAutoFilled(false);
    onChange(val); // update college in form (free text)

    if (val.trim().length >= 2) {
      const lower = val.toLowerCase();
      const matched = COLLEGES.filter((c) =>
        c.name.toLowerCase().includes(lower)
      ).slice(0, 10);
      setSuggestions(matched);
      setShowDrop(matched.length > 0);
    } else {
      setSuggestions([]);
      setShowDrop(false);
    }
  };

  const handleSelect = (college) => {
    setQuery(college.name);
    setAutoFilled(true);
    setSuggestions([]);
    setShowDrop(false);
    onSelectCollege(college); // fills college + province + region
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => {
            if (suggestions.length > 0) setShowDrop(true);
          }}
          placeholder="พิมพ์ชื่อวิทยาลัย..."
          className={`${inputCls} ${autoFilled ? 'border-green-400 bg-green-50' : ''} pr-8`}
          autoComplete="off"
        />
        {autoFilled && (
          <CheckCircle size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none" />
        )}
      </div>
      {showDrop && (
        <ul className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto text-sm">
          {suggestions.map((c, i) => (
            <li
              key={i}
              onMouseDown={() => handleSelect(c)}
              className="px-3 py-2.5 cursor-pointer hover:bg-blue-50 flex flex-col border-b border-gray-50 last:border-0"
            >
              <span className="font-medium text-gray-800">{c.name}</span>
              <span className="text-xs text-gray-400">{c.province} · {c.region}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// --- UI Helpers ---
const Field = ({ icon: Icon, label, required, children }) => (
  <div>
    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
      {Icon && <Icon size={13} className="text-blue-500" />}
      {label} {required && <span className="text-red-400">*</span>}
    </label>
    {children}
  </div>
);

const inputCls = 'w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 hover:bg-white transition placeholder:text-gray-400';

const CardRadio = ({ options, value, onChange, cols = 2 }) => (
  <div className={`grid grid-cols-${cols} gap-2`}>
    {options.map((opt) => (
      <label key={opt} className={`flex items-center justify-center cursor-pointer p-2.5 rounded-xl border-2 transition text-sm font-medium ${
        value === opt ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
      }`}>
        <input type="radio" value={opt} checked={value === opt} onChange={(e) => onChange(e.target.value)} className="sr-only" />
        {opt}
      </label>
    ))}
  </div>
);

const UserInfoModal = ({ isOpen, onSubmit, onClose }) => {
  const [form, setForm] = useState({
    prefix: '', prefixOther: '', firstName: '', lastName: '',
    email: '', position: '', positionOther: '', academicRank: '',
    department: '', college: '', province: '', region: '', affiliation: '',
  });
  const [step, setStep] = useState(1);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const iconClickCount = useRef(0);
  const iconClickTimer = useRef(null);

  // ── สร้าง payload พร้อม consent fields ก่อนส่งไป onSubmit ──
  const buildSubmitPayload = (formData) => ({
    ...formData,
    consentAccepted: true,
    consentTimestamp: new Date().toISOString(),
    consentText: DISCLAIMER_TEXT,
  });

  const handleIconClick = () => {
    iconClickCount.current += 1;
    clearTimeout(iconClickTimer.current);
    if (iconClickCount.current >= 3) {
      iconClickCount.current = 0;
      onSubmit(buildSubmitPayload({ prefix: 'ไม่ระบุ', firstName: 'ไม่ระบุ', lastName: '-', email: 'bypass@skip', position: 'ไม่ระบุ', academicRank: 'ไม่มี', college: 'ไม่ระบุ', province: 'ไม่ระบุ', region: 'ไม่ระบุ', affiliation: 'ไม่ระบุ' }));
      return;
    }
    iconClickTimer.current = setTimeout(() => { iconClickCount.current = 0; }, 1500);
  };

  useEffect(() => {
    if (isOpen) {
      const s = getStoredUserInfo();
      if (s) setForm(s);
      setStep(1);
      setConsentAccepted(false); // reset every time modal opens — must re-accept
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const u = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const s1ok = form.prefix && form.firstName.trim() && form.lastName.trim() && form.email.trim() && emailOk && form.position && form.academicRank;
  const s2ok = form.college.trim() && form.province && form.region && form.affiliation && consentAccepted;

  const handleCollegeSelect = (college) => {
    setForm((p) => ({ ...p, college: college.name, province: college.province, region: college.region }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto relative">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 rounded-t-2xl text-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white transition"><X size={22} /></button>
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-xl cursor-pointer select-none" onClick={handleIconClick}><Download className="w-6 h-6" /></div>
            <div>
              <h3 className="text-lg font-bold">ลงทะเบียนก่อนดาวน์โหลด</h3>
              <p className="text-xs text-blue-200">กรอกข้อมูลครั้งเดียว ใช้ได้ตลอด</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <div className={`flex-1 h-1.5 rounded-full transition ${step >= 1 ? 'bg-white' : 'bg-white/30'}`} />
            <div className={`flex-1 h-1.5 rounded-full transition ${step >= 2 ? 'bg-white' : 'bg-white/30'}`} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-blue-200">ข้อมูลส่วนตัว</span>
            <span className="text-[10px] text-blue-200">ข้อมูลสถานศึกษา</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {step === 1 ? (
            <div className="space-y-3.5 animate-in fade-in slide-in-from-right-2 duration-200">

              {/* Prefix */}
              <Field icon={User} label="คำนำหน้า" required>
                <select value={form.prefix} onChange={(e) => u('prefix', e.target.value)} className={inputCls}>
                  <option value="">-- เลือกคำนำหน้า --</option>
                  {PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {form.prefix === 'อื่นๆ' && (
                  <input type="text" value={form.prefixOther} onChange={(e) => u('prefixOther', e.target.value)}
                    placeholder="ระบุคำนำหน้า" className={`${inputCls} mt-2`} />
                )}
              </Field>

              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="ชื่อ" required>
                  <input type="text" value={form.firstName} onChange={(e) => u('firstName', e.target.value)}
                    placeholder="ชื่อ" className={inputCls} />
                </Field>
                <Field label="นามสกุล" required>
                  <input type="text" value={form.lastName} onChange={(e) => u('lastName', e.target.value)}
                    placeholder="นามสกุล" className={inputCls} />
                </Field>
              </div>

              {/* Email */}
              <Field icon={Mail} label="อีเมล" required>
                <input type="email" value={form.email} onChange={(e) => u('email', e.target.value)}
                  placeholder="example@email.com"
                  className={`${inputCls} ${form.email && !emailOk ? 'border-red-300 focus:ring-red-500' : ''}`} />
                {form.email && !emailOk && <p className="text-xs text-red-500 mt-1">กรุณากรอกอีเมลให้ถูกต้อง</p>}
              </Field>

              {/* Position */}
              <Field icon={Briefcase} label="ตำแหน่ง" required>
                <select value={form.position} onChange={(e) => u('position', e.target.value)} className={inputCls}>
                  <option value="">-- เลือกตำแหน่ง --</option>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {form.position === 'อื่นๆ' && (
                  <input type="text" value={form.positionOther} onChange={(e) => u('positionOther', e.target.value)}
                    placeholder="ระบุตำแหน่ง" className={`${inputCls} mt-2`} />
                )}
              </Field>

              {/* Academic Rank */}
              <Field icon={Award} label="วิทยฐานะ" required>
                <select value={form.academicRank} onChange={(e) => u('academicRank', e.target.value)} className={inputCls}>
                  <option value="">-- เลือกวิทยฐานะ --</option>
                  {ACADEMIC_RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>

              <button onClick={() => setStep(2)} disabled={!s1ok}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                ถัดไป <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <div className="space-y-3.5 animate-in fade-in slide-in-from-right-2 duration-200">

              {/* Department */}
              <Field icon={GraduationCap} label="สาขาวิชา">
                <input type="text" value={form.department} onChange={(e) => u('department', e.target.value)}
                  placeholder="เช่น ช่างยนต์, บัญชี, คอมพิวเตอร์ธุรกิจ" className={inputCls} />
              </Field>

              {/* College with autocomplete */}
              <Field icon={Building2} label="วิทยาลัย" required>
                <CollegeAutocomplete
                  value={form.college}
                  onChange={(val) => u('college', val)}
                  onSelectCollege={handleCollegeSelect}
                  inputCls={inputCls}
                />
              </Field>

              {/* Province — auto-filled or manual select */}
              <Field icon={MapPin} label="จังหวัด" required>
                <div className="relative">
                  <select
                    value={form.province}
                    onChange={(e) => u('province', e.target.value)}
                    className={`${inputCls} ${form.province ? 'border-green-300 bg-green-50' : ''}`}
                  >
                    <option value="">-- เลือกจังหวัด --</option>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {form.province && (
                    <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full pointer-events-none">อัตโนมัติ</span>
                  )}
                </div>
              </Field>

              {/* Region — auto-filled or manual select */}
              <Field icon={MapPin} label="ภาค" required>
                <div className="relative">
                  <select
                    value={form.region}
                    onChange={(e) => u('region', e.target.value)}
                    className={`${inputCls} ${form.region ? 'border-green-300 bg-green-50' : ''}`}
                  >
                    <option value="">-- เลือกภาค --</option>
                    {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {form.region && (
                    <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full pointer-events-none">อัตโนมัติ</span>
                  )}
                </div>
              </Field>

              {/* Affiliation */}
              <Field icon={Shield} label="สังกัด" required>
                <CardRadio options={AFFILIATIONS} value={form.affiliation} onChange={(v) => u('affiliation', v)} cols={2} />
              </Field>

              {/* ── Disclaimer Checkbox ────────────────────────────────────── */}
              <div className="border-2 border-amber-300 bg-amber-50/50 rounded-xl p-3">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(e) => setConsentAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-amber-600 cursor-pointer shrink-0"
                  />
                  <span className="text-xs leading-relaxed text-amber-900">
                    <span className="font-bold text-amber-800">⚠️ ข้อตกลงก่อนดาวน์โหลด</span>
                    <br />
                    {DISCLAIMER_TEXT}
                  </span>
                </label>
                <p className="text-[10px] text-amber-700/70 mt-2 italic pl-7">
                  หมายเหตุ: ข้อมูลของท่าน + เวลายอมรับเงื่อนไข จะถูกบันทึกเพื่อเป็นหลักฐาน (PDPA)
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(1)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition flex items-center justify-center gap-1">
                  <ChevronLeft size={18} /> ย้อนกลับ
                </button>
                <button onClick={() => { if (s2ok) onSubmit(buildSubmitPayload(form)); }} disabled={!s2ok}
                  className="flex-[2] bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  <Download size={18} /> ยืนยันและดาวน์โหลด
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-400 text-center mt-4">
            ข้อมูลจะถูกเก็บในเบราว์เซอร์ของคุณ กรอกครั้งเดียวไม่ต้องกรอกซ้ำ
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserInfoModal;
