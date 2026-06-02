/**
 * AnalysisModule converters — JSON ↔ Markdown
 *
 * จุดประสงค์:
 *   - AI ตอบ JSON (เป๊ะกว่า) แต่ระบบเก่าใช้ markdown — convert ก่อนเก็บ state
 *   - รองรับ legacy markdown ที่ user มีอยู่ใน cache (ไม่ทำลาย)
 */

import { cleanAndParseJSON } from './jsonParser';

// ════════════════════════════════════════════════════════════════════
// Analysis Table (Duty-Task-Sub-Comp-Knowledge-Skills)
// ════════════════════════════════════════════════════════════════════

/**
 * แปลง JSON { rows: [...] } → markdown table 5 columns
 */
export function analysisJsonToMarkdown(data) {
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return null;

  const header = '| งานหลัก (Duty) | งานย่อย (Task) | สมรรถนะย่อย (Sub-Competency) | ความรู้ (Knowledge) | ทักษะ (Skills) |';
  const sep = '| --- | --- | --- | --- | --- |';

  const rows = data.rows.map((r) => {
    // Duty cell: **N. ชื่อ Duty** [standardRef] [(เพิ่มเติม: เหตุผล)]
    const dutyParts = [];
    dutyParts.push(`**${r.dutyNo || ''}. ${r.duty || ''}**`);
    if (r.standardRef && typeof r.standardRef === 'string' && r.standardRef.trim()) {
      dutyParts.push(r.standardRef);
    }
    if (r.source === 'เพิ่มเติม' && r.sourceReason) {
      dutyParts.push(`*(เพิ่มเติม: ${r.sourceReason})*`);
    }
    const dutyCell = dutyParts.join(' ');

    const tasksCell = (r.tasks || [])
      .map((t) => `${t.no || ''} ${t.text || ''}`.trim())
      .filter(Boolean)
      .join('<br>');

    const compsCell = (r.competencies || [])
      .map((c) => `${c.no || ''} ${c.text || ''}`.trim())
      .filter(Boolean)
      .join('<br>');

    const knowledgeCell = (r.knowledge || []).join('<br>');
    const skillsCell = (r.skills || []).join('<br>');

    return `| ${dutyCell} | ${tasksCell} | ${compsCell} | ${knowledgeCell} | ${skillsCell} |`;
  });

  return [header, sep, ...rows].join('\n');
}

/**
 * Parse AI response — JSON first, fallback markdown
 *
 * @returns {{ markdown: string, json: object|null, source: 'json'|'markdown' }}
 *   - markdown: string ที่จะเก็บใน state (always present)
 *   - json: parsed JSON object (null ถ้า AI ตอบ markdown ดิบ)
 *   - source: ที่มา — บอกว่ารับเป็น JSON หรือ markdown
 */
export function parseAnalysisResponse(aiResponse) {
  // ถ้า callApi(json: true) ส่ง object มาเลย (ไม่ใช่ string)
  if (aiResponse && typeof aiResponse === 'object' && Array.isArray(aiResponse.rows)) {
    const md = analysisJsonToMarkdown(aiResponse);
    if (md) return { markdown: md, json: aiResponse, source: 'json' };
  }

  // ถ้าเป็น string — ลอง parse JSON ก่อน
  if (typeof aiResponse === 'string') {
    const parsed = cleanAndParseJSON(aiResponse);
    if (parsed && Array.isArray(parsed.rows)) {
      const md = analysisJsonToMarkdown(parsed);
      if (md) return { markdown: md, json: parsed, source: 'json' };
    }
    // Fallback — treat as markdown ดิบ
    return { markdown: aiResponse, json: null, source: 'markdown' };
  }

  return { markdown: '', json: null, source: 'markdown' };
}

// ════════════════════════════════════════════════════════════════════
// Unit Division Table (หน่วยการเรียนรู้)
// ════════════════════════════════════════════════════════════════════

/**
 * แปลง JSON { units: [...] } → markdown table 6 columns
 */
export function unitDivisionJsonToMarkdown(data) {
  if (!data || !Array.isArray(data.units) || data.units.length === 0) return null;

  const header = '| หน่วยที่ | ชื่อหน่วยการเรียนรู้ | หัวข้อเรื่อง (Topics) | ทฤษฎี (ชม.) | ปฏิบัติ (ชม.) | รวม (ชม.) |';
  const sep = '| --- | --- | --- | --- | --- | --- |';

  const rows = data.units.map((u) => {
    const no = u.no != null ? String(u.no) : '';
    const name = u.name || '';
    // Topics: array → join with - prefix on new lines
    const topicsArr = Array.isArray(u.topics) ? u.topics : (u.topics ? [u.topics] : []);
    const topicsCell = topicsArr.map((t) => `- ${t}`).join('<br>');
    const theory = u.theory != null ? String(u.theory) : '';
    const practice = u.practice != null ? String(u.practice) : '';
    const total = u.total != null ? String(u.total) : '';
    return `| ${no} | ${name} | ${topicsCell} | ${theory} | ${practice} | ${total} |`;
  });

  return [header, sep, ...rows].join('\n');
}

/**
 * Parse unit-division AI response — JSON first, fallback markdown
 */
export function parseUnitDivisionResponse(aiResponse) {
  if (aiResponse && typeof aiResponse === 'object' && Array.isArray(aiResponse.units)) {
    const md = unitDivisionJsonToMarkdown(aiResponse);
    if (md) return { markdown: md, json: aiResponse, source: 'json' };
  }

  if (typeof aiResponse === 'string') {
    const parsed = cleanAndParseJSON(aiResponse);
    if (parsed && Array.isArray(parsed.units)) {
      const md = unitDivisionJsonToMarkdown(parsed);
      if (md) return { markdown: md, json: parsed, source: 'json' };
    }
    return { markdown: aiResponse, json: null, source: 'markdown' };
  }

  return { markdown: '', json: null, source: 'markdown' };
}
