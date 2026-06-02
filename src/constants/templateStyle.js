/**
 * Template Style Guide (กลาง) — กำหนดให้ Word output ทุกประเภทใช้สไตล์เดียวกัน
 *
 * ทุก .docx template ใน /public/ ต้องผ่าน script `apply-template-style.py`
 * เพื่อ enforce style เหล่านี้ใน XML ของ template
 *
 * Code ที่ generate Word ในรันไทม์ (docxTemplateExport.js) ก็ควรอ้างอิงค่าเหล่านี้
 */

export const TEMPLATE_STYLE = {
  // ── ฟอนต์ ──────────────────────────────────────────────────────
  thaiFont: 'TH SarabunPSK',
  englishFont: 'TH SarabunPSK', // ใช้ฟอนต์ไทยกับภาษาอังกฤษด้วย — consistency

  // ── ขนาดตัวอักษร (pt) ─────────────────────────────────────────
  bodySize: 16,
  headingSize: 18,

  // ── ตาราง ──────────────────────────────────────────────────────
  tableBorderColor: '#000000',
  cellPadding: '0.1in',

  // ── ระยะขอบหน้ากระดาษ (cm) — ตามที่ user กำหนด ─────────────────
  pageMarginTop: '2cm',
  pageMarginBottom: '2cm',
  pageMarginLeft: '2.5cm',     // กว้างกว่าด้านขวาเล็กน้อย (เผื่อเย็บเล่ม/เจาะรู)
  pageMarginRight: '2cm',
  pageMarginGutter: '0cm',

  // ── ระยะเยื้องของรายการเลขข้อ "1) 2) 3)" ────────────────────────
  // ปรับค่าตามต้องการ: 0.25in (เล็กน้อย), 0.5in (ปกติ), 0.75in (เยื้องเยอะ)
  numberedItemIndent: '0.5in',

  // ── Hanging indent (ความกว้างของ "1) ") ─────────────────────────
  // บรรทัดที่ 2+ ของข้อความยาวจะเยื้องเข้าไปอีก = numberedItemHangingWidth
  // ให้ตรงกับตำแหน่งข้อความ ไม่ตรงกับเลข "1)"
  // ค่าประมาณตามขนาดฟอนต์ 16pt:
  //   0.21in (300 twips) — เลข 1 หลัก gap แค่ 1 space
  //   0.33in (480 twips) — เลข 2 หลัก
  numberedItemHangingWidth: '0.21in',
};

// ── OOXML / docx ต้องใช้หน่วยพิเศษ ─────────────────────────────────
// docx ใช้:
//   - twips (1 inch = 1440 twips)
//   - half-points (1 pt = 2 half-points) สำหรับ font size
export const TEMPLATE_STYLE_OOXML = {
  thaiFont: TEMPLATE_STYLE.thaiFont,
  englishFont: TEMPLATE_STYLE.englishFont,
  bodySizeHalfPt: TEMPLATE_STYLE.bodySize * 2,        // 32
  headingSizeHalfPt: TEMPLATE_STYLE.headingSize * 2,  // 36
  // หน่วย twips (1 cm = 567 twips)
  pageMarginTopTwips: 1134,                           // 2 cm
  pageMarginBottomTwips: 1134,                        // 2 cm
  pageMarginLeftTwips: 1417,                          // 2.5 cm
  pageMarginRightTwips: 1134,                         // 2 cm
  pageMarginGutterTwips: 0,                           // 0 cm
  cellPaddingTwips: 144,                              // 0.1 inch
  tableBorderColorHex: '000000',                      // ดำ (no #)
  numberedItemIndentTwips: 720,                       // 0.5 inch
  numberedItemHangingTwips: 300,                      // 0.21 inch (~ "1) " ที่ 16pt)
};
