'use client';

import { useEffect, useState } from 'react';
import { Target, FolderTree, BookMarked, Loader2 } from 'lucide-react';
import { MonacoEditor } from '@/components/editor/MonacoEditor';
import { ContentCard } from '@/components/inspector/ContentCard';
import { readFile, writeFile } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { TabId } from '@/lib/store';

interface InspectorProps {
  activeTab: TabId;
  sessionId: string;
}

const TAB_META: Record<TabId, { icon: typeof Target; label: string }> = {
  'learning-path': { icon: Target, label: '学习计划' },
  resources: { icon: FolderTree, label: '资源浏览' },
  mistakes: { icon: BookMarked, label: '错题本' },
};

export function Inspector({ activeTab }: InspectorProps) {
  const { state, actions } = useApp();
  const [content, setContent] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const loadFileContent = async (path: string) => {
    setIsLoading(true);
    try {
      const result = await readFile(path);
      setContent(result.content);
      setCurrentFile(path);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to load file:', error);
      setContent('');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'learning-path') {
      setEditMode(false);
      loadFileContent('workspace/learning_plan.md');
    } else if (activeTab === 'resources' && state.activeFilePath) {
      setEditMode(false);
      loadFileContent(state.activeFilePath);
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

  const meta = TAB_META[activeTab];
  const Icon = meta.icon;

  return (
    <div className="h-full flex flex-col border-l border-border bg-card/30">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/40">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground truncate">
          {meta.label}
        </span>
        {hasChanges && <span className="w-1.5 h-1.5 bg-primary rounded-full" />}
      </div>

      <div className="flex-1 relative min-h-0">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {activeTab === 'mistakes' ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <BookMarked className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">错题本</p>
              <p className="text-xs mt-1">此功能即将上线，敬请期待</p>
            </div>
          </div>
        ) : activeTab === 'resources' && !state.activeFilePath ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FolderTree className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">从左侧资源库中选择一个文件</p>
            </div>
          </div>
        ) : !editMode && currentFile.endsWith('.md') ? (
          <ContentCard
            path={currentFile}
            content={content}
            onOpenInEditor={() => setEditMode(true)}
          />
        ) : currentFile ? (
          <MonacoEditor
            value={content}
            onChange={handleChange}
            onSave={handleSave}
            title={currentFile}
          />
        ) : null}
      </div>
    </div>
  );
}
