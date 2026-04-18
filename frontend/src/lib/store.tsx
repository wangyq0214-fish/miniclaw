/**
 * Mini-OpenClaw State Management
 *
 * React Context-based state management for:
 * - Sessions and messages
 * - UI state (tabs, panel widths)
 * - Streaming status
 * - RAG mode
 * - LocalStorage persistence
 */
'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import {
  listSessions,
  createSession,
  getSession,
  streamChat,
  getRagMode,
  setRagMode,
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
  activeTab: 'chat' | 'memory' | 'skills';
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
// localStorage values are synced on the client after mount (see useEffect in AppProvider).
const initialState: AppState = {
  sessions: [],
  activeSessionId: 'main_session',
  isLoadingSessions: false,
  messages: [],
  isLoadingMessages: false,
  activeTab: 'chat',
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
  | { type: 'SET_ACTIVE_TAB'; payload: 'chat' | 'memory' | 'skills' }
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

    case 'SET_ACTIVE_TAB':
      saveToStorage(STORAGE_KEYS.activeTab, action.payload);
      return { ...state, activeTab: action.payload };

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
    sendMessage: (message: string) => Promise<void>;
    setActiveTab: (tab: 'chat' | 'memory' | 'skills') => void;
    toggleRagMode: () => Promise<void>;
    setSidebarWidth: (width: number) => void;
    setInspectorWidth: (width: number) => void;
  };
}

const AppContext = createContext<AppContextType | null>(null);

// Provider
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Rehydrate persisted UI state from localStorage after first client render
  useEffect(() => {
    const savedSession = loadFromStorage(STORAGE_KEYS.activeSessionId, 'main_session');
    const savedTab = loadFromStorage<'chat' | 'memory' | 'skills'>(STORAGE_KEYS.activeTab, 'chat');
    const savedSidebarWidth = loadFromStorage(STORAGE_KEYS.sidebarWidth, 256);
    const savedInspectorWidth = loadFromStorage(STORAGE_KEYS.inspectorWidth, 384);
    const savedRagMode = loadFromStorage(STORAGE_KEYS.ragModeEnabled, false);

    dispatch({ type: 'SET_ACTIVE_SESSION', payload: savedSession });
    dispatch({ type: 'SET_ACTIVE_TAB', payload: savedTab });
    dispatch({ type: 'SET_SIDEBAR_WIDTH', payload: savedSidebarWidth });
    dispatch({ type: 'SET_INSPECTOR_WIDTH', payload: savedInspectorWidth });
    // Note: ragMode is synced from backend API in the next useEffect, not from localStorage
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load RAG mode on mount
  useEffect(() => {
    getRagMode()
      .then((data) => dispatch({ type: 'SET_RAG_MODE', payload: data.enabled }))
      .catch(() => {});
  }, []);

  // Load sessions on mount
  useEffect(() => {
    actions.loadSessions();
  }, []);

  // Load messages when active session changes
  useEffect(() => {
    if (state.activeSessionId) {
      loadSessionMessages(state.activeSessionId);
    }
  }, [state.activeSessionId]);

  const loadSessionMessages = async (sessionId: string) => {
    dispatch({ type: 'SET_LOADING_MESSAGES', payload: true });
    try {
      const session = await getSession(sessionId);
      const messages: Message[] = session.messages.map((msg, index) => ({
        id: `${sessionId}-${index}`,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp,
        toolCalls: msg.tool_calls,
      }));
      dispatch({ type: 'SET_MESSAGES', payload: messages });
    } catch (error) {
      console.error('Failed to load messages:', error);
      dispatch({ type: 'SET_MESSAGES', payload: [] });
    } finally {
      dispatch({ type: 'SET_LOADING_MESSAGES', payload: false });
    }
  };

  const actions = {
    loadSessions: async () => {
      dispatch({ type: 'SET_LOADING_SESSIONS', payload: true });
      try {
        const sessions = await listSessions();
        dispatch({ type: 'SET_SESSIONS', payload: sessions });
      } catch (error) {
        console.error('Failed to load sessions:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to load sessions' });
      } finally {
        dispatch({ type: 'SET_LOADING_SESSIONS', payload: false });
      }
    },

    selectSession: async (sessionId: string) => {
      dispatch({ type: 'SET_ACTIVE_SESSION', payload: sessionId });
    },

    createNewSession: async () => {
      const id = `session_${Date.now()}`;
      try {
        await createSession(id);
        await actions.loadSessions();
        dispatch({ type: 'SET_ACTIVE_SESSION', payload: id });
        return id;
      } catch (error) {
        console.error('Failed to create session:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to create session' });
        return '';
      }
    },

    sendMessage: async (message: string) => {
      const userMessageId = `${state.activeSessionId}-user-${Date.now()}`;
      const assistantMessageId = `${state.activeSessionId}-assistant-${Date.now()}`;

      // Add user message
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

      // Add placeholder assistant message
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

      // Start streaming
      dispatch({ type: 'SET_STREAMING', payload: true });
      dispatch({ type: 'SET_STREAMING_CONTENT', payload: '' });

      let currentContent = '';
      let currentToolCalls: ToolCall[] = [];
      let currentRetrievals: RetrievalResult[] = [];

      try {
        for await (const event of streamChat({
          message,
          session_id: state.activeSessionId,
          stream: true,
        })) {
          const eventType = (event as Record<string, unknown>).type as string;

          if (eventType === 'token') {
            const content = (event as Record<string, unknown>).content as string;
            currentContent += content;
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                id: assistantMessageId,
                updates: { content: currentContent },
              },
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
            // Match by id first, fall back to tool name
            const toolCall = endId
              ? currentToolCalls.find((tc) => tc.id === endId) ?? currentToolCalls.find((tc) => tc.tool === tool)
              : currentToolCalls.find((tc) => tc.tool === tool);
            if (toolCall) {
              toolCall.output = output;
            }
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
              payload: {
                id: assistantMessageId,
                updates: { retrievals: results },
              },
            });
          } else if (eventType === 'new_response') {
            // Start a new segment after tool call
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
            // Refresh sessions to get updated title
            actions.loadSessions();
          } else if (eventType === 'error') {
            const error = (event as Record<string, unknown>).error as string;
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                id: assistantMessageId,
                updates: {
                  content: `Error: ${error}`,
                  isStreaming: false,
                },
              },
            });
          }
        }
      } catch (error) {
        console.error('Streaming error:', error);
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
      } finally {
        dispatch({ type: 'SET_STREAMING', payload: false });
        actions.loadSessions();
      }
    },

    setActiveTab: (tab: 'chat' | 'memory' | 'skills') => {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: tab });
    },

    toggleRagMode: async () => {
      try {
        const newMode = !state.ragModeEnabled;
        await setRagMode(newMode);
        dispatch({ type: 'SET_RAG_MODE', payload: newMode });
      } catch (error) {
        console.error('Failed to toggle RAG mode:', error);
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
