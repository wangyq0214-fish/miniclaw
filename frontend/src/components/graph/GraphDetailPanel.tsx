'use client';

import { X, ChevronRight, Loader2, BookOpen, Brain, FileText, Layers, Link2, ArrowRight, Hash, MessageSquare } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import type { GraphNode, GraphData } from '@/lib/api';

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

const TYPE_META: Record<string, { label: string; icon: typeof Brain; color: string; bg: string; darkColor: string; darkBg: string }> = {
  entity: { label: '实体', icon: Brain, color: '#6366F1', bg: '#EEF2FF', darkColor: '#818CF8', darkBg: '#2e2b3d' },
  course: { label: '课程', icon: BookOpen, color: '#D97706', bg: '#FEF3C7', darkColor: '#F59E0B', darkBg: '#3d3520' },
  chapter: { label: '章节', icon: FileText, color: '#3B82F6', bg: '#DBEAFE', darkColor: '#60A5FA', darkBg: '#1e293b' },
  section: { label: '知识点', icon: Layers, color: '#059669', bg: '#D1FAE5', darkColor: '#34D399', darkBg: '#1a2e25' },
};

const EDGE_LABELS: Record<string, string> = {
  RELATES_TO: '关联',
  CONTAINS: '包含',
  HAS_SECTION: '包含章节',
  APPEARS_IN: '出现于',
};

interface GraphDetailPanelProps {
  node: GraphNode;
  expanded: boolean;
  expanding: boolean;
  graphData: GraphData | null;
  onExpand?: () => void;
  onClose: () => void;
}

export function GraphDetailPanel({ node, expanded, expanding, graphData, onExpand, onClose }: GraphDetailPanelProps) {
  const isDark = useIsDark();
  const meta = TYPE_META[node.type] || TYPE_META.entity;
  const Icon = meta.icon;
  const metaColor = isDark ? meta.darkColor : meta.color;
  const metaBg = isDark ? meta.darkBg : meta.bg;

  // Compute derived properties from graphData
  const derived = useMemo(() => {
    if (!graphData || !graphData.edges || !graphData.nodes) return { relatedCount: 0, childrenCount: 0, edgeTypes: [], incomingCount: 0, outgoingCount: 0, hierarchyPath: [], edgeDescriptions: [] as { name: string; type: string; desc: string }[] };

    const outgoing = graphData.edges.filter((e) => e.source === node.id);
    const incoming = graphData.edges.filter((e) => e.target === node.id);

    // Count direct children (nodes this node points to)
    const childrenCount = outgoing.length;

    // Unique edge types
    const edgeTypes = [...new Set([...outgoing, ...incoming].map((e) => e.type))];

    // Collect edge descriptions (for RELATES_TO and APPEARS_IN)
    const edgeDescriptions: { name: string; type: string; desc: string }[] = [];
    for (const edge of outgoing) {
      if (edge.description) {
        const targetNode = graphData.nodes.find((n) => n.id === edge.target);
        edgeDescriptions.push({ name: targetNode?.name || edge.target, type: edge.type, desc: edge.description });
      }
    }
    for (const edge of incoming) {
      if (edge.description) {
        const sourceNode = graphData.nodes.find((n) => n.id === edge.source);
        edgeDescriptions.push({ name: sourceNode?.name || edge.source, type: edge.type, desc: edge.description });
      }
    }

    // Build hierarchy path for chapter/section nodes
    const hierarchyPath: string[] = [];
    if (node.type === 'section' || node.type === 'entity') {
      // Find parent chapter
      const parentEdge = incoming.find((e) => e.type === 'HAS_SECTION' || e.type === 'APPEARS_IN');
      if (parentEdge) {
        const parentNode = graphData.nodes.find((n) => n.id === parentEdge.source);
        if (parentNode) {
          hierarchyPath.push(parentNode.name);
          // Find grandparent course
          const grandEdge = graphData.edges.find((e) => e.target === parentNode.id && (e.type === 'CONTAINS' || e.type === 'HAS_SECTION'));
          if (grandEdge) {
            const grandNode = graphData.nodes.find((n) => n.id === grandEdge.source);
            if (grandNode) hierarchyPath.unshift(grandNode.name);
          }
        }
      }
    } else if (node.type === 'chapter') {
      const parentEdge = incoming.find((e) => e.type === 'CONTAINS');
      if (parentEdge) {
        const parentNode = graphData.nodes.find((n) => n.id === parentEdge.source);
        if (parentNode) hierarchyPath.push(parentNode.name);
      }
    }

    return {
      relatedCount: outgoing.length + incoming.length,
      childrenCount,
      edgeTypes,
      incomingCount: incoming.length,
      outgoingCount: outgoing.length,
      hierarchyPath,
      edgeDescriptions,
    };
  }, [graphData, node.id, node.type]);

  return (
    <div className="w-full border border-border rounded-lg bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">节点详情</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        {/* Node identity */}
        <div className="flex items-start gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: metaBg }}
          >
            <Icon className="w-4.5 h-4.5" style={{ color: metaColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground leading-tight break-words">
              {node.name}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: metaColor }}>
              {meta.label}
            </div>
          </div>
        </div>

        {/* ID */}
        <div className="text-[11px] text-muted-foreground bg-muted rounded-md px-2.5 py-1.5 font-mono break-all">
          {node.id}
        </div>

        {/* Enriched properties */}
        <div className="space-y-1.5">
          {node.entity_type && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1"><Hash className="w-3 h-3" />类型</span>
              <span className="text-foreground font-medium">{node.entity_type}</span>
            </div>
          )}
          {node.occurrence != null && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1"><Hash className="w-3 h-3" />出现频次</span>
              <span className="text-foreground font-medium">{node.occurrence}</span>
            </div>
          )}
          {node.chapters && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1"><BookOpen className="w-3 h-3" />所属章节</span>
              <span className="text-foreground font-medium">{node.chapters}</span>
            </div>
          )}
          {node.section_id && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1"><Hash className="w-3 h-3" />Section ID</span>
              <span className="text-foreground font-medium font-mono">{node.section_id}</span>
            </div>
          )}
          {node.child_count != null && node.child_count > 0 && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1"><Layers className="w-3 h-3" />子节点数</span>
              <span className="text-foreground font-medium">{node.child_count}</span>
            </div>
          )}
        </div>

        {/* Description */}
        {node.description && (
          <div className="text-[11px] bg-muted/50 rounded-md px-2.5 py-2 text-foreground leading-relaxed">
            {node.description}
          </div>
        )}

        {/* Edge descriptions */}
        {derived.edgeDescriptions.length > 0 && (
          <div className="border-t border-border pt-2.5 space-y-1.5">
            <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />关联描述
            </div>
            {derived.edgeDescriptions.map((ed, i) => (
              <div key={i} className="text-[11px] bg-muted/30 rounded-md px-2 py-1.5">
                <span className="text-foreground font-medium">{ed.name}</span>
                <span className="text-muted-foreground ml-1">({EDGE_LABELS[ed.type] || ed.type})</span>
                <div className="text-muted-foreground mt-0.5 leading-relaxed">{ed.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* Hierarchy path */}
        {derived.hierarchyPath.length > 0 && (
          <div className="text-[11px]">
            <div className="text-muted-foreground mb-1">所属层级</div>
            <div className="flex items-center gap-1 flex-wrap">
              {derived.hierarchyPath.map((name, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  <span className="text-foreground bg-muted px-1.5 py-0.5 rounded">{name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Graph statistics */}
        <div className="border-t border-border pt-2.5 space-y-1.5">
          <div className="text-[11px] text-muted-foreground font-medium mb-1.5">图谱统计</div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-muted/50 rounded-md px-2 py-1.5 text-center">
              <div className="text-sm font-semibold text-foreground">{derived.outgoingCount}</div>
              <div className="text-[10px] text-muted-foreground">出向关系</div>
            </div>
            <div className="bg-muted/50 rounded-md px-2 py-1.5 text-center">
              <div className="text-sm font-semibold text-foreground">{derived.incomingCount}</div>
              <div className="text-[10px] text-muted-foreground">入向关系</div>
            </div>
          </div>
          {derived.edgeTypes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {derived.edgeTypes.map((et) => (
                <span key={et} className="text-[10px] bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded">
                  {EDGE_LABELS[et] || et}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Expand action (only for course structure, not traceback) */}
        {onExpand && (
          <button
            onClick={onExpand}
            disabled={expanding}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              expanded
                ? 'border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
                : 'border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 disabled:opacity-50'
            }`}
          >
            {expanding ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                展开中…
              </>
            ) : expanded ? (
              <>
                <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                收起子节点
              </>
            ) : (
              <>
                <ChevronRight className="w-3.5 h-3.5" />
                展开子节点
              </>
            )}
          </button>
        )}

        {/* Type description */}
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          {node.type === 'course' && '课程根节点，点击展开查看所有章节。'}
          {node.type === 'chapter' && '章节节点，点击展开查看知识点列表。'}
          {node.type === 'section' && (expanded ? '已展开相关实体。' : '知识点节点，点击展开相关实体。')}
          {node.type === 'entity' && expanded
            ? '已展开关联实体。'
            : node.type === 'entity'
            ? '知识实体，点击展开查看关联概念。'
            : null}
        </div>
      </div>
    </div>
  );
}
