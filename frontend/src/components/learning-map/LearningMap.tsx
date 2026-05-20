'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock,
  Circle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Sparkles,
  Brain,
  GraduationCap,
  X,
  Loader2,
  Play,
  Check,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import {
  type LearningMapNode,
  type LearningMapData,
  type NodeStatus,
  type NodeActionType,
  type NodeActionState,
  type ActionPhase,
  type ActionTrigger,
  type ActionResult,
  emptyActionState,
  isAllCompleted,
} from './types';

/* ── Context ── */

interface MapContextValue {
  actions: Record<string, NodeActionState>;
  results: Record<string, ActionResult>;
  localStatus: Record<string, 'locked' | 'active' | 'completed'>;
  setPhase: (nodeId: string, action: NodeActionType, phase: ActionPhase) => void;
  onAction: (node: LearningMapNode, action: NodeActionType, trigger: ActionTrigger) => void;
}

const MapContext = createContext<MapContextValue | null>(null);

function useMapCtx() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMapCtx must be inside MapContext.Provider');
  return ctx;
}

/* ── Helpers ── */

function getEffectiveStatus(nodeId: string, localStatus: Record<string, NodeStatus>): NodeStatus {
  return localStatus[nodeId] ?? 'locked';
}

function StatusIcon({ status, className }: { status: NodeStatus; className?: string }) {
  switch (status) {
    case 'locked':
      return <Lock className={cn('w-3.5 h-3.5', className)} />;
    case 'active':
      return <Circle className={cn('w-3.5 h-3.5 fill-current', className)} />;
    case 'completed':
      return <CheckCircle2 className={cn('w-3.5 h-3.5 fill-current', className)} />;
  }
}

const ACTION_DEFS: Array<{
  key: NodeActionType;
  label: string;
  icon: typeof BookOpen;
  color: string;
  bgColor: string;
  readyLabel: string;
}> = [
  {
    key: 'learn',
    label: '学习知识点',
    icon: BookOpen,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/60',
    readyLabel: '开始学习',
  },
  {
    key: 'quiz',
    label: '生成测验',
    icon: Brain,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-950/60',
    readyLabel: '开始测验',
  },
  {
    key: 'flashcard',
    label: '生成闪卡',
    icon: Sparkles,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/60',
    readyLabel: '开始复习',
  },
];

/* ── Node Action Popover ── */

function NodeActionPopover({
  node,
  anchorRef,
  onClose,
}: {
  node: LearningMapNode;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const { actions, results, setPhase, onAction } = useMapCtx();
  const state = actions[node.id] || emptyActionState();
  const completed = isAllCompleted(state);
  const doneCount = [state.learn, state.quiz, state.flashcard].filter((p) => p === 'completed').length;

  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - 140;
    left = Math.max(8, Math.min(left, window.innerWidth - 288));
    setPos({ top, left });
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  const handleClick = (def: (typeof ACTION_DEFS)[number]) => {
    const phase = state[def.key];
    if (phase === 'completed') return;
    if (phase === 'idle') {
      setPhase(node.id, def.key, 'generating');
      onAction(node, def.key, 'generate');
      return;
    }
    if (phase === 'ready') {
      onAction(node, def.key, 'start');
      return;
    }
  };

  const getButtonContent = (def: (typeof ACTION_DEFS)[number]) => {
    const phase = state[def.key];
    const Icon = def.icon;
    const result = results[`${node.id}:${def.key}`];

    switch (phase) {
      case 'idle':
        return (
          <>
            <Icon className={cn('w-4 h-4', def.color)} />
            <span className="text-[13px] font-medium">{def.label}</span>
          </>
        );
      case 'generating':
        return (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-[13px] font-medium text-muted-foreground">正在生成…</span>
          </>
        );
      case 'ready':
        return (
          <>
            <Play className={cn('w-4 h-4', def.color)} />
            <span className={cn('text-[13px] font-medium', def.color)}>{def.readyLabel}</span>
          </>
        );
      case 'completed':
        return (
          <>
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400 line-through">
              {def.label}
            </span>
            {result && def.key !== 'learn' && (
              <span className="ml-auto text-[11px] text-emerald-600/70 dark:text-emerald-400/70 tabular-nums">
                {result.score}分
              </span>
            )}
          </>
        );
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[999]" onClick={onClose} />
      <motion.div
        ref={popoverRef}
        className="fixed z-[1000] w-[280px] bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
        style={{ top: pos.top, left: pos.left }}
        initial={{ opacity: 0, y: -4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.97 }}
        transition={{ duration: 0.15 }}
      >
        {/* Header */}
        <div className="px-3.5 pt-3 pb-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] font-semibold text-foreground truncate pr-2">{node.title}</span>
            <button onClick={onClose} className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          {completed ? (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              全部完成
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={false}
                  animate={{ width: `${(doneCount / 3) * 100}%` }}
                  transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">{doneCount}/3</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-3.5 pb-3 flex flex-col gap-1.5">
          {ACTION_DEFS.map((def) => {
            const phase = state[def.key];
            const isDone = phase === 'completed';
            const isGenerating = phase === 'generating';

            return (
              <button
                key={def.key}
                onClick={() => handleClick(def)}
                disabled={isDone || isGenerating}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors w-full',
                  isDone && 'bg-muted/50 cursor-default',
                  isGenerating && 'bg-muted/30 cursor-wait',
                  !isDone && !isGenerating && def.bgColor,
                )}
              >
                {getButtonContent(def)}
              </button>
            );
          })}
        </div>

        {/* Score summary */}
        {completed && (
          <div className="px-3.5 pb-3">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span className="text-[12px] font-medium">知识点已掌握，下一关已解锁</span>
            </div>
          </div>
        )}
      </motion.div>
    </>,
    document.body,
  );
}

/* ── SVG Connector ── */

function AnimatedConnector({
  completed,
  direction,
  length,
}: {
  completed: boolean;
  direction: 'vertical' | 'horizontal';
  length: number;
}) {
  const isVert = direction === 'vertical';
  const w = isVert ? 2 : length;
  const h = isVert ? length : 2;
  const clipId = useRef(`clip-${Math.random().toString(36).slice(2, 9)}`).current;

  return (
    <motion.svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="shrink-0"
    >
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <motion.rect
            x={0}
            y={0}
            width={w}
            height={0}
            animate={{ height: completed ? h : 0 }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
            initial={false}
          />
        </clipPath>
      </defs>
      <rect width={w} height={h} className="fill-muted-foreground/20" />
      <rect width={w} height={h} className="fill-primary" clipPath={`url(#${clipId})`} />
    </motion.svg>
  );
}

/* ── Node Card ── */

function NodeCard({
  node,
  anchorRef,
  onOpen,
}: {
  node: LearningMapNode;
  anchorRef: React.RefObject<HTMLElement | null>;
  onOpen: () => void;
}) {
  const { actions, results, localStatus } = useMapCtx();
  const status = getEffectiveStatus(node.id, localStatus);
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const isLocked = status === 'locked';
  const state = actions[node.id] || emptyActionState();
  const doneCount = [state.learn, state.quiz, state.flashcard].filter((p) => p === 'completed').length;

  // Check if there are quiz/flashcard results to show score
  const quizResult = results[`${node.id}:quiz`];
  const flashcardResult = results[`${node.id}:flashcard`];

  return (
    <motion.div
      ref={anchorRef as React.RefObject<HTMLDivElement>}
      className={cn(
        'relative flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors select-none',
        'max-w-[280px]',
        isLocked && 'border-muted-foreground/15 opacity-50 cursor-default',
        isActive && 'border-primary/40 bg-primary/[0.04] cursor-pointer',
        isCompleted &&
          'border-emerald-300/40 dark:border-emerald-700/30 bg-emerald-50/50 dark:bg-emerald-950/20 cursor-pointer',
      )}
      onClick={() => !isLocked && onOpen()}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isLocked ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      whileHover={!isLocked ? { scale: 1.02, y: -1 } : undefined}
    >
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-lg border-2 border-primary/30 pointer-events-none"
          animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.015, 1] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div
        className={cn(
          'shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
          isLocked && 'bg-muted text-muted-foreground/40',
          isActive && 'bg-primary/10 text-primary',
          isCompleted && 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
        )}
      >
        <StatusIcon status={status} className="w-3.5 h-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-[13px] font-medium leading-tight truncate',
            isLocked && 'text-muted-foreground/50',
            isActive && 'text-foreground',
            isCompleted && 'text-foreground/80',
          )}
        >
          {node.title}
        </div>
        {node.description && (
          <div className="text-[11px] text-muted-foreground/70 leading-tight mt-0.5 truncate">
            {node.description}
          </div>
        )}
        {/* Progress dots + score badges */}
        {isActive && (
          <div className="flex items-center gap-1.5 mt-1">
            {([state.learn, state.quiz, state.flashcard] as ActionPhase[]).map((p, i) => (
              <div
                key={i}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  p === 'completed' ? 'bg-primary' : p !== 'idle' ? 'bg-primary/40' : 'bg-muted-foreground/20',
                )}
              />
            ))}
            <span className="text-[10px] text-muted-foreground ml-0.5">{doneCount}/3</span>
          </div>
        )}
        {isCompleted && (quizResult || flashcardResult) && (
          <div className="flex items-center gap-2 mt-1">
            {quizResult && (
              <div className="flex items-center gap-0.5 text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
                <Trophy className="w-3 h-3" />
                <span className="tabular-nums">{quizResult.score}分</span>
              </div>
            )}
            {flashcardResult && (
              <div className="flex items-center gap-0.5 text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
                <Trophy className="w-3 h-3" />
                <span className="tabular-nums">{flashcardResult.score}分</span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Map Node (recursive) ── */

function MapNode({ node, depth }: { node: LearningMapNode; depth: number }) {
  const { localStatus } = useMapCtx();
  const [expanded, setExpanded] = useState(true);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const hasChildren = node.children && node.children.length > 0;
  const status = getEffectiveStatus(node.id, localStatus);

  return (
    <motion.div
      className="flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: depth * 0.05 }}
    >
      <div className="flex items-stretch">
        {hasChildren && (
          <div className="flex flex-col items-center w-5 shrink-0 mr-1">
            <div className="flex-1" />
            <AnimatedConnector completed={status === 'completed'} direction="vertical" length={18} />
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-4 h-4 flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <NodeCard node={node} anchorRef={anchorRef} onOpen={() => setPopoverOpen(true)} />
        </div>
      </div>

      <AnimatePresence>
        {popoverOpen && (
          <NodeActionPopover node={node} anchorRef={anchorRef} onClose={() => setPopoverOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {hasChildren && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="relative flex">
              <div className="flex flex-col items-center w-5 shrink-0 mr-1">
                <AnimatedConnector completed={status === 'completed'} direction="vertical" length={8} />
                <div className="flex-1 w-px bg-muted-foreground/15" />
              </div>
              <div className="flex-1 flex flex-col gap-1.5 pl-2">
                {node.children!.map((child) => (
                  <div key={child.id} className="flex items-stretch">
                    <div className="flex items-center w-5 shrink-0 mr-1">
                      <div className="w-full h-px bg-muted-foreground/15" />
                      <AnimatedConnector completed={status === 'completed'} direction="horizontal" length={8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <MapNode node={child} depth={depth + 1} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Main Component ── */

export function LearningMap({
  data,
  actions,
  results,
  localStatus,
  setPhase,
  onAction,
}: {
  data: LearningMapData;
  actions: Record<string, NodeActionState>;
  results: Record<string, ActionResult>;
  localStatus: Record<string, 'locked' | 'active' | 'completed'>;
  setPhase: (nodeId: string, action: NodeActionType, phase: ActionPhase) => void;
  onAction?: (node: LearningMapNode, action: NodeActionType, trigger: ActionTrigger) => void;
}) {
  const ctx: MapContextValue = {
    actions,
    results,
    localStatus,
    setPhase,
    onAction: onAction || (() => {}),
  };

  const phases = (data.nodes ?? []).reduce<Array<{ phase: string; nodes: LearningMapNode[] }>>((acc, node) => {
    const phase = node.phase || '';
    const last = acc[acc.length - 1];
    if (last && last.phase === phase) {
      last.nodes.push(node);
    } else {
      acc.push({ phase, nodes: [node] });
    }
    return acc;
  }, []);

  return (
    <MapContext.Provider value={ctx}>
      <div className="h-full flex flex-col">
        {data.subtitle && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-xs text-muted-foreground">{data.subtitle}</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
          <div className="flex flex-col gap-5">
            {phases.map((group) => (
              <div key={group.phase || 'default'} className="flex flex-col gap-2">
                {group.phase && (
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider shrink-0">
                      {group.phase}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                {group.nodes.map((node) => (
                  <MapNode key={node.id} node={node} depth={0} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </MapContext.Provider>
  );
}
