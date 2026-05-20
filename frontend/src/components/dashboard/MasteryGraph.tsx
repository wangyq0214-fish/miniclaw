'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Graph, register, ExtensionCategory, D3ForceLayout } from '@antv/g6';
import type { KnowledgeGraph } from '@/lib/api';

// Register G6 extensions
let registered = false;
function ensureRegistered() {
  if (registered) return;
  register(ExtensionCategory.LAYOUT, 'd3force', D3ForceLayout);
  registered = true;
}

function getMasteryColor(mastery: number, isDark: boolean): { fill: string; stroke: string } {
  if (mastery >= 0.7) {
    return isDark
      ? { fill: '#065f46', stroke: '#34d399' }
      : { fill: '#d1fae5', stroke: '#34d399' };
  } else if (mastery >= 0.4) {
    return isDark
      ? { fill: '#78350f', stroke: '#fbbf24' }
      : { fill: '#fef3c7', stroke: '#f59e0b' };
  } else {
    return isDark
      ? { fill: '#7f1d1d', stroke: '#f87171' }
      : { fill: '#fee2e2', stroke: '#f87171' };
  }
}

function getMasterySize(mastery: number): number {
  return 30 + mastery * 40;
}

interface MasteryGraphProps {
  graph: KnowledgeGraph;
}

export function MasteryGraph({ graph }: MasteryGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const selectedNodeRef = useRef<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Stable key — only changes when graph data actually changes
  const graphKey = useMemo(() => JSON.stringify(graph), [graph]);

  useEffect(() => {
    if (!containerRef.current || !graph.nodes.length) return;
    ensureRegistered();

    const container = containerRef.current;
    const isDark = document.documentElement.classList.contains('dark');

    const nodes = graph.nodes.map((node) => {
      const colors = getMasteryColor(node.mastery, isDark);
      return {
        id: node.id,
        data: { mastery: node.mastery, category: node.category },
        style: {
          size: getMasterySize(node.mastery),
          fill: colors.fill,
          stroke: colors.stroke,
          lineWidth: 2,
          labelText: node.id,
          labelFontSize: 12,
          labelFill: isDark ? '#e4e4e7' : '#3f3f46',
          labelPlacement: 'bottom' as const,
          labelOffsetY: 5,
        },
      };
    });

    const edges = graph.edges.map((edge, i) => ({
      id: `edge-${i}`,
      source: edge.source,
      target: edge.target,
      data: { relation: edge.relation },
      style: {
        stroke: isDark ? '#52525b' : '#d4d4d8',
        lineWidth: 1.5,
        endArrow: edge.relation === '前置',
        labelText: edge.relation === '对比' ? '易混淆' : '',
        labelFontSize: 10,
        labelFill: isDark ? '#71717a' : '#a1a1aa',
      },
    }));

    // Destroy previous graph
    if (graphRef.current) {
      try { graphRef.current.destroy(); } catch { /* already destroyed */ }
      graphRef.current = null;
    }

    const graphInstance = new Graph({
      container,
      data: { nodes, edges },
      layout: {
        type: 'd3force',
        center: true,
        collide: { radius: 50 },
        link: { distance: 120 },
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      autoFit: 'center',
    });

    graphInstance.render().catch(() => {});
    graphRef.current = graphInstance;

    graphInstance.on('node:click', (e: any) => {
      const nodeId = e.target?.id;
      if (nodeId) {
        const newValue = nodeId === selectedNodeRef.current ? null : nodeId;
        selectedNodeRef.current = newValue;
        setSelectedNode(newValue);
      }
    });

    return () => {
      // Suppress G6's internal async "graph instance has been destroyed" error
      const origError = console.error;
      console.error = (...args: any[]) => {
        if (typeof args[0] === 'string' && args[0].includes('graph instance has been destroyed')) return;
        origError(...args);
      };
      try { graphInstance.destroy(); } catch { /* cleanup */ }
      // Keep suppressing for a bit — G6's async callbacks fire after destroy
      setTimeout(() => { console.error = origError; }, 1000);
      graphRef.current = null;
    };
  }, [graphKey]);

  const selectedData = selectedNode
    ? graph.nodes.find((n) => n.id === selectedNode)
    : null;

  return (
    <div className="flex flex-col h-full">
      <div ref={containerRef} className="flex-1 min-h-[300px]" />

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-zinc-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-200 dark:bg-green-900 border border-green-400" />
          掌握 ≥70%
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-200 dark:bg-yellow-900 border border-yellow-400" />
          掌握 40-70%
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-200 dark:bg-red-900 border border-red-400" />
          掌握 &lt;40%
        </div>
      </div>

      {selectedData && (
        <div className="mt-3 p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg text-sm">
          <div className="font-semibold text-gray-800 dark:text-zinc-200">
            {selectedData.id}
          </div>
          <div className="text-gray-500 dark:text-zinc-400 mt-1">
            掌握度：{Math.round(selectedData.mastery * 100)}% · 类别：{selectedData.category}
          </div>
        </div>
      )}
    </div>
  );
}
