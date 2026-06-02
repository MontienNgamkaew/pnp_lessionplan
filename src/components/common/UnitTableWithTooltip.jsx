import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { parseUnitTable } from '../../utils/markdownTable';
import MarkdownTableRenderer from './MarkdownTableRenderer';

const UnitTableWithTooltip = ({ markdown, courseCode }) => {
  const [hoveredUnit, setHoveredUnit] = useState(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [assessTheory, setAssessTheory] = useState('');
  const [assessPractice, setAssessPractice] = useState('');

  const units = parseUnitTable(markdown);
  if (units.length === 0) return <MarkdownTableRenderer content={markdown} />;

  // Calculate weeks based on course level
  const isAdvanced = courseCode && courseCode.trim().startsWith('3');
  const totalWeeks = isAdvanced ? 15 : 18;

  // Parse numbers
  const at = parseInt(assessTheory) || 0;
  const ap = parseInt(assessPractice) || 0;
  const assessTotal = at + ap;

  // Sum units
  const unitTheorySum = units.reduce((sum, u) => sum + (parseInt(u.theory) || 0), 0);
  const unitPracticeSum = units.reduce((sum, u) => sum + (parseInt(u.practice) || 0), 0);
  const unitTotalSum = units.reduce((sum, u) => sum + (parseInt(u.total) || 0), 0);

  // Grand total
  const grandTheory = unitTheorySum + at;
  const grandPractice = unitPracticeSum + ap;
  const grandTotal = unitTotalSum + assessTotal;

  return (
    <div className="relative overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-bold text-gray-900 w-16">หน่วยที่</th>
            <th className="px-4 py-3 text-left text-sm font-bold text-gray-900">ชื่อหน่วยการเรียนรู้</th>
            <th className="px-4 py-3 text-center text-sm font-bold text-gray-900 w-24">ทฤษฎี (ชม.)</th>
            <th className="px-4 py-3 text-center text-sm font-bold text-gray-900 w-24">ปฏิบัติ (ชม.)</th>
            <th className="px-4 py-3 text-center text-sm font-bold text-gray-900 w-24">รวม (ชม.)</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {units.map((unit, idx) => (
            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-4 py-3 text-sm text-gray-700 align-top">{unit.no}</td>
              <td
                className="px-4 py-3 text-sm text-blue-700 font-medium align-top cursor-help hover:underline decoration-dashed decoration-blue-300 underline-offset-4"
                onMouseEnter={(e) => {
                  setHoveredUnit(unit);
                  setCursorPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => {
                  if (hoveredUnit) setCursorPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoveredUnit(null)}
              >
                {unit.name}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 text-center align-top">{unit.theory}</td>
              <td className="px-4 py-3 text-sm text-gray-700 text-center align-top">{unit.practice}</td>
              <td className="px-4 py-3 text-sm text-gray-700 text-center align-top font-bold">{unit.total}</td>
            </tr>
          ))}

          {/* Assessment row */}
          <tr className="bg-amber-50 border-t-2 border-amber-300">
            <td className="px-4 py-3 text-sm text-amber-800 font-bold text-center" colSpan={2}>
              ประเมินผลลัพธ์การเรียนรู้
            </td>
            <td className="px-2 py-2 text-center">
              <input
                type="number"
                min="0"
                value={assessTheory}
                onChange={(e) => setAssessTheory(e.target.value)}
                placeholder="0"
                className="w-16 text-center border border-amber-300 rounded-lg py-1 px-1 text-sm focus:ring-2 focus:ring-amber-400 bg-white"
              />
            </td>
            <td className="px-2 py-2 text-center">
              <input
                type="number"
                min="0"
                value={assessPractice}
                onChange={(e) => setAssessPractice(e.target.value)}
                placeholder="0"
                className="w-16 text-center border border-amber-300 rounded-lg py-1 px-1 text-sm focus:ring-2 focus:ring-amber-400 bg-white"
              />
            </td>
            <td className="px-4 py-3 text-sm text-amber-800 text-center font-bold">
              {assessTotal > 0 ? assessTotal : '-'}
            </td>
          </tr>

          {/* Grand total row */}
          <tr className="bg-blue-50 border-t-2 border-blue-300">
            <td className="px-4 py-3 text-sm font-bold text-blue-900 text-right whitespace-nowrap" colSpan={2}>
              รวมทั้งสิ้น ({isAdvanced ? 'ปวส.' : 'ปวช.'} {totalWeeks} สัปดาห์)
            </td>
            <td className="px-4 py-3 text-sm font-bold text-blue-900 text-center">{grandTheory}</td>
            <td className="px-4 py-3 text-sm font-bold text-blue-900 text-center">{grandPractice}</td>
            <td className="px-4 py-3 text-sm font-bold text-blue-900 text-center text-base">{grandTotal}</td>
          </tr>
        </tbody>
      </table>

      {/* Tooltip */}
      {hoveredUnit && (
        <div
          className="fixed z-50 bg-gray-800 text-white p-4 rounded-lg shadow-xl max-w-sm pointer-events-none"
          style={{ left: `${cursorPos.x + 20}px`, top: `${cursorPos.y + 20}px` }}
        >
          <div className="font-bold mb-2 text-yellow-400 border-b border-gray-600 pb-1">
            หัวข้อเรื่อง (Topics)
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            <ReactMarkdown>{hoveredUnit.topics}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnitTableWithTooltip;
