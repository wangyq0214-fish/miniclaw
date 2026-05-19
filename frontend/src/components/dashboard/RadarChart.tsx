'use client';

import { useMemo, useState, useEffect } from 'react';
import type { RadarScores } from '@/lib/api';

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

const DIMENSIONS: { key: keyof RadarScores; label: string }[] = [
  { key: 'memory', label: '基础记忆' },
  { key: 'logic', label: '逻辑推演' },
  { key: 'application', label: '综合应用' },
  { key: 'innovation', label: '创新思维' },
  { key: 'breadth', label: '知识广度' },
];

const NUM_AXES = DIMENSIONS.length;
const ANGLE_STEP = (2 * Math.PI) / NUM_AXES;
const START_ANGLE = -Math.PI / 2; // Start from top
const CENTER = 150;
const MAX_RADIUS = 110;

interface RadarChartProps {
  scores: RadarScores;
}

export function RadarChart({ scores }: RadarChartProps) {
  const isDark = useIsDark();

  // Theme-aware colors
  const gridStroke = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e5e7eb';
  const labelFill = isDark ? '#9ca3af' : '#4b5563';
  const pointFill = isDark ? '#18181b' : '#ffffff';
  const pointStroke = isDark ? 'rgba(59, 130, 246, 1)' : '#3b82f6';

  const axes = useMemo(() => {
    return DIMENSIONS.map((dim, i) => {
      const angle = START_ANGLE + i * ANGLE_STEP;
      return {
        ...dim,
        angle,
        x: CENTER + MAX_RADIUS * Math.cos(angle),
        y: CENTER + MAX_RADIUS * Math.sin(angle),
      };
    });
  }, []);

  const dataPolygon = useMemo(() => {
    return axes
      .map((axis) => {
        const value = (scores[axis.key] ?? 0) / 100;
        const r = MAX_RADIUS * value;
        const x = CENTER + r * Math.cos(axis.angle);
        const y = CENTER + r * Math.sin(axis.angle);
        return `${x},${y}`;
      })
      .join(' ');
  }, [axes, scores]);

  // Grid rings (20%, 40%, 60%, 80%, 100%)
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <div className="w-full flex items-center justify-center">
      <svg viewBox="0 0 300 300" className="w-full max-w-[340px]">
        {/* Grid rings */}
        {rings.map((ratio) => {
          const points = axes
            .map((axis) => {
              const r = MAX_RADIUS * ratio;
              return `${CENTER + r * Math.cos(axis.angle)},${CENTER + r * Math.sin(axis.angle)}`;
            })
            .join(' ');
          return (
            <polygon
              key={ratio}
              points={points}
              fill="none"
              stroke={gridStroke}
              strokeWidth="1"
            />
          );
        })}

        {/* Axis lines */}
        {axes.map((axis, i) => (
          <line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={axis.x}
            y2={axis.y}
            stroke={gridStroke}
            strokeWidth="1"
          />
        ))}

        {/* Data polygon */}
        <polygon
          points={dataPolygon}
          fill="rgba(59, 130, 246, 0.15)"
          stroke="rgba(59, 130, 246, 0.9)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {axes.map((axis, i) => {
          const value = (scores[axis.key] ?? 0) / 100;
          const r = MAX_RADIUS * value;
          const cx = CENTER + r * Math.cos(axis.angle);
          const cy = CENTER + r * Math.sin(axis.angle);
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r="4"
              fill={pointFill}
              stroke={pointStroke}
              strokeWidth="2"
            />
          );
        })}

        {/* Labels */}
        {axes.map((axis, i) => {
          const labelR = MAX_RADIUS + 24;
          const lx = CENTER + labelR * Math.cos(axis.angle);
          const ly = CENTER + labelR * Math.sin(axis.angle);
          // Adjust text anchor based on position
          let textAnchor: 'start' | 'middle' | 'end' = 'middle';
          if (Math.cos(axis.angle) > 0.1) textAnchor = 'start';
          else if (Math.cos(axis.angle) < -0.1) textAnchor = 'end';

          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor={textAnchor}
              dominantBaseline="central"
              className="text-xs font-semibold"
              fill={labelFill}
            >
              {axis.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
