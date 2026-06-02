/**
 * Module Profiles — กำหนด requirement ของแต่ละ AI module
 *
 * ใช้สำหรับ smart routing — เลือก Provider ที่เหมาะที่สุดให้แต่ละ module
 *
 * Tokens estimation (rough):
 *   - 1 token ≈ 3 chars (Thai + JSON mixed)
 *   - System prompt ~500-2000 tokens
 *   - Context (loResults, etc.) varies — 1-10K tokens
 *   - Output: depends on module
 *
 * minContext = input expected (worst case) + output expected + safety
 */

export const MODULE_PROFILES = {
  // ── AnalysisModule ──
  // Input: curriculum content (text/PDF) — moderate
  // Output: JSON job analysis table (10+ rows, deep nested) — medium
  analysis: { label: 'วิเคราะห์งาน', minContext: 10000, estOutput: 4000 },
  unitDivision: { label: 'แบ่งหน่วยการเรียนรู้', minContext: 8000, estOutput: 3000 },

  // ── Core modules (output per unit, ~10-15 units) ──
  learningOutcomes: { label: 'ผลลัพธ์การเรียนรู้', minContext: 8000, estOutput: 2500 },
  competency:       { label: 'สมรรถนะประจำหน่วย', minContext: 8000, estOutput: 2500 },
  objectives:       { label: 'จุดประสงค์เชิงพฤติกรรม', minContext: 12000, estOutput: 5000 }, // 4 domains × N units
  concept:          { label: 'สาระการเรียนรู้', minContext: 10000, estOutput: 3500 },

  // ── ActivitiesModule (heaviest — per unit, multi-week, deep nested) ──
  activities: { label: 'กิจกรรมการเรียนรู้', minContext: 20000, estOutput: 8000 },
  activitiesAssessmentTools: { label: 'เครื่องมือประเมิน (กิจกรรม)', minContext: 12000, estOutput: 4000 },
  activitiesQuestionBank:    { label: 'คลังข้อสอบ', minContext: 10000, estOutput: 4000 },

  // ── Media + sheets (วัดจริง: input 8K-12K tokens — Thai tokenizer inefficient) ──
  media:           { label: 'สื่อและแหล่งการเรียนรู้', minContext: 14000, estOutput: 3000 },
  jobSheet:        { label: 'ใบงาน', minContext: 20000, estOutput: 4000 },
  infoSheet:       { label: 'ใบความรู้', minContext: 18000, estOutput: 4000 },
  operationSheet:  { label: 'ใบปฏิบัติงาน', minContext: 16000, estOutput: 3000 },
  assignmentSheet: { label: 'ใบมอบหมายงาน', minContext: 14000, estOutput: 2500 },

  // ── Assessment ──
  assessment:           { label: 'การวัดและประเมินผล', minContext: 12000, estOutput: 3500 },
  assessmentTools:      { label: 'เครื่องมือประเมิน', minContext: 12000, estOutput: 4000 },
  affectiveAssessment:  { label: 'แบบประเมินจิตพิสัย', minContext: 10000, estOutput: 3000 },
  jobSheetEval:         { label: 'แบบประเมินใบงาน', minContext: 14000, estOutput: 4000 },

  // ── Extraction (เปิดไฟล์/PDF) ──
  extraction:           { label: 'ดึงข้อมูลรายวิชา', minContext: 32000, estOutput: 2000 }, // PDF อาจใหญ่
  standardOcr:          { label: 'OCR มาตรฐานอาชีพ', minContext: 32000, estOutput: 2000 },
};

/**
 * ดึง profile — ถ้าไม่เจอ return default (ปลอดภัย)
 */
export function getModuleProfile(moduleName) {
  return MODULE_PROFILES[moduleName] || { label: moduleName, minContext: 8000, estOutput: 2000 };
}

/**
 * Helper: รวม minContext + estOutput = total ที่ provider ต้องรองรับ
 */
export function getRequiredTotalContext(moduleName) {
  const p = getModuleProfile(moduleName);
  return p.minContext + p.estOutput + 500; // safety margin
}
