'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  ChevronDown,
  BookOpen,
  GraduationCap,
  X,
  Loader2,
  Play,
  Check,
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
  const doneCount = [state.learn].filter((p) => p === 'completed').length;

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
                  animate={{ width: `${(doneCount / 1) * 100}%` }}
                  transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">{doneCount}/1</span>
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

/* ── SVG Status Icons ── */

function CompletedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ActiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
    </svg>
  );
}

function LockedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

/* ── Sub Knowledge Item ── */

function SubKnowledgeItem({ child }: { child: LearningMapNode }) {
  const { localStatus } = useMapCtx();
  const childStatus = getEffectiveStatus(child.id, localStatus);
  const childDone = childStatus === 'completed';
  const [popoverOpen, setPopoverOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div
        ref={anchorRef}
        onClick={(e) => {
          e.stopPropagation();
          setPopoverOpen(true);
        }}
        className={cn(
          'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer hover:shadow-sm',
          childDone
            ? 'bg-emerald-50/50 border border-emerald-200/60 text-emerald-700 hover:bg-emerald-50'
            : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100',
        )}
      >
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            childDone ? 'bg-emerald-500' : 'bg-slate-300',
          )}
        />
        <span className="truncate">{child.title}</span>
      </div>
      <AnimatePresence>
        {popoverOpen && (
          <NodeActionPopover node={child} anchorRef={anchorRef} onClose={() => setPopoverOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

/* ── Timeline Node ── */

function TimelineNode({ node }: { node: LearningMapNode }) {
  const { actions, results, localStatus } = useMapCtx();
  const status = getEffectiveStatus(node.id, localStatus);
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const isLocked = status === 'locked';
  const state = actions[node.id] || emptyActionState();
  const children = node.children || [];
  const doneCount = [state.learn].filter((p) => p === 'completed').length;

  // Calculate children progress
  const childrenDone = children.filter((c) => getEffectiveStatus(c.id, localStatus) === 'completed').length;

  return (
    <motion.div
      className={cn('node-item relative', {
        'completed': isCompleted,
        'current active': isActive,
        'locked': isLocked,
      })}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: isLocked ? 0.6 : 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Timeline dot */}
      <div className="absolute -left-[47px] top-1 w-[22px] h-[22px] rounded-full bg-background flex items-center justify-center z-10">
        {isCompleted && <CompletedIcon className="w-5 h-5 text-emerald-500" />}
        {isActive && (
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.9, 1, 0.9] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ActiveIcon className="w-5 h-5 text-blue-600" />
          </motion.div>
        )}
        {isLocked && <LockedIcon className="w-5 h-5 text-slate-300" />}
      </div>

      {/* Card */}
      <motion.div
        className={cn(
          'rounded-xl border p-5 transition-all duration-200',
          isLocked && 'border-slate-100 bg-slate-50/50 cursor-not-allowed',
          isActive && 'border-blue-200 bg-white shadow-sm shadow-blue-50',
          isCompleted && 'border-emerald-200 bg-emerald-50/30',
        )}
        whileHover={!isLocked ? { y: -2, boxShadow: '0 6px 20px rgba(0,0,0,0.04)' } : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {node.phase && (
              <span
                className={cn(
                  'text-[11px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase',
                  isActive && 'bg-blue-50 text-blue-600',
                  isCompleted && 'bg-emerald-100 text-emerald-700',
                  isLocked && 'bg-slate-100 text-slate-400',
                )}
              >
                {node.phase}
              </span>
            )}
            <span
              className={cn(
                'text-sm font-semibold',
                isLocked && 'text-slate-400',
                isActive && 'text-slate-900',
                isCompleted && 'text-emerald-800',
              )}
            >
              {node.title}
            </span>
          </div>
          <span className={cn(
            'text-[11px] font-mono',
            isCompleted ? 'text-emerald-600' : 'text-slate-400',
          )}>
            {isLocked ? `${childrenDone}/${children.length} 未解锁` : isCompleted ? `✓ ${childrenDone}/${children.length} 已完成` : `${childrenDone}/${children.length} 已修`}
          </span>
        </div>

        {/* Description */}
        {node.description && (
          <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{node.description}</p>
        )}

        {/* Children grid (expandable) */}
        {children.length > 0 && (
          <AnimatePresence>
            {(isActive || isCompleted) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                  {children.map((child) => (
                    <SubKnowledgeItem key={child.id} child={child} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Progress dots for active node */}
        {isActive && (
          <div className="flex items-center gap-1.5 mt-3">
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-colors',
                state.learn === 'completed' ? 'bg-blue-600' : state.learn !== 'idle' ? 'bg-blue-300' : 'bg-slate-200',
              )}
            />
            <span className="text-[10px] text-slate-400 ml-0.5">{doneCount}/1</span>
          </div>
        )}
      </motion.div>
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

  // All nodes in data.nodes are top-level (children are nested inside)
  const topLevelNodes = data.nodes ?? [];

  return (
    <MapContext.Provider value={ctx}>
      <div className="h-full flex flex-col bg-[#f8fafc]">
        {data.subtitle && (
          <div className="px-6 pt-4 pb-2">
            <p className="text-xs text-slate-400">{data.subtitle}</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
          <div className="relative pl-[36px] ml-3">
            {/* Timeline vertical dashed line */}
            <div
              className="absolute left-0 top-2.5 bottom-2.5 w-0.5"
              style={{
                backgroundImage: 'linear-gradient(to bottom, #cbd5e1 60%, rgba(255,255,255,0) 0%)',
                backgroundPosition: 'left',
                backgroundSize: '2px 10px',
                backgroundRepeat: 'repeat-y',
              }}
            />

            {/* Timeline nodes */}
            <div className="flex flex-col gap-8">
              {topLevelNodes.map((node) => (
                <TimelineNode key={node.id} node={node} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </MapContext.Provider>
  );
}
