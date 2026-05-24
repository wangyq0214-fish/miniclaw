export type NodeStatus = 'locked' | 'active' | 'completed';

export type NodeActionType = 'learn';

/** idle → generating → ready → completed */
export type ActionPhase = 'idle' | 'generating' | 'ready' | 'completed';

export type ActionTrigger = 'generate' | 'start';

export interface NodeActionState {
  learn: ActionPhase;
}

export function emptyActionState(): NodeActionState {
  return { learn: 'idle' };
}

export function isAllCompleted(s: NodeActionState): boolean {
  return s.learn === 'completed';
}

export interface LearningMapNode {
  id: string;
  title: string;
  description?: string;
  status: NodeStatus;
  phase?: string;
  checkpoint?: string;
  resources?: Array<{ type: string; label: string; path?: string }>;
  children?: LearningMapNode[];
}

export interface LearningMapData {
  title: string;
  subtitle?: string;
  nodes: LearningMapNode[];
}

/* ── Learning result ── */

export interface ActionResult {
  completed: boolean;
  score: number;
  total: number;
  correct: number;
  completedAt: string;
  filePath: string;
}

/* ── Cross-component event ── */

export type LearningMapEventDetail = {
  nodeId: string;
  action: 'learn';
  score: number;
  total: number;
  correct: number;
  filePath: string;
};

export const LEARNING_MAP_EVENT = 'miniclaw:learning-action-complete';
