import React, { useState, useMemo } from 'react';
import { BookOpenCheck, Sparkles, Loader2, Check, ArrowRight, ChevronLeft, ChevronRight, RotateCcw, FileDown, Pencil, Save, X, FileText, Trash2, CheckCircle2, Circle, ListChecks, Zap, Lock } from 'lucide-react';
import FileUploadZone from '../common/FileUploadZone';
import { useFileUpload, buildFileParts } from '../../hooks/useFileUpload';
import { useAiApi } from '../../hooks/useAiApi';
import { SYSTEM_PROMPT_MEDIA, SYSTEM_PROMPT_JOBSHEET_SINGLE, SYSTEM_PROMPT_INFORMATION_SHEET, SYSTEM_PROMPT_OPERATION_SHEET, SYSTEM_PROMPT_ASSIGNMENT_SHEET } from '../../constants/prompts';
import { printToPdf, createWordDoc } from '../../utils/exportHelpers';
import { usePersistedState } from '../../hooks/usePersistedState';
import { generateMediaDocx, generateJobSheetDocx, generateInformationSheetDocx, generateOperationSheetDocx, generateAssignmentSheetDocx, isAssessmentToolType } from '../../utils/docxTemplateExport';
import { parseUnitTable } from '../../utils/markdownTable';
import { ADMIN_PASSWORD, ADMIN_VERIFIED_KEY } from '../../constants/adminAuth';

const UPLOAD_STEPS = [
  { key: 'syllabus', label: 'หลักสูตรรายวิชา', step: 1 },
  { key: 'activities', label: 'กิจกรรมการเรียนรู้', step: 2 },
  { key: 'concept', label: 'สาระการเรียนรู้', step: 3 },
  { key: 'objectives', label: 'จุดประสงค์เชิงพฤติกรรม', step: 4 },
];

// ── Job Sheet text-clean helpers (also used in docxTemplateExport) ──────────
// Strip leading list/number markers so the PISA table doesn't render duplicates
// like "1. 1. ..." (the first column already contains "1. เข้าใจปัญหา").
const jsStripMarker = (v) => {
  let s = String(v ?? '').trim();
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s
      .replace(/^\s*(?:ขั้นที่|ข้อที่|ข้อ)\s*\d+\s*[:\.\)]\s*/u, '')
      .replace(/^\s*\(\s*\d+\s*\)\s*/u, '')
      .replace(/^\s*\d+\s*[\.\)]\s*/u, '')
      .replace(/^\s*[-•*–]\s*/u, '')
      .trim();
    if (s === before) break;
  }
  return s;
};
// Clean competency text: remove leading "สามารถ" / "มีความสามารถ" / trailing "ได้"
const jsCleanComp = (v) => {
  let s = jsStripMarker(v);
  s = s
    .replace(/^\s*(?:มี\s*)?ความสามารถ(?:ที่จะ|ใน(?:การ)?)?\s*/u, '')
    .replace(/^\s*สามารถ(?:ที่จะ)?\s*/u, '')
    .trim();
  s = s.replace(/\s*ได้\s*$/u, '').trim();
  return s;
};

const MediaModule = ({
  providerId, apiKey,
  formData, unitDivisionPlan,
  loResults, compResults, objResults, conceptResults,
  activitiesResults,
  mediaResults, setMediaResults,
  assessmentResults,
  onError, onNavigate,
  triggerDownload,
  onRegenerate,
}) => {
  const dl = triggerDownload || ((fn) => fn());
  const { callApi, loading } = useAiApi(providerId, apiKey);
  const [step, setStep] = useState(1);
  const [selectedUnitIdx, setSelectedUnitIdx] = useState(0);
  const [expandedSections, setExpandedSections] = useState({});

  // Strip any "เครื่องมือประเมิน" items from a media array — they belong in
  // AssessmentModule section 9.3, not in this module.
  const stripAssessmentTools = (mediaArr) =>
    (mediaArr || []).filter((m) => !isAssessmentToolType(m?.type));

  // ── Canonical unit list (same pattern as ActivitiesModule) ────────────────
  // Always show all units regardless of whether media has been generated yet.
  const parsedUnits = useMemo(() => parseUnitTable(unitDivisionPlan), [unitDivisionPlan]);
  const unitList = useMemo(() => {
    if (parsedUnits.length > 0) return parsedUnits;
    // Fallback: derive from any available result array
    const src = activitiesResults || objResults || loResults || compResults || conceptResults || mediaResults || [];
    return src.map((u, i) => ({
      no: String(i + 1),
      name: u.unitName || u._unitName || `หน่วยที่ ${i + 1}`,
      theory: '', practice: '', total: '',
    }));
  }, [parsedUnits, activitiesResults, objResults, loResults, compResults, conceptResults, mediaResults]);

  // ── Build per-unit display data aligned to unitList ───────────────────────
  // Priority for each unit: mediaResults > activitiesResults media > empty
  const displayData = useMemo(() => {
    if (unitList.length === 0) return null;
    return unitList.map((u, i) => {
      const fromResults = (mediaResults || []).find((r) => r._unitIdx === i) || (mediaResults || [])[i];
      const fromPipeline = (activitiesResults || []).find((r) => r._unitIdx === i) || (activitiesResults || [])[i];
      const mediaArr = fromResults?.media || fromPipeline?.media || [];
      return {
        _unitIdx: i,
        unitName: u.name || fromResults?.unitName || fromPipeline?.unitName || `หน่วยที่ ${i + 1}`,
        media: stripAssessmentTools(mediaArr),
      };
    });
  }, [unitList, mediaResults, activitiesResults]);

  const isPipelineData = !(mediaResults && mediaResults.length > 0);

  const hasInternal = !!(formData.courseCode && activitiesResults && conceptResults && objResults);

  const syllabusUpload = useFileUpload({ onError });
  const activitiesUpload = useFileUpload({ onError });
  const conceptUpload = useFileUpload({ onError });
  const objUpload = useFileUpload({ onError });
  const fileHooks = { syllabus: syllabusUpload, activities: activitiesUpload, concept: conceptUpload, objectives: objUpload };

  const generate = async () => {
    if (!hasInternal && !(syllabusUpload.file && activitiesUpload.file && conceptUpload.file && objUpload.file)) {
      onError('ข้อมูลไม่เพียงพอ กรุณาอัปโหลดไฟล์ให้ครบทุกขั้นตอน');
      return;
    }
    if (onRegenerate) onRegenerate();
    try {
      let parts = [{ text: SYSTEM_PROMPT_MEDIA }];
      if (hasInternal && !syllabusUpload.file) {
        parts.push({ text: `\n\n--- Course Syllabus ---\n${JSON.stringify(formData)}` });
        parts.push({ text: `\n\n--- Learning Activities ---\n${JSON.stringify(activitiesResults)}` });
        parts.push({ text: `\n\n--- Key Concepts ---\n${JSON.stringify(conceptResults)}` });
        parts.push({ text: `\n\n--- Behavioral Objectives ---\n${JSON.stringify(objResults)}` });
      } else {
        parts.push(...buildFileParts(syllabusUpload.file, 'Course Syllabus'));
        parts.push(...buildFileParts(activitiesUpload.file, 'Learning Activities'));
        parts.push(...buildFileParts(conceptUpload.file, 'Key Concepts'));
        parts.push(...buildFileParts(objUpload.file, 'Behavioral Objectives'));
      }
      const data = await callApi(parts, { json: true, moduleName: 'media', statusText: 'กำลังวิเคราะห์สื่อและแหล่งการเรียนรู้...' });
      const { ensureSchema } = await import('../../utils/aiResponseValidator');
      const validated = ensureSchema(data, 'media', { arrayKey: 'units' });
      setMediaResults(validated.units);
    } catch (err) {
      onError(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถสร้างสื่อได้'}`);
    }
  };

  // ── Inline editing ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(null);

  const startEdit = () => {
    setEditData(JSON.parse(JSON.stringify(displayData)));
    setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setEditData(null); };
  const saveEdit = () => {
    setMediaResults(editData);
    setEditing(false);
    setEditData(null);
  };
  const updateEditMedia = (unitIdx, mediaIdx, field, value) => {
    setEditData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      const media = [...(item.media || [])];
      media[mediaIdx] = { ...media[mediaIdx], [field]: value };
      return { ...item, media };
    }));
  };
  const addEditMedia = (unitIdx, presetType = 'สื่อการสอน') => {
    setEditData(prev => prev.map((item, i) => i === unitIdx ? { ...item, media: [...(item.media || []), { name: '', type: presetType, description: '', usage: '' }] } : item));
  };

  // ── Type categorization ──────────────────────────────────────────────────
  // 5 first-class categories matching template-media.docx sub-sections
  const categorizeType = (rawType) => {
    const t = String(rawType || '').trim();
    if (/ใบความรู้|knowledge\s*sheet/i.test(t)) return 'ใบความรู้';
    if (/ใบปฏิบัติ(งาน)?|practice\s*sheet/i.test(t)) return 'ใบปฏิบัติงาน';
    if (/ใบมอบหมาย(งาน)?|assignment\s*sheet/i.test(t)) return 'ใบมอบหมายงาน';
    if (/ใบงาน|worksheet/i.test(t)) return 'ใบงาน';
    return 'สื่อการสอน';
  };
  const SECTION_ORDER = ['สื่อการสอน', 'ใบความรู้', 'ใบงาน', 'ใบปฏิบัติงาน', 'ใบมอบหมายงาน'];
  // Tailwind utility classes pre-declared so JIT keeps them in the build
  // (blue=สื่อการสอน · yellow=ใบความรู้ · pink=ใบงาน · green=ใบปฏิบัติงาน · orange=ใบมอบหมายงาน)
  const SECTION_META = {
    'สื่อการสอน':     { bg: 'bg-blue-50',   border: 'border-blue-200',   chip: 'bg-blue-200 text-blue-800',       head: 'bg-blue-100 text-blue-900' },
    'ใบความรู้':      { bg: 'bg-yellow-50', border: 'border-yellow-200', chip: 'bg-yellow-200 text-yellow-800',   head: 'bg-yellow-100 text-yellow-900' },
    'ใบงาน':          { bg: 'bg-pink-50',   border: 'border-pink-200',   chip: 'bg-pink-200 text-pink-800',       head: 'bg-pink-100 text-pink-900' },
    'ใบปฏิบัติงาน':   { bg: 'bg-green-50',  border: 'border-green-200',  chip: 'bg-green-200 text-green-800',     head: 'bg-green-100 text-green-900' },
    'ใบมอบหมายงาน':  { bg: 'bg-orange-50', border: 'border-orange-200', chip: 'bg-orange-200 text-orange-800',   head: 'bg-orange-100 text-orange-900' },
  };
  const groupMediaByType = (mediaArr) => {
    const groups = Object.fromEntries(SECTION_ORDER.map((s) => [s, []]));
    (mediaArr || []).forEach((m, origIdx) => {
      groups[categorizeType(m?.type)].push({ ...m, _origIdx: origIdx });
    });
    return groups;
  };
  const removeEditMedia = (unitIdx, mediaIdx) => {
    setEditData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      return { ...item, media: (item.media || []).filter((_, mi) => mi !== mediaIdx) };
    }));
  };

  // Shared export metadata (also used by jobsheet exports below)
  const _meta = { module: 'สื่อและแหล่งการเรียนรู้', courseCode: formData.courseCode || '', courseName: formData.courseName || '' };

  // ── Job Sheet (ใบงาน) generation ────────────────────────────────────────
  // Per-unit persisted storage: { [unitIdx]: [js0, js1, ...] }
  // Index aligns with worksheet position from getWorksheetsForUnit().
  // Slots may be null/undefined if that worksheet has not been generated yet.
  const [jobSheetStore, setJobSheetStore] = usePersistedState('lp_jobSheetStore', {});

  // ── Information Sheet (ใบความรู้) per-unit store ──────────────────────────
  const [infoSheetStore, setInfoSheetStore] = usePersistedState('lp_infoSheetStore', {});
  // ── Operation Sheet (ใบปฏิบัติงาน) per-unit store ─────────────────────────
  const [operationSheetStore, setOperationSheetStore] = usePersistedState('lp_operationSheetStore', {});
  // ── Assignment Sheet (ใบมอบหมายงาน) per-unit store ────────────────────────
  const [assignmentSheetStore, setAssignmentSheetStore] = usePersistedState('lp_assignmentSheetStore', {});

  // ── Completion Status per Unit (เกณฑ์เข้ม: ครบทั้ง 5 ประเภท) ──────────────
  // ใช้แสดง dashboard สถานะการสร้างรายหน่วย
  const completionStatus = useMemo(() => {
    if (!displayData || displayData.length === 0) return [];
    return displayData.map((item, i) => {
      const hasMedia = Array.isArray(item.media) && item.media.length > 0;
      const hasJobSheet = (jobSheetStore[i] || []).filter(s => s).length > 0;
      const hasInfoSheet = (infoSheetStore[i] || []).filter(s => s).length > 0;
      const hasOpSheet = (operationSheetStore[i] || []).filter(s => s).length > 0;
      const hasAssignSheet = (assignmentSheetStore[i] || []).filter(s => s).length > 0;
      const checks = [hasMedia, hasJobSheet, hasInfoSheet, hasOpSheet, hasAssignSheet];
      const completedCount = checks.filter(Boolean).length;
      return {
        unitIdx: i,
        unitName: item.unitName || `หน่วยที่ ${i + 1}`,
        hasMedia,
        hasJobSheet,
        hasInfoSheet,
        hasOpSheet,
        hasAssignSheet,
        completedCount,
        isComplete: completedCount === 5,
      };
    });
  }, [displayData, jobSheetStore, infoSheetStore, operationSheetStore, assignmentSheetStore]);

  const totalComplete = completionStatus.filter(s => s.isComplete).length;
  const totalUnits = completionStatus.length;

  // Get worksheets (ใบงาน items) for a unit.
  // Source: Module กิจกรรมการเรียนรู้ (ActivitiesModule) — r.assignments[]
  // Each assignment (ชิ้นงาน/ภาระงาน) becomes one ใบงาน. Fallback to
  // activity items marked as "ใบงาน" if no assignments exist.
  const getWorksheetsForUnit = (unitIdx) => {
    const results = [];

    // Source 1: ใบงาน media items from MediaModule (ที่แสดงเป็นการ์ดในหน้า)
    const currentData = editing ? editData : displayData;
    const unitItem = currentData?.[unitIdx];
    if (unitItem) {
      const mediaItems = Array.isArray(unitItem.media) ? unitItem.media : [];
      mediaItems
        .filter((m) => categorizeType(m?.type) === 'ใบงาน')
        .forEach((m) => {
          results.push({
            name: m.name || '',
            description: m.description || '',
            usage: m.usage || '',
            _source: 'media',
          });
        });
    }

    // Source 2: assignments from ActivitiesModule (เพิ่มเติมเฉพาะที่ไม่ซ้ำกับ media)
    const act = (activitiesResults || []).find((r) => r._unitIdx === unitIdx)
      || (activitiesResults || [])[unitIdx];
    if (act) {
      const assignments = Array.isArray(act.assignments) ? act.assignments : [];
      assignments.forEach((a) => {
        const name = a.name || '';
        // ไม่เพิ่มถ้าซ้ำกับ media item ที่มีอยู่แล้ว
        if (!results.some((r) => r.name === name)) {
          results.push({
            name,
            description: a.description || '',
            weekStart: a.weekStart,
            weekEnd: a.weekEnd,
            deliverables: Array.isArray(a.deliverables) ? a.deliverables : [],
            relatedObjectives: a.relatedObjectives || '',
            relatedCompetencies: a.relatedCompetencies || '',
            _source: 'assignment',
          });
        }
      });
    }

    return results;
  };

  // Helper: has a job sheet been populated with AI content yet?
  // Used to toggle the per-sheet button between "AI" (empty) / "สร้างใหม่" (has content).
  const jobSheetHasContent = (js) => {
    if (!js) return false;
    if (js.lo || js.caution || js.summary) return true;
    if (Array.isArray(js.competencies) && js.competencies.some((c) => String(c || '').trim())) return true;
    if (Array.isArray(js.tools) && js.tools.some((t) => String(t || '').trim())) return true;
    if (Array.isArray(js.steps) && js.steps.some((s) => String(s || '').trim())) return true;
    if (Array.isArray(js.references) && js.references.some((r) => String(r || '').trim())) return true;
    return false;
  };

  // ── Per-sheet operations: create / edit / clear one sheet ───────────────
  // Schema follows template-jobsheet1.docx (10 sections).
  // Sheets are created on-demand per row (one button per worksheet from
  // ActivitiesModule). No auto-generation, no batch generate.

  // Clear the AI-generated content for ONE worksheet slot (sets to null so
  // the row stays in place — index alignment with worksheets is preserved).
  const removeJobSheet = (unitIdx, jsIdx) => {
    setJobSheetStore((prev) => {
      const list = [...(prev[unitIdx] || [])];
      if (jsIdx < list.length) list[jsIdx] = null;
      // Trim trailing nulls so the array doesn't grow unboundedly
      while (list.length > 0 && list[list.length - 1] == null) list.pop();
      const next = { ...prev };
      if (list.length === 0) delete next[unitIdx];
      else next[unitIdx] = list;
      return next;
    });
  };

  const updateJobSheetField = (unitIdx, jsIdx, field, value) => {
    setJobSheetStore((prev) => {
      const list = [...(prev[unitIdx] || [])];
      if (!list[jsIdx]) return prev;
      list[jsIdx] = { ...list[jsIdx], [field]: value };
      return { ...prev, [unitIdx]: list };
    });
  };

  // Inline title-editing state — only one sheet editable at a time
  const [editingTitleKey, setEditingTitleKey] = useState(null); // `${unitIdx}:${jsIdx}`
  const [editingTitleValue, setEditingTitleValue] = useState('');

  const startEditTitle = (unitIdx, jsIdx, current) => {
    setEditingTitleKey(`${unitIdx}:${jsIdx}`);
    setEditingTitleValue(current || '');
  };
  const commitEditTitle = () => {
    if (!editingTitleKey) return;
    const [u, j] = editingTitleKey.split(':').map(Number);
    updateJobSheetField(u, j, 'title', editingTitleValue.trim() || `ใบงานที่ ${j + 1}`);
    setEditingTitleKey(null);
    setEditingTitleValue('');
  };
  const cancelEditTitle = () => {
    setEditingTitleKey(null);
    setEditingTitleValue('');
  };

  // Per-sheet AI generation (create or regenerate content for ONE worksheet).
  // wsIdx is the worksheet position from getWorksheetsForUnit(unitIdx).
  // Works whether or not jobSheetStore[unitIdx][wsIdx] already exists.
  const [singleSheetLoading, setSingleSheetLoading] = useState(null); // `${unitIdx}:${wsIdx}` or null

  const createOneJobSheet = async (unitIdx, wsIdx) => {
    const unit = displayData?.[unitIdx];
    if (!unit) return;
    const worksheets = getWorksheetsForUnit(unitIdx);
    // Fallback: ถ้า Activities ไม่มี assignments / Media ไม่มี ใบงาน
    // ให้ใช้ข้อมูลของหน่วยมาสร้างใบงานพื้นฐาน 1 ใบ
    const ws = worksheets[wsIdx] || {
      name: `ใบงานที่ ${wsIdx + 1}`,
      description: `ใบงานสำหรับหน่วยการเรียนรู้: ${unit.unitName || `หน่วยที่ ${unitIdx + 1}`}`,
      deliverables: [],
      _source: 'fallback',
    };
    const key = `${unitIdx}:${wsIdx}`;
    setSingleSheetLoading(key);
    try {
      const unitLo      = (loResults     || []).find((r) => r._unitIdx === unitIdx) || (loResults     || [])[unitIdx];
      const unitComp    = (compResults   || []).find((r) => r._unitIdx === unitIdx) || (compResults   || [])[unitIdx];
      const unitObj     = (objResults    || []).find((r) => r._unitIdx === unitIdx) || (objResults    || [])[unitIdx];
      const unitAct     = (activitiesResults || []).find((r) => r._unitIdx === unitIdx) || (activitiesResults || [])[unitIdx];
      const unitAssess  = (assessmentResults  || []).find((r) => r._unitIdx === unitIdx) || (assessmentResults  || [])[unitIdx];
      const existing    = (jobSheetStore[unitIdx] || [])[wsIdx];
      const titleHint   = (existing && existing.title) || ws.name || `ใบงานที่ ${wsIdx + 1}`;

      const parts = [
        { text: SYSTEM_PROMPT_JOBSHEET_SINGLE },
        { text: `\n\n--- Unit Info ---\nunitName: ${unit.unitName}\nunitNo: ${unitIdx + 1}` },
        { text: `\n\n--- Course ---\n${JSON.stringify({ courseCode: formData.courseCode, courseName: formData.courseName })}` },
        { text: `\n\n--- jobSheetTitle (ชื่อใบงาน) ---\n${titleHint}` },
        { text: `\n\n--- Worksheet (ชิ้นงาน/ภาระงาน จาก Module กิจกรรมการเรียนรู้) ---\n` +
                `worksheet มีข้อมูล: name (ชื่อชิ้นงาน), description (รายละเอียด), weekStart/weekEnd (สัปดาห์), deliverables (ผลงานที่ต้องส่ง), relatedObjectives (จุดประสงค์ที่เกี่ยวข้อง), relatedCompetencies (สมรรถนะที่เกี่ยวข้อง)\n` +
                `*** ให้ออกแบบใบงานจากข้อมูล worksheet นี้ ตาม name/description/deliverables และบูรณาการกับ PISA 6 ขั้น ***\n${JSON.stringify(ws, null, 2)}` },
        { text: `\n\n--- Unit Learning Outcomes (loResults) ---\n${JSON.stringify(unitLo || {})}` },
        { text: `\n\n--- Unit Competencies (compResults) ---\n${JSON.stringify(unitComp || {})}` },
        { text: `\n\n--- Unit Objectives (objResults, 4 domains) ---\n${JSON.stringify(unitObj || {})}` },
        { text: `\n\n--- Unit Activities ---\n${JSON.stringify(unitAct || {})}` },
        { text: `\n\n--- Unit Assessment ---\n${JSON.stringify(unitAssess || {})}` },
      ];
      const data = await callApi(parts, { json: true, moduleName: 'jobSheet', statusText: `กำลังสร้างใบงานที่ ${wsIdx + 1}...` });
      const js = data?.jobSheet;
      if (!js || typeof js !== 'object') throw new Error('Invalid AI response');
      setJobSheetStore((prev) => {
        // Ensure list has at least wsIdx + 1 slots (pad with null)
        const list = [...(prev[unitIdx] || [])];
        while (list.length <= wsIdx) list.push(null);
        list[wsIdx] = {
          title:        js.title        || titleHint,
          lo:           js.lo           || '',
          competencies: Array.isArray(js.competencies) ? js.competencies : [],
          tools:        Array.isArray(js.tools)        ? js.tools        : [],
          caution:      js.caution      || '',
          steps:        Array.isArray(js.steps)        ? js.steps        : [],
          summary:      js.summary      || '',
          references:   Array.isArray(js.references)   ? js.references   : [],
          _worksheetName: ws.name || '',
          _worksheetDesc: ws.description || '',
        };
        return { ...prev, [unitIdx]: list };
      });
    } catch (err) {
      onError(`สร้างใบงานไม่สำเร็จ: ${err.message || ''}`);
    } finally {
      setSingleSheetLoading(null);
    }
  };

  // Build one jobSheet payload for export (10-section schema)
  // Sources:
  //   - jobSheetStore[unitIdx][jsIdx] → AI-generated sections (1, 3, 5, 6, 7, 8, 10)
  //   - objResults[unitIdx]           → Section 4 (4 domains merged sequentially)
  //   - assessmentResults[unitIdx]    → Section 9 (criteria + methods + tools)
  //   - formData / unitList           → header fields
  const buildJobSheetPayload = (unitIdx, jsIdx) => {
    const unit = displayData?.[unitIdx];
    const unitSrc = unitList?.[unitIdx];
    const js = (jobSheetStore[unitIdx] || [])[jsIdx] || {};

    // Section 4: pull objResults of this unit, merge 4 domains as grouped list
    // ⭐ พุทธิพิสัย: ใช้เฉพาะข้อที่ user เลือกไว้ใน Activities Module (_selectedCognitive)
    //   ถ้ายังไม่ได้เลือก (Activities ยังไม่ทำ) → ใช้ทุกข้อใน objResults เป็น fallback
    const unitObj = (objResults || []).find((r) => r._unitIdx === unitIdx)
      || (objResults || [])[unitIdx]
      || {};
    const unitAct = (activitiesResults || []).find((r) => r._unitIdx === unitIdx)
      || (activitiesResults || [])[unitIdx];
    const selectedCog = unitAct?._selectedCognitive;
    const cognitiveList = Array.isArray(selectedCog) && selectedCog.length > 0
      ? selectedCog
      : (unitObj.cognitive || []);

    // Format with domain headers + numbered items per domain (สวยงาม + อ่านง่าย)
    // - บรรทัดหัวข้อ "ด้านxxx" แยกออกจากรายการ
    // - รายการในแต่ละด้านนับ 1) 2) 3) ใหม่ ไม่นับต่อข้ามด้าน
    const objBlocks = [];
    const pushDomainGroup = (label, list) => {
      const items = Array.isArray(list) ? list.filter((s) => String(s || '').trim()) : [];
      if (items.length === 0) return;
      objBlocks.push(label);
      items.forEach((s, i) => {
        objBlocks.push(`   ${i + 1}) ${jsStripMarker(String(s))}`);
      });
    };
    pushDomainGroup('ด้านพุทธิพิสัย (Cognitive Domain)',       cognitiveList);
    pushDomainGroup('ด้านทักษะพิสัย (Psychomotor Domain)',      unitObj.psychomotor);
    pushDomainGroup('ด้านจิตพิสัย (Affective Domain)',          unitObj.affective);
    pushDomainGroup('ด้านการประยุกต์ใช้ (Application Domain)',   unitObj.application);

    // Section 9: pull assessmentResults of this unit, format as numbered list
    const unitAssess = (assessmentResults || []).find((r) => r._unitIdx === unitIdx)
      || (assessmentResults || [])[unitIdx]
      || {};
    const evalLines = [];
    const pcs = Array.isArray(unitAssess.performanceCriteria) ? unitAssess.performanceCriteria : [];
    const ams = Array.isArray(unitAssess.assessmentMethods)   ? unitAssess.assessmentMethods   : [];
    const ats = Array.isArray(unitAssess.assessmentTools)     ? unitAssess.assessmentTools     : [];
    const evalLen = Math.max(pcs.length, ams.length, ats.length);
    for (let i = 0; i < evalLen; i++) {
      const c = String(pcs[i] || '').trim();
      const m = String(ams[i] || '').trim();
      const t = String(ats[i] || '').trim();
      const segs = [];
      if (c) segs.push(`เกณฑ์: ${c}`);
      if (m) segs.push(`วิธี: ${m}`);
      if (t) segs.push(`เครื่องมือ: ${t}`);
      if (segs.length > 0) evalLines.push(`${i + 1}) ${segs.join(' · ')}`);
    }
    const evaluation = evalLines.join('\n');

    // Header numbers (theory/practice hours for header line)
    const theoryHours   = unitSrc?.theory   ? String(unitSrc.theory)   : '';
    const practiceHours = unitSrc?.practice ? String(unitSrc.practice) : '';

    return {
      // Header
      jobSheetNo: String(jsIdx + 1),
      unitNo:     String(unitIdx + 1),
      lessonNo:   String(unitIdx + 1),
      title:      js.title || '',
      courseName: formData.courseName || '',
      courseCode: formData.courseCode || '',
      unitName:   unit?.unitName || `หน่วยที่ ${unitIdx + 1}`,
      theoryHours,
      practiceHours,

      // Section 1
      lo: js.lo || '',
      // Section 3
      competencies: Array.isArray(js.competencies) ? js.competencies : [],
      // Section 4 (from objResults)
      objectives: objBlocks,
      // Section 5
      tools: Array.isArray(js.tools) ? js.tools : [],
      // Section 6
      caution: js.caution || '',
      // Section 7
      steps: Array.isArray(js.steps) ? js.steps : [],
      // Section 8
      summary: js.summary || '',
      // Section 9 (from assessmentResults)
      evaluation,
      // Section 10
      references: Array.isArray(js.references) ? js.references : [],
    };
  };

  const exportJobSheetWord = (unitIdx, jsIdx) => {
    const payload = buildJobSheetPayload(unitIdx, jsIdx);
    dl(async () => {
      try {
        await generateJobSheetDocx({ jobSheet: payload });
      } catch (err) {
        console.error('[MediaModule] JobSheet Word export error:', err);
        onError?.(`ไม่สามารถสร้างไฟล์ Word ใบงานได้: ${err.message || ''}`);
      }
    }, { module: 'ใบงาน', ..._meta });
  };

  // ── Information / Operation / Assignment Sheet generation ────────────────
  const [sheetLoading, setSheetLoading] = useState(null); // 'info:unitIdx:idx' / 'op:unitIdx:idx' / 'assign:unitIdx:idx'

  // Helper: check if a sheet has AI-generated content
  const sheetHasContent = (s) => {
    if (!s) return false;
    return !!(s.title || s.content || s.steps || s.taskDetails || s.workProduct);
  };

  // Build common context parts for all 3 sheet types
  const buildSheetContextParts = (unitIdx, promptSystem) => {
    const unit = displayData?.[unitIdx];
    const unitLo = (loResults || []).find((r) => r._unitIdx === unitIdx) || (loResults || [])[unitIdx];
    const unitComp = (compResults || []).find((r) => r._unitIdx === unitIdx) || (compResults || [])[unitIdx];
    const unitObj = (objResults || []).find((r) => r._unitIdx === unitIdx) || (objResults || [])[unitIdx];
    const unitConcept = (conceptResults || []).find((r) => r._unitIdx === unitIdx) || (conceptResults || [])[unitIdx];
    const unitAct = (activitiesResults || []).find((r) => r._unitIdx === unitIdx) || (activitiesResults || [])[unitIdx];
    return [
      { text: promptSystem },
      { text: `\n\n--- Course ---\n${JSON.stringify({ courseCode: formData.courseCode, courseName: formData.courseName, standardRef: formData.standardRef || '' })}` },
      { text: `\n\n--- Unit Info ---\nunitName: ${unit?.unitName || ''}\nunitNo: ${unitIdx + 1}` },
      { text: `\n\n--- Unit Learning Outcomes ---\n${JSON.stringify(unitLo || {})}` },
      { text: `\n\n--- Unit Competencies ---\n${JSON.stringify(unitComp || {})}` },
      { text: `\n\n--- Unit Objectives (4 domains) ---\n${JSON.stringify(unitObj || {})}` },
      { text: `\n\n--- Unit Concepts ---\n${JSON.stringify(unitConcept || {})}` },
      { text: `\n\n--- Unit Activities ---\n${JSON.stringify(unitAct || {})}` },
    ];
  };

  // Build common header payload for export
  const buildSheetHeader = (unitIdx, sheetIdx) => {
    const unit = displayData?.[unitIdx];
    const unitSrc = unitList?.[unitIdx];
    const unitLo = (loResults || []).find((r) => r._unitIdx === unitIdx) || (loResults || [])[unitIdx];
    const unitComp = (compResults || []).find((r) => r._unitIdx === unitIdx) || (compResults || [])[unitIdx];
    const unitObj = (objResults || []).find((r) => r._unitIdx === unitIdx) || (objResults || [])[unitIdx];
    const unitAct = (activitiesResults || []).find((r) => r._unitIdx === unitIdx) || (activitiesResults || [])[unitIdx];
    const comps = Array.isArray(unitComp?.competencies) ? unitComp.competencies : [];
    const objDomains = unitObj || {};

    // ── Build "objectives" array สำหรับ Info Sheet (loop ใน template) ────
    //  - ใช้เฉพาะพุทธิพิสัยที่เลือกใน Activities Module (_selectedCognitive)
    //  - ลบ emoji 📌, "เรื่อง:", "(K1)-(K6)" markers
    //  - รวม 4 domains: พุทธิ → ทักษะ → จิต → ประยุกต์ใช้
    //  - เรียงเลข sequentially (4.1, 4.2, ... ใส่ใน template)
    const cleanObjItem = (s) => String(s || '')
      .replace(/^📌\s*/, '')                       // strip 📌 prefix
      .replace(/^(เรื่อง|หัวข้อ|กลุ่ม)\s*:.*$/gm, '')   // skip subtopic header lines
      .replace(/\s*\(K[1-6]\)\s*/gi, '')           // strip (K1)-(K6) inline markers
      .replace(/^\d+[.)]\s*/, '')                  // strip leading "1)" or "1."
      .replace(/\s+/g, ' ')                        // collapse whitespace
      .trim();

    const selectedCog = Array.isArray(unitAct?._selectedCognitive) ? unitAct._selectedCognitive : null;
    let cognitive = Array.isArray(objDomains.cognitive) ? objDomains.cognitive : [];
    if (selectedCog && selectedCog.length > 0) {
      cognitive = cognitive.filter((c) => selectedCog.includes(c));
    }
    const psychomotor = Array.isArray(objDomains.psychomotor) ? objDomains.psychomotor : [];
    const affective = Array.isArray(objDomains.affective) ? objDomains.affective : [];
    const application = Array.isArray(objDomains.application) ? objDomains.application : [];

    const objectives = [...cognitive, ...psychomotor, ...affective, ...application]
      .map(cleanObjItem)
      .filter((t) => t && !t.startsWith('📌'))
      .map((text, i) => ({ idx: i + 1, text }));

    return {
      sheetNo: String(sheetIdx + 1),
      unitNo: String(unitIdx + 1),
      lessonNo: String(unitIdx + 1),
      courseCode: formData.courseCode || '',
      courseName: formData.courseName || '',
      unitName: unit?.unitName || `หน่วยที่ ${unitIdx + 1}`,
      theoryHours: unitSrc?.theory ? String(unitSrc.theory) : '',
      practiceHours: unitSrc?.practice ? String(unitSrc.practice) : '',
      lo: unitLo?.outcome || '',
      standardRef: formData.standardRef || '-',
      comp1: comps[0] ? jsCleanComp(comps[0]) : '',
      comp2: comps[1] ? jsCleanComp(comps[1]) : '',
      // Legacy: obj1-obj4 ยังใช้กับ Op Sheet / Assign Sheet ที่ยังไม่ refactor
      obj1: Array.isArray(objDomains.cognitive) ? objDomains.cognitive.map(jsStripMarker).join(', ') : '',
      obj2: Array.isArray(objDomains.psychomotor) ? objDomains.psychomotor.map(jsStripMarker).join(', ') : '',
      obj3: Array.isArray(objDomains.affective) ? objDomains.affective.map(jsStripMarker).join(', ') : '',
      obj4: Array.isArray(objDomains.application) ? objDomains.application.map(jsStripMarker).join(', ') : '',
      // 🆕 Info Sheet: loop-based objectives array
      objectives,
    };
  };

  // ── Information Sheet (ใบความรู้) AI generation ──────────────────────────
  const createInfoSheet = async (unitIdx, sheetIdx) => {
    const key = `info:${unitIdx}:${sheetIdx}`;
    setSheetLoading(key);
    try {
      const parts = buildSheetContextParts(unitIdx, SYSTEM_PROMPT_INFORMATION_SHEET);
      const data = await callApi(parts, { json: true, moduleName: 'infoSheet', statusText: `กำลังสร้างใบความรู้ที่ ${sheetIdx + 1}...` });
      if (!data || typeof data !== 'object') throw new Error('Invalid AI response');
      setInfoSheetStore((prev) => {
        const list = [...(prev[unitIdx] || [])];
        while (list.length <= sheetIdx) list.push(null);
        list[sheetIdx] = {
          title: data.title || `ใบความรู้ที่ ${sheetIdx + 1}`,
          workTask: data.workTask || '',     // 🆕 ชิ้นงาน/ภาระงานที่ผู้เรียนต้องทำ
          content: data.content || '',
          exercises: data.exercises || '',
          references: data.references || '',
          appendix: data.appendix || '',
        };
        return { ...prev, [unitIdx]: list };
      });
    } catch (err) {
      onError(`สร้างใบความรู้ไม่สำเร็จ: ${err.message || ''}`);
    } finally {
      setSheetLoading(null);
    }
  };

  const addInfoSheet = (unitIdx) => {
    setInfoSheetStore((prev) => {
      const list = [...(prev[unitIdx] || [])];
      list.push(null);
      return { ...prev, [unitIdx]: list };
    });
  };

  const removeInfoSheet = (unitIdx, idx) => {
    setInfoSheetStore((prev) => {
      const list = [...(prev[unitIdx] || [])];
      list.splice(idx, 1);
      const next = { ...prev };
      if (list.length === 0) delete next[unitIdx];
      else next[unitIdx] = list;
      return next;
    });
  };

  const exportInfoSheetWord = (unitIdx, idx) => {
    const sheet = (infoSheetStore[unitIdx] || [])[idx];
    if (!sheet) return;
    const header = buildSheetHeader(unitIdx, idx);
    dl(() => {
      generateInformationSheetDocx({ sheet: { ...header, ...sheet } });
    }, { module: 'ใบความรู้', ..._meta });
  };

  // ── Operation Sheet (ใบปฏิบัติงาน) AI generation ─────────────────────────
  const createOperationSheet = async (unitIdx, sheetIdx) => {
    const key = `op:${unitIdx}:${sheetIdx}`;
    setSheetLoading(key);
    try {
      const parts = buildSheetContextParts(unitIdx, SYSTEM_PROMPT_OPERATION_SHEET);
      const data = await callApi(parts, { json: true, moduleName: 'operationSheet', statusText: `กำลังสร้างใบปฏิบัติงานที่ ${sheetIdx + 1}...` });
      if (!data || typeof data !== 'object') throw new Error('Invalid AI response');
      setOperationSheetStore((prev) => {
        const list = [...(prev[unitIdx] || [])];
        while (list.length <= sheetIdx) list.push(null);
        list[sheetIdx] = {
          title: data.title || `ใบปฏิบัติงานที่ ${sheetIdx + 1}`,
          tools: Array.isArray(data.tools) ? data.tools : [],
          steps: data.steps || '',
          summary: data.summary || '',
          evaluation: data.evaluation || '',
          references: data.references || '',
        };
        return { ...prev, [unitIdx]: list };
      });
    } catch (err) {
      onError(`สร้างใบปฏิบัติงานไม่สำเร็จ: ${err.message || ''}`);
    } finally {
      setSheetLoading(null);
    }
  };

  const addOperationSheet = (unitIdx) => {
    setOperationSheetStore((prev) => {
      const list = [...(prev[unitIdx] || [])];
      list.push(null);
      return { ...prev, [unitIdx]: list };
    });
  };

  const removeOperationSheet = (unitIdx, idx) => {
    setOperationSheetStore((prev) => {
      const list = [...(prev[unitIdx] || [])];
      list.splice(idx, 1);
      const next = { ...prev };
      if (list.length === 0) delete next[unitIdx];
      else next[unitIdx] = list;
      return next;
    });
  };

  const exportOperationSheetWord = (unitIdx, idx) => {
    const sheet = (operationSheetStore[unitIdx] || [])[idx];
    if (!sheet) return;
    const header = buildSheetHeader(unitIdx, idx);
    dl(() => {
      generateOperationSheetDocx({ sheet: { ...header, ...sheet } });
    }, { module: 'ใบปฏิบัติงาน', ..._meta });
  };

  // ── Assignment Sheet (ใบมอบหมายงาน) AI generation ────────────────────────
  const createAssignmentSheet = async (unitIdx, sheetIdx) => {
    const key = `assign:${unitIdx}:${sheetIdx}`;
    setSheetLoading(key);
    try {
      const parts = buildSheetContextParts(unitIdx, SYSTEM_PROMPT_ASSIGNMENT_SHEET);
      const data = await callApi(parts, { json: true, moduleName: 'assignmentSheet', statusText: `กำลังสร้างใบมอบหมายงานที่ ${sheetIdx + 1}...` });
      if (!data || typeof data !== 'object') throw new Error('Invalid AI response');
      setAssignmentSheetStore((prev) => {
        const list = [...(prev[unitIdx] || [])];
        while (list.length <= sheetIdx) list.push(null);
        list[sheetIdx] = {
          title: data.title || `ใบมอบหมายงานที่ ${sheetIdx + 1}`,
          workProduct: data.workProduct || '',
          taskDetails: data.taskDetails || '',
          deadline: data.deadline || '',
          guidelines: data.guidelines || '',
          resources: data.resources || '',
          evaluation: data.evaluation || '',
        };
        return { ...prev, [unitIdx]: list };
      });
    } catch (err) {
      onError(`สร้างใบมอบหมายงานไม่สำเร็จ: ${err.message || ''}`);
    } finally {
      setSheetLoading(null);
    }
  };

  const addAssignmentSheet = (unitIdx) => {
    setAssignmentSheetStore((prev) => {
      const list = [...(prev[unitIdx] || [])];
      list.push(null);
      return { ...prev, [unitIdx]: list };
    });
  };

  const removeAssignmentSheet = (unitIdx, idx) => {
    setAssignmentSheetStore((prev) => {
      const list = [...(prev[unitIdx] || [])];
      list.splice(idx, 1);
      const next = { ...prev };
      if (list.length === 0) delete next[unitIdx];
      else next[unitIdx] = list;
      return next;
    });
  };

  const exportAssignmentSheetWord = (unitIdx, idx) => {
    const sheet = (assignmentSheetStore[unitIdx] || [])[idx];
    if (!sheet) return;
    const header = buildSheetHeader(unitIdx, idx);
    dl(() => {
      generateAssignmentSheetDocx({ sheet: { ...header, ...sheet } });
    }, { module: 'ใบมอบหมายงาน', ..._meta });
  };

  // ── Export helpers ────────────────────────────────────────────────────────
  // NOTE: Job sheet export is Word-only. The Word path goes through
  // generateJobSheetDocx → public/template-jobsheet1.docx (10 sections).
  // Each ใบงาน is exported as a SEPARATE .docx file. Section 4 (objectives)
  // and Section 9 (evaluation) are pulled from objResults / assessmentResults
  // — they are NOT generated by AI in the JobSheet prompt.
  const buildHtml = (data) => {
    const rows = data.map((item, idx) => {
      const mediaList = (item.media || []).map((m) =>
        `<li><b>${m.name}</b> <span style="font-size:11px;">(${m.type})</span><br/>รายละเอียด: ${m.description}<br/>วิธีใช้: ${m.usage}</li>`
      ).join('');
      return `<tr><td style="text-align:center;vertical-align:top;">${idx + 1}</td><td style="vertical-align:top;">${item.unitName}</td><td style="vertical-align:top;"><ol>${mediaList}</ol></td></tr>`;
    }).join('');
    return `<table><thead><tr><th width="8%">ที่</th><th width="25%">หน่วยการเรียนรู้</th><th>สื่อและแหล่งการเรียนรู้</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  const _doExportWord = async () => {
    if (!displayData) return;
    try {
      await generateMediaDocx({
        mediaResults: displayData,
        courseCode: formData.courseCode,
      });
    } catch (err) {
      console.error('[MediaModule] Export Word error:', err);
      onError?.(`ไม่สามารถสร้างไฟล์ Word ได้: ${err.message || ''}`);
    }
  };
  const exportWord = () => dl(_doExportWord, _meta);
  const exportPdf = () => displayData && dl(() => printToPdf(`สื่อและแหล่งการเรียนรู้ ${formData.courseCode}`, buildHtml(displayData)), _meta);

  // ── Bulk Generate (สร้างทั้งหมดในหน่วยเดียว) ──────────────────────────────
  // ต้องผ่านการยืนยันรหัสผู้ดูแลระบบก่อน — รหัสจำตลอดไปใน localStorage
  const [bulkLoadingUnit, setBulkLoadingUnit] = useState(null);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const verifyAdminCode = () => {
    if (localStorage.getItem(ADMIN_VERIFIED_KEY) === '1') return true;
    const input = window.prompt('🔒 กรุณาใส่รหัสผู้ดูแลระบบเพื่อใช้งาน "สร้างทั้งหมด"');
    if (input === null) return false; // user cancelled
    if (input.trim() === ADMIN_PASSWORD) {
      localStorage.setItem(ADMIN_VERIFIED_KEY, '1');
      return true;
    }
    onError?.('รหัสผู้ดูแลระบบไม่ถูกต้อง');
    return false;
  };

  // Skip ส่วนที่มีอยู่แล้ว — สร้างเฉพาะที่ขาด (option A)
  const handleBulkGenerate = async (unitIdx) => {
    if (bulkLoadingUnit !== null || loading) {
      onError?.('กรุณารอให้การสร้างปัจจุบันเสร็จก่อน');
      return;
    }
    if (!verifyAdminCode()) return;

    const item = displayData?.[unitIdx];
    if (!item) return;

    // สร้าง task list ตามที่ขาด (skip ของที่มีแล้ว)
    const tasks = [];
    const hasMedia = Array.isArray(item.media) && item.media.length > 0;
    if (!hasMedia) tasks.push({ type: 'media', label: 'รายการสื่อ' });

    // ใบงาน: ถ้า Activities ไม่มี assignments + Media ไม่มี ใบงาน
    // → fallback สร้างอย่างน้อย 1 ใบงานต่อหน่วย (ไม่งั้น hasJobSheet = false ตลอด)
    const worksheets = getWorksheetsForUnit(unitIdx);
    const ensureJobSheetCount = Math.max(worksheets.length, 1);
    for (let wsIdx = 0; wsIdx < ensureJobSheetCount; wsIdx++) {
      if (!(jobSheetStore[unitIdx]?.[wsIdx])) {
        tasks.push({ type: 'jobSheet', index: wsIdx, label: `ใบงาน ${wsIdx + 1}` });
      }
    }

    // สำหรับ 3 ประเภทนี้ — ถ้ายังไม่มี slot เลย ให้สร้าง slot แรกอัตโนมัติ
    // (createXxxSheet มี auto-grow array → เรียกด้วย index 0 ได้แม้ store ว่าง)
    const ensureSheetTasks = (store, type, label) => {
      const slots = store[unitIdx] || [];
      if (slots.length === 0) {
        tasks.push({ type, index: 0, label: `${label} 1` });
      } else {
        slots.forEach((slot, i) => {
          if (!slot) tasks.push({ type, index: i, label: `${label} ${i + 1}` });
        });
      }
    };
    ensureSheetTasks(infoSheetStore, 'infoSheet', 'ใบความรู้');
    ensureSheetTasks(operationSheetStore, 'opSheet', 'ใบปฏิบัติงาน');
    ensureSheetTasks(assignmentSheetStore, 'assignSheet', 'ใบมอบหมายงาน');

    if (tasks.length === 0) {
      onError?.('หน่วยนี้สร้างครบแล้ว ไม่มีอะไรให้สร้างเพิ่ม');
      return;
    }

    setBulkLoadingUnit(unitIdx);
    setBulkProgress({ current: 0, total: tasks.length });

    let failed = 0;
    for (let i = 0; i < tasks.length; i++) {
      setBulkProgress({ current: i + 1, total: tasks.length });
      const task = tasks[i];
      try {
        if (task.type === 'media') await generate();
        else if (task.type === 'jobSheet') await createOneJobSheet(unitIdx, task.index);
        else if (task.type === 'infoSheet') await createInfoSheet(unitIdx, task.index);
        else if (task.type === 'opSheet') await createOperationSheet(unitIdx, task.index);
        else if (task.type === 'assignSheet') await createAssignmentSheet(unitIdx, task.index);
      } catch (err) {
        console.error(`[Bulk] Task ${task.label} failed:`, err);
        failed += 1;
      }
    }

    setBulkLoadingUnit(null);
    setBulkProgress({ current: 0, total: 0 });

    if (failed > 0) {
      onError?.(`สร้างเสร็จแต่มีบางส่วนล้มเหลว ${failed}/${tasks.length} รายการ — ลองกดสร้างใหม่`);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="pnp-shell-card rounded-xl p-5 md:p-6 min-h-[80vh]">
      <div className="mb-6 border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BookOpenCheck className="text-amber-600" /> สื่อและแหล่งการเรียนรู้ (Media & Resources)
        </h2>
        <p className="text-gray-500 text-sm mt-1">สื่อการสอนและแหล่งการเรียนรู้ที่เหมาะสมกับกิจกรรมและเนื้อหา</p>
      </div>

      {/* Results (from pipeline or AI generation) */}
      {displayData ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-green-800 font-semibold text-sm">
              <Check size={16} />
              {isPipelineData ? 'ข้อมูลจาก Module กิจกรรมการเรียนรู้' : 'สร้างสื่อสำเร็จ!'}
              {isPipelineData && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-1">Pipeline</span>}
            </div>
            <div className="flex gap-2">
              {!editing ? (
                <button onClick={startEdit} className="flex items-center gap-1 text-xs text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-50"><Pencil size={12} /> แก้ไข</button>
              ) : (
                <>
                  <button onClick={saveEdit} className="flex items-center gap-1 text-xs text-green-700 border border-green-400 px-3 py-1.5 rounded-lg hover:bg-green-50 font-bold"><Save size={12} /> บันทึก</button>
                  <button onClick={cancelEdit} className="flex items-center gap-1 text-xs text-red-600 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50"><X size={12} /> ยกเลิก</button>
                </>
              )}
              <button onClick={generate} disabled={loading} className="flex items-center gap-1 text-xs text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-60">
                {loading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} {isPipelineData ? 'สร้างโดย AI เพิ่มเติม' : 'สร้างใหม่'}
              </button>
              <button onClick={exportWord} className="flex items-center gap-1 text-xs text-blue-700 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                <FileDown size={12} /> Word
              </button>
              <button onClick={exportPdf} className="flex items-center gap-1 text-xs text-red-700 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50">
                <FileDown size={12} /> PDF
              </button>
            </div>
          </div>

          {/* ── Status Dashboard (เกณฑ์เข้ม: ต้องครบทั้ง 5 ประเภท) ────────── */}
          {completionStatus.length > 0 && (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ListChecks size={20} className="text-indigo-700" />
                  <h3 className="font-bold text-indigo-900">ภาพรวมสถานะการสร้าง</h3>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-bold text-indigo-900">สร้างครบ:</span>
                  <span className={`px-3 py-1 rounded-full font-bold ${totalComplete === totalUnits ? 'bg-green-500 text-white' : 'bg-indigo-100 text-indigo-800'}`}>
                    {totalComplete} / {totalUnits} หน่วย
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-indigo-100 rounded-full h-2 mb-3 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${totalComplete === totalUnits ? 'bg-green-500' : 'bg-indigo-500'}`}
                  style={{ width: `${totalUnits > 0 ? (totalComplete / totalUnits) * 100 : 0}%` }}
                />
              </div>

              {/* Status table */}
              <div className="overflow-x-auto bg-white rounded-xl border border-indigo-200">
                <table className="w-full text-xs">
                  <thead className="bg-indigo-100/60">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold text-indigo-900 whitespace-nowrap">หน่วย</th>
                      <th className="text-left px-3 py-2 font-bold text-indigo-900 min-w-[160px]">ชื่อหน่วย</th>
                      <th className="text-center px-2 py-2 font-bold text-indigo-900" title="รายการสื่อ/แหล่งเรียนรู้">สื่อ</th>
                      <th className="text-center px-2 py-2 font-bold text-indigo-900" title="ใบงาน">ใบงาน</th>
                      <th className="text-center px-2 py-2 font-bold text-indigo-900" title="ใบความรู้">ใบความรู้</th>
                      <th className="text-center px-2 py-2 font-bold text-indigo-900" title="ใบปฏิบัติงาน">ใบปฏิบัติ</th>
                      <th className="text-center px-2 py-2 font-bold text-indigo-900" title="ใบมอบหมายงาน">ใบมอบหมาย</th>
                      <th className="text-center px-3 py-2 font-bold text-indigo-900 whitespace-nowrap">สถานะ</th>
                      <th className="text-center px-3 py-2 font-bold text-indigo-900 whitespace-nowrap">⚡ สร้างทั้งหมด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completionStatus.map((s) => {
                      const isSelected = s.unitIdx === selectedUnitIdx;
                      const isBulkLoading = bulkLoadingUnit === s.unitIdx;
                      const isBulkBusy = bulkLoadingUnit !== null && bulkLoadingUnit !== s.unitIdx;
                      const Icon = ({ ok }) => ok
                        ? <CheckCircle2 size={16} className="text-green-600 mx-auto" />
                        : <Circle size={16} className="text-gray-300 mx-auto" />;
                      return (
                        <tr
                          key={s.unitIdx}
                          onClick={() => setSelectedUnitIdx(s.unitIdx)}
                          className={`border-t border-indigo-100 cursor-pointer transition ${isSelected ? 'bg-amber-100 ring-2 ring-amber-400' : 'hover:bg-indigo-50'}`}
                        >
                          <td className="px-3 py-2 font-bold text-indigo-700 whitespace-nowrap">{s.unitIdx + 1}</td>
                          <td className="px-3 py-2 text-gray-800 truncate max-w-[200px]" title={s.unitName}>{s.unitName}</td>
                          <td className="px-2 py-2 text-center"><Icon ok={s.hasMedia} /></td>
                          <td className="px-2 py-2 text-center"><Icon ok={s.hasJobSheet} /></td>
                          <td className="px-2 py-2 text-center"><Icon ok={s.hasInfoSheet} /></td>
                          <td className="px-2 py-2 text-center"><Icon ok={s.hasOpSheet} /></td>
                          <td className="px-2 py-2 text-center"><Icon ok={s.hasAssignSheet} /></td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            {s.isComplete ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                                <CheckCircle2 size={12} /> สำเร็จ
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                                {s.completedCount}/5
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {s.isComplete ? (
                              <span className="text-xs text-gray-400 italic">ครบแล้ว</span>
                            ) : isBulkLoading ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-100 px-2 py-1 rounded-full">
                                <Loader2 size={12} className="animate-spin" />
                                {bulkProgress.current}/{bulkProgress.total}
                              </span>
                            ) : (
                              <button
                                onClick={() => handleBulkGenerate(s.unitIdx)}
                                disabled={isBulkBusy}
                                className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition shadow-sm border ${
                                  isBulkBusy
                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-purple-600 hover:from-purple-600 hover:to-pink-600 hover:shadow-md'
                                }`}
                                  title={localStorage.getItem(ADMIN_VERIFIED_KEY) === '1' ? 'สร้างทั้งหมดที่ขาดในหน่วยนี้' : 'ต้องใส่รหัสผู้ดูแลระบบก่อน'}
                              >
                                  {localStorage.getItem(ADMIN_VERIFIED_KEY) === '1' ? <Zap size={12} /> : <Lock size={12} />}
                                สร้างทั้งหมด
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-indigo-600 mt-2 italic">
                💡 คลิกที่แถวเพื่อเปิดดูหน่วยนั้น • เกณฑ์สำเร็จ: ต้องมีครบทั้ง 5 ประเภท (สื่อ + ใบงาน + ใบความรู้ + ใบปฏิบัติงาน + ใบมอบหมายงาน อย่างน้อย 1 ใบ)
              </p>
            </div>
          )}

          {/* Unit dropdown */}
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-amber-800 whitespace-nowrap">เลือกหน่วยที่แสดง:</span>
            <select
              value={selectedUnitIdx}
              onChange={(e) => setSelectedUnitIdx(Number(e.target.value))}
              className="flex-1 border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-amber-400"
            >
              {displayData.map((item, i) => (
                <option key={i} value={i}>{item.unitName || `หน่วยที่ ${i + 1}`}</option>
              ))}
            </select>
            <span className="text-xs text-amber-600">{selectedUnitIdx + 1}/{displayData.length} หน่วย</span>
          </div>

          {(() => {
            const currentData = editing ? editData : displayData;
            const item = currentData?.[selectedUnitIdx];
            if (!item) return null;
            const groups = groupMediaByType(item.media);
            return (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
                <h3 className="font-bold text-amber-900 text-sm">{item.unitName}</h3>
              </div>
              <div className="p-4 space-y-4">
                {SECTION_ORDER.map((sectionName) => {
                  const meta = SECTION_META[sectionName];
                  const items = groups[sectionName] || [];
                  // For ใบงาน/ใบความรู้/ใบปฏิบัติงาน/ใบมอบหมายงาน sheet docs
                  // are stored separately (not in media[] bucket).
                  // Header count + empty-state must include those stores too.
                  const isJobSheetSection = sectionName === 'ใบงาน';
                  const isInfoSheetSection = sectionName === 'ใบความรู้';
                  const isOpSheetSection = sectionName === 'ใบปฏิบัติงาน';
                  const isAssignSheetSection = sectionName === 'ใบมอบหมายงาน';
                  const jsWsCount = isJobSheetSection ? getWorksheetsForUnit(selectedUnitIdx).length : 0;
                  const infoSheetCount = isInfoSheetSection ? (infoSheetStore[selectedUnitIdx] || []).filter((s) => s).length : 0;
                  const opSheetCount = isOpSheetSection ? (operationSheetStore[selectedUnitIdx] || []).filter((s) => s).length : 0;
                  const assignSheetCount = isAssignSheetSection ? (assignmentSheetStore[selectedUnitIdx] || []).filter((s) => s).length : 0;
                  const sheetExtraCount = jsWsCount + infoSheetCount + opSheetCount + assignSheetCount;
                  const headerCount = items.length + sheetExtraCount;
                  const showEmpty = (items.length === 0 && sheetExtraCount === 0 && !editing);
                  // Always render all 5 section headers so the structure is
                  // visible even for empty/reserved categories.
                  const isExpanded = !!expandedSections[sectionName];
                  return (
                    <div key={sectionName} className={`border ${meta.border} rounded-xl overflow-hidden`}>
                      <button
                        onClick={() => setExpandedSections((prev) => ({ ...prev, [sectionName]: !prev[sectionName] }))}
                        className={`${meta.head} px-3 py-2 flex items-center justify-between w-full text-left hover:opacity-80 transition`}
                      >
                        <h4 className="font-bold text-sm flex items-center gap-1">
                          <span className="text-xs">{isExpanded ? '▼' : '▶'}</span> {sectionName}
                        </h4>
                        <span className="text-[11px] opacity-80">{headerCount} รายการ</span>
                      </button>
                      {isExpanded && <div className={`p-3 ${meta.bg}`}>
                        {showEmpty && (
                          <p className="text-xs text-gray-400 italic text-center py-2">— ยังไม่มีข้อมูล —</p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {items.map((m) => {
                            const i = m._origIdx;
                            return editing ? (
                              <div key={i} className="p-3 rounded-xl border border-gray-300 bg-white space-y-2">
                                <div className="flex justify-between items-center">
                                  <select value={m.type} onChange={(e) => updateEditMedia(selectedUnitIdx, i, 'type', e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1">
                                    <option value="สื่อการสอน">สื่อการสอน</option>
                                    <option value="ใบความรู้">ใบความรู้</option>
                                    <option value="ใบงาน">ใบงาน</option>
                                    <option value="ใบปฏิบัติงาน">ใบปฏิบัติงาน</option>
                                    <option value="ใบมอบหมายงาน">ใบมอบหมายงาน</option>
                                  </select>
                                  <button onClick={() => removeEditMedia(selectedUnitIdx, i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                                </div>
                                <input type="text" value={m.name} onChange={(e) => updateEditMedia(selectedUnitIdx, i, 'name', e.target.value)} placeholder="ชื่อสื่อ" className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                                <textarea value={m.description} onChange={(e) => updateEditMedia(selectedUnitIdx, i, 'description', e.target.value)} placeholder="รายละเอียด" className="w-full border border-gray-300 rounded px-2 py-1 text-xs min-h-[40px]" />
                                <textarea value={m.usage} onChange={(e) => updateEditMedia(selectedUnitIdx, i, 'usage', e.target.value)} placeholder="วิธีใช้" className="w-full border border-gray-300 rounded px-2 py-1 text-xs min-h-[40px]" />
                              </div>
                            ) : (
                              <div key={i} className="p-3 rounded-xl border border-white bg-white/80">
                                <div className="flex items-start gap-2 mb-1">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${meta.chip}`}>{sectionName}</span>
                                  <span className="font-semibold text-gray-800 text-sm">{m.name}</span>
                                </div>
                                <p className="text-xs text-gray-600 mt-1">{m.description}</p>
                                <p className="text-xs text-gray-400 mt-1 italic">วิธีใช้: {m.usage}</p>
                              </div>
                            );
                          })}
                          {editing && (
                            <button
                              onClick={() => addEditMedia(selectedUnitIdx, sectionName)}
                              className="p-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:text-blue-600 hover:border-blue-300 text-sm flex items-center justify-center bg-white"
                            >
                              + เพิ่ม{sectionName}
                            </button>
                          )}
                        </div>

                        {/* Information Sheet (ใบความรู้) sub-panel */}
                        {sectionName === 'ใบความรู้' && !editing && (() => {
                          const sheets = infoSheetStore[selectedUnitIdx] || [];
                          const sheetCount = Math.max(sheets.length, 1);
                          return (
                            <div className="mt-4 border-t border-yellow-200 pt-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <div className="text-xs font-semibold text-yellow-900 flex items-center gap-1">
                                  <FileText size={14} /> เอกสารใบความรู้ (Information Sheet)
                                </div>
                                <button
                                  onClick={() => addInfoSheet(selectedUnitIdx)}
                                  className="text-[11px] text-yellow-700 border border-yellow-300 px-2 py-1 rounded hover:bg-yellow-50"
                                >+ เพิ่มใบความรู้</button>
                              </div>
                              <div className="space-y-2">
                                {Array.from({ length: sheetCount }).map((_, idx) => {
                                  const s = sheets[idx];
                                  const hasContent = sheetHasContent(s);
                                  const isLoading = sheetLoading === `info:${selectedUnitIdx}:${idx}`;
                                  const displayTitle = s?.title || `ใบความรู้ที่ ${idx + 1}`;
                                  return (
                                    <div key={idx} className="bg-white border border-yellow-200 rounded-lg p-3">
                                      <div className="flex items-start justify-between gap-2 mb-1">
                                        <div className="min-w-0 flex-1">
                                          <div className="text-xs text-yellow-700 font-bold flex items-center gap-1.5">
                                            <span>ใบความรู้ที่ {idx + 1}</span>
                                            {isLoading ? (
                                              <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Loader2 size={9} className="animate-spin" /> กำลังสร้าง</span>
                                            ) : hasContent ? (
                                              <span className="text-[10px] bg-green-100 text-green-700 border border-green-300 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Check size={9} /> สร้างแล้ว</span>
                                            ) : (
                                              <span className="text-[10px] bg-gray-100 text-gray-600 border border-gray-300 px-1.5 py-0.5 rounded-full">ยังไม่สร้าง</span>
                                            )}
                                          </div>
                                          {hasContent && <div className="text-sm font-semibold text-gray-800 truncate">{displayTitle}</div>}
                                        </div>
                                        <div className="flex flex-wrap gap-1 shrink-0">
                                          <button onClick={() => createInfoSheet(selectedUnitIdx, idx)} disabled={isLoading || loading}
                                            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded disabled:opacity-50 ${hasContent ? 'text-yellow-700 border border-yellow-300 hover:bg-yellow-50' : 'text-white bg-yellow-600 border border-yellow-700 hover:bg-yellow-700'}`}>
                                            {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                            {hasContent ? 'สร้างใหม่' : 'สร้าง'}
                                          </button>
                                          {hasContent && (
                                            <>
                                              <button onClick={() => exportInfoSheetWord(selectedUnitIdx, idx)}
                                                className="flex items-center gap-1 text-[11px] text-blue-700 border border-blue-300 px-2 py-1 rounded hover:bg-blue-50">
                                                <FileDown size={11} /> Word
                                              </button>
                                              <button onClick={() => { if (window.confirm(`ลบใบความรู้ที่ ${idx + 1}?`)) removeInfoSheet(selectedUnitIdx, idx); }}
                                                className="flex items-center gap-1 text-[11px] text-red-600 border border-red-300 px-2 py-1 rounded hover:bg-red-50">
                                                <Trash2 size={11} />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      {hasContent && (
                                        <details className="text-xs text-gray-700 mt-2">
                                          <summary className="cursor-pointer text-yellow-600 hover:text-yellow-800">ดูเนื้อหาใบความรู้</summary>
                                          <div className="mt-2 space-y-2 pl-2 border-l-2 border-yellow-200">
                                            <div><div className="text-[11px] font-semibold text-yellow-800">5. สาระการเรียนรู้</div><p className="text-[11px] text-gray-600 whitespace-pre-line line-clamp-6">{s.content || '— ว่าง —'}</p></div>
                                            <div><div className="text-[11px] font-semibold text-yellow-800">6. แบบฝึกหัด</div><p className="text-[11px] text-gray-600 whitespace-pre-line line-clamp-4">{s.exercises || '— ว่าง —'}</p></div>
                                            <div><div className="text-[11px] font-semibold text-yellow-800">7. เอกสารอ้างอิง</div><p className="text-[11px] text-gray-600 whitespace-pre-line line-clamp-3">{s.references || '— ว่าง —'}</p></div>
                                          </div>
                                        </details>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Operation Sheet (ใบปฏิบัติงาน) sub-panel */}
                        {sectionName === 'ใบปฏิบัติงาน' && !editing && (() => {
                          const sheets = operationSheetStore[selectedUnitIdx] || [];
                          const sheetCount = Math.max(sheets.length, 1);
                          return (
                            <div className="mt-4 border-t border-green-200 pt-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <div className="text-xs font-semibold text-green-900 flex items-center gap-1">
                                  <FileText size={14} /> เอกสารใบปฏิบัติงาน (Operation Sheet)
                                </div>
                                <button
                                  onClick={() => addOperationSheet(selectedUnitIdx)}
                                  className="text-[11px] text-green-700 border border-green-300 px-2 py-1 rounded hover:bg-green-50"
                                >+ เพิ่มใบปฏิบัติงาน</button>
                              </div>
                              <div className="space-y-2">
                                {Array.from({ length: sheetCount }).map((_, idx) => {
                                  const s = sheets[idx];
                                  const hasContent = sheetHasContent(s);
                                  const isLoading = sheetLoading === `op:${selectedUnitIdx}:${idx}`;
                                  const displayTitle = s?.title || `ใบปฏิบัติงานที่ ${idx + 1}`;
                                  return (
                                    <div key={idx} className="bg-white border border-green-200 rounded-lg p-3">
                                      <div className="flex items-start justify-between gap-2 mb-1">
                                        <div className="min-w-0 flex-1">
                                          <div className="text-xs text-green-700 font-bold flex items-center gap-1.5">
                                            <span>ใบปฏิบัติงานที่ {idx + 1}</span>
                                            {isLoading ? (
                                              <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Loader2 size={9} className="animate-spin" /> กำลังสร้าง</span>
                                            ) : hasContent ? (
                                              <span className="text-[10px] bg-green-100 text-green-700 border border-green-300 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Check size={9} /> สร้างแล้ว</span>
                                            ) : (
                                              <span className="text-[10px] bg-gray-100 text-gray-600 border border-gray-300 px-1.5 py-0.5 rounded-full">ยังไม่สร้าง</span>
                                            )}
                                          </div>
                                          {hasContent && <div className="text-sm font-semibold text-gray-800 truncate">{displayTitle}</div>}
                                        </div>
                                        <div className="flex flex-wrap gap-1 shrink-0">
                                          <button onClick={() => createOperationSheet(selectedUnitIdx, idx)} disabled={isLoading || loading}
                                            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded disabled:opacity-50 ${hasContent ? 'text-green-700 border border-green-300 hover:bg-green-50' : 'text-white bg-green-600 border border-green-700 hover:bg-green-700'}`}>
                                            {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                            {hasContent ? 'สร้างใหม่' : 'สร้าง'}
                                          </button>
                                          {hasContent && (
                                            <>
                                              <button onClick={() => exportOperationSheetWord(selectedUnitIdx, idx)}
                                                className="flex items-center gap-1 text-[11px] text-blue-700 border border-blue-300 px-2 py-1 rounded hover:bg-blue-50">
                                                <FileDown size={11} /> Word
                                              </button>
                                              <button onClick={() => { if (window.confirm(`ลบใบปฏิบัติงานที่ ${idx + 1}?`)) removeOperationSheet(selectedUnitIdx, idx); }}
                                                className="flex items-center gap-1 text-[11px] text-red-600 border border-red-300 px-2 py-1 rounded hover:bg-red-50">
                                                <Trash2 size={11} />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      {hasContent && (
                                        <details className="text-xs text-gray-700 mt-2">
                                          <summary className="cursor-pointer text-green-600 hover:text-green-800">ดูเนื้อหาใบปฏิบัติงาน</summary>
                                          <div className="mt-2 space-y-2 pl-2 border-l-2 border-green-200">
                                            <div><div className="text-[11px] font-semibold text-green-800">5. เครื่องมือ วัสดุ</div><p className="text-[11px] text-gray-600 whitespace-pre-line">{Array.isArray(s.tools) ? s.tools.join(', ') : '— ว่าง —'}</p></div>
                                            <div><div className="text-[11px] font-semibold text-green-800">6. ขั้นตอนการทำกิจกรรม</div><p className="text-[11px] text-gray-600 whitespace-pre-line line-clamp-4">{s.steps || '— ว่าง —'}</p></div>
                                            <div><div className="text-[11px] font-semibold text-green-800">7. สรุปและอภิปราย</div><p className="text-[11px] text-gray-600 whitespace-pre-line line-clamp-3">{s.summary || '— ว่าง —'}</p></div>
                                          </div>
                                        </details>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Assignment Sheet (ใบมอบหมายงาน) sub-panel */}
                        {sectionName === 'ใบมอบหมายงาน' && !editing && (() => {
                          const sheets = assignmentSheetStore[selectedUnitIdx] || [];
                          const sheetCount = Math.max(sheets.length, 1);
                          return (
                            <div className="mt-4 border-t border-orange-200 pt-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <div className="text-xs font-semibold text-orange-900 flex items-center gap-1">
                                  <FileText size={14} /> เอกสารใบมอบหมายงาน (Assignment Sheet)
                                </div>
                                <button
                                  onClick={() => addAssignmentSheet(selectedUnitIdx)}
                                  className="text-[11px] text-orange-700 border border-orange-300 px-2 py-1 rounded hover:bg-orange-50"
                                >+ เพิ่มใบมอบหมายงาน</button>
                              </div>
                              <div className="space-y-2">
                                {Array.from({ length: sheetCount }).map((_, idx) => {
                                  const s = sheets[idx];
                                  const hasContent = sheetHasContent(s);
                                  const isLoading = sheetLoading === `assign:${selectedUnitIdx}:${idx}`;
                                  const displayTitle = s?.title || `ใบมอบหมายงานที่ ${idx + 1}`;
                                  return (
                                    <div key={idx} className="bg-white border border-orange-200 rounded-lg p-3">
                                      <div className="flex items-start justify-between gap-2 mb-1">
                                        <div className="min-w-0 flex-1">
                                          <div className="text-xs text-orange-700 font-bold flex items-center gap-1.5">
                                            <span>ใบมอบหมายงานที่ {idx + 1}</span>
                                            {isLoading ? (
                                              <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Loader2 size={9} className="animate-spin" /> กำลังสร้าง</span>
                                            ) : hasContent ? (
                                              <span className="text-[10px] bg-green-100 text-green-700 border border-green-300 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Check size={9} /> สร้างแล้ว</span>
                                            ) : (
                                              <span className="text-[10px] bg-gray-100 text-gray-600 border border-gray-300 px-1.5 py-0.5 rounded-full">ยังไม่สร้าง</span>
                                            )}
                                          </div>
                                          {hasContent && <div className="text-sm font-semibold text-gray-800 truncate">{displayTitle}</div>}
                                        </div>
                                        <div className="flex flex-wrap gap-1 shrink-0">
                                          <button onClick={() => createAssignmentSheet(selectedUnitIdx, idx)} disabled={isLoading || loading}
                                            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded disabled:opacity-50 ${hasContent ? 'text-orange-700 border border-orange-300 hover:bg-orange-50' : 'text-white bg-orange-600 border border-orange-700 hover:bg-orange-700'}`}>
                                            {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                            {hasContent ? 'สร้างใหม่' : 'สร้าง'}
                                          </button>
                                          {hasContent && (
                                            <>
                                              <button onClick={() => exportAssignmentSheetWord(selectedUnitIdx, idx)}
                                                className="flex items-center gap-1 text-[11px] text-blue-700 border border-blue-300 px-2 py-1 rounded hover:bg-blue-50">
                                                <FileDown size={11} /> Word
                                              </button>
                                              <button onClick={() => { if (window.confirm(`ลบใบมอบหมายงานที่ ${idx + 1}?`)) removeAssignmentSheet(selectedUnitIdx, idx); }}
                                                className="flex items-center gap-1 text-[11px] text-red-600 border border-red-300 px-2 py-1 rounded hover:bg-red-50">
                                                <Trash2 size={11} />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      {hasContent && (
                                        <details className="text-xs text-gray-700 mt-2">
                                          <summary className="cursor-pointer text-orange-600 hover:text-orange-800">ดูเนื้อหาใบมอบหมายงาน</summary>
                                          <div className="mt-2 space-y-2 pl-2 border-l-2 border-orange-200">
                                            <div><div className="text-[11px] font-semibold text-orange-800">1. ผลงาน</div><p className="text-[11px] text-gray-600 whitespace-pre-line line-clamp-3">{s.workProduct || '— ว่าง —'}</p></div>
                                            <div><div className="text-[11px] font-semibold text-orange-800">5. รายละเอียดของงาน</div><p className="text-[11px] text-gray-600 whitespace-pre-line line-clamp-4">{s.taskDetails || '— ว่าง —'}</p></div>
                                            <div><div className="text-[11px] font-semibold text-orange-800">6. กำหนดเวลาส่ง</div><p className="text-[11px] text-gray-600 whitespace-pre-line">{s.deadline || '— ว่าง —'}</p></div>
                                            <div><div className="text-[11px] font-semibold text-orange-800">7. แนวทางปฏิบัติ</div><p className="text-[11px] text-gray-600 whitespace-pre-line line-clamp-3">{s.guidelines || '— ว่าง —'}</p></div>
                                          </div>
                                        </details>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Job Sheet (ใบงาน) sub-panel: AI generate + export */}
                        {sectionName === 'ใบงาน' && !editing && (() => {
                          const sheets = jobSheetStore[selectedUnitIdx] || [];
                          // Iterate worksheets from Activities Module — show one row per ชิ้นงาน
                          const activityWs = getWorksheetsForUnit(selectedUnitIdx);
                          const wsCount = activityWs.length;
                          return (
                            <div className="mt-4 border-t border-pink-200 pt-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <div className="text-xs font-semibold text-pink-900 flex items-center gap-1">
                                  <FileText size={14} /> เอกสารใบงาน (Job Sheet) — รายการชิ้นงานจาก Module กิจกรรมการเรียนรู้
                                </div>
                                {wsCount > 0 && (
                                  <div className="text-[10px] text-pink-600">ทั้งหมด {wsCount} ใบ</div>
                                )}
                              </div>
                              {wsCount === 0 ? (
                                <p className="text-xs text-gray-500 italic">
                                  ยังไม่มีชิ้นงาน/ภาระงานใน Module กิจกรรมการเรียนรู้ — กลับไปสร้างกิจกรรม/ชิ้นงานก่อน รายชื่อใบงานจะปรากฏที่นี่อัตโนมัติ
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {activityWs.map((ws, wsIdx) => {
                                    const js = sheets[wsIdx];
                                    const titleKey = `${selectedUnitIdx}:${wsIdx}`;
                                    const isEditingTitle = editingTitleKey === titleKey;
                                    const isGeneratingThis = singleSheetLoading === titleKey;
                                    const hasContent = jobSheetHasContent(js);
                                    const displayTitle = (js && js.title) || ws.name || `ใบงานที่ ${wsIdx + 1}`;
                                    return (
                                    <div key={wsIdx} className="bg-white border border-pink-200 rounded-lg p-3">
                                      <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="min-w-0 flex-1">
                                          <div className="text-xs text-pink-700 font-bold flex flex-wrap items-center gap-1.5">
                                            <span>ใบงานที่ {wsIdx + 1}</span>
                                            {isGeneratingThis ? (
                                              <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded-full flex items-center gap-1 font-medium">
                                                <Loader2 size={9} className="animate-spin" /> กำลังสร้าง
                                              </span>
                                            ) : hasContent ? (
                                              <span className="text-[10px] bg-green-100 text-green-700 border border-green-300 px-1.5 py-0.5 rounded-full flex items-center gap-1 font-medium">
                                                <Check size={9} /> สร้างแล้ว
                                              </span>
                                            ) : (
                                              <span className="text-[10px] bg-gray-100 text-gray-600 border border-gray-300 px-1.5 py-0.5 rounded-full font-medium">
                                                ยังไม่สร้าง
                                              </span>
                                            )}
                                          </div>
                                          {isEditingTitle ? (
                                            <div className="flex items-center gap-1 mt-1">
                                              <input
                                                type="text"
                                                value={editingTitleValue}
                                                onChange={(e) => setEditingTitleValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') commitEditTitle();
                                                  if (e.key === 'Escape') cancelEditTitle();
                                                }}
                                                autoFocus
                                                placeholder="ชื่อใบงาน เช่น การต่อวงจรอนุกรม"
                                                className="flex-1 text-sm border border-pink-300 rounded px-2 py-1 focus:ring-2 focus:ring-pink-300"
                                              />
                                              <button onClick={commitEditTitle} className="text-green-700 hover:bg-green-50 p-1 rounded" title="บันทึก"><Check size={14} /></button>
                                              <button onClick={cancelEditTitle} className="text-gray-500 hover:bg-gray-100 p-1 rounded" title="ยกเลิก"><X size={14} /></button>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-1.5 group">
                                              <div className="text-sm font-semibold text-gray-800 truncate">{displayTitle}</div>
                                              {hasContent && (
                                                <button
                                                  onClick={() => startEditTitle(selectedUnitIdx, wsIdx, displayTitle)}
                                                  className="text-pink-500 opacity-60 hover:opacity-100 hover:bg-pink-50 p-0.5 rounded"
                                                  title="แก้ไขชื่อใบงาน"
                                                >
                                                  <Pencil size={11} />
                                                </button>
                                              )}
                                            </div>
                                          )}
                                          {ws.description && (
                                            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{ws.description}</div>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                                          <button
                                            onClick={() => createOneJobSheet(selectedUnitIdx, wsIdx)}
                                            disabled={isGeneratingThis || loading}
                                            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded disabled:opacity-50 ${
                                              hasContent
                                                ? 'text-pink-700 border border-pink-300 hover:bg-pink-50'
                                                : 'text-white bg-pink-600 border border-pink-700 hover:bg-pink-700'
                                            }`}
                                            title={hasContent ? 'ให้ AI สร้างเนื้อหาใบงานใบนี้ใหม่ (ทับของเดิม)' : 'ให้ AI สร้างเนื้อหาสำหรับใบงานใบนี้'}
                                          >
                                            {isGeneratingThis ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                            {hasContent ? 'สร้างใหม่' : 'สร้างใบงาน'}
                                          </button>
                                          {hasContent && (
                                            <>
                                              <button
                                                onClick={() => exportJobSheetWord(selectedUnitIdx, wsIdx)}
                                                className="flex items-center gap-1 text-[11px] text-blue-700 border border-blue-300 px-2 py-1 rounded hover:bg-blue-50"
                                                title="ดาวน์โหลดเป็น Word ตาม template-jobsheet1.docx (1 ไฟล์ต่อ 1 ใบงาน)"
                                              >
                                                <FileDown size={11} /> Word
                                              </button>
                                              <button
                                                onClick={() => {
                                                  if (window.confirm(`ล้างเนื้อหาใบงานที่ ${wsIdx + 1} (${displayTitle}) ?`)) {
                                                    removeJobSheet(selectedUnitIdx, wsIdx);
                                                  }
                                                }}
                                                className="flex items-center gap-1 text-[11px] text-red-600 border border-red-300 px-2 py-1 rounded hover:bg-red-50"
                                                title="ล้างเนื้อหาใบงานใบนี้ (ชื่อใบงานยังคงอยู่)"
                                              >
                                                <Trash2 size={11} />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      {hasContent && (
                                        <details className="text-xs text-gray-700">
                                          <summary className="cursor-pointer text-pink-600 hover:text-pink-800">ดูเนื้อหาใบงาน 10 หัวข้อ</summary>
                                          <div className="mt-2 space-y-2 pl-2 border-l-2 border-pink-200">
                                            {/* 1. ผลลัพธ์การเรียนรู้ */}
                                            <div>
                                              <div className="text-[11px] font-semibold text-pink-800">1. ผลลัพธ์การเรียนรู้จากการปฏิบัติงาน</div>
                                              {js.lo ? (
                                                <p className="text-[11px] text-gray-600 whitespace-pre-line">{js.lo}</p>
                                              ) : (
                                                <p className="text-[11px] text-gray-400 italic">— ว่าง —</p>
                                              )}
                                            </div>
                                            {/* 3. สมรรถนะการปฏิบัติงาน */}
                                            <div>
                                              <div className="text-[11px] font-semibold text-pink-800">3. สมรรถนะการปฏิบัติงาน</div>
                                              {Array.isArray(js.competencies) && js.competencies.length > 0 ? (
                                                <ol className="text-[11px] list-decimal pl-5 text-gray-600">
                                                  {js.competencies.map((x, i) => <li key={i}>{jsCleanComp(x)}</li>)}
                                                </ol>
                                              ) : (
                                                <p className="text-[11px] text-gray-400 italic">— ว่าง —</p>
                                              )}
                                            </div>
                                            {/* 5. เครื่องมือ วัสดุ อุปกรณ์ */}
                                            <div>
                                              <div className="text-[11px] font-semibold text-pink-800">5. เครื่องมือ วัสดุ และอุปกรณ์</div>
                                              {Array.isArray(js.tools) && js.tools.length > 0 ? (
                                                <ol className="text-[11px] list-decimal pl-5 text-gray-600">
                                                  {js.tools.map((x, i) => <li key={i}>{jsStripMarker(x)}</li>)}
                                                </ol>
                                              ) : (
                                                <p className="text-[11px] text-gray-400 italic">— ว่าง —</p>
                                              )}
                                            </div>
                                            {/* 6. คำแนะนำ/ข้อควรระวัง */}
                                            <div>
                                              <div className="text-[11px] font-semibold text-pink-800">6. คำแนะนำ/ข้อควรระวัง</div>
                                              {js.caution ? (
                                                <p className="text-[11px] text-gray-600 whitespace-pre-line">{js.caution}</p>
                                              ) : (
                                                <p className="text-[11px] text-gray-400 italic">— ว่าง —</p>
                                              )}
                                            </div>
                                            {/* 7. ขั้นตอนการปฏิบัติงาน */}
                                            <div>
                                              <div className="text-[11px] font-semibold text-pink-800">7. ขั้นตอนการปฏิบัติงาน</div>
                                              {Array.isArray(js.steps) && js.steps.length > 0 ? (
                                                <ol className="text-[11px] list-decimal pl-5 text-gray-600">
                                                  {js.steps.map((x, i) => <li key={i}>{jsStripMarker(x)}</li>)}
                                                </ol>
                                              ) : (
                                                <p className="text-[11px] text-gray-400 italic">— ว่าง —</p>
                                              )}
                                            </div>
                                            {/* 8. สรุปและวิจารณ์ผล */}
                                            <div>
                                              <div className="text-[11px] font-semibold text-pink-800">8. สรุปและวิจารณ์ผล</div>
                                              {js.summary ? (
                                                <p className="text-[11px] text-gray-600 whitespace-pre-line">{js.summary}</p>
                                              ) : (
                                                <p className="text-[11px] text-gray-400 italic">— ว่าง —</p>
                                              )}
                                            </div>
                                            {/* 10. เอกสารอ้างอิง */}
                                            <div>
                                              <div className="text-[11px] font-semibold text-pink-800">10. เอกสารอ้างอิง / ค้นคว้าเพิ่มเติม</div>
                                              {Array.isArray(js.references) && js.references.length > 0 ? (
                                                <ol className="text-[11px] list-decimal pl-5 text-gray-600">
                                                  {js.references.map((x, i) => <li key={i}>{jsStripMarker(x)}</li>)}
                                                </ol>
                                              ) : (
                                                <p className="text-[11px] text-gray-400 italic">— ว่าง —</p>
                                              )}
                                            </div>
                                            <div className="text-[10px] text-gray-500 pt-1 italic border-t border-pink-100">
                                              หัวข้อ 4 (จุดประสงค์เชิงพฤติกรรม) และ 9 (การประเมินผล) ระบบจะนำมาจาก Module ก่อนหน้าโดยอัตโนมัติเมื่อส่งออก Word
                                            </div>
                                          </div>
                                        </details>
                                      )}
                                    </div>
                                  );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}

          <div className="mt-6 text-center bg-gray-50 p-5 rounded-xl border border-gray-200">
            {(() => {
              const completedCount = (mediaResults || []).filter(r => r._unitIdx !== undefined || r.unitName).length;
              const totalCount = unitList.length;
              const allDone = completedCount >= totalCount;
              return (
                <>
                  {!allDone && <p className="text-sm text-amber-600 mb-2">กรุณาสร้างสื่อให้ครบทุกหน่วย ({completedCount}/{totalCount})</p>}
                  <button onClick={() => onNavigate('evidence')} disabled={!allDone}
                    className={`px-8 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 mx-auto transition ${allDone ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                    ไปขั้นตอนต่อไป: หลักฐานการเรียนรู้ <ArrowRight size={20} />
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        /* No data yet - show generate UI */
        <div className="max-w-xl mx-auto w-full">
          {hasInternal ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 text-center mb-4">
              <h3 className="text-indigo-800 font-bold text-lg mb-2">สร้างสื่อโดย AI</h3>
              <p className="text-indigo-700 text-sm mb-4">รับข้อมูลจากระบบอัตโนมัติ (หลักสูตร + กิจกรรม + สาระการเรียนรู้ + จุดประสงค์)</p>
              <button onClick={generate} disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center justify-center gap-2">
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />} สร้างสื่อและแหล่งการเรียนรู้
              </button>
            </div>
          ) : (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center mb-6">
                <p className="text-sm text-gray-500">Upload ข้อมูลด้วยตนเอง</p>
              </div>
              <div className="flex items-center justify-center mb-6">
                {UPLOAD_STEPS.map((s, i) => (
                  <React.Fragment key={s.key}>
                    {i > 0 && <div className={`w-12 h-1 mx-1 ${step >= s.step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= s.step ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' : 'border-gray-300 text-gray-400'}`}>{s.step}</div>
                  </React.Fragment>
                ))}
              </div>
              {UPLOAD_STEPS.map((s) => {
                if (step !== s.step) return null;
                const hook = fileHooks[s.key];
                return (
                  <div key={s.key}>
                    {s.step > 1 && <button onClick={() => setStep(s.step - 1)} className="text-gray-500 text-sm mb-2 flex items-center"><ChevronLeft size={16} /> ย้อนกลับ</button>}
                    <label className="block text-lg font-bold text-gray-800 mb-3 text-center">ขั้นตอนที่ {s.step}: {s.label}</label>
                    <FileUploadZone file={hook.file} onUpload={hook.handleUpload} label={`คลิกเพื่อแนบไฟล์ ${s.label}`} height="h-64" />
                    {hook.file && (
                      s.step < UPLOAD_STEPS.length
                        ? <button onClick={() => setStep(s.step + 1)} className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2">ถัดไป <ChevronRight /></button>
                        : <button onClick={generate} disabled={loading} className="w-full mt-4 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2 shadow-lg disabled:opacity-70">
                            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} สร้างสื่อและแหล่งการเรียนรู้
                          </button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MediaModule;
