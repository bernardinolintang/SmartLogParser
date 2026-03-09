import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Heart, AlertCircle, Activity, TrendingDown } from 'lucide-react';
import type { ParsedEvent } from '@/lib/logParser';

interface ToolHealthDashboardProps {
  events: ParsedEvent[];
}

export default function ToolHealthDashboard({ events }: ToolHealthDashboardProps) {
  const health = useMemo(() => {
    const chambers = [...new Set(events.map(e => `${e.tool_id}|${e.chamber_id}`))];

    const chamberStats = chambers.map(key => {
      const [toolId, chamberId] = key.split('|');
      const chEvents = events.filter(e => e.tool_id === toolId && e.chamber_id === chamberId);
      const alarms = chEvents.filter(e => e.severity === 'alarm').length;
      const warnings = chEvents.filter(e => e.severity === 'warning').length;
      const total = chEvents.length;

      // Stability: based on parameter variance
      const paramValues: Record<string, number[]> = {};
      chEvents.forEach(e => {
        const v = parseFloat(e.value);
        if (!isNaN(v)) {
          if (!paramValues[e.parameter]) paramValues[e.parameter] = [];
          paramValues[e.parameter].push(v);
        }
      });

      let stabilityScore = 100;
      Object.values(paramValues).forEach(vals => {
        if (vals.length < 2) return;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const cv = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) / (mean || 1);
        stabilityScore -= cv * 100;
      });
      stabilityScore = Math.max(0, Math.min(100, stabilityScore));

      const healthScore = Math.max(0, 100 - alarms * 20 - warnings * 5);

      return {
        name: `${toolId}\n${chamberId}`,
        toolId,
        chamberId,
        alarms,
        warnings,
        total,
        stabilityScore: Math.round(stabilityScore),
        healthScore: Math.round(healthScore),
        successRate: total > 0 ? Math.round(((total - alarms) / total) * 100) : 100,
      };
    });

    // Drift detection
    const drifts: { param: string; toolId: string; trend: string; magnitude: number }[] = [];
    const tools = [...new Set(events.map(e => e.tool_id))];
    tools.forEach(toolId => {
      const toolEvents = events.filter(e => e.tool_id === toolId);
      const paramValues: Record<string, number[]> = {};
      toolEvents.forEach(e => {
        const v = parseFloat(e.value);
        if (!isNaN(v)) {
          if (!paramValues[e.parameter]) paramValues[e.parameter] = [];
          paramValues[e.parameter].push(v);
        }
      });

      Object.entries(paramValues).forEach(([param, vals]) => {
        if (vals.length < 3) return;
        const firstHalf = vals.slice(0, Math.floor(vals.length / 2));
        const secondHalf = vals.slice(Math.floor(vals.length / 2));
        const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const change = avgFirst !== 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;
        if (Math.abs(change) > 10) {
          drifts.push({
            param,
            toolId,
            trend: change > 0 ? 'increasing' : 'decreasing',
            magnitude: Math.abs(change),
          });
        }
      });
    });

    return { chamberStats, drifts };
  }, [events]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <Heart className="w-4 h-4 text-primary" />
        Tool Health Overview
      </h3>

      {/* Chamber health cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {health.chamberStats.map((ch, i) => (
          <motion.div
            key={`${ch.toolId}-${ch.chamberId}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`glass rounded-xl p-4 ${
              ch.healthScore < 50 ? 'border-destructive/40' :
              ch.healthScore < 80 ? 'border-warning/40' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-mono text-xs text-primary font-semibold">{ch.toolId}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{ch.chamberId}</p>
              </div>
              <div className={`text-lg font-bold ${
                ch.healthScore >= 80 ? 'text-success' : ch.healthScore >= 50 ? 'text-warning' : 'text-destructive'
              }`}>
                {ch.healthScore}%
              </div>
            </div>

            {/* Stability bar */}
            <div className="mb-2">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>Stability</span>
                <span>{ch.stabilityScore}%</span>
              </div>
              <div className="h-1.5 bg-background/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    ch.stabilityScore >= 80 ? 'bg-success' : ch.stabilityScore >= 50 ? 'bg-warning' : 'bg-destructive'
                  }`}
                  style={{ width: `${ch.stabilityScore}%` }}
                />
              </div>
            </div>

            <div className="flex gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="w-2.5 h-2.5" /> {ch.alarms} alarms
              </span>
              <span className="text-muted-foreground">{ch.successRate}% success</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Alarm frequency chart */}
      {health.chamberStats.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h4 className="text-xs font-medium text-muted-foreground mb-3">Alarm Frequency by Chamber</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={health.chamberStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'hsl(215, 12%, 52%)' }} />
              <YAxis tick={{ fontSize: 9, fill: 'hsl(215, 12%, 52%)' }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 18%, 10%)', border: '1px solid hsl(220, 14%, 18%)', borderRadius: '8px', fontSize: '11px', color: 'hsl(200, 20%, 92%)' }} />
              <Bar dataKey="alarms" fill="hsl(0, 72%, 55%)" radius={[4, 4, 0, 0]} name="Alarms" />
              <Bar dataKey="warnings" fill="hsl(38, 92%, 55%)" radius={[4, 4, 0, 0]} name="Warnings" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Process drift alerts */}
      {health.drifts.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 text-warning" />
            Process Drift Alerts
          </h4>
          <div className="space-y-2">
            {health.drifts.map((d, i) => (
              <div key={i} className="flex items-center gap-3 bg-warning/5 border border-warning/20 rounded-lg p-3 text-xs">
                <Activity className={`w-4 h-4 ${d.trend === 'increasing' ? 'text-destructive' : 'text-info'}`} />
                <div className="flex-1">
                  <span className="text-foreground font-medium">{d.param}</span>
                  <span className="text-muted-foreground"> on </span>
                  <span className="text-primary font-mono">{d.toolId}</span>
                </div>
                <span className={`font-mono font-semibold ${d.trend === 'increasing' ? 'text-destructive' : 'text-info'}`}>
                  {d.trend === 'increasing' ? '↑' : '↓'} {d.magnitude.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
