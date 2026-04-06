import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Star, TrendingUp, Check, X, Loader2, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ParsedEvent } from '@/lib/logParser';
import { fetchRuns, markGoldenRun, compareGoldenRuns } from '@/lib/api';
import type { RunResponse, GoldenCompareResponse } from '@/lib/api';

interface GoldenRunCompareProps {
  events: ParsedEvent[];
}

interface Deviation {
  param: string;
  golden: number | null;
  compare: number | null;
  absDiff: number | null;
  pctDiff: number | null;
  status: string;
  stddev_baseline: number | null;
  stddev_current: number | null;
}

export default function GoldenRunCompare({ events }: GoldenRunCompareProps) {
  const [goldenRunId, setGoldenRunId] = useState<string | null>(null);
  const [compareRunId, setCompareRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [markingGolden, setMarkingGolden] = useState(false);
  const [comparison, setComparison] = useState<GoldenCompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const allRuns = await fetchRuns();
      setRuns(allRuns.filter(r => r.status === 'completed'));
    } catch {
      setError('Failed to load runs from server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const goldenRuns = useMemo(() => runs.filter(r => r.is_golden), [runs]);
  const nonGoldenRuns = useMemo(() => runs.filter(r => !r.is_golden || r.run_id !== goldenRunId), [runs, goldenRunId]);

  const handleMarkGolden = useCallback(async (runId: string) => {
    setMarkingGolden(true);
    try {
      await markGoldenRun(runId);
      await loadRuns();
      setGoldenRunId(runId);
    } catch {
      setError('Failed to mark run as golden');
    } finally {
      setMarkingGolden(false);
    }
  }, [loadRuns]);

  const handleCompare = useCallback(async () => {
    if (!goldenRunId || !compareRunId) return;
    setComparing(true);
    setError(null);
    try {
      const result = await compareGoldenRuns(goldenRunId, compareRunId);
      setComparison(result);
    } catch {
      setError('Failed to compare runs');
    } finally {
      setComparing(false);
    }
  }, [goldenRunId, compareRunId]);

  useEffect(() => {
    if (goldenRunId && compareRunId) handleCompare();
    else setComparison(null);
  }, [goldenRunId, compareRunId, handleCompare]);

  const deviations = useMemo((): Deviation[] => {
    if (!comparison) return [];
    return (comparison.comparisons as Array<Record<string, unknown>>).map(c => {
      const pct = c.pct_deviation as number | null;
      const status = pct === null ? 'missing' :
        Math.abs(pct) <= 5 ? 'normal' :
        Math.abs(pct) <= 15 ? 'warning' : 'abnormal';
      return {
        param: c.parameter as string,
        golden: c.baseline_value as number | null,
        compare: c.current_value as number | null,
        absDiff: c.baseline_value != null && c.current_value != null
          ? Math.abs((c.current_value as number) - (c.baseline_value as number))
          : null,
        pctDiff: pct,
        status,
        stddev_baseline: (c.stddev_baseline as number | null) ?? null,
        stddev_current: (c.stddev_current as number | null) ?? null,
      };
    });
  }, [comparison]);

  const localParamData = useMemo(() => {
    if (!comparison) return {};
    const data: Record<string, { golden: { time: string; value: number }[]; compare: { time: string; value: number }[] }> = {};
    const goldenEvts = events.filter(e => e.run_id === goldenRunId);
    const compareEvts = events.filter(e => e.run_id === compareRunId);

    for (const e of goldenEvts) {
      const v = parseFloat(e.value);
      if (isNaN(v)) continue;
      if (!data[e.parameter]) data[e.parameter] = { golden: [], compare: [] };
      data[e.parameter].golden.push({ time: e.timestamp?.split('T')[1]?.slice(0, 8) || '', value: v });
    }
    for (const e of compareEvts) {
      const v = parseFloat(e.value);
      if (isNaN(v)) continue;
      if (!data[e.parameter]) data[e.parameter] = { golden: [], compare: [] };
      data[e.parameter].compare.push({ time: e.timestamp?.split('T')[1]?.slice(0, 8) || '', value: v });
    }
    return data;
  }, [events, comparison, goldenRunId, compareRunId]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Star className="w-4 h-4 text-warning" />
          Golden Run Comparison
        </h3>
        <button onClick={loadRuns} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh Runs
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
          {error}
        </div>
      )}

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
            {goldenRuns.length > 0 && <optgroup label="Golden Runs">
              {goldenRuns.map(r => (
                <option key={r.run_id} value={r.run_id}>{r.run_id} ({r.filename}) ★</option>
              ))}
            </optgroup>}
            <optgroup label="All Completed Runs">
              {runs.map(r => (
                <option key={r.run_id} value={r.run_id}>{r.run_id} ({r.filename}){r.is_golden ? ' ★' : ''}</option>
              ))}
            </optgroup>
          </select>
          {goldenRunId && !runs.find(r => r.run_id === goldenRunId)?.is_golden && (
            <button
              onClick={() => handleMarkGolden(goldenRunId)}
              disabled={markingGolden}
              className="mt-2 px-3 py-1 text-[10px] bg-warning/10 text-warning rounded-lg hover:bg-warning/20 transition-colors disabled:opacity-50"
            >
              {markingGolden ? 'Marking...' : 'Mark as Golden ★'}
            </button>
          )}
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
            {nonGoldenRuns.filter(r => r.run_id !== goldenRunId).map(r => (
              <option key={r.run_id} value={r.run_id}>{r.run_id} ({r.filename})</option>
            ))}
          </select>
        </div>
      </div>

      {comparing && (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Comparing runs on server...
        </div>
      )}

      {deviations.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-card/40 text-[10px] text-muted-foreground">
            Server-side comparison: {comparison?.baseline_run_id} vs {comparison?.current_run_id} — {comparison?.drift_count} drift alert(s)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Parameter</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-warning uppercase">Golden Avg</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-primary uppercase">Compare Avg</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">σ Base</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">σ Curr</th>
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
                      {d.stddev_baseline !== null ? d.stddev_baseline.toFixed(3) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">
                      {d.stddev_current !== null ? d.stddev_current.toFixed(3) : '—'}
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

      {deviations.length > 0 && Object.keys(localParamData).length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.keys(localParamData).slice(0, 4).map((param, i) => {
            const gData = localParamData[param]?.golden || [];
            const cData = localParamData[param]?.compare || [];
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
