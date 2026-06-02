import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, GraduationCap, FileText, Loader2, CheckCircle } from 'lucide-react';

const API_BASE = 'https://ai-findsubject.onrender.com';
const DEBOUNCE_MS = 300;

const SubjectSearchPopup = ({ isOpen, onClose, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [results, setResults] = useState({ departments: [], subjects: [] });
  const [totalDepts, setTotalDepts] = useState(0);
  const [totalSubjects, setTotalSubjects] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Load categories and stats on open
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setLevelFilter('');
      setCategoryFilter('');
      setResults({ departments: [], subjects: [] });
      setHasSearched(false);
      setTimeout(() => inputRef.current?.focus(), 150);

      fetch(`${API_BASE}/api/categories`)
        .then(r => r.json())
        .then(setCategories)
        .catch(() => {});

      fetch(`${API_BASE}/api/stats`)
        .then(r => r.json())
        .then(setStats)
        .catch(() => {});
    }
  }, [isOpen]);

  // Cleanup debounce
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Search function
  const doSearch = useCallback(async (q, level, category) => {
    if (!q && !level && !category) {
      setResults({ departments: [], subjects: [] });
      setHasSearched(false);
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (level) params.set('level', level);
      if (category) params.set('category', category);
      params.set('type', 'subjects');

      const res = await fetch(`${API_BASE}/api/search?${params}`);
      const data = await res.json();
      setResults({ departments: data.departments || [], subjects: data.subjects || [] });
      setTotalDepts(data.totalDepartments || 0);
      setTotalSubjects(data.totalSubjects || 0);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search on input change
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(value.trim(), levelFilter, categoryFilter);
    }, DEBOUNCE_MS);
  };

  // Filter changes trigger immediate search
  const handleLevelChange = (level) => {
    setLevelFilter(level);
    doSearch(searchTerm.trim(), level, categoryFilter);
  };

  const handleCategoryChange = (cat) => {
    setCategoryFilter(cat);
    doSearch(searchTerm.trim(), levelFilter, cat);
  };

  // Select subject — pass basic fields + flag for parent to fetch detail
  const handleSelect = (subject) => {
    const creditParts = subject.credit ? subject.credit.split('-') : ['0'];
    const lastCredit = creditParts[creditParts.length - 1];

    onSelect({
      courseCode: subject.code,
      courseName: subject.nameTh,
      credits: lastCredit,
      ratio: subject.credit,
      pdfUrl: subject.pdfUrl || '',
      pdfPage: subject.pdfPage || '',
      deptCode: subject.deptCode || '',
      _needDetail: true,
    });
    onClose();
  };

  // Highlight matching text
  const highlight = (text, term) => {
    if (!term || !text) return text;
    try {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      return parts.map((part, i) =>
        regex.test(part) ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark> : part
      );
    } catch { return text; }
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const levelTabs = [
    { key: '', label: 'ทั้งหมด' },
    { key: 'ปวช.', label: 'ปวช.' },
    { key: 'ปวส.', label: 'ปวส.' },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col relative overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <div className="bg-white/20 p-2 rounded-full">
              <Search size={20} />
            </div>
            <div>
              <h3 className="font-bold text-lg">ค้นหารายวิชา ปวช./ปวส.</h3>
              {stats && (
                <p className="text-xs text-white/70">
                  {stats.total} สาขาวิชา | {stats.subjects?.toLocaleString()} รายวิชา
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition p-1 hover:bg-white/10 rounded-full">
            <X size={24} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-100 bg-gray-50 space-y-2">
          {/* Level tabs */}
          <div className="flex gap-2">
            {levelTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleLevelChange(tab.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  levelFilter === tab.key
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {/* Category filter */}
            {categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="ml-auto px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">ทุกประเภทวิชา</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="พิมพ์ค้นหาชื่อรายวิชา สาขาวิชา หรือรหัสวิชา..."
              className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition"
            />
            {searchTerm && (
              <button
                onClick={() => { setSearchTerm(''); setResults({ departments: [], subjects: [] }); setHasSearched(false); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Result Count */}
          {hasSearched && (
            <div className="text-xs text-gray-500 flex items-center gap-1">
              {loading ? (
                <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> กำลังค้นหา...</span>
              ) : (
                <span>
                  พบ{' '}
                  <span className="inline-flex items-center justify-center bg-blue-100 text-blue-700 font-semibold rounded-full px-2 py-0.5 min-w-[1.5rem]">
                    {totalSubjects}
                  </span>{' '}
                  รายวิชา
                  {totalSubjects > 200 && <span className="text-gray-400 ml-1">(แสดง 200 รายการแรก)</span>}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading && !results.subjects.length ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 size={32} className="text-blue-500 animate-spin mb-3" />
              <p className="text-gray-500">กำลังค้นหา...</p>
            </div>
          ) : results.subjects.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {results.subjects.map((subject) => {
                return (
                  <li key={`${subject.code}-${subject.deptCode}`}>
                    <div className="px-4 py-3 hover:bg-blue-50/50 transition-colors">
                      {/* Main row */}
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className="flex-1 min-w-0"
                        >
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-blue-700">
                              {highlight(subject.code, searchTerm.trim())}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              subject.level === 'ปวช.' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {subject.level}
                            </span>
                            {subject.category && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                {subject.category}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-800">
                            {highlight(subject.nameTh, searchTerm.trim())}
                          </p>
                          {subject.nameEn && (
                            <p className="text-xs text-gray-500 truncate">
                              {highlight(subject.nameEn, searchTerm.trim())}
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            สาขาวิชา: {highlight(subject.deptName, searchTerm.trim())}
                          </p>
                        </div>

                        <div className="flex-shrink-0 flex flex-col items-end gap-1.5 mt-1">
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <GraduationCap size={14} className="text-gray-400" />
                            <span className="font-medium">{subject.credit}</span>
                          </div>
                          <button
                            onClick={() => handleSelect(subject)}
                            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-full transition shadow-sm border border-emerald-200"
                            title="เลือกรายวิชานี้และนำข้อมูลไปกรอกในฟอร์ม"
                          >
                            <CheckCircle size={13} /> เลือก
                          </button>
                          {subject.pdfUrl && (
                            <a
                              href={subject.pdfPage ? `${subject.pdfUrl}#page=${subject.pdfPage}` : subject.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs font-bold text-pink-700 hover:text-pink-900 bg-pink-100 hover:bg-pink-200 px-3 py-1.5 rounded-full transition shadow-sm border border-pink-200"
                              onClick={(e) => e.stopPropagation()}
                              title="เปิดหลักสูตร PDF ต้นฉบับ"
                            >
                              <FileText size={13} /> PDF {subject.pdfPage ? `หน้า ${subject.pdfPage}` : ''}
                            </a>
                          )}
                        </div>
                      </div>

                    </div>
                  </li>
                );
              })}
            </ul>
          ) : hasSearched ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="bg-gray-100 rounded-full p-4 mb-4">
                <Search size={32} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium mb-1">ไม่พบรายวิชาที่ตรงกัน</p>
              <p className="text-gray-400 text-sm">ลองค้นหาด้วยรหัสวิชา ชื่อวิชา หรือเลือกประเภทวิชาอื่น</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="bg-blue-50 rounded-full p-4 mb-4">
                <Search size={32} className="text-blue-400" />
              </div>
              <p className="text-gray-600 font-medium mb-1">ค้นหารายวิชา</p>
              <p className="text-gray-400 text-sm">พิมพ์ชื่อวิชา รหัสวิชา หรือเลือกประเภทวิชาเพื่อเริ่มค้นหา</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubjectSearchPopup;
