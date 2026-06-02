import React from 'react';
import { XCircle, X } from 'lucide-react';

const ErrorPopup = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="pnp-shell-card rounded-xl w-full max-w-sm p-6 text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>

        <div className="flex justify-center mb-4">
          <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
        </div>

        <h3 className="text-xl font-bold text-slate-900 mb-2">แจ้งเตือน</h3>
        <p className="text-slate-600 mb-6 whitespace-pre-line text-sm">{message}</p>

        <button
          onClick={onClose}
          className="w-full bg-red-600 text-white py-2.5 rounded-lg font-semibold hover:bg-red-700 transition-colors shadow-sm"
        >
          รับทราบ
        </button>
      </div>
    </div>
  );
};

export default ErrorPopup;
