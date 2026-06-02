import React from 'react';
import { FileText, FileDown, RefreshCw } from 'lucide-react';

/**
 * Reusable export button row (Regenerate / Word / PDF).
 */
const ExportButtons = ({ onRegenerate, onExportWord, onExportPdf, regenerateLabel = 'สร้างใหม่' }) => (
  <div className="flex gap-2 flex-wrap">
    {onRegenerate && (
      <button
        onClick={onRegenerate}
        className="flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition text-xs font-semibold"
      >
        <RefreshCw size={14} /> {regenerateLabel}
      </button>
    )}
    {onExportWord && (
      <button
        onClick={onExportWord}
        className="flex items-center gap-1.5 pnp-btn-primary px-3 py-1.5 rounded-lg transition text-xs font-semibold"
      >
        <FileText size={14} /> Word
      </button>
    )}
    {onExportPdf && (
      <button
        onClick={onExportPdf}
        className="flex items-center gap-1.5 border border-red-200 bg-red-50 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100 transition text-xs font-semibold"
      >
        <FileDown size={14} /> PDF
      </button>
    )}
  </div>
);

export default ExportButtons;
