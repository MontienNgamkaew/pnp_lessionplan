import React from 'react';
import { CheckCircle, FileStack, FileDown } from 'lucide-react';

const DownloadModule = ({
  formData,
  exportSummaryWord,
  exportSummaryPdf,
}) => {
  return (
    <div className="pnp-shell-card rounded-xl p-5 md:p-6 min-h-[80vh]">
      <div className="max-w-2xl mx-auto text-center py-8">
        <div className="bg-green-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="text-green-600 w-10 h-10" />
        </div>
        <h2 className="text-green-800 font-bold text-2xl mb-3">ดำเนินการครบทุกขั้นตอนแล้ว</h2>
        <p className="text-gray-600 mb-8">ท่านได้ทำการวิเคราะห์และจัดทำข้อมูลหลักสูตรครบถ้วนสมบูรณ์แล้ว</p>

        {/* Download buttons */}
        <div className="flex flex-col md:flex-row justify-center gap-4 mb-8">
          <button onClick={exportSummaryWord} className="bg-blue-700 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-800 shadow-lg flex items-center justify-center gap-2 text-lg">
            <FileStack size={22} /> ดาวน์โหลดแผนรายหน่วย (Word)
          </button>
          <button onClick={exportSummaryPdf} className="bg-red-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-red-700 shadow-lg flex items-center justify-center gap-2 text-lg">
            <FileDown size={22} /> ดาวน์โหลดแผนรายหน่วย (PDF)
          </button>
        </div>

      </div>
    </div>
  );
};

export default DownloadModule;
