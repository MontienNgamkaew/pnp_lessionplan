import React, { useState, useMemo } from 'react';
import { FileCheck2, Check, ArrowRight, FileDown } from 'lucide-react';
import { printToPdf, createWordDoc } from '../../utils/exportHelpers';
import { parseUnitTable } from '../../utils/markdownTable';

const EvidenceModule = ({
  formData, unitDivisionPlan,
  loResults, objResults, compResults, conceptResults, activitiesResults,
  questionBankResults,
  evidenceResults, setEvidenceResults,
  onError, onNavigate,
  triggerDownload,
}) => {
  const dl = triggerDownload || ((fn) => fn());
  const [selectedUnitIdx, setSelectedUnitIdx] = useState(0);

  // ── Unit list ──
  const parsedUnits = useMemo(() => parseUnitTable(unitDivisionPlan), [unitDivisionPlan]);
  const unitList = useMemo(() => {
    if (parsedUnits.length > 0) return parsedUnits;
    const src = activitiesResults || objResults || loResults || compResults || conceptResults || [];
    return src.map((u, i) => ({
      no: String(i + 1),
      name: u.unitName || u._unitName || `หน่วยที่ ${i + 1}`,
    }));
  }, [parsedUnits, activitiesResults, objResults, loResults, compResults, conceptResults]);

  // ── Display data from Activities Module (read-only) ──
  const displayData = useMemo(() => {
    if (unitList.length === 0) return null;
    return unitList.map((u, i) => {
      const fromPipeline = (activitiesResults || []).find((r) => r._unitIdx === i) || (activitiesResults || [])[i];
      return {
        _unitIdx: i,
        unitName: u.name || fromPipeline?.unitName || `หน่วยที่ ${i + 1}`,
        knowledgeEvidence: fromPipeline?.knowledgeEvidence || [],
        performanceEvidence: fromPipeline?.performanceEvidence || [],
        affectiveEvidence: fromPipeline?.affectiveEvidence || [],
      };
    });
  }, [unitList, activitiesResults]);

  // ── Export ──
  const buildHtml = (data) => {
    const rows = data.map((item, idx) => `
      <tr>
        <td style="text-align:center;vertical-align:top;">${idx + 1}</td>
        <td style="vertical-align:top;">${item.unitName}</td>
        <td style="vertical-align:top;"><ul>${(item.knowledgeEvidence || []).map((e) => `<li>${e}</li>`).join('')}</ul></td>
        <td style="vertical-align:top;"><ul>${(item.performanceEvidence || []).map((e) => `<li>${e}</li>`).join('')}</ul></td>
        <td style="vertical-align:top;"><ul>${(item.affectiveEvidence || []).map((e) => `<li>${e}</li>`).join('')}</ul></td>
      </tr>`).join('');
    return `<table><thead><tr><th width="6%">ที่</th><th width="20%">หน่วยการเรียนรู้</th><th>หลักฐานความรู้</th><th>หลักฐานการปฏิบัติงาน</th><th>หลักฐานจิตพิสัย</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  const _meta = { module: 'หลักฐานการเรียนรู้', courseCode: formData.courseCode || '', courseName: formData.courseName || '' };
  const exportWord = () => displayData && dl(() => createWordDoc(`หลักฐาน_${formData.courseCode}`, buildHtml(displayData)), _meta);
  const exportPdf = () => displayData && dl(() => printToPdf(`หลักฐานการเรียนรู้ ${formData.courseCode}`, buildHtml(displayData)), _meta);

  const hasData = displayData && displayData.some(d => (d.knowledgeEvidence?.length > 0 || d.performanceEvidence?.length > 0));

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 min-h-[80vh]">
      <div className="mb-6 border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FileCheck2 className="text-teal-600" /> หลักฐานการเรียนรู้ (Learning Evidence)
        </h2>
        <p className="text-gray-500 text-sm mt-1">แสดงหลักฐานการเรียนรู้จาก Module กิจกรรมการเรียนรู้</p>
      </div>

      {hasData ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-green-800 font-semibold text-sm">
              <Check size={16} />
              ข้อมูลจาก Module กิจกรรมการเรียนรู้
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-1">อัตโนมัติ</span>
            </div>
            <div className="flex gap-2">
              <button onClick={exportWord} className="flex items-center gap-1 text-xs text-blue-700 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                <FileDown size={12} /> Word
              </button>
              <button onClick={exportPdf} className="flex items-center gap-1 text-xs text-red-700 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50">
                <FileDown size={12} /> PDF
              </button>
            </div>
          </div>

          {/* Unit selector */}
          <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-teal-800 whitespace-nowrap">เลือกหน่วย:</span>
            <select value={selectedUnitIdx} onChange={(e) => setSelectedUnitIdx(Number(e.target.value))}
              className="flex-1 border border-teal-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-teal-400">
              {displayData.map((item, i) => (
                <option key={i} value={i}>{item.unitName}</option>
              ))}
            </select>
            <span className="text-xs text-teal-600">{selectedUnitIdx + 1}/{displayData.length}</span>
          </div>

          {/* Evidence display */}
          {(() => {
            const item = displayData?.[selectedUnitIdx];
            if (!item) return null;
            const renderList = (items, label, colorClass) => (
              <div className="p-4">
                <span className={`${colorClass.bg} ${colorClass.text} text-xs font-bold px-2 py-0.5 rounded-full mb-3 inline-block`}>{label}</span>
                <ul className="space-y-2 mt-2">
                  {(items || []).map((e, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className={`${colorClass.badge} font-bold px-1.5 rounded text-xs shrink-0 h-5 flex items-center`}>{i + 1}</span>
                      {e}
                    </li>
                  ))}
                  {(!items || items.length === 0) && <li className="text-xs text-gray-400">ไม่มีข้อมูล</li>}
                </ul>
              </div>
            );
            return (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-teal-50 px-4 py-3 border-b border-teal-200">
                  <h3 className="font-bold text-teal-900 text-sm">{item.unitName}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                  {renderList(item.knowledgeEvidence, 'หลักฐานความรู้', { bg: 'bg-blue-100', text: 'text-blue-800', badge: 'bg-blue-200 text-blue-800' })}
                  {renderList(item.performanceEvidence, 'หลักฐานการปฏิบัติงาน', { bg: 'bg-green-100', text: 'text-green-800', badge: 'bg-green-200 text-green-800' })}
                  {renderList(item.affectiveEvidence, 'หลักฐานจิตพิสัย', { bg: 'bg-purple-100', text: 'text-purple-800', badge: 'bg-purple-200 text-purple-800' })}
                </div>
                {/* Question Bank badge */}
                {(() => {
                  const qb = (questionBankResults || []).find(r => r._unitIdx === selectedUnitIdx) || questionBankResults?.[selectedUnitIdx];
                  if (!qb || !qb.objectives) return null;
                  const totalQ = qb.objectives.reduce((s, o) => s + (o.questions?.length || 0), 0);
                  return totalQ > 0 ? (
                    <div className="mx-4 my-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                      <span className="bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-full text-xs font-bold">📝 คลังข้อสอบ {totalQ} ข้อ</span>
                    </div>
                  ) : null;
                })()}
              </div>
            );
          })()}

          <div className="mt-6 text-center bg-gray-50 p-5 rounded-xl border border-gray-200">
            {(() => {
              const completedCount = (displayData || []).filter(d =>
                (d.knowledgeEvidence?.length > 0) || (d.performanceEvidence?.length > 0) || (d.affectiveEvidence?.length > 0)
              ).length;
              const totalCount = unitList.length;
              const allDone = completedCount >= totalCount && totalCount > 0;
              return (
                <>
                  {!allDone && <p className="text-sm text-amber-600 mb-2">กรุณาสร้างหลักฐานให้ครบทุกหน่วย ({completedCount}/{totalCount})</p>}
                  <button onClick={() => onNavigate('assessment')} disabled={!allDone}
                    className={`px-8 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 mx-auto transition ${allDone ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                    ไปขั้นตอนต่อไป: การวัดและประเมินผล <ArrowRight size={20} />
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <FileCheck2 size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">ยังไม่มีข้อมูลหลักฐานการเรียนรู้</p>
          <p className="text-sm mt-2">กรุณาสร้างกิจกรรมการเรียนรู้ให้ครบทุกหน่วยก่อน</p>
        </div>
      )}
    </div>
  );
};

export default EvidenceModule;
