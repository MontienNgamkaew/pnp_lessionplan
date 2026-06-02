import React from 'react';
import ReactMarkdown from 'react-markdown';

const ChatBubble = ({ message, sender }) => (
  <div className={`flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-3`}>
    <div
      className={`max-w-[85%] p-3 rounded-xl text-sm ${
        sender === 'user'
          ? 'bg-blue-600 text-white rounded-tr-none'
          : 'bg-gray-100 text-gray-800 rounded-tl-none shadow-sm'
      }`}
    >
      <ReactMarkdown
        components={{
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            />
          ),
        }}
      >
        {typeof message === 'string' ? message : ''}
      </ReactMarkdown>
    </div>
  </div>
);

export default ChatBubble;
