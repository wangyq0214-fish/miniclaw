'use client';

import { useEffect, useRef, useState, memo } from 'react';

interface MermaidBlockProps {
  code: string;
}

let mermaidLoadedPromise: Promise<typeof import('mermaid').default> | null = null;

function getMermaid() {
  if (!mermaidLoadedPromise) {
    mermaidLoadedPromise = import('mermaid').then((mod) => {
      const m = mod.default;
      m.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
      return m;
    });
  }
  return mermaidLoadedPromise;
}

let idCounter = 0;

function MermaidBlockImpl({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    idCounter += 1;
    const id = `mermaid-${idCounter}`;
    const container = containerRef.current;
    if (!container) return;
    const isDark = document.documentElement.classList.contains('dark');

    getMermaid()
      .then((mermaid) => {
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
        });
        return mermaid.render(id, code);
      })
      .then((result) => {
        if (cancelled || !container || !result) return;
        container.innerHTML = result.svg;
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message || '渲染失败');
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="my-3 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border bg-muted/50 text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
        mermaid
      </div>
      {error ? (
        <div className="p-3 text-xs text-destructive">
          Mermaid 渲染失败：{error}
          <pre className="mt-2 text-[11px] bg-background border border-border p-2 rounded overflow-x-auto">
            {code}
          </pre>
        </div>
      ) : (
        <div ref={containerRef} className="p-3 overflow-x-auto [&_svg]:max-w-full" />
      )}
    </div>
  );
}

export const MermaidBlock = memo(MermaidBlockImpl);
