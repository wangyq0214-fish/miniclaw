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
  /** Node's CURRENT position (where animation STARTS) */
  startX: number;
  startY: number;
  /** Parent's position (where animation ENDS) */
  targetX: number;
  targetY: number;
  /** Depth for color */
  depth: number;
  /** Title for display */
  title: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 44;
const NODE_RX = 10;
const ANIM_DURATION = 450; // ms — 400~500ms range
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'; // ≈ d3.easeCubicInOut

// Morandi soft palette
const DEPTH_COLORS = [
  { bg: '#D0D7FF', text: '#1A1A1A' },  // root — light blue-purple
  { bg: '#AEE5D1', text: '#1A1A1A' },  // depth 1 — light green
  { bg: '#F5D5A0', text: '#1A1A1A' },  // depth 2 — light amber
  { bg: '#D4B8E0', text: '#1A1A1A' },  // depth 3 — light violet
  { bg: '#C8C8C8', text: '#1A1A1A' },  // depth 4+ — light gray
];

const LINK_COLOR = '#A4B4FF';

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
      targetX: 0, // filled in handleToggle
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
  if (title.includes('✅')) return <circle cx={NODE_W - 12} cy={NODE_H / 2} r={3.5} fill="#8CC084" />;
  if (title.includes('🔶')) return <circle cx={NODE_W - 12} cy={NODE_H / 2} r={3.5} fill="#D4B96A" />;
  if (title.includes('❓')) return <circle cx={NODE_W - 12} cy={NODE_H / 2} r={3.5} fill="#B0B0B0" />;
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
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
      <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        <Network className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate">知识导图</div>
        <div className="text-[11px] text-muted-foreground font-mono truncate">{path}</div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onCopy} className="p-1.5 rounded-md hover:bg-accent transition-colors">
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
        <button onClick={onDownload} className="p-1.5 rounded-md hover:bg-accent transition-colors">
          <Download className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        {onOpenInEditor && (
          <button onClick={onOpenInEditor} className="p-1.5 rounded-md hover:bg-accent transition-colors">
            <FileCode2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MindmapCard({ path, content, onOpenInEditor }: MindmapCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const isPanning = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<MindmapTreeNode | null>(null);
  const [extraMap, setExtraMap] = useState<Record<string, MindmapExtra>>({});
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Exit animation: nodes kept in DOM during collapse, animated via FLIP
  const [exitingNodes, setExitingNodes] = useState<ExitingNode[]>([]);
  // Enter animation: new children animated from parent position to target
  const [enteringNodes, setEnteringNodes] = useState<{ id: string; parentX: number; parentY: number }[]>([]);
  // Refs for FLIP animation
  const exitRefs = useRef<Map<string, SVGGElement>>(new Map());
  const enterRefs = useRef<Map<string, SVGGElement>>(new Map());

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

  // Set initial vertical center once SVG has layout
  useEffect(() => {
    if (initialized.current) return;
    const el = svgRef.current;
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
  // Runs AFTER React commits new exiting nodes to DOM, BEFORE browser paints
  useLayoutEffect(() => {
    if (exitingNodes.length === 0) return;

    const refMap = exitRefs.current;
    const cleanups: (() => void)[] = [];

    for (const ex of exitingNodes) {
      const el = refMap.get(ex.id);
      if (!el) continue;

      // Use snapshot positions from ExitingNode (captured BEFORE tree update)
      const startX = ex.startY - NODE_W / 2;   // tree y → SVG x
      const startY = ex.startX - NODE_H / 2;   // tree x → SVG y

      // Step 1: Position at old position, NO transition (before browser paints)
      el.style.transition = 'none';
      el.setAttribute('transform', `translate(${startX}, ${startY})`);
      el.style.opacity = '1';

      // Step 2: Force synchronous layout — browser commits the old position
      el.getBoundingClientRect();

      // Step 3: Animate to parent's position + fade out
      const targetX = ex.targetY - NODE_W / 2;
      const targetY = ex.targetX - NODE_H / 2;
      el.style.transition = `transform ${ANIM_DURATION}ms ${EASE}, opacity ${ANIM_DURATION}ms ${EASE}`;
      el.setAttribute('transform', `translate(${targetX}, ${targetY})`);
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
  // New children start at parent position, animate to their target
  useLayoutEffect(() => {
    if (enteringNodes.length === 0) return;

    const refMap = enterRefs.current;
    const cleanups: (() => void)[] = [];

    for (const en of enteringNodes) {
      const el = refMap.get(en.id);
      if (!el) continue;

      // Step 1: Read the target position from React's transform BEFORE overriding
      const attr = el.getAttribute('transform') || '';
      const match = attr.match(/translate\(\s*([^,\s]+)[\s,]+([^)\s]+)\s*\)/);
      const targetX = match ? parseFloat(match[1]) : 0;
      const targetY = match ? parseFloat(match[2]) : 0;

      // Parent position in SVG coords (tree y → SVG x, tree x → SVG y)
      const parentSvgX = en.parentY - NODE_W / 2;
      const parentSvgY = en.parentX - NODE_H / 2;

      // Step 2: Place at parent position, no transition (use setAttribute for SVG)
      el.style.transition = 'none';
      el.setAttribute('transform', `translate(${parentSvgX}, ${parentSvgY})`);
      el.style.opacity = '0';

      // Step 3: Force layout commit
      el.getBoundingClientRect();

      // Step 4: Animate to target position + fade in
      el.style.transition = `transform ${ANIM_DURATION}ms ${EASE}, opacity ${ANIM_DURATION}ms ${EASE}`;
      el.setAttribute('transform', `translate(${targetX}, ${targetY})`);
      el.style.opacity = '1';

      cleanups.push(() => {
        el.style.transition = '';
        el.style.opacity = '';
      });
    }

    // Clear entering state after animation
    const timer = setTimeout(() => setEnteringNodes([]), ANIM_DURATION + 50);

    return () => {
      clearTimeout(timer);
      cleanups.forEach((fn) => fn());
    };
  }, [enteringNodes]);

  // ── Zoom (wheel) ──────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const rect = svgEl.getBoundingClientRect();
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

  // ── Node click (only fire if not a drag) ──────────────────────────────
  const handleNodeClick = useCallback((id: string, node: MindmapTreeNode) => {
    if (isPanning.current) return;
    setSelectedId(id);
    setSelectedNode(node);
  }, []);

  // ── Toggle with exit animation ────────────────────────────────────────
  const handleToggle = useCallback((id: string) => {
    if (!treeData) return;

    // Determine if collapsing
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
      // Collect descendants BEFORE tree update
      const exits = collectDescendants(treeData, id, nodes);
      // Fill in parent's CURRENT position as the animation target
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

    // When expanding, collect entering children with parent position
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

    // Update tree (triggers layout recomputation)
    setTreeData((prev) => {
      if (!prev) return prev;
      return toggleNodeInTree(prev, id);
    });
  }, [treeData, nodes]);

  // Handle deep dive
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
    const el = svgRef.current;
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
    const el = svgRef.current;
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
    if (!svgRef.current || nodes.length === 0) return;
    const el = svgRef.current;
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
      <div className="h-full flex flex-col bg-card">
        <Header path={path} copied={copied} onCopy={handleCopy} onDownload={handleDownload} onOpenInEditor={onOpenInEditor} />
        <div className="flex-1 overflow-y-auto p-5"><MarkdownRenderer content={content} /></div>
      </div>
    );
  }

  if (!treeData) {
    return (
      <div className="h-full flex flex-col bg-card">
        <Header path={path} copied={copied} onCopy={handleCopy} onDownload={handleDownload} onOpenInEditor={onOpenInEditor} />
        <div className="flex-1 flex items-center justify-center text-sm text-destructive">无法解析思维导图 JSON</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <Header path={path} copied={copied} onCopy={handleCopy} onDownload={handleDownload} onOpenInEditor={onOpenInEditor} />

      <div className="flex-1 flex min-h-0">
        {/* Left: SVG Tree */}
        <div className="flex-[3] relative min-w-0 border-r border-border" style={{ minHeight: 300, overflow: 'hidden' }}>
          <svg
            ref={svgRef}
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <defs>
              <filter id="drop-shadow" x="-10%" y="-10%" width="120%" height="130%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.06" />
              </filter>
            </defs>
            <g transform={`translate(${tx},${ty}) scale(${scale})`}>
              {/* ── Links ── */}
              {links.map((link) => (
                <path
                  key={`link-${link.source.data._id}-${link.target.data._id}`}
                  d={linkGen(link) || ''}
                  fill="none"
                  stroke={LINK_COLOR}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  shapeRendering="geometricPrecision"
                  style={{ transition: `d ${ANIM_DURATION}ms ${EASE}` }}
                />
              ))}

              {/* ── Exiting nodes (FLIP-animated) ── */}
              {exitingNodes.map((ex) => {
                const color = getDepthColor(ex.depth);
                return (
                  <g
                    key={`exit-${ex.id}`}
                    ref={(el) => {
                      if (el) exitRefs.current.set(ex.id, el);
                      else exitRefs.current.delete(ex.id);
                    }}
                    // React sets initial position; useLayoutEffect will override for FLIP
                    transform={`translate(${ex.targetY - NODE_W / 2},${ex.targetX - NODE_H / 2})`}
                    style={{ pointerEvents: 'none' }}
                  >
                    <rect
                      width={NODE_W} height={NODE_H}
                      rx={NODE_RX} ry={NODE_RX}
                      style={{ fill: color.bg, opacity: 0.9 }}
                    />
                    <text
                      x={NODE_W / 2} y={NODE_H / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={14} fontWeight={500} fill={color.text}
                    >
                      {truncate(ex.title, 12)}
                    </text>
                  </g>
                );
              })}

              {/* ── Active nodes ── */}
              {nodes.map((node) => {
                const depth = idToDepth(node.data._id);
                const color = getDepthColor(depth);
                const isSelected = node.data._id === selectedId;
                const hasChildren = node.data.children.length > 0 || (node.data._children && node.data._children.length > 0);
                const isCollapsed = node.data._children && node.data._children.length > 0;
                const isEntering = enteringNodes.some((en) => en.id === node.data._id);

                return (
                  <g
                    key={node.data._id}
                    ref={isEntering ? (el) => {
                      if (el) enterRefs.current.set(node.data._id, el);
                      else enterRefs.current.delete(node.data._id);
                    } : undefined}
                    transform={`translate(${node.y - NODE_W / 2},${node.x - NODE_H / 2})`}
                    style={{
                      cursor: 'pointer',
                      transition: `transform ${ANIM_DURATION}ms ${EASE}`,
                    }}
                    onClick={() => handleNodeClick(node.data._id, node.data)}
                  >
                    <rect
                      x={0} y={0}
                      width={NODE_W} height={NODE_H}
                      rx={NODE_RX} ry={NODE_RX}
                      fill={color.bg}
                      stroke={isSelected ? '#8B9DFF' : 'transparent'}
                      strokeWidth={isSelected ? 2 : 0}
                      style={{
                        transition: `stroke 200ms ${EASE}, stroke-width 200ms ${EASE}`,
                      }}
                    />
                    {hasChildren && (
                      <g
                        onClick={(e) => { e.stopPropagation(); handleToggle(node.data._id); }}
                        style={{ cursor: 'pointer' }}
                      >
                        <circle
                          cx={NODE_W + 10} cy={NODE_H / 2} r={8}
                          fill="#fff"
                          stroke="#C8C8C8" strokeWidth={1}
                        />
                        <text
                          x={NODE_W + 10} y={NODE_H / 2}
                          textAnchor="middle" dominantBaseline="central"
                          fontSize={11} fontWeight={500}
                          fill="#888"
                        >
                          {isCollapsed ? '+' : '−'}
                        </text>
                      </g>
                    )}
                    <text
                      x={NODE_W / 2 - 6} y={NODE_H / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={14}
                      fontWeight={depth === 0 ? 500 : 400}
                      fill={color.text}
                      style={{ pointerEvents: 'none' }}
                    >
                      {truncate(node.data.title, 12)}
                    </text>
                    <StatusDot title={node.data.title} />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 flex flex-col gap-1 bg-background/80 backdrop-blur rounded-lg border border-border p-1">
            <button onClick={zoomIn} className="p-1.5 rounded hover:bg-accent transition-colors" title="放大">
              <ZoomIn className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={zoomOut} className="p-1.5 rounded hover:bg-accent transition-colors" title="缩小">
              <ZoomOut className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={zoomFit} className="p-1.5 rounded hover:bg-accent transition-colors" title="适应">
              <Maximize2 className="w-4 h-4 text-muted-foreground" />
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
                  <p className="text-xs text-muted-foreground/70 mt-0.5">点击 + 展开子节点</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
