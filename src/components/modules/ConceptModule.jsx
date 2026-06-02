import React, { useState } from 'react';
import { Lightbulb, CheckCircle, Sparkles, Loader2, Check, ChevronLeft, ChevronRight, ArrowRight, Pencil, Save, X } from 'lucide-react';
import FileUploadZone from '../common/FileUploadZone';
import ExportButtons from '../common/ExportButtons';
import { useFileUpload, buildFileParts } from '../../hooks/useFileUpload';
import { useAiApi } from '../../hooks/useAiApi';
import { SYSTEM_PROMPT_CONCEPT } from '../../constants/prompts';
import { printToPdf, createWordDoc } from '../../utils/exportHelpers';
import { generateDocxFromTemplate, buildTemplateData, generateContentDocx } from '../../utils/docxTemplateExport';
import { parseUnitTable } from '../../utils/markdownTable';

const STEPS = ['หลักสูตรรายวิชา', 'ผลการวิเคราะห์งาน', 'หน่วยการเรียนรู้', 'ผลลัพธ์การเรียนรู้', 'สมรรถนะประจำหน่วย', 'จุดประสงค์เชิงพฤติกรรม'];
const FILE_KEYS = ['syllabus', 'analysis', 'units', 'outcomes', 'competencies', 'objectives'];

const ConceptModule = ({
  providerId, apiKey,
  formData, generatedPlan, unitDivisionPlan, loResults, compResults, objResults,
  conceptResults, setConceptResults,
  onError, onNavigate, triggerDownload,
  onRegenerate,
}) => {
  // Fallback: if triggerDownload is not provided, just call the function directly
  const dl = triggerDownload || ((fn) => fn());
  const hasInternal = !!(formData.courseCode && generatedPlan && unitDivisionPlan && loResults && compResults && objResults);
  const [conceptStep, setConceptStep] = useState(1);
  const [displayMode, setDisplayMode] = useState('list'); // 'list' or 'paragraph'
  const { callApi, loading } = useAiApi(providerId, apiKey);

  // 6 file upload hooks for manual mode
  const fileHooks = FILE_KEYS.map(() => useFileUpload({ onError }));

  const getExistingData = (s) => {
    const checks = [formData.courseCode, generatedPlan, unitDivisionPlan, loResults, compResults, objResults];
    return checks[s - 1] ? 'มีข้อมูลในระบบแล้ว' : null;
  };

  const generate = async (isRegenerate = false) => {
    if (onRegenerate) onRegenerate();
    if (isRegenerate) setConceptResults(null);
    try {
      let parts = [{ text: SYSTEM_PROMPT_CONCEPT }];
      if (hasInternal && !fileHooks[0].file) {
        parts.push({ text: `\n\n--- 1. Course Syllabus ---\n${JSON.stringify(formData)}` });
        parts.push({ text: `\n\n--- 2. Job Analysis ---\n${generatedPlan}` });
        parts.push({ text: `\n\n--- 3. Learning Units ---\n${unitDivisionPlan}` });
        parts.push({ text: `\n\n--- 4. Outcomes ---\n${JSON.stringify(loResults)}` });
        parts.push({ text: `\n\n--- 5. Competencies ---\n${JSON.stringify(compResults)}` });
        parts.push({ text: `\n\n--- 6. Objectives ---\n${JSON.stringify(objResults)}` });
      } else {
        STEPS.forEach((label, i) => {
          parts.push(...buildFileParts(fileHooks[i].file, `${i + 1}. ${label}`));
        });
      }
      const data = await callApi(parts, { json: true, moduleName: 'concept', statusText: 'กำลังวิเคราะห์และสรุปสาระการเรียนรู้ประจำหน่วย...' });
      const { ensureSchema } = await import('../../utils/aiResponseValidator');
      const validated = ensureSchema(data, 'concept', { arrayKey: 'units' });
      setConceptResults(validated.units);
    } catch (err) {
      console.error('Concept Error:', err);
      onError(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถสร้างสาระการเรียนรู้ได้'}`);
    }
  };

  // ── Inline editing ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(null);

  const startEdit = () => {
    // Normalize concept to array of lines for editing
    const normalized = conceptResults.map(item => {
      let lines = [];
      if (Array.isArray(item.concept)) {
        lines = item.concept.map(c => String(c).trim()).filter(Boolean);
      } else if (typeof item.concept === 'string') {
        lines = item.concept.replace(/<br\s*\/?>/gi, '\n').split('\n').map(l => l.trim()).filter(Boolean);
      }
      if (lines.length === 0) lines = [String(item.concept || '')];
      return { ...item, concept: lines };
    });
    setEditData(JSON.parse(JSON.stringify(normalized)));
    setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setEditData(null); };
  const saveEdit = () => {
    setConceptResults(editData);
    setEditing(false);
    setEditData(null);
  };
  const updateEditConcept = (unitIdx, lineIdx, value) => {
    setEditData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      const lines = [...item.concept];
      lines[lineIdx] = value;
      return { ...item, concept: lines };
    }));
  };
  const addEditConcept = (unitIdx) => {
    setEditData(prev => prev.map((item, i) => i === unitIdx ? { ...item, concept: [...item.concept, ''] } : item));
  };
  const removeEditConcept = (unitIdx, lineIdx) => {
    setEditData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      return { ...item, concept: item.concept.filter((_, ci) => ci !== lineIdx) };
    }));
  };

  // Normalize concept (array or string) → clean array of lines WITHOUT leading "1. "/"2) "/"- " prefix
  const normalizeConceptLines = (concept) => {
    let lines = [];
    if (Array.isArray(concept)) {
      lines = concept.map(c => String(c || '').trim()).filter(Boolean);
    } else if (typeof concept === 'string') {
      lines = concept
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/(?<!\n)\s*(?=\d+[\.\)]\s)/g, '\n')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
    }
    return lines
      .map(l => String(l)
        .replace(/\*\*/g, '')
        .replace(/^\s*\d+[\.\)]\s*/, '')
        .replace(/^[-•]\s*/, '')
        .trim())
      .filter(Boolean);
  };

  // Format concept content based on display mode (used by PDF export + editor fallback)
  const formatConceptHtml = (concept) => {
    const lines = normalizeConceptLines(concept);
    if (lines.length === 0) return `<p>-</p>`;

    if (displayMode === 'list') {
      return `<ol style="margin:0;padding-left:20px;">${lines.map(l => `<li>${l}</li>`).join('')}</ol>`;
    } else {
      // ความเรียง: ไม่มีเลข, เว้นวรรคระหว่างข้อ (double space)
      return `<p style="text-indent:1cm;">${lines.join('  ')}</p>`;
    }
  };

  const _doExportWord = async () => {
    if (!conceptResults) return;
    try {
      await generateContentDocx({
        conceptResults,
        courseCode: formData.courseCode,
        displayMode,
      });
    } catch (err) {
      console.error('[ConceptModule] Export Word error:', err);
      onError?.(`ไม่สามารถสร้างไฟล์ Word ได้: ${err.message || ''}`);
    }
  };
  const _metaConcept = { module: 'สาระการเรียนรู้', courseCode: formData.courseCode || '', courseName: formData.courseName || '' };
  const _metaSummary = { module: 'สรุปรายวิชา', courseCode: formData.courseCode || '', courseName: formData.courseName || '' };
  const exportWord = () => dl(_doExportWord, _metaConcept);

  const _doExportPdf = () => {
    if (!conceptResults) return;
    const rows = conceptResults.map((item, idx) => `<tr><td class="text-center">${idx + 1}</td><td>${item.unitName}</td><td>${formatConceptHtml(item.concept)}</td></tr>`).join('');
    printToPdf(`สาระการเรียนรู้ ${formData.courseCode}`, `<table><thead><tr><th width="10%">ที่</th><th width="30%">หน่วยการเรียนรู้</th><th>สาระการเรียนรู้ (Key Concept)</th></tr></thead><tbody>${rows}</tbody></table>`);
  };
  const exportPdf = () => dl(_doExportPdf, _metaConcept);

  // --- Full Syllabus Export ---
  const mergeDataForExport = () => {
    // Use conceptResults as primary source (always available at this point)
    const source = conceptResults || loResults || [];
    if (source.length === 0) return [];
    return source.map((item, index) => ({
      unitName: item.unitName || loResults?.[index]?.unitName || `หน่วยที่ ${index + 1}`,
      outcome: loResults?.[index]?.outcome || '-',
      competencies: compResults?.[index]?.competencies || [],
      objectives: objResults?.[index] || { cognitive: [], psychomotor: [], affective: [], application: [] },
      concept: conceptResults?.[index]?.concept || item.concept || '-',
    }));
  };

  // --- Build unit plan HTML matching แผนรายหน่วย.docx template exactly ---
  const buildUnitPlanHtml = (allUnits) => {
    const fd = formData;
    // Style matching original docx: TH Sarabun New 16pt
    const S = 'font-family:"TH Sarabun New",sans-serif;font-size:16pt;';
    const SB = S + 'font-weight:bold;';
    const indent = `style="${S}margin-left:1cm;"`;
    const indent05 = `style="${S}margin-left:0.5cm;"`;
    const dots = '………………………………………………………………………………………………………';

    const renderList = (list) => {
      if (!list?.length) return `<p ${indent}>${dots}</p>`;
      return list.map((item) => `<p ${indent}>${item}</p>`).join('');
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
${renderList(unit.competencies)}

<p style="${SB}">4. จุดประสงค์เชิงพฤติกรรม</p>
<p ${indent05}><b style="${S}">4.1 พุทธิพิสัย</b></p>
${renderList(unit.objectives?.cognitive)}
<p ${indent05}><b style="${S}">4.2 ทักษะพิสัย</b></p>
${renderList(unit.objectives?.psychomotor)}
<p ${indent05}><b style="${S}">4.3 จิตพิสัย</b></p>
${renderList(unit.objectives?.affective)}
<p ${indent05}><b style="${S}">4.4 ความสามารถประยุกต์ใช้และรับผิดชอบ</b></p>
${renderList(unit.objectives?.application)}

<p style="${SB}">5. สาระการเรียนรู้</p>
${renderConcept(unit.concept)}

<p style="${SB}">6. กิจกรรมการเรียนรู้</p>
<p ${indent}>${dots}</p>

<p style="${SB}">7. สื่อและแหล่งการเรียนรู้</p>
<p ${indent}>${dots}</p>

<p style="${SB}">8. หลักฐานการเรียนรู้</p>
<p ${indent05}>8.1 หลักฐานความรู้</p>
<p ${indent}>${dots}</p>
<p ${indent05}>8.2 หลักฐานการปฏิบัติงาน</p>
<p ${indent}>${dots}</p>

<p style="${SB}">9. การวัดและประเมินผล</p>
<p ${indent05}>9.1 เกณฑ์การปฏิบัติงาน</p>
<p ${indent}>${dots}</p>
<p ${indent05}>9.2 วิธีการประเมิน</p>
<p ${indent}>${dots}</p>
<p ${indent05}>9.3 เครื่องมือประเมิน</p>
<p ${indent}>${dots}</p>

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
    if (!loResults?.length) {
      onError?.('ไม่พบข้อมูลสำหรับสร้างเอกสาร กรุณาตรวจสอบว่าได้สร้างข้อมูลครบทุกขั้นตอนแล้ว');
      return;
    }

    // Parse unit table for time data
    const units = unitDivisionPlan ? parseUnitTable(unitDivisionPlan) : [];

    // Generate one docx per unit using Template.docx
    for (let i = 0; i < loResults.length; i++) {
      try {
        const data = buildTemplateData({
          formData, loResults, compResults, objResults, conceptResults, units,
          unitIndex: i,
        });
        await generateDocxFromTemplate(data, `แผนรายหน่วย_${formData.courseCode || ''}_หน่วยที่${i + 1}`);
        // Small delay between downloads
        if (i < loResults.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        console.error(`[ConceptModule] Export unit ${i + 1} error:`, err);
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
      console.error('[ConceptModule] Export PDF error:', err);
      onError?.(`เกิดข้อผิดพลาดในการสร้าง PDF: ${err.message}`);
    }
  };
  const exportSummaryPdf = () => dl(_doExportSummaryPdf, _metaSummary);

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 min-h-[80vh]">
      <div className="mb-6 border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Lightbulb className="text-blue-600" /> สาระการเรียนรู้ (Key Concepts)</h2>
        <p className="text-gray-500 text-sm mt-1">สรุปสาระการเรียนรู้ของแต่ละหน่วยจากข้อมูลที่วิเคราะห์มาทั้งหมด</p>
      </div>

      {loading && !conceptResults ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <p className="text-lg font-medium text-gray-700 animate-pulse">กำลังวิเคราะห์และสรุปสาระการเรียนรู้ประจำหน่วย...</p>
        </div>
      ) : !conceptResults ? (
        <div className="max-w-2xl mx-auto">
          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between text-xs font-medium text-gray-500 mb-2"><span>Start</span><span>Step {conceptStep} of 6</span><span>Finish</span></div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(conceptStep / 6) * 100}%` }} />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="bg-blue-100 text-blue-700 w-8 h-8 rounded-full flex items-center justify-center text-sm">{conceptStep}</span>
              {STEPS[conceptStep - 1]}
            </h3>
            {getExistingData(conceptStep) && (
              <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg flex items-center gap-2 mb-4 text-sm">
                <CheckCircle size={18} /> {getExistingData(conceptStep)} (กดถัดไปได้เลย หรือจะแนบไฟล์ใหม่ก็ได้)
              </div>
            )}
            <FileUploadZone file={fileHooks[conceptStep - 1].file} onUpload={fileHooks[conceptStep - 1].handleUpload} label="คลิกเพื่อแนบไฟล์เอกสาร" height="h-48" />
          </div>

          <div className="flex justify-between mt-6">
            <button onClick={() => setConceptStep((p) => Math.max(1, p - 1))} disabled={conceptStep === 1} className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 flex items-center gap-1"><ChevronLeft size={18} /> ย้อนกลับ</button>
            {conceptStep < 6 ? (
              <button onClick={() => setConceptStep((p) => p + 1)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1 shadow-md">ถัดไป <ChevronRight size={18} /></button>
            ) : (
              <button onClick={generate} disabled={loading} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 shadow-md">
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} วิเคราะห์และสร้างสาระการเรียนรู้
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200 mb-4">
            <div className="flex items-center gap-2 text-green-800 text-sm"><Check size={16} /> สร้างสาระการเรียนรู้สำเร็จ!</div>
            <div className="flex items-center gap-2">
              {!editing ? (
                <button onClick={startEdit} className="flex items-center gap-1 text-xs text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-50"><Pencil size={12} /> แก้ไข</button>
              ) : (
                <>
                  <button onClick={saveEdit} className="flex items-center gap-1 text-xs text-green-700 border border-green-400 px-3 py-1.5 rounded-lg hover:bg-green-50 font-bold"><Save size={12} /> บันทึก</button>
                  <button onClick={cancelEdit} className="flex items-center gap-1 text-xs text-red-600 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50"><X size={12} /> ยกเลิก</button>
                </>
              )}
              <ExportButtons onRegenerate={() => generate(true)} onExportWord={exportWord} onExportPdf={exportPdf} />
            </div>
          </div>

          {/* Display mode toggle */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500 font-medium">รูปแบบการแสดงผล:</span>
            <button
              onClick={() => setDisplayMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${displayMode === 'list' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            >
              📋 แสดงเป็นข้อ
            </button>
            <button
              onClick={() => setDisplayMode('paragraph')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${displayMode === 'paragraph' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            >
              📄 แสดงเป็นความเรียง
            </button>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-sm font-bold text-gray-700 w-1/4">ชื่อหน่วย</th><th className="px-4 py-3 text-left text-sm font-bold text-gray-700">สาระการเรียนรู้ (Key Concept)</th></tr></thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(editing ? editData : conceptResults).map((item, idx) => {
                  // Normalize concept to clean array of lines (no leading numbers/bullets)
                  const lines = normalizeConceptLines(item.concept);
                  const displayLines = lines.length > 0 ? lines : ['-'];

                  return (
                    <tr key={idx}>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900 align-top">{item.unitName}</td>
                      <td className="px-4 py-4 text-sm text-gray-600 align-top leading-relaxed">
                        {editing ? (
                          <div className="space-y-1">
                            {(item.concept || []).map((line, i) => (
                              <div key={i} className="flex gap-1 items-start">
                                <span className="text-xs text-gray-400 mt-2 min-w-[20px]">{i + 1}.</span>
                                <textarea value={line} onChange={(e) => updateEditConcept(idx, i, e.target.value)} className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm min-h-[36px]" />
                                <button onClick={() => removeEditConcept(idx, i)} className="text-red-400 hover:text-red-600 mt-1"><X size={14} /></button>
                              </div>
                            ))}
                            <button onClick={() => addEditConcept(idx)} className="text-xs text-blue-600 hover:underline">+ เพิ่มเนื้อหา</button>
                          </div>
                        ) : displayMode === 'list' ? (
                          <ol className="list-decimal pl-5 space-y-1">
                            {displayLines.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ol>
                        ) : (
                          <p className="indent-8 leading-loose">{displayLines.join('  ')}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Next step navigation */}
          <div className="mt-8 text-center bg-gray-50 p-6 rounded-xl border border-gray-200">
            <h4 className="text-gray-700 font-bold mb-3">ขั้นตอนต่อไป</h4>
            <button onClick={() => onNavigate('behavior_table')} className="bg-amber-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-amber-700 shadow-lg flex items-center gap-2 mx-auto animate-bounce">
              ไปขั้นตอนต่อไป: ตารางวิเคราะห์พฤติกรรม <ArrowRight size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConceptModule;
