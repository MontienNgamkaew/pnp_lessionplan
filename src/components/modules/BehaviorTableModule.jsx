import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { BarChart3, Check, AlertTriangle, ToggleLeft, ToggleRight, Brain, ChevronDown, ChevronUp, Lock, ArrowRight } from 'lucide-react';
import ExportButtons from '../common/ExportButtons';
import { parseUnitTable } from '../../utils/markdownTable';
import { getTheoryPractice } from '../../utils/courseHelpers';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { printToPdf } from '../../utils/exportHelpers';

const TOTAL_SCORE = 100;
const AFFECTIVE_TOTAL = 20;
const REMAINING = 80;

const K_LABELS = [
  { key: 'K1', label: 'ความรู้' },
  { key: 'K2', label: 'ความเข้าใจ' },
  { key: 'K3', label: 'นำไปใช้' },
  { key: 'K4', label: 'วิเคราะห์' },
  { key: 'K5', label: 'ประเมินค่า' },
  { key: 'K6', label: 'สร้างสรรค์' },
];

const round2 = (v) => Math.round(v);

/**
 * Extract K-levels present in a unit's cognitive objectives.
 * Looks for patterns like "(K1)", "(K2)" etc. in objective text.
 */
const extractKLevels = (cognitiveItems) => {
  if (!cognitiveItems || !Array.isArray(cognitiveItems)) return [];
  const levels = new Set();
  cognitiveItems.forEach((item) => {
    const text = typeof item === 'string' ? item : String(item || '');
    const matches = text.match(/\(K(\d)\)/gi);
    if (matches) {
      matches.forEach((m) => {
        const num = m.replace(/[^0-9]/g, '');
        if (num >= 1 && num <= 6) levels.add(`K${num}`);
      });
    }
  });
  return Array.from(levels).sort();
};

/**
 * Check if first objective starts with "เข้าใจ" => K1 = 0 for all units.
 */
const shouldZeroK1 = (formData) => {
  const objectives = formData?.objectives;
  if (!objectives) return false;
  let firstObj = '';
  if (Array.isArray(objectives) && objectives.length > 0) {
    firstObj = typeof objectives[0] === 'string' ? objectives[0] : String(objectives[0] || '');
  } else if (typeof objectives === 'string') {
    const lines = objectives.split('\n').map((l) => l.trim()).filter(Boolean);
    firstObj = (lines[0] || '').replace(/^\d+\.\s*/, '');
  }
  return firstObj.trim().startsWith('เข้าใจ');
};

const BehaviorTableModule = ({
  providerId, apiKey,
  formData,
  unitDivisionPlan,
  objResults,
  activitiesResults,
  loResults,
  behaviorSelections = {},
  setBehaviorSelections,
  triggerDownload,
  onError,
  onNavigate,
  onRegenerate,
}) => {
  const dl = triggerDownload || ((fn) => fn());

  // Parse unit data from markdown table
  const parsedUnits = useMemo(() => parseUnitTable(unitDivisionPlan), [unitDivisionPlan]);

  // Get theory/practice ratio
  const { theory: ratioT, practice: ratioP } = useMemo(
    () => getTheoryPractice(formData?.ratio),
    [formData?.ratio]
  );

  // Course level (ปวช. vs ปวส.)
  const isAdvanced = formData?.courseCode && formData.courseCode.trim().startsWith('3');

  const unitCount = parsedUnits.length;
  const zeroK1 = useMemo(() => shouldZeroK1(formData), [formData]);

  // Compute totals from credits (หน่วยกิต)
  // หน่วยกิตทฤษฎี = ท, หน่วยกิตปฏิบัติ = น - ท
  const totalCredits = useMemo(() => parseInt(formData?.credits) || 0, [formData?.credits]);
  const theoryCredits = ratioT; // ท ชม./สัปดาห์ = หน่วยกิตทฤษฎี
  const practiceCredits = useMemo(() => Math.max(0, totalCredits - theoryCredits), [totalCredits, theoryCredits]);

  // พุทธิพิสัย = ตามหน่วยกิตทฤษฎี (ขั้นต่ำ 10 หากหน่วยกิต=0)
  const MIN_SCORE = 20;
  const cognitiveTotal = useMemo(() => {
    if (totalCredits === 0) return 40;
    const raw = round2((theoryCredits / totalCredits) * REMAINING);
    if (raw === 0) return MIN_SCORE; // ท=0 ยังมีพุทธิพิสัยขั้นต่ำ
    if (raw === REMAINING && practiceCredits === 0) return REMAINING - MIN_SCORE; // ป=0 ยังเหลือให้ทักษะ
    return raw;
  }, [theoryCredits, practiceCredits, totalCredits]);

  // ทักษะพิสัย + การประยุกต์ใช้ = ส่วนที่เหลือ, สัดส่วน 4:1
  const practiceTotal = useMemo(() => REMAINING - cognitiveTotal, [cognitiveTotal]);
  const psychomotorTotal = useMemo(() => round2((4 / 5) * practiceTotal), [practiceTotal]);
  const applicationTotal = useMemo(() => round2(practiceTotal - psychomotorTotal), [practiceTotal, psychomotorTotal]);

  // Affective per unit (proportional to hours — compute hours inline to avoid TDZ)
  const affectivePerUnitArr = useMemo(() => {
    if (unitCount === 0) return [];
    const hoursArr = parsedUnits.map((u) => (parseInt(u.theory) || 0) + (parseInt(u.practice) || 0));
    const totalH = hoursArr.reduce((s, h) => s + h, 0);
    const arr = hoursArr.map((h) =>
      totalH > 0 ? Math.floor((h / totalH) * AFFECTIVE_TOTAL) : Math.floor(AFFECTIVE_TOTAL / unitCount)
    );
    // Distribute remainder to units with the most hours
    let remainder = AFFECTIVE_TOTAL - arr.reduce((s, v) => s + v, 0);
    if (remainder > 0) {
      const sorted = hoursArr.map((h, i) => ({ i, h })).sort((a, b) => b.h - a.h);
      for (let j = 0; remainder > 0 && j < sorted.length; j++) {
        arr[sorted[j].i]++;
        remainder--;
      }
    }
    return arr;
  }, [unitCount, parsedUnits]);

  // Get K-levels for each unit from behaviorSelections
  const unitKLevels = useMemo(() => {
    return parsedUnits.map((_, idx) => {
      const selected = behaviorSelections[idx];
      if (selected && Array.isArray(selected) && selected.length > 0) {
        return extractKLevels(selected);
      }
      // Fallback: use all cognitive from objResults
      if (objResults?.[idx]?.cognitive) {
        return extractKLevels(objResults[idx].cognitive);
      }
      return [];
    });
  }, [parsedUnits, behaviorSelections, objResults]);

  // Hours per unit
  const unitHours = useMemo(() => {
    return parsedUnits.map((u) => {
      const t = parseInt(u.theory) || 0;
      const p = parseInt(u.practice) || 0;
      return { theory: t, practice: p, total: t + p };
    });
  }, [parsedUnits]);

  const totalHours = useMemo(
    () => unitHours.reduce((s, h) => s + h.total, 0),
    [unitHours]
  );

  // Auto-calculate initial scores
  const computeAutoScores = useCallback(() => {
    if (unitCount === 0) return [];

    // Helper: distribute `total` across units proportional to hours, ensuring exact sum
    const distribute = (total, hoursArr, totalH) => {
      const arr = hoursArr.map((h) =>
        totalH > 0 ? Math.floor((h / totalH) * total) : Math.floor(total / hoursArr.length)
      );
      let remainder = total - arr.reduce((s, v) => s + v, 0);
      if (remainder > 0) {
        const sorted = hoursArr.map((h, i) => ({ i, h })).sort((a, b) => b.h - a.h);
        for (let j = 0; remainder > 0 && j < sorted.length; j++) { arr[sorted[j].i]++; remainder--; }
      }
      return arr;
    };

    const hoursArr = unitHours.map((h) => h.total);
    const totalH = hoursArr.reduce((s, v) => s + v, 0);

    // Distribute each domain across units so sums are exact
    const cogArr = distribute(cognitiveTotal, hoursArr, totalH);
    const psyArr = distribute(psychomotorTotal, hoursArr, totalH);
    const appArr = distribute(applicationTotal, hoursArr, totalH);

    return parsedUnits.map((unit, idx) => {
      const kLevels = unitKLevels[idx];
      const unitCogTotal = cogArr[idx];

      // Distribute cognitive across K levels
      const kScores = { K1: 0, K2: 0, K3: 0, K4: 0, K5: 0, K6: 0 };
      const activeKs = zeroK1 ? kLevels.filter((k) => k !== 'K1') : kLevels;

      if (activeKs.length > 0) {
        const perK = Math.floor(unitCogTotal / activeKs.length);
        activeKs.forEach((k) => { kScores[k] = perK; });
        let kRemainder = unitCogTotal - perK * activeKs.length;
        for (let j = activeKs.length - 1; kRemainder > 0 && j >= 0; j--) { kScores[activeKs[j]]++; kRemainder--; }
      }

      const unitPsychomotor = psyArr[idx];
      const unitApplication = appArr[idx];
      const unitAffective = affectivePerUnitArr[idx] || 0;

      const unitTotal = round2(
        Object.values(kScores).reduce((s, v) => s + v, 0) +
        unitPsychomotor + unitAffective + unitApplication
      );

      return {
        kScores,
        psychomotor: unitPsychomotor,
        affective: unitAffective,
        application: unitApplication,
        total: unitTotal,
      };
    });
  }, [
    unitCount, parsedUnits, unitHours, unitKLevels,
    cognitiveTotal, psychomotorTotal, applicationTotal, affectivePerUnitArr, zeroK1,
  ]);

  // State: scores[unitIdx] = { kScores: {K1..K6}, psychomotor, affective, application, total }
  const [scores, setScores] = useState([]);
  // Track which cells are manually edited
  const [editedCells, setEditedCells] = useState(new Set());
  // Toggle for ประเมินผลลัพธ์ row
  const [includeLoRow, setIncludeLoRow] = useState(false);
  const [loTotal, setLoTotal] = useState(0);
  // Cognitive selection panel
  const [showCognitivePanel, setShowCognitivePanel] = useState(false);
  const [expandedUnit, setExpandedUnit] = useState(null);

  // Toggle cognitive objective selection for a unit
  const toggleCognitiveItem = (unitIdx, item) => {
    if (onRegenerate) onRegenerate();
    setBehaviorSelections?.((prev) => {
      const current = prev[unitIdx] || [];
      const exists = current.includes(item);
      return {
        ...prev,
        [unitIdx]: exists ? current.filter((x) => x !== item) : [...current, item],
      };
    });
  };

  // Check how many units have selections
  const selectionCount = useMemo(() => {
    return parsedUnits.filter((_, idx) => (behaviorSelections[idx] || []).length > 0).length;
  }, [parsedUnits, behaviorSelections]);

  // Initialize scores
  useEffect(() => {
    const auto = computeAutoScores();
    if (auto.length > 0) {
      setScores(auto);
      setEditedCells(new Set());
    }
  }, [computeAutoScores]);

  // Recalculate totals whenever scores change
  const recalcTotals = useCallback((newScores) => {
    return newScores.map((row) => {
      const kSum = Object.values(row.kScores).reduce((s, v) => s + v, 0);
      return {
        ...row,
        total: round2(kSum + row.psychomotor + row.affective + row.application),
      };
    });
  }, []);

  // Column totals
  const columnTotals = useMemo(() => {
    const totals = { K1: 0, K2: 0, K3: 0, K4: 0, K5: 0, K6: 0, psychomotor: 0, affective: 0, application: 0, total: 0 };
    scores.forEach((row) => {
      K_LABELS.forEach(({ key }) => { totals[key] += row.kScores[key]; });
      totals.psychomotor += row.psychomotor;
      totals.affective += row.affective;
      totals.application += row.application;
      totals.total += row.total;
    });
    Object.keys(totals).forEach((k) => { totals[k] = round2(totals[k]); });
    return totals;
  }, [scores]);

  // Grand total (including LO row if toggled)
  const grandTotal = useMemo(() => {
    const gt = { ...columnTotals };
    if (includeLoRow) {
      gt.total = round2(columnTotals.total + loTotal);
    }
    return gt;
  }, [columnTotals, includeLoRow, loTotal]);

  // Handle cell edits
  const handleScoreChange = (unitIdx, field, subField, value) => {
    const numVal = value === '' || value === '-' ? 0 : parseInt(value, 10) || 0;
    setScores((prev) => {
      const updated = prev.map((row, idx) => {
        if (idx !== unitIdx) return row;
        if (field === 'kScores') {
          return { ...row, kScores: { ...row.kScores, [subField]: numVal } };
        }
        return { ...row, [field]: numVal };
      });
      return recalcTotals(updated);
    });
    setEditedCells((prev) => {
      const next = new Set(prev);
      next.add(`${unitIdx}-${field}-${subField || ''}`);
      return next;
    });
  };

  const handleLoTotalChange = (value) => {
    const numVal = value === '' || value === '-' ? 0 : parseInt(value, 10) || 0;
    setLoTotal(numVal);
  };

  const isEdited = (unitIdx, field, subField) => {
    return editedCells.has(`${unitIdx}-${field}-${subField || ''}`);
  };

  const formatCell = (val) => {
    if (val === 0) return '-';
    return round2(val);
  };

  // Reset to auto-calculated
  const handleReset = () => {
    const auto = computeAutoScores();
    setScores(auto);
    setEditedCells(new Set());
    setLoTotal(0);
  };

  // Auto-calculate button (same as reset)
  const handleAutoCalc = () => {
    handleReset();
  };

  // Clear all scores to zero
  const handleClearScores = () => {
    if (unitCount === 0) return;
    const empty = parsedUnits.map(() => ({
      kScores: { K1: 0, K2: 0, K3: 0, K4: 0, K5: 0, K6: 0 },
      psychomotor: 0,
      affective: 0,
      application: 0,
      total: 0,
    }));
    setScores(empty);
    setEditedCells(new Set());
    setLoTotal(0);
  };

  // Build HTML table for exports
  const buildExportHtml = () => {
    // All styles use TH SarabunPSK font
    const FONT = 'font-family:"TH SarabunPSK","TH Sarabun New","Sarabun",sans-serif;';
    const thStyle = `${FONT} text-align:center; border:1px solid #000; padding:4px; font-size:16pt; background-color:#e8eaf6; font-weight:bold;`;
    const tdStyle = `${FONT} text-align:center; border:1px solid #000; padding:4px; font-size:16pt;`;
    const tdPink = `${FONT} text-align:center; border:1px solid #000; padding:4px; font-size:16pt; background-color:#fce4ec;`;
    const tdBold = `${FONT} text-align:center; border:1px solid #000; padding:4px; font-size:16pt; font-weight:bold;`;

    const fmtVal = (v) => (v === 0 ? '-' : round2(v));

    let html = `<div style="${FONT}">`;
    html += `<p style="${FONT} font-size:18pt;font-weight:bold;text-align:center;">ตารางวิเคราะห์พฤติกรรมการเรียนรู้</p>`;
    html += `<p style="${FONT} font-size:16pt;">รหัสวิชา: ${formData?.courseCode || '-'} &nbsp;&nbsp; ชื่อวิชา: ${formData?.courseName || '-'} &nbsp;&nbsp; หน่วยกิต: ${formData?.credits || '-'} &nbsp;&nbsp; ทฤษฎี: ${ratioT} ชม./สัปดาห์ &nbsp;&nbsp; ปฏิบัติ: ${ratioP} ชม./สัปดาห์</p>`;

    html += `<table border="1" style="${FONT} border-collapse:collapse; width:100%; font-size:16pt;">`;
    // Header row 1
    html += `<thead><tr>
      <th rowspan="2" style="${thStyle}">หน่วยการเรียนรู้</th>
      <th colspan="6" style="${thStyle}">พุทธิพิสัย (Cognitive)</th>
      <th rowspan="2" style="${thStyle}">ทักษะพิสัย</th>
      <th rowspan="2" style="${thStyle}">จิตพิสัย</th>
      <th rowspan="2" style="${thStyle}">ประยุกต์ใช้</th>
      <th rowspan="2" style="${thStyle}">รวม</th>
      <th rowspan="2" style="${thStyle}">ชม. ท/ป</th>
    </tr>`;
    // Header row 2
    html += '<tr>';
    K_LABELS.forEach(({ key, label }) => {
      html += `<th style="${thStyle}">${key}<br/>${label}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Data rows
    scores.forEach((row, idx) => {
      const unit = parsedUnits[idx];
      const h = unitHours[idx];
      html += '<tr>';
      html += `<td style="${tdStyle}text-align:left;">${unit?.name || `หน่วยที่ ${idx + 1}`}</td>`;
      K_LABELS.forEach(({ key }) => {
        html += `<td style="${tdStyle}">${fmtVal(row.kScores[key])}</td>`;
      });
      html += `<td style="${tdStyle}">${fmtVal(row.psychomotor)}</td>`;
      html += `<td style="${tdPink}">${fmtVal(row.affective)}</td>`;
      html += `<td style="${tdStyle}">${fmtVal(row.application)}</td>`;
      html += `<td style="${tdBold}">${fmtVal(row.total)}</td>`;
      html += `<td style="${tdStyle}">${h.theory}/${h.practice}</td>`;
      html += '</tr>';
    });

    // Summary row
    html += `<tr style="background-color:#f5f5f5;">`;
    html += `<td style="${tdBold}">รวม</td>`;
    K_LABELS.forEach(({ key }) => {
      html += `<td style="${tdBold}">${fmtVal(columnTotals[key])}</td>`;
    });
    html += `<td style="${tdBold}">${fmtVal(columnTotals.psychomotor)}</td>`;
    html += `<td style="${tdBold}">${fmtVal(columnTotals.affective)}</td>`;
    html += `<td style="${tdBold}">${fmtVal(columnTotals.application)}</td>`;
    html += `<td style="${tdBold}">${fmtVal(columnTotals.total)}</td>`;
    html += `<td style="${tdStyle}"></td>`;
    html += '</tr>';

    // LO row (if included)
    if (includeLoRow) {
      html += `<tr style="background-color:#fff8e1;">`;
      html += `<td style="${tdStyle}text-align:left;">ประเมินผลลัพธ์การเรียนรู้ฯ</td>`;
      K_LABELS.forEach(() => {
        html += `<td style="${tdStyle}">-</td>`;
      });
      html += `<td style="${tdStyle}">-</td>`;
      html += `<td style="${tdStyle}">-</td>`;
      html += `<td style="${tdStyle}">-</td>`;
      html += `<td style="${tdBold}">${fmtVal(loTotal)}</td>`;
      html += `<td style="${tdStyle}"></td>`;
      html += '</tr>';
    }

    // Grand total row
    html += `<tr style="background-color:#e8eaf6;">`;
    html += `<td style="${tdBold}">รวมทั้งรายวิชา</td>`;
    K_LABELS.forEach(({ key }) => {
      html += `<td style="${tdBold}">${fmtVal(grandTotal[key])}</td>`;
    });
    html += `<td style="${tdBold}">${fmtVal(grandTotal.psychomotor)}</td>`;
    html += `<td style="${tdBold}">${fmtVal(grandTotal.affective)}</td>`;
    html += `<td style="${tdBold}">${fmtVal(grandTotal.application)}</td>`;
    const gtColor = grandTotal.total === TOTAL_SCORE ? '' : 'color:red;';
    html += `<td style="${tdBold}${gtColor}">${fmtVal(grandTotal.total)}</td>`;
    html += `<td style="${tdStyle}"></td>`;
    html += '</tr>';

    html += '</tbody></table></div>';
    return html;
  };

  const _meta = {
    module: 'ตารางวิเคราะห์พฤติกรรม',
    courseCode: formData?.courseCode || '',
    courseName: formData?.courseName || '',
  };

  const _doExportWord = async () => {
    if (scores.length === 0) return;
    try {
      const response = await fetch('/template-be-table.docx');
      if (!response.ok) throw new Error('ไม่พบไฟล์ template');
      const arrayBuffer = await response.arrayBuffer();
      const zip = new PizZip(arrayBuffer);

      // Get document.xml
      const docXml = zip.file('word/document.xml').asText();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(docXml, 'application/xml');
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

      // Find all paragraphs for header info
      const paragraphs = xmlDoc.getElementsByTagNameNS(ns, 'p');

      // Helper for header: build TH SarabunPSK rPr (inline, because setCellText helpers
      // are defined later inside the try block)
      const makeHeaderRPr = (bold) => {
        const rPr = xmlDoc.createElementNS(ns, 'w:rPr');
        rPr.appendChild(xmlDoc.createElementNS(ns, 'w:noProof'));
        const rFonts = xmlDoc.createElementNS(ns, 'w:rFonts');
        rFonts.setAttribute('w:ascii', 'TH SarabunPSK');
        rFonts.setAttribute('w:hAnsi', 'TH SarabunPSK');
        rFonts.setAttribute('w:cs', 'TH SarabunPSK');
        rFonts.setAttribute('w:eastAsia', 'TH SarabunPSK');
        rPr.appendChild(rFonts);
        if (bold) {
          rPr.appendChild(xmlDoc.createElementNS(ns, 'w:b'));
          rPr.appendChild(xmlDoc.createElementNS(ns, 'w:bCs'));
        }
        const sz = xmlDoc.createElementNS(ns, 'w:sz');
        sz.setAttribute('w:val', '32');
        rPr.appendChild(sz);
        const szCs = xmlDoc.createElementNS(ns, 'w:szCs');
        szCs.setAttribute('w:val', '32');
        rPr.appendChild(szCs);
        rPr.appendChild(xmlDoc.createElementNS(ns, 'w:cs'));
        const lang = xmlDoc.createElementNS(ns, 'w:lang');
        lang.setAttribute('w:val', 'th-TH');
        lang.setAttribute('w:eastAsia', 'en-US');
        lang.setAttribute('w:bidi', 'th-TH');
        rPr.appendChild(lang);
        return rPr;
      };

      // Replace text in a paragraph with a single run using forced TH SarabunPSK rPr
      const replaceParaText = (para, newContent) => {
        while (para.getElementsByTagNameNS(ns, 'r').length > 0) {
          para.removeChild(para.getElementsByTagNameNS(ns, 'r')[0]);
        }
        const newRun = xmlDoc.createElementNS(ns, 'w:r');
        newRun.appendChild(makeHeaderRPr(false));
        const newText = xmlDoc.createElementNS(ns, 'w:t');
        newText.setAttribute('xml:space', 'preserve');
        newText.textContent = newContent;
        newRun.appendChild(newText);
        para.appendChild(newRun);
      };

      // Fill header paragraphs (paragraph 1: course info, paragraph 2: hours/credits)
      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i].textContent;
        if (text.includes('รหัส') && text.includes('ชื่อวิชา')) {
          replaceParaText(
            paragraphs[i],
            `รหัส ${formData?.courseCode || ''} ชื่อวิชา ${formData?.courseName || ''}`
          );
        }
        if (text.includes('ทฤษฎี') && text.includes('ปฏิบัติ') && text.includes('หน่วยกิต')) {
          replaceParaText(
            paragraphs[i],
            `ทฤษฎี ${ratioT} ชั่วโมง/สัปดาห์ ปฏิบัติ ${ratioP} ชั่วโมง/สัปดาห์ จำนวน ${formData?.credits || ''} หน่วยกิต`
          );
        }
      }

      // Find the table
      const tables = xmlDoc.getElementsByTagNameNS(ns, 'tbl');
      if (tables.length === 0) throw new Error('ไม่พบตารางใน template');
      const table = tables[0];
      const rows = table.getElementsByTagNameNS(ns, 'tr');

      // Helper: build an <w:rPr> that forces TH SarabunPSK + noProof + th-TH lang
      const buildThaiRPr = (opts = {}) => {
        const rPr = xmlDoc.createElementNS(ns, 'w:rPr');
        // <w:noProof/>
        rPr.appendChild(xmlDoc.createElementNS(ns, 'w:noProof'));
        // <w:rFonts ascii/hAnsi/cs/eastAsia="TH SarabunPSK"/>
        const rFonts = xmlDoc.createElementNS(ns, 'w:rFonts');
        rFonts.setAttribute('w:ascii', 'TH SarabunPSK');
        rFonts.setAttribute('w:hAnsi', 'TH SarabunPSK');
        rFonts.setAttribute('w:cs', 'TH SarabunPSK');
        rFonts.setAttribute('w:eastAsia', 'TH SarabunPSK');
        rPr.appendChild(rFonts);
        // <w:b/><w:bCs/> if bold
        if (opts.bold) {
          rPr.appendChild(xmlDoc.createElementNS(ns, 'w:b'));
          rPr.appendChild(xmlDoc.createElementNS(ns, 'w:bCs'));
        }
        // <w:sz w:val="32"/><w:szCs w:val="32"/> → 16pt
        const sz = xmlDoc.createElementNS(ns, 'w:sz');
        sz.setAttribute('w:val', '32');
        rPr.appendChild(sz);
        const szCs = xmlDoc.createElementNS(ns, 'w:szCs');
        szCs.setAttribute('w:val', '32');
        rPr.appendChild(szCs);
        // <w:cs/> so Thai text is treated as complex-script (prevents Latin fallback)
        rPr.appendChild(xmlDoc.createElementNS(ns, 'w:cs'));
        // <w:lang w:val="th-TH" w:eastAsia="en-US" w:bidi="th-TH"/>
        const lang = xmlDoc.createElementNS(ns, 'w:lang');
        lang.setAttribute('w:val', 'th-TH');
        lang.setAttribute('w:eastAsia', 'en-US');
        lang.setAttribute('w:bidi', 'th-TH');
        rPr.appendChild(lang);
        return rPr;
      };

      // Helper: set cell text with forced TH SarabunPSK font
      const setCellText = (row, colIdx, text, opts = {}) => {
        const cells = row.getElementsByTagNameNS(ns, 'tc');
        if (colIdx >= cells.length) return;
        const cell = cells[colIdx];
        const p = cell.getElementsByTagNameNS(ns, 'p')[0];
        if (!p) return;
        const existingRuns = p.getElementsByTagNameNS(ns, 'r');
        while (existingRuns.length > 0) {
          p.removeChild(existingRuns[0]);
        }
        const run = xmlDoc.createElementNS(ns, 'w:r');
        // Force TH SarabunPSK font on every new cell run
        run.appendChild(buildThaiRPr(opts));
        const t = xmlDoc.createElementNS(ns, 'w:t');
        t.setAttribute('xml:space', 'preserve');
        t.textContent = String(text);
        run.appendChild(t);
        p.appendChild(run);
      };

      const fmtVal = (v) => (v === 0 ? '-' : String(round2(v)));

      // Template has 3 header rows (0-2), 7 data rows (3-9), 3 summary rows (10-12)
      const dataStartRow = 3;
      const templateDataRows = 7;
      const unitCount = scores.length;

      // If more units than template rows, clone rows
      if (unitCount > templateDataRows) {
        const templateRow = rows[dataStartRow];
        for (let i = 0; i < unitCount - templateDataRows; i++) {
          const newRow = templateRow.cloneNode(true);
          const summaryRow = rows[dataStartRow + templateDataRows];
          table.insertBefore(newRow, summaryRow);
        }
      }

      // Re-get rows after possible insertions
      const allRows = table.getElementsByTagNameNS(ns, 'tr');

      // Fill data rows
      for (let idx = 0; idx < unitCount && idx < allRows.length - 3 - 3; idx++) {
        const row = allRows[dataStartRow + idx];
        const score = scores[idx];
        const unit = parsedUnits[idx];
        const h = unitHours[idx];

        setCellText(row, 0, `${unit?.no || idx + 1}. ${unit?.name || ''}`);
        setCellText(row, 1, fmtVal(score.kScores.K1));
        setCellText(row, 2, fmtVal(score.kScores.K2));
        setCellText(row, 3, fmtVal(score.kScores.K3));
        setCellText(row, 4, fmtVal(score.kScores.K4));
        setCellText(row, 5, fmtVal(score.kScores.K5));
        setCellText(row, 6, fmtVal(score.kScores.K6));
        setCellText(row, 7, fmtVal(score.psychomotor));
        setCellText(row, 8, fmtVal(score.affective));
        setCellText(row, 9, fmtVal(score.application));
        setCellText(row, 10, fmtVal(score.total));
        setCellText(row, 11, `${h.theory}/${h.practice}`);
      }

      // Clear unused data rows (if fewer units than 7)
      for (let idx = unitCount; idx < templateDataRows; idx++) {
        const rowIdx = dataStartRow + idx;
        if (rowIdx < allRows.length - 3) {
          const row = allRows[rowIdx];
          table.removeChild(row);
        }
      }

      // Re-get rows after possible removals
      const finalRows = table.getElementsByTagNameNS(ns, 'tr');
      const summaryStartIdx = finalRows.length - 3;

      // Fill summary row: "รวม"
      const sumRow = finalRows[summaryStartIdx];
      if (sumRow) {
        const sumCells = sumRow.getElementsByTagNameNS(ns, 'tc');
        if (sumCells.length >= 12) {
          setCellText(sumRow, 1, fmtVal(columnTotals.K1));
          setCellText(sumRow, 2, fmtVal(columnTotals.K2));
          setCellText(sumRow, 3, fmtVal(columnTotals.K3));
          setCellText(sumRow, 4, fmtVal(columnTotals.K4));
          setCellText(sumRow, 5, fmtVal(columnTotals.K5));
          setCellText(sumRow, 6, fmtVal(columnTotals.K6));
          setCellText(sumRow, 7, fmtVal(columnTotals.psychomotor));
          setCellText(sumRow, 8, fmtVal(columnTotals.affective));
          setCellText(sumRow, 9, fmtVal(columnTotals.application));
          setCellText(sumRow, 10, fmtVal(columnTotals.total));
          setCellText(sumRow, 11, `${unitHours.reduce((s, h) => s + h.theory, 0)}/${unitHours.reduce((s, h) => s + h.practice, 0)}`);
        }
      }

      // Fill "ประเมินผลลัพธ์" row (summaryStartIdx+1) — merged cells
      const loRow = finalRows[summaryStartIdx + 1];
      if (loRow && includeLoRow) {
        const loCells = loRow.getElementsByTagNameNS(ns, 'tc');
        if (loCells.length >= 3) {
          setCellText(loRow, 1, fmtVal(loTotal));
        }
      }

      // Fill "รวมทั้งรายวิชา" row (last row) — merged cells
      const grandRow = finalRows[summaryStartIdx + 2];
      if (grandRow) {
        const grandCells = grandRow.getElementsByTagNameNS(ns, 'tc');
        if (grandCells.length >= 3) {
          setCellText(grandRow, 1, fmtVal(grandTotal.total));
        }
      }

      // Serialize back
      const serializer = new XMLSerializer();
      const newXml = serializer.serializeToString(xmlDoc);
      zip.file('word/document.xml', newXml);

      const blob = zip.generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      saveAs(blob, `ตารางวิเคราะห์พฤติกรรม_${formData?.courseCode || ''}.docx`);
    } catch (err) {
      console.error('Export error:', err);
      onError?.(`ส่งออก Word ไม่สำเร็จ: ${err.message}`);
    }
  };
  const exportWord = () => dl(_doExportWord, _meta);

  const _doExportPdf = () => {
    if (scores.length === 0) return;
    printToPdf(`ตารางวิเคราะห์พฤติกรรมการเรียนรู้ ${formData?.courseCode || ''}`, buildExportHtml());
  };
  const exportPdf = () => dl(_doExportPdf, _meta);

  // Render a number input cell
  const renderInput = (value, onChange, extraClass = '', disabled = false) => {
    const displayVal = value === 0 ? '' : round2(value);
    return (
      <input
        type="number"
        step="1"
        min="0"
        value={displayVal}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-14 text-center text-xs border border-gray-300 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 ${extraClass} ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
        placeholder="-"
      />
    );
  };

  if (parsedUnits.length === 0) {
    return (
      <div className="pnp-shell-card rounded-xl p-5 md:p-6 min-h-[40vh]">
        <div className="mb-6 border-b border-gray-100 pb-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 className="text-indigo-600" />
            ตารางวิเคราะห์พฤติกรรมการเรียนรู้
          </h2>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <AlertTriangle size={48} className="mb-4" />
          <p className="text-lg">ไม่พบข้อมูลหน่วยการเรียนรู้</p>
          <p className="text-sm mt-2">กรุณาสร้างตารางแบ่งหน่วยการเรียนรู้ก่อน</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pnp-shell-card rounded-xl p-5 md:p-6">
      {/* Header */}
      <div className="mb-6 border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 className="text-indigo-600" />
          ตารางวิเคราะห์พฤติกรรมการเรียนรู้
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          วิเคราะห์และกำหนดคะแนนพฤติกรรมการเรียนรู้แต่ละหน่วย (คะแนนรวม 100 คะแนน)
        </p>
      </div>

      {/* Course Info Header */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div>
            <span className="text-indigo-600 font-semibold">รหัสวิชา</span>
            <p className="font-bold text-gray-800">{formData?.courseCode || '-'}</p>
          </div>
          <div>
            <span className="text-indigo-600 font-semibold">ชื่อวิชา</span>
            <p className="font-bold text-gray-800">{formData?.courseName || '-'}</p>
          </div>
          <div>
            <span className="text-indigo-600 font-semibold">ทฤษฎี</span>
            <p className="font-bold text-gray-800">{ratioT} ชม./สัปดาห์</p>
          </div>
          <div>
            <span className="text-indigo-600 font-semibold">ปฏิบัติ</span>
            <p className="font-bold text-gray-800">{ratioP} ชม./สัปดาห์</p>
          </div>
          <div>
            <span className="text-indigo-600 font-semibold">หน่วยกิต</span>
            <p className="font-bold text-gray-800">{formData?.credits || '-'}</p>
          </div>
        </div>
      </div>

      {/* ── Cognitive Selection Panel ── */}
      <div className="mb-6">
        {selectionCount === 0 && unitCount > 0 && !showCognitivePanel && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 px-4 py-2.5 rounded-t-xl flex items-center gap-2 text-sm font-medium animate-pulse">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            กรุณาเลือกจุดประสงค์พุทธิพิสัยก่อน เพื่อให้ตารางคำนวณได้ถูกต้อง
          </div>
        )}
        <button
          onClick={() => setShowCognitivePanel(!showCognitivePanel)}
          className={`w-full flex items-center justify-between px-5 py-5 border-2 transition-all font-bold text-lg ${
            selectionCount === 0 && unitCount > 0 && !showCognitivePanel ? 'rounded-b-xl' : 'rounded-xl'
          } ${
            showCognitivePanel
              ? 'bg-blue-50 border-blue-400 text-blue-800'
              : selectionCount === unitCount && unitCount > 0
                ? 'bg-green-50 border-green-400 text-green-800 hover:bg-green-100'
                : 'bg-gradient-to-r from-orange-500 to-red-500 border-orange-500 text-white hover:from-orange-600 hover:to-red-600 shadow-xl ring-2 ring-orange-300 ring-offset-2'
          }`}
        >
          <div className="flex items-center gap-3">
            <Brain size={28} />
            <div className="text-left">
              <div>⚡ ขั้นตอนสำคัญ: เลือกจุดประสงค์พุทธิพิสัย</div>
              <div className={`text-sm font-normal mt-1 ${showCognitivePanel ? 'text-blue-600' : selectionCount === unitCount && unitCount > 0 ? 'text-green-600' : 'text-orange-100'}`}>
                {selectionCount === 0
                  ? 'กรุณาเลือกจุดประสงค์เชิงพฤติกรรมด้านพุทธิพิสัย (K1-K6) ที่ต้องการใช้ในแต่ละหน่วย'
                  : `เลือกแล้ว ${selectionCount}/${unitCount} หน่วย`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectionCount === unitCount && unitCount > 0 && (
              <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">✓ ครบทุกหน่วย</span>
            )}
            {showCognitivePanel ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </button>

        {showCognitivePanel && (
          <div className="mt-3 border-2 border-blue-200 rounded-xl bg-white overflow-hidden">
            <div className="bg-blue-50 px-5 py-3 border-b border-blue-200">
              <p className="text-sm text-blue-700">
                <strong>คำแนะนำ:</strong> เลือกจุดประสงค์พุทธิพิสัยที่ต้องการใช้ในแต่ละหน่วย — ข้อมูลนี้จะส่งต่อไปยัง Module กิจกรรมการเรียนรู้และคำนวณคะแนนในตารางด้านล่าง
              </p>
            </div>

            <div className="divide-y divide-gray-100">
              {parsedUnits.map((unit, idx) => {
                const cognitive = objResults?.[idx]?.cognitive || [];
                const selected = behaviorSelections[idx] || [];
                const isExpanded = expandedUnit === idx;
                // Filter out headers and notes
                const selectableItems = cognitive.filter(
                  (item) => !item.startsWith('📌') && !item.startsWith('(คุณครู')
                );
                const isK1Item = (item) => /\(K1\)/.test(item);

                return (
                  <div key={idx}>
                    <button
                      onClick={() => {
                        const newIdx = isExpanded ? null : idx;
                        setExpandedUnit(newIdx);
                        if (newIdx !== null) {
                          setTimeout(() => {
                            const el = document.getElementById(`unit-cognitive-${idx}`);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 100);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition ${isExpanded ? 'bg-indigo-50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="bg-indigo-100 text-indigo-700 font-bold text-xs px-2 py-1 rounded-lg">{unit.no || idx + 1}</span>
                        <span className="font-semibold text-gray-800 text-sm">{unit.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selected.length > 0 ? (
                          <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                            เลือก {selected.length}/{selectableItems.length}
                          </span>
                        ) : (
                          <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">ยังไม่ได้เลือก</span>
                        )}
                        {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div id={`unit-cognitive-${idx}`} className="px-5 pb-4 bg-gray-50">
                        {cognitive.length === 0 ? (
                          <p className="text-sm text-gray-400 py-3">(ยังไม่มีข้อมูล — กรุณาสร้างจุดประสงค์เชิงพฤติกรรมก่อน)</p>
                        ) : (
                          <div className="space-y-2 pt-2">
                            {/* Header: เลือกพุทธิพิสัย */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded">พุทธิพิสัย (Cognitive)</span>
                              <span className="text-xs text-red-600 font-medium">(เลือกได้มากกว่า 1 ข้อ)</span>
                            </div>
                            {cognitive.map((item, i) => {
                              // หัวข้อ 📌
                              if (item.startsWith('📌')) {
                                return (
                                  <div key={i} className="bg-indigo-100 border-l-4 border-indigo-500 text-indigo-800 font-bold text-xs px-3 py-2 rounded-r mt-3 first:mt-0">
                                    {item}
                                  </div>
                                );
                              }
                              // คำแนะนำ
                              if (item.startsWith('(คุณครู')) {
                                return (
                                  <p key={i} className="text-red-600 font-bold text-xs mt-2 px-2 py-1">
                                    (การเลือกตรงนี้จะนำไปออกแบบกิจกรรมการเรียนรู้ วัดประเมินผล และสร้างตารางวิเคราะห์พฤติกรรมต่อไป)
                                  </p>
                                );
                              }
                              // จุดประสงค์ — checkbox
                              const isK1 = isK1Item(item);
                              const isDisabled = zeroK1 && isK1;
                              const isChecked = selected.includes(item);
                              return (
                                <label key={i} className={`flex items-start gap-2 rounded-lg p-2 transition-colors ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50'}`}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => !isDisabled && toggleCognitiveItem(idx, item)}
                                    disabled={isDisabled}
                                    className="mt-0.5 accent-blue-600"
                                  />
                                  <span className={`text-sm ${isDisabled ? 'text-gray-400' : 'text-gray-700'}`}>
                                    {item}
                                    {isDisabled && (
                                      <span className="text-red-500 text-xs font-medium ml-1">(จุดประสงค์รายวิชาสูงกว่าขั้นความเข้าใจ)</span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}

                            {/* Locked domains (read-only) */}
                            {[
                              { key: 'psychomotor', label: 'ทักษะพิสัย (Psychomotor)', color: 'green' },
                              { key: 'affective', label: 'จิตพิสัย (Affective)', color: 'pink' },
                              { key: 'application', label: 'การประยุกต์ใช้ (Application)', color: 'purple' },
                            ].map(({ key, label, color }) => {
                              const items = objResults?.[idx]?.[key] || [];
                              if (items.length === 0) return null;
                              return (
                                <div key={key} className="mt-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`bg-${color}-100 text-${color}-800 text-xs font-bold px-2 py-0.5 rounded`}>{label}</span>
                                    <Lock size={12} className="text-gray-400" />
                                    <span className="text-xs text-gray-400">บังคับใช้ทั้งหมด</span>
                                  </div>
                                  <div className="space-y-1 pl-2">
                                    {items.map((item, j) => (
                                      <div key={j} className={`flex items-start gap-2 bg-${color}-50 rounded-lg p-1.5`}>
                                        <Check size={14} className={`text-${color}-600 mt-0.5 shrink-0`} />
                                        <span className="text-xs text-gray-600">{item}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Lock section if cognitive not fully selected */}
      {selectionCount < unitCount && (
        <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center text-gray-400 mb-6">
          <Lock size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-bold text-gray-500 mb-1">กรุณาเลือกจุดประสงค์พุทธิพิสัยให้ครบทุกหน่วยก่อน</p>
          <p className="text-sm">เลือกแล้ว {selectionCount}/{unitCount} หน่วย — ตารางคะแนนจะปลดล็อกเมื่อเลือกครบ</p>
        </div>
      )}

      <div className={selectionCount < unitCount ? 'opacity-30 pointer-events-none select-none' : ''}>

      {/* Score summary badges */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
          พุทธิพิสัย: {round2(cognitiveTotal)} คะแนน (หน่วยกิต ท={theoryCredits})
        </span>
        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
          ทักษะพิสัย: {round2(psychomotorTotal)} คะแนน
        </span>
        <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-medium">
          การประยุกต์ใช้: {round2(applicationTotal)} คะแนน
        </span>
        <span className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full font-medium">
          จิตพิสัย: {AFFECTIVE_TOTAL} คะแนน (คงที่)
        </span>
        <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-medium">
          หน่วยกิต ป={practiceCredits} → ทักษะ:ประยุกต์ = 4:1
        </span>
      </div>

      {/* Export & Actions Bar */}
      <div className="flex items-center justify-between bg-indigo-50 p-3 rounded-lg border border-indigo-200 mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-indigo-800 text-sm">
            <Check size={16} />
            <span className="font-medium">คะแนน</span>
          </div>
          <button
            onClick={handleAutoCalc}
            className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded-lg hover:bg-blue-800 transition font-medium shadow-sm"
          >
            คำนวณอัตโนมัติ
          </button>
          <button
            onClick={handleClearScores}
            className="text-xs bg-white border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition font-medium"
          >
            ล้างคะแนน
          </button>
        </div>
        <ExportButtons onExportWord={exportWord} onExportPdf={exportPdf} />
      </div>

      {/* K1=0 warning */}
      {zeroK1 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-lg mb-4 flex items-center gap-2 text-sm">
          <AlertTriangle size={16} />
          จุดประสงค์รายวิชาข้อ 1 เริ่มต้นด้วย "เข้าใจ" — คอลัมน์ K1 (ความรู้) จะเป็น 0 ทุกหน่วย
        </div>
      )}

      {/* Grand total warning */}
      {grandTotal.total !== TOTAL_SCORE && (
        <div className="bg-red-50 border border-red-300 text-red-700 p-3 rounded-lg mb-4 flex items-center gap-2 text-sm font-medium">
          <AlertTriangle size={16} />
          คะแนนรวมทั้งรายวิชา = {round2(grandTotal.total)} (ต้องเท่ากับ {TOTAL_SCORE} คะแนน)
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
        <table className="min-w-[900px] w-full border-collapse text-xs">
          {/* Table Header */}
          <thead>
            <tr className="text-white">
              <th rowSpan={2} className="border border-gray-400 px-2 py-2 text-center font-bold w-40 sticky left-0 bg-gray-700 z-10">
                หน่วยการเรียนรู้
              </th>
              <th colSpan={6} className="border border-blue-400 px-2 py-1 text-center font-bold bg-blue-700">
                พุทธิพิสัย (Cognitive)
              </th>
              <th rowSpan={2} className="border border-green-400 px-2 py-2 text-center font-bold w-16 bg-green-700">
                ทักษะ<br />พิสัย
              </th>
              <th rowSpan={2} className="border border-pink-400 px-2 py-2 text-center font-bold w-16 bg-pink-700">
                จิต<br />พิสัย
              </th>
              <th rowSpan={2} className="border border-amber-400 px-2 py-2 text-center font-bold w-16 bg-amber-700">
                ประยุกต์<br />ใช้
              </th>
              <th rowSpan={2} className="border border-gray-400 px-2 py-2 text-center font-bold w-14 bg-gray-700">
                รวม
              </th>
              <th rowSpan={2} className="border border-gray-400 px-2 py-2 text-center font-bold w-20 bg-gray-700">
                ชม.<br />ท/ป
              </th>
            </tr>
            <tr className="bg-blue-500 text-white">
              {K_LABELS.map(({ key, label }) => (
                <th key={key} className="border border-blue-400 px-1 py-1 text-center font-medium w-14">
                  {key}<br /><span className="text-[10px] font-normal opacity-90">{label}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Data rows */}
            {scores.map((row, idx) => {
              const unit = parsedUnits[idx];
              const h = unitHours[idx];
              return (
                <tr key={idx} className="hover:bg-indigo-50/30 transition">
                  <td className="border border-gray-300 px-2 py-2 text-left font-medium text-gray-800 sticky left-0 bg-white z-10">
                    <span className="text-indigo-500 font-bold mr-1">{unit?.no || idx + 1}.</span>
                    {unit?.name || `หน่วยที่ ${idx + 1}`}
                  </td>
                  {K_LABELS.map(({ key }) => (
                    <td
                      key={key}
                      className={`border border-gray-300 px-0.5 py-1 text-center ${isEdited(idx, 'kScores', key) ? 'bg-yellow-50' : 'bg-blue-50'} ${zeroK1 && key === 'K1' ? 'bg-gray-100' : ''}`}
                    >
                      {renderInput(
                        row.kScores[key],
                        (val) => handleScoreChange(idx, 'kScores', key, val),
                        isEdited(idx, 'kScores', key) ? 'border-yellow-400 bg-yellow-50' : '',
                        zeroK1 && key === 'K1'
                      )}
                    </td>
                  ))}
                  <td className={`border border-gray-300 px-0.5 py-1 text-center ${isEdited(idx, 'psychomotor', '') ? 'bg-yellow-50' : 'bg-green-50'}`}>
                    {renderInput(
                      row.psychomotor,
                      (val) => handleScoreChange(idx, 'psychomotor', '', val),
                      isEdited(idx, 'psychomotor', '') ? 'border-yellow-400 bg-yellow-50' : ''
                    )}
                  </td>
                  <td className="border border-gray-300 px-0.5 py-1 text-center bg-pink-50">
                    {renderInput(
                      row.affective,
                      (val) => handleScoreChange(idx, 'affective', '', val),
                      `bg-pink-50 ${isEdited(idx, 'affective', '') ? 'border-yellow-400' : 'border-pink-200'}`
                    )}
                  </td>
                  <td className={`border border-gray-300 px-0.5 py-1 text-center ${isEdited(idx, 'application', '') ? 'bg-yellow-50' : 'bg-amber-50'}`}>
                    {renderInput(
                      row.application,
                      (val) => handleScoreChange(idx, 'application', '', val),
                      isEdited(idx, 'application', '') ? 'border-yellow-400 bg-yellow-50' : ''
                    )}
                  </td>
                  <td className="border border-gray-300 px-1 py-1 text-center font-bold text-gray-800 bg-gray-50">
                    {formatCell(row.total)}
                  </td>
                  <td className="border border-gray-300 px-1 py-1 text-center text-gray-600">
                    {h.theory}/{h.practice}
                  </td>
                </tr>
              );
            })}

            {/* Summary row: รวม */}
            <tr className="bg-gray-50 font-bold">
              <td className="border border-gray-300 px-2 py-2 text-center text-gray-800 sticky left-0 bg-gray-50 z-10">
                รวม
              </td>
              {K_LABELS.map(({ key }) => (
                <td key={key} className="border border-gray-300 px-1 py-2 text-center text-blue-800 bg-blue-50">
                  {formatCell(columnTotals[key])}
                </td>
              ))}
              <td className="border border-gray-300 px-1 py-2 text-center text-green-800 bg-green-50">
                {formatCell(columnTotals.psychomotor)}
              </td>
              <td className="border border-gray-300 px-1 py-2 text-center text-pink-700 bg-pink-50">
                {formatCell(columnTotals.affective)}
              </td>
              <td className="border border-gray-300 px-1 py-2 text-center text-amber-800 bg-amber-50">
                {formatCell(columnTotals.application)}
              </td>
              <td className="border border-gray-300 px-1 py-2 text-center text-gray-900">
                {formatCell(columnTotals.total)}
              </td>
              <td className="border border-gray-300 px-1 py-2 text-center text-gray-500">
                {unitHours.reduce((s, h) => s + h.theory, 0)}/{unitHours.reduce((s, h) => s + h.practice, 0)}
              </td>
            </tr>

            {/* ประเมินผลลัพธ์การเรียนรู้ระดับรายวิชา row */}
            <tr className={`${includeLoRow ? 'bg-amber-50' : 'bg-gray-50 opacity-60'} transition`}>
              <td className={`border border-gray-300 px-2 py-2 text-left text-sm sticky left-0 z-10 ${includeLoRow ? 'bg-amber-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIncludeLoRow(!includeLoRow)}
                    className="flex-shrink-0 text-indigo-600 hover:text-indigo-800 transition"
                    title={includeLoRow ? 'ไม่รวมคะแนน' : 'รวมคะแนน'}
                  >
                    {includeLoRow ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <span className="text-xs font-medium text-gray-700 leading-tight">
                    ประเมินผลลัพธ์การเรียนรู้<br />ระดับรายวิชา
                  </span>
                </div>
              </td>
              {K_LABELS.map(({ key }) => (
                <td key={key} className="border border-gray-300 px-0.5 py-1 text-center bg-blue-50 text-gray-400">
                  -
                </td>
              ))}
              <td className="border border-gray-300 px-0.5 py-1 text-center bg-green-50 text-gray-400">-</td>
              <td className="border border-gray-300 px-0.5 py-1 text-center bg-pink-50 text-gray-400">-</td>
              <td className="border border-gray-300 px-0.5 py-1 text-center bg-amber-50 text-gray-400">-</td>
              <td className="border border-gray-300 px-0.5 py-1 text-center font-bold text-gray-700">
                {renderInput(
                  loTotal,
                  (val) => handleLoTotalChange(val),
                  includeLoRow ? 'border-amber-400 font-bold' : 'opacity-50',
                  !includeLoRow
                )}
              </td>
              <td className="border border-gray-300 px-1 py-1 text-center text-amber-700 text-xs">
                {includeLoRow ? `${ratioT}/${ratioP}` : '-'}
              </td>
            </tr>

            {/* Grand total row: รวมทั้งรายวิชา */}
            <tr className={`font-bold ${grandTotal.total === TOTAL_SCORE ? 'bg-green-50' : 'bg-red-50'}`}>
              <td className={`border border-gray-300 px-2 py-2 text-center sticky left-0 z-10 ${grandTotal.total === TOTAL_SCORE ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                รวมทั้งรายวิชา
              </td>
              {K_LABELS.map(({ key }) => (
                <td key={key} className={`border border-gray-300 px-1 py-2 text-center bg-blue-50 ${grandTotal.total === TOTAL_SCORE ? 'text-blue-800' : 'text-red-800'}`}>
                  {formatCell(grandTotal[key])}
                </td>
              ))}
              <td className={`border border-gray-300 px-1 py-2 text-center bg-green-50 ${grandTotal.total === TOTAL_SCORE ? 'text-green-800' : 'text-red-800'}`}>
                {formatCell(grandTotal.psychomotor)}
              </td>
              <td className={`border border-gray-300 px-1 py-2 text-center bg-pink-50 ${grandTotal.total === TOTAL_SCORE ? 'text-pink-700' : 'text-red-800'}`}>
                {formatCell(grandTotal.affective)}
              </td>
              <td className={`border border-gray-300 px-1 py-2 text-center bg-amber-50 ${grandTotal.total === TOTAL_SCORE ? 'text-amber-800' : 'text-red-800'}`}>
                {formatCell(grandTotal.application)}
              </td>
              <td className={`border border-gray-300 px-2 py-2 text-center text-base ${grandTotal.total === TOTAL_SCORE ? 'text-green-800' : 'text-red-700'}`}>
                {round2(grandTotal.total)}
                {grandTotal.total === TOTAL_SCORE && <Check size={14} className="inline ml-1 text-green-600" />}
                {grandTotal.total !== TOTAL_SCORE && <AlertTriangle size={14} className="inline ml-1 text-red-500" />}
              </td>
              <td className="border border-gray-300 px-1 py-2 text-center text-gray-500 text-xs">
                {(() => {
                  const uT = unitHours.reduce((s, h) => s + h.theory, 0);
                  const uP = unitHours.reduce((s, h) => s + h.practice, 0);
                  const loT = includeLoRow ? ratioT : 0;
                  const loP = includeLoRow ? ratioP : 0;
                  const gT = isAdvanced ? uT : uT + loT;
                  const gP = isAdvanced ? uP : uP + loP;
                  return `${gT}/${gP}`;
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer notes */}
      <div className="mt-4 text-xs text-gray-400 space-y-1">
        <p>* คลิกที่ช่องคะแนนเพื่อแก้ไข ระบบจะคำนวณยอดรวมให้อัตโนมัติ</p>
        <p>* ช่องที่มีพื้นหลังสีเหลืองคือค่าที่ถูกแก้ไขจากค่าที่คำนวณอัตโนมัติ</p>
        <p>* กดปุ่ม "รีเซ็ตคะแนน" เพื่อกลับไปใช้ค่าที่คำนวณอัตโนมัติ</p>
        {zeroK1 && <p>* K1 (ความรู้) = 0 ทุกหน่วย เนื่องจากจุดประสงค์รายวิชาข้อ 1 เริ่มต้นด้วย "เข้าใจ"</p>}
      </div>

      {/* Next step navigation */}
      <div className="mt-8 text-center bg-gray-50 p-6 rounded-xl border border-gray-200">
        <h4 className="text-gray-700 font-bold mb-3">ขั้นตอนต่อไป</h4>
        {grandTotal.total !== TOTAL_SCORE ? (
          <div className="text-red-600 font-medium flex items-center justify-center gap-2">
            <AlertTriangle size={18} />
            คะแนนรวมต้องเท่ากับ {TOTAL_SCORE} คะแนน (ตอนนี้ {round2(grandTotal.total)} คะแนน) จึงจะไปขั้นตอนต่อไปได้
          </div>
        ) : (
          <button onClick={() => onNavigate?.('activities')} className="pnp-action-inline px-8 py-3 mx-auto">
            ไปขั้นตอนต่อไป: กิจกรรมการเรียนรู้ <ArrowRight size={20} />
          </button>
        )}
      </div>

      </div>{/* end lock wrapper */}
    </div>
  );
};

export default BehaviorTableModule;
