'use client';

import { useEffect, useState } from 'react';
import {
  Route,
  Library,
  Plus,
  Loader2,
  Check,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Brain,
  BookOpen,
  GraduationCap,
  MoreVertical,
  Pencil,
  Trash2,
  Network,
  NotebookPen,
  BarChart3,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TokenMeter } from '@/components/layout/TokenMeter';
import { WorkspaceBrowser } from '@/components/inspector/WorkspaceBrowser';
import { GraphDetailPanel } from '@/components/graph/GraphDetailPanel';
import { listFiles, type FileInfo } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { SessionInfo } from '@/lib/api';
import type { TabId } from '@/lib/store';

// ── Types ──────────────────────────────────────────────

type SidebarView = 'resources' | 'mindmaps' | 'learning-path' | 'mistakes' | 'knowledge-graph' | 'notes' | 'dashboard';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  sessions: SessionInfo[];
  activeSession: string;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => Promise<string>;
}

// ── Constants ──────────────────────────────────────────

const ACTION_ITEMS: Array<{
  id: SidebarView;
  icon: typeof GraduationCap;
  label: string;
}> = [
  { id: 'dashboard', icon: BarChart3, label: '学习分析' },
  { id: 'learning-path', icon: GraduationCap, label: '学习路径' },
  { id: 'resources', icon: Library, label: '资源库' },
  { id: 'mindmaps', icon: Brain, label: '思维导图' },
  { id: 'mistakes', icon: BookOpen, label: '错题本' },
  { id: 'knowledge-graph', icon: Network, label: '知识图谱' },
  { id: 'notes', icon: NotebookPen, label: '笔记' },
];

// ── Helpers ────────────────────────────────────────────

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Sub-components ─────────────────────────────────────

function MindmapListView({
  activePath,
  onSelect,
}: {
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  const { state } = useApp();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const candidates = ['workspace/generated/mindmaps', 'workspace/mindmaps'];
        const all: FileInfo[] = [];
        for (const dir of candidates) {
          try {
            const res = await listFiles(dir);
            if (!cancelled) all.push(...res.files.filter((f) => f.type === 'file'));
          } catch {
            // directory may not exist, skip
          }
        }
        if (!cancelled) setFiles(all);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [state.filesVersion]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8">
        <Brain className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">暂无思维导图</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          在聊天中说 &ldquo;帮我生成 XX 的思维导图&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {files.map((file) => {
        const isActive = activePath === file.path;
        const displayName = file.name.replace(/\.(json|md)$/i, '');
        return (
          <button
            key={file.path}
            onClick={() => onSelect(file.path)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left group ${
              isActive
                ? 'bg-black/[0.06] dark:bg-white/[0.08]'
                : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
            }`}
          >
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-[#E6F4EA]">
              <Brain className="w-3.5 h-3.5 text-[#16A34A]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate leading-tight ${isActive ? 'text-primary' : ''}`}>
                {displayName}
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                {file.size ? `${(file.size / 1024).toFixed(1)} KB` : '思维导图'}
              </div>
            </div>
            <MoreVertical className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

function SessionList({
  sessions,
  activeSession,
  onSessionSelect,
  onNewSession,
  isCreating,
  onRename,
  onDelete,
}: {
  sessions: SessionInfo[];
  activeSession: string;
  onSessionSelect: (id: string) => void;
  onNewSession: () => void;
  isCreating: boolean;
  onRename: (session: SessionInfo) => void;
  onDelete: (session: SessionInfo) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const { actions } = useApp();

  const startRename = (session: SessionInfo) => {
    setRenamingId(session.session_id);
    setRenameValue(session.title || session.session_id);
  };

  const commitRename = async () => {
    if (renamingId && renameValue.trim()) {
      await actions.renameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  return (
    <>
      <div className="flex items-center justify-between mb-1 px-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          会话
        </span>
        <button
          onClick={onNewSession}
          disabled={isCreating}
          className="p-1 rounded-md hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors text-muted-foreground"
          title="新建会话"
        >
          {isCreating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <div className="space-y-0.5">
        {(sessions || []).map((session) => {
          const isActive = activeSession === session.session_id;
          const isRenaming = renamingId === session.session_id;
          return (
            <div
              key={session.session_id}
              className={`group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? 'bg-black/[0.06] dark:bg-white/[0.08]'
                  : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
              }`}
              onClick={() => !isRenaming && onSessionSelect(session.session_id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename(session);
              }}
            >
              <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                isActive ? 'bg-primary/15' : 'bg-black/[0.05] dark:bg-white/[0.08]'
              }`}>
                <Route className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>

              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      else if (e.key === 'Escape') cancelRename();
                    }}
                    autoFocus
                    className="w-full text-sm font-medium bg-background border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <>
                    <div className="text-sm font-medium truncate leading-tight">
                      {session.title || session.session_id}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                      {formatDate(session.updated_at || session.created_at)}
                      {' · '}
                      {session.message_count} 条
                    </div>
                  </>
                )}
              </div>

              {isRenaming ? (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); commitRename(); }}
                    className="p-1 rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); cancelRename(); }}
                    className="p-1 rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); startRename(session); }}
                    className="p-1 rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                    title="重命名"
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(session); }}
                    className="p-1 rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                    title="删除会话"
                  >
                    <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {sessions.length === 0 && (
          <div className="text-center text-muted-foreground text-xs py-6">
            暂无会话
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Component ─────────────────────────────────────

export function Sidebar({
  activeTab,
  onTabChange,
  sessions,
  activeSession,
  onSessionSelect,
  onNewSession,
}: SidebarProps) {
  const { state, actions } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [currentView, setCurrentView] = useState<SidebarView>('resources');
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SessionInfo | null>(null);

  // Sync activeTab → currentView (when parent changes tab)
  useEffect(() => {
    if (activeTab === 'resources' || activeTab === 'learning-path' || activeTab === 'mistakes' || activeTab === 'knowledge-graph' || activeTab === 'notes' || activeTab === 'dashboard') {
      setCurrentView(activeTab);
    }
  }, [activeTab]);

  const handleActionClick = (id: SidebarView) => {
    setCurrentView(id);
    if (id === 'learning-path' || id === 'mistakes' || id === 'knowledge-graph' || id === 'notes' || id === 'dashboard') {
      actions.setActiveFile(null);
    }
    if (id === 'resources' || id === 'learning-path' || id === 'mistakes' || id === 'knowledge-graph' || id === 'notes' || id === 'dashboard') {
      onTabChange(id as TabId);
    }
  };

  const handleNewSession = async () => {
    setIsCreating(true);
    try {
      await onNewSession();
    } finally {
      setIsCreating(false);
    }
  };

  // ── Collapsed state ──

  if (collapsed) {
    return (
      <div className="h-full flex flex-col items-center py-3 bg-sidebar">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors text-muted-foreground"
          title="展开侧边栏"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="h-full bg-sidebar text-sidebar-foreground flex flex-col relative overflow-hidden border-r border-white/5">
      {/* 1. Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">工作区</span>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1.5 rounded-lg hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors text-muted-foreground"
          title="收起侧边栏"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Action List */}
      <div className="px-3 pb-3">
        <div className="flex flex-col gap-0.5">
          {ACTION_ITEMS.map(({ id, icon: Icon, label }) => {
            const isActive = currentView === id;
            return (
              <button
                key={id}
                onClick={() => handleActionClick(id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                  isActive
                    ? 'bg-accent text-primary font-medium'
                    : 'text-secondary-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0 opacity-70" />
                <span className="flex-1 text-sm">{label}</span>
                <svg width="6" height="10" viewBox="0 0 6 10" fill="none" className={`shrink-0 transition-opacity ${isActive ? 'opacity-50' : 'opacity-0'}`}>
                  <path d="M1 1L5 5L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-border/50" />

      {/* 3. Content Area */}
      <div className="flex-1 overflow-y-auto px-2 py-2 pb-16 bg-white dark:bg-background">
        {currentView === 'resources' && (
          <WorkspaceBrowser
            activePath={state.activeFilePath}
            onSelect={(path) => actions.setActiveFile(path)}
          />
        )}

        {currentView === 'mindmaps' && (
          <MindmapListView
            activePath={state.activeFilePath}
            onSelect={(path) => actions.setActiveFile(path)}
          />
        )}

        {(currentView === 'learning-path' || currentView === 'mistakes') && (
          <SessionList
            sessions={sessions}
            activeSession={activeSession}
            onSessionSelect={onSessionSelect}
            onNewSession={handleNewSession}
            isCreating={isCreating}
            onRename={() => {}}
            onDelete={setPendingDelete}
          />
        )}

        {currentView === 'knowledge-graph' && (
          state.selectedGraphNode ? (
            <GraphDetailPanel
              node={state.selectedGraphNode}
              expanded={!!state.graphData?.edges.some((e) => e.source === state.selectedGraphNode!.id)}
              expanding={false}
              graphData={state.graphData}
              onExpand={state.isTraceback || !state.toggleExpandNodeCallback ? undefined : () => {
                state.toggleExpandNodeCallback!(state.selectedGraphNode!);
              }}
              onClose={() => actions.setSelectedGraphNode(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Network className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">点击图谱中的节点查看详情</p>
            </div>
          )
        )}
      </div>

      {/* 4. FAB — new session (only for session views) */}
      {(currentView === 'learning-path' || currentView === 'mistakes') && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={handleNewSession}
            disabled={isCreating}
            className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-full font-medium text-sm shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            新建会话
          </button>
        </div>
      )}

      {/* Dialogs */}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="删除会话"
        description={
          pendingDelete ? (
            <>
              确认删除会话{' '}
              <span className="font-medium text-foreground">
                {pendingDelete.title || pendingDelete.session_id}
              </span>
              ？此操作不可撤销。
            </>
          ) : null
        }
        confirmLabel="删除"
        variant="destructive"
        onConfirm={async () => {
          if (pendingDelete) {
            await actions.deleteSession(pendingDelete.session_id);
            setPendingDelete(null);
          }
        }}
      />
      <TokenMeter sessionId={activeSession} refreshKey={sessions.length} />
    </div>
  );
}
