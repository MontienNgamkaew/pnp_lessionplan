import React, { useState, useEffect } from 'react';
import {
  Upload, FileText, FileType, Check, PenTool, BookOpen, Loader2,
  Info, RefreshCw, Sparkles, ArrowRight, AlertTriangle, Search,
  Paperclip, Table as TableIcon, FileDown, ChevronRight, Briefcase
} from 'lucide-react';
import MarkdownTableRenderer from '../common/MarkdownTableRenderer';
import UnitTableWithTooltip from '../common/UnitTableWithTooltip';
import EditableUnitTable from '../common/EditableUnitTable';
import ExportButtons from '../common/ExportButtons';
import SubjectSearchPopup from '../modals/SubjectSearchPopup';
import { useAiApi } from '../../hooks/useAiApi';
import { SYSTEM_PROMPT_EXTRACTION, SYSTEM_PROMPT_STANDARD_OCR } from '../../constants/prompts';
import { buildAnalysisPrompt, buildUnitDivisionPrompt } from '../../constants/promptBuilders';
import { getCourseLevel, getWeeklyHours, getTheoryPractice, getWeeksFromCode } from '../../utils/courseHelpers';
import { convertMarkdownTableToHTML, parseUnitTable, convertUnitTableToHTML } from '../../utils/markdownTable';
import { printToPdf, createWordDoc } from '../../utils/exportHelpers';
import { cleanAndParseJSON } from '../../utils/jsonParser';
import { parseAnalysisResponse, parseUnitDivisionResponse } from '../../utils/analysisConverter';
import vecCurriculum from '../../data/vecCurriculum2567.json';

const AnalysisModule = ({
  providerId, apiKey, triggerDownload,
  formData, setFormData,
  generatedPlan, setGeneratedPlan,
  unitDivisionPlan, setUnitDivisionPlan,
  onError, onNavigate, onOpenStandardSearch,
  standardPastedText: standardPastedTextProp, setStandardPastedText: setStandardPastedTextProp,
  onRegenerate,
}) => {
  // Auto-restore step based on existing data
  const [step, setStep] = useState(() => {
    if (generatedPlan) return 3;
    if (formData.courseCode) return 2;
    return 1;
  });
  const [courseFile, setCourseFile] = useState(null);
  const [coursePastedText, setCoursePastedText] = useState('');
  const [showSubjectSearch, setShowSubjectSearch] = useState(false);
  const [hasStandard, setHasStandard] = useState(false);
  const [standardContent, setStandardContent] = useState('');
  const standardPastedText = standardPastedTextProp || '';
  const setStandardPastedText = setStandardPastedTextProp || (() => {});
  const [standardFileName, setStandardFileName] = useState('');
  const [dividingUnits, setDividingUnits] = useState(false);
  const [hasEvalRow, setHasEvalRow] = useState(false);
  const { callApi, loading, loadingText } = useAiApi(providerId, apiKey);

  // Auto-generate unit division when returning to step 3 with plan but no units
  useEffect(() => {
    if (step === 3 && generatedPlan && !unitDivisionPlan && !dividingUnits) {
      generateUnitDivision(generatedPlan, formData);
    }
  }, [step, generatedPlan, unitDivisionPlan, dividingUnits]);

  useEffect(() => {
    if (!window.mammoth) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      document.body.appendChild(script);
    }
  }, []);

  // Handle subject selection from popup — fills basic data immediately,
  // then fetches full curriculum detail (standardRef, LO, objectives, competencies, description)
  // in background and merges into formData.
  const handleSubjectSelect = async (subjectData) => {
    const { _needDetail, deptCode, pdfPage, ...rest } = subjectData;
    setFormData((prev) => ({ ...prev, ...rest }));
    setStep(2);

    if (_needDetail && subjectData.courseCode && deptCode) {
      try {
        const pageParam = pdfPage ? `&page=${encodeURIComponent(pdfPage)}` : '';
        const url = `https://ai-findsubject.onrender.com/api/subject-detail?code=${encodeURIComponent(subjectData.courseCode)}&dept=${encodeURIComponent(deptCode)}${pageParam}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const detail = await res.json();
        if (!detail?.success) return;
        setFormData((prev) => ({
          ...prev,
          standardRef: detail.standardRef || prev.standardRef || '-',
          learningOutcomes: detail.learningOutcomes || prev.learningOutcomes || '',
          objectives: detail.objectives || prev.objectives || '',
          competencies: detail.competencies || prev.competencies || '',
          description: detail.description || prev.description || '',
        }));
      } catch (err) {
        console.warn('Subject detail fetch error:', err);
      }
    }
  };

  // --- File Handlers ---
  const handleCourseUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isWord = file.name.endsWith('.doc') || file.name.endsWith('.docx');
    if (!isImage && !isPdf && !isWord) {
      onError('กรุณาอัปโหลดไฟล์ รูปภาพ, PDF หรือ Word เท่านั้น');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setCourseFile({ type: isImage ? 'image' : isPdf ? 'pdf' : 'word', data: reader.result, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleStandardUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStandardFileName(file.name);
    if (file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
      setStandardContent(`(ไฟล์ Word แนบ: ${file.name})`);
      if (!formData.standardRef) setFormData((p) => ({ ...p, standardRef: 'อ้างอิงไฟล์แนบ: ' + file.name }));
      return;
    }
    try {
      const result = await callApi(
        [{ text: SYSTEM_PROMPT_STANDARD_OCR }, { inlineData: { mimeType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg', data: (await readAsBase64(file)) } }],
        { statusText: 'กำลังอ่านข้อมูลจากไฟล์มาตรฐานอาชีพ...' }
      );
      if (result) {
        setStandardContent(result);
        if (!formData.standardRef) setFormData((p) => ({ ...p, standardRef: 'อ้างอิงไฟล์แนบ: ' + file.name }));
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์มาตรฐาน');
    }
  };

  const readAsBase64 = (file) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });

  // --- Paste text extraction ---
  const callPasteExtraction = async () => {
    if (!coursePastedText.trim()) { onError('กรุณาวางข้อความหลักสูตรรายวิชาก่อนค่ะ'); return; }
    try {
      const extractPrompt = SYSTEM_PROMPT_EXTRACTION + '\n\n--- ข้อมูลหลักสูตรรายวิชา (ข้อความ) ---\n' + coursePastedText.trim();
      const data = await callApi(
        [{ text: extractPrompt }],
        { json: true, statusText: 'กำลังอ่านข้อมูลจากข้อความที่วาง...' }
      );
      if (data?.isValidCurriculum === false) {
        onError('ดูเหมือนข้อความจะไม่ใช่หลักสูตรรายวิชา กรุณาตรวจสอบอีกครั้ง');
        return;
      }
      if (data) {
        const formatList = (str) => {
          if (!str) return '';
          return str.replace(/\n{2,}/g, '\n').replace(/\n?\s*(\d+\.)/g, '\n$1').trim();
        };
        data.objectives = formatList(data.objectives);
        data.competencies = formatList(data.competencies);
        setFormData((p) => ({ ...p, ...data }));
        setStep(2);
      } else {
        throw new Error('Failed to parse');
      }
    } catch (err) {
      console.error('Paste Extraction Error:', err);
      onError(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถอ่านข้อความได้'}`);
    }
  };

  // --- OCR Extraction ---
  const callExtraction = async () => {
    if (!courseFile) { onError('กรุณาแนบไฟล์หลักสูตรรายวิชา ด้วยค่ะ'); return; }
    if (courseFile.type === 'word') {
      alert('ระบบยังไม่รองรับการดึงข้อมูลอัตโนมัติจากไฟล์ Word\nกรุณากรอกข้อมูลรายวิชาด้วยตนเองในขั้นตอนถัดไป');
      setStep(2);
      return;
    }
    try {
      const base64Data = courseFile.data.split(',')[1];
      const mimeType = courseFile.type === 'pdf' ? 'application/pdf' : 'image/jpeg';
      const data = await callApi(
        [{ text: SYSTEM_PROMPT_EXTRACTION }, { inlineData: { mimeType, data: base64Data } }],
        { json: true, statusText: 'กำลังอ่านข้อมูลจากหลักสูตร (OCR)...' }
      );
      if (data?.isValidCurriculum === false) {
        onError('ดูเหมือนเอกสารจะไม่ใช่หลักสูตรรายวิชา กรุณาตรวจสอบไฟล์อีกครั้ง');
        return;
      }
      if (data) {
        const formatList = (str) => {
          if (!str) return '';
          // แยกแต่ละข้อด้วยเลข แล้วรวมกลับโดยไม่มีบรรทัดว่างคั่น
          return str
            .replace(/\n{2,}/g, '\n')           // ลบบรรทัดว่างซ้ำ
            .replace(/\n?\s*(\d+\.)/g, '\n$1')   // ขึ้นบรรทัดใหม่ก่อนเลขข้อ (ไม่เว้นบรรทัด)
            .trim();
        };
        data.objectives = formatList(data.objectives);
        data.competencies = formatList(data.competencies);
        setFormData((p) => ({ ...p, ...data }));
        setStep(2);
      } else {
        throw new Error('Failed to parse');
      }
    } catch (err) {
      console.error('Extraction Error:', err);
      onError(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถอ่านไฟล์ได้'}`);
    }
  };

  // --- Generation ---
  const [unitMode, setUnitMode] = useState('auto');
  const [cachedAutoUnits, setCachedAutoUnits] = useState(null);
  const [unitEditTrigger, setUnitEditTrigger] = useState(0); // Cache first AI-generated units

  // Parse analysis table rows from markdown
  const parseAnalysisRows = (markdown) => {
    if (!markdown) return [];
    const clean = markdown.replace(/```markdown/g, '').replace(/```/g, '').trim();
    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    const sepIdx = lines.findIndex(l => l.startsWith('|') && l.includes('---'));
    if (sepIdx === -1) return [];
    return lines.slice(sepIdx + 1).filter(l => l.startsWith('|')).map(line => {
      const cells = line.split('|').filter((c, i, arr) => i !== 0 && i !== arr.length - 1).map(c => c.trim());
      return { duty: cells[0] || '', task: cells[1] || '', subComp: cells[2] || '', knowledge: cells[3] || '', skills: cells[4] || '' };
    });
  };

  // Build unit table from duty or task mode (no API call)
  const buildUnitsFromAnalysis = (mode) => {
    const rows = parseAnalysisRows(generatedPlan);
    if (rows.length === 0) return null;
    const weeks = getWeeksFromCode(formData.courseCode);
    const { theory, practice } = getTheoryPractice(formData.ratio);
    const hrsPerWeek = theory + practice;

    let units = [];

    if (mode === 'duty') {
      // Each duty = 1 unit, tasks become topics
      rows.forEach(r => {
        const dutyName = r.duty.replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^\d+\.\s*/, '').trim();
        if (!dutyName) return;
        const existing = units.find(u => u.rawDuty === dutyName);
        if (existing) {
          if (r.task) existing.topics.push(r.task.replace(/<br>/g, '\n'));
        } else {
          units.push({ rawDuty: dutyName, name: dutyName, topics: r.task ? [r.task.replace(/<br>/g, '\n')] : [] });
        }
      });
    } else {
      // task mode: each task line = 1 unit (or group small ones)
      rows.forEach(r => {
        const tasks = r.task.split(/<br\s*\/?>/i).map(t => t.replace(/^\d+\.\d*\s*/, '').trim()).filter(Boolean);
        tasks.forEach(t => {
          units.push({ name: t, topics: [t] });
        });
      });
    }

    if (units.length === 0) return null;

    // Distribute weeks by content type and weight
    const n = units.length;
    // ตรวจจับหน่วยที่เป็นวางแผน/เตรียมการ/ประเมิน/สรุป → จำกัดไว้ที่ 1 สัปดาห์
    const planKeywords = /วางแผน|เตรียม|แนะนำ|ปฐมนิเทศ|พื้นฐาน|เบื้องต้น|ความรู้ทั่วไป/;
    const evalKeywords = /ประเมิน|นำเสนอ|สรุป|ทบทวน|สอบ/;

    const isLightUnit = (u) => planKeywords.test(u.name) || evalKeywords.test(u.name);

    const weights = units.map((u) => {
      if (isLightUnit(u)) return 1; // หน่วยวางแผน/ประเมิน = น้ำหนักต่ำสุด
      // นับจำนวนหัวข้อ/เนื้อหาในแต่ละหน่วย
      const topicCount = u.topics.reduce((sum, t) => {
        const lines = t.split(/(<br\s*\/?>|\n)/).filter(l => l.trim() && !l.match(/^<br/));
        return sum + Math.max(lines.length, 1);
      }, 0);
      return Math.max(topicCount, 2); // หน่วยปฏิบัติงาน = น้ำหนักสูงกว่า
    });
    const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;

    // กำหนดสัปดาห์: หน่วยวางแผน/ประเมิน = 1, หน่วยปฏิบัติ = ตามน้ำหนัก
    const weekArr = units.map((u, i) => {
      if (isLightUnit(u)) return 1;
      return Math.max(1, Math.min(3, Math.round((weights[i] / totalWeight) * weeks)));
    });

    // ปรับให้รวมเท่ากับ weeks พอดี (เพิ่ม/ลดเฉพาะหน่วยปฏิบัติงาน)
    let sum = weekArr.reduce((s, v) => s + v, 0);
    const practiceUnits = weights.map((w, i) => ({ i, w })).filter(({ i }) => !isLightUnit(units[i])).sort((a, b) => b.w - a.w);
    const practiceUnitsAsc = [...practiceUnits].reverse();

    while (sum > weeks) {
      let reduced = false;
      for (const { i } of practiceUnitsAsc) {
        if (weekArr[i] > 1 && sum > weeks) { weekArr[i]--; sum--; reduced = true; }
      }
      if (!reduced) break;
    }
    while (sum < weeks) {
      let added = false;
      for (const { i } of practiceUnits) {
        if (weekArr[i] < 3 && sum < weeks) { weekArr[i]++; sum++; added = true; }
      }
      if (!added) {
        // ถ้าทุกหน่วยปฏิบัติครบ 3 แล้ว → ให้เกิน 3 ได้
        for (const { i } of practiceUnits) {
          if (sum < weeks) { weekArr[i]++; sum++; }
        }
      }
    }

    const header = '| หน่วยที่ | ชื่อหน่วยการเรียนรู้ | หัวข้อเรื่อง (Topics) | ทฤษฎี (ชม.) | ปฏิบัติ (ชม.) | รวม (ชม.) |';
    const sep = '| --- | --- | --- | --- | --- | --- |';
    const dataRows = units.map((u, i) => {
      const w = weekArr[i];
      const t = theory * w;
      const p = practice * w;
      const topicsStr = u.topics.join('<br>');
      return `| หน่วยที่ ${i + 1} | ${u.name} | ${topicsStr} | ${t} | ${p} | ${t + p} |`;
    }).join('\n');

    return `${header}\n${sep}\n${dataRows}`;
  };

  const generateUnitDivision = async (planText, fd, mode = 'auto', forceNew = false) => {
    // Use cached result if available (unless forceNew)
    if (!forceNew && cachedAutoUnits) {
      setUnitDivisionPlan(cachedAutoUnits);
      return;
    }

    // Always call AI: นำ Duty มาเป็นหน่วย + คิดเพิ่มได้
    setDividingUnits(true);
    try {
      const weeks = getWeeksFromCode(fd.courseCode);
      const { theory, practice } = getTheoryPractice(fd.ratio);
      const prompt = buildUnitDivisionPrompt(planText, weeks, theory, practice, fd.description);
      // 🆕 ขอ JSON — convert เป็น markdown เก็บใน state (backward compat)
      const aiResponse = await callApi([{ text: prompt }], {
        json: true,
        moduleName: 'unitDivision',
        statusText: 'กำลังแบ่งหน่วยการเรียนรู้...',
      });

      const { markdown, source } = parseUnitDivisionResponse(aiResponse);
      console.log(`[UnitDivision] response parsed as: ${source}`);

      if (markdown) {
        setUnitDivisionPlan(markdown);
        setCachedAutoUnits(markdown);
      }
    } catch (err) {
      console.error('UnitDivision Error:', err);
    } finally {
      setDividingUnits(false);
    }
  };

  const callGeneration = async () => {
    if (hasStandard && !standardContent && !standardPastedText.trim()) {
      alert('ท่านเลือก \'มีมาตรฐานอาชีพ\' กรุณาแนบไฟล์ หรือ วางข้อมูลมาตรฐานก่อน');
      return;
    }
    if (onRegenerate) onRegenerate();
    setGeneratedPlan(null);
    setUnitDivisionPlan(null);
    try {
      // Combine file-extracted content + pasted text
      const combinedStandard = [standardContent, standardPastedText.trim()].filter(Boolean).join('\n\n---\n\n');
      const prompt = buildAnalysisPrompt(formData, hasStandard ? combinedStandard : '');
      // 🆕 ขอ JSON (เป๊ะกว่า) — convert เป็น markdown ก่อนเก็บ state เพื่อ backward compat
      const aiResponse = await callApi([{ text: prompt }], {
        json: true,
        moduleName: 'analysis',
        statusText: hasStandard
          ? "กำลังวิเคราะห์ 'ผลลัพธ์การเรียนรู้' ร่วมกับ 'มาตรฐานอาชีพ'..."
          : 'กำลังวิเคราะห์ Job-Duty-Task และสร้างแผนการสอน...',
      });

      const { markdown, source } = parseAnalysisResponse(aiResponse);
      console.log(`[Analysis] response parsed as: ${source}`);

      if (markdown) {
        setGeneratedPlan(markdown);
        setStep(3);
        generateUnitDivision(markdown, formData);
      } else {
        throw new Error('AI ตอบในรูปแบบที่ไม่ถูกต้อง');
      }
    } catch (err) {
      console.error('Plan Error:', err);
      onError(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถสร้างแผนได้'} — ลองกดสร้างใหม่อีกครั้ง`);
    }
  };

  // --- Export หลักสูตรรายวิชา (Curriculum DOCX) ---
  const _doExportCurriculumWord = async () => {
    const fd = formData;
    const { theory, practice } = getTheoryPractice(fd.ratio);

    try {
      const { generateDocxFromTemplate } = await import('../../utils/docxTemplateExport');

      // Auto-detect program level from first digit of course code
      const cc = (fd.courseCode || '').trim();
      const firstDigit = cc.replace(/\D/g, '')[0];
      const programLevel = firstDigit === '2'
        ? 'หลักสูตรประกาศนียบัตรวิชาชีพ (ปวช.)'
        : firstDigit === '3'
        ? 'หลักสูตรประกาศนียบัตรวิชาชีพชั้นสูง (ปวส.)'
        : '';

      await generateDocxFromTemplate({
        programLevel,
        vocationType: fd.vocationType || '',
        occupationGroup: fd.occupationGroup || '',
        department: fd.department || '',
        courseCode: fd.courseCode || '',
        courseName: fd.courseName || '',
        theoryHours: String(theory),
        practiceHours: String(practice),
        credits: fd.credits || '',
        // Singular versions (for backward compat / non-loop placeholders)
        standardRef: fd.standardRef || '-',
        learningOutcomes: fd.learningOutcomes || '',
        objectives: fd.objectives || '',
        competencies: fd.competencies || '',
        description: fd.description || '',
        // 🔑 Loop arrays — Template ใช้ {#xxxList}{.}{/xxxList} ต้องส่ง array
        standardRefList:      (fd.standardRef       || '-').split('\n').map((s) => s.trim()).filter(Boolean),
        learningOutcomesList: (fd.learningOutcomes  || '').split('\n').map((s) => s.trim()).filter(Boolean),
        objectivesList:       (fd.objectives        || '').split('\n').map((s) => s.trim()).filter(Boolean),
        competenciesList:     (fd.competencies      || '').split('\n').map((s) => s.trim()).filter(Boolean),
        // Unit-level placeholders (empty for curriculum-only export)
        unitName: '', unitNo: '', unitTheory: '', unitPractice: '', unitTopics: '',
        outcome: '', comp1: '', comp2: '',
        obj41: '', obj42: '', obj43: '', obj44: '', concept: '',
      }, `หลักสูตรรายวิชา_${fd.courseCode || 'export'}`);
    } catch (err) {
      console.error('Curriculum docx export error:', err);
      onError(`เกิดข้อผิดพลาดในการสร้างไฟล์: ${err.message}`);
    }
  };
  const handleExportCurriculum = () => triggerDownload(_doExportCurriculumWord, { module: 'หลักสูตรรายวิชา', courseCode: formData.courseCode || '', courseName: formData.courseName || '' });

  // ── Export ข้อมูลรายวิชา ────────────────────────────────────────────
  const _doExportCourseInfo = async () => {
    try {
      const { generateCoverDocx } = await import('../../utils/docxTemplateExport');
      const { getStoredUserInfo } = await import('../modals/UserInfoModal');
      const userInfo = getStoredUserInfo() || {};
      // ส่ง unitDivisionPlan ไปด้วย — ใช้สำหรับสร้างรายชื่อหน่วยใน คำนำ
      await generateCoverDocx({ formData, userInfo, unitDivisionPlan });
    } catch (err) {
      console.error('Course info docx export error:', err);
      onError(`สร้างเอกสารข้อมูลรายวิชาไม่สำเร็จ: ${err.message}`);
    }
  };
  const handleExportCourseInfo = () => triggerDownload(_doExportCourseInfo, { module: 'ข้อมูลรายวิชา', courseCode: formData.courseCode || '', courseName: formData.courseName || '' });

  // --- Export ---
  const _doExportWord = async () => {
    if (!generatedPlan) return;
    try {
      const { generateJobAnalysisDocx } = await import('../../utils/docxTemplateExport');
      await generateJobAnalysisDocx({
        learningOutcomes: formData.learningOutcomes || '',
        generatedPlan,
        courseCode: formData.courseCode || '',
      });
    } catch (err) {
      console.error('Job Analysis docx export error:', err);
      // Fallback to HTML export
      createWordDoc(`Job_Analysis_${formData.courseCode}`, convertMarkdownTableToHTML(generatedPlan));
    }
  };
  const _doSavePdf = () => {
    if (!generatedPlan) return;
    printToPdf(`ตารางวิเคราะห์หน่วยการเรียนรู้ (Job Analysis): ${formData.courseName}`, convertMarkdownTableToHTML(generatedPlan));
  };
  const _doExportUnitsWord = async () => {
    if (!unitDivisionPlan) return;
    try {
      const { generateUnitTableDocx } = await import('../../utils/docxTemplateExport');
      await generateUnitTableDocx({
        formData,
        unitDivisionPlan,
        hasEvalRow: hasEvalRow,
      });
    } catch (err) {
      console.error('Unit table docx export error:', err);
      // Fallback
      const parsed = parseUnitTable(unitDivisionPlan);
      const { rowsHtml, totalTheory, totalPractice, totalAll } = convertUnitTableToHTML(parsed);
      const { theory, practice } = getTheoryPractice(formData.ratio);
      createWordDoc(`ตารางหน่วยการเรียนรู้_${formData.courseCode}`, buildUnitExportHtml(rowsHtml, totalTheory, totalPractice, totalAll, hasEvalRow, theory, practice));
    }
  };
  const _doExportUnitsPdf = () => {
    if (!unitDivisionPlan) return;
    const parsed = parseUnitTable(unitDivisionPlan);
    const { rowsHtml, totalTheory, totalPractice, totalAll } = convertUnitTableToHTML(parsed);
    const { theory, practice } = getTheoryPractice(formData.ratio);
    printToPdf(`ตารางหน่วยการเรียนรู้ ${formData.courseCode}`, buildUnitExportHtml(rowsHtml, totalTheory, totalPractice, totalAll, hasEvalRow, theory, practice));
  };

  // Wrap all downloads with user info check
  const dl = triggerDownload || ((fn) => fn());
  const _meta = { module: 'วิเคราะห์งาน', courseCode: formData.courseCode || '', courseName: formData.courseName || '' };
  const handleExportWord = () => dl(_doExportWord, _meta);
  const handleSavePdf = () => dl(_doSavePdf, _meta);
  const handleExportUnitsWord = () => dl(_doExportUnitsWord, _meta);
  const handleExportUnitsPdf = () => dl(_doExportUnitsPdf, _meta);

  const buildUnitExportHtml = (rowsHtml, totalTheory, totalPractice, totalAll, showEval = false, evalT = 0, evalP = 0) => {
    const evalRow = showEval ? `
        <tr style="background-color:#fff8e1; font-weight:bold;">
          <td colspan="2" style="text-align:left;">ประเมินผลลัพธ์การเรียนรู้ (1 สัปดาห์)</td>
          <td class="text-center">${evalT}</td><td class="text-center">${evalP}</td><td class="text-center">${evalT + evalP}</td>
        </tr>` : '';
    const grandT = totalTheory + (showEval ? evalT : 0);
    const grandP = totalPractice + (showEval ? evalP : 0);
    const grandAll = totalAll + (showEval ? evalT + evalP : 0);
    return `
    <table>
      <thead><tr><th width="10%">หน่วยที่</th><th width="50%">ชื่อหน่วยการเรียนรู้</th><th width="10%" class="text-center">ทฤษฎี</th><th width="10%" class="text-center">ปฏิบัติ</th><th width="10%" class="text-center">รวม</th></tr></thead>
      <tbody>${rowsHtml}${evalRow}
        <tr style="background-color:#f9f9f9; font-weight:bold;">
          <td colspan="2" style="text-align:right;">รวมทั้งสิ้น</td>
          <td class="text-center">${grandT}</td><td class="text-center">${grandP}</td><td class="text-center">${grandAll}</td>
        </tr>
      </tbody>
    </table>`;
  };

  // --- Sub-renders ---
  const levelInfo = getCourseLevel(formData.courseCode);
  const weeklyHours = getWeeklyHours(formData.ratio);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-lg font-medium text-gray-700 animate-pulse">{loadingText}</p>
      </div>
    );
  }

  // Step 1: Upload
  if (step === 1) {
    return (
      <div className="space-y-4">
        {/* Subject Search Button */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2.5 rounded-lg">
                <Search className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-blue-900">ค้นหารายวิชา ปวช./ปวส.</p>
                <p className="text-xs text-blue-600">ค้นหารายวิชาทุกหมวด ดูหลักสูตร PDF ต้นฉบับ และเลือกรายวิชาที่ต้องการ</p>
              </div>
            </div>
            <button
              onClick={() => setShowSubjectSearch(true)}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition shadow-md flex items-center gap-2 whitespace-nowrap"
            >
              <Search size={18} /> ค้นหารายวิชา
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-300"></div>
          <span className="text-sm text-gray-400 font-medium">หรือ</span>
          <div className="flex-1 border-t border-gray-300"></div>
        </div>

        {/* File Upload Area */}
        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer relative">
          <input type="file" accept="image/*,application/pdf,.doc,.docx" onChange={handleCourseUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          {courseFile ? (
            <div className="text-center">
              {courseFile.type === 'image' ? (
                <img src={courseFile.data} alt="Preview" className="max-h-64 rounded-lg shadow-md mb-4 mx-auto" />
              ) : (
                <div className="flex flex-col items-center justify-center mb-6 py-8">
                  <div className={`${courseFile.type === 'pdf' ? 'bg-red-100' : 'bg-blue-100'} p-6 rounded-full mb-3`}>
                    {courseFile.type === 'pdf' ? <FileText className="w-16 h-16 text-red-600" /> : <FileType className="w-16 h-16 text-blue-600" />}
                  </div>
                  <p className="text-xl font-bold text-gray-700">{courseFile.name}</p>
                  <p className="text-sm text-gray-500 mt-1 uppercase">{courseFile.type} FILE</p>
                </div>
              )}
              <p className="text-blue-700 font-semibold">เลือกไฟล์แล้ว (คลิกเพื่อเปลี่ยน)</p>
            </div>
          ) : (
            <div className="text-center">
              <Upload className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-blue-800">อัปโหลดหลักสูตรรายวิชา (Word, PDF, รูปภาพ)</h3>
              <p className="text-sm text-blue-600 mt-2">คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่</p>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); if (!courseFile) { onError('กรุณาแนบไฟล์หลักสูตรรายวิชา ด้วยค่ะ'); return; } callExtraction(); }}
            disabled={loading}
            className={`mt-6 px-6 py-2 rounded-full font-medium shadow-lg flex items-center gap-2 z-10 transition ${!courseFile ? 'bg-gray-400 text-white' : courseFile.type === 'word' ? 'bg-gray-600 text-white hover:bg-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            {loading ? <Loader2 className="animate-spin" /> : <FileText />}
            {courseFile?.type === 'word' ? 'ไปยังหน้ากรอกข้อมูล (Word)' : 'ดึงข้อมูลรายวิชาอัตโนมัติ'}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-300"></div>
          <span className="text-sm text-gray-400 font-medium">หรือ วางข้อความ</span>
          <div className="flex-1 border-t border-gray-300"></div>
        </div>

        {/* Paste Text Area */}
        <div className="bg-emerald-50 border-2 border-dashed border-emerald-300 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <PenTool className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-emerald-800">วางข้อความหลักสูตรรายวิชา</h3>
              <p className="text-xs text-emerald-600">คัดลอกข้อความจาก PDF หลักสูตร แล้ววางที่นี่</p>
            </div>
          </div>
          <textarea
            rows={6}
            value={coursePastedText}
            onChange={(e) => setCoursePastedText(e.target.value)}
            placeholder={"วางข้อความหลักสูตรรายวิชาที่นี่...\n\nตัวอย่าง:\nรหัสวิชา 20104-2010 ชื่อวิชา งานไฟฟ้าและอิเล็กทรอนิกส์\nท-ป-น 1-3-2\nจุดประสงค์รายวิชา\n1. เข้าใจหลักการทำงานของวงจรไฟฟ้า...\nสมรรถนะรายวิชา\n1. แสดงความรู้เกี่ยวกับ...\nคำอธิบายรายวิชา\nศึกษาและปฏิบัติเกี่ยวกับ..."}
            className="w-full p-3 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm leading-relaxed font-sans resize-y bg-white"
          />
          {coursePastedText.trim() && (
            <p className="text-xs text-emerald-600 flex items-center gap-1"><Check size={12} /> มีข้อความ ({coursePastedText.trim().split('\n').length} บรรทัด)</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={callPasteExtraction}
              disabled={loading || !coursePastedText.trim()}
              className={`flex-1 px-5 py-2.5 rounded-lg font-medium shadow-md flex items-center justify-center gap-2 transition ${
                coursePastedText.trim() ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              ดึงข้อมูลจากข้อความอัตโนมัติ
            </button>
            <button
              onClick={() => setStep(2)}
              className="px-5 py-2.5 rounded-lg font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition flex items-center gap-2"
            >
              <ArrowRight size={18} /> ไปกรอกเอง
            </button>
          </div>
        </div>

        {/* Subject Search Popup */}
        <SubjectSearchPopup
          isOpen={showSubjectSearch}
          onClose={() => setShowSubjectSearch(false)}
          onSelect={handleSubjectSelect}
        />
      </div>
    );
  }

  // Step 2: Review form
  if (step === 2) {
    return (
      <div className="space-y-6">
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-sm text-yellow-800 flex items-start gap-3">
          <PenTool className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div><p className="font-bold">กรอกข้อมูลรายวิชา</p><p>กรุณาเปิดหลักสูตร PDF ต้นฉบับจากลิงก์ด้านล่าง แล้วคัดลอกข้อมูลมาวางในช่องที่เกี่ยวข้อง</p></div>
        </div>

        {/* Subject Search for Step 2 */}
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 flex items-center gap-3">
          <div className="bg-blue-100 p-2.5 rounded-full flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-blue-900">ค้นหาข้อมูลรายวิชาจากหลักสูตร PDF ต้นฉบับ</p>
            <p className="text-xs text-blue-600">ค้นหารายวิชา ดูรายละเอียด และเลือกเพื่อนำข้อมูลมาวางในฟอร์ม</p>
          </div>
          <button
            onClick={() => setShowSubjectSearch(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-sm text-sm font-medium whitespace-nowrap flex-shrink-0"
          >
            <Search size={15} /> ค้นหารายวิชา
          </button>
        </div>

        {/* Subject Search Popup for Step 2 */}
        <SubjectSearchPopup
          isOpen={showSubjectSearch}
          onClose={() => setShowSubjectSearch(false)}
          onSelect={handleSubjectSelect}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[['courseCode', 'รหัสวิชา'], ['courseName', 'ชื่อวิชา'], ['credits', 'หน่วยกิต'], ['ratio', 'ท-ป-น']].map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type="text" value={formData[key]} onChange={(e) => setFormData({ ...formData, [key]: e.target.value })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 font-mono" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2"><Info className="text-blue-500 w-4 h-4" /><span className="text-xs text-gray-500">ระดับ: {levelInfo.text}</span></div>
          <div className="flex items-center gap-2"><Info className="text-blue-500 w-4 h-4" /><span className="text-xs text-gray-500">เวลาเรียน: {weeklyHours > 0 ? `${weeklyHours} ชม./สัปดาห์` : '-'}</span></div>
        </div>

        {/* Standard Reference */}
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">อ้างอิงมาตรฐาน (Standard Reference)</label>
          <div className="flex gap-2">
            <input type="text" value={formData.standardRef} onChange={(e) => setFormData({ ...formData, standardRef: e.target.value })} placeholder="ไม่มี (ระบุถ้ามี)" className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" />
            <button onClick={onOpenStandardSearch} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 whitespace-nowrap shadow-sm text-sm font-medium">
              <Search size={16} /> ค้นหามาตรฐานอาชีพ
            </button>
          </div>
        </div>

        {/* Standard Toggle */}
        <div className="bg-blue-50 p-5 rounded-xl border border-blue-200">
          <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2"><Sparkles className="w-5 h-5 text-blue-600" /> วิชาของท่านมีการอ้างอิงมาตรฐานอาชีพหรือไม่?</h3>
          <div className="flex gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={!hasStandard} onChange={() => setHasStandard(false)} className="w-4 h-4 text-blue-600" /><span className="text-gray-700">ไม่มี</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={hasStandard} onChange={() => setHasStandard(true)} className="w-4 h-4 text-blue-600" /><span className="text-gray-700 font-medium">มี (ต้องการแนบไฟล์มาตรฐาน)</span></label>
          </div>
          {hasStandard && (
            <div className="bg-white p-4 rounded-lg border border-blue-200 shadow-sm space-y-4">
              {/* วางข้อมูลมาตรฐานอาชีพ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">📋 วางข้อมูลมาตรฐานอาชีพ (UoC / EoC / PC)</label>
                <textarea
                  rows={5}
                  value={standardPastedText}
                  onChange={(e) => setStandardPastedText(e.target.value)}
                  placeholder={"คัดลอกข้อมูลจากเว็บ TPQI หรือเอกสารมาตรฐานอาชีพมาวางที่นี่...\n\nตัวอย่าง:\nUoC: 12345 ติดตั้งระบบไฟฟ้า\nEoC: 12345.01 ติดตั้งท่อร้อยสาย\nPC: ติดตั้งท่อร้อยสายได้ถูกต้องตามมาตรฐาน"}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm leading-relaxed font-sans resize-y"
                />
                {standardPastedText.trim() && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><Check size={12} /> มีข้อมูลที่วาง ({standardPastedText.trim().split('\n').length} บรรทัด)</p>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200"></div>
                <span className="text-xs text-gray-400 font-medium">หรือ แนบไฟล์</span>
                <div className="flex-1 border-t border-gray-200"></div>
              </div>

              {/* แนบไฟล์มาตรฐาน */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">📎 แนบไฟล์มาตรฐานอาชีพ (PDF, Word, หรือ รูปภาพ)</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition">
                    <Paperclip size={18} /> {standardFileName || 'คลิกเพื่อเลือกไฟล์...'}
                    <input type="file" accept="image/*,application/pdf,.doc,.docx" onChange={handleStandardUpload} className="hidden" />
                  </label>
                  {standardContent && <Check className="text-green-500 w-6 h-6" />}
                </div>
              </div>

              <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">💡 <b>คำแนะนำ:</b> สามารถวางข้อมูล + แนบไฟล์ได้พร้อมกัน ระบบจะนำข้อมูลทั้งหมดไปวิเคราะห์ร่วมกับผลลัพธ์การเรียนรู้</p>
            </div>
          )}
        </div>

        {/* Textareas */}
        {[
          ['learningOutcomes', 'ผลลัพธ์การเรียนรู้ระดับรายวิชา', 4],
          ['objectives', 'จุดประสงค์รายวิชา', 4],
          ['competencies', 'สมรรถนะรายวิชา', 4],
          ['description', 'คำอธิบายรายวิชา', 3],
        ].map(([key, label, rows]) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <textarea rows={rows} value={formData[key]} onChange={(e) => setFormData({ ...formData, [key]: e.target.value })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 font-sans leading-relaxed" />
          </div>
        ))}

        {/* ── ข้อมูลรายวิชา (ประเภท/สาขา) ─────────────────────────── */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
            <BookOpen size={16} /> ข้อมูลรายวิชา
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">หมวดวิชา</label>
            <div className="flex gap-3">
              {[
                { val: 'vocational', label: 'หมวดวิชาชีพ' },
                { val: 'core', label: 'หมวดสมรรถนะแกนกลาง' },
              ].map((opt) => (
                <label key={opt.val} className={`flex-1 cursor-pointer p-2.5 rounded-lg border-2 text-center text-sm font-medium transition ${
                  formData.courseCategory === opt.val
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="courseCategory"
                    value={opt.val}
                    checked={formData.courseCategory === opt.val}
                    onChange={(e) => setFormData({ ...formData, courseCategory: e.target.value })}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Vocational fields: ประเภทวิชา → กลุ่มอาชีพ → สาขาวิชา (3-level cascading) */}
          {formData.courseCategory === 'vocational' && (() => {
            // Auto-detect ระดับ จาก courseCode (2xxxx = ปวช., 3xxxx = ปวส.)
            const cc = (formData.courseCode || '').trim();
            const firstDigit = cc.replace(/\D/g, '')[0];
            const levelKey = firstDigit === '3' ? 'pvs' : 'pvch';
            const vocationList = vecCurriculum[levelKey] || [];
            const selectedVoc = vocationList.find((v) => v.name === formData.vocationType);
            const occupationList = selectedVoc?.occupationGroups || [];
            const selectedOcc = occupationList.find((o) => o.name === formData.occupationGroup);
            const deptList = selectedOcc?.departments || [];
            return (
              <div className="space-y-3 pt-2 border-t border-gray-200">
                <div className="text-[11px] text-gray-500 italic">
                  อ้างอิงหลักสูตร {levelKey === 'pvs' ? 'ปวส.' : 'ปวช.'} 2567
                </div>

                {/* 1) ประเภทวิชา */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">ประเภทวิชา</label>
                  <select
                    value={formData.vocationType || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      vocationType: e.target.value,
                      // Reset เมื่อเปลี่ยน parent
                      occupationGroup: '',
                      department: '',
                    })}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- เลือกประเภทวิชา --</option>
                    {vocationList.map((v) => (
                      <option key={v.name} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2) กลุ่มอาชีพ (cascade จาก ประเภทวิชา) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    กลุ่มอาชีพ
                    {!formData.vocationType && <span className="text-gray-400 font-normal ml-1">(กรุณาเลือกประเภทวิชาก่อน)</span>}
                  </label>
                  <select
                    value={formData.occupationGroup || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      occupationGroup: e.target.value,
                      // Reset สาขาวิชา เมื่อเปลี่ยน กลุ่มอาชีพ
                      department: '',
                    })}
                    disabled={!formData.vocationType}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">-- เลือกกลุ่มอาชีพ --</option>
                    {occupationList.map((o) => (
                      <option key={o.name} value={o.name}>{o.name}</option>
                    ))}
                  </select>
                </div>

                {/* 3) สาขาวิชา (cascade จาก กลุ่มอาชีพ) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    สาขาวิชา
                    {!formData.occupationGroup && <span className="text-gray-400 font-normal ml-1">(กรุณาเลือกกลุ่มอาชีพก่อน)</span>}
                  </label>
                  <select
                    value={formData.department || ''}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    disabled={!formData.occupationGroup}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">-- เลือกสาขาวิชา --</option>
                    {deptList.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })()}

          {/* Dropdown สำหรับ "กลุ่มสมรรถนะ" — แสดงเฉพาะเมื่อเลือกหมวดแกนกลาง */}
          {formData.courseCategory === 'core' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">กลุ่มสมรรถนะ</label>
              <select
                value={formData.competencyGroup}
                onChange={(e) => setFormData({ ...formData, competencyGroup: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- เลือกกลุ่มสมรรถนะ --</option>
                <option value="กลุ่มสมรรถนะภาษาและการสื่อสาร">กลุ่มสมรรถนะภาษาและการสื่อสาร</option>
                <option value="กลุ่มสมรรถนะการคิดและการแก้ปัญหา">กลุ่มสมรรถนะการคิดและการแก้ปัญหา</option>
                <option value="กลุ่มสมรรถนะทางสังคมและการดำรงชีวิต">กลุ่มสมรรถนะทางสังคมและการดำรงชีวิต</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-between pt-4 border-t gap-2">
          <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-600 hover:text-gray-800">กลับไปอัปโหลด</button>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleExportCurriculum} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 shadow-sm flex items-center gap-1.5 text-sm">
              <FileText size={16} /> Download หลักสูตรรายวิชา
            </button>
            <button onClick={callGeneration} disabled={loading} className="pnp-action-inline-success px-6 py-2 font-semibold">
              {loading ? <Loader2 className="animate-spin" /> : <BookOpen />} สร้างโครงการสอน (Job-Based)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Results
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-green-50 p-4 rounded-lg border border-green-200 gap-4">
        <div className="flex-1">
          <h3 className="font-bold text-green-800 flex items-center gap-2"><Check className="w-5 h-5" /> สร้างโครงการสอนสำเร็จ!</h3>
          <p className="text-sm text-green-700 ml-7">วิชา: {formData.courseCode} {formData.courseName}</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={handleExportCourseInfo} className="flex items-center gap-1 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition shadow-sm font-medium text-sm"><BookOpen size={16} /> Download ข้อมูลรายวิชา</button>
          <button onClick={handleExportWord} className="flex items-center gap-1 bg-blue-700 text-white px-3 py-2 rounded-lg hover:bg-blue-800 transition shadow-sm font-medium text-sm"><FileText size={16} /> ส่งออกเป็น Word</button>
          <button onClick={handleSavePdf} className="flex items-center gap-1 bg-white border border-blue-600 text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-50 transition shadow-sm font-medium text-sm"><FileDown size={16} /> บันทึก PDF</button>
          <button onClick={() => setStep(2)} className="flex items-center gap-1 bg-gray-100 border border-gray-300 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200 transition shadow-sm text-sm"><RefreshCw size={16} /> เริ่มใหม่</button>
        </div>
      </div>

      <div className="bg-white p-2 md:p-4 rounded-xl shadow-sm border border-gray-200 w-full">
        <div className="mb-3 text-sm text-gray-500 flex items-center gap-2"><TableIcon size={16} /> ตารางวิเคราะห์หน่วยการเรียนรู้ (Analysis Table)</div>
        <MarkdownTableRenderer content={generatedPlan} />
      </div>

      {dividingUnits && (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-blue-100 flex flex-col items-center justify-center animate-pulse">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
          <p className="text-blue-600 font-medium">กำลังคำนวณและแบ่งหน่วยการเรียนรู้ (อัตโนมัติ)...</p>
        </div>
      )}

      {unitDivisionPlan && (
        <div className="bg-blue-50 p-2 md:p-6 rounded-xl shadow-sm border border-blue-200">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div className="text-sm text-blue-800 font-bold flex items-center gap-2"><Sparkles size={16} /> ตารางแบ่งหน่วยการเรียนรู้ (Learning Units)</div>
            <div className="flex items-center gap-2 flex-wrap">
              <ExportButtons
                onExportWord={handleExportUnitsWord}
                onExportPdf={handleExportUnitsPdf}
              />
              <button
                onClick={() => { setUnitDivisionPlan(null); setCachedAutoUnits(null); generateUnitDivision(generatedPlan, formData, 'auto', true); }}
                disabled={dividingUnits}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition border bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100 disabled:opacity-50"
              >
                🔄 สร้างใหม่
              </button>
              <button
                onClick={() => setUnitEditTrigger((p) => p + 1)}
                className="flex items-center gap-1 bg-amber-50 border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition text-xs font-medium"
              >
                ✏️ แก้ไขตาราง
              </button>
            </div>
          </div>
          <EditableUnitTable markdown={unitDivisionPlan} onSave={(newMd) => setUnitDivisionPlan(newMd)} courseCode={formData.courseCode} ratio={formData.ratio} onAssessmentChange={setHasEvalRow} hideEditButton editTrigger={unitEditTrigger} />
          <div className="mt-4 flex items-start gap-2 text-xs text-orange-700 bg-orange-50 p-3 rounded-lg border border-orange-200">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <p><b>คำแนะนำ:</b> กดปุ่ม "แก้ไขตาราง" เพื่อแก้ไขชื่อหน่วย เพิ่ม/ลบหน่วย หรือปรับชั่วโมงได้ตามต้องการ<br />ข้อมูลเป็นเพียงตัวอย่างที่ AI สร้างขึ้น คุณครูสามารถปรับเปลี่ยนได้ตามความเหมาะสม</p>
          </div>
          <div className="mt-6 text-center">
            <button onClick={() => onNavigate('learning_outcomes')} className="pnp-action-inline-success px-8 py-3 mx-auto">
              ไปขั้นตอนต่อไป: ผลลัพธ์การเรียนรู้ประจำหน่วย (Module 2) <ArrowRight size={20} />
            </button>
            <p className="text-xs text-gray-500 mt-2">ระบบจะส่งข้อมูลตารางหน่วยฯ และวิเคราะห์งานไปให้โดยอัตโนมัติ</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisModule;
