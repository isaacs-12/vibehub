'use client';

import React, { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  cs: 'csharp',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  css: 'css',
  scss: 'scss',
  html: 'html',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  md: 'markdown',
  mdx: 'mdx',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  proto: 'proto',
  lua: 'lua',
  php: 'php',
  r: 'r',
  dart: 'dart',
  vue: 'vue',
  svelte: 'svelte',
};

function getLang(filePath: string): string {
  const name = filePath.split('/').pop() ?? '';
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
  if (name.toLowerCase() === 'makefile') return 'makefile';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_LANG[ext] ?? 'text';
}

interface Props {
  code: string;
  filePath: string;
}

export default function CodeBlock({ code, filePath }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const lang = getLang(filePath);

  useEffect(() => {
    let cancelled = false;
    codeToHtml(code, {
      lang,
      theme: 'github-dark-default',
    }).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => { cancelled = true; };
  }, [code, lang]);

  const lines = code.split('\n');

  // Fallback while shiki loads
  if (!html) {
    return (
      <div className="overflow-x-auto overflow-y-auto max-h-96 bg-canvas-inset">
        <table className="w-full text-xs font-mono border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="leading-relaxed">
                <td className="text-right select-none text-fg-subtle pr-4 pl-4 py-0 w-[1%] whitespace-nowrap align-top border-r border-border-muted">
                  {i + 1}
                </td>
                <td className="pl-4 pr-4 py-0 text-fg-muted whitespace-pre">{line || '\n'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Parse shiki output to extract per-line HTML
  // Shiki wraps each line in a <span class="line">...</span>
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const lineSpans = doc.querySelectorAll('.line');
  const lineHtmls: string[] = [];
  lineSpans.forEach((span) => lineHtmls.push(span.innerHTML));

  // If parsing failed, fall back to plain lines
  if (lineHtmls.length === 0) {
    return (
      <div className="overflow-x-auto overflow-y-auto max-h-96 bg-canvas-inset">
        <table className="w-full text-xs font-mono border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="leading-relaxed">
                <td className="text-right select-none text-fg-subtle pr-4 pl-4 py-0 w-[1%] whitespace-nowrap align-top border-r border-border-muted">
                  {i + 1}
                </td>
                <td className="pl-4 pr-4 py-0 text-fg-muted whitespace-pre">{line || '\n'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-96 bg-canvas-inset">
      <table className="w-full text-xs font-mono border-collapse">
        <tbody>
          {lineHtmls.map((lineHtml, i) => (
            <tr key={i} className="leading-relaxed group hover:bg-[#161b22]">
              <td className="text-right select-none text-fg-subtle pr-4 pl-4 py-0 w-[1%] whitespace-nowrap align-top border-r border-border-muted">
                {i + 1}
              </td>
              <td
                className="pl-4 pr-4 py-0 whitespace-pre"
                dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
