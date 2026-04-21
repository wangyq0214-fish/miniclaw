'use client';

import { AppProvider, useApp } from '@/lib/store';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChatView } from '@/components/chat/ChatView';
import { Inspector } from '@/components/layout/Inspector';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useGlobalHotkeys } from '@/hooks/useHotkeys';

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

  useGlobalHotkeys({
    onNewSession: actions.createNewSession,
    onFocusComposer: () => {
      window.dispatchEvent(new Event('miniclaw:focus-composer'));
    },
    onStopStreaming: () => {
      if (state.isStreaming) actions.stopStreaming();
    },
  });

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 bg-background/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary rounded-lg" />
          <span className="font-semibold text-foreground">Mini OpenClaw</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content - Three Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
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

        {/* Center Inspector (fixed width) */}
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

        {/* Right Chat (flex) */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatView
            sessionId={state.activeSessionId}
            messages={state.messages}
            onSendMessage={actions.sendMessage}
            isLoading={state.isStreaming}
          />
        </div>
      </div>
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
