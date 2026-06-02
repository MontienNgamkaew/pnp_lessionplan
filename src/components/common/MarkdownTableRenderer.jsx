import React from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * Clean + merge multiple tables from AI response into a single table.
 * Removes duplicate headers, separators, and non-table text.
 */
const cleanAndMerge = (md) => {
  const clean = md.replace(/```markdown/g, '').replace(/```/g, '').trim();
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

  let headerLine = null;
  let sepLine = null;
  const dataRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Separator line
    if (line.startsWith('|') && /^[\s|:-]+$/.test(line.replace(/---+/g, ''))) {
      if (!sepLine) {
        sepLine = line;
        if (i > 0 && lines[i - 1].startsWith('|')) headerLine = lines[i - 1];
      }
      continue;
    }
    // Data row
    if (line.startsWith('|') && sepLine) {
      if (headerLine && line === headerLine) continue; // skip duplicate header
      dataRows.push(line);
    }
  }

  if (!headerLine || !sepLine) return clean;
  return [headerLine, sepLine, ...dataRows].join('\n');
};

const MarkdownTableRenderer = ({ content }) => {
  if (!content) return null;

  const merged = cleanAndMerge(content);
  const lines = merged.split('\n').map((l) => l.trim()).filter(Boolean);
  const sepIdx = lines.findIndex((l) => l.startsWith('|') && l.includes('---'));

  if (sepIdx === -1 || sepIdx === 0) {
    return (
      <div className="p-4 bg-gray-50 text-gray-700 whitespace-pre-wrap font-mono text-sm">
        {merged}
      </div>
    );
  }

  const headers = lines[sepIdx - 1]
    .split('|')
    .filter((c) => c.trim() !== '')
    .map((c) => c.trim());

  const rows = lines
    .slice(sepIdx + 1)
    .filter((l) => l.startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .filter((_, i, arr) => i !== 0 && i !== arr.length - 1)
        .map((c) => (c ? c.trim() : ''))
    );

  return (
    <div className="w-full border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <table className="w-full table-fixed divide-y divide-gray-300">
        <thead className="bg-gray-100">
          <tr>
            {headers.map((header, idx) => (
              <th
                key={idx}
                className="px-3 py-3 text-left text-sm font-bold text-gray-900 border-r border-gray-200 last:border-r-0 break-words"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className="px-3 py-3 text-sm text-gray-700 border-r border-gray-200 last:border-r-0 align-top break-words"
                >
                  {cell.split(/<br\s*\/?>/i).map((line, i) => (
                    <div key={i} className="mb-1 last:mb-0">
                      <ReactMarkdown>{line}</ReactMarkdown>
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MarkdownTableRenderer;
