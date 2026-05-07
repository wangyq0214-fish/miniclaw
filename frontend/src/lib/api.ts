/**
 * Mini-OpenClaw API Client
 *
 * Provides functions for:
 * - Streaming chat with SSE
 * - Session management
 * - File operations
 * - Token statistics
 * - Session compression
 * - RAG mode configuration
 */

import { tokenManager } from './auth';

// API calls use relative paths — proxied by Next.js rewrites to backend
function getApiBase() {
  return '';
}

// Helper function to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = tokenManager.getToken();
  return token
    ? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }
    : {
        'Content-Type': 'application/json',
      };
}

// Types
export interface ChatRequest {
  message: string;
  session_id: string;
  stream?: boolean;
}

export interface ChatResponse {
  message: string;
  session_id: string;
  thoughts?: Array<{
    type: string;
    tool?: string;
    args?: Record<string, unknown>;
    result?: string;
    content?: string;
  }>;
}

export interface SessionInfo {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: string;
  tool_calls?: unknown[];
}

export interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  category?: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  location: string;
}

export interface TokenStats {
  system_tokens: number;
  message_tokens: number;
  total_tokens: number;
}

export interface CompressResult {
  archived_count: number;
  remaining_count: number;
  summary: string;
}

export type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_start'; tool: string; input: Record<string, unknown>; id?: string }
  | { type: 'tool_end'; tool: string; output: string; id?: string }
  | { type: 'status'; message: string }
  | { type: 'subagent_token'; subagent: string; content: string }
  | { type: 'subagent_tool_start'; subagent: string; tool: string }
  | { type: 'subagent_tool_end'; subagent: string; tool: string }
  | { type: 'new_response'; segment?: number }
  | { type: 'retrieval'; query: string; results: Array<{ text: string; score: number; source: string }> }
  | { type: 'done'; content: string; session_id: string; tool_calls?: unknown[] }
  | { type: 'title'; session_id: string; title: string }
  | { type: 'error'; error: string };

// Chat API
export async function sendMessage(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${getApiBase()}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify({ ...request, stream: false }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export async function* streamChat(
  request: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const response = await fetch(`${getApiBase()}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify({ ...request, stream: true }),
    signal,
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new Error(`API error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          yield data as SSEEvent;
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}

// Session API

export interface SubAgentRequest {
  subagent: string;
  message: string;
  stream?: boolean;
}

export async function* streamSubagent(
  request: SubAgentRequest,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const response = await fetch(`${getApiBase()}/api/subagent/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify({ ...request, stream: true }),
    signal,
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new Error(`API error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6)) as SSEEvent;
        } catch { /* ignore */ }
      }
    }
  }
}

export async function listSessions(): Promise<SessionInfo[]> {
  const response = await fetch(`${getApiBase()}/api/sessions/list`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new Error(`API error: ${response.statusText}`);
  }
  const data = await response.json();
  return data.sessions;
}

export async function getSession(sessionId: string): Promise<{
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
  compressed_context?: string;
}> {
  const response = await fetch(`${getApiBase()}/api/sessions/${sessionId}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function createSession(sessionId?: string, title?: string): Promise<{
  success: boolean;
  session_id: string;
  title: string;
  created_at: string;
}> {
  const response = await fetch(`${getApiBase()}/api/sessions/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify({
      title: title || '新对话',
      tags: [],
      related_resources: null,
    }),
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new Error(`API error: ${response.statusText}`);
  }
  const data = await response.json();
  return {
    success: true,
    session_id: data.session_id,
    title: data.title,
    created_at: data.created_at,
  };
}

export async function renameSession(sessionId: string, title: string): Promise<{
  success: boolean;
  session_id: string;
  title: string;
}> {
  const response = await fetch(`${getApiBase()}/api/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${getApiBase()}/api/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new Error(`API error: ${response.statusText}`);
  }
}

export async function generateTitle(sessionId: string): Promise<{
  session_id: string;
  title: string;
}> {
  const response = await fetch(`${getApiBase()}/api/sessions/${sessionId}/generate-title`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

// File API
export async function readFile(path: string): Promise<{
  content: string;
  path: string;
  exists: boolean;
}> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const response = await fetch(
    `${getApiBase()}/api/files?path=${encodeURIComponent(path)}`,
    { headers }
  );
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return response.json();
}

export async function writeFile(
  path: string,
  content: string
): Promise<{ success: boolean; message: string }> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token
    ? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }
    : {
        'Content-Type': 'application/json',
      };

  const response = await fetch(`${getApiBase()}/api/files`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ path, content }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteFile(path: string): Promise<{ success: boolean; message: string }> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const response = await fetch(
    `${getApiBase()}/api/files?path=${encodeURIComponent(path)}`,
    { method: 'DELETE', headers }
  );
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return response.json();
}

export async function listFiles(directory: string = ''): Promise<{
  files: FileInfo[];
  directory: string;
}> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const response = await fetch(
    `${getApiBase()}/api/files/list?directory=${encodeURIComponent(directory)}`,
    { headers }
  );
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

// Mindmap API
export interface MindmapTreeNode {
  title: string;
  summary?: string;
  details?: string[];
  children: MindmapTreeNode[];
  extra?: {
    explanation: string;
    examples: string[];
    applications: string[];
  } | null;
}

export interface MindmapExtra {
  explanation: string;
  examples: string[];
  applications: string[];
}

export async function expandMindmapNode(
  nodeTitle: string,
  context: string = ''
): Promise<{ extra: MindmapExtra }> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${getApiBase()}/api/mindmap/expand`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ node_title: nodeTitle, context }),
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return response.json();
}

export async function listSkills(): Promise<SkillInfo[]> {
  const response = await fetch(`${getApiBase()}/api/skills`);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  const data = await response.json();
  return data.skills;
}

// Token API
export async function getTokenStats(sessionId: string): Promise<TokenStats> {
  const response = await fetch(`${getApiBase()}/api/tokens/session/${sessionId}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function countFileTokens(paths: string[]): Promise<{
  files: Array<{ path: string; tokens: number; exists: boolean }>;
}> {
  const response = await fetch(`${getApiBase()}/api/tokens/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

// Compress API
export async function compressSession(
  sessionId: string,
  options?: { min_messages?: number; ratio?: number }
): Promise<CompressResult> {
  const params = new URLSearchParams();
  if (options?.min_messages) params.set('min_messages', String(options.min_messages));
  if (options?.ratio) params.set('ratio', String(options.ratio));

  const response = await fetch(
    `${getApiBase()}/api/sessions/${sessionId}/compress?${params.toString()}`,
    { method: 'POST' }
  );
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

// Config API
export async function getRagMode(): Promise<{ enabled: boolean }> {
  const response = await fetch(`${getApiBase()}/api/config/rag-mode`);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function setRagMode(enabled: boolean): Promise<{ enabled: boolean }> {
  const response = await fetch(`${getApiBase()}/api/config/rag-mode`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function getConfig(): Promise<Record<string, unknown>> {
  const response = await fetch(`${getApiBase()}/api/config`);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

// User Profile API
export interface UserProfile {
  username: string;
  email: string;
  basic_info?: {
    name?: string;
    major?: string;
    grade?: string;
    school?: string;
  };
  learning_goals?: {
    short_term?: string;
    long_term?: string;
  };
  cognitive_style?: {
    preference?: string;
  };
  learning_plan?: string;
}

export async function getUserProfile(): Promise<UserProfile> {
  const token = tokenManager.getToken();
  const response = await fetch(`${getApiBase()}/api/user/profile`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function updateUserProfile(profile: UserProfile): Promise<{ success: boolean }> {
  const token = tokenManager.getToken();
  const response = await fetch(`${getApiBase()}/api/user/profile`, {
    method: 'PUT',
    headers: token
      ? {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }
      : {
          'Content-Type': 'application/json',
        },
    body: JSON.stringify(profile),
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

// ── Knowledge Graph API ─────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  type: string; // "entity" | "course" | "chapter" | "section"
  // Enriched properties (optional, populated from backend)
  occurrence?: number;    // entity frequency across corpus
  entity_type?: string;   // entity semantic type (e.g. "概念", "模型")
  description?: string;   // entity description
  chapters?: string;      // chapter this entity belongs to
  section_id?: string;    // raw section id (for section nodes)
  child_count?: number;   // number of direct children
  // Visual overrides (from traceback)
  style?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string; // "RELATES_TO" | "CONTAINS" | "HAS_SECTION" | "APPEARS_IN"
  // Enriched properties (optional)
  description?: string;   // relationship description
  chapter?: string;       // chapter reference (for APPEARS_IN)
  chunk_id?: string;      // chunk reference (for APPEARS_IN)
  occurrence?: number;    // relationship occurrence count
  // Visual overrides (from traceback)
  style?: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function getGraphRoot(): Promise<GraphData> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(
    `${getApiBase()}/api/knowledge/graph/root`,
    { headers },
  );
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

export async function getEntityGraph(name: string, depth: number = 1): Promise<GraphData> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(
    `${getApiBase()}/api/knowledge/graph/entity?name=${encodeURIComponent(name)}&depth=${depth}`,
    { headers },
  );
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

export async function getCourseGraph(): Promise<GraphData> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${getApiBase()}/api/knowledge/graph/course`, { headers });
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

export async function getCourseEntities(courseId: string): Promise<GraphData> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(
    `${getApiBase()}/api/knowledge/graph/course/${encodeURIComponent(courseId)}/entities`,
    { headers },
  );
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

export async function getNodeChildren(nodeType: string, nodeId: string, signal?: AbortSignal): Promise<GraphData> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const params = new URLSearchParams({ node_type: nodeType, node_id: nodeId });
  const response = await fetch(
    `${getApiBase()}/api/knowledge/graph/children?${params}`,
    { headers, signal },
  );
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

// ── Traceback Graph API ────────────────────────────────

export interface TracebackNode {
  id: string;
  label: string;
  style?: Record<string, unknown>;
  node_type?: string;
  entity_type?: string;
  description?: string;
  occurrence?: number;
  chapters?: string;
}

export interface TracebackEdge {
  source: string;
  target: string;
  label: string;
  style?: Record<string, unknown>;
  description?: string;
}

export interface TracebackData {
  nodes: TracebackNode[];
  edges: TracebackEdge[];
}

export async function getTracebackGraph(targetConcept: string, nodeType: string = 'entity'): Promise<TracebackData> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const params = new URLSearchParams({ target_concept: targetConcept, node_type: nodeType });
  const response = await fetch(
    `${getApiBase()}/api/knowledge/graph/traceback?${params}`,
    { headers },
  );
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

// Sources API (Notes view)
export interface SourceItem {
  id: string;
  title: string;
  content?: string;
  file_url?: string;
  file_type?: string; // 'text', 'file', 'website'
}

export async function listSources(): Promise<SourceItem[]> {
  const response = await fetch(`${getApiBase()}/api/sources`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new Error(`API error: ${response.statusText}`);
  }
  const data = await response.json();
  return data.sources;
}

export async function createSource(title: string, content?: string, fileType?: string): Promise<SourceItem> {
  const response = await fetch(`${getApiBase()}/api/sources`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ title, content, file_type: fileType }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function uploadSourceFile(file: File): Promise<SourceItem> {
  const token = tokenManager.getToken();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${getApiBase()}/api/sources/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteSource(sourceId: string): Promise<void> {
  const response = await fetch(`${getApiBase()}/api/sources/${encodeURIComponent(sourceId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
}

export async function getSourceContent(sourceId: string): Promise<{ content: string; type: string; filename?: string }> {
  const token = tokenManager.getToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(
    `${getApiBase()}/api/sources/${encodeURIComponent(sourceId)}/content`,
    { headers },
  );
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

// Notes API
export interface NoteItem {
  id: string;
  title: string;
  content: string;
  source_id?: string;
  created_at: string;
}

export async function listNotes(): Promise<NoteItem[]> {
  const response = await fetch(`${getApiBase()}/api/notes`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  const data = await response.json();
  return data.notes;
}

export async function createNote(title: string, content: string, sourceId?: string): Promise<NoteItem> {
  const response = await fetch(`${getApiBase()}/api/notes`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ title, content, source_id: sourceId }),
  });
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

export async function deleteNote(noteId: string): Promise<void> {
  const response = await fetch(`${getApiBase()}/api/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
}
