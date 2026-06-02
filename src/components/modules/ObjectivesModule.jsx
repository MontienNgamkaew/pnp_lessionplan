import React, { useState } from 'react';
import { ListChecks, CheckCircle, Sparkles, Loader2, Check, ArrowRight, ChevronLeft, ChevronRight, Pencil, Save, X } from 'lucide-react';
import FileUploadZone from '../common/FileUploadZone';
import ExportButtons from '../common/ExportButtons';
import { useFileUpload, buildFileParts } from '../../hooks/useFileUpload';
import { useAiApi } from '../../hooks/useAiApi';
import { SYSTEM_PROMPT_OBJECTIVES } from '../../constants/prompts';
import { printToPdf, createWordDoc } from '../../utils/exportHelpers';

const UPLOAD_STEPS = [
  { key: 'syllabus', label: 'หลักสูตรรายวิชา', step: 1 },
  { key: 'competencies', label: 'สมรรถนะประจำหน่วย', step: 2 },
  { key: 'outcomes', label: 'ผลลัพธ์การเรียนรู้', step: 3 },
];

const ObjectivesModule = ({
  providerId, apiKey,
  formData, compResults, loResults,
  objResults, setObjResults,
  onError, onNavigate,
  triggerDownload,
  onRegenerate,
}) => {
  const dl = triggerDownload || ((fn) => fn());
  const hasInternal = !!(formData.courseCode && compResults && loResults);
  const [objStep, setObjStep] = useState(1);
  const { callApi, loading, loadingText } = useAiApi(providerId, apiKey);

  // File hooks for manual upload mode
  const syllabusUpload = useFileUpload({ onError });
  const compUpload = useFileUpload({ onError });
  const outcomesUpload = useFileUpload({ onError });
  const fileHooks = { syllabus: syllabusUpload, competencies: compUpload, outcomes: outcomesUpload };

  const generate = async () => {
    if (!hasInternal && !(syllabusUpload.file && compUpload.file && outcomesUpload.file)) {
      onError('ข้อมูลไม่เพียงพอ กรุณาอัปโหลดไฟล์ให้ครบทุกขั้นตอนค่ะ');
      return;
    }
    if (onRegenerate) onRegenerate();
    try {
      let parts = [{ text: SYSTEM_PROMPT_OBJECTIVES }];
      if (hasInternal && !syllabusUpload.file) {
        parts.push({ text: `\n\n--- Course Syllabus ---\n${JSON.stringify(formData)}` });
        parts.push({ text: `\n\n--- Unit Competencies ---\n${JSON.stringify(compResults)}` });
        parts.push({ text: `\n\n--- Unit Learning Outcomes ---\n${JSON.stringify(loResults)}` });
      } else {
        parts.push(...buildFileParts(syllabusUpload.file, 'Course Syllabus'));
        parts.push(...buildFileParts(compUpload.file, 'Unit Competencies'));
        parts.push(...buildFileParts(outcomesUpload.file, 'Unit Learning Outcomes'));
      }
      const data = await callApi(parts, { json: true, moduleName: 'objectives', statusText: "กำลังวิเคราะห์จุดประสงค์เชิงพฤติกรรม (Bloom's/Dave's)..." });
      const { ensureSchema } = await import('../../utils/aiResponseValidator');
      const validated = ensureSchema(data, 'objectives', { arrayKey: 'units' });
      setObjResults(validated.units);
    } catch (err) {
      console.error('Objectives Error:', err);
      onError(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถวิเคราะห์ไฟล์ได้'}`);
    }
  };

  // ── Inline editing ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(null);

  const startEdit = () => {
    setEditData(JSON.parse(JSON.stringify(objResults)));
    setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setEditData(null); };
  const saveEdit = () => {
    setObjResults(editData);
    setEditing(false);
    setEditData(null);
  };
  const updateEditItem = (unitIdx, domain, itemIdx, value) => {
    setEditData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      const arr = [...(item[domain] || [])];
      arr[itemIdx] = value;
      return { ...item, [domain]: arr };
    }));
  };
  const addEditItem = (unitIdx, domain) => {
    setEditData(prev => prev.map((item, i) => i === unitIdx ? { ...item, [domain]: [...(item[domain] || []), ''] } : item));
  };
  const removeEditItem = (unitIdx, domain, itemIdx) => {
    setEditData(prev => prev.map((item, i) => {
      if (i !== unitIdx) return item;
      return { ...item, [domain]: (item[domain] || []).filter((_, ci) => ci !== itemIdx) };
    }));
  };

  // --- Exports ---
  const renderList = (list) => {
    if (!list || list.length === 0) return '-';
    return `<ul style="margin:0;padding-left:15px;">${list.map((i) => {
      if (i.startsWith('(คุณครู')) return `</ul><p style="color:red;font-weight:bold;margin:4px 0 0 0;font-size:12px;">${i}</p><ul style="margin:0;padding-left:15px;">`;
      if (i.startsWith('📌')) return `<li style="list-style:none;margin-left:-15px;font-weight:bold;color:#3730a3;">${i}</li>`;
      return `<li>${i}</li>`;
    }).join('')}</ul>`;
  };

  const _doExportWord = async () => {
    if (!objResults) return;
    try {
      const { generateObjDocx } = await import('../../utils/docxTemplateExport');
      await generateObjDocx({ objResults, courseCode: formData.courseCode });
    } catch (err) {
      console.error('Obj docx export error:', err);
      // Fallback
      const rows = objResults.map((item, idx) =>
        `<tr><td style="text-align:center;vertical-align:top;">${idx + 1}</td><td style="vertical-align:top;">${item.unitName}</td><td style="vertical-align:top;">${renderList(item.cognitive)}</td><td style="vertical-align:top;">${renderList(item.psychomotor)}</td><td style="vertical-align:top;">${renderList(item.affective)}</td><td style="vertical-align:top;">${renderList(item.application)}</td></tr>`
      ).join('');
      createWordDoc(`จุดประสงค์เชิงพฤติกรรม_${formData.courseCode}`, `<table><thead><tr><th rowspan="2">ที่</th><th rowspan="2">หน่วยการเรียนรู้</th><th colspan="4">จุดประสงค์เชิงพฤติกรรม</th></tr><tr><th>พุทธิพิสัย</th><th>ทักษะพิสัย</th><th>จิตพิสัย</th><th>การประยุกต์ใช้</th></tr></thead><tbody>${rows}</tbody></table>`);
    }
  };
  const _meta = { module: 'จุดประสงค์เชิงพฤติกรรม', courseCode: formData.courseCode || '', courseName: formData.courseName || '' };
  const exportWord = () => dl(_doExportWord, _meta);

  const _doExportPdf = () => {
    if (!objResults) return;
    const rows = objResults.map((item, idx) =>
      `<tr><td class="text-center">${idx + 1}</td><td>${item.unitName}</td><td><b>1. พุทธิพิสัย:</b>${renderList(item.cognitive)}<b>2. ทักษะพิสัย:</b>${renderList(item.psychomotor)}<b>3. จิตพิสัย:</b>${renderList(item.affective)}<b>4. การประยุกต์ใช้:</b>${renderList(item.application)}</td></tr>`
    ).join('');
    printToPdf(`จุดประสงค์เชิงพฤติกรรม ${formData.courseCode}`, `<table><thead><tr><th width="8%">ที่</th><th width="25%">หน่วยการเรียนรู้</th><th>จุดประสงค์เชิงพฤติกรรม (4 ด้าน)</th></tr></thead><tbody>${rows}</tbody></table>`);
  };
  const exportPdf = () => dl(_doExportPdf, _meta);

  return (
    <div className="pnp-shell-card rounded-xl p-5 md:p-6 min-h-[80vh]">
      <div className="mb-6 border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><ListChecks className="text-blue-600" /> จุดประสงค์เชิงพฤติกรรม (Behavioral Objectives)</h2>
        <p className="text-gray-500 text-sm mt-1">วิเคราะห์จุดประสงค์ 4 ด้าน (พุทธิพิสัย, ทักษะพิสัย, จิตพิสัย, การประยุกต์ใช้) ตามทฤษฎี Bloom</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Input area — only shown when no results yet */}
        {!objResults && (
          <div className="max-w-xl mx-auto w-full">
            {hasInternal ? (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 text-center mb-4">
                <div className="bg-white p-3 rounded-full shadow-sm mb-3 mx-auto w-fit text-indigo-600"><CheckCircle size={32} /></div>
                <h3 className="text-indigo-800 font-bold text-lg mb-2">ข้อมูลพร้อมใช้งาน!</h3>
                <p className="text-indigo-700 text-sm mb-4">รับข้อมูลอัตโนมัติครบถ้วน (หลักสูตร + สมรรถนะ + ผลลัพธ์)</p>
                <button onClick={generate} disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />} สร้างจุดประสงค์เชิงพฤติกรรมทันที
                </button>
              </div>
            ) : (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center mb-6"><p className="text-sm text-gray-500 font-medium">Mode 2: Upload ข้อมูลด้วยตนเอง</p></div>
                {/* Progress bar */}
                <div className="flex items-center justify-center mb-6">
                  {UPLOAD_STEPS.map((s, i) => (
                    <React.Fragment key={s.key}>
                      {i > 0 && <div className={`w-16 h-1 mx-2 ${objStep >= s.step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                      <div className={`flex items-center ${objStep >= s.step ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${objStep >= s.step ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>{s.step}</div>
                        <span className="ml-2">{s.label.split(' ')[0]}</span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                {UPLOAD_STEPS.map((s) => {
                  if (objStep !== s.step) return null;
                  const hook = fileHooks[s.key];
                  return (
                    <div key={s.key}>
                      {s.step > 1 && (
                        <button onClick={() => setObjStep(s.step - 1)} className="text-gray-500 text-sm mb-2 flex items-center hover:text-gray-700"><ChevronLeft size={16} /> ย้อนกลับ</button>
                      )}
                      <label className="block text-lg font-bold text-gray-800 mb-3 text-center">ขั้นตอนที่ {s.step}: แนบไฟล์{s.label}</label>
                      <FileUploadZone file={hook.file} onUpload={hook.handleUpload} label={`คลิกเพื่อแนบไฟล์ ${s.label}`} height="h-64" />
                      {hook.file && (
                        s.step < 3 ? (
                          <button onClick={() => setObjStep(s.step + 1)} className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2">ถัดไป <ChevronRight /></button>
                        ) : (
                          <button onClick={generate} disabled={loading} className="w-full mt-4 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2 shadow-lg disabled:opacity-70">
                            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} สร้างจุดประสงค์เชิงพฤติกรรม
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

        {/* Results */}
        {objResults && (
          <div className="relative">
            {/* Loading overlay when regenerating */}
            {loading && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
                <Loader2 className="animate-spin text-blue-600 mb-3" size={40} />
                <p className="text-blue-700 font-bold text-lg">{loadingText || 'กำลังสร้างใหม่...'}</p>
                <p className="text-gray-500 text-sm mt-1">กรุณารอสักครู่</p>
              </div>
            )}

            <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200 mb-4">
              <div className="flex items-center gap-2 text-green-800 text-sm"><Check size={16} /> วิเคราะห์เสร็จสิ้น!</div>
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
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 w-24">หน่วยที่</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 w-1/4">ชื่อหน่วย</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">รายละเอียดจุดประสงค์ (4 ด้าน)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(editing ? editData : objResults).map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-3 text-sm text-center text-gray-500 align-top">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 align-top">{item.unitName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 align-top">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[
                            { key: 'cognitive', label: '1. พุทธิพิสัย (Cognitive)', color: 'blue' },
                            { key: 'psychomotor', label: '2. ทักษะพิสัย (Psychomotor)', color: 'green' },
                            { key: 'affective', label: '3. จิตพิสัย (Affective)', color: 'pink' },
                            { key: 'application', label: '4. การประยุกต์ใช้ (Application)', color: 'purple' },
                          ].map((d) => (
                            <div key={d.key} className={`bg-${d.color}-50 p-3 rounded-lg`}>
                              <span className={`font-bold text-${d.color}-800 text-xs uppercase tracking-wider block mb-2 border-b border-${d.color}-200 pb-1`}>{d.label}</span>
                              {editing ? (
                                <div className="space-y-1">
                                  {(item[d.key] || []).map((line, k) => (
                                    <div key={k} className="flex gap-1 items-start">
                                      <textarea value={line} onChange={(e) => updateEditItem(idx, d.key, k, e.target.value)} className="flex-1 border border-gray-300 rounded px-1.5 py-0.5 text-xs min-h-[32px]" />
                                      <button onClick={() => removeEditItem(idx, d.key, k)} className="text-red-400 hover:text-red-600 shrink-0"><X size={12} /></button>
                                    </div>
                                  ))}
                                  <button onClick={() => addEditItem(idx, d.key)} className="text-[10px] text-blue-600 hover:underline">+ เพิ่ม</button>
                                </div>
                              ) : d.key === 'cognitive' ? (
                                <div className="space-y-1">
                                  {(item[d.key] || []).map((line, k) => {
                                    if (line.startsWith('📌')) {
                                      return (
                                        <div key={k} className="bg-indigo-100 border-l-4 border-indigo-500 text-indigo-800 font-bold text-xs px-2 py-1.5 rounded-r mt-2 first:mt-0">
                                          {line}
                                        </div>
                                      );
                                    }
                                    if (line.startsWith('(คุณครู')) {
                                      return <p key={k} className="text-red-600 font-bold text-xs mt-3 px-2 py-1.5">{line}</p>;
                                    }
                                    const kMatch = line.match(/\(K(\d)\)/);
                                    const kColors = { '1': 'sky', '2': 'teal', '3': 'emerald', '4': 'amber', '5': 'orange', '6': 'rose' };
                                    const kLevel = kMatch ? kMatch[1] : null;
                                    const kColor = kLevel ? (kColors[kLevel] || 'gray') : 'gray';
                                    return (
                                      <div key={k} className="flex items-start gap-1.5 text-xs pl-1">
                                        {kLevel && (
                                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-${kColor}-100 text-${kColor}-700 border border-${kColor}-200 whitespace-nowrap mt-0.5`}>
                                            K{kLevel}
                                          </span>
                                        )}
                                        <span>{kLevel ? line.replace(/\(K\d\)\s*/, '') : line}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <ul className="list-disc pl-4 space-y-1 text-xs">
                                  {(item[d.key] || []).map((i, k) => <li key={k}>{i}</li>)}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 text-center bg-gray-50 p-6 rounded-xl border border-gray-200">
              <h4 className="text-gray-700 font-bold mb-3">ขั้นตอนต่อไป</h4>
              <button onClick={() => onNavigate('concept')} className="bg-amber-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-amber-700 shadow-lg flex items-center gap-2 mx-auto animate-bounce">
                ไปขั้นตอนต่อไป: สาระการเรียนรู้ (Module 5) <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ObjectivesModule;
