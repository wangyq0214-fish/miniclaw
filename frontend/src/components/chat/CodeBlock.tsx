'use client';

import { useEffect, useState, useRef, memo } from 'react';
import { Check, Copy } from 'lucide-react';
import { createHighlighter, type Highlighter } from 'shiki';

// Languages we pre-load. Unknown langs fall back to `text`.
const LANGS = [
  'text',
  'python',
  'javascript',
  'typescript',
  'tsx',
  'jsx',
  'bash',
  'shell',
  'json',
  'yaml',
  'markdown',
  'html',
  'css',
  'sql',
  'go',
  'rust',
  'cpp',
  'c',
  'java',
] as const;

const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEMES.light, THEMES.dark],
      langs: LANGS as unknown as string[],
    });
  }
  return highlighterPromise;
}

function useIsDark() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlockImpl({ code, language }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isDark = useIsDark();
  const lang = (language || 'text').toLowerCase();
  const resolvedLang = (LANGS as readonly string[]).includes(lang) ? lang : 'text';
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    getHighlighter()
      .then((hl) => {
        if (!mountedRef.current) return;
        try {
          const rendered = hl.codeToHtml(code, {
            lang: resolvedLang,
            theme: isDark ? THEMES.dark : THEMES.light,
          });
          setHtml(rendered);
        } catch {
          setHtml(null);
        }
      })
      .catch(() => setHtml(null));
    return () => {
      mountedRef.current = false;
    };
  }, [code, resolvedLang, isDark]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };

  return (
    <div className="group relative my-3 rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/50">
        <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          {resolvedLang}
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded"
          aria-label="复制代码"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" /> 已复制
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> 复制
            </>
          )}
        </button>
      </div>
      {html ? (
        <div
          className="shiki-code text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:m-0 [&_pre]:p-3 [&_pre]:overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="text-[13px] leading-relaxed m-0 p-3 overflow-x-auto font-mono text-foreground">
          {code}
        </pre>
      )}
    </div>
  );
}

export const CodeBlock = memo(CodeBlockImpl);
