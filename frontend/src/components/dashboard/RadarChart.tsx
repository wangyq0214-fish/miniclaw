'use client';

import { useMemo, useState, useEffect } from 'react';
import type { DimensionDetail, StudentProfile } from '@/lib/api';
import { DIMENSION_LABELS } from '@/lib/api';

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

const CENTER = 160;
const MAX_RADIUS = 95;

interface RadarDimension {
  key: string;
  label: string;
  score: number;
  detail?: string;
}

interface RadarChartProps {
  profile: StudentProfile;
}

export function RadarChart({ profile }: RadarChartProps) {
  const isDark = useIsDark();

  // Theme-aware colors
  const gridStroke = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e5e7eb';
  const labelFill = isDark ? '#9ca3af' : '#4b5563';
  const pointFill = isDark ? '#18181b' : '#ffffff';
  const pointStroke = isDark ? 'rgba(59, 130, 246, 1)' : '#3b82f6';

  // Build dimensions from profile
  const dimensions: RadarDimension[] = useMemo(() => {
    return Object.entries(profile.dimensions).map(([key, dim]) => ({
      key,
      label: DIMENSION_LABELS[key] || key,
      score: dim.score,
      detail: dim.summary || dim.style || dim.mood || dim.pace || dim.progress || '',
    }));
  }, [profile.dimensions]);

  const numAxes = dimensions.length;
  const angleStep = (2 * Math.PI) / numAxes;
  const startAngle = -Math.PI / 2; // Start from top

  const axes = useMemo(() => {
    return dimensions.map((dim, i) => {
      const angle = startAngle + i * angleStep;
      return {
        ...dim,
        angle,
        x: CENTER + MAX_RADIUS * Math.cos(angle),
        y: CENTER + MAX_RADIUS * Math.sin(angle),
      };
    });
  }, [dimensions, angleStep]);

  const dataPolygon = useMemo(() => {
    return axes
      .map((axis) => {
        const value = axis.score / 100;
        const r = MAX_RADIUS * value;
        const x = CENTER + r * Math.cos(axis.angle);
        const y = CENTER + r * Math.sin(axis.angle);
        return `${x},${y}`;
      })
      .join(' ');
  }, [axes]);

  // Grid rings (20%, 40%, 60%, 80%, 100%)
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <div className="w-full flex items-center justify-center">
      <svg viewBox="0 0 320 320" className="w-full max-w-[340px]">
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
          const value = axis.score / 100;
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
          const labelR = MAX_RADIUS + 20;
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
