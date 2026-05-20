'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  LearningMapNode,
  NodeActionType,
  NodeActionState,
  ActionResult,
  LearningMapEventDetail,
} from './types';
import { LEARNING_MAP_EVENT, emptyActionState, isAllCompleted } from './types';
import { loadLearningProgress, saveLearningProgress } from '@/lib/api';
import { getUserItem, setUserItem } from '@/lib/userStorage';

const ACTIONS_KEY = 'miniclaw_learning_actions';
const RESULTS_KEY = 'miniclaw_learning_results';

/* ── Storage helpers (localStorage as instant cache) ── */

function loadActions(): Record<string, NodeActionState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(getUserItem(ACTIONS_KEY) || '{}');
    for (const k of Object.keys(raw)) {
      const v = raw[k];
      if (typeof v.learn === 'boolean') {
        raw[k] = {
          learn: v.learn ? 'completed' : 'idle',
          quiz: v.quiz ? 'completed' : 'idle',
          flashcard: v.flashcard ? 'completed' : 'idle',
        };
      } else {
        for (const key of ['learn', 'quiz', 'flashcard'] as const) {
          if (v[key] === 'ready' || v[key] === 'generating') {
            v[key] = 'idle';
          }
        }
      }
    }
    return raw;
  } catch {
    return {};
  }
}

function saveActions(data: Record<string, NodeActionState>) {
  setUserItem(ACTIONS_KEY, JSON.stringify(data));
}

function loadResults(): Record<string, ActionResult> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(getUserItem(RESULTS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveResults(data: Record<string, ActionResult>) {
  setUserItem(RESULTS_KEY, JSON.stringify(data));
}

/* ── Hook ── */

export function useLearningProgress(nodes: LearningMapNode[]) {
  const [actions, setActions] = useState<Record<string, NodeActionState>>({});
  const [results, setResults] = useState<Record<string, ActionResult>>({});
  const syncedRef = useRef(false);

  // Load on mount: localStorage first (instant), then sync from backend
  useEffect(() => {
    setActions(loadActions());
    setResults(loadResults());
  }, []);

  // Sync from backend on mount (one-time)
  useEffect(() => {
    if (syncedRef.current || !nodes || nodes.length === 0) return;
    syncedRef.current = true;

    loadLearningProgress()
      .then((items) => {
        if (items.length === 0) return;

        setActions((prev) => {
          const next = { ...prev };
          for (const item of items) {
            const current = { ...(next[item.node_id] || emptyActionState()) };
            if ((item.phase === 'completed' || item.phase === 'idle') &&
                (item.action === 'learn' || item.action === 'quiz' || item.action === 'flashcard')) {
              current[item.action] = item.phase;
            }
            next[item.node_id] = current;
          }
          saveActions(next);
          return next;
        });

        setResults((prev) => {
          const next = { ...prev };
          for (const item of items) {
            if (item.phase === 'completed' && item.score !== undefined) {
              next[`${item.node_id}:${item.action}`] = {
                completed: true,
                score: item.score,
                total: item.total ?? 0,
                correct: item.correct ?? 0,
                completedAt: item.completed_at || new Date().toISOString(),
                filePath: item.file_path || '',
              };
            }
          }
          saveResults(next);
          return next;
        });
      })
      .catch(() => {
        // Backend unavailable — localStorage data is still usable
      });
  }, [nodes]);

  // Compute local status map: nodeId → 'locked' | 'active' | 'completed'
  const localStatus = computeLocalStatus(nodes, actions);

  const setPhase = useCallback((nodeId: string, action: NodeActionType, phase: 'idle' | 'generating' | 'ready' | 'completed') => {
    setActions((prev) => {
      const current = prev[nodeId] || emptyActionState();
      const next = { ...prev, [nodeId]: { ...current, [action]: phase } };
      saveActions(next);
      return next;
    });

    // Persist to backend (fire-and-forget)
    const node = nodes.find((n) => n.id === nodeId);
    saveLearningProgress({
      node_id: nodeId,
      action,
      phase,
      node_title: node?.title,
    }).catch(() => {});
  }, [nodes]);

  const completeWithResult = useCallback((detail: LearningMapEventDetail) => {
    const { nodeId, action, score, total, correct, filePath } = detail;

    // Update action phase
    setActions((prev) => {
      const current = prev[nodeId] || emptyActionState();
      const next = { ...prev, [nodeId]: { ...current, [action]: 'completed' as const } };
      saveActions(next);
      return next;
    });

    // Save result
    setResults((prev) => {
      const result: ActionResult = {
        completed: true,
        score,
        total,
        correct,
        completedAt: new Date().toISOString(),
        filePath,
      };
      const next = { ...prev, [`${nodeId}:${action}`]: result };
      saveResults(next);
      return next;
    });

    // Persist to backend
    const node = nodes.find((n) => n.id === nodeId);
    saveLearningProgress({
      node_id: nodeId,
      action,
      phase: 'completed',
      score,
      total,
      correct,
      file_path: filePath,
      node_title: node?.title,
    }).catch(() => {});
  }, [nodes]);

  // Listen for completion events from ExerciseViewer / FlashcardViewer
  useEffect(() => {
    const handler = (e: CustomEvent<LearningMapEventDetail>) => {
      completeWithResult(e.detail);
    };
    window.addEventListener(LEARNING_MAP_EVENT, handler as EventListener);
    return () => window.removeEventListener(LEARNING_MAP_EVENT, handler as EventListener);
  }, [completeWithResult]);

  return {
    actions,
    results,
    localStatus,
    setPhase,
    completeWithResult,
  };
}

/* ── Compute node status with bottom-up derivation ── */
/* Top-down for siblings (sequential unlock), then bottom-up for parents (derived from children) */

function computeLocalStatus(
  nodes: LearningMapNode[],
  actions: Record<string, NodeActionState>,
): Record<string, 'locked' | 'active' | 'completed'> {
  const status: Record<string, 'locked' | 'active' | 'completed'> = {};
  if (!nodes) return status;

  // Phase 1: Top-down — process top-level nodes, then their children in order
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const state = actions[node.id] || emptyActionState();

    // Top-level node: derive status from own actions + previous sibling
    if (isAllCompleted(state)) {
      status[node.id] = 'completed';
    } else {
      const prevCompleted = i === 0 || status[nodes[i - 1].id] === 'completed';
      status[node.id] = prevCompleted ? 'active' : 'locked';
    }

    // Process children (sections within this day)
    const children = node.children ?? [];
    for (let j = 0; j < children.length; j++) {
      const child = children[j];
      const childState = actions[child.id] || emptyActionState();

      if (isAllCompleted(childState)) {
        // Already completed — preserve regardless of parent
        status[child.id] = 'completed';
      } else if (j === 0) {
        // First section: active only if previous day is completed (or this is the first day)
        const prevTopNode = i > 0 ? nodes[i - 1] : undefined;
        status[child.id] = !prevTopNode || status[prevTopNode.id] === 'completed' ? 'active' : 'locked';
      } else {
        // Subsequent sections: active only if previous section is completed
        status[child.id] = status[children[j - 1].id] === 'completed' ? 'active' : 'locked';
      }
    }
  }

  // Phase 2: Bottom-up — derive parent status from children
  for (const node of nodes) {
    const children = node.children ?? [];
    if (children.length === 0) continue;

    const allCompleted = children.every(c => status[c.id] === 'completed');
    const anyActive = children.some(c => status[c.id] === 'active' || status[c.id] === 'completed');

    if (allCompleted) {
      // Re-check parent's own actions — all three must also be completed
      const parentState = actions[node.id] || emptyActionState();
      status[node.id] = isAllCompleted(parentState) ? 'completed' : 'active';
    } else if (anyActive) {
      status[node.id] = 'active';
    } else {
      status[node.id] = 'locked';
    }
  }

  return status;
}
