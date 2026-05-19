'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">页面发生错误</h1>
            <p className="text-xs text-muted-foreground">Mini-OpenClaw 已捕获该异常</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-2 whitespace-pre-wrap break-words">
          {error.message || '未知错误'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/70 font-mono mb-6">digest: {error.digest}</p>
        )}
        <Button onClick={() => unstable_retry()} className="w-full">
          <RotateCcw className="w-4 h-4 mr-1.5" />
          重试
        </Button>
      </div>
    </div>
  );
}
