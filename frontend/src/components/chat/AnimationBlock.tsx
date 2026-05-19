import { useRef, useEffect, useState } from 'react';

interface AnimationBlockProps {
  code: string;
}

export function AnimationBlock({ code }: AnimationBlockProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    try {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) throw new Error('无法访问 iframe 文档');

      doc.open();
      doc.write(code);
      doc.close();
      setError(null);
    } catch (e) {
      setError((e as Error).message || '渲染失败');
    }
  }, [code]);

  return (
    <div className="my-3 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border bg-muted/50 text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
        动画演示
      </div>
      {error ? (
        <div className="p-3 text-xs text-destructive">
          动画渲染失败：{error}
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          className="w-full h-[600px] border-0"
          title="Animation"
        />
      )}
    </div>
  );
}
