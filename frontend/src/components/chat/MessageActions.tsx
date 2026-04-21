'use client';

import { useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';

interface MessageActionsProps {
  content: string;
  onRegenerate?: () => void;
}

export function MessageActions({ content, onRegenerate }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };

  return (
    <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
        aria-label="复制消息"
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
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
          aria-label="重新生成"
        >
          <RotateCcw className="w-3 h-3" /> 重新生成
        </button>
      )}
    </div>
  );
}
