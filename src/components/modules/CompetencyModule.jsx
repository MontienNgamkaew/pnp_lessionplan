import React, { useState, useEffect } from 'react';
import { Zap, CheckCircle, Sparkles, Loader2, Check, ArrowRight, Pencil, Save, X } from 'lucide-react';
import FileUploadZone from '../common/FileUploadZone';
import ExportButtons from '../common/ExportButtons';
import { useFileUpload, buildFileParts } from '../../hooks/useFileUpload';
import { useAiApi } from '../../hooks/useAiApi';
import { SYSTEM_PROMPT_COMPETENCY } from '../../constants/prompts';
import { printToPdf, createWordDoc } from '../../utils/exportHelpers';

const CompetencyModule = ({
  providerId, apiKey,
  loResults, unitDivisionPlan,
  compResults, setCompResults,
  formData, onError, onNavigate,
  triggerDownload,
  onRegenerate,
}) => {
  const dl = triggerDownload || ((fn) => fn());
  const hasPreviousData = !!(loResults && unitDivisionPlan);
  const [selectedLevel, setSelectedLevel] = useState('ปวช.');
  const uploadHook = useFileUpload({ onError });
  const compFile = uploadHook.file;
  const handleCompUpload = uploadHook.handleUpload;

  let callApi, loading, loadingText;
  try {
    const api = useAiApi(providerId, apiKey);
    callApi = api.callApi;
    loading = api.loading;
    loadingText = api.loadingText;
  } catch (err) {
    console.error('useAiApi init error:', err);
    callApi = null;
    loading = false;
    loadingText = '';
  }

  useEffect(() => {
    if (formData?.courseCode) {
      setSelectedLevel(formData.courseCode.startsWith('3') ? 'ปวส.' : 'ปวช.');
    }
  }, [formData?.courseCode]);

  const generate = async () => {
    if (!hasPreviousData && !compFile) {
      onError('กรุณาแนบไฟล์รายละเอียดหน่วยการเรียนรู้ก่อนค่ะ');
      return;
    }
    if (!callApi) {
      onError('กรุณาตั้งค่า API Key ก่อนใช้งาน');
      return;
    }
    if (onRegenerate) onRegenerate();
    try {
      const parts = [{ text: SYSTEM_PROMPT_COMPETENCY(selectedLevel) }];
      if (hasPreviousData && !compFile) {
        const unitsText = loResults.map((u) => `Unit: ${u.unitName}\nOutcome: ${u.outcome}`).join('\n\n');
        parts.push({ text: `\n\n--- ข้อมูลหน่วยและผลลัพธ์การเรียนรู้ ---\n${unitsText}` });
      } else {
        parts.push(...buildFileParts(compFile, compFile.name));
      }
      const data = await callApi(parts, {
        json: true,
        moduleName: 'competency',
        statusText: `กำลังวิเคราะห์และเขียนสมรรถนะประจำหน่วย (${selectedLevel})...`,
      });
      const { ensureSchema } = await import('../../utils/aiResponseValidator');
      const validated = ensureSchema(data, 'competency', { arrayKey: 'units' });
      setCompResults(validated.units);
    } catch (err) {
      console.error('Competency generation error:', err);
      onError(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถวิเคราะห์ไฟล์ได้'}`);
    }
  };

  // ── Inline editing ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(null);

  const startEdit = () => {
    setEditData(JSON.parse(JSON.stringify(compResults)));
    setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setEditData(null); };
  const saveEdit = () => {
    setCompResults(editData);
    setEditing(false);
    setEditData(null);
  };
  const updateEditComp = (unitIdx, compIdx, value) => {
    setEditData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      const comps = [...(item.competencies || [])];
      comps[compIdx] = value;
      return { ...item, competencies: comps };
    }));
  };
  const addEditComp = (unitIdx) => {
    setEditData(prev => prev.map((item, i) => i === unitIdx ? { ...item, competencies: [...(item.competencies || []), ''] } : item));
  };
  const removeEditComp = (unitIdx, compIdx) => {
    setEditData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      return { ...item, competencies: (item.competencies || []).filter((_, ci) => ci !== compIdx) };
    }));
  };

  const _doExportWord = async () => {
    if (!compResults) return;
    try {
      const { generateCompDocx } = await import('../../utils/docxTemplateExport');
      await generateCompDocx({ compResults, courseCode: formData.courseCode });
    } catch (err) {
      console.error('Comp docx export error:', err);
      // Fallback
      const rows = compResults.map((item, idx) => {
        const comps = Array.isArray(item.competencies) ? item.competencies : [];
        const list = comps.map((c) => `<li>${c}</li>`).join('');
        return `<tr><td style="text-align:center;vertical-align:top;">${idx + 1}</td><td style="vertical-align:top;">${item.unitName || ''}</td><td style="vertical-align:top;"><ul style="margin:0;padding-left:20px;">${list}</ul></td></tr>`;
      }).join('');
      createWordDoc(`สมรรถนะประจำหน่วย_${formData.courseCode || 'export'}`, `<table><thead><tr><th width="10%">ที่</th><th width="30%">หน่วยการเรียนรู้</th><th>สมรรถนะประจำหน่วย</th></tr></thead><tbody>${rows}</tbody></table>`);
    }
  };
  const _meta = { module: 'สมรรถนะประจำหน่วย', courseCode: formData.courseCode || '', courseName: formData.courseName || '' };
  const exportWord = () => dl(_doExportWord, _meta);

  const _doExportPdf = () => {
    if (!compResults) return;
    const rows = compResults.map((item, idx) => {
      const comps = Array.isArray(item.competencies) ? item.competencies : [];
      const list = comps.map((c) => `<li>${c}</li>`).join('');
      return `<tr><td class="text-center">${idx + 1}</td><td>${item.unitName || ''}</td><td><ul>${list}</ul></td></tr>`;
    }).join('');
    printToPdf(
      `สมรรถนะประจำหน่วย ${formData.courseCode || ''}`,
      `<table><thead><tr><th width="10%">ที่</th><th width="30%">หน่วยการเรียนรู้</th><th>สมรรถนะประจำหน่วย</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  };
  const exportPdf = () => dl(_doExportPdf, _meta);

  // Safe render of competency items
  const renderCompetencyList = (competencies) => {
    const comps = Array.isArray(competencies) ? competencies : [];
    if (comps.length === 0) return <span className="text-gray-400 italic">ไม่มีข้อมูล</span>;
    return (
      <ul className="list-none space-y-2">
        {comps.map((comp, cIdx) => (
          <li key={cIdx} className="flex gap-2">
            <span className="font-semibold text-blue-600 min-w-[20px]">{cIdx + 1}.</span>
            <span>{String(comp).replace(/^\d+\.\s*/, '')}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="pnp-shell-card rounded-xl p-5 md:p-6 min-h-[80vh]">
      <div className="mb-6 border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Zap className="text-blue-600" /> สมรรถนะประจำหน่วย (Unit Competencies)
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          วิเคราะห์และเขียนสมรรถนะ (ทางปัญญา &amp; ปฏิบัติงาน) ตามระดับหลักสูตร
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left panel */}
        <div className="md:col-span-1">
          {/* Level selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">เลือกระดับชั้น</label>
            <div className="flex gap-2">
              {['ปวช.', 'ปวส.'].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setSelectedLevel(lvl)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    selectedLevel === lvl
                      ? lvl === 'ปวช.'
                        ? 'bg-blue-100 border-blue-500 text-blue-700'
                        : 'bg-purple-100 border-purple-500 text-purple-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {hasPreviousData ? (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 text-center mb-4">
              <div className="bg-white p-3 rounded-full shadow-sm mb-3 mx-auto w-fit text-purple-600">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-purple-800 font-bold text-lg mb-2">ข้อมูลพร้อมใช้งาน!</h3>
              <p className="text-purple-700 text-sm mb-4">รับข้อมูลอัตโนมัติจาก Module 2</p>
              <button
                onClick={generate}
                disabled={loading}
                className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 shadow-lg flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />} สร้างสมรรถนะทันที
              </button>
            </div>
          ) : (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center mb-4">
                <p className="text-sm text-gray-500 font-medium">Mode 2: Upload ข้อมูลด้วยตนเอง</p>
              </div>
              <FileUploadZone
                file={compFile}
                onUpload={handleCompUpload}
                label="แนบไฟล์ผลลัพธ์การเรียนรู้"
                height="h-56"
              />
              <button
                onClick={generate}
                disabled={loading || !compFile}
                className={`w-full mt-4 py-2.5 rounded-xl font-semibold transition shadow-md flex items-center justify-center gap-2 ${
                  !compFile ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />} สร้างสมรรถนะประจำหน่วย
              </button>
            </>
          )}
        </div>

        {/* Right panel - results */}
        <div className="md:col-span-2">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 min-h-[300px] border-2 border-gray-100 rounded-xl border-dashed">
              <Loader2 className="w-10 h-10 animate-spin text-blue-300 mb-3" />
              <p>{loadingText}</p>
            </div>
          ) : compResults && Array.isArray(compResults) && compResults.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 text-green-800 text-sm">
                  <Check size={16} /> สร้างสมรรถนะเสร็จสิ้น!
                </div>
                <div className="flex items-center gap-2">
                  {!editing ? (
                    <button onClick={startEdit} className="flex items-center gap-1 text-xs text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-50"><Pencil size={12} /> แก้ไข</button>
                  ) : (
                    <>
                      <button onClick={saveEdit} className="flex items-center gap-1 text-xs text-green-700 border border-green-400 px-3 py-1.5 rounded-lg hover:bg-green-50 font-bold"><Save size={12} /> บันทึก</button>
                      <button onClick={cancelEdit} className="flex items-center gap-1 text-xs text-red-600 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50"><X size={12} /> ยกเลิก</button>
                    </>
                  )}
                  <ExportButtons onRegenerate={generate} onExportWord={exportWord} onExportPdf={exportPdf} />
                </div>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 w-1/3">หน่วยการเรียนรู้</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">สมรรถนะประจำหน่วย</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(editing ? editData : compResults).map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 align-top">
                          {item?.unitName || `หน่วยที่ ${idx + 1}`}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 align-top leading-relaxed">
                          {editing ? (
                            <div className="space-y-2">
                              {(item?.competencies || []).map((comp, cIdx) => (
                                <div key={cIdx} className="flex gap-1 items-start">
                                  <span className="text-xs text-gray-400 mt-2 min-w-[20px]">{cIdx + 1}.</span>
                                  <textarea value={comp} onChange={(e) => updateEditComp(idx, cIdx, e.target.value)} className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm min-h-[40px]" />
                                  <button onClick={() => removeEditComp(idx, cIdx)} className="text-red-400 hover:text-red-600 mt-1"><X size={14} /></button>
                                </div>
                              ))}
                              <button onClick={() => addEditComp(idx)} className="text-xs text-blue-600 hover:underline">+ เพิ่มสมรรถนะ</button>
                            </div>
                          ) : renderCompetencyList(item?.competencies)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-8 text-center bg-gray-50 p-6 rounded-xl border border-gray-200">
                <h4 className="text-gray-700 font-bold mb-3">ขั้นตอนต่อไป</h4>
                <button
                  onClick={() => onNavigate('objectives')}
                  className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center gap-2 mx-auto animate-bounce"
                >
                  ไปขั้นตอนต่อไป: จุดประสงค์เชิงพฤติกรรม (Module 4) <ArrowRight size={20} />
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 min-h-[300px] border-2 border-gray-100 rounded-xl border-dashed bg-gray-50">
              <Zap className="w-12 h-12 mb-2 opacity-20" />
              <p className="text-sm">สมรรถนะประจำหน่วยจะแสดงที่นี่</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompetencyModule;
