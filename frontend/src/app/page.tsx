'use client';

import { AppProvider, useApp } from '@/lib/store';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChatView } from '@/components/chat/ChatView';
import { Inspector } from '@/components/layout/Inspector';

function MainContent() {
  const { state, actions } = useApp();

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 bg-white/80 backdrop-blur-xl border-b border-gray-200/50 flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded-lg" />
          <span className="font-semibold text-gray-800">Mini OpenClaw</span>
        </div>
        <button
          onClick={actions.toggleRagMode}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            state.ragModeEnabled
              ? 'bg-purple-100 text-purple-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          RAG {state.ragModeEnabled ? 'ON' : 'OFF'}
        </button>
      </header>

      {/* Main Content - Three Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div style={{ width: state.sidebarWidth }}>
          <Sidebar
            activeTab={state.activeTab}
            onTabChange={actions.setActiveTab}
            sessions={state.sessions}
            activeSession={state.activeSessionId}
            onSessionSelect={actions.selectSession}
            onNewSession={actions.createNewSession}
          />
        </div>

        {/* Center Stage */}
        <div className="flex-1 flex flex-col">
          <ChatView
            sessionId={state.activeSessionId}
            messages={state.messages}
            onSendMessage={actions.sendMessage}
            isLoading={state.isStreaming}
          />
        </div>

        {/* Right Inspector */}
        <div style={{ width: state.inspectorWidth }}>
          <Inspector activeTab={state.activeTab} sessionId={state.activeSessionId} />
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
