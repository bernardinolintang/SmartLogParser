import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, TrendingUp, Check, X, Loader2, RefreshCw, Info,
  AlertTriangle, CheckCircle2, Trophy, Upload, Zap, ServerOff, Server
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { ParsedEvent } from '@/lib/logParser';
import { fetchRuns, markGoldenRun, compareGoldenRuns, isBackendAvailable } from '@/lib/api';
import type { RunResponse, GoldenCompareResponse } from '@/lib/api';

interface GoldenRunCompareProps {
  events: ParsedEvent[];
}

interface ParamStats {
  avg: number;
  stddev: number;
  min: number;
  max: number;
  count: number;
  values: number[];
}

interface LocalGoldenSnapshot {
  savedAt: string;
  fileName: string;
  params: Record<string, ParamStats>;
  totalEvents: number;
  toolIds: string[];
}

interface Deviation {
  param: string;
  golden: number | null;
  current: number | null;
  absDiff: number | null;
  pctDiff: number | null;
  status: 'normal' | 'warning' | 'abnormal' | 'missing';
  stddev_baseline: number | null;
  stddev_current: number | null;
}

const STORAGE_KEY = 'slp_golden_snapshot';

function computeParamStats(events: ParsedEvent[]): Record<string, ParamStats> {
  const map: Record<string, number[]> = {};
  for (const e of events) {
    if (!e.parameter || e.event_type !== 'sensor') continue;
    const v = parseFloat(e.value);
    if (isNaN(v)) continue;
    if (!map[e.parameter]) map[e.parameter] = [];
    map[e.parameter].push(v);
  }
  const result: Record<string, ParamStats> = {};
  for (const [param, vals] of Object.entries(map)) {
    if (vals.length === 0) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - avg) ** 2, 0) / vals.length;
    result[param] = {
      avg,
      stddev: Math.sqrt(variance),
      min: Math.min(...vals),
      max: Math.max(...vals),
      count: vals.length,
      values: vals,
    };
  }
  return result;
}

function computeDeviations(
  goldenParams: Record<string, ParamStats>,
  currentParams: Record<string, ParamStats>,
): Deviation[] {
  const allParams = new Set([...Object.keys(goldenParams), ...Object.keys(currentParams)]);
  return Array.from(allParams).map(param => {
    const g = goldenParams[param];
    const c = currentParams[param];
    const pctDiff = g && c ? ((c.avg - g.avg) / Math.abs(g.avg || 1)) * 100 : null;
    const status: Deviation['status'] =
      pctDiff === null ? 'missing' :
      Math.abs(pctDiff) <= 5 ? 'normal' :
      Math.abs(pctDiff) <= 15 ? 'warning' : 'abnormal';
    return {
      param,
      golden: g ? g.avg : null,
      current: c ? c.avg : null,
      absDiff: g && c ? Math.abs(c.avg - g.avg) : null,
      pctDiff,
      status,
      stddev_baseline: g ? g.stddev : null,
      stddev_current: c ? c.stddev : null,
    };
  }).sort((a, b) => {
    const order = { abnormal: 0, warning: 1, missing: 2, normal: 3 };
    return order[a.status] - order[b.status];
  });
}

// ---------- Sub-components ----------

function ConceptBanner() {
  return (
    <div className="rounded-xl border border-warning/20 bg-warning/5 p-4 flex gap-3">
      <Trophy className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-warning">What is a Golden Run?</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          A <span className="text-warning font-medium">Golden Run</span> is a known-good reference run — a
          production log from when everything was working perfectly. It becomes the{' '}
          <span className="text-foreground font-medium">standard baseline</span>. Every future run is
          compared against it to instantly spot parameter drift, unusual sensor readings, or recipe
          deviations before they cause yield loss.
        </p>
        <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
          <span className="flex items-center gap-1 text-success"><CheckCircle2 className="w-3 h-3" /> ≤5% deviation → Normal</span>
          <span className="flex items-center gap-1 text-warning"><AlertTriangle className="w-3 h-3" /> 5–15% → Warning</span>
          <span className="flex items-center gap-1 text-destructive"><X className="w-3 h-3" /> &gt;15% → Abnormal</span>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ backendOk }: { backendOk: boolean | null }) {
  if (backendOk === null) return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <Loader2 className="w-3 h-3 animate-spin" /> Checking backend…
    </span>
  );
  return backendOk ? (
    <span className="flex items-center gap-1 text-[10px] text-success">
      <Server className="w-3 h-3" /> Backend connected
    </span>
  ) : (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <ServerOff className="w-3 h-3" /> Offline — using local mode
    </span>
  );
}

function DeviationTable({ deviations, goldenLabel, currentLabel }: {
  deviations: Deviation[];
  goldenLabel: string;
  currentLabel: string;
}) {
  const counts = {
    abnormal: deviations.filter(d => d.status === 'abnormal').length,
    warning: deviations.filter(d => d.status === 'warning').length,
    normal: deviations.filter(d => d.status === 'normal').length,
  };

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Summary bar */}
      <div className="px-4 py-3 border-b border-border bg-card/60 flex flex-wrap items-center gap-4 text-[11px]">
        <span className="text-muted-foreground font-mono">
          <span className="text-warning font-semibold">{goldenLabel}</span>
          {' '}vs{' '}
          <span className="text-primary font-semibold">{currentLabel}</span>
        </span>
        <div className="flex gap-3 ml-auto">
          {counts.abnormal > 0 && (
            <span className="flex items-center gap-1 text-destructive font-semibold">
              <X className="w-3 h-3" /> {counts.abnormal} abnormal
            </span>
          )}
          {counts.warning > 0 && (
            <span className="flex items-center gap-1 text-warning font-semibold">
              <AlertTriangle className="w-3 h-3" /> {counts.warning} warning
            </span>
          )}
          <span className="flex items-center gap-1 text-success">
            <Check className="w-3 h-3" /> {counts.normal} normal
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Parameter</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-medium text-warning uppercase tracking-wider">Golden Avg</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-medium text-primary uppercase tracking-wider">Current Avg</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider">σ Base</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider">σ Curr</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Δ %</th>
            </tr>
          </thead>
          <tbody>
            {deviations.map((d, i) => (
              <motion.tr
                key={d.param}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`border-b border-border/40 transition-colors ${
                  d.status === 'abnormal' ? 'bg-destructive/5 hover:bg-destructive/10' :
                  d.status === 'warning' ? 'bg-warning/5 hover:bg-warning/10' :
                  'hover:bg-secondary/30'
                }`}
              >
                <td className="px-4 py-2.5">
                  {d.status === 'normal' && <CheckCircle2 className="w-4 h-4 text-success" />}
                  {d.status === 'warning' && <AlertTriangle className="w-4 h-4 text-warning" />}
                  {d.status === 'abnormal' && <X className="w-4 h-4 text-destructive" />}
                  {d.status === 'missing' && <span className="text-muted-foreground/50 text-xs">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs font-mono text-foreground">{d.param}</td>
                <td className="px-4 py-2.5 text-xs text-right font-mono text-warning">
                  {d.golden !== null ? d.golden.toFixed(3) : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-right font-mono text-primary">
                  {d.current !== null ? d.current.toFixed(3) : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">
                  {d.stddev_baseline !== null ? d.stddev_baseline.toFixed(4) : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">
                  {d.stddev_current !== null ? d.stddev_current.toFixed(4) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-xs text-right font-mono font-semibold ${
                  d.status === 'abnormal' ? 'text-destructive' :
                  d.status === 'warning' ? 'text-warning' : 'text-muted-foreground'
                }`}>
                  {d.pctDiff !== null ? `${d.pctDiff > 0 ? '+' : ''}${d.pctDiff.toFixed(1)}%` : '—'}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniChart({ param, goldenVals, currentVals }: {
  param: string;
  goldenVals: number[];
  currentVals: number[];
}) {
  const maxLen = Math.max(goldenVals.length, currentVals.length, 1);
  const data = Array.from({ length: Math.min(maxLen, 80) }, (_, i) => ({
    i,
    golden: goldenVals[Math.floor(i * goldenVals.length / Math.min(maxLen, 80))] ?? null,
    current: currentVals[Math.floor(i * currentVals.length / Math.min(maxLen, 80))] ?? null,
  }));
  const goldenAvg = goldenVals.length ? goldenVals.reduce((a, b) => a + b, 0) / goldenVals.length : null;

  return (
    <div className="glass rounded-xl p-4">
      <h4 className="text-xs font-medium text-foreground capitalize mb-3 truncate">{param}</h4>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,18%)" />
          <XAxis dataKey="i" hide />
          <YAxis tick={{ fontSize: 8, fill: 'hsl(215,12%,52%)' }} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(220,18%,10%)', border: '1px solid hsl(220,14%,18%)', borderRadius: '8px', fontSize: '10px' }}
            formatter={(v: number, name: string) => [v?.toFixed(3), name === 'golden' ? '★ Golden' : 'Current']}
          />
          {goldenAvg !== null && (
            <ReferenceLine y={goldenAvg} stroke="hsl(38,92%,55%)" strokeDasharray="4 2" strokeWidth={1} />
          )}
          <Line type="monotone" dataKey="golden" stroke="hsl(38,92%,55%)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="golden" connectNulls />
          <Line type="monotone" dataKey="current" stroke="hsl(185,72%,48%)" strokeWidth={1.5} dot={false} name="current" connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex gap-3 mt-2 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-px bg-warning/80" style={{ borderTop: '1.5px dashed hsl(38,92%,55%)' }} /> Golden</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-info" /> Current</span>
      </div>
    </div>
  );
}

// ---------- Main component ----------

export default function GoldenRunCompare({ events }: GoldenRunCompareProps) {
  const [mode, setMode] = useState<'local' | 'backend'>('local');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  // Backend state
  const [runs, setRuns] = useState<RunResponse[]>([]);
  const [goldenRunId, setGoldenRunId] = useState<string | null>(null);
  const [compareRunId, setCompareRunId] = useState<string | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [markingGolden, setMarkingGolden] = useState(false);
  const [backendComparison, setBackendComparison] = useState<GoldenCompareResponse | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Local state
  const [goldenSnapshot, setGoldenSnapshot] = useState<LocalGoldenSnapshot | null>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Check backend
  useEffect(() => {
    isBackendAvailable().then(ok => {
      setBackendOk(ok);
      if (ok) setMode('backend');
    });
  }, []);

  // Load backend runs
  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    setBackendError(null);
    try {
      const all = await fetchRuns();
      setRuns(all.filter(r => r.status === 'completed'));
    } catch {
      setBackendError('Failed to load runs from server. Is the backend running?');
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'backend') loadRuns();
  }, [mode, loadRuns]);

  const handleMarkGolden = useCallback(async (runId: string) => {
    setMarkingGolden(true);
    try {
      await markGoldenRun(runId);
      await loadRuns();
      setGoldenRunId(runId);
    } catch {
      setBackendError('Failed to mark run as golden');
    } finally {
      setMarkingGolden(false);
    }
  }, [loadRuns]);

  useEffect(() => {
    if (!goldenRunId || !compareRunId) { setBackendComparison(null); return; }
    setComparing(true);
    setBackendError(null);
    compareGoldenRuns(goldenRunId, compareRunId)
      .then(setBackendComparison)
      .catch(() => setBackendError('Failed to compare runs'))
      .finally(() => setComparing(false));
  }, [goldenRunId, compareRunId]);

  // Local: current events param stats
  const currentParams = useMemo(() => computeParamStats(events), [events]);
  const hasCurrentEvents = events.length > 0;

  const saveAsGolden = useCallback(() => {
    const snap: LocalGoldenSnapshot = {
      savedAt: new Date().toISOString(),
      fileName: events[0]?.tool_id ? `Tool: ${events[0].tool_id}` : 'Current Upload',
      params: currentParams,
      totalEvents: events.length,
      toolIds: [...new Set(events.map(e => e.tool_id).filter(Boolean))],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    setGoldenSnapshot(snap);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }, [events, currentParams]);

  const clearGolden = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setGoldenSnapshot(null);
  }, []);

  // Local deviations
  const localDeviations = useMemo(() => {
    if (!goldenSnapshot || !hasCurrentEvents) return [];
    return computeDeviations(goldenSnapshot.params, currentParams);
  }, [goldenSnapshot, currentParams, hasCurrentEvents]);

  // Backend deviations (reuse server data but enrich with status)
  const backendDeviations = useMemo((): Deviation[] => {
    if (!backendComparison) return [];
    return (backendComparison.comparisons as Array<Record<string, unknown>>).map(c => {
      const pct = c.pct_deviation as number | null;
      const status: Deviation['status'] = pct === null ? 'missing' :
        Math.abs(pct) <= 5 ? 'normal' :
        Math.abs(pct) <= 15 ? 'warning' : 'abnormal';
      return {
        param: c.parameter as string,
        golden: c.baseline_value as number | null,
        current: c.current_value as number | null,
        absDiff: (c.baseline_value != null && c.current_value != null)
          ? Math.abs((c.current_value as number) - (c.baseline_value as number)) : null,
        pctDiff: pct,
        status,
        stddev_baseline: (c.stddev_baseline as number | null) ?? null,
        stddev_current: (c.stddev_current as number | null) ?? null,
      };
    }).sort((a, b) => {
      const order = { abnormal: 0, warning: 1, missing: 2, normal: 3 };
      return order[a.status] - order[b.status];
    });
  }, [backendComparison]);

  const goldenRuns = useMemo(() => runs.filter(r => r.is_golden), [runs]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

      {/* Concept banner */}
      <ConceptBanner />

      {/* Mode toggle + status */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          <button
            onClick={() => setMode('local')}
            className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
              mode === 'local' ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:bg-secondary/50'
            }`}
          >
            <Zap className="w-3 h-3" /> Local Mode
          </button>
          <button
            onClick={() => { setMode('backend'); if (backendOk === false) setBackendError('Backend not reachable at localhost:8001'); }}
            className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors border-l border-border ${
              mode === 'backend' ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:bg-secondary/50'
            }`}
          >
            <Server className="w-3 h-3" /> Backend Mode
          </button>
        </div>
        <StatusBadge backendOk={backendOk} />
      </div>

      {/* ---------- LOCAL MODE ---------- */}
      {mode === 'local' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Golden snapshot card */}
            <div className="glass rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-warning flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" /> Golden Baseline
                </label>
                {goldenSnapshot && (
                  <button onClick={clearGolden} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                    Clear
                  </button>
                )}
              </div>
              {goldenSnapshot ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground truncate">{goldenSnapshot.fileName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {Object.keys(goldenSnapshot.params).length} parameters · {goldenSnapshot.totalEvents} events
                  </p>
                  <p className="text-[10px] text-muted-foreground/70">
                    Saved {new Date(goldenSnapshot.savedAt).toLocaleString()}
                  </p>
                  {goldenSnapshot.toolIds.length > 0 && (
                    <p className="text-[10px] font-mono text-primary">{goldenSnapshot.toolIds.join(', ')}</p>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 space-y-2">
                  <Trophy className="w-8 h-8 text-warning/30 mx-auto" />
                  <p className="text-[11px] text-muted-foreground">No golden baseline saved yet.</p>
                  <p className="text-[10px] text-muted-foreground/70">Upload a known-good run and click "Save as Golden".</p>
                </div>
              )}
            </div>

            {/* Current upload card */}
            <div className="glass rounded-xl p-4 space-y-3">
              <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Current Upload (Compare Against)
              </label>
              {hasCurrentEvents ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-foreground">
                    {Object.keys(currentParams).length} sensor parameters · {events.length} events
                  </p>
                  <p className="text-[10px] font-mono text-primary">
                    {[...new Set(events.map(e => e.tool_id).filter(Boolean))].join(', ') || 'Unknown tool'}
                  </p>
                  <button
                    onClick={saveAsGolden}
                    className={`mt-1 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      saveSuccess
                        ? 'bg-success/20 text-success'
                        : 'bg-warning/10 text-warning hover:bg-warning/20 border border-warning/20'
                    }`}
                  >
                    {saveSuccess ? <><Check className="w-3 h-3" /> Saved as Golden!</> : <><Star className="w-3 h-3" /> Save as Golden Baseline</>}
                  </button>
                </div>
              ) : (
                <div className="text-center py-4 space-y-2">
                  <Upload className="w-8 h-8 text-primary/30 mx-auto" />
                  <p className="text-[11px] text-muted-foreground">No file uploaded yet.</p>
                  <p className="text-[10px] text-muted-foreground/70">Upload a log file first, then come back here.</p>
                </div>
              )}
            </div>
          </div>

          {/* Info tip when no comparison possible */}
          {!goldenSnapshot && !hasCurrentEvents && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-secondary/40 text-[11px] text-muted-foreground">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">How to use: </strong>
                1. Upload a known-good log → come to Golden Run → click <em>"Save as Golden Baseline"</em>.
                Then upload another log and return here to see the parameter comparison table.
              </span>
            </div>
          )}

          {!goldenSnapshot && hasCurrentEvents && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-warning/5 border border-warning/20 text-[11px] text-muted-foreground">
              <Star className="w-4 h-4 flex-shrink-0 mt-0.5 text-warning" />
              <span>
                This is your current upload. If this is your reference run, click{' '}
                <em className="text-warning">"Save as Golden Baseline"</em> above.
                Then upload a different run and return here to compare.
              </span>
            </div>
          )}

          {goldenSnapshot && !hasCurrentEvents && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-[11px] text-muted-foreground">
              <Upload className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
              <span>
                Golden baseline is set. Now <strong className="text-foreground">upload another log file</strong> to compare against it.
              </span>
            </div>
          )}

          {/* Comparison results */}
          <AnimatePresence>
            {localDeviations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <DeviationTable
                  deviations={localDeviations}
                  goldenLabel={goldenSnapshot!.fileName}
                  currentLabel="Current Upload"
                />

                {/* Sparkline charts for abnormal/warning params */}
                {localDeviations.filter(d => d.status !== 'normal' && d.status !== 'missing').length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-primary" />
                      Deviation Trends — Flagged Parameters
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {localDeviations
                        .filter(d => d.status !== 'normal' && d.status !== 'missing')
                        .slice(0, 6)
                        .map(d => (
                          <MiniChart
                            key={d.param}
                            param={d.param}
                            goldenVals={goldenSnapshot!.params[d.param]?.values ?? []}
                            currentVals={currentParams[d.param]?.values ?? []}
                          />
                        ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ---------- BACKEND MODE ---------- */}
      {mode === 'backend' && (
        <div className="space-y-5">
          {backendError && (
            <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {backendError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Golden run selector */}
            <div className="glass rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-warning flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" /> Golden Run (Baseline)
                </label>
                <button onClick={loadRuns} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw className={`w-3 h-3 ${loadingRuns ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>
              {loadingRuns ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading runs…
                </div>
              ) : (
                <>
                  <select
                    value={goldenRunId || ''}
                    onChange={e => setGoldenRunId(e.target.value || null)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary outline-none"
                  >
                    <option value="">Select golden run…</option>
                    {goldenRuns.length > 0 && (
                      <optgroup label="★ Marked as Golden">
                        {goldenRuns.map(r => (
                          <option key={r.run_id} value={r.run_id}>{r.run_id} — {r.filename}</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="All Completed Runs">
                      {runs.map(r => (
                        <option key={r.run_id} value={r.run_id}>
                          {r.run_id} — {r.filename}{r.is_golden ? ' ★' : ''}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  {goldenRunId && !runs.find(r => r.run_id === goldenRunId)?.is_golden && (
                    <button
                      onClick={() => handleMarkGolden(goldenRunId)}
                      disabled={markingGolden}
                      className="px-3 py-1.5 text-[10px] font-medium bg-warning/10 text-warning rounded-lg hover:bg-warning/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {markingGolden ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                      {markingGolden ? 'Marking…' : 'Mark as Golden ★'}
                    </button>
                  )}
                  {runs.length === 0 && !loadingRuns && (
                    <p className="text-[10px] text-muted-foreground py-1">
                      No completed runs found. Upload a log via the Upload tab first.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Compare run selector */}
            <div className="glass rounded-xl p-4 space-y-2">
              <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Compare Run
              </label>
              <select
                value={compareRunId || ''}
                onChange={e => setCompareRunId(e.target.value || null)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary outline-none"
                disabled={!goldenRunId}
              >
                <option value="">Select run to compare…</option>
                {runs.filter(r => r.run_id !== goldenRunId).map(r => (
                  <option key={r.run_id} value={r.run_id}>{r.run_id} — {r.filename}</option>
                ))}
              </select>
              {!goldenRunId && (
                <p className="text-[10px] text-muted-foreground">Select a golden run first.</p>
              )}
            </div>
          </div>

          {comparing && (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Comparing runs on server…
            </div>
          )}

          <AnimatePresence>
            {backendDeviations.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <DeviationTable
                  deviations={backendDeviations}
                  goldenLabel={backendComparison?.baseline_run_id ?? 'Golden'}
                  currentLabel={backendComparison?.current_run_id ?? 'Compare'}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
