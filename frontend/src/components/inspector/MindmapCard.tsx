'use client';

import { useEffect, useRef, useState } from 'react';
import { Network } from 'lucide-react';
import { CardShell } from './CardShell';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';

interface MindmapCardProps {
  path: string;
  content: string;
  onOpenInEditor?: () => void;
}

export function MindmapCard({ path, content, onOpenInEditor }: MindmapCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const [{ Transformer }, { Markmap }] = await Promise.all([
          import('markmap-lib'),
          import('markmap-view'),
        ]);
        if (cancelled || !svgRef.current) return;
        // Strip YAML frontmatter before parsing
        const body = content.replace(/^---[\s\S]*?---\s*/m, '');
        const transformer = new Transformer();
        const { root } = transformer.transform(body || '# (空)');
        // Clear previous
        svgRef.current.replaceChildren();
        const mm = Markmap.create(svgRef.current, { duration: 0 }, root);
        mm.fit();
        setRendered(true);
      } catch (e) {
        setError((e as Error).message || '渲染失败');
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [content]);

  return (
    <CardShell
      icon={<Network className="w-4 h-4" />}
      label="思维导图"
      path={path}
      content={content}
      onOpenInEditor={onOpenInEditor}
    >
      {error ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            思维导图渲染失败：{error}
          </div>
          <MarkdownRenderer content={content} />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background p-2">
          <svg ref={svgRef} className="w-full" style={{ height: 'min(70vh, 600px)' }} />
          {!rendered && (
            <div className="text-xs text-muted-foreground py-8 text-center">渲染中…</div>
          )}
        </div>
      )}
    </CardShell>
  );
}
