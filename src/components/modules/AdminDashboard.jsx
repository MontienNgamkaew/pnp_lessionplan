import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, Eye, Download, Sparkles, Users, Lock, Loader2, RefreshCw, Search, ChevronDown, ChevronUp, ChevronRight, BarChart3, MapPin, Building2, GraduationCap, Calendar, Mail, FileText, TrendingUp, LogOut, Filter, User, Phone, BookOpen, Briefcase, X } from 'lucide-react';
import { printToPdf, createWordDoc } from '../../utils/exportHelpers';
import { ADMIN_PASSWORD } from '../../constants/adminAuth';

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbyxjQPVEx1FGPOvkCZ43V4STKKhY6VCgodo-A25ykPGiCWaIJGxDe8IvWBvNXcP7GLz/exec';

const THAILAND_PROVINCES_BY_REGION = {
  'ภาคเหนือ': ['เชียงใหม่','เชียงราย','ลำปาง','ลำพูน','แม่ฮ่องสอน','น่าน','พะเยา','แพร่','อุตรดิตถ์','ตาก','สุโขทัย','พิษณุโลก','พิจิตร','กำแพงเพชร','เพชรบูรณ์','นครสวรรค์','อุทัยธานี'],
  'ภาคกลาง': ['กรุงเทพมหานคร','นนทบุรี','ปทุมธานี','สมุทรปราการ','สมุทรสาคร','สมุทรสงคราม','นครปฐม','พระนครศรีอยุธยา','อ่างทอง','ลพบุรี','สิงห์บุรี','ชัยนาท','สระบุรี','นครนายก','สุพรรณบุรี','กาญจนบุรี','ราชบุรี','เพชรบุรี','ประจวบคีรีขันธ์'],
  'ภาคตะวันออกเฉียงเหนือ': ['นครราชสีมา','บุรีรัมย์','สุรินทร์','ศรีสะเกษ','อุบลราชธานี','ยโสธร','ชัยภูมิ','อำนาจเจริญ','หนองบัวลำภู','ขอนแก่น','อุดรธานี','เลย','หนองคาย','มหาสารคาม','ร้อยเอ็ด','กาฬสินธุ์','สกลนคร','นครพนม','มุกดาหาร','บึงกาฬ'],
  'ภาคตะวันออก': ['ชลบุรี','ระยอง','จันทบุรี','ตราด','ฉะเชิงเทรา','ปราจีนบุรี','สระแก้ว'],
  'ภาคใต้': ['นครศรีธรรมราช','กระบี่','พังงา','ภูเก็ต','สุราษฎร์ธานี','ระนอง','ชุมพร','สงขลา','สตูล','ตรัง','พัทลุง','ปัตตานี','ยะลา','นราธิวาส'],
};

const StatCard = ({ icon: Icon, label, value, color, bgColor }) => (
  <div className={`${bgColor} rounded-xl p-4 border`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className={`text-2xl font-bold ${color} mt-1`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
      </div>
      <div className={`p-3 rounded-full ${bgColor}`}>
        <Icon size={24} className={color} />
      </div>
    </div>
  </div>
);

const AdminDashboard = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [data, setData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [sortField, setSortField] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);

  // Filter states
  const [filterRegion, setFilterRegion] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterAffiliation, setFilterAffiliation] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Pagination (must be declared here with all other hooks, not after useMemo)
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when filters change (MUST be before any early return)
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterRegion, filterProvince, filterPosition, filterAffiliation, filterDateFrom, filterDateTo]);

  const handleLogin = () => {
    if (code.trim() === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setCodeError('');
      fetchData();
    } else {
      setCodeError('รหัสไม่ถูกต้อง');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setDashboardError('');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`${SHEET_URL}?action=dashboard`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setDashboardError(err.name === 'AbortError'
        ? 'โหลดข้อมูล Dashboard ไม่สำเร็จ: ปลายทางตอบช้าเกิน 12 วินาที'
        : `โหลดข้อมูล Dashboard ไม่สำเร็จ: ${err.message || 'ไม่ทราบสาเหตุ'}`
      );
      setData({ users: [], stats: [], summary: { totalUsers: 0, totalEvents: 0, totalVisits: 0, totalDownloads: 0, totalGenerations: 0 } });
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  // ALL hooks must be called before any early return
  const users = data?.users || [];
  const stats = data?.stats || [];
  const summary = data?.summary || {};

  const uniqueUserCount = useMemo(() => {
    const seen = new Set();
    users.forEach((u) => {
      const key = `${(u.firstName || '').trim()}|${(u.lastName || '').trim()}`.toLowerCase();
      if (key !== '|') seen.add(key);
    });
    return seen.size;
  }, [users]);

  const uniqueRegions = useMemo(() => [...new Set(users.map(u => u.region).filter(Boolean))].sort(), [users]);
  const uniqueProvinces = useMemo(() => [...new Set(users.map(u => u.province).filter(Boolean))].sort(), [users]);
  const uniquePositions = useMemo(() => [...new Set(users.map(u => u.position).filter(Boolean))].sort(), [users]);
  const uniqueAffiliations = useMemo(() => [...new Set(users.map(u => u.affiliation).filter(Boolean))].sort(), [users]);

  // Dedup users by firstName+lastName for all summaries (MUST be before early returns)
  const dedupUsers = useMemo(() => {
    const seen = new Map();
    users.forEach((u) => {
      const key = `${(u.firstName || '').trim()}|${(u.lastName || '').trim()}`.toLowerCase();
      if (key !== '|' && !seen.has(key)) seen.set(key, u);
    });
    return Array.from(seen.values());
  }, [users]);

  // Login screen
  if (!isLoggedIn) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 min-h-[80vh] flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="bg-blue-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
              <Lock className="text-blue-600 w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Admin Dashboard</h2>
            <p className="text-gray-500 text-sm mt-1">กรุณาใส่รหัสแอดมินเพื่อเข้าใช้งาน</p>
            <p className="text-gray-400 text-xs mt-1">ใช้รหัส admin กลางล่าสุด</p>
          </div>
          <div className="space-y-4">
            <div>
              <input
                type="password"
                value={code}
                onChange={(e) => { setCode(e.target.value); setCodeError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="ใส่รหัสแอดมิน"
                className="w-full p-3 border border-gray-300 rounded-xl text-center text-lg tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              {codeError && <p className="text-red-500 text-sm text-center mt-2">{codeError}</p>}
            </div>
            <button
              onClick={handleLogin}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2"
            >
              <Lock size={18} /> เข้าสู่ระบบ
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 min-h-[80vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลดข้อมูล Dashboard...</p>
        </div>
      </div>
    );
  }

  // All summary counts use dedupUsers
  const regionCounts = {};
  dedupUsers.forEach((u) => { const r = u.region || 'ไม่ระบุ'; regionCounts[r] = (regionCounts[r] || 0) + 1; });

  const affiliationCounts = {};
  dedupUsers.forEach((u) => { const a = u.affiliation || 'ไม่ระบุ'; affiliationCounts[a] = (affiliationCounts[a] || 0) + 1; });

  const positionCounts = {};
  dedupUsers.forEach((u) => { const p = u.position || 'ไม่ระบุ'; positionCounts[p] = (positionCounts[p] || 0) + 1; });

  const provinceCounts = {};
  dedupUsers.forEach((u) => { const p = u.province || 'ไม่ระบุ'; provinceCounts[p] = (provinceCounts[p] || 0) + 1; });

  // Helper: parse Thai date "dd/MM/yyyy HH:mm:ss" or "dd/MM/yyyy" to comparable string "yyyy-MM-dd"
  const parseThaiDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split(' ')[0].split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    return dateStr;
  };

  // Filter users by search + dropdown + date filters
  const filteredUsers = dedupUsers.filter((u) => {
    // Dropdown filters (AND logic)
    if (filterRegion && u.region !== filterRegion) return false;
    if (filterProvince && u.province !== filterProvince) return false;
    if (filterPosition && u.position !== filterPosition) return false;
    if (filterAffiliation && u.affiliation !== filterAffiliation) return false;
    // Date range filter
    if (filterDateFrom || filterDateTo) {
      const d = parseThaiDate(u.date);
      if (filterDateFrom && d < filterDateFrom) return false;
      if (filterDateTo && d > filterDateTo) return false;
    }
    // Text search
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return [u.firstName, u.lastName, u.email, u.college, u.province, u.department, u.course]
      .some((f) => f && String(f).toLowerCase().includes(term));
  });

  // Sort
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const av = a[sortField] || '';
    const bv = b[sortField] || '';
    return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  // Pagination for users
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / ITEMS_PER_PAGE));
  const paginatedUsers = sortedUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const toggleSort = (field) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const PIE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];

  const renderPieChart = (counts) => {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    if (total === 0) return <p className="text-xs text-gray-400 text-center py-4">ไม่มีข้อมูล</p>;

    // Build SVG pie slices
    let cumulative = 0;
    const slices = sorted.map(([label, count], i) => {
      const pct = count / total;
      const startAngle = cumulative * 360;
      cumulative += pct;
      const endAngle = cumulative * 360;
      const largeArc = pct > 0.5 ? 1 : 0;
      const startRad = ((startAngle - 90) * Math.PI) / 180;
      const endRad = ((endAngle - 90) * Math.PI) / 180;
      const x1 = 50 + 40 * Math.cos(startRad);
      const y1 = 50 + 40 * Math.sin(startRad);
      const x2 = 50 + 40 * Math.cos(endRad);
      const y2 = 50 + 40 * Math.sin(endRad);
      const color = PIE_COLORS[i % PIE_COLORS.length];
      const d = pct >= 0.999
        ? `M 50 10 A 40 40 0 1 1 49.999 10 Z`
        : `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`;
      return { label, count, pct, color, d };
    });

    return (
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="w-28 h-28 flex-shrink-0">
          {slices.map((s, i) => (
            <path key={i} d={s.d} fill={s.color} stroke="white" strokeWidth="1" />
          ))}
        </svg>
        <div className="flex-1 space-y-1 max-h-32 overflow-y-auto">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-gray-700 truncate flex-1">{s.label}</span>
              <span className="font-bold text-gray-800">{s.count}</span>
              <span className="text-gray-400">({Math.round(s.pct * 100)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Province heatmap color helper
  const getProvinceColor = (count, maxCount) => {
    if (count === 0 || maxCount === 0) return 'bg-gray-100 text-gray-400';
    const ratio = count / maxCount;
    if (ratio > 0.75) return 'bg-blue-800 text-white';
    if (ratio > 0.5) return 'bg-blue-600 text-white';
    if (ratio > 0.25) return 'bg-blue-400 text-white';
    if (ratio > 0.1) return 'bg-blue-300 text-blue-900';
    return 'bg-blue-100 text-blue-800';
  };

  // Export helpers
  const buildExportTableHtml = (usersToExport) => {
    const rows = usersToExport.map((u, idx) => `<tr>
      <td>${idx + 1}</td>
      <td>${u.date || ''}</td>
      <td>${u.prefix || ''}${u.firstName || ''} ${u.lastName || ''}</td>
      <td>${u.email || ''}</td>
      <td>${u.position || ''}${u.academicRank && u.academicRank !== 'ไม่มี' ? ` (${u.academicRank})` : ''}</td>
      <td>${u.college || ''}</td>
      <td>${u.province || ''}</td>
      <td>${u.region || ''} / ${u.affiliation || ''}</td>
      <td>${u.course || ''}</td>
    </tr>`).join('');

    return `<table>
      <thead><tr>
        <th>#</th><th>วันที่</th><th>ชื่อ-นามสกุล</th><th>อีเมล</th>
        <th>ตำแหน่ง/วิทยฐานะ</th><th>วิทยาลัย</th><th>จังหวัด</th>
        <th>ภาค/สังกัด</th><th>รายวิชา</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  };

  const handleExportExcel = () => {
    const tableHtml = buildExportTableHtml(sortedUsers);
    const fullHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Users</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>table{border-collapse:collapse;}th,td{border:1px solid #000;padding:5px;}</style>
</head><body>${tableHtml}</body></html>`;

    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin_dashboard_users_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const filterInfo = [
      filterRegion && `ภาค: ${filterRegion}`,
      filterProvince && `จังหวัด: ${filterProvince}`,
      filterPosition && `ตำแหน่ง: ${filterPosition}`,
      filterAffiliation && `สังกัด: ${filterAffiliation}`,
      searchTerm && `ค้นหา: ${searchTerm}`,
    ].filter(Boolean).join(' | ');

    const headerHtml = filterInfo
      ? `<p style="font-size:12px;color:#666;margin-bottom:10px;">ตัวกรอง: ${filterInfo}</p>`
      : '';
    const summaryHtml = `<p style="font-size:13px;margin-bottom:10px;">จำนวนทั้งหมด: ${sortedUsers.length} รายการ</p>`;
    const tableHtml = buildExportTableHtml(sortedUsers);

    printToPdf('รายงานผู้ใช้งาน AI ช่วยทำแผนการสอน', headerHtml + summaryHtml + tableHtml);
  };

  const tabs = [
    { id: 'overview', label: 'ภาพรวม', icon: BarChart3 },
    { id: 'users', label: 'ผู้ใช้งาน', icon: Users },
    { id: 'activity', label: 'กิจกรรม', icon: TrendingUp },
    { id: 'changelog', label: 'บันทึกอัปเดต', icon: Calendar },
  ];

  // Changelog data
  const CHANGELOG = [
    { date: '2026-03-24', version: 'v2.5.0', changes: ['เพิ่ม Admin Dashboard พร้อมกราฟวงกลม', 'เพิ่ม pagination ผู้ใช้ 10 คน/หน้า', 'เพิ่มคอลัมน์ชื่อ-นามสกุลในกิจกรรม', 'แก้ hooks order violation ที่ทำให้หน้าจอขาว'] },
    { date: '2026-03-24', version: 'v2.4.0', changes: ['ปรับตารางวิเคราะห์งาน 5 คอลัมน์ (งานหลัก/งานย่อย/สมรรถนะย่อย/ความรู้/ทักษะ)', 'เปลี่ยนสาระสำคัญเป็นแสดงหัวข้อ (bullet points)', 'เพิ่ม 3 โหมดแบ่งหน่วย: งานหลัก/งานย่อย/AI คิดให้'] },
    { date: '2026-03-23', version: 'v2.3.0', changes: ['เพิ่มฟอร์มกรอกข้อมูลก่อน Download', 'เก็บข้อมูลผู้ใช้ลง Google Sheet', 'เพิ่มสถิติการใช้งานจริงจาก Google Sheet', 'เพิ่มปุ่มล้างข้อมูลแคชทั้งหมด'] },
    { date: '2026-03-22', version: 'v2.2.0', changes: ['รองรับ 4 AI Providers: Gemini/OpenAI/Claude/DeepSeek', 'แสดงสถานะ API (พร้อมใช้งาน/ใช้ไม่ได้)', 'เพิ่มน้องเพชรช่วยค้นหามาตรฐานอาชีพ', 'เพิ่มส่วนหัวไฟล์ Word มาตรฐานอาชีพ'] },
    { date: '2026-03-21', version: 'v2.1.0', changes: ['แก้ CompetencyModule crash (providerId missing)', 'แก้ error message แสดงสาเหตุจริง', 'เพิ่ม auto-retry สำหรับ rate limit'] },
    { date: '2026-03-20', version: 'v2.0.0', changes: ['Version 1 — Baseline', 'แยก code เป็น modules', 'รองรับ multi-provider AI', '5 modules: วิเคราะห์งาน/ผลลัพธ์/สมรรถนะ/จุดประสงค์/สาระการเรียนรู้'] },
  ];

  // Province heatmap data
  const maxProvinceCount = Math.max(...Object.values(provinceCounts), 1);

  return (
    <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6 min-h-[80vh]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <LayoutDashboard className="text-blue-600" /> Admin Dashboard
          </h2>
          <p className="text-gray-500 text-sm mt-1">สถิติการใช้งานระบบ AI ช่วยทำแผนการสอน</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} disabled={loading} className="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-100 text-sm font-medium flex items-center gap-1.5 border border-blue-200">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> รีเฟรช
          </button>
          <button onClick={() => { setIsLoggedIn(false); setCode(''); }} className="bg-gray-50 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm font-medium flex items-center gap-1.5 border border-gray-200">
            <LogOut size={14} /> ออกจากระบบ
          </button>
        </div>
      </div>

      {dashboardError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{dashboardError}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard icon={Users} label="ผู้ใช้ทั้งหมด (ไม่ซ้ำ)" value={uniqueUserCount} color="text-blue-600" bgColor="bg-blue-50 border-blue-200" />
        <StatCard icon={Download} label="จำนวนครั้ง Download" value={summary.totalDownloads || 0} color="text-orange-600" bgColor="bg-orange-50 border-orange-200" />
        <StatCard icon={Eye} label="เข้าใช้งาน" value={summary.totalVisits || 0} color="text-green-600" bgColor="bg-green-50 border-green-200" />
        <StatCard icon={Sparkles} label="สร้างแผนฯ" value={summary.totalGenerations || 0} color="text-purple-600" bgColor="bg-purple-50 border-purple-200" />
        <StatCard icon={FileText} label="ลงทะเบียนทั้งหมด" value={users.length} color="text-teal-600" bgColor="bg-teal-50 border-teal-200" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={15} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><MapPin size={14} className="text-blue-500" /> จำแนกตามภาค</h3>
              {renderPieChart(regionCounts, 'bg-blue-500')}
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><Building2 size={14} className="text-green-500" /> จำแนกตามสังกัด</h3>
              {renderPieChart(affiliationCounts, 'bg-green-500')}
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><GraduationCap size={14} className="text-purple-500" /> จำแนกตามตำแหน่ง</h3>
              {renderPieChart(positionCounts, 'bg-purple-500')}
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><MapPin size={14} className="text-orange-500" /> จำแนกตามจังหวัด (Top 10)</h3>
              {renderPieChart(Object.fromEntries(Object.entries(provinceCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)), 'bg-orange-500')}
            </div>
          </div>

          {/* Thailand Province Heatmap */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
              <MapPin size={14} className="text-blue-500" /> แผนที่ความหนาแน่นผู้ใช้ตามจังหวัด
            </h3>
            {/* Color legend */}
            <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
              <span>น้อย</span>
              <div className="flex gap-0.5">
                <div className="w-6 h-4 rounded bg-gray-100 border border-gray-200"></div>
                <div className="w-6 h-4 rounded bg-blue-100"></div>
                <div className="w-6 h-4 rounded bg-blue-300"></div>
                <div className="w-6 h-4 rounded bg-blue-400"></div>
                <div className="w-6 h-4 rounded bg-blue-600"></div>
                <div className="w-6 h-4 rounded bg-blue-800"></div>
              </div>
              <span>มาก</span>
            </div>
            {Object.entries(THAILAND_PROVINCES_BY_REGION).map(([region, provinces]) => (
              <div key={region} className="mb-4">
                <h4 className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                  {region}
                  <span className="font-normal text-gray-400">({provinces.reduce((sum, p) => sum + (provinceCounts[p] || 0), 0)} คน)</span>
                </h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
                  {provinces.map((province) => {
                    const count = provinceCounts[province] || 0;
                    const colorClass = getProvinceColor(count, maxProvinceCount);
                    return (
                      <div
                        key={province}
                        className={`${colorClass} rounded-lg px-2 py-1.5 text-center border border-gray-200 transition-all hover:scale-105 cursor-default`}
                        title={`${province}: ${count} คน`}
                      >
                        <div className="text-[10px] leading-tight truncate">{province}</div>
                        <div className="text-xs font-bold">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          {/* Filters */}
          <div className="mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-gray-600">
              <Filter size={12} /> ตัวกรอง
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">ภาค (ทั้งหมด)</option>
                {uniqueRegions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select
                value={filterProvince}
                onChange={(e) => setFilterProvince(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">จังหวัด (ทั้งหมด)</option>
                {uniqueProvinces.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={filterPosition}
                onChange={(e) => setFilterPosition(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">ตำแหน่ง (ทั้งหมด)</option>
                {uniquePositions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={filterAffiliation}
                onChange={(e) => setFilterAffiliation(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">สังกัด (ทั้งหมด)</option>
                {uniqueAffiliations.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {/* Date range filter */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              <div className="col-span-2 md:col-span-2 flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap">วันที่:</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <span className="text-xs text-gray-400">ถึง</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>
            {(filterRegion || filterProvince || filterPosition || filterAffiliation || filterDateFrom || filterDateTo) && (
              <button
                onClick={() => { setFilterRegion(''); setFilterProvince(''); setFilterPosition(''); setFilterAffiliation(''); setFilterDateFrom(''); setFilterDateTo(''); }}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>

          <div className="mb-3 flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="relative flex-1 w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาชื่อ, วิทยาลัย, จังหวัด, อีเมล..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">{sortedUsers.length} รายการ</span>
              <button
                onClick={handleExportExcel}
                className="bg-green-50 text-green-700 px-3 py-2 rounded-lg hover:bg-green-100 text-xs font-medium flex items-center gap-1.5 border border-green-200 whitespace-nowrap"
              >
                <FileText size={13} /> Excel
              </button>
              <button
                onClick={handleExportPdf}
                className="bg-red-50 text-red-700 px-3 py-2 rounded-lg hover:bg-red-100 text-xs font-medium flex items-center gap-1.5 border border-red-200 whitespace-nowrap"
              >
                <FileText size={13} /> PDF
              </button>
            </div>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-bold text-gray-600 w-8"></th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600">#</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600 cursor-pointer hover:text-blue-600" onClick={() => toggleSort('date')}>
                    <span className="flex items-center gap-1">วันที่ <SortIcon field="date" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600 cursor-pointer hover:text-blue-600" onClick={() => toggleSort('firstName')}>
                    <span className="flex items-center gap-1">ชื่อ <SortIcon field="firstName" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600 cursor-pointer hover:text-blue-600" onClick={() => toggleSort('lastName')}>
                    <span className="flex items-center gap-1">นามสกุล <SortIcon field="lastName" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600">อีเมล</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600 cursor-pointer hover:text-blue-600" onClick={() => toggleSort('position')}>
                    <span className="flex items-center gap-1">ตำแหน่ง <SortIcon field="position" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600 cursor-pointer hover:text-blue-600" onClick={() => toggleSort('college')}>
                    <span className="flex items-center gap-1">วิทยาลัย <SortIcon field="college" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600 cursor-pointer hover:text-blue-600" onClick={() => toggleSort('province')}>
                    <span className="flex items-center gap-1">จังหวัด <SortIcon field="province" /></span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginatedUsers.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">ไม่พบข้อมูล</td></tr>
                ) : paginatedUsers.map((u, idx) => {
                  const rowIndex = (currentPage - 1) * ITEMS_PER_PAGE + idx;
                  const isExpanded = expandedUserId === rowIndex;
                  return (
                    <React.Fragment key={idx}>
                      <tr
                        className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-blue-50/30'}`}
                        onClick={() => setExpandedUserId(isExpanded ? null : rowIndex)}
                      >
                        <td className="px-2 py-2 text-gray-400">
                          <ChevronRight
                            size={14}
                            className={`transition-transform duration-200 ${isExpanded ? 'rotate-90 text-blue-600' : 'text-gray-400'}`}
                          />
                        </td>
                        <td className="px-3 py-2 text-gray-400">{rowIndex + 1}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{u.date}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{u.prefix}{u.firstName}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{u.lastName}</td>
                        <td className="px-3 py-2 text-blue-600">{u.email}</td>
                        <td className="px-3 py-2 text-gray-600">{u.position}{u.academicRank && u.academicRank !== 'ไม่มี' ? ` (${u.academicRank})` : ''}</td>
                        <td className="px-3 py-2 text-gray-600">{u.college}</td>
                        <td className="px-3 py-2 text-gray-600">{u.province}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} className="p-0">
                            <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-6 py-5 border-l-2 border-l-blue-500 animate-[slideDown_0.2s_ease-out]">
                              <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                                    {(u.firstName || '?')[0]}
                                  </div>
                                  {u.prefix}{u.firstName} {u.lastName}
                                </h4>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedUserId(null); }}
                                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-white/50"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                <div className="bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50 shadow-sm">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Calendar size={12} className="text-blue-500" />
                                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">วันที่ลงทะเบียน</span>
                                  </div>
                                  <p className="text-xs font-semibold text-gray-800">{u.date || '-'}</p>
                                </div>
                                <div className="bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50 shadow-sm">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Mail size={12} className="text-green-500" />
                                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">อีเมล</span>
                                  </div>
                                  <p className="text-xs font-semibold text-blue-700 break-all">{u.email || '-'}</p>
                                </div>
                                <div className="bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50 shadow-sm">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Briefcase size={12} className="text-purple-500" />
                                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">ตำแหน่ง</span>
                                  </div>
                                  <p className="text-xs font-semibold text-gray-800">{u.position || '-'}</p>
                                </div>
                                <div className="bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50 shadow-sm">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <GraduationCap size={12} className="text-amber-500" />
                                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">วิทยฐานะ</span>
                                  </div>
                                  <p className="text-xs font-semibold text-gray-800">{u.academicRank && u.academicRank !== 'ไม่มี' ? u.academicRank : '-'}</p>
                                </div>
                                <div className="bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50 shadow-sm">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Building2 size={12} className="text-teal-500" />
                                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">วิทยาลัย</span>
                                  </div>
                                  <p className="text-xs font-semibold text-gray-800">{u.college || '-'}</p>
                                </div>
                                <div className="bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50 shadow-sm">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <MapPin size={12} className="text-red-500" />
                                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">จังหวัด / ภาค</span>
                                  </div>
                                  <p className="text-xs font-semibold text-gray-800">{u.province || '-'} / {u.region || '-'}</p>
                                </div>
                                <div className="bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50 shadow-sm">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Users size={12} className="text-indigo-500" />
                                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">สังกัด</span>
                                  </div>
                                  <p className="text-xs font-semibold text-gray-800">{u.affiliation || '-'}</p>
                                </div>
                                <div className="bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50 shadow-sm">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <BookOpen size={12} className="text-cyan-500" />
                                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">แผนก/สาขา</span>
                                  </div>
                                  <p className="text-xs font-semibold text-gray-800">{u.department || '-'}</p>
                                </div>
                              </div>
                              {u.course && (
                                <div className="mt-3 bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50 shadow-sm">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <FileText size={12} className="text-orange-500" />
                                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">รายวิชา</span>
                                  </div>
                                  <p className="text-xs font-semibold text-gray-800">{u.course}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 px-1">
              <p className="text-xs text-gray-500">
                แสดง {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, sortedUsers.length)} จาก {sortedUsers.length} รายการ
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  «
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-2.5 py-1 text-xs rounded border ${currentPage === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-100'}`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ›
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div>
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-bold text-gray-600">#</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600">วันที่</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600">เหตุการณ์</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {stats.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">ไม่พบข้อมูล</td></tr>
                ) : [...stats].reverse().slice(0, 100).map((s, idx) => {
                  // Try to find matching user by date proximity
                  const matchedUser = users.find((u) => u.date === s.date) || {};
                  const displayName = (matchedUser.prefix || '') + (matchedUser.firstName || '') + ' ' + (matchedUser.lastName || '');
                  return (
                    <tr key={idx} className="hover:bg-blue-50/30">
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{displayName.trim() || '-'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{s.date}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.event === 'เข้าใช้งาน' ? 'bg-blue-100 text-blue-700' :
                          s.event === 'ดาวน์โหลด' ? 'bg-green-100 text-green-700' :
                          s.event === 'สร้างแผนฯ' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {s.event}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{s.detail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {stats.length > 100 && (
            <p className="text-xs text-gray-400 text-center mt-2">แสดง 100 รายการล่าสุด จากทั้งหมด {stats.length} รายการ</p>
          )}
        </div>
      )}

      {activeTab === 'changelog' && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Calendar size={20} /> บันทึกการอัปเดตระบบ</h3>
          <div className="space-y-3">
            {CHANGELOG.map((log, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50/50 transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">{log.version}</span>
                    <span className="text-sm text-gray-500">{log.date}</span>
                  </div>
                </div>
                <ul className="space-y-1 ml-4">
                  {log.changes.map((change, cIdx) => (
                    <li key={cIdx} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">•</span>
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
