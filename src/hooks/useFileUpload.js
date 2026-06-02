import { useState } from 'react';

/**
 * Shared hook for handling file uploads (image, PDF, Word .docx).
 *
 * Returns { file, handleUpload, reset } where `file` has the shape:
 *   { type: 'image'|'pdf'|'word', name: string, data?: string, extractedText?: string }
 */
export const useFileUpload = ({ onError } = {}) => {
  const [file, setFile] = useState(null);

  const handleUpload = async (e) => {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;

    const isImage = uploaded.type.startsWith('image/');
    const isPdf = uploaded.type === 'application/pdf';
    const isDocx = uploaded.name.endsWith('.docx') || uploaded.name.endsWith('.doc');

    if (!isImage && !isPdf && !isDocx) {
      onError?.('กรุณาอัปโหลดไฟล์ รูปภาพ, PDF หรือ Word (.docx) เท่านั้น');
      return;
    }

    // Word: extract raw text via mammoth
    if (isDocx) {
      try {
        const arrayBuffer = await uploaded.arrayBuffer();
        if (window.mammoth) {
          const result = await window.mammoth.extractRawText({ arrayBuffer });
          setFile({ type: 'word', name: uploaded.name, extractedText: result.value });
        } else {
          onError?.('เครื่องมืออ่านไฟล์ Word ยังไม่พร้อม กำลังโหลด...');
        }
      } catch {
        onError?.('เกิดข้อผิดพลาดในการอ่านไฟล์ Word');
      }
      return;
    }

    // Image / PDF: read as base64 data URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setFile({
        type: isImage ? 'image' : 'pdf',
        name: uploaded.name,
        data: reader.result,
      });
    };
    reader.readAsDataURL(uploaded);
  };

  const reset = () => setFile(null);

  return { file, setFile, handleUpload, reset };
};

/**
 * Build Gemini-compatible "parts" array from a file object.
 */
export const buildFileParts = (file, label) => {
  if (!file) return [];
  if (file.type === 'word') {
    return [{ text: `\n\n--- Content: ${label} ---\n${file.extractedText}` }];
  }
  const base64Data = file.data.split(',')[1];
  const mimeType = file.type === 'pdf' ? 'application/pdf' : 'image/jpeg';
  return [{ inlineData: { mimeType, data: base64Data } }];
};
