/**
 * Robust JSON parser สำหรับ AI response
 *
 * ปัญหาที่ AI providers ทำให้ JSON ไม่ parse ได้:
 *   1. ห่อด้วย ```json ... ``` หรือ ``` ... ```
 *   2. มีข้อความนำ/ปิดท้าย ("Here is the JSON:", "Hope this helps!")
 *   3. Trailing commas (Gemini/Claude บางครั้ง)
 *   4. Smart quotes (" " ' ') แทน " '
 *   5. Comments แบบ // หรือ block-comment
 *   6. Unescaped newlines ใน string values
 *
 * ฟังก์ชันนี้ทำ best-effort cleanup แล้วลอง JSON.parse
 * ถ้ายัง fail → throw error ที่ informative (ไม่ silent null)
 */

/**
 * Strip markdown code fences + leading/trailing text
 */
function stripCodeFences(str) {
  if (!str) return str;
  let s = str.trim();

  // Strip ```json ... ``` หรือ ``` ... ```
  s = s.replace(/^```(?:json|JSON)?\s*\n?/m, '').replace(/```\s*$/m, '');

  // Strip ภาษาธรรมชาติก่อน { หรือ [ (เช่น "Here is the JSON: {...}")
  const firstBrace = s.search(/[\{\[]/);
  if (firstBrace > 0) {
    const before = s.slice(0, firstBrace).trim();
    // ถ้าก่อน { มีข้อความสั้น (< 100 chars) ที่ดูเหมือนคำอธิบาย — ตัดออก
    if (before.length < 200 && !/[\{\}\[\]]/.test(before)) {
      s = s.slice(firstBrace);
    }
  }

  // Strip ข้อความหลัง } หรือ ] (เช่น "}\n\nHope this helps!")
  const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastBrace > -1 && lastBrace < s.length - 1) {
    const after = s.slice(lastBrace + 1).trim();
    if (after.length < 200) {
      s = s.slice(0, lastBrace + 1);
    }
  }

  return s.trim();
}

/**
 * Clean common JSON syntax issues
 */
function cleanJsonSyntax(str) {
  let s = str;

  // Comments: // ... \n  หรือ /* ... */
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:"\\])\/\/[^\n]*/g, '$1'); // ระวัง URL เช่น https://

  // Smart quotes → straight quotes
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // Trailing commas: },]  →  }] /  ,}  →  }
  s = s.replace(/,(\s*[\}\]])/g, '$1');

  // Single quotes around keys — convert to double (best-effort, conservative)
  // จับเฉพาะ pattern '{ 'key':' (ไม่แก้ string values เพราะอาจมี ' ใน text ไทย)
  // ปล่อยให้ provider จัดการเอง — ไม่อันตราย

  return s;
}

/**
 * Try repair JSON.parse — incremental fix attempts
 */
function tryParse(str) {
  // Attempt 1: parse ตรงๆ
  try { return JSON.parse(str); } catch {}

  // Attempt 2: คลีน syntax ทั่วไป
  try { return JSON.parse(cleanJsonSyntax(str)); } catch {}

  // Attempt 3: ตัด extra ใน 1000 chars สุดท้าย (case AI พูดต่อหลัง JSON)
  const truncated = str.slice(0, Math.max(str.lastIndexOf('}'), str.lastIndexOf(']')) + 1);
  if (truncated.length > 0 && truncated !== str) {
    try { return JSON.parse(cleanJsonSyntax(truncated)); } catch {}
  }

  return undefined;
}

/**
 * Main API: clean + parse + return value (ไม่ silent null)
 *
 * @param {string} str — Raw AI response
 * @param {object} [opts]
 * @param {boolean} [opts.throwOnError=false] — throw error แทน return null
 * @returns {any} parsed value, หรือ null ถ้า parse fail (เมื่อ throwOnError=false)
 */
export const cleanAndParseJSON = (str, opts = {}) => {
  if (!str || typeof str !== 'string') {
    if (opts.throwOnError) throw new Error('JSON parse: empty or non-string input');
    return null;
  }

  const stripped = stripCodeFences(str);
  const result = tryParse(stripped);

  if (result !== undefined) return result;

  // ── Diagnostic info สำหรับ debug ────────────────────────────────
  const preview = stripped.slice(0, 300);
  const tail = stripped.length > 300 ? stripped.slice(-100) : '';
  const errMsg = `JSON Parse Error: ไม่สามารถ parse JSON จาก AI response\n` +
    `Input length: ${stripped.length} chars\n` +
    `Preview: ${preview}${tail ? '\n...' + tail : ''}`;

  console.error(errMsg);

  if (opts.throwOnError) throw new Error(errMsg);
  return null;
};

/**
 * Validate object ว่ามี keys ที่ต้องการครบ (lightweight runtime check)
 *
 * @param {object} data — parsed JSON
 * @param {string[]} requiredKeys — keys ที่ต้องมี
 * @returns {{valid: boolean, missing: string[]}}
 */
export const validateShape = (data, requiredKeys = []) => {
  if (!data || typeof data !== 'object') {
    return { valid: false, missing: requiredKeys, reason: 'not an object' };
  }
  const missing = requiredKeys.filter((k) => !(k in data));
  return { valid: missing.length === 0, missing };
};
