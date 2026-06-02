import { useState, useCallback } from 'react';
import { cleanAndParseJSON } from '../utils/jsonParser';

const MODEL = 'gemini-2.5-flash-preview-09-2025';
const STORAGE_KEY = 'ai_apikey';

/**
 * Read/write API key from localStorage.
 */
export const getStoredApiKey = () => localStorage.getItem(STORAGE_KEY) || '';
export const setStoredApiKey = (key) => localStorage.setItem(STORAGE_KEY, key);

/**
 * Build the Gemini endpoint URL with the given API key.
 */
const buildEndpoint = (apiKey) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

/**
 * Reusable hook for calling the Gemini API.
 *
 * @param {string} apiKey - The Gemini API key to use.
 * Returns { callApi, loading, loadingText }
 */
export const useGeminiApi = (apiKey) => {
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  const callApi = useCallback(async (parts, { json = false, statusText = '' } = {}) => {
    if (!apiKey) {
      throw new Error('API Key ยังไม่ได้ตั้งค่า กรุณากดปุ่ม "ตั้งค่า API Key" ก่อน');
    }

    setLoading(true);
    setLoadingText(statusText || 'กำลังประมวลผล...');

    try {
      const body = {
        contents: [{ role: 'user', parts }],
      };
      if (json) {
        body.generationConfig = { responseMimeType: 'application/json' };
      }

      const response = await fetch(buildEndpoint(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (response.status === 400 || response.status === 403) {
          throw new Error('API Key ไม่ถูกต้อง หรือหมดอายุ กรุณาตรวจสอบ API Key');
        }
        throw new Error('API Connection Failed');
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No data returned from AI');

      return json ? cleanAndParseJSON(text) : text;
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  }, [apiKey]);

  return { callApi, loading, loadingText, setLoadingText };
};
