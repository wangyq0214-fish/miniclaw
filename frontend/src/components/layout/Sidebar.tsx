'use client';

import { useState } from 'react';
import { MessageSquare, Brain, Wrench, Plus, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SessionInfo } from '@/lib/api';

interface SidebarProps {
  activeTab: 'chat' | 'memory' | 'skills';
  onTabChange: (tab: 'chat' | 'memory' | 'skills') => void;
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
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isReloadingSkills, setIsReloadingSkills] = useState(false);

  const tabs = [
    { id: 'chat' as const, icon: MessageSquare, label: '对话' },
    { id: 'memory' as const, icon: Brain, label: '记忆' },
    { id: 'skills' as const, icon: Wrench, label: '技能' },
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

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    try {
      const { deleteSession } = await import('@/lib/api');
      await deleteSession(sessionId);
      // Reload sessions
      window.location.reload();
    } catch (error) {
      console.error('Failed to delete session:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleReloadSkills = async () => {
    setIsReloadingSkills(true);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';
      const response = await fetch(`${API_BASE}/api/config/reload-skills`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        console.log(`Skills reloaded: ${data.skills_count} skills`);
      }
    } catch (error) {
      console.error('Failed to reload skills:', error);
    } finally {
      setIsReloadingSkills(false);
    }
  };

  return (
    <div className="h-full bg-white/80 backdrop-blur-xl border-r border-gray-200/50 flex flex-col">
      {/* Navigation Tabs */}
      <div className="p-4 border-b border-gray-200/50">
        <div className="flex gap-2">
          {tabs.map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              variant={activeTab === id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onTabChange(id)}
              className="flex-1 flex flex-col items-center gap-1 h-auto py-2"
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Skills reload button (only show when skills tab is active) */}
        {activeTab === 'skills' && (
          <div className="mb-2 p-2 bg-purple-50 rounded-lg">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReloadSkills}
              disabled={isReloadingSkills}
              className="w-full text-purple-700 border-purple-200 hover:bg-purple-100"
            >
              {isReloadingSkills ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              热重载技能
            </Button>
            <p className="text-xs text-purple-600 mt-1 text-center">
              添加新技能后点击重载
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mb-2 px-2">
          <span className="text-xs font-medium text-gray-500">会话列表</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewSession}
            disabled={isCreating}
            className="h-6 w-6 p-0"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </div>

        <div className="space-y-1">
          {sessions.map((session) => (
            <div
              key={session.session_id}
              className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                activeSession === session.session_id
                  ? 'bg-blue-50 text-blue-700'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => onSessionSelect(session.session_id)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {session.title || session.session_id}
                </div>
                <div className="text-xs text-gray-500 flex gap-2">
                  <span>{formatDate(session.updated_at || session.created_at)}</span>
                  <span>{session.message_count} 条消息</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => handleDelete(e, session.session_id)}
                disabled={deletingId === session.session_id}
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
              >
                {deletingId === session.session_id ? (
                  <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                ) : (
                  <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                )}
              </Button>
            </div>
          ))}

          {sessions.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-4">
              暂无会话
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
