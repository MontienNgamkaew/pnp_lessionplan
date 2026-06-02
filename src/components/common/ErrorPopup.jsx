import React from 'react';
import { XCircle, X } from 'lucide-react';

const ErrorPopup = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>

        <div className="flex justify-center mb-4">
          <div className="bg-red-100 p-4 rounded-full">
            <XCircle className="w-12 h-12 text-red-600" />
          </div>
        </div>

        <h3 className="text-xl font-bold text-gray-900 mb-2">แจ้งเตือน</h3>
        <p className="text-gray-600 mb-6 whitespace-pre-line text-sm">{message}</p>

        <button
          onClick={onClose}
          className="w-full bg-red-600 text-white py-2.5 rounded-xl font-semibold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
        >
          รับทราบ
        </button>
      </div>
    </div>
  );
};

export default ErrorPopup;
