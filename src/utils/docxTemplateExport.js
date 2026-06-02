import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { parseUnitTable } from './markdownTable';

/**
 * แก้ placeholder ที่ Word Grammar/Spell checker ตัด run ขาดเป็นหลายส่วน
 * เช่น "{#units}" อาจถูกตัดเป็น "{#</w:t></w:r><w:proofErr/>...<w:t>units}"
 * ทำให้ docxtemplater หา placeholder ไม่เจอและ render ผิดเพี้ยน
 *
 * แนวทาง: หา { ... } ใน XML แล้ว strip tag XML ระหว่าง { กับ } ออก
 * โดยไม่ทำลายโครงสร้าง XML รอบข้าง (เนื่องจาก regex จับเฉพาะใน {...})
 */
function fixBrokenPlaceholders(xml) {
  // จับ {...} ที่ไม่มี { ซ้อน — อนุญาตให้มี XML tags ข้างใน
  return xml.replace(/\{[^{}]*?\}/g, (match) => {
    if (!match.includes('<')) return match;  // ไม่ broken
    // ดึงเฉพาะ text นอก tag
    const cleaned = match.replace(/<[^>]+>/g, '');
    return cleaned;
  });
}

/**
 * Preprocess ZIP: แก้ document.xml (และ header/footer ถ้ามี) ก่อนส่งให้ docxtemplater
 */
function preprocessDocxZip(zip) {
  const filesToFix = [
    'word/document.xml',
    'word/header1.xml', 'word/header2.xml', 'word/header3.xml',
    'word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml',
  ];
  filesToFix.forEach((path) => {
    if (zip.file(path)) {
      const xml = zip.file(path).asText();
      const fixed = fixBrokenPlaceholders(xml);
      if (fixed !== xml) {
        zip.file(path, fixed);
      }
    }
  });
  return zip;
}

/**
 * Load Template.docx from public folder, fill placeholders, and download.
 *
 * @param {object} data — all placeholder values
 * @param {string} filename — output filename (without .docx)
 */
export async function generateDocxFromTemplate(data, filename = 'แผนรายหน่วย') {
  // 1. Fetch the template
  const response = await fetch('/Template.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ Template.docx');
  const arrayBuffer = await response.arrayBuffer();

  // 2. Load into PizZip + Docxtemplater
  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  // 3. Sanitize data — replace undefined/null with '' to prevent "undefined" text
  const safeData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v == null ? '' : v])
  );
  // 4. Render (pass data directly — .setData() deprecated in newer docxtemplater)
  try {
    doc.render(safeData);
  } catch (err) {
    console.error('Docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  // 5. Generate output and download
  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  saveAs(out, `${filename}.docx`);
}

/**
 * Build the full data object for Template.docx from all module results.
 *
 * @param {object} params
 * @param {object} params.formData — course form data
 * @param {object[]} params.loResults — learning outcomes per unit
 * @param {object[]} params.compResults — competencies per unit
 * @param {object[]} params.objResults — objectives per unit
 * @param {object[]} params.conceptResults — concepts per unit
 * @param {object[]} params.activitiesResults — activities per unit (stored with _unitIdx key)
 * @param {object[]} params.mediaResults — media per unit (overrides pipeline)
 * @param {object[]} params.evidenceResults — evidence per unit (overrides pipeline)
 * @param {object[]} params.assessmentResults — assessment per unit (overrides pipeline)
 * @param {object[]} params.units — parsed unit table [{no, name, topics, theory, practice, total}]
 * @param {number} params.unitIndex — which unit to export (0-based), or -1 for all
 */
export function buildTemplateData({
  formData,
  loResults,
  compResults,
  objResults,
  conceptResults,
  activitiesResults,
  mediaResults,
  evidenceResults,
  assessmentResults,
  units,
  unitIndex = 0,
}) {
  const fd = formData || {};
  const { theory, practice } = parseRatio(fd.ratio);

  // Auto-detect program level from first digit of course code
  // 2xxxx = ปวช., 3xxxx = ปวส.
  const courseCode = (fd.courseCode || '').trim();
  const firstDigit = courseCode.replace(/\D/g, '')[0];
  const programLevel = firstDigit === '2'
    ? 'หลักสูตรประกาศนียบัตรวิชาชีพ (ปวช.)'
    : firstDigit === '3'
    ? 'หลักสูตรประกาศนียบัตรวิชาชีพชั้นสูง (ปวส.)'
    : '';

  // Course-level data (ส่วนที่ 1: หลักสูตรรายวิชา)
  const baseData = {
    programLevel,
    vocationType: fd.vocationType || '',
    occupationGroup: fd.occupationGroup || '',
    department: fd.department || '',
    courseCode: fd.courseCode || '',
    courseName: fd.courseName || '',
    theoryHours: String(theory),
    practiceHours: String(practice),
    credits: fd.credits || '',
    standardRef: fd.standardRef || '-',
    learningOutcomes: fd.learningOutcomes || '',
    objectives: fd.objectives || '',
    competencies: fd.competencies || '',
    // Loop arrays for first-page (each item = separate paragraph with indent)
    objectivesList: (fd.objectives || '').split('\n').filter(Boolean),
    competenciesList: (fd.competencies || '').split('\n').filter(Boolean),
    learningOutcomesList: (fd.learningOutcomes || '').split('\n').filter(Boolean),
    standardRefList: (fd.standardRef || '-').split('\n').filter(Boolean),
    description: fd.description || '',
  };

  // Unit-level data (ส่วนที่ 4: แผนการจัดการเรียนรู้)
  const unit = units?.[unitIndex];
  const lo = loResults?.[unitIndex];
  const comp = compResults?.[unitIndex];
  const obj = objResults?.[unitIndex];
  const concept = conceptResults?.[unitIndex];

  const comps = Array.isArray(comp?.competencies) ? comp.competencies : [];

  // Objectives per domain
  const allCognitive = Array.isArray(obj?.cognitive) ? obj.cognitive : [];
  const psychomotor = Array.isArray(obj?.psychomotor) ? obj.psychomotor : [];
  const affective = Array.isArray(obj?.affective) ? obj.affective : [];
  const application = Array.isArray(obj?.application) ? obj.application : [];

  // Use only selected cognitive objectives from activitiesResults (if available)
  const actForObj = (activitiesResults || []).find((r) => r._unitIdx === unitIndex)
    || (activitiesResults || [])[unitIndex];
  const selectedCognitive = Array.isArray(actForObj?._selectedCognitive) && actForObj._selectedCognitive.length > 0
    ? actForObj._selectedCognitive
    : allCognitive;

  // Build combined objectives list (all 4 domains, numbered sequentially)
  const allObjItems = [
    ...selectedCognitive,
    ...psychomotor,
    ...affective,
    ...application,
  ];
  const objectives = allObjItems
    .map((item, i) => `${i + 1}. ${String(item).replace(/^\d+\.\s*/, '')}`)
    .join('\n');

  // Keep legacy obj41-obj44 for backward compatibility
  const obj41 = selectedCognitive.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const obj42 = psychomotor.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const obj43 = affective.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const obj44 = application.map((c, i) => `${i + 1}. ${c}`).join('\n');

  // Concept text — may be string or array from AI
  const rawConcept = concept?.concept;
  const conceptText = Array.isArray(rawConcept)
    ? rawConcept.join('\n')
    : String(rawConcept || '');

  // ── Sections 6-9: Activities, Media, Evidence, Assessment ─────────────────
  // activitiesResults stores per-unit objects with _unitIdx; find by index
  const actByIdx = (activitiesResults || []).find((r) => r._unitIdx === unitIndex);
  const actByOrder = (activitiesResults || [])[unitIndex];
  const act = actByIdx || actByOrder || {};

  // Helper: clean item — remove internal line breaks
  // Clean text: keep \n before numbered items (1. 2. 3.), remove other \n
  const cl = (s) => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/\n(?!\s*\d+\.)/g, ' ').replace(/\n\s*(?=\d+\.)/g, '\n').replace(/ +/g, ' ').trim();

  // Section 6 - Activities
  const activitiesList = act.activities || [];
  const activitiesText = activitiesList.length
    ? activitiesList.map((a, i) => `${i + 1}. ${cl(a.name)} (${cl(a.type)}, ${cl(a.duration)})\n   ครู: ${cl(a.teacherAction)}\n   นักเรียน: ${cl(a.studentAction)}`).join('\n')
    : '';

  // Section 7 - Media
  const mediaList = act.media || (mediaResults || [])[unitIndex]?.media || [];
  const mediaText = mediaList.length
    ? mediaList.map((m, i) => `${i + 1}. ${cl(m.name)} (${cl(m.type)}) — ${cl(m.description)}`).join('\n')
    : '';

  // Section 8 - Evidence
  const knowledgeEvList = act.knowledgeEvidence || (evidenceResults || [])[unitIndex]?.knowledgeEvidence || [];
  const perfEvList = act.performanceEvidence || (evidenceResults || [])[unitIndex]?.performanceEvidence || [];
  const knowledgeEvidenceText = knowledgeEvList.map((e, i) => `${i + 1}. ${cl(e)}`).join('\n');
  const performanceEvidenceText = perfEvList.map((e, i) => `${i + 1}. ${cl(e)}`).join('\n');

  // Section 9 - Assessment
  const assessUnit = (assessmentResults || [])[unitIndex] || {};
  const critList = assessUnit.performanceCriteria || act.performanceCriteria || [];
  const methodList = assessUnit.assessmentMethods || act.assessmentMethods || [];
  const toolList = assessUnit.assessmentTools || act.assessmentTools || [];
  const performanceCriteriaText = critList.map((e, i) => `${i + 1}. ${cl(e)}`).join('\n');
  const assessmentMethodsText = methodList.map((e, i) => `${i + 1}. ${cl(e)}`).join('\n');
  const assessmentToolsText = toolList.map((e, i) => `${i + 1}. ${cl(e)}`).join('\n');

  return {
    ...baseData,
    // Unit info
    unitNo: unit?.no || String(unitIndex + 1),
    weekNo: '',  // รายหน่วย ไม่มีสัปดาห์
    unitName: unit?.name || lo?.unitName || `หน่วยที่ ${unitIndex + 1}`,
    unitTheory: unit?.theory || String(theory),
    unitPractice: unit?.practice || String(practice),
    unitTopics: unit?.topics?.replace(/<br\s*\/?>/gi, '\n') || '',
    // Section 1 - Learning outcome
    outcome: cl(lo?.outcome || ''),
    // Section 3 - Competencies
    comp: comps.map((c, i) => `\t${i + 1}. ${cl(c).replace(/^\d+\.\s*/, '')}`).join('\n'),
    comp1: String(comps[0] || '').replace(/^\d+\.\s*/, ''),
    comp2: String(comps[1] || '').replace(/^\d+\.\s*/, ''),
    // Section 4 - Objectives (combined single placeholder + legacy split)
    objectives,
    obj41,
    obj42,
    obj43,
    obj44,
    // Section 5 - Content/Concepts
    concept: conceptText.replace(/<br\s*\/?>/gi, '\n'),
    // Section 6 - Activities
    activities: activitiesText,
    teacherLevel: act._teacherLevel || '',
    teachingMethods: (act._methods || []).join(', '),
    // Section 7 - Media
    media: mediaText,
    // Section 8 - Evidence
    knowledgeEvidence: knowledgeEvidenceText,
    performanceEvidence: performanceEvidenceText,
    // Section 9 - Assessment
    performanceCriteria: performanceCriteriaText,
    assessmentMethods: assessmentMethodsText,
    assessmentTools: assessmentToolsText,
    // Assessment table rows for {#assessmentRows} loop
    assessmentRows: Array.from({ length: Math.max(critList.length, methodList.length, toolList.length, 1) }, (_, i) => ({
      criteria: critList[i] || '-',
      method: methodList[i] || '-',
      tool: toolList[i] || '-',
    })),
  };
}

/**
 * Build template data for a SINGLE WEEK within a unit (for weekly plan export).
 * Uses Template.docx with สอนครั้งที่ = weekNo.
 */
export function buildWeeklyTemplateData({
  formData, loResults, compResults, objResults, conceptResults,
  activitiesResults, mediaResults, evidenceResults, assessmentResults,
  units, unitIndex = 0, weekNo = 1,
}) {
  // Start with the base unit data (sections 1-5 are the same every week)
  const baseData = buildTemplateData({
    formData, loResults, compResults, objResults, conceptResults,
    activitiesResults, mediaResults, evidenceResults, assessmentResults,
    units, unitIndex,
  });

  const fd = formData || {};
  const { theory, practice } = parseRatio(fd.ratio);

  // ── Fix 1: Sort cognitive objectives by K1→K6 ──
  const obj = objResults?.[unitIndex];
  const actForObj = (activitiesResults || []).find((r) => r._unitIdx === unitIndex) || (activitiesResults || [])[unitIndex];
  const allCognitive = Array.isArray(obj?.cognitive) ? obj.cognitive.filter(c => !c.startsWith('📌') && !c.startsWith('(คุณครู')) : [];
  const selectedCognitive = Array.isArray(actForObj?._selectedCognitive) && actForObj._selectedCognitive.length > 0
    ? actForObj._selectedCognitive : allCognitive;

  // Sort by Bloom level K1→K6
  const sortedCognitive = [...selectedCognitive].sort((a, b) => {
    const getK = (s) => { const m = s.match(/\(K(\d)\)/); return m ? parseInt(m[1]) : 2; };
    return getK(a) - getK(b);
  });

  const psychomotor = Array.isArray(obj?.psychomotor) ? obj.psychomotor : [];
  const affective = Array.isArray(obj?.affective) ? obj.affective : [];
  const application = Array.isArray(obj?.application) ? obj.application : [];

  // Helper: clean item text — remove internal line breaks so each item stays on 1 line
  // Clean text: keep \n before numbered items (1. 2. 3.), remove other \n
  const clean = (s) => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/\n(?!\s*\d+\.)/g, ' ').replace(/\n\s*(?=\d+\.)/g, '\n').replace(/ +/g, ' ').trim();

  // Combined objectives numbered sequentially with TAB indent
  const allObjItems = [...sortedCognitive, ...psychomotor, ...affective, ...application];
  const objectives = allObjItems.map((item, i) => `\t${i + 1}. ${clean(item).replace(/^\d+\.\s*/, '')}`).join('\n');

  // ── Concept as flowing text ──
  const rawConcept = conceptResults?.[unitIndex]?.concept;
  const conceptText = Array.isArray(rawConcept) ? rawConcept.join(' ') : String(rawConcept || '');
  const concept = '\t' + conceptText.replace(/<br\s*\/?>/gi, ' ').replace(/^[-•]\s*/gm, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

  // ── Per-week data (sections 6-9) ──
  const act = (activitiesResults || []).find((r) => r._unitIdx === unitIndex) || (activitiesResults || [])[unitIndex] || {};
  const allActivities = act.activities || [];
  const weekActivities = allActivities.filter(a => (a.week || 1) === weekNo);

  // ชื่อเรื่อง/งาน = assignment ของสัปดาห์นั้น หรือ ชื่อกิจกรรมหลัก
  const weekAssignment = weekActivities.find(a => a.assignment)?.assignment || '';
  const weekTopicName = weekAssignment || weekActivities.map(a => a.name).filter(Boolean).join(', ') || baseData.unitTopics;

  // Section 6 - Activities grouped by phase (ขั้นนำ/ขั้นสอน/ขั้นสรุป)
  const phaseGroups = {
    'ขั้นนำเข้าสู่บทเรียน': [],
    'ขั้นสอน': [],
    'ขั้นปฏิบัติ/กิจกรรม': [],
    'ขั้นสรุปและประเมินผล': [],
  };
  weekActivities.forEach(a => {
    const phase = a.phase || 'ขั้นสอน';
    const matchedPhase = Object.keys(phaseGroups).find(p => phase.includes(p.replace('ขั้น', '')) || p.includes(phase)) || 'ขั้นสอน';
    phaseGroups[matchedPhase].push(a);
  });

  let activitiesText = '';
  const phaseNames = { 'ขั้นนำเข้าสู่บทเรียน': 'ขั้นนำเข้าสู่บทเรียน', 'ขั้นสอน': 'ขั้นสอน', 'ขั้นปฏิบัติ/กิจกรรม': 'ขั้นปฏิบัติ/กิจกรรม', 'ขั้นสรุปและประเมินผล': 'ขั้นสรุปและประเมินผล' };
  for (const [phase, items] of Object.entries(phaseGroups)) {
    if (items.length === 0) continue;
    activitiesText += `\t${phaseNames[phase] || phase}\n`;
    items.forEach((a, i) => {
      activitiesText += `\t\t${i + 1}. ${clean(a.name)} (${clean(a.duration)})\n`;
      if (a.teacherAction) activitiesText += `\t\t   กิจกรรมครู: ${clean(a.teacherAction)}\n`;
      if (a.studentAction) activitiesText += `\t\t   กิจกรรมนักเรียน: ${clean(a.studentAction)}\n`;
    });
  }
  activitiesText = activitiesText.trim();

  // Section 7 - Media with TAB
  const weekMaterials = [];
  weekActivities.forEach(a => {
    const mats = typeof a.materials === 'string' ? [a.materials] : (Array.isArray(a.materials) ? a.materials : []);
    mats.forEach(m => { if (m && !weekMaterials.includes(m)) weekMaterials.push(m); });
  });
  const mediaList = act.media || [];
  const mediaItems = weekMaterials.length > 0 ? weekMaterials : mediaList.map(m => `${clean(m.name || m)} (${clean(m.type)})`);
  const mediaText = mediaItems.map((m, i) => `\t${i + 1}. ${clean(m)}`).join('\n');

  // Section 8 - Evidence with TAB
  const knowledgeEvList = act.knowledgeEvidence || [];
  const perfEvList = act.performanceEvidence || [];
  const knowledgeEvidenceText = knowledgeEvList.map((e, i) => `\t${i + 1}. ${clean(e)}`).join('\n');
  const performanceEvidenceText = perfEvList.map((e, i) => `\t${i + 1}. ${clean(e)}`).join('\n');

  // Section 9 - Assessment with TAB
  const critList = act.performanceCriteria || [];
  const methodList = act.assessmentMethods || [];
  const toolList = act.assessmentTools || [];

  return {
    ...baseData,
    weekNo: String(weekNo),
    unitTopics: weekTopicName,
    objectives,
    concept,
    activities: activitiesText,
    media: mediaText,
    knowledgeEvidence: knowledgeEvidenceText,
    performanceEvidence: performanceEvidenceText,
    performanceCriteria: critList.map((e, i) => `\t${i + 1}. ${clean(e)}`).join('\n'),
    assessmentMethods: methodList.map((e, i) => `\t${i + 1}. ${clean(e)}`).join('\n'),
    assessmentTools: toolList.map((e, i) => `\t${i + 1}. ${clean(e)}`).join('\n'),
    // Assessment table rows (for {#assessmentRows} loop in Template)
    assessmentRows: Array.from({ length: Math.max(critList.length, methodList.length, toolList.length, 1) }, (_, i) => ({
      criteria: critList[i] || '-',
      method: methodList[i] || '-',
      tool: toolList[i] || '-',
    })),
    // สมรรถนะ with TAB
    comp: (Array.isArray(compResults?.[unitIndex]?.competencies) ? compResults[unitIndex].competencies : [])
      .map((c, i) => `\t${i + 1}. ${String(c).replace(/^\d+\.\s*/, '')}`).join('\n'),
  };
}

/**
 * Export weekly plans: 1 file per week, using Template.docx.
 * For a unit with N weeks, generates N .docx files.
 */
export async function exportWeeklyPlanDocx({
  formData, loResults, compResults, objResults, conceptResults,
  activitiesResults, mediaResults, evidenceResults, assessmentResults,
  units, unitIndex = 0,
}) {
  const unit = units?.[unitIndex];
  const { theory, practice } = parseRatio((formData || {}).ratio);
  const hrsPerWeek = theory + practice;
  const totalHrs = parseInt(unit?.total) || hrsPerWeek;
  const numWeeks = hrsPerWeek > 0 ? Math.max(1, Math.round(totalHrs / hrsPerWeek)) : 1;

  // Build data for week 1 (includes course header + first week content)
  const week1Data = buildWeeklyTemplateData({
    formData, loResults, compResults, objResults, conceptResults,
    activitiesResults, mediaResults, evidenceResults, assessmentResults,
    units, unitIndex, weekNo: 1,
  });

  // Fetch template
  const response = await fetch('/Template.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ Template.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);

  // If only 1 week, render normally
  if (numWeeks <= 1) {
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{', end: '}' } });
    const safeData = Object.fromEntries(Object.entries(week1Data).map(([k, v]) => [k, v == null ? '' : v]));
    doc.render(safeData);
    const out = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    saveAs(out, `แผนรายสัปดาห์_${formData?.courseCode || ''}_หน่วยที่${unit?.no || unitIndex + 1}.docx`);
    return;
  }

  // Multiple weeks: render week 1 with template, then append weeks 2+ as page breaks
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{', end: '}' } });
  const safeData = Object.fromEntries(Object.entries(week1Data).map(([k, v]) => [k, v == null ? '' : v]));
  doc.render(safeData);

  // Get the rendered XML and append additional weeks
  const renderedZip = doc.getZip();
  let docXml = renderedZip.file('word/document.xml').asText();

  for (let w = 2; w <= numWeeks; w++) {
    const weekData = buildWeeklyTemplateData({
      formData, loResults, compResults, objResults, conceptResults,
      activitiesResults, mediaResults, evidenceResults, assessmentResults,
      units, unitIndex, weekNo: w,
    });

    // Build assessment table rows HTML for this week
    const assessRows = (weekData.assessmentRows || []).map(r =>
      `${r.tool || '-'}\t${r.method || '-'}\t${r.criteria || '-'}`
    ).join('\n');

    // Build week section as Word XML paragraph
    const S = 'font-family:TH SarabunPSK;font-size:16pt;';
    const weekSection = `
<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>แผนการจัดการเรียนรู้</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>หน่วยที่ ${weekData.unitNo}  สอนครั้งที่ ${w}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>รหัสวิชา ${weekData.courseCode} ชื่อวิชา ${weekData.courseName}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>ชื่อหน่วยการเรียนรู้ ${weekData.unitName}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>ทฤษฎี ${weekData.unitTheory} ชม.  ปฏิบัติ ${weekData.unitPractice} ชม.</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>ชื่อเรื่อง/งาน ${weekData.unitTopics}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>1. ผลลัพธ์การเรียนรู้ระดับหน่วยการเรียน</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">${weekData.outcome || ''}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>3. สมรรถนะประจำหน่วย</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">${weekData.comp || ''}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>4. จุดประสงค์เชิงพฤติกรรม</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">${weekData.objectives || ''}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>5. สาระการเรียนรู้</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">${weekData.concept || ''}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>6. กิจกรรมการเรียนรู้</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">${weekData.activities || ''}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>7. สื่อและแหล่งการเรียนรู้</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">${weekData.media || ''}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>8. หลักฐานการเรียนรู้</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">8.1 หลักฐานความรู้${'\n'}${weekData.knowledgeEvidence || ''}${'\n'}8.2 หลักฐานการปฏิบัติงาน${'\n'}${weekData.performanceEvidence || ''}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>9. การวัดและประเมินผล</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">${weekData.performanceCriteria || ''}${'\n'}${weekData.assessmentMethods || ''}${'\n'}${weekData.assessmentTools || ''}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>10. บันทึกผลหลังการจัดการเรียนรู้</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>10.1 ข้อสรุปหลังการจัดการเรียนรู้ ............</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>10.2 ปัญหาที่พบ ............</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>10.3 แนวทางแก้ปัญหา ............</w:t></w:r></w:p>`;

    // Insert before </w:body>
    docXml = docXml.replace('</w:body>', weekSection + '</w:body>');
  }

  renderedZip.file('word/document.xml', docXml);
  const out = renderedZip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  saveAs(out, `แผนรายสัปดาห์_${formData?.courseCode || ''}_หน่วยที่${unit?.no || unitIndex + 1}.docx`);
}

/**
 * Export ALL units — generates one docx with all units' data merged.
 * Since docxtemplater can't loop the entire template, we generate per-unit
 * and the template is designed for single unit.
 * For multi-unit, we generate the first unit into the template,
 * but the real content comes from buildUnitPlanHtml (HTML export).
 */
export async function exportAllUnitsDocx({
  formData,
  loResults,
  compResults,
  objResults,
  conceptResults,
  units,
}) {
  // For now, export unit 1 as the template
  // Multi-unit requires a different approach (loop template)
  const data = buildTemplateData({
    formData, loResults, compResults, objResults, conceptResults, units,
    unitIndex: 0,
  });
  await generateDocxFromTemplate(data, `แผนรายหน่วย_${formData.courseCode || 'export'}_หน่วยที่1`);
}

/**
 * Generate Learning Outcomes docx from Template-lo.docx
 *
 * @param {object} params
 * @param {object[]} params.loResults — [{unitName, outcome}]
 * @param {string} params.courseCode — for filename
 */
export async function generateLoDocx({ loResults, courseCode }) {
  if (!loResults?.length) throw new Error('ไม่พบข้อมูลผลลัพธ์การเรียนรู้');

  const units = loResults.map((item, idx) => ({
    unitName: item.unitName || `หน่วยที่ ${idx + 1}`,
    outcome: item.outcome || '',
  }));

  const response = await fetch('/Template-lo.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ Template-lo.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try {
    doc.render({ units });
  } catch (err) {
    console.error('LO docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  saveAs(out, `ผลลัพธ์การเรียนรู้_${courseCode || 'export'}.docx`);
}

/**
 * Generate Competency docx from template-com.docx
 */
export async function generateCompDocx({ compResults, courseCode }) {
  if (!compResults?.length) throw new Error('ไม่พบข้อมูลสมรรถนะประจำหน่วย');

  const units = compResults.map((item, idx) => ({
    no: String(idx + 1),
    unitName: prepareThaiText(item.unitName || `หน่วยที่ ${idx + 1}`),
    // แต่ละข้อสมรรถนะ: ใส่เลขข้อ "1. 2. ..." นำ, ขึ้นบรรทัดใหม่ (\n → <w:br/>),
    // และ ZWSP segmentation เพื่อไม่ให้ wrap ฉีกคำไทย
    competencies: prepareThaiList(item.competencies, { numbered: true }),
  }));

  const response = await fetch('/template-com.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ template-com.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true, linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try { doc.render({ units }); } catch (err) {
    console.error('Comp docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  saveAs(out, `สมรรถนะประจำหน่วย_${courseCode || 'export'}.docx`);
}

/**
 * Normalize concept field (array/string) → array of clean lines (no leading number prefix)
 */
function normalizeConceptLines(concept) {
  let lines = [];
  if (Array.isArray(concept)) {
    lines = concept.map((c) => String(c || '').trim()).filter(Boolean);
  } else if (typeof concept === 'string') {
    lines = concept
      .replace(/<br\s*\/?>/gi, '\n')
      // split before "N. " that appears mid-line
      .replace(/(?<!\n)\s*(?=\d+[\.\)]\s)/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }
  // Strip leading "1. ", "2) ", "- ", "• " prefix if present
  return lines
    .map((l) =>
      String(l)
        .replace(/\*\*/g, '')
        .replace(/^\s*\d+[\.\)]\s*/, '')
        .replace(/^[-•]\s*/, '')
        .trim()
    )
    .filter(Boolean);
}

/**
 * Generate Content/Concept docx from template-content.docx
 *
 * @param {object} params
 * @param {object[]} params.conceptResults — [{ unitName, concept: string | string[] }, ...]
 * @param {string}   params.courseCode
 * @param {'list'|'paragraph'} [params.displayMode='list']
 *   - 'list'      → numbered items, line break between ("1. ...\n2. ...")
 *   - 'paragraph' → no numbers, joined with double spaces (continuous prose)
 */
export async function generateContentDocx({ conceptResults, courseCode, displayMode = 'list' }) {
  if (!conceptResults?.length) throw new Error('ไม่พบข้อมูลสาระการเรียนรู้');

  const units = conceptResults.map((item, idx) => {
    const cleanLines = normalizeConceptLines(item.concept);
    let conceptText = '';
    if (cleanLines.length === 0) {
      conceptText = '';
    } else if (displayMode === 'paragraph') {
      // ความเรียง: ไม่มีเลขข้อ, เว้นวรรคระหว่างข้อ (double space)
      conceptText = segmentThaiForWordBreak(cleanLines.join('  '));
    } else {
      // แสดงเป็นข้อ: ใส่เลข "1. ", "2. ", ... และขึ้นบรรทัดใหม่ (\n → <w:br/>)
      conceptText = cleanLines
        .map((line, i) => segmentThaiForWordBreak(`${i + 1}. ${line}`))
        .join('\n');
    }
    return {
      no: String(idx + 1),
      unitName: prepareThaiText(item.unitName || `หน่วยที่ ${idx + 1}`),
      concept: conceptText,
    };
  });

  const response = await fetch('/template-content.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ template-content.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try {
    doc.render({ units });
  } catch (err) {
    console.error('Content docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  saveAs(out, `สาระการเรียนรู้_${courseCode || 'export'}.docx`);
}

/**
 * Detect whether a media type string looks like an assessment tool
 * (these should live in AssessmentModule 9.3, not in MediaModule).
 */
function isAssessmentToolType(type) {
  if (!type) return false;
  const t = String(type).trim();
  return /เครื่องมือ(การ)?ประเมิน|แบบทดสอบ|แบบประเมิน|แบบสังเกต|rubric|rúbrica|checklist|assessment\s*tool/i.test(t);
}

/**
 * Map a raw media type string into one of 5 canonical categories.
 * Order matches the template-media.docx sub-sections.
 */
export function categorizeMediaType(rawType) {
  const t = String(rawType || '').trim();
  if (/ใบความรู้|knowledge\s*sheet/i.test(t)) return 'ใบความรู้';
  if (/ใบปฏิบัติ(งาน)?|practice\s*sheet/i.test(t)) return 'ใบปฏิบัติงาน';
  if (/ใบมอบหมาย(งาน)?|assignment\s*sheet/i.test(t)) return 'ใบมอบหมายงาน';
  if (/ใบงาน|worksheet/i.test(t)) return 'ใบงาน';
  return 'สื่อการสอน';
}

export const MEDIA_SECTION_ORDER = [
  'สื่อการสอน',
  'ใบความรู้',
  'ใบงาน',
  'ใบปฏิบัติงาน',
  'ใบมอบหมายงาน',
];

// Map canonical section name → docxtemplater variable name in template-media.docx
const MEDIA_SECTION_VAR = {
  'สื่อการสอน':      'teachingMedia',
  'ใบความรู้':        'knowledgeSheet',
  'ใบงาน':            'worksheet',
  'ใบปฏิบัติงาน':     'practiceSheet',
  'ใบมอบหมายงาน':    'assignment',
};

/**
 * Generate Media docx from template-media.docx
 *
 * @param {object} params
 * @param {object[]} params.mediaResults — [{ unitName, media: [{ name, type, description, usage }, ...] }, ...]
 * @param {string}   params.courseCode
 */
export async function generateMediaDocx({ mediaResults, courseCode }) {
  if (!mediaResults?.length) throw new Error('ไม่พบข้อมูลสื่อและแหล่งการเรียนรู้');

  // Each unit now carries 5 category placeholders. Empty categories render as
  // a blank line under their bold heading, which keeps the visual structure
  // intact so teachers know exactly where to add content later.
  const formatItem = (m, i) => {
    const name = String(m?.name || '').replace(/\*\*/g, '').trim();
    if (!name) return '';
    const desc = String(m?.description || '').replace(/\*\*/g, '').trim();
    const usage = String(m?.usage || '').replace(/\*\*/g, '').trim();
    const parts = [name];
    if (desc) parts.push(` — ${desc}`);
    if (usage) parts.push(` (วิธีใช้: ${usage})`);
    return segmentThaiForWordBreak(`${i + 1}. ${parts.join('')}`);
  };

  const units = mediaResults.map((item, idx) => {
    const list = Array.isArray(item.media) ? item.media : [];
    // Filter out any entries that look like assessment tools — they belong
    // in AssessmentModule section 9.3, not here.
    const cleaned = list.filter((m) => !isAssessmentToolType(m?.type));

    // Group by category into 5 buckets
    const groups = Object.fromEntries(MEDIA_SECTION_ORDER.map((s) => [s, []]));
    cleaned.forEach((m) => {
      const key = categorizeMediaType(m?.type);
      (groups[key] || groups['สื่อการสอน']).push(m);
    });

    // Build the per-section text blocks
    const unitData = {
      no: String(idx + 1),
      unitName: prepareThaiText(item.unitName || `หน่วยที่ ${idx + 1}`),
    };
    for (const section of MEDIA_SECTION_ORDER) {
      const varName = MEDIA_SECTION_VAR[section];
      const bucket = groups[section] || [];
      const lines = bucket
        .map((m, i) => formatItem(m, i))
        .filter(Boolean)
        .join('\n');
      unitData[varName] = lines; // empty string if nothing in this category
    }
    return unitData;
  });

  const response = await fetch('/template-media.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ template-media.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try {
    doc.render({ units });
  } catch (err) {
    console.error('Media docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  saveAs(out, `สื่อและแหล่งการเรียนรู้_${courseCode || 'export'}.docx`);
}

// Re-export the helper so modules can filter display data consistently
export { isAssessmentToolType };

/**
 * Generate a PISA-based Job Sheet (ใบงาน) docx from template-jobsheet.docx.
 *
 * Template = แบบฟอร์มใบงาน PISA (3 ใบงาน inside, 79 placeholders in ใบงานที่ 1).
 * ใบงานที่ 2 and 3 stay as blank fill-in forms for the teacher.
 *
 * @param {object} params
 * @param {object} params.jobSheet — flat or PISA-structured object containing:
 *     jobSheetNo, title, courseName, courseCode, unitName, gradeLevel, duration,
 *     competencies (array of 4 strings),
 *     situation (string), task (string),
 *     pisa: 6×{task,competency,activity,evidence},
 *     steps: 6×{activity,tool,outcome},
 *     assessments: 6×{outcome,pisaStep,tool,method}
 * @param {string} [params.filename] — output filename (without .docx)
 */
/**
 * Strip leading list/number markers from a string so the PISA table
 * doesn't render duplicates like "1. 1. ..." (because the first column
 * of the template already contains "1. เข้าใจปัญหา").
 *
 * Removes patterns like:
 *   "1. ", "1) ", "(1) ", "ข้อ 1 ", "ขั้นที่ 1: ", "- ", "• ", "* "
 */
function stripLeadingMarker(text) {
  if (text == null) return '';
  let s = String(text).trim();
  // Strip repeatedly in case AI produced multiple markers
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s
      .replace(/^\s*(?:ขั้นที่|ข้อที่|ข้อ)\s*\d+\s*[:\.\)]\s*/u, '')
      .replace(/^\s*\(\s*\d+\s*\)\s*/u, '')
      .replace(/^\s*\d+\s*[\.\)]\s*/u, '')
      .replace(/^\s*[-•*–]\s*/u, '')
      .trim();
    if (s === before) break;
  }
  return s;
}

/**
 * Clean a "สมรรถนะการปฏิบัติงาน" string to match the format:
 * กริยา + กรรม + เงื่อนไข (no leading "สามารถ", no trailing "ได้" prefix).
 */
function cleanCompetency(text) {
  if (text == null) return '';
  let s = stripLeadingMarker(String(text));
  // Remove leading "สามารถ" / "มีความสามารถ" / "สามารถที่จะ" etc.
  s = s
    .replace(/^\s*(?:มี\s*)?ความสามารถ(?:ที่จะ|ใน(?:การ)?)?\s*/u, '')
    .replace(/^\s*สามารถ(?:ที่จะ)?\s*/u, '')
    .trim();
  // Remove a trailing bare "ได้" if it's left over after stripping สามารถ
  s = s.replace(/\s*ได้\s*$/u, '').trim();
  return s;
}

/**
 * Generate one Job Sheet docx from public/template-jobsheet1.docx (10 sections).
 *
 * Each call writes ONE file. To export multiple ใบงาน, call this function once
 * per sheet — they will be saved as separate .docx files.
 *
 * Schema (jobSheet object):
 *   jobSheetNo, unitNo, lessonNo
 *   title, courseName, courseCode, unitName
 *   theoryHours, practiceHours
 *   lo                         — Section 1
 *   competencies (string[])    — Section 3 (joined into comp1 as multi-line)
 *   objectives  (string[])     — Section 4 (joined into obj1 as multi-line, from objResults)
 *   tools       (string[])     — Section 5 (joined into tool1 as multi-line)
 *   caution                    — Section 6
 *   steps       (string[])     — Section 7 (joined as numbered multi-line)
 *   summary                    — Section 8
 *   evaluation                 — Section 9 (from assessmentResults)
 *   references  (string[])     — Section 10 (joined as numbered multi-line)
 */
export async function generateJobSheetDocx({ jobSheet, filename }) {
  if (!jobSheet) throw new Error('ไม่พบข้อมูลใบงาน');

  // Helpers
  const txt  = (v) => (v == null || v === '' ? '' : prepareThaiText(String(v)));
  const txtS = (v) => (v == null || v === '' ? '' : prepareThaiText(stripLeadingMarker(String(v))));
  const txtC = (v) => (v == null || v === '' ? '' : prepareThaiText(cleanCompetency(String(v))));
  const arr  = (v) => (Array.isArray(v) ? v : []);

  // Build numbered multi-line block for an array. linebreaks:true in
  // docxtemplater turns "\n" into <w:br/> so each item becomes its own line.
  const numberedList = (items, mapper = (s) => s) =>
    arr(items)
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .map((s, i) => `${i + 1}) ${mapper(s)}`)
      .join('\n');

  // Plain multi-line block (no leading numbers) — used when caller already
  // formatted prefixes (e.g., "1.1) ...").
  // ⚠️ ห้าม .trim() ต่อ item เพราะจะลบ leading spaces ที่ caller ใช้สำหรับ indent
  // skip เฉพาะ item ที่เป็น empty / whitespace ทั้งหมด
  const plainLines = (items) =>
    arr(items)
      .map((s) => String(s || '').replace(/\s+$/, '')) // right-trim only
      .filter((s) => s.trim() !== '')
      .join('\n');

  const data = {
    // Header
    jobSheetNo:    String(jobSheet.jobSheetNo || ''),
    unitNo:        String(jobSheet.unitNo || ''),
    lessonNo:      String(jobSheet.lessonNo || ''),
    title:         txt(jobSheet.title),
    courseName:    txt(jobSheet.courseName),
    courseCode:    String(jobSheet.courseCode || ''),
    unitName:      txt(jobSheet.unitName),
    theoryHours:   String(jobSheet.theoryHours || ''),
    practiceHours: String(jobSheet.practiceHours || ''),

    // Section 1 — ผลลัพธ์การเรียนรู้จากการปฏิบัติงาน
    lo: txtS(jobSheet.lo),

    // Section 3 — สมรรถนะการปฏิบัติงาน (all items joined into the 3.1 slot)
    comp1: numberedList(jobSheet.competencies, (s) => prepareThaiText(cleanCompetency(s))),

    // Section 4 — จุดประสงค์เชิงพฤติกรรม (4 ด้านเรียงต่อกัน, joined into 4.1 slot)
    //  - caller already formats with prefixes ("1.1) ด้านความรู้: ...") so use plain
    obj1: plainLines(jobSheet.objectives),

    // Section 5 — เครื่องมือ วัสดุ และอุปกรณ์ (joined into 5.1 slot)
    tool1: numberedList(jobSheet.tools, (s) => prepareThaiText(stripLeadingMarker(s))),

    // Section 6 — คำแนะนำ/ข้อควรระวัง
    caution: txt(jobSheet.caution),

    // Section 7 — ขั้นตอนการปฏิบัติงาน
    steps: numberedList(jobSheet.steps, (s) => prepareThaiText(stripLeadingMarker(s))),

    // Section 8 — สรุปและวิจารณ์ผล
    summary: txt(jobSheet.summary),

    // Section 9 — การประเมินผล (from assessmentResults, pre-formatted by caller)
    evaluation: txt(jobSheet.evaluation),

    // Section 10 — เอกสารอ้างอิง
    references: numberedList(jobSheet.references),
  };

  const response = await fetch('/template-jobsheet1.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ template-jobsheet1.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try {
    doc.render(data);
  } catch (err) {
    console.error('JobSheet docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ใบงานได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const safeTitle = String(jobSheet.title || 'ใบงาน').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const safeCourse = String(jobSheet.courseCode || 'export').replace(/[\\/:*?"<>|]/g, '_');
  const finalName = filename || `ใบงานที่_${jobSheet.jobSheetNo || 'x'}_${safeTitle}_${safeCourse}`;
  saveAs(out, `${finalName}.docx`);
}

/**
 * Generate Objectives docx from template-obj.docx
 */
export async function generateObjDocx({ objResults, courseCode }) {
  if (!objResults?.length) throw new Error('ไม่พบข้อมูลจุดประสงค์เชิงพฤติกรรม');

  // ✨ Template v2 (Nested Loops): จัดกลุ่ม items ตาม 📌 subtopic + reset numbering
  // ส่งให้ template: [{ header, items: [{idx, text}] }, ...]
  //
  // AI generates objectives เป็น array ของ strings:
  //   ["📌 เรื่อง: หลักการ...", "(K1) บอก...", "(K2) อธิบาย...",
  //    "📌 เรื่อง: การวิเคราะห์...", "(K1) ระบุ...", ...]
  // ต้อง group เป็น:
  //   [{ header: "📌 เรื่อง: หลักการ...", items: [(K1), (K2), ...] },
  //    { header: "📌 เรื่อง: การวิเคราะห์...", items: [(K1), ...] }]
  // ทำความสะอาดข้อความ:
  //  - ลบเลขนำหน้า "1)" / "1." (ที่ template จะใส่ {idx}) แทน)
  //  - ลบ markdown **bold**
  //  - รวบ whitespace ทั้งหมด (รวม \n) เป็น single space → กัน line break กลางข้อ
  //  - ใส่ ZWSP ระหว่างคำไทย (Word ตัดคำที่ขอบคำได้ถูก ไม่ฉีกคำ)
  const cleanItemText = (s) => {
    const stripped = String(s || '').replace(/^\d+[\.\)]\s*/, '');
    const cleaned = stripped
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ') // ⚠️ รวม \n → space (กัน item แตกหลายบรรทัด)
      .trim();
    return segmentThaiForWordBreak(cleaned);
  };
  const isSubtopicHeader = (s) => {
    const t = String(s || '').trim();
    // ตรวจจับ subtopic header: เริ่มต้นด้วย 📌 หรือ "เรื่อง:" หรือ "หัวข้อ:"
    return t.startsWith('📌') || /^(เรื่อง|หัวข้อ|กลุ่ม)\s*:/u.test(t);
  };

  const groupByHeader = (arr) => {
    const items = Array.isArray(arr) ? arr.filter((t) => String(t || '').trim()) : [];
    if (items.length === 0) return [];
    const groups = [];
    let current = null;
    let counter = 0;
    for (const t of items) {
      const str = String(t).trim();
      if (isSubtopicHeader(str)) {
        // เริ่ม group ใหม่ — header ก็ผ่าน clean+segment
        current = { header: cleanItemText(str), hasHeader: true, items: [] };
        groups.push(current);
        counter = 0; // reset numbering per subtopic
      } else {
        if (!current) {
          current = { header: '', hasHeader: false, items: [] };
          groups.push(current);
        }
        counter += 1;
        current.items.push({ idx: counter, text: cleanItemText(str) });
      }
    }
    return groups;
  };

  const units = objResults.map((item, idx) => ({
    unitNo: String(idx + 1),
    unitName: item.unitName || `หน่วยที่ ${idx + 1}`,
    cognitive: groupByHeader(item.cognitive),
    psychomotor: groupByHeader(item.psychomotor),
    affective: groupByHeader(item.affective),
    application: groupByHeader(item.application),
  }));

  const response = await fetch('/template-obj.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ template-obj.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true, linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try { doc.render({ units }); } catch (err) {
    console.error('Obj docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  saveAs(out, `จุดประสงค์เชิงพฤติกรรม_${courseCode || 'export'}.docx`);
}

/**
 * Generate Job Analysis docx from template-job.docx
 *
 * @param {object} params
 * @param {string} params.learningOutcomes — ผลลัพธ์การเรียนรู้ระดับรายวิชา
 * @param {string} params.generatedPlan — markdown table from AI
 * @param {string} params.courseCode — for filename
 */
export async function generateJobAnalysisDocx({ learningOutcomes, generatedPlan, courseCode }) {
  // 1. Parse the markdown analysis table into rows
  const jobs = parseAnalysisTableToJobs(generatedPlan);

  if (jobs.length === 0) {
    throw new Error('ไม่พบข้อมูลตารางวิเคราะห์งาน');
  }

  // 2. Fetch template
  const response = await fetch('/template-job.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ template-job.docx');
  const arrayBuffer = await response.arrayBuffer();

  // 3. Load + render
  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try {
    doc.render({
    learningOutcomes: learningOutcomes || '',
    jobs,
  });
  } catch (err) {
    console.error('Job Analysis docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  saveAs(out, `ตารางวิเคราะห์งาน_${courseCode || 'export'}.docx`);
}

/**
 * Parse the AI-generated markdown table into array of job objects for template loop.
 * Each row becomes { duty, task, subComp, knowledge, skills }
 *
 * Robust mode: ถ้า AI เผลอแบ่งออกเป็นหลายตาราง (header ซ้ำ / separator ซ้ำ)
 * ฟังก์ชันนี้จะกรอง header row และ separator row ซ้ำทิ้ง แล้วรวม data rows
 * ทั้งหมดให้เป็นรายการเดียว เพื่อให้ template วาดออกมาเป็นตารางต่อเนื่องเดียว
 * (ตรงกับเจตนา: "ไม่ต้องแยกตาราง เพราะหัวตารางซ้ำอัตโนมัติอยู่แล้ว")
 */
function parseAnalysisTableToJobs(markdown) {
  if (!markdown) return [];
  const clean = markdown.replace(/```markdown/g, '').replace(/```/g, '').trim();
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

  // หา separator แรกเพื่อ anchor ตารางแรก
  const firstSepIdx = lines.findIndex((l) => l.startsWith('|') && /\-{3,}/.test(l));
  if (firstSepIdx === -1) return [];

  const isSeparatorRow = (l) => l.startsWith('|') && /\-{3,}/.test(l);
  const isHeaderRow = (l) => {
    if (!l.startsWith('|')) return false;
    // ยอมรับว่าเป็น header row ถ้ามีคำ key อย่างน้อย 2 คำ
    const keyWords = ['duty', 'task', 'งานหลัก', 'งานย่อย', 'สมรรถนะ', 'knowledge', 'ความรู้', 'skill', 'ทักษะ'];
    const lower = l.toLowerCase();
    const hits = keyWords.filter((k) => lower.includes(k.toLowerCase())).length;
    return hits >= 2;
  };

  const candidate = lines.slice(firstSepIdx + 1).filter((l) => l.startsWith('|'));
  const dataLines = candidate.filter((l) => !isSeparatorRow(l) && !isHeaderRow(l));

  return dataLines.map((line) => {
    const cells = line
      .split('|')
      .filter((c, i, arr) => i !== 0 && i !== arr.length - 1)
      .map((c) => c.trim());
    return {
      duty: cleanCellForDocx(cells[0] || ''),
      task: cleanCellForDocx(cells[1] || ''),
      subComp: cleanCellForDocx(cells[2] || ''),
      knowledge: cleanCellForDocx(cells[3] || ''),
      skills: cleanCellForDocx(cells[4] || ''),
    };
  });
}

/**
 * Segment Thai text at word boundaries and insert Zero-Width Space (U+200B)
 * so Word can wrap at word boundaries instead of character boundaries.
 *
 * ใช้ Intl.Segmenter('th', { granularity: 'word' }) ซึ่งใช้ ICU word-breaker
 * ของระบบ (มีใน Node 16+, Chrome 87+, Safari 14.1+, Firefox 125+)
 *
 * ZWSP เป็น Unicode break-opportunity ทำงานใน Word/ทุก renderer โดยไม่ต้อง
 * พึ่ง Thai language pack ที่เครื่องของผู้อ่าน → แก้ "ฉีกคำ" ได้แน่นอน
 */
function segmentThaiForWordBreak(text) {
  if (!text) return text;
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    return text;
  }
  try {
    const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
    const segments = Array.from(segmenter.segment(text));
    const isThai = (s) => /[\u0E00-\u0E7F]/.test(s);
    let result = '';
    for (let i = 0; i < segments.length; i += 1) {
      const cur = segments[i].segment;
      const prev = i > 0 ? segments[i - 1].segment : '';
      // ใส่ ZWSP ระหว่าง 2 segments เฉพาะกรณีมี Thai อย่างน้อยฝั่งใดฝั่งหนึ่ง
      // (ไม่ใส่ในเลข/ภาษาอังกฤษล้วน เพราะมี space เป็น natural break อยู่แล้ว)
      if (i > 0 && (isThai(cur) || isThai(prev))) {
        result += '\u200B';
      }
      result += cur;
    }
    return result;
  } catch {
    return text;
  }
}

/**
 * Clean markdown cell content for docx output.
 * - <br> → \n (ให้ขึ้นบรรทัดใหม่สำหรับแต่ละ "ข้อ" ที่ AI คั่นด้วย <br>)
 *   docxtemplater + { linebreaks: true } จะแปลง \n เป็น <w:br/>
 * - ตัด **bold** markers
 * - collapse space/tab (แต่คง \n ไว้)
 * - คง ZWSP ที่ขอบคำไทย → ถ้าบรรทัดยังยาวเกิน cell width Word จะ
 *   soft-wrap ที่ขอบคำ ไม่ตัดกลางคำ
 *
 * ผลลัพธ์: ข้อ (1.1, 1.2, ...) ขึ้นบรรทัดใหม่ตามที่ AI markup
 * แต่ละบรรทัดที่ยาวเกินจะ wrap ตามคำไทย ไม่ฉีกกลางคำ
 */
function cleanCellForDocx(text) {
  if (!text) return '';
  const flowed = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\*\*/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return segmentThaiForWordBreak(flowed);
}

/**
 * เตรียม plain-text Thai ให้ docx output: strip bold, trim, normalize whitespace, ZWSP segmentation
 *
 * Clean steps:
 *   1. Strip markdown bold/italic markers (**, *, __)
 *   2. Replace tab characters with single space — \t ไม่ render ใน Word docxtemplater
 *   3. Collapse multiple spaces/tabs → 1 space
 *   4. Normalize newlines (no leading/trailing space, no double newlines)
 *   5. Strip stray non-printable chars (zero-width that's not ZWSP)
 *   6. Apply Thai word break (ZWSP at word boundaries) — กันคำไทยถูกตัดที่ผิด
 *
 * ใช้กับ data จาก module results ที่เป็น string/array ธรรมดา (ไม่ใช่ markdown cell)
 */
function prepareThaiText(text) {
  if (text == null) return '';
  const cleaned = String(text)
    // 1. Strip markdown markers
    .replace(/\*\*/g, '')        // **bold**
    .replace(/(?<!\w)\*(?!\s)([^*\n]+)\*(?!\w)/g, '$1')  // *italic*
    .replace(/__/g, '')          // __underline__
    // 2. Normalize whitespace
    .replace(/\t/g, ' ')         // tab → space (Word docx ไม่ render \t)
    .replace(/ {2,}/g, ' ')      // multiple spaces → 1
    .replace(/[ ]*\n[ ]*/g, '\n') // strip space around newline
    .replace(/\n{2,}/g, '\n')    // multiple newlines → 1
    // 3. Strip non-printable (but preserve ZWSP U+200B + Thai)
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  return segmentThaiForWordBreak(cleaned);
}

/**
 * เตรียม array ของ Thai strings ให้ docx output:
 * - ถ้า numbered = true → ใส่เลข "1. ", "2. ", ... นำหน้าแต่ละข้อ (ถ้ายังไม่มี)
 * - join ด้วย \n (docxtemplater + linebreaks: true จะแปลงเป็น <w:br/>)
 * - apply ZWSP segmentation กับแต่ละข้อ (กัน word wrap ฉีกคำ)
 */
function prepareThaiList(arr, { numbered = false } = {}) {
  if (!Array.isArray(arr)) return prepareThaiText(arr);
  return arr
    .map((item, i) => {
      const plain = String(item || '').replace(/\*\*/g, '').trim();
      if (!plain) return '';
      // ถ้า numbered และยังไม่ขึ้นด้วยเลขข้อ → ใส่ prefix "N. "
      const hasNumberPrefix = /^\s*\d+[\.\)]/.test(plain);
      const withNum = numbered && !hasNumberPrefix ? `${i + 1}. ${plain}` : plain;
      return segmentThaiForWordBreak(withNum);
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Generate Unit Table docx from template-unit.docx
 *
 * @param {object} params
 * @param {object} params.formData — course form data
 * @param {string} params.unitDivisionPlan — markdown table of units
 * @param {boolean} params.hasEvalRow — whether to include evaluation row
 */
export async function generateUnitTableDocx({ formData, unitDivisionPlan, hasEvalRow = true }) {
  const { parseUnitTable } = await import('./markdownTable');
  const parsedUnits = parseUnitTable(unitDivisionPlan);

  if (parsedUnits.length === 0) {
    throw new Error('ไม่พบข้อมูลตารางหน่วยการเรียนรู้');
  }

  const fd = formData || {};
  const { theory, practice } = parseRatio(fd.ratio);

  // Build units array for loop (include topics as sub-content)
  const units = parsedUnits.map(u => {
    const topicsText = (u.topics || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/^[-•]\s*/gm, '• ')
      .trim();
    return {
      no: u.no || '',
      name: topicsText ? `${u.name || ''}\n${topicsText}` : (u.name || ''),
      topics: topicsText,
      theory: u.theory || '0',
      practice: u.practice || '0',
      total: u.total || '0',
    };
  });

  // Calculate totals
  let sumTheory = 0;
  let sumPractice = 0;
  let sumTotal = 0;
  units.forEach(u => {
    sumTheory += parseInt(u.theory) || 0;
    sumPractice += parseInt(u.practice) || 0;
    sumTotal += parseInt(u.total) || 0;
  });

  // Evaluation row (1 week)
  const evalTheory = hasEvalRow ? String(theory) : '0';
  const evalPractice = hasEvalRow ? String(practice) : '0';
  const evalTotal = hasEvalRow ? String(theory + practice) : '0';

  const evalT = hasEvalRow ? (parseInt(evalTheory) || 0) : 0;
  const evalP = hasEvalRow ? (parseInt(evalPractice) || 0) : 0;

  // Fetch template
  const response = await fetch('/template-unit.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ template-unit.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  // แก้ placeholder ที่ Word ตัด run ขาด (เช่น {#units} หรือ {no}) ก่อนส่งให้ docxtemplater
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try {
    doc.render({
    courseCode: fd.courseCode || '',
    courseName: fd.courseName || '',
    theoryHours: String(theory),
    practiceHours: String(practice),
    credits: fd.credits || '',
    units,
    evalTheory,
    evalPractice,
    evalTotal,
    totalTheory: String(sumTheory + evalT),
    totalPractice: String(sumPractice + evalP),
    totalAll: String(sumTotal + evalT + evalP),
  });
  } catch (err) {
    console.error('Unit table docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  saveAs(out, `ตารางหน่วยการเรียนรู้_${fd.courseCode || 'export'}.docx`);
}

// --- Helper ---
function parseRatio(ratio) {
  const match = ratio?.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (match) return { theory: parseInt(match[1]), practice: parseInt(match[2]) };
  return { theory: 0, practice: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// Feature 4: Activities DOCX (raw OpenXML, no template needed)
// ═══════════════════════════════════════════════════════════════════════════

const OOXML_NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:mv="urn:schemas-microsoft-com:mac:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"';

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function wPara(text, opts = {}) {
  const { bold, sz, jc } = opts;
  let rPr = '';
  if (bold || sz) {
    const parts = [];
    if (bold) parts.push('<w:b/>');
    if (sz) parts.push(`<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`);
    rPr = `<w:rPr>${parts.join('')}</w:rPr>`;
  }
  const pPr = jc ? `<w:pPr><w:jc w:val="${jc}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function wCell(content, opts = {}) {
  const { width, shade, vMerge } = opts;
  const tcPr = [];
  if (width) tcPr.push(`<w:tcW w:w="${width}" w:type="dxa"/>`);
  if (shade) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>`);
  if (vMerge === 'restart') tcPr.push('<w:vMerge w:val="restart"/>');
  else if (vMerge === 'cont') tcPr.push('<w:vMerge/>');
  return `<w:tc>${tcPr.length ? `<w:tcPr>${tcPr.join('')}</w:tcPr>` : ''}${content}</w:tc>`;
}

function wRow(cells) { return `<w:tr>${cells.join('')}</w:tr>`; }

function buildActivitiesOpenXml(activitiesResults, formData) {
  const rows = [];
  const units = Array.isArray(activitiesResults) ? activitiesResults : [];
  const courseName = formData?.courseName || '';
  const courseCode = formData?.courseCode || '';

  // Title
  const title = wPara(`กิจกรรมการเรียนรู้ — ${courseCode} ${courseName}`, { bold: true, sz: 32, jc: 'center' });

  // Per-unit tables
  const unitBlocks = units.map((unit, uIdx) => {
    const unitName = unit._unitName || unit.unitName || `หน่วยที่ ${uIdx + 1}`;
    const methods = Array.isArray(unit._methods) ? unit._methods.join(', ') : '';
    const acts = Array.isArray(unit.activities) ? unit.activities : [];

    // Unit header
    const unitHeader = wPara(`หน่วยที่ ${unit._unitNo || uIdx + 1}: ${unitName}` +
      (methods ? ` (${methods})` : '') +
      (unit._total ? ` — ${unit._total} ชม.` : ''),
      { bold: true, sz: 28 });

    // Table header row
    const hdrRow = wRow([
      wCell(wPara('ขั้นตอน', { bold: true, sz: 20 }), { shade: 'D9E2F3' }),
      wCell(wPara('ชื่อกิจกรรม', { bold: true, sz: 20 }), { shade: 'D9E2F3' }),
      wCell(wPara('ประเภท', { bold: true, sz: 20 }), { shade: 'D9E2F3' }),
      wCell(wPara('ระยะเวลา', { bold: true, sz: 20 }), { shade: 'D9E2F3' }),
      wCell(wPara('กิจกรรมครูผู้สอน', { bold: true, sz: 20 }), { shade: 'D9E2F3' }),
      wCell(wPara('กิจกรรมผู้เรียน', { bold: true, sz: 20 }), { shade: 'D9E2F3' }),
      wCell(wPara('สื่อ/อุปกรณ์', { bold: true, sz: 20 }), { shade: 'D9E2F3' }),
    ]);

    // Data rows
    const dataRows = acts.map((a) => wRow([
      wCell(wPara(a.phase || `ขั้นที่ ${a.step}`, { sz: 20 })),
      wCell(wPara(a.name || '', { sz: 20 })),
      wCell(wPara(a.type || '', { sz: 20 })),
      wCell(wPara(a.duration || '', { sz: 20 })),
      wCell(wPara(a.teacherAction || '', { sz: 20 })),
      wCell(wPara(a.studentAction || '', { sz: 20 })),
      wCell(wPara(Array.isArray(a.materials) ? a.materials.join(', ') : '', { sz: 20 })),
    ]));

    const tbl = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr>${hdrRow}${dataRows.join('')}</w:tbl>`;

    return unitHeader + tbl + wPara(''); // spacer
  });

  return title + wPara('') + unitBlocks.join('');
}

export async function generateActivitiesDocx({ activitiesResults, formData, returnBlob = false }) {
  const bodyXml = buildActivitiesOpenXml(activitiesResults, formData);
  const courseCode = formData?.courseCode || '';

  // Build minimal .docx via PizZip (OpenXML)
  const zip = new PizZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>');
  zip.file('word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document ${OOXML_NS}><w:body>` +
    bodyXml +
    '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>');

  const out = zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const filename = `กิจกรรมการเรียนรู้_${courseCode || 'export'}.docx`;
  if (returnBlob) return { blob: out, filename };
  saveAs(out, filename);
}

// ═══════════════════════════════════════════════════════════════════════════
// Feature 1: Export ALL modules as ZIP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper: generate a blob from any template-based export function.
 * Wraps the existing generate*Docx functions to intercept saveAs.
 */
async function blobify(fn, args) {
  try {
    const result = await fn({ ...args, returnBlob: true });
    if (result?.blob) return result;
  } catch {
    // Some generators don't support returnBlob — intercept saveAs
  }
  return null;
}

// Add returnBlob support to generators that don't have it yet
// (We monkey-patch via wrapper for the zip export only)

// ── Cover Page Export ──────────────────────────────────────────────
// Helper: ดึงข้อมูล programLevel จาก courseCode
function detectCurriculumInfo(courseCode) {
  const cc = String(courseCode || '').trim();
  const firstDigit = cc.replace(/\D/g, '')[0];
  if (firstDigit === '3') {
    return {
      curriculumName: 'ประกาศนียบัตรวิชาชีพชั้นสูง',
      programLevel: 'ปวส.',
    };
  }
  return {
    curriculumName: 'ประกาศนียบัตรวิชาชีพ',
    programLevel: 'ปวช.',
  };
}

// Helper: ประกอบชื่อครู prefix + firstName + lastName
function buildTeacherName(userInfo = {}) {
  const parts = [
    userInfo.prefix === 'อื่นๆ' ? (userInfo.prefixOther || '') : (userInfo.prefix || ''),
    userInfo.firstName || '',
    userInfo.lastName || '',
  ].filter(Boolean);
  let name = parts.join(' ').trim();
  // เพิ่มตำแหน่ง/วิทยฐานะ ถ้ามี
  const position = userInfo.position === 'อื่นๆ' ? (userInfo.positionOther || '') : (userInfo.position || '');
  if (position) name = `${name} (${position})`;
  return name || '-';
}

// สร้าง data object สำหรับ Cover template
function buildCoverData({ formData, userInfo, unitDivisionPlan }) {
  const { curriculumName, programLevel } = detectCurriculumInfo(formData?.courseCode);

  // ── ผลลัพธ์การเรียนรู้ระดับรายวิชา (CLO) ──
  // formData.learningOutcomes เป็น string ที่อาจมีหลายบรรทัด (\n คั่น) — รวมเป็น string เดียว
  const clo = (formData?.learningOutcomes || '').trim();

  // ── รายชื่อหน่วยการเรียนรู้ (parse จาก markdown table) ──
  const parsedUnits = parseUnitTable(unitDivisionPlan || '');
  const units = parsedUnits.map((u, idx) => ({
    no: u.no || String(idx + 1),
    name: u.name || '',
  }));

  return {
    courseCode: formData?.courseCode || '',
    courseName: formData?.courseName || '',
    curriculumName,                                  // เช่น "ประกาศนียบัตรวิชาชีพ"
    programLevel,                                    // เช่น "ปวช."
    vocationType: formData?.vocationType || '',       // หมวดวิชาชีพ
    occupationGroup: formData?.occupationGroup || '',
    department: formData?.department || '',
    competencyGroup: formData?.competencyGroup || '', // หมวดสมรรถนะแกนกลาง
    teacherName: buildTeacherName(userInfo),
    college: userInfo?.college || '-',
    // ── คำนำ (ใหม่) ────────────────────────────────────────────
    courseLearningOutcome: clo || '-',
    unitCount: units.length || '-',
    units, // [{no, name}] — paragraph loop
  };
}

/**
 * สร้างหน้าปก (Cover) แผนการสอน
 * - formData.courseCategory: 'vocational' (หมวดวิชาชีพ) → template-Cover.docx
 *                          | 'core' (หมวดสมรรถนะแกนกลาง) → template-Cover-gen.docx
 */
export async function generateCoverDocx({ formData, userInfo, unitDivisionPlan }) {
  const isCoreCompetency = formData?.courseCategory === 'core';
  const templatePath = isCoreCompetency ? '/template-Cover-gen.docx' : '/template-Cover.docx';

  const response = await fetch(templatePath);
  if (!response.ok) throw new Error(`ไม่พบไฟล์ ${templatePath}`);
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  const data = buildCoverData({ formData, userInfo, unitDivisionPlan });
  try {
    doc.render(data);
  } catch (err) {
    console.error('Cover docx render error:', err);
    throw new Error('ไม่สามารถสร้างหน้าปกได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const courseCode = formData?.courseCode || 'export';
  saveAs(out, `หน้าปก_${courseCode}.docx`);
}

// Internal: blob version สำหรับ exportAllZip
async function generateCoverBlob({ formData, userInfo, unitDivisionPlan }) {
  const isCoreCompetency = formData?.courseCategory === 'core';
  const templatePath = isCoreCompetency ? '/template-Cover-gen.docx' : '/template-Cover.docx';
  const zip = await fetchTemplateZip(templatePath);
  const data = buildCoverData({ formData, userInfo, unitDivisionPlan });
  return renderAndBlob(zip, data, `หน้าปก_${formData?.courseCode || 'export'}.docx`);
}

export async function exportAllZip({
  formData, generatedPlan, unitDivisionPlan,
  loResults, compResults, objResults, conceptResults,
  activitiesResults, mediaResults, evidenceResults,
  assessmentResults,
  userInfo,  // 🆕 user info สำหรับ cover (จาก getStoredUserInfo())
}) {
  const courseCode = formData?.courseCode || '';
  const zipOut = new PizZip();
  const errors = [];

  const tryAdd = async (label, fn) => {
    try {
      const result = await fn();
      if (result?.blob) {
        // Convert blob to ArrayBuffer for PizZip
        const buf = await result.blob.arrayBuffer();
        zipOut.file(result.filename, buf);
      }
    } catch (err) {
      errors.push(`${label}: ${err.message || 'ข้อผิดพลาด'}`);
    }
  };

  // --- Generate each module DOCX ---
  // 🆕 หน้าปก (Cover) — ออกก่อน เพื่อเป็นไฟล์แรกใน zip
  await tryAdd('หน้าปก', () => generateCoverBlob({ formData, userInfo, unitDivisionPlan }));

  if (generatedPlan) {
    await tryAdd('วิเคราะห์งาน', () => generateJobAnalysisBlob({ learningOutcomes: generatedPlan.learningOutcomes, generatedPlan, courseCode }));
  }
  if (unitDivisionPlan) {
    await tryAdd('ตารางหน่วย', () => generateUnitTableBlob({ formData, unitDivisionPlan }));
  }
  if (loResults) {
    await tryAdd('ผลลัพธ์การเรียนรู้', () => generateLoBlob({ loResults, courseCode }));
  }
  if (compResults) {
    await tryAdd('สมรรถนะ', () => generateCompBlob({ compResults, courseCode }));
  }
  if (objResults) {
    await tryAdd('จุดประสงค์', () => generateObjBlob({ objResults, courseCode }));
  }
  if (conceptResults) {
    await tryAdd('สาระการเรียนรู้', () => generateContentBlob({ conceptResults, courseCode }));
  }
  if (activitiesResults) {
    await tryAdd('กิจกรรม', () => generateActivitiesDocx({ activitiesResults, formData, returnBlob: true }));
  }
  if (mediaResults) {
    await tryAdd('สื่อ', () => generateMediaBlob({ mediaResults, courseCode }));
  }

  // Generate main unit plan (all units combined)
  if (activitiesResults && loResults) {
    await tryAdd('แผนรายหน่วย', () => generateAllUnitsBlob({
      formData, loResults, compResults, objResults, conceptResults,
      activitiesResults, mediaResults, evidenceResults, assessmentResults,
      unitDivisionPlan,
    }));
  }

  const count = Object.keys(zipOut.files).length;
  if (count === 0) {
    throw new Error('ไม่มีข้อมูลให้ส่งออก — กรุณาสร้างข้อมูลอย่างน้อย 1 Module ก่อน');
  }

  const blob = zipOut.generate({
    type: 'blob',
    mimeType: 'application/zip',
  });
  const name = formData?.courseName || courseCode || 'lesson-plan';
  saveAs(blob, `แผนการสอน_${name.replace(/[/\\:*?"<>|\s]/g, '_')}.zip`);

  if (errors.length > 0) {
    console.warn('[exportAllZip] Partial errors:', errors);
  }
  return { exported: count, errors };
}

// --- Internal blob generators (clone core logic, return blob instead of saveAs) ---

async function fetchTemplateZip(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`ไม่พบ template: ${path}`);
  const buf = await resp.arrayBuffer();
  const z = new PizZip(buf);
  preprocessDocxZip(z);
  return z;
}

function renderAndBlob(zip, data, filename) {
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });
  doc.render(data);
  const blob = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return { blob, filename };
}

async function generateLoBlob({ loResults, courseCode }) {
  const zip = await fetchTemplateZip('/Template-lo.docx');
  const units = (Array.isArray(loResults) ? loResults : []).map((r, i) => ({
    unitNo: String(r._unitIdx != null ? r._unitIdx + 1 : i + 1),
    unitName: r.unitName || '',
    outcomes: (Array.isArray(r.outcomes) ? r.outcomes : []).map((o, j) => ({
      idx: j + 1, text: String(o || '').replace(/^\d+[\.\)]\s*/, ''),
    })),
  }));
  return renderAndBlob(zip, { courseCode: courseCode || '', units }, `ผลลัพธ์การเรียนรู้_${courseCode || 'export'}.docx`);
}

async function generateCompBlob({ compResults, courseCode }) {
  const zip = await fetchTemplateZip('/template-com.docx');
  const units = (Array.isArray(compResults) ? compResults : []).map((r, i) => ({
    unitNo: String(r._unitIdx != null ? r._unitIdx + 1 : i + 1),
    unitName: r.unitName || '',
    competencies: (Array.isArray(r.competencies) ? r.competencies : []).map((c, j) => ({
      idx: j + 1, text: String(c || '').replace(/^\d+[\.\)]\s*/, ''),
    })),
  }));
  return renderAndBlob(zip, { courseCode: courseCode || '', units }, `สมรรถนะประจำหน่วย_${courseCode || 'export'}.docx`);
}

async function generateObjBlob({ objResults, courseCode }) {
  const zip = await fetchTemplateZip('/template-obj.docx');
  // Nested loop structure — แยก subtopic groups + reset numbering ต่อกลุ่ม
  const stripLeadingNum = (s) => String(s || '').replace(/^\d+[\.\)]\s*/, '');
  const isSubtopicHeader = (s) => {
    const t = String(s || '').trim();
    return t.startsWith('📌') || /^(เรื่อง|หัวข้อ|กลุ่ม)\s*:/u.test(t);
  };
  const groupByHeader = (arr) => {
    const items = Array.isArray(arr) ? arr.filter((t) => String(t || '').trim()) : [];
    if (items.length === 0) return [];
    const groups = [];
    let current = null;
    let counter = 0;
    for (const t of items) {
      const str = String(t).trim();
      if (isSubtopicHeader(str)) {
        current = { header: str, items: [] };
        groups.push(current);
        counter = 0;
      } else {
        if (!current) {
          current = { header: '', items: [] };
          groups.push(current);
        }
        counter += 1;
        current.items.push({ idx: counter, text: stripLeadingNum(str) });
      }
    }
    return groups;
  };

  const units = (Array.isArray(objResults) ? objResults : []).map((r, i) => ({
    unitNo: String(r._unitIdx != null ? r._unitIdx + 1 : i + 1),
    unitName: r.unitName || '',
    cognitive: groupByHeader(r.cognitive),
    psychomotor: groupByHeader(r.psychomotor),
    affective: groupByHeader(r.affective),
    application: groupByHeader(r.application),
  }));
  return renderAndBlob(zip, { courseCode: courseCode || '', units }, `จุดประสงค์เชิงพฤติกรรม_${courseCode || 'export'}.docx`);
}

async function generateContentBlob({ conceptResults, courseCode }) {
  const zip = await fetchTemplateZip('/template-content.docx');
  // Simplified — same logic as generateContentDocx
  const units = (Array.isArray(conceptResults) ? conceptResults : []).map((r, i) => ({
    unitNo: String(r._unitIdx != null ? r._unitIdx + 1 : i + 1),
    unitName: r.unitName || '',
    concepts: (Array.isArray(r.concepts) ? r.concepts : []).map((c, j) => ({
      idx: j + 1, text: String(c || '').replace(/^\d+[\.\)]\s*/, ''),
    })),
  }));
  return renderAndBlob(zip, { courseCode: courseCode || '', units }, `สาระการเรียนรู้_${courseCode || 'export'}.docx`);
}

async function generateMediaBlob({ mediaResults, courseCode }) {
  const zip = await fetchTemplateZip('/template-media.docx');
  const units = (Array.isArray(mediaResults) ? mediaResults : []).map((r, i) => {
    const unitNo = String(r._unitIdx != null ? r._unitIdx + 1 : i + 1);
    const media = (Array.isArray(r.media) ? r.media : []).map((m, j) => ({
      idx: j + 1,
      name: m.name || '',
      type: categorizeMediaType(m.type),
      description: m.description || '',
      usage: m.usage || '',
    }));
    return { unitNo, unitName: r.unitName || '', media };
  });
  return renderAndBlob(zip, { courseCode: courseCode || '', units }, `สื่อและแหล่งการเรียนรู้_${courseCode || 'export'}.docx`);
}

async function generateJobAnalysisBlob({ learningOutcomes, generatedPlan, courseCode }) {
  const zip = await fetchTemplateZip('/template-job.docx');
  const lo = Array.isArray(learningOutcomes) ? learningOutcomes : [];
  const plan = generatedPlan || {};
  return renderAndBlob(zip, {
    courseCode: courseCode || '',
    jobName: plan.jobName || '',
    duties: (Array.isArray(plan.duties) ? plan.duties : []).map((d, i) => ({
      dutyNo: i + 1,
      dutyName: d.dutyName || d.name || '',
      tasks: (Array.isArray(d.tasks) ? d.tasks : []).map((t, j) => ({
        taskNo: j + 1, taskName: t.taskName || t.name || t || '',
      })),
    })),
    learningOutcomes: lo.map((o, i) => ({ idx: i + 1, text: String(o || '') })),
  }, `ตารางวิเคราะห์งาน_${courseCode || 'export'}.docx`);
}

async function generateUnitTableBlob({ formData, unitDivisionPlan, hasEvalRow = true }) {
  const zip = await fetchTemplateZip('/template-unit.docx');
  const fd = formData || {};
  const plan = Array.isArray(unitDivisionPlan) ? unitDivisionPlan : [];
  const { theory, practice } = parseRatio(fd.ratio);
  let sumTheory = 0, sumPractice = 0, sumTotal = 0;
  const units = plan.map((u, i) => {
    const t = parseInt(u.theory) || 0;
    const p = parseInt(u.practice) || 0;
    sumTheory += t; sumPractice += p; sumTotal += t + p;
    return { unitNo: i + 1, unitName: u.unitName || '', theory: String(t), practice: String(p), total: String(t + p) };
  });
  const evalT = hasEvalRow ? Math.max(Math.round(theory * 0.1), 1) : 0;
  const evalP = hasEvalRow ? Math.max(Math.round(practice * 0.1), 1) : 0;
  return renderAndBlob(zip, {
    courseCode: fd.courseCode || '', courseName: fd.courseName || '',
    theoryHours: String(theory), practiceHours: String(practice), credits: fd.credits || '',
    units,
    evalTheory: hasEvalRow ? String(evalT) : '', evalPractice: hasEvalRow ? String(evalP) : '', evalTotal: hasEvalRow ? String(evalT + evalP) : '',
    totalTheory: String(sumTheory + evalT), totalPractice: String(sumPractice + evalP), totalAll: String(sumTotal + evalT + evalP),
  }, `ตารางหน่วยการเรียนรู้_${fd.courseCode || 'export'}.docx`);
}

/**
 * Generate Information Sheet (ใบความรู้) as Word doc using HTML-to-Word approach.
 * Each call writes ONE file.
 */
export async function generateInformationSheetDocx({ sheet, filename }) {
  if (!sheet) throw new Error('ไม่พบข้อมูลใบความรู้');
  const s = sheet;

  // Build data — placeholders ตรงกับ template-Information-Sheet.docx
  // {title} ใน template = "ชื่อเรื่อง/งาน"
  //   - ถ้ามี workTask (ใหม่) → ใช้เลย
  //   - ถ้าไม่มี (ใบเก่า) → ใช้ title แต่ตัด prefix "ใบความรู้ที่ N:" ออก
  const stripSheetTitlePrefix = (t) => String(t || '')
    .replace(/^ใบ[^:]{0,20}(ที่\s*\d+|หน่วยที่\s*\d+)[\s:]*/u, '')
    .trim();
  const data = {
    sheetNo: String(s.sheetNo || ''),
    unitNo: String(s.unitNo || ''),
    courseCode: String(s.courseCode || ''),
    courseName: String(s.courseName || ''),
    lessonNo: String(s.lessonNo || ''),
    unitName: String(s.unitName || ''),
    theoryHours: String(s.theoryHours || ''),
    practiceHours: String(s.practiceHours || ''),
    title: prepareThaiText(s.workTask || stripSheetTitlePrefix(s.title) || ''),
    lo: prepareThaiText(s.lo || '-'),
    standardRef: prepareThaiText(s.standardRef || '-'),
    comp1: prepareThaiText(s.comp1 || '-'),
    comp2: prepareThaiText(s.comp2 || '-'),
    // 🆕 Loop array สำหรับ section 4 (จุดประสงค์เชิงพฤติกรรม)
    //   - ใช้ {#objectives}{idx} {text}{/objectives} ใน template
    //   - คาดหวังเป็น array of { idx, text }
    //   - ถ้าไม่มี → empty array (loop ไม่ render อะไรเลย)
    objectives: Array.isArray(s.objectives) ? s.objectives.map((o, i) => ({
      idx: o.idx != null ? String(o.idx) : String(i + 1),
      text: prepareThaiText(o.text || ''),
    })) : [],
    content: prepareThaiText(s.content || '-'),
    exercises: prepareThaiText(s.exercises || '-'),
    references: prepareThaiText(s.references || '-'),
    appendix: prepareThaiText(s.appendix || '-'),
  };

  const response = await fetch('/template-Information-Sheet.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ template-Information-Sheet.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try {
    doc.render(data);
  } catch (err) {
    console.error('Information Sheet docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const safeTitle = String(s.title || 'ใบความรู้').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const safeCourse = String(s.courseCode || 'export').replace(/[\\/:*?"<>|]/g, '_');
  const finalName = filename || `ใบความรู้ที่_${s.sheetNo || 'x'}_${safeTitle}_${safeCourse}`;
  saveAs(out, `${finalName}.docx`);
}

/**
 * Generate Operation Sheet (ใบปฏิบัติงาน) as Word doc using HTML-to-Word approach.
 */
export async function generateOperationSheetDocx({ sheet, filename }) {
  if (!sheet) throw new Error('ไม่พบข้อมูลใบปฏิบัติงาน');
  const s = sheet;

  // tools เป็น array — กระจายลง slot 5.1-5.4 (สูงสุด 4 ใบ)
  const tools = Array.isArray(s.tools) ? s.tools : [];
  const data = {
    sheetNo: String(s.sheetNo || ''),
    unitNo: String(s.unitNo || ''),
    courseCode: String(s.courseCode || ''),
    courseName: String(s.courseName || ''),
    lessonNo: String(s.lessonNo || ''),
    unitName: String(s.unitName || ''),
    theoryHours: String(s.theoryHours || ''),
    practiceHours: String(s.practiceHours || ''),
    title: String(s.title || ''),
    lo: prepareThaiText(s.lo || '-'),
    standardRef: prepareThaiText(s.standardRef || '-'),
    comp1: prepareThaiText(s.comp1 || '-'),
    comp2: prepareThaiText(s.comp2 || '-'),
    obj1: prepareThaiText(s.obj1 || '-'),
    obj2: prepareThaiText(s.obj2 || '-'),
    obj3: prepareThaiText(s.obj3 || '-'),
    obj4: prepareThaiText(s.obj4 || '-'),
    tool1: prepareThaiText(tools[0] || '-'),
    tool2: prepareThaiText(tools[1] || '-'),
    tool3: prepareThaiText(tools[2] || '-'),
    tool4: prepareThaiText(tools[3] || '-'),
    steps: prepareThaiText(s.steps || '-'),
    summary: prepareThaiText(s.summary || '-'),
    evaluation: prepareThaiText(s.evaluation || '-'),
    references: prepareThaiText(s.references || '-'),
  };

  const response = await fetch('/template-Operation-Sheet.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ template-Operation-Sheet.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true, linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try {
    doc.render(data);
  } catch (err) {
    console.error('Operation Sheet docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const safeTitle = String(s.title || 'ใบปฏิบัติงาน').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const safeCourse = String(s.courseCode || 'export').replace(/[\\/:*?"<>|]/g, '_');
  const finalName = filename || `ใบปฏิบัติงานที่_${s.sheetNo || 'x'}_${safeTitle}_${safeCourse}`;
  saveAs(out, `${finalName}.docx`);
}

/**
 * Generate Assignment Sheet (ใบมอบหมายงาน) as Word doc using HTML-to-Word approach.
 */
export async function generateAssignmentSheetDocx({ sheet, filename }) {
  if (!sheet) throw new Error('ไม่พบข้อมูลใบมอบหมายงาน');
  const s = sheet;

  const data = {
    sheetNo: String(s.sheetNo || ''),
    unitNo: String(s.unitNo || ''),
    courseCode: String(s.courseCode || ''),
    courseName: String(s.courseName || ''),
    lessonNo: String(s.lessonNo || ''),
    unitName: String(s.unitName || ''),
    theoryHours: String(s.theoryHours || ''),
    practiceHours: String(s.practiceHours || ''),
    title: String(s.title || ''),
    workProduct: prepareThaiText(s.workProduct || '-'),
    standardRef: prepareThaiText(s.standardRef || '-'),
    comp1: prepareThaiText(s.comp1 || '-'),
    comp2: prepareThaiText(s.comp2 || '-'),
    obj1: prepareThaiText(s.obj1 || '-'),
    obj2: prepareThaiText(s.obj2 || '-'),
    obj3: prepareThaiText(s.obj3 || '-'),
    obj4: prepareThaiText(s.obj4 || '-'),
    taskDetails: prepareThaiText(s.taskDetails || '-'),
    deadline: prepareThaiText(s.deadline || '-'),
    guidelines: prepareThaiText(s.guidelines || '-'),
    resources: prepareThaiText(s.resources || '-'),
    evaluation: prepareThaiText(s.evaluation || '-'),
  };

  const response = await fetch('/template-Assignment-Sheet.docx');
  if (!response.ok) throw new Error('ไม่พบไฟล์ template-Assignment-Sheet.docx');
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  preprocessDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true, linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  try {
    doc.render(data);
  } catch (err) {
    console.error('Assignment Sheet docx render error:', err);
    throw new Error('ไม่สามารถสร้างไฟล์ Word ได้: ' + (err.message || ''));
  }

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const safeTitle = String(s.title || 'ใบมอบหมายงาน').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const safeCourse = String(s.courseCode || 'export').replace(/[\\/:*?"<>|]/g, '_');
  const finalName = filename || `ใบมอบหมายงานที่_${s.sheetNo || 'x'}_${safeTitle}_${safeCourse}`;
  saveAs(out, `${finalName}.docx`);
}

async function generateAllUnitsBlob({ formData, loResults, compResults, objResults, conceptResults, activitiesResults, mediaResults, evidenceResults, assessmentResults, unitDivisionPlan }) {
  const zip = await fetchTemplateZip('/Template.docx');
  const units = unitDivisionPlan || [];
  const data = buildTemplateData({
    formData, loResults, compResults, objResults, conceptResults,
    activitiesResults, mediaResults, evidenceResults, assessmentResults,
    units, unitIndex: 0,
  });
  return renderAndBlob(zip, data, `แผนรายหน่วย_${formData?.courseCode || 'export'}.docx`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Weekly Lesson Plan Export (HTML-to-Word approach)
// Generates 1 file per unit containing all weeks with page breaks between
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate weekly lesson plan docx using HTML-to-Word approach.
 * Produces 1 file per unit with multiple weeks (page break between each week).
 *
 * @param {object} params
 * @param {object} params.formData
 * @param {object[]} params.loResults
 * @param {object[]} params.compResults
 * @param {object[]} params.objResults
 * @param {object[]} params.activitiesResults
 * @param {object[]} params.conceptResults
 * @param {object[]} params.units — parsed unit table [{no, name, topics, theory, practice, total}]
 * @param {number} params.unitIndex — which unit to export (0-based)
 * @param {object} [params.lessonPlanResults] — AI-generated weekly plan data (optional)
 */
export function generateWeeklyPlanDocx({
  formData,
  loResults,
  compResults,
  objResults,
  activitiesResults,
  conceptResults,
  units,
  unitIndex,
  lessonPlanResults,
}) {
  const fd = formData || {};
  const unit = units?.[unitIndex];
  const unitNo = unit?.no || String(unitIndex + 1);
  const unitName = unit?.name || loResults?.[unitIndex]?.unitName || `หน่วยที่ ${unitIndex + 1}`;
  const unitTheory = unit?.theory || '';
  const unitPractice = unit?.practice || '';

  // ── Section 1: Learning Outcome (same every week) ──
  const lo = loResults?.[unitIndex];
  const outcome = lo?.outcome || '';

  // ── Section 3: Competencies (same every week) ──
  const comp = compResults?.[unitIndex];
  const comps = Array.isArray(comp?.competencies) ? comp.competencies : [];

  // ── Section 4: Objectives (same every week) ──
  const obj = objResults?.[unitIndex];
  const allCognitive = Array.isArray(obj?.cognitive) ? obj.cognitive : [];
  const psychomotor = Array.isArray(obj?.psychomotor) ? obj.psychomotor : [];
  const affective = Array.isArray(obj?.affective) ? obj.affective : [];
  const application = Array.isArray(obj?.application) ? obj.application : [];

  // Use selected cognitive from activitiesResults if available
  const actByIdx = (activitiesResults || []).find((r) => r._unitIdx === unitIndex);
  const actByOrder = (activitiesResults || [])[unitIndex];
  const act = actByIdx || actByOrder || {};
  const selectedCognitive = Array.isArray(act._selectedCognitive) && act._selectedCognitive.length > 0
    ? act._selectedCognitive
    : allCognitive;

  // Combined objectives (all domains, numbered sequentially, no domain headers)
  const allObjItems = [...selectedCognitive, ...psychomotor, ...affective, ...application];

  // ── Section 5: Concept (same every week) ──
  const concept = conceptResults?.[unitIndex];
  const rawConcept = concept?.concept;
  const conceptText = Array.isArray(rawConcept)
    ? rawConcept.join('\n')
    : String(rawConcept || '').replace(/<br\s*\/?>/gi, '\n');

  // ── Activities data ──
  const activities = act.activities || [];
  const allMedia = act.media || [];

  // Evidence (unit-level)
  const knowledgeEvidence = act.knowledgeEvidence || [];
  const performanceEvidence = act.performanceEvidence || [];

  // Assessment (unit-level)
  const performanceCriteria = act.performanceCriteria || [];
  const assessmentMethods = act.assessmentMethods || [];
  const assessmentTools = act.assessmentTools || [];

  // Group activities by week
  const weekMap = {};
  activities.forEach((a) => {
    const w = a.week || 1;
    if (!weekMap[w]) weekMap[w] = [];
    weekMap[w].push(a);
  });
  const weekKeys = Object.keys(weekMap).sort((a, b) => Number(a) - Number(b));

  // Determine weeks to render
  let weeksToRender = [];
  if (weekKeys.length > 0) {
    weeksToRender = weekKeys.map((wk) => Number(wk));
  } else {
    // Fallback: calculate from unit hours
    const { theory: wT, practice: wP } = parseRatio(fd.ratio);
    const hrsPerWeek = wT + wP;
    const totalHrs = parseInt(unit?.total) || hrsPerWeek;
    const numWeeks = hrsPerWeek > 0 ? Math.max(1, Math.round(totalHrs / hrsPerWeek)) : 1;
    weeksToRender = Array.from({ length: numWeeks }, (_, i) => i + 1);
  }

  // AI-generated lesson plan data for this unit
  const aiResult = Array.isArray(lessonPlanResults)
    ? lessonPlanResults.find((r) => r._unitIdx === unitIndex)
    : null;

  // ── Build HTML ──
  const S = "font-family:'TH Sarabun New',sans-serif;font-size:16pt;line-height:1.3;";
  const SB = S + 'font-weight:bold;';
  const indent1 = 'margin-left:1cm;';
  const indent2 = 'margin-left:2cm;';

  let html = '';

  weeksToRender.forEach((weekNo, wIdx) => {
    const weekActs = weekMap[String(weekNo)] || [];
    const aiWeek = aiResult?.weeks?.find(w => (w.weekNo || 0) === weekNo) || aiResult?.weeks?.[wIdx] || {};

    // Page break between weeks (not before first)
    if (wIdx > 0) {
      html += `<div style="page-break-before:always;"></div>`;
    }

    // ── Header ──
    html += `<p style="${SB}font-size:18pt;text-align:center;">แผนการจัดการเรียนรู้</p>`;
    html += `<p style="${S}"><b>หน่วยที่</b> ${unitNo} <b>สอนครั้งที่</b> ${weekNo}</p>`;
    html += `<p style="${S}"><b>ชื่อหน่วยการเรียนรู้</b> ${unitName}</p>`;
    html += `<p style="${S}"><b>ทฤษฎี</b> ${unitTheory} ชม. <b>ปฏิบัติ</b> ${unitPractice} ชม.</p>`;
    html += `<br/>`;

    // ── Section 1: ผลลัพธ์การเรียนรู้ระดับหน่วยการเรียน ──
    html += `<p style="${SB}">1. ผลลัพธ์การเรียนรู้ระดับหน่วยการเรียน</p>`;
    html += `<p style="${S}${indent1}">${escHtml(outcome) || '-'}</p>`;

    // ── Section 2: อ้างอิงมาตรฐาน/เชื่อมโยงกลุ่มอาชีพ ──
    html += `<p style="${SB}">2. อ้างอิงมาตรฐาน/เชื่อมโยงกลุ่มอาชีพ</p>`;
    html += `<p style="${S}${indent1}">${escHtml(fd.standardRef) || '-'}</p>`;

    // ── Section 3: สมรรถนะประจำหน่วย ──
    html += `<p style="${SB}">3. สมรรถนะประจำหน่วย</p>`;
    comps.forEach((c, ci) => {
      html += `<p style="${S}${indent1}">3.${ci + 1} ${escHtml(String(c).replace(/^\d+\.\s*/, ''))}</p>`;
    });
    if (comps.length === 0) html += `<p style="${S}${indent1}">-</p>`;

    // ── Section 4: จุดประสงค์เชิงพฤติกรรม ──
    html += `<p style="${SB}">4. จุดประสงค์เชิงพฤติกรรม</p>`;
    allObjItems.forEach((item, i) => {
      html += `<p style="${S}${indent1}">4.${i + 1} ${escHtml(String(item).replace(/^\d+\.\s*/, ''))}</p>`;
    });
    if (allObjItems.length === 0) html += `<p style="${S}${indent1}">-</p>`;

    // ── Section 5: สาระการเรียนรู้ ──
    html += `<p style="${SB}">5. สาระการเรียนรู้</p>`;
    const conceptLines = conceptText.split('\n').filter(Boolean);
    if (conceptLines.length > 0) {
      conceptLines.forEach((line) => {
        html += `<p style="${S}${indent1}">${escHtml(line)}</p>`;
      });
    } else {
      html += `<p style="${S}${indent1}">-</p>`;
    }

    // ── Section 6: กิจกรรมการเรียนรู้ (DIFFERENT per week) ──
    html += `<p style="${SB}">6. กิจกรรมการเรียนรู้</p>`;
    if (weekActs.length > 0) {
      weekActs.forEach((a, ai) => {
        html += `<p style="${S}${indent1}"><b>${ai + 1}. ${escHtml(a.name || '')}</b> (${escHtml(a.phase || a.type || '')}, ${escHtml(a.duration || '')})</p>`;
        if (a.teacherAction) html += `<p style="${S}${indent2}">กิจกรรมครู: ${escHtml(a.teacherAction)}</p>`;
        if (a.studentAction) html += `<p style="${S}${indent2}">กิจกรรมนักเรียน: ${escHtml(a.studentAction)}</p>`;
      });
    } else if (aiWeek.activities?.length > 0) {
      aiWeek.activities.forEach((a, ai) => {
        const name = typeof a === 'string' ? a : (a.name || '');
        html += `<p style="${S}${indent1}">${ai + 1}. ${escHtml(name)}</p>`;
      });
    } else {
      html += `<p style="${S}${indent1}">-</p>`;
    }

    // ── Section 7: สื่อและแหล่งการเรียนรู้ (DIFFERENT per week) ──
    html += `<p style="${SB}">7. สื่อและแหล่งการเรียนรู้</p>`;
    // Collect materials from this week's activities
    const weekMaterials = weekActs.reduce((acc, a) => {
      if (a.materials) acc.push(...(Array.isArray(a.materials) ? a.materials : [a.materials]));
      return acc;
    }, []);
    // Also include unit-level media
    const mediaForWeek = weekMaterials.length > 0 ? weekMaterials : allMedia;
    if (mediaForWeek.length > 0) {
      mediaForWeek.forEach((m, mi) => {
        const name = typeof m === 'string' ? m : (m.name || m.description || '');
        const desc = typeof m === 'object' ? (m.type ? `(${m.type})` : '') : '';
        html += `<p style="${S}${indent1}">${mi + 1}. ${escHtml(name)} ${escHtml(desc)}</p>`;
      });
    } else {
      html += `<p style="${S}${indent1}">-</p>`;
    }

    // ── Section 8: หลักฐานการเรียนรู้ (unit-level) ──
    html += `<p style="${SB}">8. หลักฐานการเรียนรู้</p>`;
    html += `<p style="${SB}${indent1}">8.1 หลักฐานความรู้</p>`;
    if (knowledgeEvidence.length > 0) {
      knowledgeEvidence.forEach((e, ei) => {
        html += `<p style="${S}${indent2}">${ei + 1}. ${escHtml(String(e))}</p>`;
      });
    } else {
      html += `<p style="${S}${indent2}">-</p>`;
    }
    html += `<p style="${SB}${indent1}">8.2 หลักฐานการปฏิบัติงาน</p>`;
    if (performanceEvidence.length > 0) {
      performanceEvidence.forEach((e, ei) => {
        html += `<p style="${S}${indent2}">${ei + 1}. ${escHtml(String(e))}</p>`;
      });
    } else {
      html += `<p style="${S}${indent2}">-</p>`;
    }

    // ── Section 9: การวัดและประเมินผล (unit-level) ──
    html += `<p style="${SB}">9. การวัดและประเมินผล</p>`;
    html += `<p style="${SB}${indent1}">9.1 เกณฑ์การปฏิบัติงาน</p>`;
    if (performanceCriteria.length > 0) {
      performanceCriteria.forEach((e, ei) => {
        html += `<p style="${S}${indent2}">${ei + 1}. ${escHtml(String(e))}</p>`;
      });
    } else {
      html += `<p style="${S}${indent2}">-</p>`;
    }
    html += `<p style="${SB}${indent1}">9.2 วิธีการประเมิน</p>`;
    if (assessmentMethods.length > 0) {
      assessmentMethods.forEach((e, ei) => {
        html += `<p style="${S}${indent2}">${ei + 1}. ${escHtml(String(e))}</p>`;
      });
    } else {
      html += `<p style="${S}${indent2}">-</p>`;
    }
    html += `<p style="${SB}${indent1}">9.3 เครื่องมือประเมิน</p>`;
    if (assessmentTools.length > 0) {
      assessmentTools.forEach((e, ei) => {
        html += `<p style="${S}${indent2}">${ei + 1}. ${escHtml(String(e))}</p>`;
      });
    } else {
      html += `<p style="${S}${indent2}">-</p>`;
    }

    // ── Section 10: บันทึกผลหลังการจัดการเรียนรู้ ──
    html += `<p style="${SB}">10. บันทึกผลหลังการจัดการเรียนรู้</p>`;
    html += `<p style="${SB}${indent1}">10.1 ข้อสรุปหลังการจัดการเรียนรู้</p>`;
    html += `<p style="${S}${indent2}">........................................................................</p>`;
    html += `<p style="${SB}${indent1}">10.2 ปัญหาที่พบ</p>`;
    html += `<p style="${S}${indent2}">........................................................................</p>`;
    html += `<p style="${SB}${indent1}">10.3 แนวทางแก้ปัญหา</p>`;
    html += `<p style="${S}${indent2}">........................................................................</p>`;
  });

  // ── Generate Word file using HTML-to-Word (createWordDoc style) ──
  const title = `แผนรายสัปดาห์_${fd.courseCode || ''}_หน่วยที่${unitNo}`;
  const fullHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${title}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2cm 2cm 2cm 2cm; }
  body { font-family: 'TH Sarabun New', sans-serif; font-size: 16pt; line-height: 1.3; }
  p { margin: 2pt 0; }
  table { border-collapse: collapse; width: 100%; font-size: 16pt; }
  th, td { border: 1px solid black; padding: 5px; vertical-align: top; }
</style>
</head>
<body>${html}</body>
</html>`;

  const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[/\s]/g, '_')}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** HTML-escape helper for weekly plan export */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
