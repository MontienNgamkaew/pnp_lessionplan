import React from 'react';
import { Upload, FileText, FileType } from 'lucide-react';

/**
 * Reusable drag-and-drop-style upload zone.
 *
 * Props:
 *  - file        : { type, name, data? } | null
 *  - onUpload    : (e) => void — change handler for the hidden <input>
 *  - accept      : string (default: "image/*,application/pdf,.doc,.docx")
 *  - label       : string shown when no file is selected
 *  - borderColor : tailwind border color class (default: "border-blue-300")
 *  - bgColor     : tailwind bg color class (default: "bg-blue-50")
 *  - className   : extra wrapper classes
 */
const FileUploadZone = ({
  file,
  onUpload,
  accept = 'image/*,application/pdf,.doc,.docx',
  label = 'คลิกเพื่อเลือกไฟล์',
  borderColor = 'border-blue-200',
  bgColor = 'bg-slate-50',
  hoverBg = 'hover:bg-blue-50',
  className = '',
  height = 'h-48',
}) => {
  const iconForType = (type) => {
    if (type === 'pdf') return <FileText className="w-10 h-10 text-red-600" />;
    if (type === 'word') return <FileType className="w-10 h-10 text-blue-600" />;
    return <FileText className="w-10 h-10 text-green-600" />;
  };

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 border-2 border-dashed ${borderColor} rounded-xl ${bgColor} ${hoverBg} transition-colors cursor-pointer relative ${height} ${className}`}
    >
      <input
        type="file"
        accept={accept}
        onChange={onUpload}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      {file ? (
        <div className="text-center">
          {file.type === 'image' && file.data ? (
            <img
              src={file.data}
              alt="Preview"
              className="max-h-32 rounded-lg shadow-md mb-2 mx-auto"
            />
          ) : (
            <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm mb-2 mx-auto w-fit">
              {iconForType(file.type)}
            </div>
          )}
          <p className="text-sm font-bold text-slate-800 break-all px-2">{file.name}</p>
          <p className="text-xs text-emerald-600 mt-1 font-semibold">พร้อมใช้งาน</p>
        </div>
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-2 h-11 w-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Upload className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-sm font-semibold text-slate-700">{label}</p>
          <p className="text-xs text-slate-400 mt-1">รองรับรูปภาพ PDF และ Word</p>
        </div>
      )}
    </div>
  );
};

export default FileUploadZone;
