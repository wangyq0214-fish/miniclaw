'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Graph, register, ExtensionCategory, D3ForceLayout, DagreLayout } from '@antv/g6';
import { Search, Loader2, Network, X } from 'lucide-react';
import {
  getEntityGraph,
  getGraphRoot,
  getNodeChildren,
  getTracebackGraph,
  type GraphData,
  type GraphNode,
  type TracebackData,
} from '@/lib/api';
import { useApp } from '@/lib/store';

// ── Register G6 extensions ─────────────────────────────

let registered = false;
function ensureRegistered() {
  if (registered) return;
  register(ExtensionCategory.LAYOUT, 'd3force', D3ForceLayout);
  register(ExtensionCategory.LAYOUT, 'dagre', DagreLayout);
  registered = true;
}

// ── Node color scheme ──────────────────────────────────

const NODE_COLORS_LIGHT: Record<string, { fill: string; stroke: string }> = {
  entity: { fill: '#EEF2FF', stroke: '#818CF8' },
  course: { fill: '#FEF3C7', stroke: '#F59E0B' },
  chapter: { fill: '#DBEAFE', stroke: '#60A5FA' },
  section: { fill: '#D1FAE5', stroke: '#34D399' },
};

const NODE_COLORS_DARK: Record<string, { fill: string; stroke: string }> = {
  entity: { fill: '#2e2b3d', stroke: '#818CF8' },
  course: { fill: '#3d3520', stroke: '#F59E0B' },
  chapter: { fill: '#1e293b', stroke: '#60A5FA' },
  section: { fill: '#1a2e25', stroke: '#34D399' },
};

function getNodeColors() {
  const isDark = document.documentElement.classList.contains('dark');
  return isDark ? NODE_COLORS_DARK : NODE_COLORS_LIGHT;
}

type GraphMode = 'entity' | 'course';

// ── Main Component ─────────────────────────────────────

export function KnowledgeGraph() {
  const { actions } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const [mode, setMode] = useState<GraphMode>('entity');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const expandedNodesRef = useRef<Set<string>>(new Set());
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);
  const [isTraceback, setIsTraceback] = useState(false);
  const [searchType, setSearchType] = useState<'entity' | 'section' | 'chapter' | 'course'>('entity');

  // Saved course state — preserves expansion when switching to entity mode and back
  const savedCourseRef = useRef<{
    graphData: GraphData;
    expandedNodes: Set<string>;
    childrenMap: Map<string, Set<string>>;
  } | null>(null);

  // Sync selectedNode and graphData to global store (for Sidebar detail panel)
  useEffect(() => {
    actions.setSelectedGraphNode(selectedNode);
  }, [selectedNode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    actions.setGraphData(graphData);
  }, [graphData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    actions.setIsTraceback(isTraceback);
  }, [isTraceback]); // eslint-disable-line react-hooks/exhaustive-deps


  // Track parent → children mapping for collapse
  const childrenMapRef = useRef<Map<string, Set<string>>>(new Map());

  // ── Layout config ────────────────────────────────────

  const getLayout = useCallback((m: GraphMode, traceback: boolean) => {
    if (traceback) {
      return {
        type: 'dagre',
        rankdir: 'LR',
        align: 'UL',
        nodesep: 30,
        ranksep: 80,
      };
    }
    return {
      type: 'd3force',
      preventOverlap: true,
      nodeSize: 60,
      linkDistance: 180,
      nodeStrength: -300,
      collideStrength: 0.9,
      alphaDecay: 0.08,
      velocityDecay: 0.4,
    };
  }, []);

  // ── Init graph ──────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    ensureRegistered();

    let graph: Graph | null = null;
    let observer: ResizeObserver | null = null;
    let destroyed = false;

    function createGraph(el: HTMLDivElement) {
      if (destroyed) return;

      const g = new Graph({
        container: el,
        autoResize: true,
        autoFit: 'view',
        padding: 60,
        data: { nodes: [], edges: [] },
        layout: getLayout('entity', false),
        node: {
          style: {
            size: 48,
            fill: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown>;
              const override = data?.style as Record<string, unknown> | undefined;
              if (override?.fill) return override.fill as string;
              const nodeType = data?.type as string;
              const colors = getNodeColors();
              return colors[nodeType]?.fill || colors.entity.fill;
            },
            stroke: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown>;
              const override = data?.style as Record<string, unknown> | undefined;
              if (override?.stroke) return override.stroke as string;
              const nodeType = data?.type as string;
              const colors = getNodeColors();
              return colors[nodeType]?.stroke || colors.entity.stroke;
            },
            lineWidth: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown>;
              const override = data?.style as Record<string, unknown> | undefined;
              return (override?.lineWidth as number) ?? 2;
            },
            radius: 8,
            labelText: (d: Record<string, unknown>) => {
              const name = ((d.data as Record<string, unknown>)?.name as string) || '';
              return name.length > 12 ? name.slice(0, 12) + '…' : name;
            },
            labelFontSize: 11,
            labelFill: () => {
              const isDark = document.documentElement.classList.contains('dark');
              return isDark ? '#d4d4d8' : '#374151'; // zinc-300 in dark, gray-700 in light
            },
            labelPlacement: 'bottom',
            labelOffsetY: 8,
            cursor: 'pointer',
            shadowColor: 'rgba(0,0,0,0.06)',
            shadowBlur: 8,
            shadowOffsetY: 2,
          },
          state: {
            selected: {
              stroke: '#F97316',
              lineWidth: 3,
              shadowColor: 'rgba(249,115,22,0.3)',
              shadowBlur: 16,
            },
          },
        },
        edge: {
          style: {
            stroke: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown>;
              const override = data?.style as Record<string, unknown> | undefined;
              if (override?.stroke) return override.stroke as string;
              const isDark = document.documentElement.classList.contains('dark');
              return isDark ? '#3f3f46' : '#CBD5E1'; // zinc-700 in dark, slate-200 in light
            },
            lineWidth: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown>;
              const override = data?.style as Record<string, unknown> | undefined;
              return (override?.lineWidth as number) ?? 1.5;
            },
            endArrow: true,
            endArrowSize: 6,
            endArrowFill: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown>;
              const override = data?.style as Record<string, unknown> | undefined;
              if (override?.endArrowFill) return override.endArrowFill as string;
              const isDark = document.documentElement.classList.contains('dark');
              return isDark ? '#3f3f46' : '#CBD5E1';
            },
            curveOffset: 0,
            curvePosition: 0.5,
          },
        },
        behaviors: [
          'drag-canvas',
          'zoom-canvas',
          'click-select',
        ],
        plugins: [
          {
            type: 'minimap',
            key: 'minimap',
            size: [160, 100],
          },
        ],
      });

      graphRef.current = g;
      graph = g;

      // Node click handler — use G6 event system
      g.on('node:click', (event: any) => {
        const target = event.target as Record<string, unknown> | undefined;
        const nodeId = target?.id as string;
        if (!nodeId) return;

        try {
          const nodeData = g.getNodeData(nodeId) as Record<string, unknown> | undefined;
          const data = nodeData?.data as Record<string, unknown> | undefined;
          if (!data) return;

          const node: GraphNode = {
            id: nodeId,
            name: (data.name as string) || '',
            type: (data.type as string) || 'entity',
            occurrence: data.occurrence as number | undefined,
            entity_type: data.entity_type as string | undefined,
            description: data.description as string | undefined,
            chapters: data.chapters as string | undefined,
            section_id: data.section_id as string | undefined,
            child_count: data.child_count as number | undefined,
          };
          setSelectedNode(node);
          handleExpandNode(node);
        } catch { /* noop */ }
      });
    }

    // Check if container already has valid dimensions
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      createGraph(container);
    } else {
      // Container has zero dimensions (flex layout not yet calculated).
      // Observe until it gets proper size, then create the graph.
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            // Container is ready — stop observing and create graph
            observer?.disconnect();
            observer = null;
            createGraph(entry.target as HTMLDivElement);
          }
        }
      });
      observer.observe(container);
    }

    return () => {
      destroyed = true;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      graphRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (expandAbortRef.current) {
        expandAbortRef.current.abort();
        expandAbortRef.current = null;
      }
      if (graph) {
        try { graph.destroy(); } catch { /* noop */ }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update layout when mode changes ─────────────────

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    try {
      graph.setLayout(getLayout(mode, isTraceback));
      // Let the main renderGraph effect handle the render
      // Only trigger a re-render if graphData already exists
      if (graphData) {
        needsFitViewRef.current = true;
        setGraphData((prev) => prev ? { ...prev } : prev); // force trigger
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, getLayout, isTraceback]);

  // ── Re-render on theme change ───────────────────────

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const graph = graphRef.current;
      if (!graph || !graphData) return;
      // Force re-render to pick up new theme colors
      needsFitViewRef.current = false;
      setGraphData((prev) => prev ? { ...prev } : prev);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [graphData]);

  // ── Render data ─────────────────────────────────────

  const renderingRef = useRef(false);
  const pendingRenderRef = useRef<{ data: GraphData; expanded: Set<string> } | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needsFitViewRef = useRef(true); // only fitView on first render or major data change

  const doRender = useCallback((data: GraphData, expanded: Set<string>) => {
    const graph = graphRef.current;
    if (!graph) return;

    // If a render is in progress, queue this one (latest wins)
    if (renderingRef.current) {
      pendingRenderRef.current = { data, expanded };
      return;
    }

    renderingRef.current = true;

    const nodes = (data.nodes ?? []).map((n) => ({
      id: n.id,
      data: {
        name: n.name,
        type: n.type,
        hasChildren: n.type === 'course' || n.type === 'chapter' || n.type === 'entity',
        expanded: expanded.has(n.id),
        // Enriched properties
        occurrence: n.occurrence,
        entity_type: n.entity_type,
        description: n.description,
        chapters: n.chapters,
        section_id: n.section_id,
        child_count: n.child_count,
        // Visual overrides (from traceback)
        style: n.style,
      } as Record<string, unknown>,
    }));

    const edges = (data.edges ?? []).map((e, i) => ({
      id: `edge-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      data: {
        type: e.type,
        // Visual overrides (from traceback)
        style: e.style,
      } as Record<string, unknown>,
    }));

    const shouldFit = needsFitViewRef.current;
    needsFitViewRef.current = false;

    try {
      graph.setData({ nodes, edges });
      graph.render().then(() => {
        if (shouldFit) {
          try { graph.fitView(); } catch { /* noop */ }
        }
      }).catch(() => {}).finally(() => {
        renderingRef.current = false;
        // Process queued render if any
        const pending = pendingRenderRef.current;
        if (pending) {
          pendingRenderRef.current = null;
          doRender(pending.data, pending.expanded);
        }
      });
    } catch {
      renderingRef.current = false;
      const pending = pendingRenderRef.current;
      if (pending) {
        pendingRenderRef.current = null;
        doRender(pending.data, pending.expanded);
      }
    }
  }, []);

  // Debounced wrapper — coalesces rapid state changes into one render
  const renderGraph = useCallback((data: GraphData, expanded: Set<string>) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      doRender(data, expanded);
    }, 50); // 50ms debounce
  }, [doRender]);

  // Re-render when graphData or expandedNodes change
  useEffect(() => {
    if (graphData) {
      renderGraph(graphData, expandedNodes);
    }
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [graphData, expandedNodes, renderGraph]);

  // ── Expand node (lazy load children) ────────────────

  const addExpanded = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev).add(nodeId);
      expandedNodesRef.current = next;
      return next;
    });
  }, []);

  // Recursively collect all descendants of a node
  const collectDescendants = useCallback((nodeId: string): Set<string> => {
    const result = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.pop()!;
      const children = childrenMapRef.current.get(current);
      if (children) {
        for (const child of children) {
          if (!result.has(child)) {
            result.add(child);
            queue.push(child);
          }
        }
      }
    }
    return result;
  }, []);

  // Collapse a node: remove all its descendants from graph
  const collapseNode = useCallback((node: GraphNode) => {
    const descendants = collectDescendants(node.id);
    if (descendants.size === 0) return;

    // Collect ids to remove (only those actually in current graph)
    const toRemove = new Set<string>();
    setGraphData((prev) => {
      if (!prev) return prev;
      const existingIds = new Set((prev.nodes ?? []).map((n) => n.id));
      for (const d of descendants) {
        if (existingIds.has(d)) toRemove.add(d);
      }
      if (toRemove.size === 0) return prev;

      return {
        nodes: (prev.nodes ?? []).filter((n) => !toRemove.has(n.id)),
        edges: (prev.edges ?? []).filter(
          (e) => !toRemove.has(e.source) && !toRemove.has(e.target)
        ),
      };
    });

    // Remove expanded state
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      for (const d of toRemove) {
        next.delete(d);
        childrenMapRef.current.delete(d);
      }
      next.delete(node.id);
      childrenMapRef.current.delete(node.id);
      expandedNodesRef.current = next;
      return next;
    });

    // Clear selection if selected node was collapsed
    setSelectedNode((prev) => (prev && toRemove.has(prev.id)) ? null : prev);
  }, [collectDescendants]);

  // Abort controller for in-flight expand requests
  const expandAbortRef = useRef<AbortController | null>(null);

  // Toggle expand/collapse
  const handleExpandNode = useCallback(async (node: GraphNode) => {
    // If already expanded, collapse
    if (expandedNodesRef.current.has(node.id)) {
      collapseNode(node);
      return;
    }

    // Cancel any in-flight expand request
    if (expandAbortRef.current) {
      expandAbortRef.current.abort();
    }
    const controller = new AbortController();
    expandAbortRef.current = controller;

    setExpandingNodeId(node.id);

    try {
      const children = await getNodeChildren(node.type, node.id, controller.signal);

      // Bail if this request was superseded
      if (controller.signal.aborted) return;

      if (!children.nodes || children.nodes.length === 0) {
        addExpanded(node.id);
        return;
      }

      // Record parent-child relationship
      childrenMapRef.current.set(
        node.id,
        new Set(children.nodes.map((n) => n.id))
      );

      // Merge into existing graph data
      setGraphData((prev) => {
        if (!prev) return children;

        const existingIds = new Set((prev.nodes ?? []).map((n) => n.id));
        const newNodes = (children.nodes ?? []).filter((n) => !existingIds.has(n.id));

        const existingEdgeKeys = new Set(
          (prev.edges ?? []).map((e) => `${e.source}->${e.target}`)
        );
        const newEdges = (children.edges ?? []).filter(
          (e) => !existingEdgeKeys.has(`${e.source}->${e.target}`)
        );

        return {
          nodes: [...(prev.nodes ?? []), ...newNodes],
          edges: [...(prev.edges ?? []), ...newEdges],
        };
      });

      addExpanded(node.id);
    } catch (e) {
      if (!controller.signal.aborted) {
        console.error('Expand failed:', e);
      }
    } finally {
      if (!controller.signal.aborted) {
        setExpandingNodeId(null);
        expandAbortRef.current = null;
      }
    }
  }, [addExpanded, collapseNode]);

  // Register toggle expand callback to global store (for Sidebar detail panel)
  useEffect(() => {
    actions.setToggleExpandNodeCallback((node: GraphNode) => handleExpandNode(node));
    return () => {
      actions.setToggleExpandNodeCallback(null);
    };
  }, [handleExpandNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load course root ────────────────────────────────

  const handleLoadCourse = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    setIsTraceback(false);
    setExpandedNodes(new Set());
    expandedNodesRef.current = new Set();
    childrenMapRef.current.clear();
    savedCourseRef.current = null; // Clear saved state on explicit reload

    try {
      const rootData = await getGraphRoot();
      needsFitViewRef.current = true;
      setGraphData(rootData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Entity search (traceback) ─────────────────────────

  const handleSearch = useCallback(async () => {
    if (!searchText.trim()) return;
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    setExpandedNodes(new Set());
    expandedNodesRef.current = new Set();
    childrenMapRef.current.clear();

    try {
      const traceback = await getTracebackGraph(searchText.trim(), searchType);

      // Convert TracebackData → GraphData
      const inferType = (id: string) => {
        const prefix = id.split(':')[0];
        if (['course', 'chapter', 'section', 'entity'].includes(prefix)) return prefix;
        return 'entity';
      };

      const graphData: GraphData = {
        nodes: traceback.nodes.map((n) => ({
          id: n.id,
          name: n.label,
          type: n.node_type || inferType(n.id),
          style: n.style,
          entity_type: n.entity_type,
          description: n.description,
          occurrence: n.occurrence,
          chapters: n.chapters,
        })),
        edges: traceback.edges.map((e) => ({
          source: e.source,
          target: e.target,
          type: e.label,
          style: e.style,
          description: e.description,
        })),
      };

      setIsTraceback(true);
      needsFitViewRef.current = true;
      setGraphData(graphData);

      // Update layout to dagre
      const graph = graphRef.current;
      if (graph) {
        try {
          graph.setLayout(getLayout(mode, true));
        } catch { /* noop */ }
      }

      const expanded = new Set(graphData.nodes.map((n) => n.id));
      setExpandedNodes(expanded);
      expandedNodesRef.current = expanded;
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [searchText, searchType, getLayout, mode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ── Switch to entity mode ───────────────────────────

  const switchToEntity = useCallback(() => {
    // Save current course state before clearing
    if (graphData && mode === 'course') {
      savedCourseRef.current = {
        graphData,
        expandedNodes: new Set(expandedNodesRef.current),
        childrenMap: new Map(childrenMapRef.current),
      };
    }
    setMode('entity');
    setIsTraceback(false);
    setGraphData(null);
    setExpandedNodes(new Set());
    expandedNodesRef.current = new Set();
    childrenMapRef.current.clear();
    setSelectedNode(null);
    // Reset layout to force-directed
    const graph = graphRef.current;
    if (graph) {
      try { graph.setLayout(getLayout('entity', false)); } catch { /* noop */ }
    }
  }, [getLayout, graphData]);

  // ── Switch to course mode ───────────────────────────

  const switchToCourse = useCallback(() => {
    setMode('course');
    setIsTraceback(false);
    setSelectedNode(null);
    // Reset layout to force-directed
    const graph = graphRef.current;
    if (graph) {
      try { graph.setLayout(getLayout('course', false)); } catch { /* noop */ }
    }
    // Restore saved course state if available
    const saved = savedCourseRef.current;
    if (saved) {
      needsFitViewRef.current = true;
      setGraphData(saved.graphData);
      setExpandedNodes(saved.expandedNodes);
      expandedNodesRef.current = saved.expandedNodes;
      childrenMapRef.current = saved.childrenMap;
    } else {
      handleLoadCourse();
    }
  }, [handleLoadCourse, getLayout]);

  // ── Render ──────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-card/30">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
        <Network className="w-4 h-4 text-orange-500" />
        <span className="text-xs font-medium text-muted-foreground">知识图谱</span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {/* Mode toggle */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={switchToEntity}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'entity'
                ? 'bg-orange-500/20 text-orange-500 dark:text-orange-400'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            实体搜索
          </button>
          <button
            onClick={switchToCourse}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'course'
                ? 'bg-orange-500/20 text-orange-500 dark:text-orange-400'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            课程结构
          </button>
        </div>

        {/* Search input (entity mode) */}
        {mode === 'entity' && (
          <div className="flex-1 flex items-center gap-1.5">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as typeof searchType)}
              className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 shrink-0"
            >
              <option value="entity">实体</option>
              <option value="section">小节</option>
              <option value="chapter">章节</option>
              <option value="course">课程</option>
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`搜索${searchType === 'entity' ? '实体' : searchType === 'section' ? '小节' : searchType === 'chapter' ? '章节' : '课程'}`}
                className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !searchText.trim()}
              className="px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-500 dark:text-orange-400 text-xs font-medium hover:bg-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '搜索'}
            </button>
          </div>
        )}

        {mode === 'course' && (
          <div className="flex-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>点击节点展开子节点</span>
            {expandingNodeId && (
              <span className="flex items-center gap-1 text-orange-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                展开中…
              </span>
            )}
          </div>
        )}
      </div>

      {/* Graph canvas */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative">
          {error && (
            <div className="absolute inset-x-0 top-2 flex justify-center z-10">
              <div className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs">
                {error}
              </div>
            </div>
          )}

          {!graphData && !loading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none">
              <div className="text-center">
                <Network className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">
                  {mode === 'entity' ? '输入实体名开始探索知识图谱' : '点击加载课程结构'}
                </p>
              </div>
            </div>
          )}

          <div ref={containerRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
