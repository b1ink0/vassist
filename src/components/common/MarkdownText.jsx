/**
 * @fileoverview Lightweight markdown renderer compatible with streaming text and glassmorphism.
 * Supports: **bold**, *italic*, `code`, ```code blocks```, lists, links, headers
 */

import { useMemo, useState } from 'react';

/**
 * Code block component with copy button
 */
const CodeBlock = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="relative group my-2">
      <div className="absolute right-2 top-2 z-10">
        <button
          onClick={handleCopy}
          className="glass-button px-2 py-1 rounded text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          title="Copy code"
        >
          {copied ? (
            <span className="text-green-400">✓ Copied</span>
          ) : (
            <span className="text-white/90">Copy</span>
          )}
        </button>
      </div>
      <pre className="bg-white/5 backdrop-blur-sm rounded-lg p-3 overflow-x-auto max-w-full border border-white/10" data-lang={language || 'text'}>
        <code className="text-sm font-mono text-white/90 whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
};

/**
 * Parse markdown text into React elements
 * Works with partial text during streaming
 * 
 * @param {string} text - Markdown text to parse
 * @returns {Array} Array of React elements
 */
const parseMarkdown = (text) => {
  if (!text) return [];
  
  const elements = [];
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBlockContent = [];
  let codeBlockLang = '';
  let elementKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Code block handling
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        // Starting code block
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockContent = [];
      } else {
        // Ending code block
        inCodeBlock = false;
        const code = codeBlockContent.join('\n');
        elements.push(
          <CodeBlock 
            key={elementKey++} 
            code={code} 
            language={codeBlockLang}
          />
        );
        codeBlockContent = [];
        codeBlockLang = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<br key={elementKey++} />);
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={elementKey++} className="text-lg font-semibold mt-3 mb-2 text-white/95">
          {parseInline(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={elementKey++} className="text-xl font-bold mt-4 mb-2 text-white">
          {parseInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={elementKey++} className="text-2xl font-bold mt-4 mb-3 text-white">
          {parseInline(line.slice(2))}
        </h1>
      );
      continue;
    }

    // Unordered lists
    if (line.match(/^[\s]*[-*+]\s/)) {
      const content = line.replace(/^[\s]*[-*+]\s/, '');
      elements.push(
        <div key={elementKey++} className="flex gap-2 my-1">
          <span className="text-white/70">•</span>
          <div className="flex-1">{parseInline(content)}</div>
        </div>
      );
      continue;
    }

    // Ordered lists
    if (line.match(/^[\s]*\d+\.\s/)) {
      const match = line.match(/^[\s]*(\d+)\.\s/);
      const number = match[1];
      const content = line.replace(/^[\s]*\d+\.\s/, '');
      elements.push(
        <div key={elementKey++} className="flex gap-2 my-1">
          <span className="text-white/70">{number}.</span>
          <div className="flex-1">{parseInline(content)}</div>
        </div>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={elementKey++} className="my-1.5 break-words overflow-wrap-anywhere">
        {parseInline(line)}
      </p>
    );
  }

  // Handle unclosed code block (streaming in progress)
  if (inCodeBlock && codeBlockContent.length > 0) {
    const code = codeBlockContent.join('\n');
    elements.push(
      <CodeBlock 
        key={elementKey++} 
        code={code} 
        language={codeBlockLang}
      />
    );
  }

  return elements;
};

/**
 * Parse inline markdown (bold, italic, code, links)
 * @param {string} text - Text to parse
 * @returns {Array} Array of React elements and strings
 */
const parseInline = (text) => {
  if (!text) return '';
  
  const elements = [];
  let remaining = text;
  let key = 0;

  // Regex patterns for inline elements
  const patterns = [
    // Bold with ** or __
    { regex: /\*\*(.+?)\*\*/, component: (match) => <strong key={key++} className="font-bold text-white/95">{match}</strong> },
    { regex: /__(.+?)__/, component: (match) => <strong key={key++} className="font-bold text-white/95">{match}</strong> },
    // Italic with * or _
    { regex: /\*(.+?)\*/, component: (match) => <em key={key++} className="italic text-white/90">{match}</em> },
    { regex: /_(.+?)_/, component: (match) => <em key={key++} className="italic text-white/90">{match}</em> },
    // Inline code with `
    { regex: /`(.+?)`/, component: (match) => <code key={key++} className="bg-white/5 backdrop-blur-sm px-1.5 py-0.5 mx-0.5 rounded text-sm font-mono text-white/90 border border-white/10 break-all inline-block">{match}</code> },
    // Links [text](url)
    { regex: /\[(.+?)\]\((.+?)\)/, component: (text, url) => <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline break-all">{text}</a> },
  ];

  while (remaining.length > 0) {
    let foundMatch = false;
    let earliestMatch = null;
    let earliestIndex = remaining.length;
    let matchedPattern = null;

    // Find the earliest match
    for (const pattern of patterns) {
      const match = remaining.match(pattern.regex);
      if (match && match.index < earliestIndex) {
        earliestMatch = match;
        earliestIndex = match.index;
        matchedPattern = pattern;
      }
    }

    if (earliestMatch) {
      // Add text before match
      if (earliestIndex > 0) {
        const textBefore = remaining.slice(0, earliestIndex);
        elements.push(<span key={`text-${key++}`}>{textBefore}</span>);
      }

      // Add matched element
      if (matchedPattern.regex.source.includes('\\[')) {
        // Link pattern - has 2 capture groups
        elements.push(matchedPattern.component(earliestMatch[1], earliestMatch[2]));
      } else {
        // Other patterns - 1 capture group
        elements.push(matchedPattern.component(earliestMatch[1]));
      }

      // Continue with remaining text
      remaining = remaining.slice(earliestIndex + earliestMatch[0].length);
      foundMatch = true;
    }

    if (!foundMatch) {
      // No more matches, add remaining text
      elements.push(<span key={`text-${key++}`}>{remaining}</span>);
      break;
    }
  }

  return elements.length > 0 ? <>{elements}</> : text;
};

/**
 * Markdown text component
 * Renders markdown with glassmorphism-compatible styling
 * 
 * @component
 * @param {Object} props - Component props
 * @param {string} props.text - Markdown text to render
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Rendered markdown
 */
const MarkdownText = ({ text = '', className = '' }) => {
  const elements = useMemo(() => parseMarkdown(text), [text]);

  return (
    <div className={`markdown-content max-w-full overflow-hidden ${className}`}>
      {elements}
    </div>
  );
};

export default MarkdownText;
