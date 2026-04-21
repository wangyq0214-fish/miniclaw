'use client';

import {
  BookOpen,
  ClipboardList,
  FileText,
  GraduationCap,
  Library,
  ListChecks,
  Map,
  Target,
  Video,
} from 'lucide-react';
import { DocCard } from './DocCard';
import { StudentProfileCard } from './StudentProfileCard';
import { MindmapCard } from './MindmapCard';

interface ContentCardProps {
  path: string;
  content: string;
  onOpenInEditor?: () => void;
}

function getKind(path: string) {
  const p = path.toLowerCase();
  if (p.endsWith('workspace/user.md') || p === 'workspace/user.md') return 'profile';
  if (p.endsWith('/learning_plan.md') || p === 'workspace/learning_plan.md') return 'plan';
  if (p.startsWith('memory/evaluation/')) return 'evaluation';
  if (p.startsWith('memory/profile_history')) return 'profile-history';
  if (p.includes('/mindmap') || p.includes('/mindmaps/')) return 'mindmap';
  if (p.includes('/lectures/')) return 'lecture';
  if (p.includes('/exercises/')) return 'exercise';
  if (p.includes('/code_cases/') || p.includes('/code-cases/')) return 'code-case';
  if (p.includes('/reading_lists/') || p.includes('/reading-lists/')) return 'reading-list';
  if (p.includes('/media_scripts/') || p.includes('/media-scripts/')) return 'media-script';
  if (p.endsWith('.md')) return 'markdown';
  return 'other';
}

export function ContentCard({ path, content, onOpenInEditor }: ContentCardProps) {
  const kind = getKind(path);

  switch (kind) {
    case 'profile':
      return <StudentProfileCard path={path} content={content} onOpenInEditor={onOpenInEditor} />;
    case 'plan':
      return (
        <DocCard
          icon={<Target className="w-4 h-4" />}
          label="学习计划"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
        />
      );
    case 'evaluation':
      return (
        <DocCard
          icon={<GraduationCap className="w-4 h-4" />}
          label="学情评估报告"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
        />
      );
    case 'profile-history':
      return (
        <DocCard
          icon={<Map className="w-4 h-4" />}
          label="画像演化记录"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
          accent="muted"
        />
      );
    case 'mindmap':
      return <MindmapCard path={path} content={content} onOpenInEditor={onOpenInEditor} />;
    case 'lecture':
      return (
        <DocCard
          icon={<BookOpen className="w-4 h-4" />}
          label="讲义"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
        />
      );
    case 'exercise':
      return (
        <DocCard
          icon={<ListChecks className="w-4 h-4" />}
          label="习题"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
        />
      );
    case 'code-case':
      return (
        <DocCard
          icon={<ClipboardList className="w-4 h-4" />}
          label="代码案例"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
        />
      );
    case 'reading-list':
      return (
        <DocCard
          icon={<Library className="w-4 h-4" />}
          label="阅读清单"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
        />
      );
    case 'media-script':
      return (
        <DocCard
          icon={<Video className="w-4 h-4" />}
          label="视频脚本"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
        />
      );
    case 'markdown':
    default:
      return (
        <DocCard
          icon={<FileText className="w-4 h-4" />}
          label={path.split('/').pop() || '文档'}
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
          accent="muted"
        />
      );
  }
}
