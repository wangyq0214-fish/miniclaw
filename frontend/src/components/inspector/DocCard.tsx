'use client';

import type { ReactNode } from 'react';
import { CardShell } from './CardShell';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';

interface DocCardProps {
  icon: ReactNode;
  label: string;
  path: string;
  content: string;
  onOpenInEditor?: () => void;
  accent?: 'primary' | 'muted';
}

export function DocCard({ icon, label, path, content, onOpenInEditor, accent }: DocCardProps) {
  return (
    <CardShell
      icon={icon}
      label={label}
      path={path}
      content={content}
      onOpenInEditor={onOpenInEditor}
      accent={accent}
    >
      <MarkdownRenderer content={content} />
    </CardShell>
  );
}
