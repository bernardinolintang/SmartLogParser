import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Star, TrendingUp, Check, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ParsedEvent } from '@/lib/logParser';

interface GoldenRunCompareProps {
  events: ParsedEvent[];
}

interface RunSummary {
  runId: string;
  toolId: string;
  chamberId: string;
  recipe: string;
  paramAvgs: Record<string, { avg: number; values: { time: string; value: number }[] }>;
}

export default function GoldenRunCompare({ events }: GoldenRunCompareProps) {
  const [goldenRunId, setGoldenRunId] = useState<string | null>(null);
  const [compareRunId, setCompareRunId] = useState<string | null>(null);

  const runs = useMemo((): RunSummary[] => {
    const runGroups: Record<string, ParsedEvent[]> = {};
    events.forEach(e => {
      if (!runGroups[e.run_id]) runGroups[e.run_id] = [];
      runGroups[e.run_id].push(e);
    });

    return Object.entries(runGroups).map(([runId, evts]) => {
      const paramAvgs: Record<string, { avg: number; values: { time: string; value: number }[] }> = {};
      evts.forEach(e => {
        const v = parseFloat(e.value);
        if (isNaN(v)) return;
        if (!paramAvgs[e.parameter]) paramAvgs[e.parameter] = { avg: 0, values: [] };
        paramAvgs[e.parameter].values.push({
          time: e.timestamp.split('T')[1]?.slice(0, 8) || e.timestamp.slice(-8),
          value: v,
        });
      });
      for (const p of Object.values(paramAvgs)) {
        p.avg = p.values.reduce((a, b) => a + b.value, 0) / p.values.length;
      }
      return {
        runId,
        toolId: evts[0]?.tool_id || '',
        chamberId: evts[0]?.chamber_id || '',
        recipe: evts[0]?.recipe_name || '',
        paramAvgs,
      };
    });
  }, [events]);

  const goldenRun = runs.find(r => r.runId === goldenRunId);
  const compareRun = runs.find(r => r.runId === compareRunId);

  const deviations = useMemo(() => {
    if (!goldenRun || !compareRun) return [];
    const allParams = [...new Set([...Object.keys(goldenRun.paramAvgs), ...Object.keys(compareRun.paramAvgs)])];
    return allParams.map(param => {
      const golden = goldenRun.paramAvgs[param]?.avg ?? null;
      const compare = compareRun.paramAvgs[param]?.avg ?? null;
      const absDiff = golden !== null && compare !== null ? Math.abs(compare - golden) : null;
      const pctDiff = golden !== null && compare !== null && golden !== 0 ? ((compare - golden) / golden) * 100 : null;
      const status = pctDiff === null ? 'missing' :
        Math.abs(pctDiff) <= 5 ? 'normal' :
        Math.abs(pctDiff) <= 15 ? 'warning' : 'abnormal';
      return { param, golden, compare, absDiff, pctDiff, status };
    });
  }, [goldenRun, compareRun]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <Star className="w-4 h-4 text-warning" />
        Golden Run Comparison
      </h3>

      {/* Run selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-4">
          <label className="text-xs font-medium text-warning flex items-center gap-1.5 mb-2">
            <Star className="w-3.5 h-3.5" /> Golden Run (Baseline)
          </label>
          <select
            value={goldenRunId || ''}
            onChange={e => setGoldenRunId(e.target.value || null)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary outline-none"
          >
            <option value="">Select golden run...</option>
            {runs.map(r => (
              <option key={r.runId} value={r.runId}>{r.runId} ({r.toolId} · {r.recipe})</option>
            ))}
          </select>
        </div>
        <div className="glass rounded-xl p-4">
          <label className="text-xs font-medium text-primary flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3.5 h-3.5" /> Compare Run
          </label>
          <select
            value={compareRunId || ''}
            onChange={e => setCompareRunId(e.target.value || null)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary outline-none"
          >
            <option value="">Select run to compare...</option>
            {runs.filter(r => r.runId !== goldenRunId).map(r => (
              <option key={r.runId} value={r.runId}>{r.runId} ({r.toolId} · {r.recipe})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Deviation table */}
      {deviations.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Parameter</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-warning uppercase">Golden</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-primary uppercase">Compare</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Δ Abs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Δ %</th>
                </tr>
              </thead>
              <tbody>
                {deviations.map(d => (
                  <tr key={d.param} className={`border-b border-border/50 ${
                    d.status === 'abnormal' ? 'bg-destructive/5' : d.status === 'warning' ? 'bg-warning/5' : ''
                  }`}>
                    <td className="px-4 py-2.5">
                      {d.status === 'normal' && <Check className="w-4 h-4 text-success" />}
                      {d.status === 'warning' && <span className="w-4 h-4 rounded-full bg-warning/20 text-warning text-[10px] font-bold flex items-center justify-center">!</span>}
                      {d.status === 'abnormal' && <X className="w-4 h-4 text-destructive" />}
                      {d.status === 'missing' && <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground">{d.param}</td>
                    <td className="px-4 py-2.5 text-xs text-right font-mono text-warning">
                      {d.golden !== null ? d.golden.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right font-mono text-primary">
                      {d.compare !== null ? d.compare.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">
                      {d.absDiff !== null ? d.absDiff.toFixed(2) : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-xs text-right font-mono font-medium ${
                      d.status === 'abnormal' ? 'text-destructive' : d.status === 'warning' ? 'text-warning' : 'text-muted-foreground'
                    }`}>
                      {d.pctDiff !== null ? `${d.pctDiff > 0 ? '+' : ''}${d.pctDiff.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border flex gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" /> ≤5% Normal</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" /> 5-15% Warning</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive" /> &gt;15% Abnormal</span>
          </div>
        </div>
      )}

      {/* Overlay charts */}
      {goldenRun && compareRun && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.keys(goldenRun.paramAvgs).slice(0, 4).map((param, i) => {
            const gData = goldenRun.paramAvgs[param]?.values || [];
            const cData = compareRun.paramAvgs[param]?.values || [];
            const maxLen = Math.max(gData.length, cData.length);
            const merged = Array.from({ length: maxLen }, (_, idx) => ({
              idx: idx + 1,
              golden: gData[idx]?.value ?? null,
              compare: cData[idx]?.value ?? null,
            }));

            return (
              <motion.div
                key={param}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-xl p-4"
              >
                <h4 className="text-xs font-medium text-foreground capitalize mb-3">{param}</h4>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={merged}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                    <XAxis dataKey="idx" tick={{ fontSize: 8, fill: 'hsl(215, 12%, 52%)' }} />
                    <YAxis tick={{ fontSize: 8, fill: 'hsl(215, 12%, 52%)' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 18%, 10%)', border: '1px solid hsl(220, 14%, 18%)', borderRadius: '8px', fontSize: '10px', color: 'hsl(200, 20%, 92%)' }} />
                    <Legend />
                    <Line type="monotone" dataKey="golden" stroke="hsl(38, 92%, 55%)" strokeWidth={2} dot={false} strokeDasharray="4 2" name="Golden" />
                    <Line type="monotone" dataKey="compare" stroke="hsl(185, 72%, 48%)" strokeWidth={2} dot={{ r: 2 }} name="Compare" />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
