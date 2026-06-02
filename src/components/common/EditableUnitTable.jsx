import React, { useState, useEffect } from 'react';
import { Edit3, Save, X, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { parseUnitTable } from '../../utils/markdownTable';

const EditableUnitTable = ({ markdown, onSave, courseCode, ratio, onAssessmentChange, hideEditButton, editTrigger }) => {
  const [units, setUnits] = useState([]);
  const [editing, setEditing] = useState(false);
  const [showAssessment, setShowAssessment] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});

  // External edit trigger
  useEffect(() => {
    if (editTrigger > 0) setEditing(true);
  }, [editTrigger]);

  // Sync assessment state with parent
  useEffect(() => {
    onAssessmentChange?.(showAssessment);
  }, [showAssessment]);

  // Course level
  const isAdvanced = courseCode && courseCode.trim().startsWith('3');

  // Parse ท/ป per week from ratio (e.g. "1-4-3" → wT=1, wP=4)
  const rMatch = ratio ? ratio.match(/(\d+)\s*[-–]\s*(\d+)/) : null;
  const wT = rMatch ? parseInt(rMatch[1]) : 2;
  const wP = rMatch ? parseInt(rMatch[2]) : 2;

  // Total weeks: ปวช. = 18, ปวส. = 15
  const totalWeeks = isAdvanced ? 15 : 18;

  // Content weeks: ปวช. ลดลง 1 เมื่อมีประเมิน (17+1=18), ปวส. คงเดิม 15 (ประเมินเพิ่มเป็นสัปดาห์ที่ 16)
  const contentWeeks = (!isAdvanced && showAssessment) ? totalWeeks - 1 : totalWeeks;

  useEffect(() => {
    if (markdown) {
      setUnits(parseUnitTable(markdown));
    }
  }, [markdown]);

  // Helper: distribute N weeks across units by weight, min 1 week each
  const distributeWeeks = (unitList, targetWeeks) => {
    const n = unitList.length;
    if (n === 0) return [];

    const weights = unitList.map((u) => {
      const topicCount = (u.topics || '').split(/[-•]\s/).filter(Boolean).length || 1;
      const hours = (parseInt(u.theory) || 0) + (parseInt(u.practice) || 0);
      return topicCount + Math.max(hours, 1);
    });
    const totalW = weights.reduce((s, w) => s + w, 0) || 1;

    const weekArr = weights.map((w) => Math.max(1, Math.round((w / totalW) * targetWeeks)));

    let sum = weekArr.reduce((s, v) => s + v, 0);
    const sorted = weights.map((w, i) => ({ i, w })).sort((a, b) => b.w - a.w);
    const sortedAsc = [...sorted].reverse();

    while (sum > targetWeeks) {
      let reduced = false;
      for (const { i } of sortedAsc) {
        if (weekArr[i] > 1 && sum > targetWeeks) { weekArr[i]--; sum--; reduced = true; }
      }
      if (!reduced) break;
    }
    while (sum < targetWeeks) {
      for (const { i } of sorted) {
        if (sum < targetWeeks) { weekArr[i]++; sum++; }
      }
    }

    return weekArr;
  };

  // Helper: apply weeks to units → set theory/practice/total
  const applyWeeksToUnits = (unitList, weekArr) => {
    return unitList.map((u, i) => {
      const w = weekArr[i] || 1;
      const t = w * wT;
      const p = w * wP;
      return { ...u, theory: String(t), practice: String(p), total: String(t + p) };
    });
  };

  // Auto-fix hours: ensure each unit = N×ท, N×ป (re-run when ท/ป/weeks change)
  const [redistributed, setRedistributed] = useState(false);

  // Reset when calculation parameters change (ratio or course level changed)
  useEffect(() => {
    setRedistributed(false);
  }, [wT, wP, contentWeeks]);

  useEffect(() => {
    if (units.length > 0 && !redistributed) {
      setRedistributed(true);

      const curT = units.reduce((s, u) => s + (parseInt(u.theory) || 0), 0);
      const curP = units.reduce((s, u) => s + (parseInt(u.practice) || 0), 0);
      const expectedT = contentWeeks * wT;
      const expectedP = contentWeeks * wP;

      const allMultiples = units.every((u) => {
        const t = parseInt(u.theory) || 0;
        const p = parseInt(u.practice) || 0;
        return (wT === 0 || t % wT === 0) && (wP === 0 || p % wP === 0);
      });

      if (curT !== expectedT || curP !== expectedP || !allMultiples) {
        const weekArr = distributeWeeks(units, contentWeeks);
        setUnits((prev) => applyWeeksToUnits(prev, weekArr));
      }
    }
  }, [units.length, redistributed]);

  // Auto-save helper
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized && units.length > 0) { setInitialized(true); return; }
    if (initialized && units.length > 0 && !editing && onSave) {
      const header = '| หน่วยที่ | ชื่อหน่วยการเรียนรู้ | หัวข้อเรื่อง (Topics) | ทฤษฎี (ชม.) | ปฏิบัติ (ชม.) | รวม (ชม.) |';
      const sep = '| --- | --- | --- | --- | --- | --- |';
      const rows = units.map((u) => {
        const t = (parseInt(u.theory) || 0) + (parseInt(u.practice) || 0); // รวม derived
        return `| ${u.no} | ${u.name} | ${u.topics} | ${u.theory} | ${u.practice} | ${t} |`;
      }).join('\n');
      onSave(`${header}\n${sep}\n${rows}`);
    }
  }, [units, editing]);

  if (units.length === 0) return null;

  const weeklyTheory = wT;
  const weeklyPractice = wP;

  // Assessment = 1 week
  const assessTheory = showAssessment ? weeklyTheory : 0;
  const assessPractice = showAssessment ? weeklyPractice : 0;
  const assessTotal = assessTheory + assessPractice;

  const update = (idx, key, value) => {
    setUnits((prev) => prev.map((u, i) => {
      if (i !== idx) return u;
      const next = { ...u, [key]: value };
      // 🆕 แก้ ทฤษฎี หรือ ปฏิบัติ → คำนวณ รวม ของแถวนั้นใหม่อัตโนมัติ
      if (key === 'theory' || key === 'practice') {
        next.total = String((parseInt(next.theory) || 0) + (parseInt(next.practice) || 0));
      }
      return next;
    }));
  };

  const addUnit = () => {
    const nextNo = units.length + 1;
    setUnits((prev) => [...prev, { no: `หน่วยที่ ${nextNo}`, name: '', topics: '', theory: String(wT), practice: String(wP), total: String(wT + wP) }]);
  };

  const removeUnit = (idx) => {
    if (units.length <= 1) return;
    // ลบแถว + renumber — รวม (total) คำนวณใหม่อัตโนมัติที่ระดับ render (derived จาก ทฤษฎี+ปฏิบัติ)
    setUnits((prev) => prev.filter((_, i) => i !== idx).map((u, i) => ({ ...u, no: `หน่วยที่ ${i + 1}` })));
  };

  // Helper: รวมของแต่ละแถว = ทฤษฎี + ปฏิบัติ (derived — ไม่พึ่ง stored total ที่อาจไม่ตรง)
  const rowTotal = (u) => (parseInt(u.theory) || 0) + (parseInt(u.practice) || 0);

  const handleSave = () => {
    setEditing(false);
    const header = '| หน่วยที่ | ชื่อหน่วยการเรียนรู้ | หัวข้อเรื่อง (Topics) | ทฤษฎี (ชม.) | ปฏิบัติ (ชม.) | รวม (ชม.) |';
    const sep = '| --- | --- | --- | --- | --- | --- |';
    const rows = units.map((u) => {
      const t = (parseInt(u.theory) || 0) + (parseInt(u.practice) || 0); // รวม derived
      return `| ${u.no} | ${u.name} | ${u.topics} | ${u.theory} | ${u.practice} | ${t} |`;
    }).join('\n');
    const newMarkdown = `${header}\n${sep}\n${rows}`;
    if (onSave) onSave(newMarkdown);
  };

  // Totals (units only) — derive จาก ทฤษฎี+ปฏิบัติ เสมอ (auto-recalc เมื่อ add/delete/edit)
  const unitTheory = units.reduce((s, u) => s + (parseInt(u.theory) || 0), 0);
  const unitPractice = units.reduce((s, u) => s + (parseInt(u.practice) || 0), 0);
  const unitTotal = unitTheory + unitPractice;

  // Grand total
  const grandTheory = unitTheory + assessTheory;
  const grandPractice = unitPractice + assessPractice;
  const grandTotal = unitTotal + assessTotal;

  // Calculate weeks per unit (for editing)
  const getUnitWeeks = (u) => {
    const t = parseInt(u.theory) || 0;
    const p = parseInt(u.practice) || 0;
    if (wT > 0) return Math.round(t / wT);
    if (wP > 0) return Math.round(p / wP);
    return 1;
  };

  return (
    <div>
      {/* Toggle edit button */}
      <div className="flex justify-end mb-2">
        {!editing ? (
          !hideEditButton && <button onClick={() => setEditing(true)}
            className="flex items-center gap-1 bg-amber-50 border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition text-xs font-medium">
            <Edit3 size={14} /> แก้ไขตาราง
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={addUnit}
              className="flex items-center gap-1 bg-green-50 border border-green-300 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition text-xs font-medium">
              <Plus size={14} /> เพิ่มหน่วย
            </button>
            <button onClick={handleSave}
              className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition text-xs font-medium shadow-sm">
              <Save size={14} /> บันทึก
            </button>
            <button onClick={() => { setEditing(false); setUnits(parseUnitTable(markdown)); }}
              className="flex items-center gap-1 bg-gray-100 border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition text-xs font-medium">
              <X size={14} /> ยกเลิก
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-3 text-left text-sm font-bold text-gray-900 w-16">หน่วยที่</th>
              <th className="px-3 py-3 text-left text-sm font-bold text-gray-900">ชื่อหน่วยการเรียนรู้</th>
              {editing && <th className="px-3 py-3 text-left text-sm font-bold text-gray-900">หัวข้อเรื่อง</th>}
              {editing && <th className="px-3 py-3 text-center text-sm font-bold text-gray-900 w-20">สัปดาห์</th>}
              <th className="px-3 py-3 text-center text-sm font-bold text-gray-900 w-20">ทฤษฎี</th>
              <th className="px-3 py-3 text-center text-sm font-bold text-gray-900 w-20">ปฏิบัติ</th>
              <th className="px-3 py-3 text-center text-sm font-bold text-gray-900 w-20">รวม</th>
              {editing && <th className="px-3 py-3 w-10"></th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {units.map((unit, idx) => {
              const unitW = getUnitWeeks(unit);
              return (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 text-sm text-gray-700 align-top">
                    {editing ? <span className="text-gray-500 text-xs">{idx + 1}</span> : unit.no}
                  </td>
                  <td className="px-3 py-2 text-sm align-top">
                    {editing ? (
                      <input type="text" value={unit.name} onChange={(e) => update(idx, 'name', e.target.value)}
                        className="w-full p-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500" />
                    ) : (
                      <div>
                        <button
                          onClick={() => setExpandedRows((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                          className="text-blue-700 font-medium hover:text-blue-900 transition flex items-center gap-1 text-left w-full"
                        >
                          {expandedRows[idx] ? <ChevronDown size={14} className="flex-shrink-0 text-blue-400" /> : <ChevronRight size={14} className="flex-shrink-0 text-blue-400" />}
                          {unit.name}
                        </button>
                        {expandedRows[idx] && unit.topics && (
                          <div className="mt-2 ml-5 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-gray-700 leading-relaxed">
                            <p className="font-bold text-blue-800 mb-1.5 text-xs">หัวข้อเรื่อง / เนื้อหาย่อย:</p>
                            <div dangerouslySetInnerHTML={{ __html: unit.topics.replace(/<br\s*\/?>/gi, '<br/>').replace(/^[-•]\s*/gm, '• ') }} />
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  {editing && (
                    <td className="px-3 py-2 text-sm align-top">
                      <textarea value={unit.topics} onChange={(e) => update(idx, 'topics', e.target.value)}
                        rows={3} className="w-full p-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500" />
                    </td>
                  )}
                  {editing && (
                    <td className="px-3 py-2 text-sm text-center align-top">
                      <input type="number" min="1" max="5" value={unitW}
                        onChange={(e) => {
                          const newW = Math.max(1, parseInt(e.target.value) || 1);
                          const t = newW * wT;
                          const p = newW * wP;
                          setUnits((prev) => prev.map((u, i) =>
                            i === idx ? { ...u, theory: String(t), practice: String(p), total: String(t + p) } : u
                          ));
                        }}
                        className="w-16 p-1.5 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-blue-500" />
                    </td>
                  )}
                  <td className="px-3 py-2 text-sm text-center align-top">{unit.theory}</td>
                  <td className="px-3 py-2 text-sm text-center align-top">{unit.practice}</td>
                  <td className="px-3 py-2 text-sm text-center align-top font-bold">{rowTotal(unit)}</td>
                  {editing && (
                    <td className="px-3 py-2 align-top">
                      <button onClick={() => removeUnit(idx)} disabled={units.length <= 1}
                        className="text-red-400 hover:text-red-600 disabled:opacity-30 p-1">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}

            {/* Assessment row */}
            {showAssessment && (
              <tr className="bg-amber-50 border-t-2 border-amber-300">
                <td colSpan={editing ? 4 : 2} className="px-3 py-2.5 text-sm font-bold text-amber-800">
                  <div className="flex items-center justify-between">
                    <span>ประเมินผลลัพธ์การเรียนรู้ (1 สัปดาห์)</span>
                    <button
                      onClick={() => {
                        if (!isAdvanced && units.length > 0) {
                          const weekArr = distributeWeeks(units, totalWeeks);
                          setUnits((prev) => applyWeeksToUnits(prev, weekArr));
                        }
                        setShowAssessment(false);
                      }}
                      className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition"
                      title="ลบแถวประเมินผลลัพธ์การเรียนรู้"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-sm font-bold text-amber-800 text-center">{assessTheory}</td>
                <td className="px-3 py-2.5 text-sm font-bold text-amber-800 text-center">{assessPractice}</td>
                <td className="px-3 py-2.5 text-sm font-bold text-amber-800 text-center">{assessTotal}</td>
                {editing && <td></td>}
              </tr>
            )}

            {/* Re-add assessment button */}
            {!showAssessment && (
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={editing ? 7 : 5} className="px-3 py-2 text-center">
                  <button
                    onClick={() => {
                      if (!isAdvanced && units.length > 0) {
                        const weekArr = distributeWeeks(units, totalWeeks - 1);
                        setUnits((prev) => applyWeeksToUnits(prev, weekArr));
                      }
                      setShowAssessment(true);
                    }}
                    className="text-xs text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1 mx-auto"
                  >
                    <Plus size={13} /> เพิ่มแถวประเมินผลลัพธ์การเรียนรู้
                  </button>
                </td>
              </tr>
            )}
          </tbody>

          {/* Grand total footer */}
          <tfoot className="bg-blue-50 border-t-2 border-blue-300">
            <tr>
              <td colSpan={editing ? 4 : 2} className="px-3 py-2.5 text-sm font-bold text-right text-blue-900 whitespace-nowrap">
                รวมทั้งสิ้น ({isAdvanced ? `ปวส. ${showAssessment ? `${totalWeeks + 1} สัปดาห์ (${totalWeeks} + ประเมิน 1)` : `${totalWeeks} สัปดาห์`}` : `ปวช. ${showAssessment ? `${totalWeeks} สัปดาห์ (${totalWeeks - 1} + ประเมิน 1)` : `${totalWeeks} สัปดาห์`}`})
              </td>
              <td className="px-3 py-2.5 text-sm font-bold text-center text-blue-900">{grandTheory}</td>
              <td className="px-3 py-2.5 text-sm font-bold text-center text-blue-900">{grandPractice}</td>
              <td className="px-3 py-2.5 text-base font-bold text-center text-blue-900">{grandTotal}</td>
              {editing && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default EditableUnitTable;
