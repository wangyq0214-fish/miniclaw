'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import type { TrendPoint } from '@/lib/api';

interface TrendLineChartProps {
  data: TrendPoint[];
}

export function TrendLineChart({ data }: TrendLineChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        暂无趋势数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.3)" />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(229, 231, 235, 0.5)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 12, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          dx={-4}
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(17, 24, 39, 0.85)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '13px',
            padding: '8px 12px',
          }}
          labelStyle={{ color: '#9ca3af', fontSize: '12px' }}
          formatter={(value) => [`${value} 分`, '得分']}
          labelFormatter={(label) => `${label}`}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="rgba(59, 130, 246, 1)"
          strokeWidth={2.5}
          fill="url(#scoreGradient)"
          dot={{ fill: '#fff', stroke: 'rgba(59, 130, 246, 1)', strokeWidth: 2, r: 4 }}
          activeDot={{ fill: 'rgba(59, 130, 246, 1)', stroke: '#fff', strokeWidth: 2, r: 6 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
