/**
 * AI Schemas — กลางสำหรับทุก module
 *
 * แต่ละ entry กำหนด:
 *   - description: คำอธิบายสั้น
 *   - requiredKeys: keys ระดับ root ที่ต้องมี (lightweight validation)
 *   - example: ตัวอย่าง shape (ใช้ดูประกอบ + ใส่ใน prompt ถ้าต้องการ)
 *
 * ไม่ใช้ ajv/zod (เพื่อไม่ต้องเพิ่ม dependency) — wcheck แค่ basic shape
 */

import { validateShape } from '../utils/jsonParser';

export const SCHEMAS = {
  // ── AnalysisModule — Job Analysis (Duty-Task) ──
  analysis: {
    description: 'Job Analysis Table — Duty/Task/Competency/Knowledge/Skills',
    requiredKeys: ['rows'],
    example: {
      rows: [
        {
          dutyNo: 1,
          duty: 'ติดตั้งระบบไฟแสงสว่าง',
          source: 'หลักสูตร', // 'หลักสูตร' | 'เพิ่มเติม'
          sourceReason: '...',
          standardRef: '🔗 อ้างอิง: UoC.1.1', // optional
          tasks: [
            { no: '1.1', text: 'อ่านแบบวงจรไฟแสงสว่าง' },
            { no: '1.2', text: 'เตรียมอุปกรณ์' },
          ],
          competencies: [
            { no: '1.1', text: 'อ่านแบบวงจรไฟฟ้าตามมาตรฐาน' },
          ],
          knowledge: ['1. หลักการไฟฟ้าเบื้องต้น', '2. ...'],
          skills: ['1. ใช้มัลติมิเตอร์', '2. ...'],
        },
      ],
    },
  },

  // ── AnalysisModule — Unit Division ──
  unitDivision: {
    description: 'Unit Division Table — หน่วยการเรียนรู้ + เวลา',
    requiredKeys: ['units'],
    example: {
      units: [
        {
          no: 1,
          name: 'ติดตั้งระบบไฟแสงสว่าง',
          topics: ['อ่านแบบวงจร', 'เตรียมอุปกรณ์', 'ติดตั้งและทดสอบ'],
          weeks: 2,       // จำนวนสัปดาห์ที่ใช้
          theory: 4,      // ชม.ทฤษฎี (= weeks × theoryPerWeek)
          practice: 8,    // ชม.ปฏิบัติ (= weeks × practicePerWeek)
          total: 12,      // ทฤษฎี + ปฏิบัติ
        },
      ],
    },
  },

  // ── LearningOutcomesModule (existing) ──
  learningOutcomes: {
    description: 'ผลลัพธ์การเรียนรู้ระดับหน่วย',
    requiredKeys: ['units'],
    example: {
      units: [{ unitName: 'หน่วยที่ 1: ...', outcome: 'ข้อความผลลัพธ์...' }],
    },
  },

  // ── CompetencyModule (existing) ──
  competency: {
    description: 'สมรรถนะประจำหน่วย',
    requiredKeys: ['units'],
    example: {
      units: [{
        unitName: '...',
        competencies: ['1. แสดงความรู้เกี่ยวกับ...', '2. กริยา + กรรม + เงื่อนไข'],
      }],
    },
  },

  // ── ObjectivesModule (existing) ──
  objectives: {
    description: 'จุดประสงค์เชิงพฤติกรรม 4 ด้าน',
    requiredKeys: ['units'],
    example: {
      units: [{
        unitName: '...',
        cognitive: ['📌 เรื่อง: ...', '1. (K1) ...'],
        psychomotor: ['1. ...'],
        affective: ['1. มีเจตคติ...'],
        application: ['1. ประยุกต์ใช้...'],
      }],
    },
  },

  // ── ConceptModule (existing) ──
  concept: {
    description: 'สาระการเรียนรู้',
    requiredKeys: ['units'],
    example: {
      units: [{ unitName: '...', concept: '1. ...\n2. ...' }],
    },
  },

  // ── ActivitiesModule (existing) — per unit ──
  activitiesPerUnit: {
    description: 'กิจกรรมการเรียนรู้ + ตัวชี้วัด ว.9 + ชิ้นงาน',
    requiredKeys: ['unitName', 'activities'],
    // schema ซับซ้อนเกินกว่าจะ list ทั้งหมด — ดูใน prompts.js SYSTEM_PROMPT_ACTIVITIES
  },

  // ── MediaModule (existing) ──
  media: {
    description: 'สื่อและแหล่งการเรียนรู้',
    requiredKeys: ['units'],
    example: {
      units: [{
        unitName: '...',
        media: [
          { name: '...', type: 'สื่อการสอน', description: '...', usage: '...' },
        ],
      }],
    },
  },

  // ── AssessmentModule (existing) ──
  assessment: {
    description: 'เกณฑ์/วิธี/เครื่องมือการประเมิน',
    requiredKeys: ['units'],
    example: {
      units: [{
        unitName: '...',
        performanceCriteria: ['...'],
        assessmentMethods: ['...'],
        assessmentTools: ['...'],
      }],
    },
  },

  assessmentTools: {
    description: 'เครื่องมือประเมิน (per unit, per tool)',
    requiredKeys: ['unitName', 'tools'],
  },

  questionBank: {
    description: 'คลังข้อสอบปรนัย (per unit)',
    requiredKeys: ['unitName', 'objectives'],
  },

  affectiveAssessment: {
    description: 'แบบประเมินจิตพิสัย',
    requiredKeys: ['unitName', 'affectiveTools'],
  },

  // ── JobSheet variants ──
  jobSheets: {
    description: 'ใบงานหลายใบ (jobSheets[])',
    requiredKeys: ['jobSheets'],
  },
  jobSheetSingle: {
    description: 'ใบงานเดี่ยว (jobSheet object)',
    requiredKeys: ['jobSheet'],
  },
  jobSheetEval: {
    description: 'แบบประเมินใบงาน',
    requiredKeys: ['evaluations'],
  },

  // ── Information / Operation / Assignment Sheets ──
  informationSheet: {
    description: 'ใบความรู้',
    requiredKeys: ['title', 'content'],
  },
  operationSheet: {
    description: 'ใบปฏิบัติงาน',
    requiredKeys: ['title', 'steps'],
  },
  assignmentSheet: {
    description: 'ใบมอบหมายงาน',
    requiredKeys: ['title', 'taskDetails'],
  },

  // ── Extraction (course info from PDF/Image) ──
  extraction: {
    description: 'ดึงข้อมูลรายวิชาจากไฟล์ที่อัปโหลด',
    requiredKeys: ['isValidCurriculum'],
  },
};

/**
 * Validate parsed JSON ตาม schema
 * Returns: { valid, missing, schema }
 */
export function validateAgainstSchema(data, schemaName) {
  const schema = SCHEMAS[schemaName];
  if (!schema) return { valid: false, missing: [], reason: `unknown schema: ${schemaName}` };
  return { ...validateShape(data, schema.requiredKeys), schema };
}

/**
 * ใช้ใน prompt — สร้าง schema hint string
 * (ตอนนี้ prompts ทุกตัวมี example อยู่แล้ว — ฟังก์ชันนี้สำรองไว้ถ้าต้องการ inject ภายหลัง)
 */
export function schemaPromptHint(schemaName) {
  const schema = SCHEMAS[schemaName];
  if (!schema) return '';
  return `\n\n[Schema reference: ${schema.description}]\nRequired root keys: ${schema.requiredKeys.join(', ')}`;
}
