'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AppProvider, useApp } from '@/lib/store';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChatView } from '@/components/chat/ChatView';
import { Inspector } from '@/components/layout/Inspector';
import { NotesView } from '@/components/notes/NotesView';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { UserSettings } from '@/components/settings/UserSettings';
import { useGlobalHotkeys } from '@/hooks/useHotkeys';
import { tokenManager, authApi } from '@/lib/auth';
import { toast } from 'sonner';
import { LogOut, Settings, Menu, X, PanelRightOpen } from 'lucide-react';
import FloatingPet from '@/components/pet/FloatingPet';
import useAgentSync from '@/components/pet/useAgentSync';

function Resizer({
  currentWidth,
  onWidthChange,
  minWidth = 180,
  maxWidth = 600,
  invertDelta = false,
  className = '',
}: {
  currentWidth: number;
  onWidthChange: (w: number) => void;
  minWidth?: number;
  maxWidth?: number;
  invertDelta?: boolean;
  className?: string;
}) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = currentWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const adjusted = invertDelta ? -delta : delta;
      onWidthChange(Math.min(maxWidth, Math.max(minWidth, startWidth + adjusted)));
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
      <motion.header
        className="h-12 md:h-14 bg-background/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-3 md:px-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-2">
          {/* Mobile: hamburger */}
          <motion.button
            onClick={() => setMobileSidebar(true)}
            className="md:hidden p-1.5 hover:bg-muted rounded-md transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Menu className="w-5 h-5" />
          </motion.button>
          <motion.div
            className="w-5 h-5 bg-foreground rounded-md flex items-center justify-center"
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
          >
            <div className="w-2 h-2 bg-background rounded-[1px]" />
          </motion.div>
          <motion.span
            className="font-semibold text-foreground text-sm md:text-base"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            Mini OpenClaw
          </motion.span>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {/* Mobile: inspector toggle */}
          {state.activeTab !== 'notes' && (
            <motion.button
              onClick={() => setMobileInspector(true)}
              className="lg:hidden p-2 hover:bg-muted rounded-md transition-colors"
              title="查看内容"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <PanelRightOpen className="w-5 h-5" />
            </motion.button>
          )}
          <motion.button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            title="设置"
            whileHover={{ rotate: 90 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <Settings className="w-5 h-5" />
          </motion.button>
          <motion.button
            onClick={handleLogout}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            title="登出"
            whileHover={{ x: 5 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <LogOut className="w-5 h-5" />
          </motion.button>
          <ThemeToggle />
        </div>
      </motion.header>

      {/* Main Content */}
      <motion.div
        className="flex-1 flex overflow-hidden relative"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <AnimatePresence mode="wait">
          {state.activeTab === 'dashboard' ? (
            <motion.div
              key="dashboard"
              className="w-full"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
            >
              <DashboardView />
            </motion.div>
          ) : state.activeTab === 'notes' ? (
            <motion.div
              key="notes"
              className="w-full"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <NotesView />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              className="flex w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Mobile Sidebar Drawer */}
              <AnimatePresence>
                {isMobile && mobileSidebar && (
                  <motion.div
                    className="md:hidden fixed inset-0 z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.div
                      className="absolute inset-0 bg-black/40"
                      onClick={() => setMobileSidebar(false)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    />
                    <motion.div
                      className="absolute inset-y-0 left-0 w-full bg-sidebar flex flex-col"
                      initial={{ x: '-100%' }}
                      animate={{ x: 0 }}
                      exit={{ x: '-100%' }}
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    >
                      <div className="flex items-center justify-between p-3 border-b border-border">
                        <span className="text-sm font-medium">导航</span>
                        <motion.button
                          onClick={() => setMobileSidebar(false)}
                          className="p-1 hover:bg-muted rounded"
                          whileHover={{ rotate: 90 }}
                        >
                          <X className="w-4 h-4" />
                        </motion.button>
                      </div>
                      <Sidebar
                        activeTab={state.activeTab}
                        onTabChange={(tab) => { actions.setActiveTab(tab); setMobileSidebar(false); }}
                        sessions={state.sessions}
                        activeSession={state.activeSessionId}
                        onSessionSelect={handleMobileSessionSelect}
                        onNewSession={async () => { await actions.createNewSession(); setMobileSidebar(false); return state.activeSessionId ?? ''; }}
                      />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Mobile Inspector Drawer */}
              <AnimatePresence>
                {isMobile && mobileInspector && (
                  <motion.div
                    className="lg:hidden fixed inset-0 z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.div
                      className="h-full w-full bg-background flex flex-col"
                      initial={{ x: '100%' }}
                      animate={{ x: 0 }}
                      exit={{ x: '100%' }}
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    >
                      <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
                        <span className="text-sm font-medium">内容</span>
                        <motion.button
                          onClick={() => setMobileInspector(false)}
                          className="p-1 hover:bg-muted rounded"
                          whileHover={{ rotate: 90 }}
                        >
                          <X className="w-4 h-4" />
                        </motion.button>
                      </div>
                      <div className="flex-1 min-h-0">
                        <Inspector activeTab={state.activeTab} sessionId={state.activeSessionId} />
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Desktop: Left Sidebar */}
              {!isMobile && (
                <>
                  <motion.div
                    style={{ width: state.sidebarWidth }}
                    className="hidden md:block"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Sidebar
                      activeTab={state.activeTab}
                      onTabChange={actions.setActiveTab}
                      sessions={state.sessions}
                      activeSession={state.activeSessionId}
                      onSessionSelect={actions.selectSession}
                      onNewSession={actions.createNewSession}
                    />
                  </motion.div>

                  {/* Resizer: Sidebar ↔ Chat */}
                  <Resizer
                    currentWidth={state.sidebarWidth}
                    onWidthChange={actions.setSidebarWidth}
                    minWidth={180}
                    maxWidth={400}
                    className="hidden md:block"
                  />
                </>
              )}

              {/* Chat (always visible, full width on mobile) */}
              <motion.div
                className="flex-1 flex flex-col min-w-0"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <ChatView
                  sessionId={state.activeSessionId}
                  messages={state.messages}
                  onSendMessage={actions.sendMessage}
                  isLoading={state.isStreaming}
                />
              </motion.div>

              {/* Desktop: Right Inspector */}
              {!isMobile && (
                <>
                  {/* Resizer: Chat ↔ Inspector */}
                  <Resizer
                    currentWidth={state.inspectorWidth}
                    onWidthChange={actions.setInspectorWidth}
                    minWidth={280}
                    maxWidth={1600}
                    invertDelta
                    className="hidden lg:block"
                  />

                  <motion.div
                    style={{ width: state.inspectorWidth }}
                    className="hidden lg:block"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Inspector activeTab={state.activeTab} sessionId={state.activeSessionId} />
                  </motion.div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

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
