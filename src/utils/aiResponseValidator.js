/**
 * AI Response Validator — wrap callApi result + validate against schema
 *
 * ใช้ใน module หลัง `callApi(json: true)`:
 *
 *   const data = await callApi(parts, { json: true });
 *   const validated = ensureSchema(data, 'learningOutcomes', { unitsKey: 'units' });
 *   // validated.units = guaranteed array, even if AI ตอบผิด → throw friendly error
 */

import { validateAgainstSchema } from '../constants/aiSchemas';

/**
 * Friendly Thai error messages
 */
const FRIENDLY_ERRORS = {
  null_data: 'AI ตอบในรูปแบบที่ไม่ถูกต้อง — parse JSON ไม่ได้\n' +
    '💡 สาเหตุที่พบบ่อย: model เล็กเกินสำหรับ Module นี้ หรือ output ถูกตัดกลางทาง\n' +
    '👉 แนะนำ: ลองใหม่ 1-2 ครั้ง หรือเปลี่ยน Provider เป็น Gemini / GPT-4 / Claude',
  missing_keys: (keys) =>
    `AI ตอบ JSON ผิดโครงสร้าง — ขาด field ที่จำเป็น: ${keys.join(', ')}\n` +
    `กรุณาลองใหม่อีกครั้ง หรือเปลี่ยน Provider`,
  invalid_array: (key) => `AI ส่ง '${key}' ที่ไม่ใช่ array — กรุณาลองใหม่`,
  empty_array: (key) => `AI ส่ง '${key}' ที่เป็น array ว่าง — กรุณาลองใหม่ (อาจเพราะข้อมูล input ไม่พอ)`,
};

/**
 * Validate AI response ตาม schema ใน aiSchemas.js
 * @param {any} data — result จาก callApi(json: true) — น่าจะเป็น object
 * @param {string} schemaName — key ใน SCHEMAS
 * @param {object} [opts]
 * @param {string} [opts.arrayKey] — ถ้าระบุ → ตรวจว่า data[arrayKey] เป็น non-empty array
 * @returns {object} validated data (เหมือนเดิม) — throw ถ้า invalid
 */
export function ensureSchema(data, schemaName, opts = {}) {
  if (data === null || data === undefined) {
    throw new Error(FRIENDLY_ERRORS.null_data);
  }

  // ถ้า data เป็น string (อาจเพราะ json:true ไม่ทำงาน) — try parse
  if (typeof data === 'string') {
    throw new Error(FRIENDLY_ERRORS.null_data);
  }

  const { valid, missing } = validateAgainstSchema(data, schemaName);
  if (!valid) {
    throw new Error(FRIENDLY_ERRORS.missing_keys(missing));
  }

  if (opts.arrayKey) {
    const val = data[opts.arrayKey];
    if (!Array.isArray(val)) {
      throw new Error(FRIENDLY_ERRORS.invalid_array(opts.arrayKey));
    }
    if (val.length === 0 && opts.requireNonEmpty !== false) {
      throw new Error(FRIENDLY_ERRORS.empty_array(opts.arrayKey));
    }
  }

  return data;
}

/**
 * Safe access — ใช้แทน .units?.length, .units?.map
 * @returns array (อาจ empty) — ไม่ throw
 */
export function safeArray(data, key) {
  if (!data || typeof data !== 'object') return [];
  const val = data[key];
  return Array.isArray(val) ? val : [];
}
