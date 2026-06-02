import React, { useState } from 'react';
import { Target, CheckCircle, Sparkles, Loader2, Check, RefreshCw, ArrowRight, Upload, FileText, Table as TableIcon, Pencil, Save, X } from 'lucide-react';
import FileUploadZone from '../common/FileUploadZone';
import ExportButtons from '../common/ExportButtons';
import { useFileUpload, buildFileParts } from '../../hooks/useFileUpload';
import { useAiApi } from '../../hooks/useAiApi';
import { SYSTEM_PROMPT_LO } from '../../constants/prompts';
import { printToPdf, createWordDoc } from '../../utils/exportHelpers';

const LearningOutcomesModule = ({
  providerId, apiKey,
  unitDivisionPlan, generatedPlan,
  loResults, setLoResults,
  formData, onError, onNavigate,
  triggerDownload,
  onRegenerate,
}) => {
  const dl = triggerDownload || ((fn) => fn());
  const hasPreviousData = !!(unitDivisionPlan && generatedPlan);
  const { file: unitsFile, handleUpload: handleUnitsUpload } = useFileUpload({ onError });
  const { file: analysisFile, handleUpload: handleAnalysisUpload } = useFileUpload({ onError });
  const { callApi, loading, loadingText } = useAiApi(providerId, apiKey);

  const generate = async () => {
    if (!hasPreviousData && (!unitsFile || !analysisFile)) {
      onError('กรุณาแนบไฟล์ทั้ง 2 ไฟล์ (ตารางหน่วยการเรียนรู้ และ ตารางวิเคราะห์งาน) ให้ครบถ้วนค่ะ');
      return;
    }
    if (onRegenerate) onRegenerate();
    try {
      let parts = [{ text: SYSTEM_PROMPT_LO }];
      if (hasPreviousData && !unitsFile) {
        parts.push({ text: `\n\n--- Content 1: ตารางหน่วยการเรียนรู้ ---\n${unitDivisionPlan}` });
        parts.push({ text: `\n\n--- Content 2: ตารางวิเคราะห์งาน ---\n${generatedPlan}` });
      } else {
        parts.push(...buildFileParts(unitsFile, 'ตารางหน่วยการเรียนรู้'));
        parts.push(...buildFileParts(analysisFile, 'ตารางวิเคราะห์งาน'));
      }
      const data = await callApi(parts, { json: true, moduleName: 'learningOutcomes', statusText: 'กำลังวิเคราะห์เนื้อหาและเขียนผลลัพธ์การเรียนรู้...' });
      const { ensureSchema } = await import('../../utils/aiResponseValidator');
      const validated = ensureSchema(data, 'learningOutcomes', { arrayKey: 'units' });
      setLoResults(validated.units);
    } catch (err) {
      console.error('LO Error:', err);
      onError(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถวิเคราะห์ไฟล์ได้'}`);
    }
  };

  // ── Inline editing ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(null);

  const startEdit = () => {
    setEditData(JSON.parse(JSON.stringify(loResults)));
    setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setEditData(null); };
  const saveEdit = () => {
    setLoResults(editData);
    setEditing(false);
    setEditData(null);
  };
  const updateEditField = (idx, field, value) => {
    setEditData(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const _doExportWord = async () => {
    if (!loResults) return;
    try {
      const { generateLoDocx } = await import('../../utils/docxTemplateExport');
      await generateLoDocx({ loResults, courseCode: formData.courseCode });
    } catch (err) {
      console.error('LO docx export error:', err);
      // Fallback to HTML .doc
      const rows = loResults.map((item, idx) => `<tr><td style="text-align:center;">${idx + 1}</td><td>${item.unitName}</td><td>${item.outcome}</td></tr>`).join('');
      createWordDoc(`ผลลัพธ์การเรียนรู้_${formData.courseCode}`, `<table><thead><tr><th width="10%">ที่</th><th width="30%">หน่วยการเรียนรู้</th><th>ผลลัพธ์การเรียนรู้ (Unit Learning Outcome)</th></tr></thead><tbody>${rows}</tbody></table>`);
    }
  };
  const _meta = { module: 'ผลลัพธ์การเรียนรู้', courseCode: formData.courseCode || '', courseName: formData.courseName || '' };
  const exportWord = () => dl(_doExportWord, _meta);
  const _doExportPdf = () => {
    if (!loResults) return;
    const rows = loResults.map((item, idx) => `<tr><td class="text-center">${idx + 1}</td><td>${item.unitName}</td><td>${item.outcome}</td></tr>`).join('');
    printToPdf(`ผลลัพธ์การเรียนรู้ประจำหน่วย ${formData.courseCode}`, `<table><thead><tr><th width="10%">ที่</th><th width="30%">หน่วยการเรียนรู้</th><th>ผลลัพธ์การเรียนรู้</th></tr></thead><tbody>${rows}</tbody></table>`);
  };
  const exportPdf = () => dl(_doExportPdf, _meta);

  return (
    <div className="pnp-shell-card rounded-xl p-5 md:p-6 min-h-[80vh]">
      <div className="mb-6 border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Target className="text-blue-600" /> ผลลัพธ์การเรียนรู้ประจำหน่วยการเรียน</h2>
        <p className="text-gray-500 text-sm mt-1">ผลลัพธ์นอกห้องเรียนที่เกิดจากการนำความรู้ ทักษะ ประสบการณ์ในห้องเรียน ไปประยุกต์ใช้ในชีวิตประจำวัน หรืองานอาชีพ</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left panel */}
        <div className="md:col-span-1 space-y-4">
          {hasPreviousData ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <div className="bg-white p-3 rounded-full shadow-sm mb-3 mx-auto w-fit text-green-600"><CheckCircle size={32} /></div>
              <h3 className="text-green-800 font-bold text-lg mb-2">ข้อมูลพร้อมใช้งาน!</h3>
              <p className="text-green-700 text-sm mb-4">รับข้อมูลอัตโนมัติจาก Module 1</p>
              <button onClick={generate} disabled={loading} className="pnp-action-success py-3">
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />} สร้างผลลัพธ์การเรียนรู้ทันที
              </button>
            </div>
          ) : (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center mb-4"><p className="text-sm text-gray-500 font-medium">Mode 2: Upload ข้อมูลด้วยตนเอง</p></div>
              <FileUploadZone file={unitsFile} onUpload={handleUnitsUpload} label="1. แนบตารางหน่วยการเรียนรู้" height="h-32" />
              <FileUploadZone file={analysisFile} onUpload={handleAnalysisUpload} label="2. แนบตารางวิเคราะห์งาน" borderColor="border-purple-300" bgColor="bg-purple-50" hoverBg="hover:bg-purple-100" height="h-32" />
              <button onClick={generate} disabled={loading || !unitsFile || !analysisFile} className={`w-full py-2.5 rounded-lg font-semibold transition shadow-sm flex items-center justify-center gap-2 ${!unitsFile || !analysisFile ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-700 text-white hover:bg-blue-800'}`}>
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />} สร้างผลลัพธ์การเรียนรู้
              </button>
            </>
          )}
        </div>

        {/* Right panel */}
        <div className="md:col-span-2">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 min-h-[300px] border-2 border-gray-100 rounded-xl border-dashed">
              <Loader2 className="w-10 h-10 animate-spin text-blue-300 mb-3" /><p>{loadingText}</p>
            </div>
          ) : loResults ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200 gap-3">
                <div className="flex items-center gap-2 text-green-800 text-sm font-medium"><Check size={16} /> วิเคราะห์เสร็จสิ้น! พบ {loResults.length} หน่วย</div>
                <div className="flex items-center gap-2">
                  {!editing ? (
                    <button onClick={startEdit} className="flex items-center gap-1 text-xs text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-50"><Pencil size={12} /> แก้ไข</button>
                  ) : (
                    <>
                      <button onClick={saveEdit} className="flex items-center gap-1 text-xs text-green-700 border border-green-400 px-3 py-1.5 rounded-lg hover:bg-green-50 font-bold"><Save size={12} /> บันทึก</button>
                      <button onClick={cancelEdit} className="flex items-center gap-1 text-xs text-red-600 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50"><X size={12} /> ยกเลิก</button>
                    </>
                  )}
                  <ExportButtons onRegenerate={generate} onExportWord={exportWord} onExportPdf={exportPdf} regenerateLabel="สร้างใหม่อีกรอบ (Regenerate)" />
                </div>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-sm font-bold text-gray-700 w-1/3">หน่วยการเรียนรู้</th><th className="px-4 py-3 text-left text-sm font-bold text-gray-700">ผลลัพธ์การเรียนรู้</th></tr></thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(editing ? editData : loResults).map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 align-top">
                          {editing ? <input type="text" value={item.unitName} onChange={(e) => updateEditField(idx, 'unitName', e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" /> : item.unitName}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 align-top leading-relaxed">
                          {editing ? <textarea value={item.outcome} onChange={(e) => updateEditField(idx, 'outcome', e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm min-h-[80px]" /> : item.outcome}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-8 text-center bg-gray-50 p-6 rounded-xl border border-gray-200">
                <h4 className="text-gray-700 font-bold mb-3">ขั้นตอนต่อไป</h4>
                <button onClick={() => onNavigate('competencies')} className="pnp-action-inline px-8 py-3 mx-auto">
                  ไปขั้นตอนต่อไป: สมรรถนะประจำหน่วย (Module 3) <ArrowRight size={20} />
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 min-h-[300px] border-2 border-gray-100 rounded-xl border-dashed bg-gray-50">
              <TableIcon className="w-12 h-12 mb-2 opacity-20" /><p className="text-sm">ผลลัพธ์การวิเคราะห์จะแสดงที่นี่</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LearningOutcomesModule;
