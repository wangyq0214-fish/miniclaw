'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CardShellProps {
  icon: ReactNode;
  label: string;
  path: string;
  content: string;
  onOpenInEditor?: () => void;
  children: ReactNode;
  accent?: 'primary' | 'muted';
}

export function CardShell({
  icon,
  label,
  path,
  content,
  onOpenInEditor,
  children,
  accent = 'primary',
}: CardShellProps) {
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

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop() || 'file.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const accentClass = accent === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground';

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentClass}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{label}</div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">{path}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={handleCopy} aria-label="复制全文">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={handleDownload} aria-label="下载 Markdown">
            <Download className="w-3.5 h-3.5" />
          </Button>
          {onOpenInEditor && (
            <Button variant="ghost" size="icon-xs" onClick={onOpenInEditor} aria-label="在编辑器打开">
              <FileCode2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </div>
  );
}
