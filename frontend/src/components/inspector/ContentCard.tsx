'use client';

import {
  BookOpen,
  ClipboardList,
  Code2,
  FileText,
  GraduationCap,
  Library,
  ListChecks,
  Map,
  Target,
  Video,
  Layers,
} from 'lucide-react';
import { DocCard } from './DocCard';
import { StudentProfileCard } from './StudentProfileCard';
import { MindmapCard } from './MindmapCard';
import { CodingChallenge } from './CodingChallenge';
import { FlashcardViewer } from '@/components/exercise/FlashcardViewer';
import { ExerciseViewer } from '@/components/exercise/ExerciseViewer';
import { LearningMapView } from '@/components/learning-map/LearningMapView';
import { getUserItem } from '@/lib/userStorage';

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
  if (p.includes('knowledge/source/') || p.includes('深度学习')) return 'course-chapter';
  if (p.includes('/lectures/')) return 'lecture';
  if (p.includes('/exercises/')) return 'exercise';
  if (p.includes('/flashcards/')) return 'flashcard';
  if (p.includes('/code_cases/') || p.includes('/code-cases/')) return 'code-case';
  if (p.includes('/reading_lists/') || p.includes('/reading-lists/')) return 'reading-list';
  if (p.includes('/media_scripts/') || p.includes('/media-scripts/')) return 'media-script';
  if (p.endsWith('.md')) return 'markdown';
  return 'other';
}

/** Reverse-lookup: find the learning map nodeId that owns a given file path */
function findNodeIdForFile(filePath: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const paths: Record<string, string> = JSON.parse(getUserItem('miniclaw_gen_paths') || '{}');
    for (const key of Object.keys(paths)) {
      if (paths[key] === filePath) {
        return key.split(':')[0]; // key format: "{nodeId}:{action}"
      }
    }
  } catch {}
  return undefined;
}

export function ContentCard({ path, content, onOpenInEditor }: ContentCardProps) {
  const kind = getKind(path);

  switch (kind) {
    case 'profile':
      return <StudentProfileCard path={path} content={content} onOpenInEditor={onOpenInEditor} />;
    case 'plan':
      return (
        <LearningMapView
          markdownContent={content}
          path={path}
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
      return (
        <div className="h-full min-h-[400px]">
          <MindmapCard path={path} content={content} onOpenInEditor={onOpenInEditor} />
        </div>
      );
    case 'course-chapter':
      return (
        <DocCard
          icon={<BookOpen className="w-4 h-4" />}
          label="课程章节"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
          enablePagination={true}
        />
      );
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
      try {
        const exerciseData = JSON.parse(content);
        if (exerciseData.questions && Array.isArray(exerciseData.questions)) {
          const nodeId = findNodeIdForFile(path);
          return (
            <div className="h-full min-h-[400px]">
              <ExerciseViewer content={content} nodeId={nodeId} filePath={path} />
            </div>
          );
        }
      } catch {
        // Not valid JSON, show as markdown doc
      }
      return (
        <DocCard
          icon={<ListChecks className="w-4 h-4" />}
          label="习题"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
        />
      );
    case 'flashcard': {
      const nodeId = findNodeIdForFile(path);
      try {
        const flashcardData = JSON.parse(content);
        if (flashcardData.cards && Array.isArray(flashcardData.cards)) {
          return (
            <div className="h-full min-h-[400px]">
              <FlashcardViewer content={content} nodeId={nodeId} filePath={path} />
            </div>
          );
        }
      } catch {
        // Not valid JSON, show as markdown doc
      }
      return (
        <DocCard
          icon={<Layers className="w-4 h-4" />}
          label="抽认卡"
          path={path}
          content={content}
          onOpenInEditor={onOpenInEditor}
        />
      );
    }
    case 'code-case':
      // Parse JSON challenge data from code-cases directory
      try {
        const challengeData = JSON.parse(content);
        if (challengeData.testCases && Array.isArray(challengeData.testCases)) {
          return <CodingChallenge data={challengeData} />;
        }
      } catch {
        // Not valid JSON, show as markdown doc
      }
      return (
        <DocCard
          icon={<Code2 className="w-4 h-4" />}
          label="编程挑战"
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
