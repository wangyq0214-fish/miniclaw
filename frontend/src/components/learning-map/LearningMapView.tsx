'use client';

import { useState, useEffect, useCallback } from 'react';
import { Target, Map as MapIcon, FileText, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardShell } from '@/components/inspector/CardShell';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { LearningMap } from './LearningMap';
import { useLearningProgress } from './useLearningProgress';
import { readFile, listFiles } from '@/lib/api';
import { useApp } from '@/lib/store';
import { useSubagent } from '@/lib/useSubagent';
import type { LearningMapData, LearningMapNode, NodeActionType, ActionTrigger } from './types';
import { getUserItem, setUserItem, removeUserItem } from '@/lib/userStorage';

type ViewMode = 'map' | 'markdown';

const GENERATE_PROMPTS: Record<NodeActionType, (node: LearningMapNode) => string> = {
  learn: (n) => `请为我详细讲解「${n.title}」的知识点，包括核心概念、原理和实际应用场景。`,
};

const SUBAGENT_MAP: Partial<Record<NodeActionType, string>> = {};

const DIR_MAP: Partial<Record<NodeActionType, string>> = {};

const PATHS_KEY = 'miniclaw_gen_paths';

function loadPaths(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(getUserItem(PATHS_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePath(nodeId: string, action: NodeActionType, filePath: string) {
  const paths = loadPaths();
  paths[`${nodeId}:${action}`] = filePath;
  setUserItem(PATHS_KEY, JSON.stringify(paths));
}

function getPath(nodeId: string, action: NodeActionType): string | null {
  return loadPaths()[`${nodeId}:${action}`] || null;
}

/** Find a resource file by its learning_node_id metadata field */
async function findFileByNodeId(dir: string, nodeId: string): Promise<string | null> {
  try {
    const { files } = await listFiles(dir);
    for (const file of files) {
      if (file.type !== 'file') continue;
      try {
        const result = await readFile(file.path);
        const data = JSON.parse(result.content);
        if (data.learning_node_id === nodeId) {
          return file.path;
        }
      } catch {
        // Skip files that can't be parsed
      }
    }
  } catch {
    // Directory doesn't exist or can't be listed
  }
  return null;
}

async function findFileByTitle(dir: string, title: string): Promise<string | null> {
  try {
    const { files } = await listFiles(dir);
    const cleanTitle = title.replace(/Day\s*\d+\s*[:：]?\s*/i, '').trim();
    const keywords = cleanTitle
      .split(/[\s、，,]+/)
      .filter((w) => w.length >= 2)
      .sort((a, b) => b.length - a.length); // Longer keywords first

    if (keywords.length === 0) return null;

    // Score each file by keyword matches
    const scored = files
      .filter((f) => f.type === 'file')
      .map((f) => {
        const name = f.name.toLowerCase();
        let score = 0;
        let matchedCount = 0;
        for (const kw of keywords) {
          if (name.includes(kw.toLowerCase())) {
            score += kw.length; // Longer matches score higher
            matchedCount++;
          }
        }
        // Bonus for matching more keywords
        if (matchedCount > 1) score += matchedCount * 5;
        // Bonus for matching the full title
        if (name.includes(cleanTitle.toLowerCase())) score += 100;
        return { file: f, score, matchedCount };
      })
      .filter((item) => item.matchedCount > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.file.path ?? null;
  } catch {
    return null;
  }
}

interface LearningMapViewProps {
  markdownContent: string;
  path: string;
  mapDataPath?: string;
  onOpenInEditor?: () => void;
}

export function LearningMapView({
  markdownContent,
  path,
  mapDataPath = 'workspace/learning_map.json',
  onOpenInEditor,
}: LearningMapViewProps) {
  const { actions: storeActions } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [mapData, setMapData] = useState<LearningMapData | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState(false);

  const { invoke, isRunning: isGenerating } = useSubagent();

  // Use the learning progress hook (manages actions, results, local status)
  const progress = useLearningProgress(mapData?.nodes ?? []);

  useEffect(() => {
    let cancelled = false;
    setMapLoading(true);
    setMapError(false);

    readFile(mapDataPath)
      .then((result) => {
        if (cancelled) return;
        try {
          setMapData(JSON.parse(result.content));
        } catch {
          setMapError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setMapError(true);
      })
      .finally(() => {
        if (!cancelled) setMapLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mapDataPath]);

  // No file-based actions to check for learn-only mode

  const handleAction = useCallback(
    async (node: LearningMapNode, action: NodeActionType, trigger: ActionTrigger) => {
      if (trigger === 'generate') {
        if (action === 'learn') {
          storeActions.sendMessage(GENERATE_PROMPTS.learn(node));
          setTimeout(() => {
            progress.setPhase(node.id, action, 'completed');
          }, 1500);
          return;
        }

        const subagent = SUBAGENT_MAP[action];
        const dir = DIR_MAP[action];
        if (subagent && dir) {
          try {
            await invoke({ subagent, message: GENERATE_PROMPTS[action](node) });
            // First try to find by learning_node_id (strong binding)
            let filePath = await findFileByNodeId(dir, node.id);
            // Fallback to title-based matching
            if (!filePath) {
              filePath = await findFileByTitle(dir, node.title);
            }
            if (filePath) {
              savePath(node.id, action, filePath);
              progress.setPhase(node.id, action, 'ready');
            } else {
              progress.setPhase(node.id, action, 'idle');
            }
          } catch {
            progress.setPhase(node.id, action, 'idle');
          }
        }
        return;
      }

      // trigger === 'start': open the stored file
      const filePath = getPath(node.id, action);
      if (filePath) {
        storeActions.setActiveFile(filePath);
      }
    },
    [invoke, storeActions, progress],
  );

  const handleGenerate = useCallback(async () => {
    try {
      // Clear old progress before regenerating
      removeUserItem('miniclaw_learning_actions');
      removeUserItem('miniclaw_learning_results');
      removeUserItem('miniclaw_gen_paths');

      await invoke({
        subagent: 'learning_map_planner',
        message: `请根据以下学习计划生成学习地图 JSON，用 write_file 保存到 ${mapDataPath}：\n\n${markdownContent}`,
      });
      // Re-read the generated map
      setMapLoading(true);
      setMapError(false);
      try {
        const result = await readFile(mapDataPath);
        setMapData(JSON.parse(result.content));
      } catch {
        setMapError(true);
      } finally {
        setMapLoading(false);
      }
    } catch {
      // Generation failed — stay on error state
    }
  }, [invoke, markdownContent, mapDataPath]);

  const canShowMap = !mapLoading && !mapError && mapData !== null;

  return (
    <CardShell
      icon={<Target className="w-4 h-4" />}
      label="学习计划"
      path={path}
      content={markdownContent}
      onOpenInEditor={onOpenInEditor}
    >
      <div className="flex items-center gap-1 mb-3">
        <Button
          variant={viewMode === 'map' ? 'default' : 'ghost'}
          size="xs"
          onClick={() => setViewMode('map')}
          disabled={!canShowMap}
        >
          <MapIcon className="w-3.5 h-3.5 mr-1" />
          地图
        </Button>
        <Button
          variant={viewMode === 'markdown' ? 'default' : 'ghost'}
          size="xs"
          onClick={() => setViewMode('markdown')}
        >
          <FileText className="w-3.5 h-3.5 mr-1" />
          文档
        </Button>

        <div className="ml-auto flex items-center gap-1">
          {canShowMap && (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleGenerate}
              disabled={isGenerating}
              title="重新生成学习地图"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
          {mapLoading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {viewMode === 'map' && canShowMap && mapData ? (
        <div className="h-[calc(100%-2rem)] min-h-[400px] -mx-3 md:-mx-5 -mb-3 md:-mb-5">
          <LearningMap
            data={mapData}
            actions={progress.actions}
            results={progress.results}
            localStatus={progress.localStatus}
            setPhase={progress.setPhase}
            onAction={handleAction}
          />
        </div>
      ) : viewMode === 'map' && mapError ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <MapIcon className="w-10 h-10 mb-2 opacity-40" />
          <p className="text-sm font-medium">学习地图数据暂未生成</p>
          <p className="text-xs mt-1 text-muted-foreground/60">
            点击下方按钮，AI 将根据学习计划自动生成学习地图
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              variant="default"
              size="xs"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1" />
              )}
              {isGenerating ? '生成中...' : '生成学习地图'}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setViewMode('markdown')}
            >
              <FileText className="w-3.5 h-3.5 mr-1" />
              查看文档版
            </Button>
          </div>
        </div>
      ) : (
        <MarkdownRenderer content={markdownContent} />
      )}
    </CardShell>
  );
}
