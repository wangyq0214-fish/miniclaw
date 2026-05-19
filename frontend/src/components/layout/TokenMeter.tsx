'use client';

import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { getTokenStats } from '@/lib/api';

interface TokenMeterProps {
  sessionId: string;
  refreshKey?: number;
  budget?: number;
}

export function TokenMeter({ sessionId, refreshKey, budget = 100_000 }: TokenMeterProps) {
  const [stats, setStats] = useState<{ system: number; message: number; total: number } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    getTokenStats(sessionId)
      .then((res) => {
        if (cancelled) return;
        setStats({ system: res.system_tokens, message: res.message_tokens, total: res.total_tokens });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshKey]);

  if (!stats) return null;

  const pct = Math.min(100, (stats.total / budget) * 100);
  const alert = pct >= 80;

  return (
    <div className="border-t border-sidebar-border px-3 py-2">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Gauge className="w-3 h-3" />
          <span>上下文</span>
        </div>
        <span className={alert ? 'text-destructive font-medium' : 'text-foreground'}>
          {stats.total.toLocaleString()} / {budget.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full transition-all ${alert ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>system {stats.system.toLocaleString()}</span>
        <span>msg {stats.message.toLocaleString()}</span>
      </div>
    </div>
  );
}
