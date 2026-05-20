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
  streamSubagent,
  getRagMode,
  setRagMode,
  deleteSession as apiDeleteSession,
  renameSession as apiRenameSession,
  listNotes,
  createNote,
  type NoteItem,
  type GraphNode,
  type GraphData,
} from './api';
import { logChatMessage } from './learningEvents';

// Generating task type
export interface GeneratingTask {
  id: string;
  category: string;
  categoryLabel: string;
  prompt: string;
  status: 'generating' | 'completed' | 'error';
  error?: string;
  startedAt: number;
}

// LocalStorage keys (base names — suffixed with user ID at runtime)
const STORAGE_KEYS = {
  activeSessionId: 'miniclaw_active_session',
  activeTab: 'miniclaw_active_tab',
  sidebarWidth: 'miniclaw_sidebar_width',
  inspectorWidth: 'miniclaw_inspector_width',
  ragModeEnabled: 'miniclaw_rag_mode',
};

// User-scoped localStorage helpers
function userSuffix(): string {
  if (typeof window === 'undefined') return '';
  const uid = localStorage.getItem('miniclaw_user_id');
  return uid ? `_${uid}` : '';
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(key + userSuffix());
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key + userSuffix(), JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

function removeFromStorage(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key + userSuffix());
}

// Types
export type TabId = 'learning-path' | 'resources' | 'mistakes' | 'knowledge-graph' | 'notes' | 'dashboard';

export interface NotesChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

// Module-level refs for notes generation (survives component unmounts)
const _notesDispatchRef = { current: null as React.Dispatch<Action> | null };
const _notesGetStateRef = { current: (() => ({} as AppState)) as () => AppState };
const _notesAbortRef = { current: null as AbortController | null };
const _notesGeneratorRef = { current: null as AsyncGenerator<unknown, void, unknown> | null };

export function bindNotesStore(dispatch: React.Dispatch<Action>, getState: () => AppState) {
  _notesDispatchRef.current = dispatch;
  _notesGetStateRef.current = getState;
}

export interface StatusEntry {
  message: string;
  time: number;
}

export interface PipelineStage {
  id: number;
  label: string;
  status: 'pending' | 'running' | 'done' | 'fail';
  startTime?: number;
  endTime?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  toolCalls?: ToolCall[];
  retrievals?: RetrievalResult[];
  isStreaming?: boolean;
  statusMessages?: StatusEntry[];
  pipelineStages?: PipelineStage[];
}

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  id?: string;
  status?: 'running' | 'completed';
  startTime?: number;
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

  // Knowledge Graph
  selectedGraphNode: GraphNode | null;
  graphData: GraphData | null;
  isTraceback: boolean;
  toggleExpandNodeCallback: ((node: GraphNode) => void) | null;

  // File refresh trigger
  filesVersion: number;

  // Quiz generation state
  isGeneratingQuiz: boolean;

  // Resource generation tasks (persistent across navigation)
  generatingTasks: GeneratingTask[];

  // Coder mode — code loaded from subagent into Inspector
  coderCode: string;
  coderFilename: string;
  coderProjectPath: string; // e.g. "workspace/generated/code-cases/my-project"

  // Notes view state (persists across mount/unmount)
  notesChatMessages: NotesChatMessage[];
  notes: NoteItem[];
  notesGeneratingLabel: string | null;
  isNotesStreaming: boolean;
}

// Initial State — SSR-safe: always use hardcoded defaults here.
const initialState: AppState = {
  sessions: [],
  activeSessionId: '',
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
  selectedGraphNode: null,
  graphData: null,
  isTraceback: false,
  toggleExpandNodeCallback: null,
  filesVersion: 0,
  isGeneratingQuiz: false,
  generatingTasks: [],
  coderCode: '',
  coderFilename: '',
  coderProjectPath: '',
  notesChatMessages: [],
  notes: [],
  notesGeneratingLabel: null,
  isNotesStreaming: false,
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
  | { type: 'SET_LOADING_MESSAGES'; payload: boolean }
  | { type: 'SET_SELECTED_GRAPH_NODE'; payload: GraphNode | null }
  | { type: 'SET_GRAPH_DATA'; payload: GraphData | null }
  | { type: 'SET_IS_TRACEBACK'; payload: boolean }
  | { type: 'SET_TOGGLE_EXPAND_NODE_CALLBACK'; payload: ((node: GraphNode) => void) | null }
  | { type: 'INCREMENT_FILES_VERSION' }
  | { type: 'SET_IS_GENERATING_QUIZ'; payload: boolean }
  | { type: 'ADD_GENERATING_TASK'; payload: GeneratingTask }
  | { type: 'UPDATE_GENERATING_TASK'; payload: { id: string; updates: Partial<GeneratingTask> } }
  | { type: 'REMOVE_GENERATING_TASK'; payload: string }
  | { type: 'SET_CODER_CODE'; payload: { code: string; filename: string } }
  | { type: 'SET_CODER_PROJECT_PATH'; payload: string }
  | { type: 'SET_NOTES_CHAT_MESSAGES'; payload: NotesChatMessage[] }
  | { type: 'ADD_NOTES_CHAT_MESSAGE'; payload: NotesChatMessage }
  | { type: 'UPDATE_NOTES_CHAT_MESSAGE'; payload: { id: string; updates: Partial<NotesChatMessage> } }
  | { type: 'SET_NOTES'; payload: NoteItem[] }
  | { type: 'ADD_NOTE'; payload: NoteItem }
  | { type: 'SET_NOTES_GENERATING_LABEL'; payload: string | null }
  | { type: 'SET_IS_NOTES_STREAMING'; payload: boolean };

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

    case 'SET_SELECTED_GRAPH_NODE':
      return { ...state, selectedGraphNode: action.payload };

    case 'SET_GRAPH_DATA':
      return { ...state, graphData: action.payload };

    case 'SET_IS_TRACEBACK':
      return { ...state, isTraceback: action.payload };

    case 'SET_TOGGLE_EXPAND_NODE_CALLBACK':
      return { ...state, toggleExpandNodeCallback: action.payload };

    case 'INCREMENT_FILES_VERSION':
      return { ...state, filesVersion: state.filesVersion + 1 };

    case 'SET_IS_GENERATING_QUIZ':
      return { ...state, isGeneratingQuiz: action.payload };

    case 'ADD_GENERATING_TASK':
      return { ...state, generatingTasks: [...state.generatingTasks, action.payload] };

    case 'UPDATE_GENERATING_TASK':
      return {
        ...state,
        generatingTasks: state.generatingTasks.map(t =>
          t.id === action.payload.id ? { ...t, ...action.payload.updates } : t
        ),
      };

    case 'REMOVE_GENERATING_TASK':
      return {
        ...state,
        generatingTasks: state.generatingTasks.filter(t => t.id !== action.payload),
      };

    case 'SET_CODER_CODE':
      return { ...state, coderCode: action.payload.code, coderFilename: action.payload.filename };

    case 'SET_CODER_PROJECT_PATH':
      return { ...state, coderProjectPath: action.payload };

    case 'SET_NOTES_CHAT_MESSAGES':
      return { ...state, notesChatMessages: action.payload };
    case 'ADD_NOTES_CHAT_MESSAGE':
      return { ...state, notesChatMessages: [...state.notesChatMessages, action.payload] };
    case 'UPDATE_NOTES_CHAT_MESSAGE':
      return {
        ...state,
        notesChatMessages: state.notesChatMessages.map(m =>
          m.id === action.payload.id ? { ...m, ...action.payload.updates } : m
        ),
      };
    case 'SET_NOTES':
      return { ...state, notes: action.payload };
    case 'ADD_NOTE':
      return { ...state, notes: [action.payload, ...state.notes] };
    case 'SET_NOTES_GENERATING_LABEL':
      return { ...state, notesGeneratingLabel: action.payload };
    case 'SET_IS_NOTES_STREAMING':
      return { ...state, isNotesStreaming: action.payload };

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
    setSelectedGraphNode: (node: GraphNode | null) => void;
    setGraphData: (data: GraphData | null) => void;
    setIsTraceback: (value: boolean) => void;
    setToggleExpandNodeCallback: (cb: ((node: GraphNode) => void) | null) => void;
    setIsGeneratingQuiz: (value: boolean) => void;
    addGeneratingTask: (task: GeneratingTask) => void;
    updateGeneratingTask: (id: string, updates: Partial<GeneratingTask>) => void;
    removeGeneratingTask: (id: string) => void;
    incrementFilesVersion: () => void;
    loadCodeToInspector: (code: string, filename: string) => void;
    setCoderProjectPath: (path: string) => void;
    setNotesChatMessages: (msgs: NotesChatMessage[]) => void;
    addNotesChatMessage: (msg: NotesChatMessage) => void;
    updateNotesChatMessage: (id: string, updates: Partial<NotesChatMessage>) => void;
    setNotes: (notes: NoteItem[]) => void;
    addNote: (note: NoteItem) => void;
    setNotesGeneratingLabel: (label: string | null) => void;
    setIsNotesStreaming: (v: boolean) => void;
    stopNotesGeneration: () => void;
    startNotesGeneration: (params: {
      prompt: string;
      subagent: string;
      label: string;
      contextPrefix?: string;
    }) => void;
    loadNotes: () => Promise<void>;
  };
}

const AppContext = createContext<AppContextType | null>(null);

// Provider
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>('');
  // Per-session message cache: survives session switches without losing in-flight streams
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());
  // Track which session ID is currently being streamed to (may differ from activeSessionId after switch)
  const streamingSessionIdRef = useRef<string | null>(null);
  // Keep a ref to activeSessionId so closures can read the latest value
  const activeSessionIdRef = useRef(state.activeSessionId);
  useEffect(() => { activeSessionIdRef.current = state.activeSessionId; }, [state.activeSessionId]);

  // Rehydrate persisted UI state from localStorage after first client render
  useEffect(() => {
    // Don't load saved session yet - wait for session list to load first
    const savedTab = loadFromStorage<TabId>(STORAGE_KEYS.activeTab, 'learning-path');
    const savedSidebarWidth = loadFromStorage(STORAGE_KEYS.sidebarWidth, 256);
    const savedInspectorWidth = loadFromStorage(STORAGE_KEYS.inspectorWidth, 384);

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
      dispatch({ type: 'SET_SESSIONS', payload: sessions || [] });

      // After loading sessions, check if saved session exists
      const savedSessionId = loadFromStorage(STORAGE_KEYS.activeSessionId, '');
      if (savedSessionId && sessions && sessions.length > 0) {
        const sessionExists = sessions.some(s => s.session_id === savedSessionId);
        if (sessionExists) {
          // Saved session exists, restore it
          dispatch({ type: 'SET_ACTIVE_SESSION', payload: savedSessionId });
        } else {
          // Saved session doesn't exist, clear it
          removeFromStorage(STORAGE_KEYS.activeSessionId);
        }
      } else if (savedSessionId) {
        // No sessions exist but there's a saved ID, clear it
        removeFromStorage(STORAGE_KEYS.activeSessionId);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      toast.error('加载会话列表失败，请检查登录状态');
      dispatch({ type: 'SET_SESSIONS', payload: [] });
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load sessions' });
    } finally {
      dispatch({ type: 'SET_LOADING_SESSIONS', payload: false });
    }
  }, []);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load messages when active session changes (with per-session cache)
  useEffect(() => {
    const loadSessionMessages = async (sessionId: string) => {
      // Check if session exists in the sessions list before loading
      const sessionExists = state.sessions.some(s => s.session_id === sessionId);
      if (!sessionExists && state.sessions.length > 0) {
        console.warn(`Session ${sessionId} not found in sessions list, clearing...`);
        dispatch({ type: 'SET_ACTIVE_SESSION', payload: '' });
        removeFromStorage(STORAGE_KEYS.activeSessionId);
        return;
      }

      // Check cache first — avoids clobbering in-flight streaming messages
      const cached = messagesCacheRef.current.get(sessionId);
      if (cached) {
        dispatch({ type: 'SET_MESSAGES', payload: cached });
        return;
      }

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
        messagesCacheRef.current.set(sessionId, messages);
        dispatch({ type: 'SET_MESSAGES', payload: messages });
      } catch (error) {
        console.error('Failed to load messages:', error);
        if (error instanceof Error && error.message.includes('Not Found')) {
          dispatch({ type: 'SET_ACTIVE_SESSION', payload: '' });
          removeFromStorage(STORAGE_KEYS.activeSessionId);
          toast.error('会话不存在，请创建新会话');
        }
        dispatch({ type: 'SET_MESSAGES', payload: [] });
      } finally {
        dispatch({ type: 'SET_LOADING_MESSAGES', payload: false });
      }
    };
    if (state.activeSessionId) {
      loadSessionMessages(state.activeSessionId);
    }
  }, [state.activeSessionId, state.sessions]);

  const sendMessageImpl = useCallback(
    async (message: string) => {
      lastUserMessageRef.current = message;

      // Log chat message for learning analytics
      logChatMessage({
        messageLength: message.length,
        preview: message,
        sessionId: state.activeSessionId,
      });

      // Capture the session this stream belongs to (may differ from activeSessionId after switch)
      const streamSessionId = state.activeSessionId;
      streamingSessionIdRef.current = streamSessionId;

      const userMessageId = `${streamSessionId}-user-${Date.now()}`;
      const assistantMessageId = `${streamSessionId}-assistant-${Date.now()}`;

      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };

      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
        toolCalls: [],
        retrievals: [],
      };

      // Local copy of this session's messages — stays valid across session switches
      let sessionMessages = [
        ...(messagesCacheRef.current.get(streamSessionId) || state.messages),
        userMessage,
        assistantMessage,
      ];
      messagesCacheRef.current.set(streamSessionId, sessionMessages);

      // Only dispatch to state if user is currently viewing this session
      if (activeSessionIdRef.current === streamSessionId) {
        dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
        dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
      }

      dispatch({ type: 'SET_STREAMING', payload: true });
      dispatch({ type: 'SET_STREAMING_CONTENT', payload: '' });

      // Also show the new messages in UI if user is viewing this session
      // (ADD_MESSAGE was already dispatched above if activeSession matches)

      let currentContent = '';
      const currentToolCalls: ToolCall[] = [];
      let currentRetrievals: RetrievalResult[] = [];
      const currentStatusMessages: StatusEntry[] = [];
      const currentPipelineStages: PipelineStage[] = [
        { id: 1, label: '概念分析', status: 'pending' },
        { id: 2, label: '概念设计', status: 'pending' },
        { id: 3, label: '代码生成', status: 'pending' },
        { id: 4, label: '渲染视频', status: 'pending' },
        { id: 5, label: '生成总结', status: 'pending' },
      ];
      let hasPipelineEvents = false;

      // Helper: update assistant message in cache + optionally in state
      const updateAssistant = (updates: Partial<Message>) => {
        sessionMessages = sessionMessages.map((msg) =>
          msg.id === assistantMessageId ? { ...msg, ...updates } : msg,
        );
        messagesCacheRef.current.set(streamSessionId, sessionMessages);
        // Only dispatch to UI if user is currently viewing this session
        if (activeSessionIdRef.current === streamSessionId) {
          dispatch({ type: 'UPDATE_MESSAGE', payload: { id: assistantMessageId, updates } });
        }
      };

      const SUBAGENT_TOOL_LABELS: Record<string, string> = {
        read_file: '查阅资料',
        write_file: '保存内容',
        generate_manim_video: '生成教学视频',
        get_entity_graph: '查询知识图谱',
        generate_lecture: '生成讲义',
        generate_exercises: '出练习题',
        generate_flashcards: '生成抽认卡',
        generate_mindmap: '生成思维导图',
        generate_code_case: '生成代码案例',
        generate_reading_list: '生成阅读清单',
        generate_media_script: '生成视频脚本',
      };

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        for await (const event of streamChat(
          { message, session_id: streamSessionId, stream: true },
          controller.signal,
        )) {
          const eventType = (event as Record<string, unknown>).type as string;

          if (eventType === 'token') {
            const content = (event as Record<string, unknown>).content as string;
            currentContent += content;
            updateAssistant({ content: currentContent });
          } else if (eventType === 'tool_start') {
            const tool = (event as Record<string, unknown>).tool as string;
            const input = (event as Record<string, unknown>).input as Record<string, unknown>;
            currentToolCalls.push({
              tool,
              input,
              output: '',
              id: (event as Record<string, unknown>).id as string,
              status: 'running',
              startTime: Date.now(),
            });
            updateAssistant({ toolCalls: [...currentToolCalls] });
          } else if (eventType === 'tool_end') {
            const tool = (event as Record<string, unknown>).tool as string;
            const output = (event as Record<string, unknown>).output as string;
            const endId = (event as Record<string, unknown>).id as string | undefined;
            const toolCall = endId
              ? currentToolCalls.find((tc) => tc.id === endId) ?? currentToolCalls.find((tc) => tc.tool === tool)
              : currentToolCalls.find((tc) => tc.tool === tool);
            if (toolCall) {
              toolCall.output = output;
              toolCall.status = 'completed';
            }
            updateAssistant({ toolCalls: [...currentToolCalls] });
          } else if (eventType === 'status') {
            const statusMsg = (event as Record<string, unknown>).message as string;
            if (statusMsg) {
              // Parse pipeline stage messages: pipeline:start:N:label / pipeline:done:N:msg / pipeline:fail:N:msg
              const pipelineMatch = statusMsg.match(/^pipeline:(start|done|fail):(\d+):(.+)$/);
              if (pipelineMatch) {
                const [, action, stageIdStr, detail] = pipelineMatch;
                const stageId = parseInt(stageIdStr, 10);
                const stage = currentPipelineStages.find((s) => s.id === stageId);
                if (stage) {
                  hasPipelineEvents = true;
                  if (action === 'start') {
                    stage.status = 'running';
                    stage.startTime = Date.now();
                  } else if (action === 'done') {
                    stage.status = 'done';
                    stage.endTime = Date.now();
                  } else if (action === 'fail') {
                    stage.status = 'fail';
                    stage.endTime = Date.now();
                  }
                  if (detail) stage.label = detail;
                  updateAssistant({ pipelineStages: [...currentPipelineStages] });
                }
              } else {
                // Non-pipeline status message — show in timeline
                currentStatusMessages.push({ message: statusMsg, time: Date.now() });
                updateAssistant({ statusMessages: [...currentStatusMessages] });
              }
            }
          } else if (eventType === 'subagent_tool_start') {
            const subTool = (event as Record<string, unknown>).tool as string;
            const subAgent = (event as Record<string, unknown>).subagent as string;
            const subLabel = SUBAGENT_TOOL_LABELS[subTool] || `调用 ${subTool}`;
            currentStatusMessages.push({ message: `${subAgent}: ${subLabel}`, time: Date.now() });
            updateAssistant({ statusMessages: [...currentStatusMessages] });
          } else if (eventType === 'subagent_token') {
            const tokenContent = (event as Record<string, unknown>).content as string;
            if (tokenContent) {
              currentContent += tokenContent;
              updateAssistant({ content: currentContent });
            }
          } else if (eventType === 'retrieval') {
            const results = (event as Record<string, unknown>).results as RetrievalResult[];
            currentRetrievals = results;
            updateAssistant({ retrievals: results });
          } else if (eventType === 'new_response') {
            currentContent = '';
          } else if (eventType === 'done') {
            const finalContent = (event as Record<string, unknown>).content as string;
            for (const tc of currentToolCalls) {
              if (tc.status === 'running') tc.status = 'completed';
            }
            updateAssistant({
              content: finalContent || currentContent,
              isStreaming: false,
              toolCalls: currentToolCalls,
              retrievals: currentRetrievals,
            });
          } else if (eventType === 'title') {
            loadSessions();
          } else if (eventType === 'error') {
            const error = (event as Record<string, unknown>).error as string;
            toast.error(`Agent 错误：${error}`);
            updateAssistant({ content: `错误：${error}`, isStreaming: false });
          }
        }
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AbortError') {
          for (const tc of currentToolCalls) {
            if (tc.status === 'running') tc.status = 'completed';
          }
          updateAssistant({
            content: currentContent || '（已停止生成）',
            isStreaming: false,
            toolCalls: currentToolCalls,
            retrievals: currentRetrievals,
          });
        } else {
          console.error('Streaming error:', error);
          toast.error('请求失败，请确认后端服务运行');
          updateAssistant({ content: '抱歉，发生错误。请确保后端服务正在运行。', isStreaming: false });
        }
      } finally {
        dispatch({ type: 'SET_STREAMING', payload: false });
        dispatch({ type: 'INCREMENT_FILES_VERSION' });
        abortControllerRef.current = null;
        streamingSessionIdRef.current = null;
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

    setSelectedGraphNode: (node: GraphNode | null) => {
      dispatch({ type: 'SET_SELECTED_GRAPH_NODE', payload: node });
    },

    setGraphData: (data: GraphData | null) => {
      dispatch({ type: 'SET_GRAPH_DATA', payload: data });
    },

    setIsTraceback: (value: boolean) => {
      dispatch({ type: 'SET_IS_TRACEBACK', payload: value });
    },

    setToggleExpandNodeCallback: (cb: ((node: GraphNode) => void) | null) => {
      dispatch({ type: 'SET_TOGGLE_EXPAND_NODE_CALLBACK', payload: cb });
    },

    setIsGeneratingQuiz: (value: boolean) => {
      dispatch({ type: 'SET_IS_GENERATING_QUIZ', payload: value });
    },

    incrementFilesVersion: () => {
      dispatch({ type: 'INCREMENT_FILES_VERSION' });
    },

    addGeneratingTask: (task: GeneratingTask) => {
      dispatch({ type: 'ADD_GENERATING_TASK', payload: task });
    },

    updateGeneratingTask: (id: string, updates: Partial<GeneratingTask>) => {
      dispatch({ type: 'UPDATE_GENERATING_TASK', payload: { id, updates } });
    },

    removeGeneratingTask: (id: string) => {
      dispatch({ type: 'REMOVE_GENERATING_TASK', payload: id });
    },

    loadCodeToInspector: (code: string, filename: string) => {
      dispatch({ type: 'SET_CODER_CODE', payload: { code, filename } });
    },

    setCoderProjectPath: (path: string) => {
      dispatch({ type: 'SET_CODER_PROJECT_PATH', payload: path });
    },

    // ── Notes actions ──

    setNotesChatMessages: (msgs) => dispatch({ type: 'SET_NOTES_CHAT_MESSAGES', payload: msgs }),
    addNotesChatMessage: (msg) => dispatch({ type: 'ADD_NOTES_CHAT_MESSAGE', payload: msg }),
    updateNotesChatMessage: (id, updates) => dispatch({ type: 'UPDATE_NOTES_CHAT_MESSAGE', payload: { id, updates } }),
    setNotes: (notes) => dispatch({ type: 'SET_NOTES', payload: notes }),
    addNote: (note) => dispatch({ type: 'ADD_NOTE', payload: note }),
    setNotesGeneratingLabel: (label) => dispatch({ type: 'SET_NOTES_GENERATING_LABEL', payload: label }),
    setIsNotesStreaming: (v) => dispatch({ type: 'SET_IS_NOTES_STREAMING', payload: v }),

    stopNotesGeneration: () => {
      if (_notesAbortRef.current) {
        _notesAbortRef.current.abort();
        _notesAbortRef.current = null;
      }
    },

    loadNotes: async () => {
      try {
        const notes = await listNotes();
        dispatch({ type: 'SET_NOTES', payload: notes });
      } catch { /* ignore */ }
    },

    startNotesGeneration: ({ prompt, subagent, label, contextPrefix = '' }) => {
      // Abort any existing generation
      if (_notesAbortRef.current) {
        _notesAbortRef.current.abort();
      }

      dispatch({ type: 'SET_NOTES_GENERATING_LABEL', payload: label });
      dispatch({ type: 'SET_IS_NOTES_STREAMING', payload: true });

      const userMsg: NotesChatMessage = { id: `u-${Date.now()}`, role: 'user', content: prompt };
      const assistantMsg: NotesChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content: '', isStreaming: true };
      dispatch({ type: 'ADD_NOTES_CHAT_MESSAGE', payload: userMsg });
      dispatch({ type: 'ADD_NOTES_CHAT_MESSAGE', payload: assistantMsg });

      const assistantId = assistantMsg.id;

      // Start async generation (runs at module level, survives component unmount)
      (async () => {
        const controller = new AbortController();
        _notesAbortRef.current = controller;

        try {
          let fullContent = '';
          let writtenFilePath = '';

          const gen = streamSubagent(
            { subagent, message: contextPrefix + prompt },
            controller.signal,
          );
          _notesGeneratorRef.current = gen as AsyncGenerator<unknown, void, unknown>;

          for await (const event of gen) {
            if (event.type === 'token' && event.content) {
              fullContent += event.content;
              _notesDispatchRef.current?.({
                type: 'UPDATE_NOTES_CHAT_MESSAGE',
                payload: { id: assistantId, updates: { content: fullContent } },
              });
            }
            if (event.type === 'tool_end' && event.tool === 'write_file') {
              const match = (event.output || '').match(/Updated file\s+(.+)/i);
              if (match) writtenFilePath = match[1].trim();
            }
            if (event.type === 'done' || event.type === 'error') break;
          }

          // Read actual file and save as note
          let noteContent = fullContent;
          let noteTitle = label;

          if (writtenFilePath) {
            try {
              const { readFile } = await import('./api');
              const fileRes = await readFile(writtenFilePath);
              if (fileRes.exists && fileRes.content) {
                noteContent = fileRes.content;
                noteTitle = writtenFilePath.split('/').pop()?.replace(/\.\w+$/, '') || label;
              }
            } catch { /* fall back */ }
          }

          if (!writtenFilePath) {
            const firstLine = fullContent.split('\n').find(l => l.trim()) || '';
            noteTitle = firstLine.replace(/^#+\s*/, '').slice(0, 50) || label;
          }

          if (noteContent.trim()) {
            try {
              const savedNote = await createNote(noteTitle, noteContent);
              _notesDispatchRef.current?.({ type: 'ADD_NOTE', payload: savedNote });
            } catch {
              _notesDispatchRef.current?.({
                type: 'ADD_NOTE',
                payload: { id: `gen-${Date.now()}`, title: noteTitle, content: noteContent, created_at: new Date().toLocaleString('zh-CN') },
              });
            }
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            _notesDispatchRef.current?.({
              type: 'UPDATE_NOTES_CHAT_MESSAGE',
              payload: { id: assistantId, updates: { content: '请求失败，请重试。' } },
            });
          }
        } finally {
          _notesDispatchRef.current?.({
            type: 'UPDATE_NOTES_CHAT_MESSAGE',
            payload: { id: assistantId, updates: { isStreaming: false } },
          });
          _notesDispatchRef.current?.({ type: 'SET_IS_NOTES_STREAMING', payload: false });
          _notesDispatchRef.current?.({ type: 'SET_NOTES_GENERATING_LABEL', payload: null });
          _notesAbortRef.current = null;
          _notesGeneratorRef.current = null;
        }
      })();
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
