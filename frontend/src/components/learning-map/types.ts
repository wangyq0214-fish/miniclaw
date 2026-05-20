export type NodeStatus = 'locked' | 'active' | 'completed';

export type NodeActionType = 'learn' | 'quiz' | 'flashcard';

/** idle → generating → ready → completed */
export type ActionPhase = 'idle' | 'generating' | 'ready' | 'completed';

export type ActionTrigger = 'generate' | 'start';

export interface NodeActionState {
  learn: ActionPhase;
  quiz: ActionPhase;
  flashcard: ActionPhase;
}

export function emptyActionState(): NodeActionState {
  return { learn: 'idle', quiz: 'idle', flashcard: 'idle' };
}

export function isAllCompleted(s: NodeActionState): boolean {
  return s.learn === 'completed' && s.quiz === 'completed' && s.flashcard === 'completed';
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

/* ── Quiz / Flashcard result ── */

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
  action: 'quiz' | 'flashcard';
  score: number;
  total: number;
  correct: number;
  filePath: string;
};

export const LEARNING_MAP_EVENT = 'miniclaw:learning-action-complete';

export function emitActionComplete(
  nodeId: string,
  action: 'quiz' | 'flashcard',
  score: number,
  total: number,
  correct: number,
  filePath: string,
) {
  window.dispatchEvent(
    new CustomEvent<LearningMapEventDetail>(LEARNING_MAP_EVENT, {
      detail: { nodeId, action, score, total, correct, filePath },
    }),
  );
}
