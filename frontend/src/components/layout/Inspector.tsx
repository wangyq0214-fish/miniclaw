'use client';

import { useEffect, useState, useRef } from 'react';
import { Target, FolderTree, BookMarked, Loader2, FileText, Video, Network, Code, BarChart3 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/auth';
import { MonacoEditor } from '@/components/editor/MonacoEditor';
import { ContentCard } from '@/components/inspector/ContentCard';
import { CodeRunner } from '@/components/inspector/CodeRunner';
import { ExerciseViewer } from '@/components/exercise/ExerciseViewer';
import { MistakeBook } from '@/components/exercise/MistakeBook';
import { SelectionToolbar } from '@/components/inspector/SelectionToolbar';
import { HtmlAnimationViewer } from '@/components/media/HtmlAnimationViewer';
import { PptxViewer } from '@/components/media/PptxViewer';
import { KnowledgeGraph } from '@/components/graph/KnowledgeGraph';
import { readFile, writeFile } from '@/lib/api';
import { useApp } from '@/lib/store';
import { getUserItem } from '@/lib/userStorage';

/** Reverse-lookup: find the learning map nodeId that owns a given file path */
function findNodeIdForFile(filePath: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const paths: Record<string, string> = JSON.parse(getUserItem('miniclaw_gen_paths') || '{}');
    for (const key of Object.keys(paths)) {
      if (paths[key] === filePath) {
        return key.split(':')[0];
      }
    }
  } catch {}
  return undefined;
}
import type { TabId } from '@/lib/store';

interface InspectorProps {
  activeTab: TabId;
  sessionId: string;
}

const TAB_META: Record<TabId, { icon: typeof Target; label: string }> = {
  'learning-path': { icon: Target, label: '学习计划' },
  resources: { icon: FolderTree, label: '资源浏览' },
  mistakes: { icon: BookMarked, label: '错题本' },
  'knowledge-graph': { icon: Network, label: '知识图谱' },
  notes: { icon: FileText, label: '笔记' },
  dashboard: { icon: BarChart3, label: '学习分析' },
};

function VideoPlayer({ filePath }: { filePath: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!filePath) return;
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    setBlobUrl(null);
    setError(false);

    const token = localStorage.getItem('token');
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const apiBase = getApiBaseUrl();
    // Strip "workspace/" prefix — video API resolves from workspace root
    const videoPath = filePath.replace(/^workspace\//, '');
    const url = `${apiBase}/api/videos/${videoPath.split('/').map(encodeURIComponent).join('/')}`;

    fetch(url, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const objUrl = URL.createObjectURL(blob);
        prevUrlRef.current = objUrl;
        setBlobUrl(objUrl);
      })
      .catch(() => setError(true));

    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, [filePath]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center px-4">
          <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium">视频加载失败</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 overflow-hidden">
      <video
        src={blobUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="max-w-full max-h-[calc(100%-2rem)] rounded-lg object-contain"
      />
      <p className="text-xs text-muted-foreground mt-2 truncate max-w-full">{filePath.split('/').pop()}</p>
    </div>
  );
}

export function Inspector({ activeTab }: InspectorProps) {
  const { state, actions } = useApp();
  const [content, setContent] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const lastFetchedRef = useRef<{ path: string; time: number } | null>(null);

  const loadFileContent = async (path: string) => {
    const now = Date.now();
    if (lastFetchedRef.current?.path === path && now - lastFetchedRef.current.time < 500) return;
    lastFetchedRef.current = { path, time: now };
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await readFile(path);
      setContent(result.content);
      setCurrentFile(path);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to load file:', error);
      const msg = error instanceof Error ? error.message : '加载失败';
      setLoadError(msg);
      setContent('');
      setCurrentFile(path);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // A selected file always takes priority, regardless of which tab is active
    if (state.activeFilePath) {
      if (state.activeFilePath === '__code_playground__') {
        setCurrentFile('__code_playground__');
        setContent('');
        setLoadError(null);
        setIsLoading(false);
        setEditMode(false);
      } else if (isVideoFile(state.activeFilePath)) {
        setCurrentFile(state.activeFilePath);
        setContent('');
        setLoadError(null);
        setIsLoading(false);
      } else if (isPptFile(state.activeFilePath)) {
        setCurrentFile(state.activeFilePath);
        setContent('');
        setLoadError(null);
        setIsLoading(false);
      } else {
        setEditMode(false);
        loadFileContent(state.activeFilePath);
      }
    } else if (activeTab === 'learning-path') {
      setEditMode(false);
      loadFileContent('workspace/learning_plan.md');
    } else {
      setCurrentFile('');
      setLoadError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, state.activeFilePath]);

  const handleSave = async (value: string) => {
    if (currentFile) {
      setIsLoading(true);
      try {
        await writeFile(currentFile, value);
        setHasChanges(false);
      } catch (error) {
        console.error('Failed to save file:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleChange = (value: string) => {
    setContent(value);
    setHasChanges(true);
  };

  const handleSelectFile = (path: string) => {
    actions.setActiveFile(path);
    setEditMode(false);
  };

  // 检测是否是练习题文件
  const isExerciseFile = (path: string) => {
    return path.includes('/exercises/') && (path.endsWith('.md') || path.endsWith('.json'));
  };

  // 检测是否是 HTML 动画文件
  const isHtmlAnimationFile = (path: string) => {
    return path.includes('/media-scripts/') && path.endsWith('.html');
  };

  // 检测是否是视频文件
  const isVideoFile = (path: string) => {
    return /\.(mp4|webm|ogg)$/i.test(path);
  };

  // 检测是否是代码案例目录下的 .py 文件
  const isCodeCasePyFile = (path: string) => {
    return path.endsWith('.py') && (path.includes('/code-cases/') || path.includes('/code_cases/'));
  };

  // 检测是否是 PPT 文件
  const isPptFile = (path: string) => {
    return /\.pptx?$/i.test(path);
  };

  const meta = currentFile === '__code_playground__'
    ? { icon: Code, label: '代码环境' }
    : currentFile
      ? { icon: FileText, label: currentFile.split('/').pop() || '文件' }
      : TAB_META[activeTab];
  const Icon = meta.icon;

  return (
    <div className="h-full flex flex-col border-l border-gray-100 dark:border-border bg-white dark:bg-background overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 dark:border-border bg-white dark:bg-muted/40 shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground truncate">
          {meta.label}
        </span>
        {hasChanges && <span className="w-1.5 h-1.5 bg-primary rounded-full" />}
      </div>

      <div className="flex-1 relative min-h-0 overflow-x-hidden overflow-y-auto" data-inspector-content>
        <SelectionToolbar />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* File content always takes priority over tab placeholders */}
        {currentFile === '__code_playground__' ? (
          <CodeRunner
            code={state.coderCode || "# 在这里编写 Python 代码\n"}
            filename={state.coderFilename || 'playground.py'}
          />
        ) : currentFile ? (
          isVideoFile(currentFile) ? (
            <VideoPlayer filePath={currentFile} />
          ) : loadError ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center px-4">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">无法加载文件</p>
                <p className="text-xs mt-1 text-muted-foreground/70 max-w-xs">{loadError}</p>
              </div>
            </div>
          ) : isExerciseFile(currentFile) && !editMode ? (
            <ExerciseViewer content={content} nodeId={findNodeIdForFile(currentFile)} filePath={currentFile} />
          ) : isHtmlAnimationFile(currentFile) && !editMode ? (
            <HtmlAnimationViewer content={content} />
          ) : isPptFile(currentFile) && !editMode ? (
            <PptxViewer filePath={currentFile} />
          ) : !editMode && (currentFile.endsWith('.md') || currentFile.endsWith('.json')) ? (
            <ContentCard
              path={currentFile}
              content={content}
              onOpenInEditor={() => setEditMode(true)}
            />
          ) : isCodeCasePyFile(currentFile) && !editMode ? (
            <CodeRunner
              code={state.coderCode || content}
              filename={state.coderFilename || currentFile.split('/').pop()}
            />
          ) : (
            <MonacoEditor
              value={content}
              onChange={handleChange}
              onSave={handleSave}
              title={currentFile}
            />
          )
        ) : activeTab === 'learning-path' ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">学习计划</p>
              <p className="text-xs mt-1">加载中…</p>
            </div>
          </div>
        ) : activeTab === 'mistakes' ? (
          <MistakeBook />
        ) : activeTab === 'knowledge-graph' ? (
          <KnowledgeGraph />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FolderTree className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">从左侧选择一个文件</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
