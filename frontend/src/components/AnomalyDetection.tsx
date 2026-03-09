import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, AlertTriangle, CheckCircle } from 'lucide-react';
import type { ParsedEvent } from '@/lib/logParser';

interface AnomalyDetectionProps {
  events: ParsedEvent[];
}

// Typical semiconductor process parameter ranges
const NORMAL_RANGES: Record<string, { min: number; max: number; unit: string }> = {
  temperature: { min: 15, max: 450, unit: '°C' },
  pressure: { min: 0.01, max: 800, unit: 'Torr' },
  rf_power: { min: 0, max: 600, unit: 'W' },
  gas_flow: { min: 0, max: 600, unit: 'sccm' },
  laser_power: { min: 0, max: 1500, unit: 'W' },
  humidity: { min: 20, max: 60, unit: '%' },
  vibration: { min: 0, max: 0.01, unit: 'g' },
};

interface Anomaly {
  event: ParsedEvent;
  parameter: string;
  value: number;
  expectedMin: number;
  expectedMax: number;
  severity: 'critical' | 'warning';
  deviation: number; // % outside range
}

export default function AnomalyDetection({ events }: AnomalyDetectionProps) {
  const { anomalies, stats } = useMemo(() => {
    const anomalies: Anomaly[] = [];

    // Also compute statistical anomalies (beyond 2 std devs)
    const paramValues: Record<string, number[]> = {};
    events.forEach(e => {
      const v = parseFloat(e.value);
      if (!isNaN(v)) {
        if (!paramValues[e.parameter]) paramValues[e.parameter] = [];
        paramValues[e.parameter].push(v);
      }
    });

    const paramStats: Record<string, { mean: number; std: number }> = {};
    for (const [param, vals] of Object.entries(paramValues)) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      paramStats[param] = { mean, std };
    }

    events.forEach(e => {
      const v = parseFloat(e.value);
      if (isNaN(v)) return;

      const range = NORMAL_RANGES[e.parameter];
      if (range) {
        if (v < range.min || v > range.max) {
          const deviation = v < range.min
            ? ((range.min - v) / range.min) * 100
            : ((v - range.max) / range.max) * 100;
          anomalies.push({
            event: e,
            parameter: e.parameter,
            value: v,
            expectedMin: range.min,
            expectedMax: range.max,
            severity: deviation > 30 ? 'critical' : 'warning',
            deviation,
          });
          return;
        }
      }

      // Statistical anomaly: beyond 2.5 std devs
      const ps = paramStats[e.parameter];
      if (ps && ps.std > 0) {
        const zScore = Math.abs(v - ps.mean) / ps.std;
        if (zScore > 2.5) {
          anomalies.push({
            event: e,
            parameter: e.parameter,
            value: v,
            expectedMin: ps.mean - 2 * ps.std,
            expectedMax: ps.mean + 2 * ps.std,
            severity: zScore > 3.5 ? 'critical' : 'warning',
            deviation: ((zScore - 2.5) / 2.5) * 100,
          });
        }
      }
    });

    return { anomalies, stats: paramStats };
  }, [events]);

  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  const warningCount = anomalies.filter(a => a.severity === 'warning').length;

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
          <div>
            <p className="font-semibold text-foreground">
              {anomalies.length === 0
                ? 'All parameters within normal range'
                : `${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'} detected`}
            </p>
            <p className="text-sm text-muted-foreground">
              {criticalCount > 0 && <span className="text-destructive font-medium">{criticalCount} critical</span>}
              {criticalCount > 0 && warningCount > 0 && ' · '}
              {warningCount > 0 && <span className="text-warning font-medium">{warningCount} warnings</span>}
              {anomalies.length === 0 && 'No out-of-range values found across all parameters'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Parameter health grid */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Parameter Health</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(stats).map(([param, s], i) => {
            const range = NORMAL_RANGES[param];
            const paramAnomalies = anomalies.filter(a => a.parameter === param);
            const hasCritical = paramAnomalies.some(a => a.severity === 'critical');
            const hasWarning = paramAnomalies.some(a => a.severity === 'warning');

            return (
              <motion.div
                key={param}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className={`glass rounded-lg p-3 border ${
                  hasCritical ? 'border-destructive/50 bg-destructive/5' :
                  hasWarning ? 'border-warning/50 bg-warning/5' :
                  'border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground truncate">{param}</span>
                  {hasCritical ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                  ) : hasWarning ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0" />
                  )}
                </div>
                <p className="text-lg font-bold font-mono text-foreground">{s.mean.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">
                  σ={s.std.toFixed(2)}
                  {range && <span> · range: {range.min}–{range.max}</span>}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Anomaly list */}
      {anomalies.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Anomaly Details</h3>
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Severity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Equipment</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Parameter</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Value</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Expected Range</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((a, i) => (
                    <tr key={i} className={`border-b border-border/50 ${
                      a.severity === 'critical' ? 'bg-destructive/5' : 'bg-warning/5'
                    }`}>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.severity === 'critical' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning'
                        }`}>
                          {a.severity === 'critical' ? <ShieldAlert className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {a.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary">{a.event.equipment_id}</td>
                      <td className="px-4 py-2.5 text-xs text-foreground">{a.parameter}</td>
                      <td className={`px-4 py-2.5 text-xs text-right font-mono font-bold ${
                        a.severity === 'critical' ? 'text-destructive' : 'text-warning'
                      }`}>
                        {a.value}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">
                        {a.expectedMin.toFixed(1)} – {a.expectedMax.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{a.event.timestamp}</td>
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
