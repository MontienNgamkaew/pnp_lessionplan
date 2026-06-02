import React, { useState, useMemo, useRef } from 'react';
import { ClipboardCheck, CheckCircle, Sparkles, Loader2, Check, ChevronLeft, ChevronRight, ArrowRight, FileStack, FileDown, RotateCcw, Upload, Download, ClipboardList, ChevronDown, Pencil, Save, X, HelpCircle, Eye, EyeOff, CheckCircle2, Circle, ListChecks, Zap, Lock } from 'lucide-react';
import FileUploadZone from '../common/FileUploadZone';
import ExportButtons from '../common/ExportButtons';
import { useFileUpload, buildFileParts } from '../../hooks/useFileUpload';
import { useAiApi } from '../../hooks/useAiApi';
import { usePersistedState } from '../../hooks/usePersistedState';
import { SYSTEM_PROMPT_ASSESSMENT, SYSTEM_PROMPT_ASSESSMENT_TOOLS, SYSTEM_PROMPT_QUESTION_BANK, SYSTEM_PROMPT_AFFECTIVE_ASSESSMENT, SYSTEM_PROMPT_JOBSHEET_EVAL } from '../../constants/prompts';
import { printToPdf, createWordDoc } from '../../utils/exportHelpers';
import { generateDocxFromTemplate, buildTemplateData } from '../../utils/docxTemplateExport';
import { parseUnitTable } from '../../utils/markdownTable';
import { ADMIN_PASSWORD, ADMIN_VERIFIED_KEY } from '../../constants/adminAuth';

const UPLOAD_STEPS = [
  { key: 'syllabus', label: 'หลักสูตรรายวิชา', step: 1 },
  { key: 'objectives', label: 'จุดประสงค์เชิงพฤติกรรม', step: 2 },
  { key: 'competencies', label: 'สมรรถนะประจำหน่วย', step: 3 },
  { key: 'evidence', label: 'หลักฐานการเรียนรู้', step: 4 },
  { key: 'activities', label: 'กิจกรรมการเรียนรู้', step: 5 },
];

const AssessmentModule = ({
  providerId, apiKey,
  formData, generatedPlan, unitDivisionPlan,
  loResults, compResults, objResults, conceptResults,
  activitiesResults, mediaResults, evidenceResults,
  questionBankResults, setQuestionBankResults,
  assessmentResults, setAssessmentResults,
  onError, onNavigate, triggerDownload, onImportData, onExportReady,
  onRegenerate,
}) => {
  const dl = triggerDownload || ((fn) => fn());
  const hasInternal = !!(formData.courseCode && objResults && compResults && evidenceResults && activitiesResults);
  const [step, setStep] = usePersistedState('lp_assessmentStep', 1);
  const [selectedUnitIdx, setSelectedUnitIdx] = usePersistedState('lp_assessmentSelectedUnit', 0);
  const importFileRef = useRef(null);

  // ── Assessment Tools Generator (per-unit) ─────────────────────────────────
  const [toolsData, setToolsData] = usePersistedState('lp_assessmentToolsData', []); // array of { _unitIdx, unitName, tools[] }
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsProgress, setToolsProgress] = useState('');
  const [expandedTool, setExpandedTool] = useState(null); // "unitIdx-toolIdx"

  // ── Shared Job Sheet store from MediaModule ───────────────────────────────
  // Read-only here: AssessmentModule needs to know which ใบงาน exist so it can
  // build matching แบบประเมินใบงาน. The same key 'lp_jobSheetStore' is written
  // by MediaModule's usePersistedState, so updates flow both ways via storage.
  const [jobSheetStore] = usePersistedState('lp_jobSheetStore', {});

  // ── Job Sheet Evaluation store (one rubric per ใบงาน) ─────────────────────
  // Shape: { [unitIdx]: [ { jobSheetTitle, items[], maxScore, passingScore, scoringGuide } ] }
  const [jobSheetEvalStore, setJobSheetEvalStore] = usePersistedState('lp_jobSheetEvalStore', {});
  const [jobSheetEvalLoading, setJobSheetEvalLoading] = useState(null); // unitIdx or null

  const isJobSheetType = (n) => /ใบงาน|jobsheet|job\s*sheet/i.test(n || '');

  const generateToolsForUnit = async (unitIdx) => {
    if (!displayAssessment?.length) {
      onError?.('ไม่พบข้อมูลการประเมิน กรุณาสร้างการวัดและประเมินผลก่อน');
      return;
    }
    const unit = displayAssessment[unitIdx];
    if (!unit) return;

    setToolsLoading(true);
    setExpandedTool(null);
    setToolsProgress(`กำลังสร้างเครื่องมือประเมิน: ${unit.unitName}`);

    // ── รวมข้อมูลคลังข้อสอบ (Question Bank) ──
    const qbForUnit = (questionBankResults || []).find((r) => r._unitIdx === unitIdx);
    const qbInfo = qbForUnit && (qbForUnit.objectives || []).length > 0
      ? `\n\n=== คลังข้อสอบ (Question Bank) ที่มีอยู่แล้ว ===
มีแบบทดสอบปรนัย 4 ตัวเลือก จำนวน ${(qbForUnit.objectives || []).reduce((sum, o) => sum + (o.questions || []).length, 0)} ข้อ
จุดประสงค์ที่ครอบคลุม: ${(qbForUnit.objectives || []).map((o) => `${o.objectiveText} (${o.bloomLevel})`).join(', ')}
หมายเหตุ: แบบทดสอบปรนัยสร้างไว้แล้ว ให้สร้างเฉพาะเครื่องมือประเมินอื่นๆ (แบบประเมินผลงาน/แบบสังเกต/รูบริก/แบบตรวจผลงาน ฯลฯ) ห้ามสร้างแบบทดสอบปรนัยซ้ำ`
      : '';

    const contextText = `
หน่วยการเรียนรู้: ${unit.unitName}

เกณฑ์การปฏิบัติงาน:
${(unit.performanceCriteria || []).map((c, j) => `${j + 1}. ${c}`).join('\n') || '(ไม่มีข้อมูล)'}

วิธีการประเมิน:
${(unit.assessmentMethods || []).map((m, j) => `${j + 1}. ${m}`).join('\n') || '(ไม่มีข้อมูล)'}

รายชื่อเครื่องมือประเมินที่ต้องสร้าง (สร้างครบทุกรายการ):
${(unit.assessmentTools || []).map((t, j) => `${j + 1}. ${t}`).join('\n') || '(ไม่มีข้อมูล)'}
${qbInfo}`.trim();

    try {
      const data = await callApi(
        [{ text: SYSTEM_PROMPT_ASSESSMENT_TOOLS }, { text: contextText }],
        { json: true, moduleName: 'assessmentTools', statusText: `กำลังสร้างเครื่องมือประเมิน: ${unit.unitName}...` }
      );

      const result = {
        _unitIdx: unitIdx,
        unitName: unit.unitName,
        tools: data?.tools || [],
        ...(data?.tools ? {} : { error: 'ไม่สามารถสร้างเครื่องมือได้' }),
      };

      // Merge: replace this unit, keep others
      setToolsData((prev) => {
        const existing = (prev || []).filter((r) => r._unitIdx !== unitIdx);
        return [...existing, result].sort((a, b) => a._unitIdx - b._unitIdx);
      });
    } catch (err) {
      console.error(`Tools error unit ${unitIdx + 1}:`, err);
      setToolsData((prev) => {
        const existing = (prev || []).filter((r) => r._unitIdx !== unitIdx);
        return [...existing, { _unitIdx: unitIdx, unitName: unit.unitName, tools: [], error: err.message }].sort((a, b) => a._unitIdx - b._unitIdx);
      });
    } finally {
      setToolsLoading(false);
      setToolsProgress('');
    }
  };

  // ── Job Sheet Evaluation Generator (per-unit) ─────────────────────────────
  // Builds 1 rubric per ใบงาน in MediaModule's jobSheetStore for this unit.
  const generateJobSheetEvalForUnit = async (unitIdx) => {
    const sheets = jobSheetStore?.[unitIdx] || [];
    if (sheets.length === 0) {
      onError?.('ยังไม่มีใบงานในหน่วยนี้ — กรุณาสร้างใบงานใน Module สื่อและแหล่งการเรียนรู้ก่อน');
      return;
    }
    setJobSheetEvalLoading(unitIdx);
    try {
      // Compact each sheet to the parts that drive evaluation rubrics
      // (new 10-section schema from template-jobsheet1.docx)
      const compactSheets = sheets.map((js, i) => ({
        no: i + 1,
        title: js.title || `ใบงานที่ ${i + 1}`,
        lo: js.lo || '',
        competencies: Array.isArray(js.competencies) ? js.competencies : [],
        tools: Array.isArray(js.tools) ? js.tools : [],
        steps: Array.isArray(js.steps) ? js.steps : [],
        summary: js.summary || '',
      }));

      const unit = displayAssessment?.[unitIdx];
      const parts = [
        { text: SYSTEM_PROMPT_JOBSHEET_EVAL },
        { text: `\n\n--- Unit Info ---\nunitName: ${unit?.unitName || ''}\nunitNo: ${unitIdx + 1}` },
        { text: `\n\n--- Course ---\n${JSON.stringify({ courseCode: formData.courseCode, courseName: formData.courseName })}` },
        { text: `\n\n--- Job Sheets to evaluate (${compactSheets.length} ใบ) ---\n` +
                `*** สร้างแบบประเมิน 1 ชุดต่อ 1 ใบงาน ตามลำดับ ใช้ title ตรงตาม input ***\n` +
                JSON.stringify(compactSheets, null, 2) },
      ];

      const data = await callApi(parts, { json: true, moduleName: 'jobSheetEval', statusText: `กำลังสร้างแบบประเมินใบงาน หน่วยที่ ${unitIdx + 1}...` });
      if (!data?.evaluations || !Array.isArray(data.evaluations)) throw new Error('Invalid AI response');

      // Pair evaluations to sheets in order; pad/truncate to sheet count
      const paired = compactSheets.map((cs, i) => {
        const ev = data.evaluations[i] || {};
        return {
          jobSheetTitle: ev.jobSheetTitle || cs.title,
          purpose: ev.purpose || `ประเมิน${cs.title}`,
          items: Array.isArray(ev.items) ? ev.items : [],
          maxScore: ev.maxScore || (Array.isArray(ev.items) ? ev.items.length * 4 : 0),
          passingScore: ev.passingScore || 0,
          scoringGuide: ev.scoringGuide || '',
        };
      });

      setJobSheetEvalStore((prev) => ({ ...prev, [unitIdx]: paired }));
    } catch (err) {
      console.error(`JobSheet Eval error unit ${unitIdx + 1}:`, err);
      onError?.(`สร้างแบบประเมินใบงานไม่สำเร็จ: ${err.message || ''}`);
    } finally {
      setJobSheetEvalLoading(null);
    }
  };

  // ── Tools HTML for export ─────────────────────────────────────────────────
  const buildToolsHtml = (allUnits) => {
    const S = 'font-family:"TH Sarabun New",sans-serif;font-size:15pt;';
    const SB = S + 'font-weight:bold;';
    return allUnits.map((unit, ui) => {
      const toolsSection = (unit.tools || []).map((tool, ti) => {
        const isTest = tool.type?.includes('แบบทดสอบ');
        const headerRow = isTest
          ? '<tr style="background:#1e40af;color:white;"><th>ที่</th><th>รายการ/ข้อสอบ</th><th style="width:15%">คะแนน</th></tr>'
          : '<tr style="background:#1e40af;color:white;"><th style="width:4%">ที่</th><th style="width:30%">รายการประเมิน</th><th style="width:18%">4 (ดีมาก)</th><th style="width:18%">3 (ดี)</th><th style="width:15%">2 (พอใช้)</th><th style="width:15%">1 (ปรับปรุง)</th></tr>';
        const itemRows = (tool.items || []).map(item => isTest
          ? `<tr><td style="text-align:center">${item.no}</td><td>${item.description}</td><td style="text-align:center">${item.score4 || ''}</td></tr>`
          : `<tr><td style="text-align:center">${item.no}</td><td>${item.description}</td><td>${item.score4 || ''}</td><td>${item.score3 || ''}</td><td>${item.score2 || ''}</td><td>${item.score1 || ''}</td></tr>`
        ).join('');
        return `
<p style="${SB}margin-top:16pt;">${ti + 1}. ${tool.name} <span style="${S}font-weight:normal;">(${tool.type})</span></p>
<p style="${S}margin-left:0.5cm;">วัตถุประสงค์: ${tool.purpose || ''}</p>
<table style="width:100%;border-collapse:collapse;font-size:14pt;font-family:'TH Sarabun New',sans-serif;" border="1">
  <thead>${headerRow}</thead>
  <tbody>${itemRows}</tbody>
</table>
<p style="${S}margin-top:4pt;">คะแนนเต็ม ${tool.maxScore || ''} คะแนน &nbsp;|&nbsp; ผ่านเกณฑ์ ${tool.passingScore || ''} คะแนน</p>
<p style="${S}">เกณฑ์การตัดสิน: ${tool.scoringGuide || ''}</p>`;
      }).join('');
      return `<div style="page-break-before:${ui > 0 ? 'always' : 'auto'};">
<p style="${SB}font-size:18pt;text-align:center;">เครื่องมือประเมินผลการเรียนรู้</p>
<p style="${SB}font-size:16pt;text-align:center;">หน่วยที่ ${ui + 1} ${unit.unitName}</p>
${toolsSection}</div>`;
    }).join('');
  };

  const exportToolsWordForUnit = (unitIdx) => {
    const toolUnit = (toolsData || []).find((r) => r._unitIdx === unitIdx);
    if (!toolUnit) return;
    dl(() => createWordDoc(`เครื่องมือประเมิน_${formData.courseCode || ''}_หน่วยที่${unitIdx + 1}`, buildToolsHtml([toolUnit])), { module: 'เครื่องมือประเมิน', courseCode: formData.courseCode || '' });
  };
  const exportToolsPdfForUnit = (unitIdx) => {
    const toolUnit = (toolsData || []).find((r) => r._unitIdx === unitIdx);
    if (!toolUnit) return;
    dl(() => printToPdf(`เครื่องมือประเมิน ${formData.courseCode || ''} หน่วยที่${unitIdx + 1}`, buildToolsHtml([toolUnit])), { module: 'เครื่องมือประเมิน', courseCode: formData.courseCode || '' });
  };
  // Export all units that have been generated
  const exportAllToolsWord = () => {
    if (!toolsData?.length) return;
    dl(() => createWordDoc(`เครื่องมือประเมิน_${formData.courseCode || ''}_ทุกหน่วย`, buildToolsHtml(toolsData)), { module: 'เครื่องมือประเมิน', courseCode: formData.courseCode || '' });
  };
  const exportAllToolsPdf = () => {
    if (!toolsData?.length) return;
    dl(() => printToPdf(`เครื่องมือประเมิน ${formData.courseCode || ''} ทุกหน่วย`, buildToolsHtml(toolsData)), { module: 'เครื่องมือประเมิน', courseCode: formData.courseCode || '' });
  };

  // ── Question Bank (per-unit) ─────────────────────────────────────────────
  const [qbLoading, setQbLoading] = useState(false);
  const [qbProgress, setQbProgress] = useState(''); // text
  const [qbStep, setQbStep] = useState(0);           // current step
  const [qbTotalSteps, setQbTotalSteps] = useState(0); // total steps
  const [qbShowAnswers, setQbShowAnswers] = usePersistedState('lp_qbShowAnswers', {});

  const parsedUnits = useMemo(() => parseUnitTable(unitDivisionPlan), [unitDivisionPlan]);

  const generateQuestionBankForUnit = async (unitIdx) => {
    const unit = (objResults || [])[unitIdx];
    if (!unit) {
      onError?.('ไม่มีข้อมูลจุดประสงค์เชิงพฤติกรรม กรุณาสร้างจุดประสงค์ก่อน');
      return;
    }
    const unitName = unit.unitName || parsedUnits[unitIdx]?.name || `หน่วยที่ ${unitIdx + 1}`;

    // กรองเฉพาะ cognitive ที่เลือกใน Activities Module (ถ้ามี)
    const actResult = (activitiesResults || []).find(r => r._unitIdx === unitIdx);
    const selectedCog = actResult?._selectedCognitive || [];
    const allCognitive = (unit.cognitive || []).filter(
      (item) => !item.startsWith('📌') && !item.startsWith('(คุณครู')
    );
    // ถ้ามี selectedCognitive จาก Activities → ใช้เฉพาะที่เลือก, ถ้าไม่มี → ใช้ทั้งหมด
    const cognitiveObjs = selectedCog.length > 0
      ? allCognitive.filter((obj) => selectedCog.some((sel) => obj.includes(sel) || sel.includes(obj.replace(/\s*\(K\d\)\s*/g, '').trim())))
      : allCognitive;
    if (cognitiveObjs.length === 0) {
      setQuestionBankResults((prev) => {
        const existing = (prev || []).filter((r) => r._unitIdx !== unitIdx);
        return [...existing, { _unitIdx: unitIdx, unitName, objectives: [], error: 'ไม่มีจุดประสงค์พุทธิพิสัย' }];
      });
      return;
    }

    const objsWithBloom = cognitiveObjs.map((obj) => {
      const bloomMatch = obj.match(/\(K[1-6]\)/);
      return { text: obj, bloomLevel: bloomMatch ? bloomMatch[0].replace(/[()]/g, '') : 'K2' };
    });

    const totalObjs = objsWithBloom.length;
    const totalQuestions = totalObjs * 10;

    setQbLoading(true);
    setQbTotalSteps(totalObjs);
    setQbStep(0);
    setQbProgress(`เตรียมข้อมูล ${totalObjs} จุดประสงค์ (${totalQuestions} ข้อ)...`);

    // Generate per-objective for real progress tracking
    const allObjectiveResults = [];
    try {
      for (let oi = 0; oi < objsWithBloom.length; oi++) {
        const obj = objsWithBloom[oi];
        setQbStep(oi);
        setQbProgress(`กำลังสร้างข้อสอบ จุดประสงค์ ${oi + 1}/${totalObjs}: ${obj.text.slice(0, 60)}...`);

        const contextText = `
=== ข้อมูลหน่วยการเรียนรู้ ===
ชื่อหน่วย: ${unitName}
ชื่อวิชา: ${formData?.courseName || ''}
รหัสวิชา: ${formData?.courseCode || ''}
ระดับ: ${formData?.courseCode?.startsWith('3') ? 'ปวส.' : 'ปวช.'}

=== จุดประสงค์เชิงพฤติกรรมด้านพุทธิพิสัย (Cognitive) ===
1. ${obj.text} [ระดับ Bloom: ${obj.bloomLevel}]
`.trim();

        const data = await callApi(
          [{ text: SYSTEM_PROMPT_QUESTION_BANK }, { text: contextText }],
          { json: true, moduleName: 'activitiesQuestionBank', statusText: `สร้างข้อสอบ จุดประสงค์ ${oi + 1}/${totalObjs}...` }
        );

        // Extract the objective result
        const objResult = (data?.objectives || [])[0] || {
          objectiveText: obj.text,
          bloomLevel: obj.bloomLevel,
          questions: [],
        };
        allObjectiveResults.push(objResult);
      }

      setQbStep(totalObjs);
      setQbProgress('รวบรวมผลลัพธ์...');

      setQuestionBankResults((prev) => {
        const existing = (prev || []).filter((r) => r._unitIdx !== unitIdx);
        return [...existing, {
          _unitIdx: unitIdx,
          unitName,
          objectives: allObjectiveResults,
        }].sort((a, b) => a._unitIdx - b._unitIdx);
      });
    } catch (err) {
      console.error('Question Bank Error:', err);
      // Save partial results if any
      if (allObjectiveResults.length > 0) {
        setQuestionBankResults((prev) => {
          const existing = (prev || []).filter((r) => r._unitIdx !== unitIdx);
          return [...existing, {
            _unitIdx: unitIdx,
            unitName,
            objectives: allObjectiveResults,
            error: `สร้างได้บางส่วน (${allObjectiveResults.length}/${totalObjs} จุดประสงค์) — ${err.message}`,
          }].sort((a, b) => a._unitIdx - b._unitIdx);
        });
      }
      onError?.(`เกิดข้อผิดพลาดในการสร้างคลังข้อสอบ: ${err.message || 'ไม่ทราบสาเหตุ'}`);
    } finally {
      setQbLoading(false);
      setQbProgress('');
      setQbStep(0);
      setQbTotalSteps(0);
    }
  };

  const toggleQbAnswer = (unitIdx, objIdx, qIdx) => {
    const key = `${unitIdx}-${objIdx}-${qIdx}`;
    setQbShowAnswers((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const toggleAllQbAnswers = (unitIdx) => {
    const qbUnit = (questionBankResults || []).find((r) => r._unitIdx === unitIdx);
    if (!qbUnit) return;
    const allKeys = [];
    (qbUnit.objectives || []).forEach((obj, oi) => {
      (obj.questions || []).forEach((_, qi) => { allKeys.push(`${unitIdx}-${oi}-${qi}`); });
    });
    const allShown = allKeys.every((k) => qbShowAnswers[k]);
    const newState = { ...qbShowAnswers };
    allKeys.forEach((k) => { newState[k] = !allShown; });
    setQbShowAnswers(newState);
  };

  const buildQbHtml = (qbUnit) => {
    if (!qbUnit) return '';
    const choiceLabels = { a: 'ก', b: 'ข', c: 'ค', d: 'ง' };
    let html = `<h2>คลังข้อสอบ: ${qbUnit.unitName || ''}</h2>`;
    html += `<p>วิชา: ${formData?.courseCode || ''} ${formData?.courseName || ''}</p>`;
    (qbUnit.objectives || []).forEach((obj, oi) => {
      html += `<h3>จุดประสงค์ที่ ${oi + 1}: ${obj.objectiveText || ''} (${obj.bloomLevel || ''})</h3>`;
      html += '<table><thead><tr><th>ข้อ</th><th>คำถาม</th><th>ตัวเลือก</th><th>เฉลย</th><th>คำอธิบาย</th></tr></thead><tbody>';
      (obj.questions || []).forEach((q) => {
        const choices = Object.entries(q.choices || {}).map(([k, v]) => `${choiceLabels[k] || k}. ${v}`).join('<br/>');
        html += `<tr><td class="text-center">${q.no}</td><td>${q.question}</td><td>${choices}</td><td class="text-center"><strong>${choiceLabels[q.answer] || q.answer}</strong></td><td>${q.explanation || ''}</td></tr>`;
      });
      html += '</tbody></table>';
    });
    return html;
  };
  const exportQbPdf = (unitIdx) => {
    const qbUnit = (questionBankResults || []).find((r) => r._unitIdx === unitIdx);
    if (!qbUnit) return;
    dl(() => printToPdf(`คลังข้อสอบ ${formData?.courseCode || ''} ${qbUnit.unitName || ''}`, buildQbHtml(qbUnit)), { module: 'คลังข้อสอบ', courseCode: formData?.courseCode || '' });
  };
  const exportQbWord = (unitIdx) => {
    const qbUnit = (questionBankResults || []).find((r) => r._unitIdx === unitIdx);
    if (!qbUnit) return;
    dl(() => createWordDoc(`คลังข้อสอบ_${formData?.courseCode || ''}_${qbUnit.unitName || ''}`, buildQbHtml(qbUnit)), { module: 'คลังข้อสอบ', courseCode: formData?.courseCode || '' });
  };

  // ── QuestionBankUnit display component ─────────────────────────────────────
  const [qbExpanded, setQbExpanded] = usePersistedState('lp_qbExpanded', {}); // { [unitIdx]: boolean }
  const QuestionBankUnit = ({ unitIdx }) => {
    const choiceLabels = { a: 'ก', b: 'ข', c: 'ค', d: 'ง' };
    const currentQb = (questionBankResults || []).find((r) => r._unitIdx === unitIdx);
    if (!currentQb && !qbLoading) return null;
    const isExpanded = !!qbExpanded[unitIdx];

    return (
      <div className="mt-4">
        {qbLoading && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="animate-spin text-purple-600 shrink-0" size={20} />
              <span className="text-sm text-purple-800 font-medium flex-1">{qbProgress}</span>
              {qbTotalSteps > 0 && (
                <span className="text-xs text-purple-600 font-bold whitespace-nowrap">
                  {qbStep}/{qbTotalSteps} จุดประสงค์
                </span>
              )}
            </div>
            {qbTotalSteps > 0 && (
              <div className="bg-purple-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(5, (qbStep / qbTotalSteps) * 100)}%` }}
                />
              </div>
            )}
            {qbTotalSteps > 0 && (
              <p className="text-xs text-purple-500 mt-1.5">
                สร้างข้อสอบ 10 ข้อ x {qbTotalSteps} จุดประสงค์ = {qbTotalSteps * 10} ข้อ (ใช้เวลาประมาณ {qbTotalSteps * 10}-{qbTotalSteps * 18} วินาที)
              </p>
            )}
          </div>
        )}
        {currentQb && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 text-purple-800 font-bold text-sm">
                <HelpCircle size={16} />
                {(currentQb.objectives || []).reduce((sum, o) => sum + (o.questions || []).length, 0)} ข้อ
                ({(currentQb.objectives || []).length} จุดประสงค์)
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setQbExpanded((prev) => ({ ...prev, [unitIdx]: !prev[unitIdx] }))}
                  className="flex items-center gap-1 text-sm text-purple-700 border border-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-100 font-semibold"
                >
                  {isExpanded ? <><EyeOff size={14} /> ซ่อนข้อสอบ</> : <><Eye size={14} /> ดูข้อสอบทั้งหมด</>}
                </button>
                {isExpanded && (
                  <button onClick={() => toggleAllQbAnswers(unitIdx)} className="flex items-center gap-1 text-sm text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-100">
                    {(currentQb.objectives || []).every((obj, oi) =>
                      (obj.questions || []).every((_, qi) => qbShowAnswers[`${unitIdx}-${oi}-${qi}`])
                    ) ? <><EyeOff size={14} /> ซ่อนเฉลยทั้งหมด</> : <><Eye size={14} /> แสดงเฉลยทั้งหมด</>}
                  </button>
                )}
                <button onClick={() => generateQuestionBankForUnit(unitIdx)} disabled={qbLoading} className="flex items-center gap-1 text-sm text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-50">
                  <RotateCcw size={14} /> สร้างใหม่
                </button>
                <button onClick={() => exportQbWord(unitIdx)} className="flex items-center gap-1 text-sm text-blue-700 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                  <FileDown size={14} /> Word
                </button>
                <button onClick={() => exportQbPdf(unitIdx)} className="flex items-center gap-1 text-sm text-red-700 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50">
                  <FileDown size={14} /> PDF
                </button>
              </div>
            </div>
            {currentQb.error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{currentQb.error}</div>
            ) : !isExpanded ? (
              <div className="bg-white border border-dashed border-purple-200 rounded-xl p-6 text-center">
                <HelpCircle size={28} className="text-purple-300 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-semibold mb-1">สร้างข้อสอบเรียบร้อยแล้ว</p>
                <p className="text-xs text-gray-500">
                  รวม {(currentQb.objectives || []).reduce((sum, o) => sum + (o.questions || []).length, 0)} ข้อ
                  จาก {(currentQb.objectives || []).length} จุดประสงค์ —
                  กดปุ่ม <span className="font-semibold text-purple-700">"ดูข้อสอบทั้งหมด"</span> เพื่อดูรายละเอียด
                  หรือ Export เป็น Word/PDF ได้เลย
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {(currentQb.objectives || []).map((obj, oi) => (
                  <div key={oi} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-gray-200 px-5 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-purple-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">จุดประสงค์ {oi + 1}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                          obj.bloomLevel === 'K1' ? 'bg-green-100 border-green-300 text-green-800' :
                          obj.bloomLevel === 'K2' ? 'bg-blue-100 border-blue-300 text-blue-800' :
                          obj.bloomLevel === 'K3' ? 'bg-yellow-100 border-yellow-300 text-yellow-800' :
                          obj.bloomLevel === 'K4' ? 'bg-orange-100 border-orange-300 text-orange-800' :
                          obj.bloomLevel === 'K5' ? 'bg-red-100 border-red-300 text-red-800' :
                          obj.bloomLevel === 'K6' ? 'bg-purple-100 border-purple-300 text-purple-800' :
                          'bg-gray-100 border-gray-300 text-gray-800'
                        }`}>{obj.bloomLevel || '?'}</span>
                        <span className="text-sm text-gray-700 font-medium">{obj.objectiveText}</span>
                        <span className="text-xs text-gray-400 ml-auto">{(obj.questions || []).length} ข้อ</span>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {(obj.questions || []).map((q, qi) => {
                        const answerKey = `${unitIdx}-${oi}-${qi}`;
                        const isAnswerShown = !!qbShowAnswers[answerKey];
                        return (
                          <div key={qi} className="px-5 py-4 hover:bg-gray-50">
                            <div className="flex items-start gap-3 mb-3">
                              <span className="bg-gray-200 text-gray-700 text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shrink-0">{q.no}</span>
                              <p className="text-sm text-gray-800 font-medium leading-relaxed">{q.question}</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 ml-10 mb-3">
                              {Object.entries(q.choices || {}).map(([key, val]) => (
                                <div key={key} className={`text-sm px-3 py-2 rounded-lg border ${
                                  isAnswerShown && q.answer === key
                                    ? 'bg-green-100 border-green-400 text-green-800 font-semibold'
                                    : 'bg-white border-gray-200 text-gray-700'
                                }`}>
                                  <span className="font-bold mr-2">{choiceLabels[key] || key}.</span>{val}
                                </div>
                              ))}
                            </div>
                            <div className="ml-10">
                              <button onClick={() => toggleQbAnswer(unitIdx, oi, qi)} className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                                {isAnswerShown ? <EyeOff size={12} /> : <Eye size={12} />}
                                {isAnswerShown ? 'ซ่อนเฉลย' : 'แสดงเฉลย'}
                              </button>
                              {isAnswerShown && (
                                <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3">
                                  <div className="text-sm font-bold text-green-800 mb-1">เฉลย: {choiceLabels[q.answer] || q.answer}</div>
                                  {q.explanation && <p className="text-xs text-green-700 leading-relaxed">{q.explanation}</p>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ── Affective Assessment (per-unit) ──────────────────────────────────────
  const [affLoading, setAffLoading] = useState(false);
  const [affProgress, setAffProgress] = useState('');
  const [affData, setAffData] = usePersistedState('lp_affectiveData', []); // array of { _unitIdx, unitName, affectiveTools[] }
  const [expandedAff, setExpandedAff] = useState(null);

  const generateAffectiveForUnit = async (unitIdx) => {
    const unit = (objResults || [])[unitIdx];
    if (!unit) {
      onError?.('ไม่มีข้อมูลจุดประสงค์เชิงพฤติกรรม');
      return;
    }
    const unitName = unit.unitName || parsedUnits[unitIdx]?.name || `หน่วยที่ ${unitIdx + 1}`;
    const affectiveObjs = unit.affective || [];
    if (affectiveObjs.length === 0) {
      onError?.('หน่วยนี้ไม่มีจุดประสงค์จิตพิสัย');
      return;
    }

    setAffLoading(true);
    setAffProgress(`กำลังสร้างแบบประเมินจิตพิสัย: ${unitName}`);

    const contextText = `
=== ข้อมูลหน่วยการเรียนรู้ ===
ชื่อหน่วย: ${unitName}
ชื่อวิชา: ${formData?.courseName || ''}
รหัสวิชา: ${formData?.courseCode || ''}
ระดับ: ${formData?.courseCode?.startsWith('3') ? 'ปวส.' : 'ปวช.'}

=== จุดประสงค์เชิงพฤติกรรมด้านจิตพิสัย (Affective) ===
${affectiveObjs.map((o, i) => `${i + 1}. ${o}`).join('\n')}
`.trim();

    try {
      const data = await callApi(
        [{ text: SYSTEM_PROMPT_AFFECTIVE_ASSESSMENT }, { text: contextText }],
        { json: true, moduleName: 'affectiveAssessment', statusText: `สร้างแบบประเมินจิตพิสัย: ${unitName}...` }
      );
      setAffData((prev) => {
        const existing = (prev || []).filter((r) => r._unitIdx !== unitIdx);
        return [...existing, { _unitIdx: unitIdx, unitName, affectiveTools: data?.affectiveTools || [] }].sort((a, b) => a._unitIdx - b._unitIdx);
      });
    } catch (err) {
      console.error('Affective Error:', err);
      onError?.(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setAffLoading(false);
      setAffProgress('');
    }
  };

  const buildAffHtml = (affUnit) => {
    if (!affUnit) return '';
    const S = 'font-family:"TH Sarabun New",sans-serif;font-size:15pt;';
    const SB = S + 'font-weight:bold;';
    return (affUnit.affectiveTools || []).map((tool, ti) => {
      const rows = (tool.items || []).map(item =>
        `<tr><td style="text-align:center">${item.no}</td><td>${item.behavior}</td><td>${item.score3 || ''}</td><td>${item.score2 || ''}</td><td>${item.score1 || ''}</td></tr>`
      ).join('');
      return `
<p style="${SB}margin-top:16pt;">${ti + 1}. ${tool.name}</p>
<p style="${S}">จุดประสงค์: ${tool.objective || ''}</p>
<p style="${S}">ประเภท: ${tool.type || ''} | ผู้ประเมิน: ${tool.evaluator || ''}</p>
<table style="width:100%;border-collapse:collapse;font-size:14pt;font-family:'TH Sarabun New',sans-serif;" border="1">
  <thead><tr style="background:#7e22ce;color:white;"><th style="width:4%">ที่</th><th style="width:28%">พฤติกรรมที่สังเกต</th><th style="width:24%">3 (ดี)</th><th style="width:22%">2 (พอใช้)</th><th style="width:22%">1 (ปรับปรุง)</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="${S}margin-top:4pt;">คะแนนเต็ม ${tool.maxScore || ''} | ผ่านเกณฑ์ ${tool.passingScore || ''} (${tool.passingPercent || 60}%)</p>
<p style="${S}">เกณฑ์ตัดสิน: ${tool.scoringGuide || ''}</p>`;
    }).join('');
  };
  const exportAffWordForUnit = (unitIdx) => {
    const u = (affData || []).find((r) => r._unitIdx === unitIdx);
    if (!u) return;
    dl(() => createWordDoc(`แบบประเมินจิตพิสัย_${formData.courseCode || ''}_หน่วยที่${unitIdx + 1}`,
      `<h2 style="text-align:center;">แบบประเมินพฤติกรรมด้านจิตพิสัย</h2><h3 style="text-align:center;">หน่วยที่ ${unitIdx + 1} ${u.unitName}</h3>${buildAffHtml(u)}`
    ), { module: 'แบบประเมินจิตพิสัย', courseCode: formData.courseCode || '' });
  };
  const exportAffPdfForUnit = (unitIdx) => {
    const u = (affData || []).find((r) => r._unitIdx === unitIdx);
    if (!u) return;
    dl(() => printToPdf(`แบบประเมินจิตพิสัย ${formData.courseCode || ''} หน่วยที่${unitIdx + 1}`,
      `<h2 style="text-align:center;">แบบประเมินพฤติกรรมด้านจิตพิสัย</h2><h3 style="text-align:center;">หน่วยที่ ${unitIdx + 1} ${u.unitName}</h3>${buildAffHtml(u)}`
    ), { module: 'แบบประเมินจิตพิสัย', courseCode: formData.courseCode || '' });
  };

  // ── JSON Export ───────────────────────────────────────────────────────────
  const exportAllJson = () => {
    const payload = {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      formData,
      generatedPlan,
      unitDivisionPlan,
      loResults,
      compResults,
      objResults,
      conceptResults,
      activitiesResults,
      mediaResults,
      evidenceResults,
      assessmentResults,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `แผนการสอน_${formData.courseCode || 'data'}_${new Date().toLocaleDateString('th-TH').replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── JSON Import ───────────────────────────────────────────────────────────
  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.version || !data.formData) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
        onImportData?.(data);
        onError?.(null);
        alert('นำเข้าข้อมูลสำเร็จ! ระบบโหลดข้อมูลทั้งหมดแล้ว');
      } catch (err) {
        onError?.(`ไม่สามารถนำเข้าข้อมูลได้: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  const { callApi, loading } = useAiApi(providerId, apiKey);

  // ── Canonical unit list (same pattern as ActivitiesModule) ────────────────
  // Always show all units regardless of whether assessment has been generated yet.
  // (`parsedUnits` is already declared above)
  const unitList = useMemo(() => {
    if (parsedUnits.length > 0) return parsedUnits;
    const src = activitiesResults || objResults || loResults || compResults || conceptResults || assessmentResults || [];
    return src.map((u, i) => ({
      no: String(i + 1),
      name: u.unitName || u._unitName || `หน่วยที่ ${i + 1}`,
      theory: '', practice: '', total: '',
    }));
  }, [parsedUnits, activitiesResults, objResults, loResults, compResults, conceptResults, assessmentResults]);

  // ── Build per-unit display data aligned to unitList ───────────────────────
  // Priority for each unit: assessmentResults > activitiesResults pipeline > empty
  const displayAssessment = useMemo(() => {
    if (unitList.length === 0) return null;
    return unitList.map((u, i) => {
      const fromResults = (assessmentResults || []).find((r) => r._unitIdx === i) || (assessmentResults || [])[i];
      const fromPipeline = (activitiesResults || []).find((r) => r._unitIdx === i) || (activitiesResults || [])[i];
      return {
        _unitIdx: i,
        unitName: u.name || fromResults?.unitName || fromPipeline?.unitName || `หน่วยที่ ${i + 1}`,
        performanceCriteria: fromResults?.performanceCriteria || fromPipeline?.performanceCriteria || [],
        assessmentMethods: fromResults?.assessmentMethods || fromPipeline?.assessmentMethods || [],
        assessmentTools: fromResults?.assessmentTools || fromPipeline?.assessmentTools || [],
      };
    });
  }, [unitList, assessmentResults, activitiesResults]);

  const isPipelineAssessment = !(assessmentResults && assessmentResults.length > 0);

  // ── Inline editing ──────────────────────────────────────────────────────
  const [editingAssessment, setEditingAssessment] = useState(false);
  const [editAssessData, setEditAssessData] = useState(null);

  const startEditAssessment = () => {
    setEditAssessData(JSON.parse(JSON.stringify(displayAssessment)));
    setEditingAssessment(true);
  };
  const cancelEditAssessment = () => { setEditingAssessment(false); setEditAssessData(null); };
  const saveEditAssessment = () => {
    setAssessmentResults(editAssessData);
    setEditingAssessment(false);
    setEditAssessData(null);
  };
  const updateAssessItem = (unitIdx, field, itemIdx, value) => {
    setEditAssessData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      const arr = [...(item[field] || [])];
      arr[itemIdx] = value;
      return { ...item, [field]: arr };
    }));
  };
  const addAssessRow = (unitIdx) => {
    setEditAssessData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      return {
        ...item,
        performanceCriteria: [...(item.performanceCriteria || []), ''],
        assessmentMethods: [...(item.assessmentMethods || []), ''],
        assessmentTools: [...(item.assessmentTools || []), ''],
      };
    }));
  };
  const removeAssessRow = (unitIdx, rowIdx) => {
    setEditAssessData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      return {
        ...item,
        performanceCriteria: (item.performanceCriteria || []).filter((_, ci) => ci !== rowIdx),
        assessmentMethods: (item.assessmentMethods || []).filter((_, ci) => ci !== rowIdx),
        assessmentTools: (item.assessmentTools || []).filter((_, ci) => ci !== rowIdx),
      };
    }));
  };

  const syllabusUpload = useFileUpload({ onError });
  const objUpload = useFileUpload({ onError });
  const compUpload = useFileUpload({ onError });
  const evidenceUpload = useFileUpload({ onError });
  const activitiesUpload = useFileUpload({ onError });
  const fileHooks = { syllabus: syllabusUpload, objectives: objUpload, competencies: compUpload, evidence: evidenceUpload, activities: activitiesUpload };

  const generate = async () => {
    if (!hasInternal && !(syllabusUpload.file && objUpload.file && compUpload.file && evidenceUpload.file && activitiesUpload.file)) {
      onError('ข้อมูลไม่เพียงพอ กรุณาอัปโหลดไฟล์ให้ครบทุกขั้นตอนค่ะ');
      return;
    }
    if (onRegenerate) onRegenerate();
    try {
      let parts = [{ text: SYSTEM_PROMPT_ASSESSMENT }];
      if (hasInternal && !syllabusUpload.file) {
        parts.push({ text: `\n\n--- Course Syllabus ---\n${JSON.stringify(formData)}` });
        parts.push({ text: `\n\n--- Behavioral Objectives ---\n${JSON.stringify(objResults)}` });
        parts.push({ text: `\n\n--- Unit Competencies ---\n${JSON.stringify(compResults)}` });
        parts.push({ text: `\n\n--- Learning Evidence ---\n${JSON.stringify(evidenceResults)}` });
        parts.push({ text: `\n\n--- Learning Activities ---\n${JSON.stringify(activitiesResults)}` });
      } else {
        parts.push(...buildFileParts(syllabusUpload.file, 'Course Syllabus'));
        parts.push(...buildFileParts(objUpload.file, 'Behavioral Objectives'));
        parts.push(...buildFileParts(compUpload.file, 'Unit Competencies'));
        parts.push(...buildFileParts(evidenceUpload.file, 'Learning Evidence'));
        parts.push(...buildFileParts(activitiesUpload.file, 'Learning Activities'));
      }
      const data = await callApi(parts, { json: true, moduleName: 'assessment', statusText: 'กำลังวิเคราะห์การวัดและประเมินผล...' });
      const { ensureSchema } = await import('../../utils/aiResponseValidator');
      const validated = ensureSchema(data, 'assessment', { arrayKey: 'units' });
      setAssessmentResults(validated.units);
    } catch (err) {
      console.error('Assessment Error:', err);
      onError(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถสร้างการวัดและประเมินผลได้'}`);
    }
  };

  // ── Bulk Generate (สร้างทั้งหมดในหน่วยเดียว) ──────────────────────────────
  // ต้องผ่านการยืนยันรหัสผู้ดูแลระบบก่อน — share key กับ MediaModule
  const [bulkLoadingUnit, setBulkLoadingUnit] = useState(null);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const verifyAdminCode = () => {
    if (localStorage.getItem(ADMIN_VERIFIED_KEY) === '1') return true;
    const input = window.prompt('🔒 กรุณาใส่รหัสผู้ดูแลระบบเพื่อใช้งาน "สร้างทั้งหมด"');
    if (input === null) return false;
    if (input.trim() === ADMIN_PASSWORD) {
      localStorage.setItem(ADMIN_VERIFIED_KEY, '1');
      return true;
    }
    onError?.('รหัสผู้ดูแลระบบไม่ถูกต้อง');
    return false;
  };

  // ── Completion Status per Unit (เกณฑ์เข้ม: ครบทั้ง 5 ประเภท) ───────────────
  const completionStatus = useMemo(() => {
    if (!displayAssessment || displayAssessment.length === 0) return [];
    return displayAssessment.map((item, i) => {
      // 1. แผนหลัก (เกณฑ์/วิธีการ/เครื่องมือ) — มีอย่างน้อย 1 list
      const hasMain =
        (item.performanceCriteria?.length || 0) > 0 ||
        (item.assessmentMethods?.length || 0) > 0 ||
        (item.assessmentTools?.length || 0) > 0;
      // 2. เครื่องมือประเมิน — toolsData entry มี tools[]
      const toolsEntry = (toolsData || []).find((r) => r._unitIdx === i);
      const hasTools = Array.isArray(toolsEntry?.tools) && toolsEntry.tools.length > 0;
      // 3. แบบประเมินใบงาน — jobSheetEvalStore[i] มีอย่างน้อย 1
      const hasJobSheetEval = Array.isArray(jobSheetEvalStore[i]) && jobSheetEvalStore[i].length > 0;
      // 4. แบบทดสอบ — questionBankResults entry มี objectives[]
      const qbEntry = (questionBankResults || []).find((r) => r._unitIdx === i);
      const hasQB = Array.isArray(qbEntry?.objectives) && qbEntry.objectives.length > 0;
      // 5. แบบประเมินจิตพิสัย — affData entry มี affectiveTools[]
      const affEntry = (affData || []).find((r) => r._unitIdx === i);
      const hasAff = Array.isArray(affEntry?.affectiveTools) && affEntry.affectiveTools.length > 0;
      const checks = [hasMain, hasTools, hasJobSheetEval, hasQB, hasAff];
      const completedCount = checks.filter(Boolean).length;
      return {
        unitIdx: i,
        unitName: item.unitName || `หน่วยที่ ${i + 1}`,
        hasMain, hasTools, hasJobSheetEval, hasQB, hasAff,
        completedCount,
        isComplete: completedCount === 5,
      };
    });
  }, [displayAssessment, toolsData, jobSheetEvalStore, questionBankResults, affData]);

  const totalComplete = completionStatus.filter((s) => s.isComplete).length;
  const totalUnits = completionStatus.length;

  // ── Bulk handler — สร้างทุกประเภทที่ขาดในหน่วยเดียว (skip ของที่มีแล้ว) ──
  const handleBulkGenerate = async (unitIdx) => {
    if (bulkLoadingUnit !== null || loading || toolsLoading || qbLoading || affLoading || jobSheetEvalLoading !== null) {
      onError?.('กรุณารอให้การสร้างปัจจุบันเสร็จก่อน');
      return;
    }
    if (!verifyAdminCode()) return;

    const status = completionStatus[unitIdx];
    if (!status) return;

    const tasks = [];
    if (!status.hasMain) tasks.push({ type: 'main', label: 'แผนหลักการประเมิน' });
    if (!status.hasTools) tasks.push({ type: 'tools', label: 'เครื่องมือประเมิน' });
    if (!status.hasJobSheetEval) tasks.push({ type: 'jobSheetEval', label: 'แบบประเมินใบงาน' });
    if (!status.hasQB) tasks.push({ type: 'qb', label: 'แบบทดสอบ' });
    if (!status.hasAff) tasks.push({ type: 'aff', label: 'แบบประเมินจิตพิสัย' });

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
        if (task.type === 'main') await generate();
        else if (task.type === 'tools') await generateToolsForUnit(unitIdx);
        else if (task.type === 'jobSheetEval') await generateJobSheetEvalForUnit(unitIdx);
        else if (task.type === 'qb') await generateQuestionBankForUnit(unitIdx);
        else if (task.type === 'aff') await generateAffectiveForUnit(unitIdx);
      } catch (err) {
        console.error(`[Bulk] Task ${task.label} failed:`, err);
        failed += 1;
      }
    }

    setBulkLoadingUnit(null);
    setBulkProgress({ current: 0, total: 0 });

    if (failed > 0) {
      onError?.(`สร้างเสร็จแต่ล้มเหลว ${failed}/${tasks.length} รายการ — บางอย่างอาจขาด prerequisites (เช่น จุดประสงค์/ใบงาน)`);
    }
  };

  const renderList = (list) => {
    if (!list || list.length === 0) return '-';
    return `<ul style="margin:0;padding-left:15px;">${list.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  };

  const _doExportWord = () => {
    if (!displayAssessment) return;
    const rows = displayAssessment.map((item, idx) =>
      `<tr><td style="text-align:center;vertical-align:top;">${idx + 1}</td><td style="vertical-align:top;">${item.unitName}</td><td style="vertical-align:top;">${renderList(item.assessmentTools)}</td><td style="vertical-align:top;">${renderList(item.assessmentMethods)}</td><td style="vertical-align:top;">${renderList(item.performanceCriteria)}</td></tr>`
    ).join('');
    createWordDoc(`การวัดและประเมินผล_${formData.courseCode}`, `<table><thead><tr><th width="6%">ที่</th><th width="20%">หน่วยการเรียนรู้</th><th>9.3 เครื่องมือประเมิน</th><th>9.2 วิธีการประเมิน</th><th>9.1 เกณฑ์การปฏิบัติงาน</th></tr></thead><tbody>${rows}</tbody></table>`);
  };
  const _meta = { module: 'การวัดและประเมินผล', courseCode: formData.courseCode || '', courseName: formData.courseName || '' };
  const _metaSummary = { module: 'สรุปรายวิชา', courseCode: formData.courseCode || '', courseName: formData.courseName || '' };
  const exportWord = () => dl(_doExportWord, _meta);

  const _doExportPdf = () => {
    if (!displayAssessment) return;
    const rows = displayAssessment.map((item, idx) =>
      `<tr><td class="text-center">${idx + 1}</td><td>${item.unitName}</td><td>${renderList(item.assessmentTools)}</td><td>${renderList(item.assessmentMethods)}</td><td>${renderList(item.performanceCriteria)}</td></tr>`
    ).join('');
    printToPdf(`การวัดและประเมินผล ${formData.courseCode}`, `<table><thead><tr><th width="6%">ที่</th><th width="20%">หน่วยการเรียนรู้</th><th>9.3 เครื่องมือประเมิน</th><th>9.2 วิธีการประเมิน</th><th>9.1 เกณฑ์การปฏิบัติงาน</th></tr></thead><tbody>${rows}</tbody></table>`);
  };
  const exportPdf = () => dl(_doExportPdf, _meta);

  // --- Full Unit Plan Export (moved from ConceptModule) ---
  const mergeDataForExport = () => {
    const source = displayAssessment || loResults || [];
    if (source.length === 0) return [];
    return source.map((item, index) => {
      // activitiesResults may be per-unit objects with _unitIdx
      const actByIdx = (activitiesResults || []).find((r) => r._unitIdx === index);
      const actByOrder = activitiesResults?.[index];
      const act = actByIdx || actByOrder || {};
      return {
        unitName: item.unitName || loResults?.[index]?.unitName || `หน่วยที่ ${index + 1}`,
        outcome: loResults?.[index]?.outcome || '-',
        competencies: compResults?.[index]?.competencies || [],
        objectives: objResults?.[index] || { cognitive: [], psychomotor: [], affective: [], application: [] },
        concept: conceptResults?.[index]?.concept || '-',
        activities: act.activities || activitiesResults?.[index]?.activities || [],
        media: act.media || mediaResults?.[index]?.media || [],
        knowledgeEvidence: act.knowledgeEvidence || evidenceResults?.[index]?.knowledgeEvidence || [],
        performanceEvidence: act.performanceEvidence || evidenceResults?.[index]?.performanceEvidence || [],
        performanceCriteria: item.performanceCriteria || [],
        assessmentMethods: item.assessmentMethods || [],
        assessmentTools: item.assessmentTools || [],
      };
    });
  };

  const buildUnitPlanHtml = (allUnits) => {
    const fd = formData;
    const S = 'font-family:"TH Sarabun New",sans-serif;font-size:16pt;';
    const SB = S + 'font-weight:bold;';
    const indent = `style="${S}margin-left:1cm;"`;
    const indent05 = `style="${S}margin-left:0.5cm;"`;
    const dots = '………………………………………………………………………………………………………';

    const renderListHtml = (list) => {
      if (!list?.length) return `<p ${indent}>${dots}</p>`;
      return list.map((item) => `<p ${indent}>${typeof item === 'string' ? item : item.name || item}</p>`).join('');
    };

    const renderActivitiesHtml = (activities) => {
      if (!activities?.length) return `<p ${indent}>${dots}</p>`;
      return activities.map((a, i) => `<p ${indent}>${i + 1}. ${a.name} (${a.type}, ${a.duration}) - ${a.description}</p>`).join('');
    };

    const renderMediaHtml = (media) => {
      if (!media?.length) return `<p ${indent}>${dots}</p>`;
      return media.map((m, i) => `<p ${indent}>${i + 1}. ${m.name} (${m.type}) - ${m.description}</p>`).join('');
    };

    const renderConcept = (text) => {
      if (!text || text === '-') return `<p ${indent}>${dots}</p>`;
      const lines = text.split(/\n|<br\s*\/?>/).filter(l => l.trim());
      return lines.map(l => `<p ${indent}>${l.replace(/^\d+\.\s*/, '').replace(/^[-•]\s*/, '').trim()}</p>`).join('');
    };

    return allUnits.map((unit, idx) => `
<div style="page-break-before:${idx > 0 ? 'always' : 'auto'};">
<p style="${SB}font-size:18pt;text-align:center;">แผนการจัดการเรียนรู้</p>
<p style="${SB}font-size:16pt;text-align:center;">หน่วยที่ ${idx + 1} ${unit.unitName}</p>
<p style="${S}">รหัสวิชา ${fd.courseCode || '...'} ชื่อวิชา ${fd.courseName || '...'}</p>

<p style="${SB}">1. ผลลัพธ์การเรียนรู้ระดับหน่วยการเรียน</p>
<p ${indent}>${unit.outcome || dots}</p>

<p style="${SB}">2. อ้างอิงมาตรฐาน/เชื่อมโยงกลุ่มอาชีพ</p>
<p ${indent05}>2.1 มาตรฐานอาชีพ.................................สมรรถนะย่อย............</p>
<p ${indent}>1) เกณฑ์การปฏิบัติงาน....</p>
<p ${indent}>2) วิธีประเมิน...................</p>
<p ${indent}>3) หลักฐานการปฏิบัติงาน (Performance Evidence)</p>
<p ${indent}>4) หลักฐานความรู้ (Knowledge Evidence)</p>
<p ${indent05}>2.2 บูรณาการกลุ่มอาชีพ........................................</p>

<p style="${SB}">3. สมรรถนะประจำหน่วย</p>
${renderListHtml(unit.competencies)}

<p style="${SB}">4. จุดประสงค์เชิงพฤติกรรม</p>
<p ${indent05}><b style="${S}">4.1 พุทธิพิสัย</b></p>
${renderListHtml(unit.objectives?.cognitive)}
<p ${indent05}><b style="${S}">4.2 ทักษะพิสัย</b></p>
${renderListHtml(unit.objectives?.psychomotor)}
<p ${indent05}><b style="${S}">4.3 จิตพิสัย</b></p>
${renderListHtml(unit.objectives?.affective)}
<p ${indent05}><b style="${S}">4.4 ความสามารถประยุกต์ใช้และรับผิดชอบ</b></p>
${renderListHtml(unit.objectives?.application)}

<p style="${SB}">5. สาระการเรียนรู้</p>
${renderConcept(unit.concept)}

<p style="${SB}">6. กิจกรรมการเรียนรู้</p>
${renderActivitiesHtml(unit.activities)}

<p style="${SB}">7. สื่อและแหล่งการเรียนรู้</p>
${renderMediaHtml(unit.media)}

<p style="${SB}">8. หลักฐานการเรียนรู้</p>
<p ${indent05}>8.1 หลักฐานความรู้</p>
${renderListHtml(unit.knowledgeEvidence)}
<p ${indent05}>8.2 หลักฐานการปฏิบัติงาน</p>
${renderListHtml(unit.performanceEvidence)}

<p style="${SB}">9. การวัดและประเมินผล</p>
<p ${indent05}>9.1 เกณฑ์การปฏิบัติงาน</p>
${renderListHtml(unit.performanceCriteria)}
<p ${indent05}>9.2 วิธีการประเมิน</p>
${renderListHtml(unit.assessmentMethods)}
<p ${indent05}>9.3 เครื่องมือประเมิน</p>
${renderListHtml(unit.assessmentTools)}

<p style="${SB}">10. บันทึกผลหลังการจัดการเรียนรู้</p>
<p ${indent05}>10.1 ข้อสรุปหลังการจัดการเรียนรู้</p>
<p ${indent}>${dots}</p>
<p ${indent05}>10.2 ปัญหาที่พบ</p>
<p ${indent}>${dots}</p>
<p ${indent05}>10.3 แนวทางแก้ปัญหา</p>
<p ${indent}>${dots}</p>
</div>`).join('');
  };

  const _doExportSummaryWord = async () => {
    // Use any available source to determine unit count
    const unitCount =
      loResults?.length ||
      (displayAssessment)?.length ||
      activitiesResults?.length || 0;
    if (unitCount === 0) {
      onError?.('ไม่พบข้อมูลสำหรับสร้างเอกสาร กรุณาตรวจสอบว่าได้สร้างข้อมูลครบทุกขั้นตอนแล้ว');
      return;
    }
    const units = unitDivisionPlan ? parseUnitTable(unitDivisionPlan) : [];
    for (let i = 0; i < unitCount; i++) {
      try {
        const data = buildTemplateData({
          formData, loResults, compResults, objResults, conceptResults,
          activitiesResults, mediaResults, evidenceResults, assessmentResults,
          units, unitIndex: i,
        });
        await generateDocxFromTemplate(data, `แผนรายหน่วย_${formData.courseCode || ''}_หน่วยที่${i + 1}`);
        if (i < unitCount - 1) await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`[AssessmentModule] Export unit ${i + 1} error:`, err);
        onError?.(`เกิดข้อผิดพลาดในการสร้างไฟล์หน่วยที่ ${i + 1}: ${err.message}`);
        return;
      }
    }
  };
  const exportSummaryWord = () => dl(_doExportSummaryWord, _metaSummary);

  const _doExportSummaryPdf = () => {
    const allUnits = mergeDataForExport();
    if (allUnits.length === 0) {
      onError?.('ไม่พบข้อมูลสำหรับสร้างเอกสาร กรุณาตรวจสอบว่าได้สร้างข้อมูลครบทุกขั้นตอนแล้ว');
      return;
    }
    try {
      printToPdf(`แผนการจัดการเรียนรู้: ${formData.courseName}`, buildUnitPlanHtml(allUnits));
    } catch (err) {
      console.error('[AssessmentModule] Export PDF error:', err);
      onError?.(`เกิดข้อผิดพลาดในการสร้าง PDF: ${err.message}`);
    }
  };
  const exportSummaryPdf = () => dl(_doExportSummaryPdf, _metaSummary);

  // Send export functions to parent (App) for DownloadModule
  React.useEffect(() => {
    if (onExportReady) onExportReady({ word: exportSummaryWord, pdf: exportSummaryPdf });
  }, [onExportReady]);

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 min-h-[80vh]">
      <div className="mb-6 border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><ClipboardCheck className="text-blue-600" /> การวัดและประเมินผล (Assessment & Evaluation)</h2>
        <p className="text-gray-500 text-sm mt-1">กำหนดเครื่องมือประเมิน วิธีการประเมิน และเกณฑ์การปฏิบัติงานสำหรับแต่ละหน่วย</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {!displayAssessment && (
          <div className="max-w-xl mx-auto w-full">
            {hasInternal ? (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 text-center mb-4">
                <div className="bg-white p-3 rounded-full shadow-sm mb-3 mx-auto w-fit text-indigo-600"><CheckCircle size={32} /></div>
                <h3 className="text-indigo-800 font-bold text-lg mb-2">ข้อมูลพร้อมใช้งาน!</h3>
                <p className="text-indigo-700 text-sm mb-4">รับข้อมูลอัตโนมัติครบถ้วน (หลักสูตร + จุดประสงค์ + สมรรถนะ + หลักฐาน + กิจกรรม)</p>
                <button onClick={generate} disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />} สร้างการวัดและประเมินผลทันที
                </button>
              </div>
            ) : (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center mb-6"><p className="text-sm text-gray-500 font-medium">Mode 2: Upload ข้อมูลด้วยตนเอง</p></div>
                <div className="flex items-center justify-center mb-6">
                  {UPLOAD_STEPS.map((s, i) => (
                    <React.Fragment key={s.key}>
                      {i > 0 && <div className={`w-10 h-1 mx-1 ${step >= s.step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                      <div className={`flex items-center ${step >= s.step ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= s.step ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>{s.step}</div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                {UPLOAD_STEPS.map((s) => {
                  if (step !== s.step) return null;
                  const hook = fileHooks[s.key];
                  return (
                    <div key={s.key}>
                      {s.step > 1 && <button onClick={() => setStep(s.step - 1)} className="text-gray-500 text-sm mb-2 flex items-center hover:text-gray-700"><ChevronLeft size={16} /> ย้อนกลับ</button>}
                      <label className="block text-lg font-bold text-gray-800 mb-3 text-center">ขั้นตอนที่ {s.step}: แนบไฟล์{s.label}</label>
                      <FileUploadZone file={hook.file} onUpload={hook.handleUpload} label={`คลิกเพื่อแนบไฟล์ ${s.label}`} height="h-64" />
                      {hook.file && (
                        s.step < UPLOAD_STEPS.length ? (
                          <button onClick={() => setStep(s.step + 1)} className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2">ถัดไป <ChevronRight /></button>
                        ) : (
                          <button onClick={generate} disabled={loading} className="w-full mt-4 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2 shadow-lg disabled:opacity-70">
                            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} สร้างการวัดและประเมินผล
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {displayAssessment && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 bg-green-50 p-3 rounded-lg border border-green-200 mb-4">
              <div className="flex items-center gap-2 text-green-800 text-sm">
                <Check size={16} /> ข้อมูลจาก Module กิจกรรมการเรียนรู้
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">อัตโนมัติ</span>
              </div>
              <div className="flex items-center gap-2">
                <ExportButtons onExportWord={exportWord} onExportPdf={exportPdf} />
              </div>
            </div>

            {/* ── Status Dashboard (เกณฑ์เข้ม: ต้องครบทั้ง 5 ประเภท) ────────── */}
            {completionStatus.length > 0 && (
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl p-4 shadow-sm mb-4">
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
                <div className="w-full bg-indigo-100 rounded-full h-2 mb-3 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${totalComplete === totalUnits ? 'bg-green-500' : 'bg-indigo-500'}`}
                    style={{ width: `${totalUnits > 0 ? (totalComplete / totalUnits) * 100 : 0}%` }}
                  />
                </div>
                <div className="overflow-x-auto bg-white rounded-xl border border-indigo-200">
                  <table className="w-full text-xs">
                    <thead className="bg-indigo-100/60">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold text-indigo-900 whitespace-nowrap">หน่วย</th>
                        <th className="text-left px-3 py-2 font-bold text-indigo-900 min-w-[160px]">ชื่อหน่วย</th>
                        <th className="text-center px-2 py-2 font-bold text-indigo-900" title="แผนหลัก: เกณฑ์/วิธีการ/เครื่องมือ">แผนหลัก</th>
                        <th className="text-center px-2 py-2 font-bold text-indigo-900" title="เครื่องมือประเมินรายข้อ">เครื่องมือ</th>
                        <th className="text-center px-2 py-2 font-bold text-indigo-900" title="แบบประเมินใบงาน">ประเมินใบงาน</th>
                        <th className="text-center px-2 py-2 font-bold text-indigo-900" title="แบบทดสอบ">แบบทดสอบ</th>
                        <th className="text-center px-2 py-2 font-bold text-indigo-900" title="แบบประเมินจิตพิสัย">จิตพิสัย</th>
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
                            className={`border-t border-indigo-100 cursor-pointer transition ${isSelected ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-indigo-50'}`}
                          >
                            <td className="px-3 py-2 font-bold text-indigo-700 whitespace-nowrap">{s.unitIdx + 1}</td>
                            <td className="px-3 py-2 text-gray-800 truncate max-w-[200px]" title={s.unitName}>{s.unitName}</td>
                            <td className="px-2 py-2 text-center"><Icon ok={s.hasMain} /></td>
                            <td className="px-2 py-2 text-center"><Icon ok={s.hasTools} /></td>
                            <td className="px-2 py-2 text-center"><Icon ok={s.hasJobSheetEval} /></td>
                            <td className="px-2 py-2 text-center"><Icon ok={s.hasQB} /></td>
                            <td className="px-2 py-2 text-center"><Icon ok={s.hasAff} /></td>
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
                                  title={localStorage.getItem(ADMIN_VERIFIED_KEY) === '1' ? 'สร้างทุกประเภทที่ขาดในหน่วยนี้' : 'ต้องใส่รหัสผู้ดูแลระบบก่อน'}
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
                  💡 คลิกที่แถวเพื่อเปิดดูหน่วยนั้น • เกณฑ์สำเร็จ: ต้องมีครบทั้ง 5 ประเภท (แผนหลัก + เครื่องมือ + ประเมินใบงาน + แบบทดสอบ + จิตพิสัย)
                </p>
              </div>
            )}

            {/* Unit dropdown */}
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
              <span className="text-sm font-semibold text-blue-800 whitespace-nowrap">เลือกหน่วยที่แสดง:</span>
              <select
                value={selectedUnitIdx}
                onChange={(e) => setSelectedUnitIdx(Number(e.target.value))}
                className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-400"
              >
                {displayAssessment.map((item, i) => (
                  <option key={i} value={i}>{item.unitName || `หน่วยที่ ${i + 1}`}</option>
                ))}
              </select>
              <span className="text-xs text-blue-600">{selectedUnitIdx + 1}/{displayAssessment.length} หน่วย</span>
            </div>

            {(() => {
              const item = displayAssessment?.[selectedUnitIdx];
              if (!item) return null;
              const pc = item.performanceCriteria || [];
              const am = item.assessmentMethods || [];
              const at = item.assessmentTools || [];
              const maxLen = Math.max(pc.length, am.length, at.length);
              return (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
                    <h3 className="font-bold text-blue-900 text-sm">หน่วยที่ {selectedUnitIdx + 1}: {item.unitName}</h3>
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="bg-gray-100 border border-gray-200 px-2 py-2 text-center w-9 text-gray-600">ที่</th>
                          <th className="bg-violet-50 text-violet-800 border border-violet-200 px-3 py-2 text-left font-bold">9.3 เครื่องมือประเมิน</th>
                          <th className="bg-teal-50 text-teal-800 border border-teal-200 px-3 py-2 text-left font-bold">9.2 วิธีการประเมิน</th>
                          <th className="bg-orange-50 text-orange-800 border border-orange-200 px-3 py-2 text-left font-bold">9.1 เกณฑ์การปฏิบัติงาน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: maxLen }, (_, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="border border-gray-200 px-2 py-2 text-center text-gray-500 font-bold">{i + 1}</td>
                            <td className="border border-gray-200 px-3 py-2 text-violet-900">{at[i] || '-'}</td>
                            <td className="border border-gray-200 px-3 py-2 text-teal-900">{am[i] || '-'}</td>
                            <td className="border border-gray-200 px-3 py-2 text-orange-900">{pc[i] || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* ── Dynamic Tool Sections from 9.3 ── */}
            {(() => {
              const currentData = editingAssessment ? editAssessData : displayAssessment;
              const item = currentData?.[selectedUnitIdx];
              const toolsList = item?.assessmentTools || [];
              if (toolsList.length === 0) return <p className="mt-4 text-xs text-gray-400 italic text-center">ยังไม่มีเครื่องมือประเมิน 9.3 — กรุณาสร้างการวัดผลก่อน</p>;

              const isQbType = (n) => /แบบทดสอบ|ข้อสอบ/.test(n || '');
              const isAffType = (n) => /จิตพิสัย|พฤติกรรม|คุณลักษณะ/.test(n || '');

              const qbForUnit = (questionBankResults || []).find((r) => r._unitIdx === selectedUnitIdx);
              const affForUnit = (affData || []).find((r) => r._unitIdx === selectedUnitIdx);
              const toolsForUnit = (toolsData || []).find((r) => r._unitIdx === selectedUnitIdx);
              const jobSheetsForUnit = jobSheetStore?.[selectedUnitIdx] || [];
              const jobSheetEvalForUnit = jobSheetEvalStore?.[selectedUnitIdx] || [];
              const hasObjData = !!(objResults || [])[selectedUnitIdx];
              const hasAffObj = ((objResults || [])[selectedUnitIdx]?.affective || []).length > 0;

              // Track tool-type index to map generated tools by order
              let toolTypeCounter = 0;

              // Reusable status badge — visible on every card so the user can see at a glance
              // ว่าเครื่องมือใดสร้างแล้ว / ยังไม่สร้าง
              const StatusBadge = ({ done }) => done
                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300 inline-flex items-center gap-1"><Check size={10} /> สร้างแล้ว</span>
                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-300">ยังไม่สร้าง</span>;

              // Check if QB and Affective are already in 9.3
              const hasQbIn93 = toolsList.some((t) => isQbType(t));
              const hasAffIn93 = toolsList.some((t) => isAffType(t));
              const hasJobSheetIn93 = toolsList.some((t) => isJobSheetType(t));

              // Build cards: 9.3 items + bonus QB/Affective/JobSheet if missing
              const allCards = [...toolsList.map((t, i) => ({ name: t, idx: i, source: '9.3' }))];
              if (!hasQbIn93) allCards.unshift({ name: 'แบบทดสอบปรนัย (คลังข้อสอบ)', idx: -1, source: 'auto' });
              if (!hasAffIn93) allCards.push({ name: 'แบบสังเกตพฤติกรรม (จิตพิสัย)', idx: -1, source: 'auto' });
              // Add แบบประเมินใบงาน card if missing AND ใบงาน exist in MediaModule
              if (!hasJobSheetIn93 && jobSheetsForUnit.length > 0) {
                allCards.push({ name: `แบบประเมินใบงาน (${jobSheetsForUnit.length} ใบ)`, idx: -1, source: 'auto-jobsheet' });
              }

              return allCards.map((card, cardIdx) => {
                const toolName = card.name;
                const toolIdx = cardIdx;
                const criterion = card.source === '9.3' ? (item?.performanceCriteria || [])[card.idx] || '' : '';
                const method = card.source === '9.3' ? (item?.assessmentMethods || [])[card.idx] || '' : '';

                // ── QB Type ──
                if (isQbType(toolName)) {
                  const hasQb = !!qbForUnit && (qbForUnit.objectives || []).length > 0;
                  return (
                    <div key={toolIdx} className="mt-4 border border-purple-200 rounded-2xl overflow-hidden">
                      <div className="bg-purple-50 px-5 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-purple-900 flex items-center gap-2 text-sm">
                              <HelpCircle size={16} /> 9.3.{toolIdx + 1} {toolName}
                              <StatusBadge done={hasQb} />
                            </h3>
                            <p className="text-[10px] text-purple-500 mt-0.5">เกณฑ์: {criterion} | วิธี: {method}</p>
                          </div>
                          <button onClick={() => generateQuestionBankForUnit(selectedUnitIdx)} disabled={qbLoading || !hasObjData}
                            className="bg-purple-600 text-white px-3 py-1.5 rounded-xl font-bold text-xs hover:bg-purple-700 disabled:opacity-60 flex items-center gap-1.5 shadow">
                            {qbLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                            {hasQb ? 'สร้างใหม่' : 'สร้างคลังข้อสอบ'}
                          </button>
                        </div>
                      </div>
                      {(hasQb || qbLoading) && <div className="px-4 pb-4"><QuestionBankUnit unitIdx={selectedUnitIdx} /></div>}
                    </div>
                  );
                }

                // ── Affective Type ──
                if (isAffType(toolName)) {
                  const hasAff = !!affForUnit && (affForUnit.affectiveTools || []).length > 0;
                  return (
                    <div key={toolIdx} className="mt-4 border border-pink-200 rounded-2xl overflow-hidden">
                      <div className="bg-pink-50 px-5 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-pink-900 flex items-center gap-2 text-sm">
                              <ClipboardList size={16} /> 9.3.{toolIdx + 1} {toolName}
                              <StatusBadge done={hasAff} />
                            </h3>
                            <p className="text-[10px] text-pink-500 mt-0.5">เกณฑ์: {criterion} | วิธี: {method}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {hasAff && (
                              <>
                                <button onClick={() => exportAffWordForUnit(selectedUnitIdx)} className="flex items-center gap-1 text-[10px] text-blue-700 border border-blue-300 px-2 py-1 rounded-lg hover:bg-blue-50"><FileDown size={10} /> Word</button>
                                <button onClick={() => exportAffPdfForUnit(selectedUnitIdx)} className="flex items-center gap-1 text-[10px] text-red-700 border border-red-300 px-2 py-1 rounded-lg hover:bg-red-50"><FileDown size={10} /> PDF</button>
                              </>
                            )}
                            <button onClick={() => generateAffectiveForUnit(selectedUnitIdx)} disabled={affLoading || !hasAffObj}
                              className="bg-pink-600 text-white px-3 py-1.5 rounded-xl font-bold text-xs hover:bg-pink-700 disabled:opacity-60 flex items-center gap-1.5 shadow">
                              {affLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                              {hasAff ? 'สร้างใหม่' : 'สร้างแบบประเมิน'}
                            </button>
                          </div>
                        </div>
                        {!hasAffObj && <p className="text-[10px] text-pink-400 mt-1 italic">หน่วยนี้ไม่มีจุดประสงค์จิตพิสัย — กรุณาสร้างจุดประสงค์ก่อน</p>}
                      </div>
                      {affLoading && (
                        <div className="px-5 py-3 bg-pink-50 border-t border-pink-100">
                          <div className="flex items-center gap-2 text-xs text-pink-700"><Loader2 size={14} className="animate-spin shrink-0" /><span>{affProgress || 'กำลังสร้าง...'}</span></div>
                          <div className="mt-1.5 bg-pink-200 rounded-full h-1.5"><div className="bg-pink-600 h-1.5 rounded-full animate-pulse w-1/2" /></div>
                        </div>
                      )}
                      {hasAff && !affLoading && (
                        <div className="p-4 space-y-3">
                          <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                            {(affForUnit.affectiveTools || []).map((tool, ti) => {
                              const key = `aff-${selectedUnitIdx}-${ti}`;
                              const isOpen = expandedAff === key;
                          return (
                            <div key={ti}>
                              <button
                                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                                onClick={() => setExpandedAff(isOpen ? null : key)}
                              >
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="bg-pink-100 text-pink-800 text-xs font-bold px-2 py-0.5 rounded-full">{tool.type || 'แบบสังเกต'}</span>
                                  <span className="font-semibold text-sm text-gray-800">{tool.name}</span>
                                  <span className="text-xs text-gray-400">({(tool.items || []).length} รายการ | เต็ม {tool.maxScore} | ผ่าน {tool.passingScore})</span>
                                  {tool.evaluator && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tool.evaluator}</span>}
                                </div>
                                <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                              </button>
                              {isOpen && (
                                <div className="px-4 pb-4">
                                  <p className="text-xs text-gray-500 mb-1 italic">จุดประสงค์: {tool.objective}</p>
                                  <div className="overflow-x-auto rounded-lg border border-gray-200 mt-2">
                                    <table className="min-w-full text-xs">
                                      <thead className="bg-pink-700 text-white">
                                        <tr>
                                          <th className="px-2 py-2 text-center w-8">ที่</th>
                                          <th className="px-3 py-2 text-left">พฤติกรรมที่สังเกต</th>
                                          <th className="px-2 py-2 text-center">3<br/><span className="font-normal">(ดี)</span></th>
                                          <th className="px-2 py-2 text-center">2<br/><span className="font-normal">(พอใช้)</span></th>
                                          <th className="px-2 py-2 text-center">1<br/><span className="font-normal">(ปรับปรุง)</span></th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {(tool.items || []).map((item, ii) => (
                                          <tr key={ii} className="even:bg-gray-50">
                                            <td className="px-2 py-2 text-center text-gray-500">{item.no}</td>
                                            <td className="px-3 py-2 font-medium text-gray-800">{item.behavior}</td>
                                            <td className="px-2 py-2 text-gray-600 align-top">{item.score3}</td>
                                            <td className="px-2 py-2 text-gray-600 align-top">{item.score2}</td>
                                            <td className="px-2 py-2 text-gray-600 align-top">{item.score1}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded px-3 py-1.5 border border-gray-200">
                                    เกณฑ์ตัดสิน: {tool.scoringGuide}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
                }

                // ── Job Sheet Evaluation Type (แบบประเมินใบงาน) ──
                // อ่านใบงานจาก MediaModule (jobSheetStore) แล้วสร้างแบบประเมิน
                // 1 ชุดต่อ 1 ใบงาน เก็บใน jobSheetEvalStore
                if (isJobSheetType(toolName)) {
                  const evals = jobSheetEvalForUnit;
                  const sheetCount = jobSheetsForUnit.length;
                  const evalCount = evals.length;
                  const hasJsEval = evalCount > 0;
                  const isLoadingThis = jobSheetEvalLoading === selectedUnitIdx;
                  return (
                    <div key={toolIdx} className="mt-4 border border-rose-200 rounded-2xl overflow-hidden">
                      <div className="bg-rose-50 px-5 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-rose-900 flex items-center gap-2 text-sm">
                              <ClipboardList size={16} /> 9.3.{toolIdx + 1} {toolName}
                              <StatusBadge done={hasJsEval} />
                            </h3>
                            <p className="text-[10px] text-rose-500 mt-0.5">
                              {sheetCount > 0
                                ? `ใบงานจาก Module สื่อ: ${sheetCount} ใบ — สร้างแล้ว ${evalCount}/${sheetCount}`
                                : 'ยังไม่มีใบงานใน Module สื่อและแหล่งการเรียนรู้'}
                              {(criterion || method) && <span> | เกณฑ์: {criterion} | วิธี: {method}</span>}
                            </p>
                          </div>
                          <button
                            onClick={() => generateJobSheetEvalForUnit(selectedUnitIdx)}
                            disabled={isLoadingThis || sheetCount === 0}
                            className="bg-rose-600 text-white px-3 py-1.5 rounded-xl font-bold text-xs hover:bg-rose-700 disabled:opacity-60 flex items-center gap-1.5 shadow"
                            title={sheetCount === 0 ? 'ต้องมีใบงานในหน่วยนี้ก่อน' : `สร้างแบบประเมิน ${sheetCount} ชุด`}
                          >
                            {isLoadingThis ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                            {hasJsEval ? 'สร้างใหม่' : `สร้างแบบประเมิน (${sheetCount})`}
                          </button>
                        </div>
                      </div>
                      {isLoadingThis && (
                        <div className="px-5 py-3 bg-rose-50 border-t border-rose-100">
                          <div className="flex items-center gap-2 text-xs text-rose-700">
                            <Loader2 size={14} className="animate-spin shrink-0" />
                            <span>กำลังสร้างแบบประเมินใบงาน {sheetCount} ชุด...</span>
                          </div>
                          <div className="mt-1.5 bg-rose-200 rounded-full h-1.5"><div className="bg-rose-600 h-1.5 rounded-full animate-pulse w-1/2" /></div>
                        </div>
                      )}
                      {hasJsEval && !isLoadingThis && (
                        <div className="p-4 space-y-3">
                          <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                            {evals.map((ev, ei) => {
                              const key = `jse-${selectedUnitIdx}-${ei}`;
                              const isOpen = expandedTool === key;
                              return (
                                <div key={ei}>
                                  <button
                                    className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                                    onClick={() => setExpandedTool(isOpen ? null : key)}
                                  >
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <span className="bg-rose-100 text-rose-800 text-xs font-bold px-2 py-0.5 rounded-full">ใบงานที่ {ei + 1}</span>
                                      <span className="font-semibold text-sm text-gray-800">{ev.jobSheetTitle}</span>
                                      <span className="text-xs text-gray-400">({(ev.items || []).length} รายการ | เต็ม {ev.maxScore} | ผ่าน {ev.passingScore})</span>
                                    </div>
                                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                  </button>
                                  {isOpen && (
                                    <div className="px-4 pb-4">
                                      <p className="text-xs text-gray-500 mb-2 italic">{ev.purpose}</p>
                                      <div className="overflow-x-auto rounded-lg border border-gray-200 mt-2">
                                        <table className="min-w-full text-xs">
                                          <thead className="bg-rose-700 text-white">
                                            <tr>
                                              <th className="px-2 py-2 text-center w-8">ที่</th>
                                              <th className="px-3 py-2 text-left">รายการประเมิน</th>
                                              <th className="px-2 py-2 text-center">4<br/><span className="font-normal">(ดีมาก)</span></th>
                                              <th className="px-2 py-2 text-center">3<br/><span className="font-normal">(ดี)</span></th>
                                              <th className="px-2 py-2 text-center">2<br/><span className="font-normal">(พอใช้)</span></th>
                                              <th className="px-2 py-2 text-center">1<br/><span className="font-normal">(ปรับปรุง)</span></th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-100">
                                            {(ev.items || []).map((itm, ii) => (
                                              <tr key={ii} className="even:bg-gray-50">
                                                <td className="px-2 py-2 text-center text-gray-500">{itm.no}</td>
                                                <td className="px-3 py-2 font-medium text-gray-800">{itm.description}</td>
                                                <td className="px-2 py-2 text-gray-600 align-top">{itm.score4}</td>
                                                <td className="px-2 py-2 text-gray-600 align-top">{itm.score3}</td>
                                                <td className="px-2 py-2 text-gray-600 align-top">{itm.score2}</td>
                                                <td className="px-2 py-2 text-gray-600 align-top">{itm.score1}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                      <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded px-3 py-1.5 border border-gray-200">
                                        เกณฑ์ตัดสิน: {ev.scoringGuide}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // ── Tool Type (Rubric, Checklist, etc.) ──
                const currentToolTypeIdx = toolTypeCounter++;
                const matchedTool = toolsForUnit?.tools?.[currentToolTypeIdx];
                const hasThisTool = !!matchedTool;
                const hasAnyTools = !!toolsForUnit && (toolsForUnit.tools || []).length > 0;

                return (
                  <div key={toolIdx} className="mt-4 border border-indigo-200 rounded-2xl overflow-hidden">
                    <div className="bg-indigo-50 px-5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-indigo-900 flex items-center gap-2 text-sm">
                            <ClipboardList size={16} /> 9.3.{toolIdx + 1} {toolName}
                            <StatusBadge done={hasThisTool} />
                          </h3>
                          <p className="text-[10px] text-indigo-500 mt-0.5">เกณฑ์: {criterion} | วิธี: {method}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {hasAnyTools && (
                            <>
                              <button onClick={() => exportToolsWordForUnit(selectedUnitIdx)} className="flex items-center gap-1 text-[10px] text-blue-700 border border-blue-300 px-2 py-1 rounded-lg hover:bg-blue-50"><FileDown size={10} /> Word</button>
                              <button onClick={() => exportToolsPdfForUnit(selectedUnitIdx)} className="flex items-center gap-1 text-[10px] text-red-700 border border-red-300 px-2 py-1 rounded-lg hover:bg-red-50"><FileDown size={10} /> PDF</button>
                            </>
                          )}
                          <button onClick={() => generateToolsForUnit(selectedUnitIdx)} disabled={toolsLoading}
                            className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl font-bold text-xs hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5 shadow">
                            {toolsLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                            {hasAnyTools ? 'สร้างใหม่' : 'สร้างเครื่องมือ'}
                          </button>
                        </div>
                      </div>
                    </div>
                    {toolsLoading && !hasAnyTools && (
                      <div className="px-5 py-3 bg-indigo-50 border-t border-indigo-100">
                        <div className="flex items-center gap-2 text-xs text-indigo-700"><Loader2 size={14} className="animate-spin shrink-0" /><span>{toolsProgress || 'กำลังสร้าง...'}</span></div>
                        <div className="mt-1.5 bg-indigo-200 rounded-full h-1.5"><div className="bg-indigo-600 h-1.5 rounded-full animate-pulse w-1/2" /></div>
                      </div>
                    )}
                    {hasThisTool && !toolsLoading && (() => {
                      const tool = matchedTool;
                      const key = `${selectedUnitIdx}-tool-${currentToolTypeIdx}`;
                      const isOpen = expandedTool === key;
                      const isTest = tool.type?.includes('แบบทดสอบ');
                      return (
                        <div className="p-4">
                          <button className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 border border-gray-200 rounded-xl"
                            onClick={() => setExpandedTool(isOpen ? null : key)}>
                            <div className="flex items-center gap-3">
                              <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-0.5 rounded-full">{tool.type}</span>
                              <span className="font-semibold text-sm text-gray-800">{tool.name}</span>
                              <span className="text-xs text-gray-400">({(tool.items || []).length} รายการ | เต็ม {tool.maxScore} | ผ่าน {tool.passingScore})</span>
                            </div>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="px-4 pb-2 pt-3">
                              <p className="text-xs text-gray-500 mb-3 italic">{tool.purpose}</p>
                              <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="min-w-full text-xs">
                                  <thead className="bg-indigo-700 text-white">
                                    {isTest ? (
                                      <tr><th className="px-2 py-2 text-center w-8">ที่</th><th className="px-3 py-2 text-left">รายการ/ข้อสอบ</th><th className="px-2 py-2 text-center w-20">คะแนน</th></tr>
                                    ) : (
                                      <tr><th className="px-2 py-2 text-center w-8">ที่</th><th className="px-3 py-2 text-left">รายการประเมิน</th><th className="px-2 py-2 text-center">4<br/><span className="font-normal">(ดีมาก)</span></th><th className="px-2 py-2 text-center">3<br/><span className="font-normal">(ดี)</span></th><th className="px-2 py-2 text-center">2<br/><span className="font-normal">(พอใช้)</span></th><th className="px-2 py-2 text-center">1<br/><span className="font-normal">(ปรับปรุง)</span></th></tr>
                                    )}
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {(tool.items || []).map((itm, ii) => (
                                      <tr key={ii} className="even:bg-gray-50">
                                        <td className="px-2 py-2 text-center text-gray-500">{itm.no}</td>
                                        <td className="px-3 py-2 font-medium text-gray-800">{itm.description}</td>
                                        {isTest ? (
                                          <td className="px-2 py-2 text-center text-gray-600">{itm.score4 || ''}</td>
                                        ) : (
                                          <><td className="px-2 py-2 text-gray-600 align-top">{itm.score4}</td><td className="px-2 py-2 text-gray-600 align-top">{itm.score3}</td><td className="px-2 py-2 text-gray-600 align-top">{itm.score2}</td><td className="px-2 py-2 text-gray-600 align-top">{itm.score1}</td></>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded px-3 py-1.5 border border-gray-200">เกณฑ์ตัดสิน: {tool.scoringGuide}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              });
            })()}

            {/* Export all tools (if multiple units generated) */}
            {(toolsData || []).length > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2">
                <span className="text-xs text-gray-500">ส่งออกเครื่องมือทุกหน่วยที่สร้างแล้ว ({(toolsData || []).length} หน่วย):</span>
                <button onClick={exportAllToolsWord} className="flex items-center gap-1 text-xs text-blue-700 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                  <FileDown size={12} /> Word ทุกหน่วย
                </button>
                <button onClick={exportAllToolsPdf} className="flex items-center gap-1 text-xs text-red-700 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50">
                  <FileDown size={12} /> PDF ทุกหน่วย
                </button>
              </div>
            )}

            {/* Navigate to download page */}
            <div className="mt-8 text-center bg-gray-50 p-5 rounded-xl border border-gray-200">
              <button onClick={() => onNavigate?.('download')}
                className="px-8 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 mx-auto bg-green-600 text-white hover:bg-green-700 transition">
                ไปหน้าดาวน์โหลด <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssessmentModule;
