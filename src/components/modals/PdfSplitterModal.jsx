import React, { useState, useEffect } from 'react';
import { X, Scissors, Upload, FileText, Loader2, Download } from 'lucide-react';

const PdfSplitterModal = ({ isOpen, onClose }) => {
  const [file, setFile] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pageRange, setPageRange] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [libLoaded, setLibLoaded] = useState(false);

  useEffect(() => {
    if (isOpen && !window.PDFLib) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      script.onload = () => setLibLoaded(true);
      document.body.appendChild(script);
    } else if (isOpen && window.PDFLib) {
      setLibLoaded(true);
    }
  }, [isOpen]);

  const handleFileChange = async (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile && uploadedFile.type === 'application/pdf') {
      setFile(uploadedFile);
      if (libLoaded) {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const pdfDoc = await window.PDFLib.PDFDocument.load(arrayBuffer);
        setTotalPages(pdfDoc.getPageCount());
      }
    } else {
      alert('กรุณาเลือกไฟล์ PDF เท่านั้น');
    }
  };

  const parsePageRanges = (rangeStr, total) => {
    const pages = new Set();
    rangeStr.split(',').map((p) => p.trim()).forEach((part) => {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= total) pages.add(i - 1);
          }
        }
      } else {
        const page = parseInt(part);
        if (!isNaN(page) && page >= 1 && page <= total) pages.add(page - 1);
      }
    });
    return Array.from(pages).sort((a, b) => a - b);
  };

  const handleSplit = async () => {
    if (!file || !pageRange || !libLoaded) return;
    setIsProcessing(true);
    try {
      const { PDFDocument } = window.PDFLib;
      const arrayBuffer = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(arrayBuffer);
      const newDoc = await PDFDocument.create();
      const pageIndices = parsePageRanges(pageRange, totalPages);

      if (pageIndices.length === 0) {
        alert('ระบุเลขหน้าไม่ถูกต้อง');
        setIsProcessing(false);
        return;
      }

      const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
      copiedPages.forEach((page) => newDoc.addPage(page));
      const pdfBytes = await newDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Split_${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onClose();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการตัดไฟล์');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={24} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="bg-pink-100 p-3 rounded-full">
            <Scissors className="w-6 h-6 text-pink-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">เครื่องมือตัดไฟล์ PDF</h3>
            <p className="text-xs text-gray-500">เลือกเฉพาะหน้าที่ต้องการใช้งาน</p>
          </div>
        </div>

        {!libLoaded ? (
          <div className="text-center py-8 text-gray-500">
            <Loader2 className="animate-spin w-8 h-8 mx-auto mb-2" />
            กำลังโหลดเครื่องมือ...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center bg-gray-50">
              <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" id="pdf-split-upload" />
              <label htmlFor="pdf-split-upload" className="cursor-pointer block">
                {file ? (
                  <div className="text-green-600 font-medium flex items-center justify-center gap-2">
                    <FileText size={20} /> {file.name}
                  </div>
                ) : (
                  <div className="text-gray-500">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <span className="text-sm">คลิกเพื่อเลือกไฟล์ PDF</span>
                  </div>
                )}
              </label>
            </div>

            {file && (
              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 flex justify-between">
                <span>จำนวนหน้าทั้งหมด:</span>
                <span className="font-bold">{totalPages} หน้า</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ระบุหน้าที่ต้องการตัด</label>
              <input
                type="text"
                placeholder="เช่น 1, 3-5, 8"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
              />
              <p className="text-xs text-gray-500 mt-1">ใช้เครื่องหมายจุลภาค (,) คั่น หรือใช้ขีด (-) สำหรับช่วง</p>
            </div>

            <button
              onClick={handleSplit}
              disabled={isProcessing || !file || !pageRange}
              className="w-full bg-pink-600 text-white py-2.5 rounded-xl font-semibold hover:bg-pink-700 transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : <Download size={20} />}
              ตัดไฟล์และดาวน์โหลด
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfSplitterModal;
