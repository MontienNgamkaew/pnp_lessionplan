import React from 'react';
import { FileText, FileDown, RefreshCw } from 'lucide-react';

/**
 * Reusable export button row (Regenerate / Word / PDF).
 */
const ExportButtons = ({ onRegenerate, onExportWord, onExportPdf, regenerateLabel = 'สร้างใหม่' }) => (
  <div className="flex gap-2">
    {onRegenerate && (
      <button
        onClick={onRegenerate}
        className="flex items-center gap-1 bg-white border border-green-300 text-green-700 px-2 py-1.5 rounded-lg hover:bg-green-50 transition text-xs font-medium"
      >
        <RefreshCw size={14} /> {regenerateLabel}
      </button>
    )}
    {onExportWord && (
      <button
        onClick={onExportWord}
        className="flex items-center gap-1 bg-blue-600 text-white px-2 py-1.5 rounded-lg hover:bg-blue-700 transition text-xs font-medium shadow-sm"
      >
        <FileText size={14} /> Word
      </button>
    )}
    {onExportPdf && (
      <button
        onClick={onExportPdf}
        className="flex items-center gap-1 bg-red-600 text-white px-2 py-1.5 rounded-lg hover:bg-red-700 transition text-xs font-medium shadow-sm"
      >
        <FileDown size={14} /> PDF
      </button>
    )}
  </div>
);

export default ExportButtons;
