'use client';

import type { ReactNode } from 'react';
import { CardShell } from './CardShell';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { CourseViewer } from '@/components/course/CourseViewer';
import { ChapterResourceTabs } from './ChapterResourceTabs';

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
  // Only match knowledge/source/ directory, not any file with "深度学习" in the name
  const isCourseChapter = path.includes('knowledge/source/');
  const shouldPaginate = enablePagination || isCourseChapter;

  // Extract courseId and chapterId from path
  let courseId: string | undefined;
  let chapterId: string | undefined;

  if (isCourseChapter) {
    const pathParts = path.split('/');
    const courseIndex = pathParts.findIndex(p => p === 'source');
    courseId = (courseIndex !== -1 && pathParts[courseIndex + 1]) || pathParts[pathParts.length - 2] || 'default';

    const filename = pathParts[pathParts.length - 1];
    const chapterMatch = filename.match(/chapter(\d+)/);
    const numMatch = filename.match(/(\d+)/);
    chapterId = chapterMatch ? chapterMatch[1] : numMatch ? numMatch[1] : '1';
  }

  return (
    <CardShell
      icon={icon}
      label={label}
      path={path}
      content={content}
      onOpenInEditor={onOpenInEditor}
      accent={accent}
    >
      {isCourseChapter ? (
        <ChapterResourceTabs
          markdown={content}
          courseId={courseId}
          chapterId={chapterId}
          path={path}
        />
      ) : shouldPaginate ? (
        <CourseViewer
          markdown={content}
          courseId={courseId}
          chapterId={chapterId}
        />
      ) : (
        <MarkdownRenderer content={content} />
      )}
    </CardShell>
  );
}
