'use client';

import type { ReactNode } from 'react';
import { CardShell } from './CardShell';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { CourseViewer } from '@/components/course/CourseViewer';

interface DocCardProps {
  icon: ReactNode;
  label: string;
  path: string;
  content: string;
  onOpenInEditor?: () => void;
  accent?: 'primary' | 'muted';
  enablePagination?: boolean;
}

export function DocCard({ icon, label, path, content, onOpenInEditor, accent, enablePagination = false }: DocCardProps) {
  // Check if this is a course chapter file (from knowledge/source/深度学习/)
  const isCourseChapter = path.includes('knowledge/source') || path.includes('深度学习');
  const shouldPaginate = enablePagination || isCourseChapter;

  return (
    <CardShell
      icon={icon}
      label={label}
      path={path}
      content={content}
      onOpenInEditor={onOpenInEditor}
      accent={accent}
    >
      {shouldPaginate ? (
        <CourseViewer markdown={content} />
      ) : (
        <MarkdownRenderer content={content} />
      )}
    </CardShell>
  );
}
