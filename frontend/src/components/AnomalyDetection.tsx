import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, AlertTriangle, CheckCircle, Activity, TrendingUp, Loader2, Clock, Zap, FileWarning, Hash } from 'lucide-react';
import { fetchRunAnomalies, type AnomalyResponse, type AnomalyResult } from '@/lib/api';
import type { ParsedEvent } from '@/lib/logParser';

interface AnomalyDetectionProps {
  runId: string | null;
  events?: ParsedEvent[];
}

function computeLocalAnomalies(events: ParsedEvent[]): AnomalyResponse {
  const Z_THRESHOLD = 2.5;
  const ROLLING_WINDOW = 10;
  const ROLLING_THRESHOLD = 2.0;

  const paramReadings: Record<string, Array<{ ts: string; val: number; idx: number }>> = {};
  events.forEach((e, idx) => {
    if (e.event_type !== 'sensor' && e.event_type !== 'info') return;
    const n = parseFloat(e.value);
    if (isNaN(n) || !e.parameter) return;
    if (!paramReadings[e.parameter]) paramReadings[e.parameter] = [];
    paramReadings[e.parameter].push({ ts: e.timestamp, val: n, idx });
  });

  const anomalies: AnomalyResult[] = [];
  for (const [param, readings] of Object.entries(paramReadings)) {
    if (readings.length < 3) continue;
    const vals = readings.map(r => r.val);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);

    for (const { ts, val, idx } of readings) {
      const z = std > 0 ? (val - mean) / std : 0;
      if (Math.abs(z) >= Z_THRESHOLD) {
        anomalies.push({
          parameter: param, timestamp: ts, value: val, mean, std,
          z_score: parseFloat(z.toFixed(3)),
          type: 'z_score',
          severity: Math.abs(z) >= Z_THRESHOLD * 1.5 ? 'alarm' : 'warning',
          description: `${param} reading ${val} is ${Math.abs(z).toFixed(1)}σ from mean ${mean.toFixed(4)}`,
          event_index: idx,
        });
      }
    }

    const window: number[] = [];
    for (const { ts, val, idx } of readings) {
      if (window.length >= 3) {
        const wMean = window.reduce((a, b) => a + b, 0) / window.length;
        const wStd = Math.sqrt(window.reduce((a, b) => a + (b - wMean) ** 2, 0) / window.length);
        const rz = wStd > 0 ? Math.abs(val - wMean) / wStd : 0;
        if (rz >= ROLLING_THRESHOLD && !anomalies.find(a => a.event_index === idx && a.type === 'z_score')) {
          anomalies.push({
            parameter: param, timestamp: ts, value: val, mean: parseFloat(wMean.toFixed(4)), std: parseFloat(wStd.toFixed(4)),
            z_score: parseFloat(rz.toFixed(3)),
            type: 'rolling_drift',
            severity: 'warning',
            description: `${param} drift: ${val} deviates ${rz.toFixed(1)}σ from rolling mean ${wMean.toFixed(4)}`,
            event_index: idx,
          });
        }
      }
      if (window.length >= ROLLING_WINDOW) window.shift();
      window.push(val);
    }
  }
  anomalies.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const totalReadings = Object.values(paramReadings).reduce((s, r) => s + r.length, 0);
  return {
    run_id: 'local',
    anomaly_count: anomalies.length,
    z_score_anomalies: anomalies.filter(a => a.type === 'z_score').length,
    drift_anomalies: anomalies.filter(a => a.type === 'rolling_drift').length,
    parameters_with_anomalies: [...new Set(anomalies.map(a => a.parameter))].sort(),
    total_readings_analysed: totalReadings,
    anomalies,
  };
}

export default function AnomalyDetection({ runId, events = [] }: AnomalyDetectionProps) {
  const [data, setData] = useState<AnomalyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState(false);

  useEffect(() => {
    if (!runId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    setIsLocal(false);
    fetchRunAnomalies(runId)
      .then(result => { setData(result); })
      .catch(() => {
        // Backend unavailable or run not in DB — fall back to local computation
        if (events.length > 0) {
          setData(computeLocalAnomalies(events));
          setIsLocal(true);
        } else {
          setError('Backend unavailable and no events to analyse locally.');
        }
      })
      .finally(() => setLoading(false));
  }, [runId, events]);

  if (!runId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <ShieldAlert className="w-10 h-10 opacity-30" />
        <p className="text-sm">Upload a log file to run anomaly detection.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Running Z-score & drift analysis…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="w-8 h-8 text-warning" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const criticalCount = data.anomalies.filter(a => a.severity === 'alarm').length;
  const warningCount = data.anomalies.filter(a => a.severity === 'warning').length;

  const cascadeCount  = data.alarm_cascade_anomalies ?? 0;
  const gapCount      = data.timestamp_gap_anomalies ?? 0;
  const reversalCount = data.timestamp_reversal_anomalies ?? 0;
  const corruptCount  = data.corrupt_field_anomalies ?? 0;
  const missingCount  = data.missing_field_anomalies ?? 0;
  const hasStructural = cascadeCount + gapCount + reversalCount + corruptCount + missingCount > 0;

  // Build per-parameter summary from the anomaly list
  const paramStats: Record<string, { mean: number; std: number; anomalyCount: number; hasCritical: boolean; hasWarning: boolean }> = {};
  for (const a of data.anomalies) {
    if (!paramStats[a.parameter]) {
      paramStats[a.parameter] = { mean: a.mean, std: a.std, anomalyCount: 0, hasCritical: false, hasWarning: false };
    }
    paramStats[a.parameter].anomalyCount += 1;
    if (a.severity === 'alarm') paramStats[a.parameter].hasCritical = true;
    if (a.severity === 'warning') paramStats[a.parameter].hasWarning = true;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* Status banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl p-5 border ${
          criticalCount > 0
            ? 'bg-destructive/10 border-destructive/30'
            : warningCount > 0
              ? 'bg-warning/10 border-warning/30'
              : 'bg-success/10 border-success/30'
        }`}
      >
        <div className="flex items-center gap-3">
          {criticalCount > 0 ? (
            <ShieldAlert className="w-6 h-6 text-destructive" />
          ) : warningCount > 0 ? (
            <AlertTriangle className="w-6 h-6 text-warning" />
          ) : (
            <CheckCircle className="w-6 h-6 text-success" />
          )}
          <div className="flex-1">
            <p className="font-semibold text-foreground">
              {data.anomaly_count === 0
                ? 'No statistical anomalies detected'
                : `${data.anomaly_count} anomal${data.anomaly_count === 1 ? 'y' : 'ies'} detected`}
            </p>
            <p className="text-sm text-muted-foreground">
              {criticalCount > 0 && <span className="text-destructive font-medium">{criticalCount} alarm-level</span>}
              {criticalCount > 0 && warningCount > 0 && ' · '}
              {warningCount > 0 && <span className="text-warning font-medium">{warningCount} warnings</span>}
              {data.anomaly_count === 0 && `${data.total_readings_analysed} readings analysed — all within 2.5σ`}
              {data.anomaly_count > 0 && ` across ${data.total_readings_analysed} readings`}
            </p>
          </div>
          <div className="flex gap-3 text-right text-xs text-muted-foreground flex-wrap justify-end">
            <div>
              <p className="text-foreground font-semibold text-base">{data.z_score_anomalies}</p>
              <p>Z-score</p>
            </div>
            <div>
              <p className="text-foreground font-semibold text-base">{data.drift_anomalies}</p>
              <p>Drift</p>
            </div>
            {cascadeCount > 0 && <div><p className="text-destructive font-semibold text-base">{cascadeCount}</p><p>Cascade</p></div>}
            {gapCount > 0 && <div><p className="text-warning font-semibold text-base">{gapCount}</p><p>TS Gap</p></div>}
            {reversalCount > 0 && <div><p className="text-warning font-semibold text-base">{reversalCount}</p><p>Reversal</p></div>}
            {corruptCount > 0 && <div><p className="text-destructive font-semibold text-base">{corruptCount}</p><p>Corrupt</p></div>}
            {missingCount > 0 && <div><p className="text-warning font-semibold text-base">{missingCount}</p><p>Missing</p></div>}
          </div>
        </div>
      </motion.div>

      {/* Parameter health grid — only affected params */}
      {Object.keys(paramStats).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Affected Parameters</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(paramStats).map(([param, s], i) => (
              <motion.div
                key={param}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className={`glass rounded-lg p-3 border ${
                  s.hasCritical ? 'border-destructive/50 bg-destructive/5' :
                  'border-warning/50 bg-warning/5'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground truncate">{param}</span>
                  {s.hasCritical
                    ? <ShieldAlert className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />}
                </div>
                <p className="text-lg font-bold font-mono text-foreground">{s.mean.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">
                  σ={s.std.toFixed(3)} · {s.anomalyCount} flag{s.anomalyCount !== 1 ? 's' : ''}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Methodology note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2.5">
        <Activity className="w-3.5 h-3.5 flex-shrink-0" />
        <span>
          <span className="font-medium text-foreground">{isLocal ? 'Client-side detection' : 'Server-side detection'}</span> —
          Statistical: Z-score (|z|&gt;2.5) + rolling-mean drift (window=10, |z|&gt;2.0).
          {hasStructural && <> Structural: alarm cascades, timestamp gaps/reversals, corrupt &amp; missing fields.</>}
          {isLocal && <span className="text-warning ml-1">(Backend offline — structural checks unavailable)</span>}
          {data.parameters_with_anomalies.length > 0 && (
            <> Flagged: <span className="font-medium text-foreground">{data.parameters_with_anomalies.join(', ')}</span>.</>
          )}
        </span>
      </div>

      {/* Anomaly details table */}
      {data.anomalies.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Anomaly Details</h3>
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Severity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Parameter</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Value</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Z-Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {data.anomalies.map((a: AnomalyResult, i: number) => (
                    <tr key={i} className={`border-b border-border/50 ${
                      a.severity === 'alarm' ? 'bg-destructive/5' : 'bg-warning/5'
                    }`}>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.severity === 'alarm'
                            ? 'bg-destructive/20 text-destructive'
                            : 'bg-warning/20 text-warning'
                        }`}>
                          {a.severity === 'alarm'
                            ? <ShieldAlert className="w-3 h-3" />
                            : <AlertTriangle className="w-3 h-3" />}
                          {a.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {(() => {
                          const typeConfig: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
                            z_score:             { label: 'Z-Score',    cls: 'bg-primary/10 text-primary',            icon: <Activity className="w-3 h-3" /> },
                            rolling_drift:       { label: 'Drift',      cls: 'bg-secondary/30 text-secondary-foreground', icon: <TrendingUp className="w-3 h-3" /> },
                            alarm_cascade:       { label: 'Cascade',    cls: 'bg-destructive/20 text-destructive',    icon: <Zap className="w-3 h-3" /> },
                            timestamp_gap:       { label: 'TS Gap',     cls: 'bg-warning/20 text-warning',            icon: <Clock className="w-3 h-3" /> },
                            timestamp_reversal:  { label: 'Reversal',   cls: 'bg-warning/20 text-warning',            icon: <Clock className="w-3 h-3" /> },
                            corrupt_field:       { label: 'Corrupt',    cls: 'bg-destructive/20 text-destructive',    icon: <FileWarning className="w-3 h-3" /> },
                            missing_field:       { label: 'Missing',    cls: 'bg-warning/20 text-warning',            icon: <Hash className="w-3 h-3" /> },
                          };
                          const cfg = typeConfig[a.type] ?? { label: a.type, cls: 'bg-muted/30 text-muted-foreground', icon: <Activity className="w-3 h-3" /> };
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
                              {cfg.icon}{cfg.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-foreground">{a.parameter}</td>
                      <td className={`px-4 py-2.5 text-xs text-right font-mono font-bold ${
                        a.severity === 'alarm' ? 'text-destructive' : 'text-warning'
                      }`}>
                        {a.value}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">
                        {a.z_score > 0 ? '+' : ''}{a.z_score.toFixed(2)}σ
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs truncate" title={a.description}>
                        {a.description}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {a.timestamp}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
