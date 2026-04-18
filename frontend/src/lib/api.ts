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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

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
  | { type: 'new_response'; segment?: number }
  | { type: 'retrieval'; query: string; results: Array<{ text: string; score: number; source: string }> }
  | { type: 'done'; content: string; session_id: string; tool_calls?: unknown[] }
  | { type: 'title'; session_id: string; title: string }
  | { type: 'error'; error: string };

// Chat API
export async function sendMessage(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...request, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export async function* streamChat(
  request: ChatRequest
): AsyncGenerator<SSEEvent> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...request, stream: true }),
  });

  if (!response.ok) {
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
export async function listSessions(): Promise<SessionInfo[]> {
  const response = await fetch(`${API_BASE}/api/sessions`);
  if (!response.ok) {
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
  const response = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
  if (!response.ok) {
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
  const params = new URLSearchParams();
  if (sessionId) params.set('session_id', sessionId);
  if (title) params.set('title', title);

  const response = await fetch(`${API_BASE}/api/sessions/new?${params.toString()}`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function renameSession(sessionId: string, title: string): Promise<{
  success: boolean;
  session_id: string;
  title: string;
}> {
  const response = await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
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
  const response = await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
}

export async function generateTitle(sessionId: string): Promise<{
  session_id: string;
  title: string;
}> {
  const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/generate-title`, {
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
  const response = await fetch(
    `${API_BASE}/api/files?path=${encodeURIComponent(path)}`
  );
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function writeFile(
  path: string,
  content: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/api/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, content }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function listFiles(directory: string = ''): Promise<{
  files: FileInfo[];
  directory: string;
}> {
  const response = await fetch(
    `${API_BASE}/api/files/list?directory=${encodeURIComponent(directory)}`
  );
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function listSkills(): Promise<SkillInfo[]> {
  const response = await fetch(`${API_BASE}/api/skills`);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  const data = await response.json();
  return data.skills;
}

// Token API
export async function getTokenStats(sessionId: string): Promise<TokenStats> {
  const response = await fetch(`${API_BASE}/api/tokens/session/${sessionId}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function countFileTokens(paths: string[]): Promise<{
  files: Array<{ path: string; tokens: number; exists: boolean }>;
}> {
  const response = await fetch(`${API_BASE}/api/tokens/files`, {
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
    `${API_BASE}/api/sessions/${sessionId}/compress?${params.toString()}`,
    { method: 'POST' }
  );
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

// Config API
export async function getRagMode(): Promise<{ enabled: boolean }> {
  const response = await fetch(`${API_BASE}/api/config/rag-mode`);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function setRagMode(enabled: boolean): Promise<{ enabled: boolean }> {
  const response = await fetch(`${API_BASE}/api/config/rag-mode`, {
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
  const response = await fetch(`${API_BASE}/api/config`);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}
