'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ListChecks, Layers, Network, Loader2, Play, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { CourseViewer } from '@/components/course/CourseViewer';
import { ExerciseViewer } from '@/components/exercise/ExerciseViewer';
import { FlashcardViewer } from '@/components/exercise/FlashcardViewer';
import { MindmapCard } from '@/components/inspector/MindmapCard';
import { useMarkdownPagination } from '@/hooks/useMarkdownPagination';
import { streamSubagent, readFile } from '@/lib/api';

type TabKey = 'article' | 'exercises' | 'flashcards' | 'mindmap';

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof BookOpen;
  subagent?: string;
  categoryPath?: string;
}

const TABS: TabDef[] = [
  { key: 'article', label: '文章', icon: BookOpen },
  { key: 'exercises', label: '练习题', icon: ListChecks, subagent: 'exercise_composer', categoryPath: 'workspace/generated/exercises' },
  { key: 'flashcards', label: '抽认卡', icon: Layers, subagent: 'flashcard_composer', categoryPath: 'workspace/generated/flashcards' },
  { key: 'mindmap', label: '思维导图', icon: Network, subagent: 'mindmap_designer', categoryPath: 'workspace/generated/mindmaps' },
];

// ── Module-level task registry (survives component unmount) ──
type TaskStatus = 'pending' | 'loading' | 'done' | 'error';
interface GenerationTask {
  status: TaskStatus;
  content: string | null;
  filePath: string | null;
  error: string | null;
  listeners: Set<() => void>;
  abort: () => void;
}

const taskRegistry = new Map<string, GenerationTask>();

function getOrCreateTask(cacheKey: string): GenerationTask {
  let task = taskRegistry.get(cacheKey);
  if (!task) {
    task = { status: 'pending', content: null, filePath: null, error: null, listeners: new Set(), abort: () => {} };
    taskRegistry.set(cacheKey, task);
  }
  return task;
}

function notifyTaskListeners(cacheKey: string) {
  taskRegistry.get(cacheKey)?.listeners.forEach(fn => fn());
}

// ── Component ──

interface ChapterResourceTabsProps {
  markdown: string;
  courseId?: string;
  chapterId?: string;
  path: string;
}

export function ChapterResourceTabs({ markdown, courseId, chapterId, path }: ChapterResourceTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('article');
  const [, forceUpdate] = useState(0);

  const { currentPage, totalPages, currentContent, nextPage, prevPage, isFirstPage, isLastPage } = useMarkdownPagination(markdown);

  const topic = courseId || path.split('/').pop()?.replace(/\.md$/, '') || '未知主题';

  // Subscribe to task updates for current cache key
  const cacheKey = `${path}_${activeTab}_${currentPage}`;
  const task = activeTab !== 'article' ? taskRegistry.get(cacheKey) : undefined;

  useEffect(() => {
    if (activeTab === 'article') return;
    const key = `${path}_${activeTab}_${currentPage}`;
    const t = getOrCreateTask(key);
    const listener = () => forceUpdate(n => n + 1);
    t.listeners.add(listener);
    return () => { t.listeners.delete(listener); };
  }, [activeTab, currentPage]);

  const generateResource = useCallback(async (tab: TabDef, pageIndex: number) => {
    if (!tab.subagent || !tab.categoryPath) return;

    const key = `${path}_${tab.key}_${pageIndex}`;
    const existing = taskRegistry.get(key);
    if (existing && (existing.status === 'done' || existing.status === 'loading')) return;

    // Check sessionStorage cache first
    const cached = sessionStorage.getItem(`resource_${key}`);
    if (cached) {
      const task = getOrCreateTask(key);
      task.status = 'done';
      task.content = cached;
      notifyTaskListeners(key);
      return;
    }

    // Check if we already have a file path stored for this task
    const existingTask = taskRegistry.get(key);
    if (existingTask?.filePath) {
      try {
        const fileRes = await readFile(existingTask.filePath);
        if (fileRes.exists && fileRes.content) {
          existingTask.status = 'done';
          existingTask.content = fileRes.content;
          sessionStorage.setItem(`resource_${key}`, fileRes.content);
          notifyTaskListeners(key);
          return;
        }
      } catch { /* file gone, regenerate */ }
    }

    const task = getOrCreateTask(key);
    task.status = 'loading';
    task.error = null;
    notifyTaskListeners(key);

    const controller = new AbortController();
    task.abort = () => controller.abort();

    const pageContent = currentContent.slice(0, 3000);
    const prompt = `请基于以下课程内容生成${tab.label}。只使用下方提供的内容，不要检索知识库或搜索外部资源。

课程主题：${topic}
当前章节：第 ${pageIndex + 1} 页
课程内容：
${pageContent}

要求：
1. 直接输出合法的 JSON 数组或对象，不要包含任何说明文字或确认信息
2. 将 JSON 写入文件到 ${tab.categoryPath}/ 目录`;

    let fullContent = '';
    let writtenFilePath = '';

    try {
      const gen = streamSubagent(
        { subagent: tab.subagent, message: prompt },
        controller.signal,
      );

      for await (const event of gen) {
        if (event.type === 'token' && event.content) {
          fullContent += event.content;
        }
        if (event.type === 'tool_end' && event.tool === 'write_file') {
          const match = (event.output || '').match(/Updated file\s+(.+)/i);
          if (match) writtenFilePath = match[1].trim();
        }
        if (event.type === 'done' || event.type === 'error') break;
      }

      // Read the written file
      let resultContent = '';
      if (writtenFilePath) {
        const wsIdx = writtenFilePath.indexOf('workspace/');
        const apiPath = wsIdx !== -1 ? writtenFilePath.slice(wsIdx) : writtenFilePath;
        try {
          const fileRes = await readFile(apiPath);
          if (fileRes.exists && fileRes.content) {
            resultContent = fileRes.content;
            task.filePath = apiPath;
          }
        } catch { /* ignore */ }
      }

      // Fallback: extract JSON from streamed content
      if (!resultContent) {
        const jsonStart = fullContent.search(/[\[{]/);
        if (jsonStart !== -1) {
          const opener = fullContent[jsonStart];
          const closer = opener === '[' ? ']' : '}';
          const jsonEnd = fullContent.lastIndexOf(closer);
          if (jsonEnd > jsonStart) {
            resultContent = fullContent.slice(jsonStart, jsonEnd + 1);
          }
        }
        if (!resultContent) resultContent = fullContent;
      }

      task.status = 'done';
      task.content = resultContent;
      sessionStorage.setItem(`resource_${key}`, resultContent);
      notifyTaskListeners(key);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Aborted — remove task so it can be retried
        taskRegistry.delete(key);
      } else {
        task.status = 'error';
        task.error = err.message || '生成失败，请重试';
      }
      notifyTaskListeners(key);
    }
  }, [currentContent, topic]);

  const handleTabChange = useCallback((key: TabKey) => {
    setActiveTab(key);
    if (key === 'article') return;

    const tab = TABS.find(t => t.key === key);
    if (!tab) return;

    const cacheKeyForPage = `${key}_${currentPage}`;
    const existing = taskRegistry.get(cacheKeyForPage);
    if (!existing || existing.status === 'pending') {
      generateResource(tab, currentPage);
    }
  }, [generateResource, currentPage]);

  // When page changes, trigger generation if no task exists for that page
  useEffect(() => {
    if (activeTab === 'article') return;
    const tab = TABS.find(t => t.key === activeTab);
    if (!tab) return;
    const key = `${path}_${activeTab}_${currentPage}`;
    const existing = taskRegistry.get(key);
    if (!existing || existing.status === 'pending') {
      generateResource(tab, currentPage);
    }
  }, [currentPage, activeTab, generateResource]);

  const activeTabDef = TABS.find(t => t.key === activeTab)!;

  const handleRegenerate = useCallback(() => {
    const tab = TABS.find(t => t.key === activeTab);
    if (!tab || activeTab === 'article') return;
    const key = `${path}_${activeTab}_${currentPage}`;
    const existing = taskRegistry.get(key);
    if (existing?.status === 'loading') return; // already generating, skip
    taskRegistry.delete(key);
    sessionStorage.removeItem(`resource_${key}`);
    generateResource(tab, currentPage);
  }, [activeTab, currentPage, path, generateResource]);

  // Derive display state from task
  const isLoading = task?.status === 'loading';
  const error = task?.status === 'error' ? task.error : null;
  const generatedContent = task?.status === 'done' ? task.content : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Segmented Control */}
      <div style={{ flexShrink: 0, padding: '12px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f3f4f6', borderRadius: 12, padding: 4 }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? '#fff' : 'transparent',
                  color: isActive ? '#111' : '#666',
                  boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}

          {courseId && (
            <Link
              href={`/classroom/${encodeURIComponent(courseId)}/${chapterId || '1'}?page=${currentPage}`}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('classroom_content', currentContent);
                  sessionStorage.setItem('classroom_page', String(currentPage));
                  sessionStorage.setItem('classroom_return_path', path);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                color: '#4f46e5',
                marginLeft: 'auto',
                textDecoration: 'none',
              }}
            >
              <Play size={14} />
              <span>互动课堂</span>
            </Link>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'article' ? (
            <motion.div
              key="article"
              className="h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CourseViewer
                markdown={markdown}
                courseId={courseId}
                chapterId={chapterId}
                currentPage={currentPage}
                totalPages={totalPages}
                currentContent={currentContent}
                onNextPage={nextPage}
                onPrevPage={prevPage}
                isFirstPage={isFirstPage}
                isLastPage={isLastPage}
              />
            </motion.div>
          ) : isLoading ? (
            <motion.div
              key="loading"
              className="h-full flex flex-col items-center justify-center gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">正在生成{activeTabDef.label}（第 {currentPage + 1} 页）</p>
                <p className="text-xs text-muted-foreground mt-1">基于当前页面内容，AI 正在撰写中...</p>
              </div>
              <div className="w-48 h-1 bg-gray-200 dark:bg-zinc-800 rounded-full overflow-hidden mt-2">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: '10%' }}
                  animate={{ width: '80%' }}
                  transition={{ duration: 8, ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              className="h-full flex flex-col items-center justify-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={() => {
                  taskRegistry.delete(cacheKey);
                  generateResource(activeTabDef, currentPage);
                }}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                重试
              </button>
            </motion.div>
          ) : generatedContent ? (
            <motion.div
              key={`${path}_${activeTab}_${currentPage}`}
              className="h-full flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 8px' }}>
                <button
                  onClick={handleRegenerate}
                  disabled={task?.status === 'loading'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 6, fontSize: 12,
                    border: '1px solid #e5e7eb',
                    cursor: task?.status === 'loading' ? 'not-allowed' : 'pointer',
                    background: '#fff', color: '#6b7280',
                    opacity: task?.status === 'loading' ? 0.5 : 1,
                  }}
                >
                  <RefreshCw size={12} />
                  {task?.status === 'loading' ? '生成中...' : '重新生成'}
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
              {activeTab === 'exercises' && (
                <ExerciseViewer content={generatedContent} />
              )}
              {activeTab === 'flashcards' && (
                <FlashcardViewer content={generatedContent} />
              )}
              {activeTab === 'mindmap' && (
                <div className="h-full min-h-[500px]">
                  <MindmapCard path={topic} content={generatedContent} />
                </div>
              )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
