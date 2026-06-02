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
  borderColor = 'border-blue-300',
  bgColor = 'bg-blue-50',
  hoverBg = 'hover:bg-blue-100',
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
            <div className="bg-white p-3 rounded-full shadow-sm mb-2 mx-auto w-fit">
              {iconForType(file.type)}
            </div>
          )}
          <p className="text-sm font-bold text-gray-700 break-all px-2">{file.name}</p>
          <p className="text-xs text-green-600 mt-1">พร้อมใช้งาน</p>
        </div>
      ) : (
        <div className="text-center">
          <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-600">{label}</p>
        </div>
      )}
    </div>
  );
};

export default FileUploadZone;
