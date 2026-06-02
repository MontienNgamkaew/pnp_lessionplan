import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, BookOpen, GraduationCap } from 'lucide-react';
import coreSubjectsData from '../../data/coreSubjects.json';

const MAX_RESULTS = 20;
const DEBOUNCE_MS = 200;

const CoreSubjectSearch = ({ isOpen, onClose, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setDebouncedTerm('');
      setLevelFilter('all');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Debounce search input
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedTerm(value);
    }, DEBOUNCE_MS);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Build tagged subject list
  const allSubjects = useMemo(() => {
    const pvchList = (coreSubjectsData.pvch || []).map((s) => ({ ...s, level: 'pvch' }));
    const pvsList = (coreSubjectsData.pvs || []).map((s) => ({ ...s, level: 'pvs' }));
    return [...pvchList, ...pvsList];
  }, []);

  // Filter and search
  const filteredResults = useMemo(() => {
    let subjects = allSubjects;

    // Level filter
    if (levelFilter === 'pvch') {
      subjects = subjects.filter((s) => s.level === 'pvch');
    } else if (levelFilter === 'pvs') {
      subjects = subjects.filter((s) => s.level === 'pvs');
    }

    // Search filter
    if (debouncedTerm.trim()) {
      const term = debouncedTerm.trim().toLowerCase();
      subjects = subjects.filter(
        (s) =>
          s.code.toLowerCase().includes(term) ||
          s.nameTh.toLowerCase().includes(term) ||
          s.nameEn.toLowerCase().includes(term)
      );
    }

    return subjects.slice(0, MAX_RESULTS);
  }, [allSubjects, levelFilter, debouncedTerm]);

  // Total count before slicing
  const totalCount = useMemo(() => {
    let subjects = allSubjects;
    if (levelFilter === 'pvch') subjects = subjects.filter((s) => s.level === 'pvch');
    else if (levelFilter === 'pvs') subjects = subjects.filter((s) => s.level === 'pvs');
    if (debouncedTerm.trim()) {
      const term = debouncedTerm.trim().toLowerCase();
      subjects = subjects.filter(
        (s) =>
          s.code.toLowerCase().includes(term) ||
          s.nameTh.toLowerCase().includes(term) ||
          s.nameEn.toLowerCase().includes(term)
      );
    }
    return subjects.length;
  }, [allSubjects, levelFilter, debouncedTerm]);

  // Handle subject selection
  const handleSelect = (subject) => {
    const creditParts = subject.credit ? subject.credit.split('-') : ['0'];
    const lastCredit = creditParts[creditParts.length - 1];

    onSelect({
      courseCode: subject.code,
      courseName: subject.nameTh,
      credits: lastCredit,
      ratio: subject.credit,
      standardRef: subject.standardRef || '-',
      learningOutcomes: subject.learningOutcome || '',
      objectives: subject.objectives || '',
      competencies: subject.competencies || '',
      description: subject.description || '',
    });
    onClose();
  };

  // Highlight matching text
  const highlightMatch = (text, term) => {
    if (!term.trim()) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Close on backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const levelTabs = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'pvch', label: 'ปวช.' },
    { key: 'pvs', label: 'ปวส.' },
  ];

  return (
    <div
      className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="pnp-shell-card rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden">
        {/* Header */}
        <div className="bg-slate-950 p-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <div className="bg-white/20 p-2 rounded-full">
              <BookOpen size={20} />
            </div>
            <h3 className="font-bold text-lg">ค้นหารายวิชาหมวดสมรรถนะแกนกลาง</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition p-1 hover:bg-white/10 rounded-full"
          >
            <X size={24} />
          </button>
        </div>

        {/* Level Filter Tabs */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-100 bg-gray-50">
          <div className="flex gap-2 mb-3">
            {levelTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setLevelFilter(tab.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  levelFilter === tab.key
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="ค้นหาด้วยรหัสวิชา ชื่อวิชาภาษาไทย หรือภาษาอังกฤษ..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setDebouncedTerm('');
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Result Count */}
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <span>
              {totalCount > 0 ? (
                <>
                  พบ{' '}
                  <span className="inline-flex items-center justify-center bg-blue-100 text-blue-700 font-semibold rounded-full px-2 py-0.5 min-w-[1.5rem]">
                    {totalCount}
                  </span>{' '}
                  รายวิชา
                  {totalCount > MAX_RESULTS && (
                    <span className="text-gray-400 ml-1">(แสดง {MAX_RESULTS} รายการแรก)</span>
                  )}
                </>
              ) : debouncedTerm.trim() ? (
                'ไม่พบรายวิชาที่ตรงกัน'
              ) : (
                'พิมพ์เพื่อค้นหารายวิชา'
              )}
            </span>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto">
          {filteredResults.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {filteredResults.map((subject, idx) => (
                <li key={`${subject.code}-${subject.level}-${idx}`}>
                  <button
                    onClick={() => handleSelect(subject)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-sm font-semibold text-blue-700 group-hover:text-blue-800">
                            {highlightMatch(subject.code, debouncedTerm)}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              subject.level === 'pvch'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {subject.level === 'pvch' ? 'ปวช.' : 'ปวส.'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {highlightMatch(subject.nameTh, debouncedTerm)}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {highlightMatch(subject.nameEn, debouncedTerm)}
                        </p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <GraduationCap size={14} className="text-gray-400" />
                        <span className="font-medium">{subject.credit}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="bg-gray-100 rounded-full p-4 mb-4">
                <Search size={32} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium mb-1">ไม่พบรายวิชาที่ตรงกัน</p>
              <p className="text-gray-400 text-sm">
                ลองค้นหาด้วยรหัสวิชา หรือชื่อวิชาอื่น
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoreSubjectSearch;
