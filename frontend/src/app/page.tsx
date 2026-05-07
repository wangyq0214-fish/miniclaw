'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppProvider, useApp } from '@/lib/store';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChatView } from '@/components/chat/ChatView';
import { Inspector } from '@/components/layout/Inspector';
import { NotesView } from '@/components/notes/NotesView';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { UserSettings } from '@/components/settings/UserSettings';
import { useGlobalHotkeys } from '@/hooks/useHotkeys';
import { tokenManager, authApi } from '@/lib/auth';
import { toast } from 'sonner';
import { LogOut, User, Menu, X, PanelRightOpen } from 'lucide-react';
import FloatingPet from '@/components/pet/FloatingPet';
import useAgentSync from '@/components/pet/useAgentSync';

function Resizer({
  currentWidth,
  onWidthChange,
  minWidth = 180,
  maxWidth = 600,
  className = '',
}: {
  currentWidth: number;
  onWidthChange: (w: number) => void;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
}) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = currentWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      onWidthChange(Math.min(maxWidth, Math.max(minWidth, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`w-1 bg-border/50 hover:bg-primary/50 active:bg-primary/50 cursor-col-resize transition-colors shrink-0 ${className}`}
    />
  );
}

function MainContent() {
  const { state, actions } = useApp();
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [mobileInspector, setMobileInspector] = useState(false);
  useAgentSync();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Mobile: auto-open inspector when a file is selected or content tab is activated
  useEffect(() => {
    if (state.activeFilePath) setMobileInspector(true);
  }, [state.activeFilePath]);

  useEffect(() => {
    if (state.activeTab !== 'notes') setMobileInspector(true);
  }, [state.activeTab]);

  // 检查登录状态
  useEffect(() => {
    const token = tokenManager.getToken();
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  // 登出处理
  const handleLogout = async () => {
    const token = tokenManager.getToken();
    if (token) {
      try {
        await authApi.logout(token);
        tokenManager.removeToken();
        toast.success('已登出');
        router.push('/login');
      } catch (error) {
        toast.error('登出失败');
      }
    }
  };

  useGlobalHotkeys({
    onNewSession: actions.createNewSession,
    onFocusComposer: () => {
      window.dispatchEvent(new Event('miniclaw:focus-composer'));
    },
    onStopStreaming: () => {
      if (state.isStreaming) actions.stopStreaming();
    },
  });

  // 点击会话后自动关闭移动端侧栏
  const handleMobileSessionSelect = (id: string) => {
    actions.selectSession(id);
    setMobileSidebar(false);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-12 md:h-14 bg-background/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-3 md:px-6">
        <div className="flex items-center gap-2">
          {/* Mobile: hamburger */}
          <button
            onClick={() => setMobileSidebar(true)}
            className="md:hidden p-1.5 hover:bg-muted rounded-md transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-6 h-6 bg-primary rounded-lg" />
          <span className="font-semibold text-foreground text-sm md:text-base">Mini OpenClaw</span>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {/* Mobile: inspector toggle */}
          {state.activeTab !== 'notes' && (
            <button
              onClick={() => setMobileInspector(true)}
              className="lg:hidden p-2 hover:bg-muted rounded-md transition-colors"
              title="查看内容"
            >
              <PanelRightOpen className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            title="用户设置"
          >
            <User className="w-5 h-5" />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            title="登出"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {state.activeTab === 'notes' ? (
          <NotesView />
        ) : (
          <>
            {/* Mobile Sidebar Drawer */}
            {mobileSidebar && (
              <div className="md:hidden fixed inset-0 z-50">
                <div
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setMobileSidebar(false)}
                />
                <div className="absolute inset-y-0 left-0 w-full bg-sidebar flex flex-col animate-in slide-in-from-left duration-200">
                  <div className="flex items-center justify-between p-3 border-b border-border">
                    <span className="text-sm font-medium">导航</span>
                    <button onClick={() => setMobileSidebar(false)} className="p-1 hover:bg-muted rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <Sidebar
                    activeTab={state.activeTab}
                    onTabChange={(tab) => { actions.setActiveTab(tab); setMobileSidebar(false); }}
                    sessions={state.sessions}
                    activeSession={state.activeSessionId}
                    onSessionSelect={handleMobileSessionSelect}
                    onNewSession={() => { actions.createNewSession(); setMobileSidebar(false); }}
                  />
                </div>
              </div>
            )}

            {/* Mobile Inspector Drawer */}
            {mobileInspector && (
              <div className="lg:hidden fixed inset-0 z-50">
                <div className="h-full w-full bg-background flex flex-col animate-in slide-in-from-right duration-200">
                  <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
                    <span className="text-sm font-medium">内容</span>
                    <button onClick={() => setMobileInspector(false)} className="p-1 hover:bg-muted rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <Inspector activeTab={state.activeTab} sessionId={state.activeSessionId} />
                  </div>
                </div>
              </div>
            )}

            {/* Desktop: Left Sidebar */}
            {!isMobile && (
              <>
                <div style={{ width: state.sidebarWidth }} className="hidden md:block">
                  <Sidebar
                    activeTab={state.activeTab}
                    onTabChange={actions.setActiveTab}
                    sessions={state.sessions}
                    activeSession={state.activeSessionId}
                    onSessionSelect={actions.selectSession}
                    onNewSession={actions.createNewSession}
                  />
                </div>

                {/* Resizer: Sidebar ↔ Inspector */}
                <Resizer
                  currentWidth={state.sidebarWidth}
                  onWidthChange={actions.setSidebarWidth}
                  minWidth={180}
                  maxWidth={400}
                  className="hidden md:block"
                />

                {/* Desktop: Center Inspector */}
                <div style={{ width: state.inspectorWidth }} className="hidden lg:block">
                  <Inspector activeTab={state.activeTab} sessionId={state.activeSessionId} />
                </div>

                {/* Resizer: Inspector ↔ ChatView */}
                <Resizer
                  currentWidth={state.inspectorWidth}
                  onWidthChange={actions.setInspectorWidth}
                  minWidth={280}
                  maxWidth={1600}
                  className="hidden lg:block"
                />
              </>
            )}

            {/* Chat (always visible, full width on mobile) */}
            <div className="flex-1 flex flex-col min-w-0">
              <ChatView
                sessionId={state.activeSessionId}
                messages={state.messages}
                onSendMessage={actions.sendMessage}
                isLoading={state.isStreaming}
              />
            </div>
          </>
        )}
      </div>

      {/* User Settings Modal */}
      {showSettings && <UserSettings onClose={() => setShowSettings(false)} />}

      {/* Desktop Pet */}
      <FloatingPet />
    </div>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
