/**
 * Open a print-ready popup for saving as PDF.
 */
export const printToPdf = (title, contentHtml) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('กรุณาอนุญาตให้เปิด Pop-up เพื่อพิมพ์เอกสาร (Allow Pop-ups)');
    return;
  }

  const html = `<html>
<head>
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Sarabun', sans-serif; padding: 20px; line-height: 1.5; }
    h1 { font-size: 20px; text-align: center; margin-bottom: 20px; }
    h2 { font-size: 18px; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 15px; font-size: 14px; }
    th, td { border: 1px solid #000; padding: 8px; vertical-align: top; }
    th { background-color: #f0f0f0; font-weight: bold; text-align: left; }
    ul { margin: 0; padding-left: 20px; }
    .text-center { text-align: center; }
    .no-print { margin-bottom: 20px; padding: 10px; background: #eee; text-align: center; border-bottom: 1px solid #ddd; }
    .btn { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; display: inline-flex; align-items: center; gap: 5px; }
    .btn:hover { background: #0056b3; }
    @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; } @page { margin: 1cm; size: A4; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn" onclick="window.print()">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      บันทึกเป็น PDF (Save as PDF)
    </button>
    <p style="margin-top:5px; font-size:12px; color:#666;">(หากหน้าต่างพิมพ์ไม่ขึ้นอัตโนมัติ ให้กดปุ่มด้านบน)</p>
  </div>
  <h1>${title}</h1>
  ${contentHtml}
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
};

/**
 * Create and download a Word-compatible .doc file from HTML content.
 */
export const createWordDoc = (title, contentHtml) => {
  const fullHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${title}</title>
<style>
  body { font-family: 'TH Sarabun New', sans-serif; font-size: 16pt; line-height: 1; margin: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 16pt; }
  th, td { border: 1px solid black; padding: 3px 5px; vertical-align: top; }
  th { background-color: #f2f2f2; }
  p { margin: 0; padding: 0; line-height: 1; }
  ul, ol { margin: 0; padding-left: 20pt; }
  li { margin: 0; line-height: 1; }
</style>
</head>
<body>${contentHtml}</body>
</html>`;

  const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[/\s]/g, '_')}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
