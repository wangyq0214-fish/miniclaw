'use client';

import { useState } from 'react';
import {
  Route,
  Library,
  BookMarked,
  Plus,
  Trash2,
  Loader2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TokenMeter } from '@/components/layout/TokenMeter';
import { WorkspaceBrowser } from '@/components/inspector/WorkspaceBrowser';
import { useApp } from '@/lib/store';
import type { SessionInfo } from '@/lib/api';
import type { TabId } from '@/lib/store';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  sessions: SessionInfo[];
  activeSession: string;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => Promise<string>;
}

export function Sidebar({
  activeTab,
  onTabChange,
  sessions,
  activeSession,
  onSessionSelect,
  onNewSession,
}: SidebarProps) {
  const { state, actions } = useApp();
  const [isCreating, setIsCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<SessionInfo | null>(null);

  const tabs: Array<{ id: TabId; icon: typeof Route; label: string }> = [
    { id: 'learning-path', icon: Route, label: '学习路径' },
    { id: 'resources', icon: Library, label: '资源库' },
    { id: 'mistakes', icon: BookMarked, label: '错题本' },
  ];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleNewSession = async () => {
    setIsCreating(true);
    try {
      await onNewSession();
    } finally {
      setIsCreating(false);
    }
  };

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
    <div className="h-full bg-sidebar text-sidebar-foreground backdrop-blur-xl border-r border-sidebar-border flex flex-col">
      {/* Navigation Tabs */}
      <div className="p-3 border-b border-sidebar-border">
        <div className="grid grid-cols-3 gap-1">
          {tabs.map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              variant={activeTab === id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onTabChange(id)}
              className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-1"
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px]">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Content area: file tree or session list depending on tab */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === 'resources' ? (
          <WorkspaceBrowser activePath={state.activeFilePath} onSelect={(path) => actions.setActiveFile(path)} />
        ) : (
          <>
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-xs font-medium text-muted-foreground">会话列表</span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleNewSession}
                disabled={isCreating}
                aria-label="新建会话"
              >
                {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </Button>
            </div>

            <div className="space-y-1">
              {sessions.map((session) => {
                const isActive = activeSession === session.session_id;
                const isRenaming = renamingId === session.session_id;
                return (
                  <div
                    key={session.session_id}
                    className={`group relative flex items-center gap-1 p-2 rounded-lg cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'hover:bg-sidebar-accent/50'
                    }`}
                    onClick={() => !isRenaming && onSessionSelect(session.session_id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(session);
                    }}
                  >
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
                          <div className="text-sm font-medium truncate">
                            {session.title || session.session_id}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex gap-2">
                            <span>{formatDate(session.updated_at || session.created_at)}</span>
                            <span>{session.message_count} 条</span>
                          </div>
                        </>
                      )}
                    </div>

                    {isRenaming ? (
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); commitRename(); }}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); cancelRename(); }}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => { e.stopPropagation(); startRename(session); }}
                          aria-label="重命名"
                        >
                          <Pencil className="w-3 h-3 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => { e.stopPropagation(); setPendingDelete(session); }}
                          aria-label="删除会话"
                        >
                          <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {sessions.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-4">
                  暂无会话
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="删除会话"
        description={
          pendingDelete ? (
            <>
              确认删除会话 <span className="font-medium text-foreground">{pendingDelete.title || pendingDelete.session_id}</span>？此操作不可撤销。
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
