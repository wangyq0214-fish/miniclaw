/**
 * Mini-OpenClaw State Management
 *
 * React Context-based state management for:
 * - Sessions and messages
 * - UI state (tabs, panel widths)
 * - Streaming status with abort support
 * - RAG mode
 * - LocalStorage persistence
 */
'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  listSessions,
  createSession,
  getSession,
  streamChat,
  getRagMode,
  setRagMode,
  deleteSession as apiDeleteSession,
  renameSession as apiRenameSession,
} from './api';

// LocalStorage keys
const STORAGE_KEYS = {
  activeSessionId: 'miniclaw_active_session',
  activeTab: 'miniclaw_active_tab',
  sidebarWidth: 'miniclaw_sidebar_width',
  inspectorWidth: 'miniclaw_inspector_width',
  ragModeEnabled: 'miniclaw_rag_mode',
};

// LocalStorage helpers
function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

// Types
export type TabId = 'learning-path' | 'resources' | 'mistakes';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  toolCalls?: ToolCall[];
  retrievals?: RetrievalResult[];
  isStreaming?: boolean;
}

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  id?: string;
}

export interface RetrievalResult {
  text: string;
  score: number;
  source: string;
}

export interface SessionInfo {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface AppState {
  // Sessions
  sessions: SessionInfo[];
  activeSessionId: string;
  isLoadingSessions: boolean;

  // Messages
  messages: Message[];
  isLoadingMessages: boolean;

  // UI State
  activeTab: TabId;
  activeFilePath: string | null;
  sidebarWidth: number;
  inspectorWidth: number;

  // Streaming State
  isStreaming: boolean;
  currentStreamingContent: string;

  // RAG Mode
  ragModeEnabled: boolean;

  // Errors
  error: string | null;
}

// Initial State — SSR-safe: always use hardcoded defaults here.
const initialState: AppState = {
  sessions: [],
  activeSessionId: 'main_session',
  isLoadingSessions: false,
  messages: [],
  isLoadingMessages: false,
  activeTab: 'learning-path',
  activeFilePath: null,
  sidebarWidth: 256,
  inspectorWidth: 384,
  isStreaming: false,
  currentStreamingContent: '',
  ragModeEnabled: false,
  error: null,
};

// Action Types
type Action =
  | { type: 'SET_SESSIONS'; payload: SessionInfo[] }
  | { type: 'SET_ACTIVE_SESSION'; payload: string }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<Message> } }
  | { type: 'REMOVE_MESSAGE'; payload: string }
  | { type: 'SET_ACTIVE_TAB'; payload: TabId }
  | { type: 'SET_ACTIVE_FILE'; payload: string | null }
  | { type: 'SET_SIDEBAR_WIDTH'; payload: number }
  | { type: 'SET_INSPECTOR_WIDTH'; payload: number }
  | { type: 'SET_STREAMING'; payload: boolean }
  | { type: 'SET_STREAMING_CONTENT'; payload: string }
  | { type: 'APPEND_STREAMING_CONTENT'; payload: string }
  | { type: 'SET_RAG_MODE'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING_SESSIONS'; payload: boolean }
  | { type: 'SET_LOADING_MESSAGES'; payload: boolean };

// Reducer
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SESSIONS':
      return { ...state, sessions: action.payload };

    case 'SET_ACTIVE_SESSION':
      saveToStorage(STORAGE_KEYS.activeSessionId, action.payload);
      return { ...state, activeSessionId: action.payload };

    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };

    case 'UPDATE_MESSAGE': {
      const { id, updates } = action.payload;
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === id ? { ...msg, ...updates } : msg
        ),
      };
    }

    case 'REMOVE_MESSAGE':
      return {
        ...state,
        messages: state.messages.filter((m) => m.id !== action.payload),
      };

    case 'SET_ACTIVE_TAB':
      saveToStorage(STORAGE_KEYS.activeTab, action.payload);
      return { ...state, activeTab: action.payload };

    case 'SET_ACTIVE_FILE':
      return { ...state, activeFilePath: action.payload };

    case 'SET_SIDEBAR_WIDTH':
      saveToStorage(STORAGE_KEYS.sidebarWidth, action.payload);
      return { ...state, sidebarWidth: action.payload };

    case 'SET_INSPECTOR_WIDTH':
      saveToStorage(STORAGE_KEYS.inspectorWidth, action.payload);
      return { ...state, inspectorWidth: action.payload };

    case 'SET_STREAMING':
      return { ...state, isStreaming: action.payload };

    case 'SET_STREAMING_CONTENT':
      return { ...state, currentStreamingContent: action.payload };

    case 'APPEND_STREAMING_CONTENT':
      return {
        ...state,
        currentStreamingContent: state.currentStreamingContent + action.payload,
      };

    case 'SET_RAG_MODE':
      saveToStorage(STORAGE_KEYS.ragModeEnabled, action.payload);
      return { ...state, ragModeEnabled: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_LOADING_SESSIONS':
      return { ...state, isLoadingSessions: action.payload };

    case 'SET_LOADING_MESSAGES':
      return { ...state, isLoadingMessages: action.payload };

    default:
      return state;
  }
}

// Context
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  actions: {
    loadSessions: () => Promise<void>;
    selectSession: (sessionId: string) => Promise<void>;
    createNewSession: () => Promise<string>;
    deleteSession: (sessionId: string) => Promise<void>;
    renameSession: (sessionId: string, title: string) => Promise<void>;
    sendMessage: (message: string) => Promise<void>;
    stopStreaming: () => void;
    regenerateLastAssistant: () => Promise<void>;
    setActiveTab: (tab: TabId) => void;
    setActiveFile: (path: string | null) => void;
    toggleRagMode: () => Promise<void>;
    setSidebarWidth: (width: number) => void;
    setInspectorWidth: (width: number) => void;
  };
}

const AppContext = createContext<AppContextType | null>(null);

// Provider
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>('');

  // Rehydrate persisted UI state from localStorage after first client render
  useEffect(() => {
    const savedSession = loadFromStorage(STORAGE_KEYS.activeSessionId, 'main_session');
    const savedTab = loadFromStorage<TabId>(STORAGE_KEYS.activeTab, 'learning-path');
    const savedSidebarWidth = loadFromStorage(STORAGE_KEYS.sidebarWidth, 256);
    const savedInspectorWidth = loadFromStorage(STORAGE_KEYS.inspectorWidth, 384);

    dispatch({ type: 'SET_ACTIVE_SESSION', payload: savedSession });
    dispatch({ type: 'SET_ACTIVE_TAB', payload: savedTab });
    dispatch({ type: 'SET_SIDEBAR_WIDTH', payload: savedSidebarWidth });
    dispatch({ type: 'SET_INSPECTOR_WIDTH', payload: savedInspectorWidth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load RAG mode on mount
  useEffect(() => {
    getRagMode()
      .then((data) => dispatch({ type: 'SET_RAG_MODE', payload: data.enabled }))
      .catch(() => {});
  }, []);

  const loadSessions = useCallback(async () => {
    dispatch({ type: 'SET_LOADING_SESSIONS', payload: true });
    try {
      const sessions = await listSessions();
      dispatch({ type: 'SET_SESSIONS', payload: sessions });
    } catch (error) {
      console.error('Failed to load sessions:', error);
      toast.error('加载会话列表失败，请检查后端服务');
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load sessions' });
    } finally {
      dispatch({ type: 'SET_LOADING_SESSIONS', payload: false });
    }
  }, []);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load messages when active session changes
  useEffect(() => {
    const loadSessionMessages = async (sessionId: string) => {
      dispatch({ type: 'SET_LOADING_MESSAGES', payload: true });
      try {
        const session = await getSession(sessionId);
        const messages: Message[] = session.messages.map((msg, index) => ({
          id: `${sessionId}-${index}`,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.timestamp,
          toolCalls: msg.tool_calls as ToolCall[] | undefined,
        }));
        dispatch({ type: 'SET_MESSAGES', payload: messages });
      } catch (error) {
        console.error('Failed to load messages:', error);
        dispatch({ type: 'SET_MESSAGES', payload: [] });
      } finally {
        dispatch({ type: 'SET_LOADING_MESSAGES', payload: false });
      }
    };
    if (state.activeSessionId) {
      loadSessionMessages(state.activeSessionId);
    }
  }, [state.activeSessionId]);

  const sendMessageImpl = useCallback(
    async (message: string) => {
      lastUserMessageRef.current = message;

      const userMessageId = `${state.activeSessionId}-user-${Date.now()}`;
      const assistantMessageId = `${state.activeSessionId}-assistant-${Date.now()}`;

      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
        toolCalls: [],
        retrievals: [],
      };
      dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });

      dispatch({ type: 'SET_STREAMING', payload: true });
      dispatch({ type: 'SET_STREAMING_CONTENT', payload: '' });

      let currentContent = '';
      const currentToolCalls: ToolCall[] = [];
      let currentRetrievals: RetrievalResult[] = [];

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        for await (const event of streamChat(
          { message, session_id: state.activeSessionId, stream: true },
          controller.signal,
        )) {
          const eventType = (event as Record<string, unknown>).type as string;

          if (eventType === 'token') {
            const content = (event as Record<string, unknown>).content as string;
            currentContent += content;
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: { id: assistantMessageId, updates: { content: currentContent } },
            });
          } else if (eventType === 'tool_start') {
            const tool = (event as Record<string, unknown>).tool as string;
            const input = (event as Record<string, unknown>).input as Record<string, unknown>;
            currentToolCalls.push({
              tool,
              input,
              output: '',
              id: (event as Record<string, unknown>).id as string,
            });
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                id: assistantMessageId,
                updates: { toolCalls: [...currentToolCalls] },
              },
            });
          } else if (eventType === 'tool_end') {
            const tool = (event as Record<string, unknown>).tool as string;
            const output = (event as Record<string, unknown>).output as string;
            const endId = (event as Record<string, unknown>).id as string | undefined;
            const toolCall = endId
              ? currentToolCalls.find((tc) => tc.id === endId) ?? currentToolCalls.find((tc) => tc.tool === tool)
              : currentToolCalls.find((tc) => tc.tool === tool);
            if (toolCall) toolCall.output = output;
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                id: assistantMessageId,
                updates: { toolCalls: [...currentToolCalls] },
              },
            });
          } else if (eventType === 'retrieval') {
            const results = (event as Record<string, unknown>).results as RetrievalResult[];
            currentRetrievals = results;
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: { id: assistantMessageId, updates: { retrievals: results } },
            });
          } else if (eventType === 'new_response') {
            currentContent = '';
          } else if (eventType === 'done') {
            const finalContent = (event as Record<string, unknown>).content as string;
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                id: assistantMessageId,
                updates: {
                  content: finalContent || currentContent,
                  isStreaming: false,
                  toolCalls: currentToolCalls,
                  retrievals: currentRetrievals,
                },
              },
            });
          } else if (eventType === 'title') {
            loadSessions();
          } else if (eventType === 'error') {
            const error = (event as Record<string, unknown>).error as string;
            toast.error(`Agent 错误：${error}`);
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                id: assistantMessageId,
                updates: { content: `错误：${error}`, isStreaming: false },
              },
            });
          }
        }
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AbortError') {
          // User-initiated stop — keep whatever we streamed so far
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: {
              id: assistantMessageId,
              updates: {
                content: currentContent || '（已停止生成）',
                isStreaming: false,
                toolCalls: currentToolCalls,
                retrievals: currentRetrievals,
              },
            },
          });
        } else {
          console.error('Streaming error:', error);
          toast.error('请求失败，请确认后端服务运行');
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: {
              id: assistantMessageId,
              updates: {
                content: '抱歉，发生错误。请确保后端服务正在运行。',
                isStreaming: false,
              },
            },
          });
        }
      } finally {
        dispatch({ type: 'SET_STREAMING', payload: false });
        abortControllerRef.current = null;
        loadSessions();
      }
    },
    [state.activeSessionId, loadSessions],
  );

  const actions: AppContextType['actions'] = {
    loadSessions,

    selectSession: async (sessionId: string) => {
      dispatch({ type: 'SET_ACTIVE_SESSION', payload: sessionId });
    },

    createNewSession: async () => {
      const id = `session_${Date.now()}`;
      try {
        await createSession(id);
        await loadSessions();
        dispatch({ type: 'SET_ACTIVE_SESSION', payload: id });
        return id;
      } catch (error) {
        console.error('Failed to create session:', error);
        toast.error('新建会话失败');
        dispatch({ type: 'SET_ERROR', payload: 'Failed to create session' });
        return '';
      }
    },

    deleteSession: async (sessionId: string) => {
      try {
        await apiDeleteSession(sessionId);
        const remaining = state.sessions.filter((s) => s.session_id !== sessionId);
        dispatch({ type: 'SET_SESSIONS', payload: remaining });
        if (state.activeSessionId === sessionId) {
          if (remaining.length > 0) {
            dispatch({ type: 'SET_ACTIVE_SESSION', payload: remaining[0].session_id });
          } else {
            const newId = `session_${Date.now()}`;
            await createSession(newId);
            dispatch({ type: 'SET_ACTIVE_SESSION', payload: newId });
          }
        }
        await loadSessions();
        toast.success('已删除会话');
      } catch (error) {
        console.error('Failed to delete session:', error);
        toast.error('删除会话失败');
      }
    },

    renameSession: async (sessionId: string, title: string) => {
      try {
        await apiRenameSession(sessionId, title);
        await loadSessions();
        toast.success('已重命名');
      } catch (error) {
        console.error('Failed to rename session:', error);
        toast.error('重命名失败');
      }
    },

    sendMessage: sendMessageImpl,

    stopStreaming: () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    },

    regenerateLastAssistant: async () => {
      // Remove the last assistant message (if any), then resend the last user prompt
      const msgs = state.messages;
      if (msgs.length === 0) return;
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
      if (!lastUser) return;
      if (lastAssistant) {
        dispatch({ type: 'REMOVE_MESSAGE', payload: lastAssistant.id });
      }
      // Also remove the trailing user echo because sendMessage will re-add it
      dispatch({ type: 'REMOVE_MESSAGE', payload: lastUser.id });
      await sendMessageImpl(lastUser.content);
    },

    setActiveTab: (tab: TabId) => {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: tab });
    },

    setActiveFile: (path: string | null) => {
      dispatch({ type: 'SET_ACTIVE_FILE', payload: path });
    },

    toggleRagMode: async () => {
      try {
        const newMode = !state.ragModeEnabled;
        await setRagMode(newMode);
        dispatch({ type: 'SET_RAG_MODE', payload: newMode });
      } catch (error) {
        console.error('Failed to toggle RAG mode:', error);
        toast.error('RAG 模式切换失败');
      }
    },

    setSidebarWidth: (width: number) => {
      dispatch({ type: 'SET_SIDEBAR_WIDTH', payload: width });
    },

    setInspectorWidth: (width: number) => {
      dispatch({ type: 'SET_INSPECTOR_WIDTH', payload: width });
    },
  };

  return (
    <AppContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
