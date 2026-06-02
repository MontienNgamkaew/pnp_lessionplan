import React, { useState } from 'react';
import { X, ExternalLink } from 'lucide-react';

const SITE_URL = 'https://ai-find-standard.onrender.com';

const StandardSearchPopup = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col relative overflow-hidden">
        {/* Header */}
        <div className="bg-blue-700 px-4 py-2.5 flex items-center justify-between text-white flex-shrink-0">
          <span className="font-bold text-sm">ค้นหามาตรฐานอาชีพ</span>
          <div className="flex items-center gap-2">
            <a
              href={SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 hover:text-white transition p-1 hover:bg-white/10 rounded-full"
              title="เปิดในแท็บใหม่"
            >
              <ExternalLink size={16} />
            </a>
            <button onClick={onClose} className="text-white/80 hover:text-white transition p-1 hover:bg-white/10 rounded-full">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Iframe */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-400 text-sm gap-2">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              กำลังโหลด...
            </div>
          )}
          <iframe
            src={SITE_URL}
            className="w-full h-full border-0"
            onLoad={() => setLoading(false)}
            title="ค้นหามาตรฐานอาชีพ"
          />
        </div>
      </div>
    </div>
  );
};

export default StandardSearchPopup;
