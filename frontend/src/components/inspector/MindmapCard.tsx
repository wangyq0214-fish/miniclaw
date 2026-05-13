'use client';

import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Network, Copy, Check, Download, FileCode2, Loader2, Sparkles,
  BookOpen, Lightbulb, Zap, ZoomIn, ZoomOut, Maximize2,
} from 'lucide-react';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { expandMindmapNode, type MindmapTreeNode, type MindmapExtra } from '@/lib/api';
import { hierarchy, tree as d3Tree } from 'd3-hierarchy';
import { linkHorizontal } from 'd3-shape';

// ── Types ────────────────────────────────────────────────────────────────────

interface MindmapCardProps {
  path: string;
  content: string;
  onOpenInEditor?: () => void;
}

interface TreeNode extends MindmapTreeNode {
  _children?: TreeNode[];
  _id: string;
}

/** Node kept in DOM during exit animation */
interface ExitingNode {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  depth: number;
  title: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 44;
const NODE_RX = 10;
const ANIM_DURATION = 450;
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';

// Color palette matching reference design
const DEPTH_COLORS = [
  { bg: '#cdd4fd', text: '#1c2331' },  // root — purple-blue
  { bg: '#c1d3f9', text: '#1c2331' },  // depth 1 — light blue
  { bg: '#a4e2cc', text: '#1c2331' },  // depth 2 — light green
  { bg: '#f5d5a0', text: '#1c2331' },  // depth 3 — light amber
  { bg: '#d4d4d4', text: '#1c2331' },  // depth 4+ — light gray
];

const LINK_COLOR = '#8ba2e8';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseContent(content: string): MindmapTreeNode | null {
  try {
    const clean = content.replace(/^---[\s\S]*?---\s*/m, '').trim();
    const data = JSON.parse(clean);
    return data.tree || data;
  } catch {
    return null;
  }
}

function cleanTitle(title: string): string {
  return title.replace(/[✅🔶❓]/g, '').trim();
}

function truncate(text: string, max: number): string {
  const clean = cleanTitle(text);
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

function assignIds(node: MindmapTreeNode, path: string = ''): TreeNode {
  const currentPath = path ? `${path}/${node.title}` : node.title;
  return {
    ...node,
    _id: currentPath,
    children: (node.children || []).map((c) => assignIds(c, currentPath)),
  };
}

function getDepthColor(depth: number) {
  return DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];
}

function idToDepth(id: string): number {
  return id ? id.split('/').length - 1 : 0;
}

// ── Tree State Helpers ───────────────────────────────────────────────────────

function toggleNodeInTree(root: TreeNode, targetId: string): TreeNode {
  if (root._id === targetId) {
    if (root.children && root.children.length > 0) {
      return { ...root, _children: root.children as TreeNode[], children: [] };
    } else if (root._children && root._children.length > 0) {
      return { ...root, children: root._children, _children: undefined };
    }
    return root;
  }
  return {
    ...root,
    children: (root.children as TreeNode[]).map((c) => toggleNodeInTree(c, targetId)),
    _children: root._children?.map((c) => toggleNodeInTree(c, targetId)),
  };
}

// ── Layout Computation ───────────────────────────────────────────────────────

interface LayoutNode {
  x: number;  // vertical position
  y: number;  // horizontal position (depth)
  data: TreeNode;
  parent: LayoutNode | null;
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
}

function computeLayout(root: TreeNode): { nodes: LayoutNode[]; links: LayoutLink[] } {
  const h = hierarchy<TreeNode>(root, (d) => d.children.length > 0 ? (d.children as TreeNode[]) : undefined);
  const treeGen = d3Tree<TreeNode>().nodeSize([NODE_H + 16, NODE_W + 60]);
  treeGen(h);

  const nodes: LayoutNode[] = h.descendants().map((d) => ({
    x: d.x ?? 0,
    y: d.y ?? 0,
    data: d.data,
    parent: d.parent ? { x: d.parent.x ?? 0, y: d.parent.y ?? 0, data: d.parent.data, parent: null } : null,
  }));

  const links: LayoutLink[] = h.links().map((l) => ({
    source: { x: l.source.x ?? 0, y: l.source.y ?? 0, data: l.source.data, parent: null },
    target: { x: l.target.x ?? 0, y: l.target.y ?? 0, data: l.target.data, parent: null },
  }));

  return { nodes, links };
}

// ── Collect descendants for exit animation ───────────────────────────────────

function collectDescendants(
  root: TreeNode,
  targetId: string,
  layoutNodes: LayoutNode[],
): ExitingNode[] {
  const findNode = (n: TreeNode): TreeNode | null => {
    if (n._id === targetId) return n;
    for (const c of (n.children || []) as TreeNode[]) {
      const found = findNode(c);
      if (found) return found;
    }
    return null;
  };

  const target = findNode(root);
  if (!target?.children?.length) return [];

  const result: ExitingNode[] = [];
  const collect = (node: TreeNode) => {
    const layout = layoutNodes.find((n) => n.data._id === node._id);
    result.push({
      id: node._id,
      startX: layout ? layout.x : 0,
      startY: layout ? layout.y : 0,
      targetX: 0,
      targetY: 0,
      depth: idToDepth(node._id),
      title: node.title,
    });
    for (const c of (node.children || []) as TreeNode[]) {
      collect(c);
    }
  };
  for (const child of target.children as TreeNode[]) {
    collect(child);
  }
  return result;
}

// ── Link Generator ───────────────────────────────────────────────────────────

const linkGen = linkHorizontal<LayoutLink, { x: number; y: number }>()
  .x((d) => d.y)
  .y((d) => d.x);

// ── Status Indicator ─────────────────────────────────────────────────────────

function StatusDot({ title }: { title: string }) {
  if (title.includes('✅')) return <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#8CC084]" />;
  if (title.includes('🔶')) return <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#D4B96A]" />;
  if (title.includes('❓')) return <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#B0B0B0]" />;
  return null;
}

// ── Content Panel ────────────────────────────────────────────────────────────

function ContentPanel({
  node, onDeepDive, loading, extra,
}: {
  node: MindmapTreeNode;
  onDeepDive: () => void;
  loading: boolean;
  extra: MindmapExtra | null;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">{cleanTitle(node.title)}</h2>
          </div>
          {node.summary && (
            <p className="text-sm text-muted-foreground leading-relaxed pl-10">{node.summary}</p>
          )}
        </div>

        {node.details && node.details.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Lightbulb className="w-3 h-3" /> 核心要点
            </div>
            {node.details.map((d, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/8 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="text-foreground leading-relaxed">{d}</span>
              </div>
            ))}
          </div>
        )}

        {node.children && node.children.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              包含 {node.children.length} 个子概念
            </div>
            <div className="flex flex-wrap gap-1.5">
              {node.children.map((c, i) => (
                <span key={i} className="px-2.5 py-1 rounded-full bg-muted text-xs text-muted-foreground border border-border/50">
                  {truncate(c.title, 10)}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onDeepDive}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {extra ? '已深入理解' : '深入理解'}
        </button>

        {extra && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {extra.explanation && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <BookOpen className="w-3 h-3" /> 详细解释
                </div>
                <div className="bg-accent/40 rounded-xl p-3 border border-border/50">
                  <p className="text-sm text-foreground leading-relaxed">{extra.explanation}</p>
                </div>
              </div>
            )}
            {extra.examples?.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Lightbulb className="w-3 h-3" /> 典型例子
                </div>
                {extra.examples.map((ex, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm bg-amber-50/50 rounded-lg px-3 py-2 border border-amber-200/30">
                    <span className="text-amber-500 text-xs">💡</span>
                    <span className="text-foreground">{ex}</span>
                  </div>
                ))}
              </div>
            )}
            {extra.applications?.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Zap className="w-3 h-3" /> 实际应用
                </div>
                {extra.applications.map((app, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm bg-green-50/50 rounded-lg px-3 py-2 border border-green-200/30">
                    <span className="text-green-500 text-xs">⚡</span>
                    <span className="text-foreground">{app}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header({
  path, copied, onCopy, onDownload, onOpenInEditor,
}: {
  path: string; copied: boolean; onCopy: () => void; onDownload: () => void; onOpenInEditor?: () => void;
}) {
  const title = path.split('/').pop()?.replace(/\.json$/, '') || '知识导图';
  return (
    <header className="h-14 border-b border-gray-100 flex items-center justify-between px-6 bg-white shrink-0 z-20 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded flex items-center justify-center border border-blue-100">
          <Network className="w-4 h-4" />
        </div>
        <h1 className="text-[15px] font-bold text-gray-800">{title}</h1>
        <div className="w-px h-4 bg-gray-200 mx-2" />
        <span className="text-[12px] text-gray-400 font-mono">{path}</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onCopy} className="p-1.5 rounded-md hover:bg-gray-50 transition-colors">
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
        </button>
        <button onClick={onDownload} className="p-1.5 rounded-md hover:bg-gray-50 transition-colors">
          <Download className="w-3.5 h-3.5 text-gray-400" />
        </button>
        {onOpenInEditor && (
          <button onClick={onOpenInEditor} className="p-1.5 rounded-md hover:bg-gray-50 transition-colors">
            <FileCode2 className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
    </header>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MindmapCard({ path, content, onOpenInEditor }: MindmapCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const isPanning = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<MindmapTreeNode | null>(null);
  const [extraMap, setExtraMap] = useState<Record<string, MindmapExtra>>({});
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Exit animation
  const [exitingNodes, setExitingNodes] = useState<ExitingNode[]>([]);
  // Enter animation
  const [enteringNodes, setEnteringNodes] = useState<{ id: string; parentX: number; parentY: number }[]>([]);
  // Refs for FLIP animation
  const exitRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const enterRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Pure React transform state
  const [tx, setTx] = useState(NODE_W / 2 + 40);
  const [ty, setTy] = useState(0);
  const [scale, setScale] = useState(0.8);
  const initialized = useRef(false);

  const rawTree = useMemo(() => parseContent(content), [content]);

  // Initialize tree with IDs
  useEffect(() => {
    if (rawTree) {
      setTreeData(assignIds(rawTree));
    }
  }, [rawTree]);

  // Set initial vertical center once container has layout
  useEffect(() => {
    if (initialized.current) return;
    const el = containerRef.current;
    if (el && el.clientHeight > 0) {
      setTy(el.clientHeight / 2);
      initialized.current = true;
    }
  });

  // Compute layout
  const { nodes, links } = useMemo(() => {
    if (!treeData) return { nodes: [], links: [] };
    return computeLayout(treeData);
  }, [treeData]);

  // ── FLIP animation for exiting nodes ──────────────────────────────────
  useLayoutEffect(() => {
    if (exitingNodes.length === 0) return;

    const refMap = exitRefs.current;
    const cleanups: (() => void)[] = [];

    for (const ex of exitingNodes) {
      const el = refMap.get(ex.id);
      if (!el) continue;

      const startX = ex.startY - NODE_W / 2;
      const startY = ex.startX - NODE_H / 2;

      el.style.transition = 'none';
      el.style.left = `${startX}px`;
      el.style.top = `${startY}px`;
      el.style.opacity = '1';

      el.getBoundingClientRect();

      const targetX = ex.targetY - NODE_W / 2;
      const targetY = ex.targetX - NODE_H / 2;
      el.style.transition = `left ${ANIM_DURATION}ms ${EASE}, top ${ANIM_DURATION}ms ${EASE}, opacity ${ANIM_DURATION}ms ${EASE}`;
      el.style.left = `${targetX}px`;
      el.style.top = `${targetY}px`;
      el.style.opacity = '0';

      cleanups.push(() => {
        el.style.transition = '';
        el.style.opacity = '';
      });
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [exitingNodes]);

  // ── FLIP animation for entering nodes ─────────────────────────────────
  useLayoutEffect(() => {
    if (enteringNodes.length === 0) return;

    const refMap = enterRefs.current;
    const cleanups: (() => void)[] = [];

    for (const en of enteringNodes) {
      const el = refMap.get(en.id);
      if (!el) continue;

      // Read target position from React's style
      const targetX = parseFloat(el.style.left) || 0;
      const targetY = parseFloat(el.style.top) || 0;

      // Parent position in SVG coords
      const parentLeft = en.parentY - NODE_W / 2;
      const parentTop = en.parentX - NODE_H / 2;

      el.style.transition = 'none';
      el.style.left = `${parentLeft}px`;
      el.style.top = `${parentTop}px`;
      el.style.opacity = '0';

      el.getBoundingClientRect();

      el.style.transition = `left ${ANIM_DURATION}ms ${EASE}, top ${ANIM_DURATION}ms ${EASE}, opacity ${ANIM_DURATION}ms ${EASE}`;
      el.style.left = `${targetX}px`;
      el.style.top = `${targetY}px`;
      el.style.opacity = '1';

      cleanups.push(() => {
        el.style.transition = '';
        el.style.opacity = '';
      });
    }

    const timer = setTimeout(() => setEnteringNodes([]), ANIM_DURATION + 50);

    return () => {
      clearTimeout(timer);
      cleanups.forEach((fn) => fn());
    };
  }, [enteringNodes]);

  // ── Zoom (wheel) ──────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setScale((prevK) => {
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const newK = Math.min(3, Math.max(0.2, prevK * factor));
      const ratio = newK / prevK;

      setTx((prevTx) => mx - ratio * (mx - prevTx));
      setTy((prevTy) => my - ratio * (my - prevTy));

      return newK;
    });
  }, []);

  // ── Pan (drag) ────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = false;
    panStart.current = { x: e.clientX, y: e.clientY, tx, ty };
  }, [tx, ty]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panStart.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;

    if (!isPanning.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      isPanning.current = true;
      setIsDragging(true);
    }

    if (isPanning.current) {
      setTx(panStart.current.tx + dx);
      setTy(panStart.current.ty + dy);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    panStart.current = null;
    isPanning.current = false;
    setIsDragging(false);
  }, []);

  // ── Node click ────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((id: string, node: MindmapTreeNode) => {
    if (isPanning.current) return;
    setSelectedId(id);
    setSelectedNode(node);
  }, []);

  // ── Toggle with exit animation ────────────────────────────────────────
  const handleToggle = useCallback((id: string) => {
    if (!treeData) return;

    const findNode = (n: TreeNode): TreeNode | null => {
      if (n._id === id) return n;
      for (const c of (n.children || []) as TreeNode[]) {
        const found = findNode(c);
        if (found) return found;
      }
      return null;
    };
    const target = findNode(treeData);
    const isCollapsing = !!target?.children?.length;

    if (isCollapsing) {
      const exits = collectDescendants(treeData, id, nodes);
      const parentLayout = nodes.find((n) => n.data._id === id);
      if (parentLayout) {
        for (const ex of exits) {
          ex.targetX = parentLayout.x;
          ex.targetY = parentLayout.y;
        }
      }
      setExitingNodes(exits);
      setTimeout(() => setExitingNodes([]), ANIM_DURATION + 100);
    }

    if (!isCollapsing && target?._children?.length) {
      const parentLayout = nodes.find((n) => n.data._id === id);
      if (parentLayout) {
        const enters = target._children.map((child) => ({
          id: child._id,
          parentX: parentLayout.x,
          parentY: parentLayout.y,
        }));
        setEnteringNodes(enters);
      }
    }

    setTreeData((prev) => {
      if (!prev) return prev;
      return toggleNodeInTree(prev, id);
    });
  }, [treeData, nodes]);

  // Deep dive
  const handleDeepDive = useCallback(async () => {
    if (!selectedNode || loadingPath) return;
    if (extraMap[selectedId]) return;
    setLoadingPath(selectedId);
    try {
      const ctx = [
        selectedNode.summary ? `概念：${selectedNode.summary}` : '',
        selectedNode.details?.length ? `要点：${selectedNode.details.join('；')}` : '',
      ].filter(Boolean).join('\n');
      const res = await expandMindmapNode(selectedNode.title, ctx);
      setExtraMap((prev) => ({ ...prev, [selectedId]: res.extra }));
    } catch (err) {
      console.error('expand error:', err);
    } finally {
      setLoadingPath(null);
    }
  }, [selectedNode, selectedId, extraMap, loadingPath]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cx = (el.clientWidth || 600) / 2;
    const cy = (el.clientHeight || 400) / 2;
    setScale((prevK) => {
      const newK = Math.min(3, prevK * 1.3);
      const ratio = newK / prevK;
      setTx((prevTx) => cx - ratio * (cx - prevTx));
      setTy((prevTy) => cy - ratio * (cy - prevTy));
      return newK;
    });
  }, []);

  const zoomOut = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cx = (el.clientWidth || 600) / 2;
    const cy = (el.clientHeight || 400) / 2;
    setScale((prevK) => {
      const newK = Math.max(0.2, prevK / 1.3);
      const ratio = newK / prevK;
      setTx((prevTx) => cx - ratio * (cx - prevTx));
      setTy((prevTy) => cy - ratio * (cy - prevTy));
      return newK;
    });
  }, []);

  const zoomFit = useCallback(() => {
    if (!containerRef.current || nodes.length === 0) return;
    const el = containerRef.current;
    const w = el.clientWidth || 600;
    const h = el.clientHeight || 400;

    let yMin = Infinity, yMax = -Infinity, xMin = Infinity, xMax = -Infinity;
    for (const n of nodes) {
      if (n.y - NODE_W / 2 < yMin) yMin = n.y - NODE_W / 2;
      if (n.y + NODE_W / 2 > yMax) yMax = n.y + NODE_W / 2;
      if (n.x - NODE_H / 2 < xMin) xMin = n.x - NODE_H / 2;
      if (n.x + NODE_H / 2 > xMax) xMax = n.x + NODE_H / 2;
    }

    const treeW = yMax - yMin;
    const treeH = xMax - xMin;
    const pad = 40;
    const fitScale = Math.min((w - pad * 2) / treeW, (h - pad * 2) / treeH, 1.2);
    const cx = (yMin + yMax) / 2;
    const cy = (xMin + xMax) / 2;

    setScale(fitScale);
    setTx(w / 2 - cx * fitScale);
    setTy(h / 2 - cy * fitScale);
  }, [nodes]);

  // Copy / Download
  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }, [content]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = path.split('/').pop() || 'mindmap.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [content, path]);

  // Non-JSON fallback
  const isJson = useMemo(() => {
    try { JSON.parse(content.replace(/^---[\s\S]*?---\s*/m, '').trim()); return true; } catch { return false; }
  }, [content]);

  if (!isJson) {
    return (
      <div className="h-full flex flex-col bg-white">
        <Header path={path} copied={copied} onCopy={handleCopy} onDownload={handleDownload} onOpenInEditor={onOpenInEditor} />
        <div className="flex-1 overflow-y-auto p-5"><MarkdownRenderer content={content} /></div>
      </div>
    );
  }

  if (!treeData) {
    return (
      <div className="h-full flex flex-col bg-white">
        <Header path={path} copied={copied} onCopy={handleCopy} onDownload={handleDownload} onOpenInEditor={onOpenInEditor} />
        <div className="flex-1 flex items-center justify-center text-sm text-destructive">无法解析思维导图 JSON</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white text-gray-800 font-sans overflow-hidden">
      <Header path={path} copied={copied} onCopy={handleCopy} onDownload={handleDownload} onOpenInEditor={onOpenInEditor} />

      <div className="flex-1 flex min-h-0">
        {/* Left: Canvas */}
        <div
          ref={containerRef}
          className="flex-[3] relative min-w-0 border-r border-gray-100 bg-[#fafafa] overflow-hidden"
          style={{ minHeight: 300, cursor: isDragging ? 'grabbing' : 'grab' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Transform container */}
          <div
            className="absolute"
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transformOrigin: '0 0',
              willChange: 'transform',
            }}
          >
            {/* SVG connection lines */}
            <svg
              className="absolute overflow-visible pointer-events-none"
              style={{ left: 0, top: 0, width: 1, height: 1 }}
            >
              {links.map((link) => (
                <path
                  key={`link-${link.source.data._id}-${link.target.data._id}`}
                  d={linkGen(link) || ''}
                  fill="none"
                  stroke={LINK_COLOR}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  opacity={0.9}
                  style={{ transition: `d ${ANIM_DURATION}ms ${EASE}` }}
                />
              ))}
            </svg>

            {/* Exiting nodes (FLIP-animated) */}
            {exitingNodes.map((ex) => {
              const color = getDepthColor(ex.depth);
              return (
                <div
                  key={`exit-${ex.id}`}
                  ref={(el) => {
                    if (el) exitRefs.current.set(ex.id, el);
                    else exitRefs.current.delete(ex.id);
                  }}
                  className="absolute px-4 py-2 rounded-lg whitespace-nowrap shadow-sm pointer-events-none"
                  style={{
                    left: `${ex.targetY - NODE_W / 2}px`,
                    top: `${ex.targetX - NODE_H / 2}px`,
                    width: `${NODE_W}px`,
                    height: `${NODE_H}px`,
                    backgroundColor: color.bg,
                    color: color.text,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {truncate(ex.title, 12)}
                </div>
              );
            })}

            {/* Active nodes */}
            {nodes.map((node) => {
              const depth = idToDepth(node.data._id);
              const color = getDepthColor(depth);
              const isSelected = node.data._id === selectedId;
              const hasChildren = node.data.children.length > 0 || (node.data._children && node.data._children.length > 0);
              const isCollapsed = node.data._children && node.data._children.length > 0;
              const isEntering = enteringNodes.some((en) => en.id === node.data._id);

              return (
                <div
                  key={node.data._id}
                  ref={isEntering ? (el) => {
                    if (el) enterRefs.current.set(node.data._id, el);
                    else enterRefs.current.delete(node.data._id);
                  } : undefined}
                  className="absolute pointer-events-auto transition-shadow"
                  style={{
                    left: `${node.y - NODE_W / 2}px`,
                    top: `${node.x - NODE_H / 2}px`,
                    width: `${NODE_W}px`,
                    height: `${NODE_H}px`,
                    transition: `left ${ANIM_DURATION}ms ${EASE}, top ${ANIM_DURATION}ms ${EASE}`,
                  }}
                >
                  {/* Node body */}
                  <div
                    className="w-full h-full px-4 py-2 rounded-lg whitespace-nowrap shadow-sm flex items-center justify-center cursor-pointer transition-all"
                    style={{
                      backgroundColor: color.bg,
                      color: color.text,
                      fontSize: depth === 0 ? '15px' : '14px',
                      fontWeight: depth === 0 ? 500 : 400,
                      outline: isSelected ? '2px solid #93aafd' : 'none',
                      outlineOffset: '1px',
                    }}
                    onClick={() => handleNodeClick(node.data._id, node.data)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 0 0 2px #93c5fd';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    <span className="truncate">{truncate(node.data.title, 12)}</span>
                    <StatusDot title={node.data.title} />
                  </div>

                  {/* Expand/collapse button */}
                  {hasChildren && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-colors shadow-sm"
                      style={{
                        right: '-22px',
                        backgroundColor: color.bg,
                        color: color.text,
                      }}
                      onClick={(e) => { e.stopPropagation(); handleToggle(node.data._id); }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '0.8';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={isCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Zoom controls - horizontal floating panel */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white border border-gray-100 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.08)] rounded-xl flex items-center p-1 gap-1 text-gray-500 z-10">
            <button onClick={zoomFit} className="p-2 hover:bg-gray-50 hover:text-gray-800 rounded-lg transition-colors" title="适应屏幕">
              <Maximize2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button onClick={zoomOut} className="p-2 hover:bg-gray-50 hover:text-gray-800 rounded-lg transition-colors" title="缩小">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium px-1 select-none min-w-[3ch] text-center">{Math.round(scale * 100)}%</span>
            <button onClick={zoomIn} className="p-2 hover:bg-gray-50 hover:text-gray-800 rounded-lg transition-colors" title="放大">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Content Panel */}
        <div className="flex-[2] min-w-0">
          {selectedNode ? (
            <ContentPanel
              node={selectedNode}
              onDeepDive={handleDeepDive}
              loading={loadingPath === selectedId}
              extra={extraMap[selectedId] || null}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                  <BookOpen className="w-7 h-7 opacity-30" />
                </div>
                <div>
                  <p className="text-sm font-medium">点击节点查看详情</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">点击箭头展开子节点</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
