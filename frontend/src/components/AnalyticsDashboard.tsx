import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, Thermometer, Gauge, Zap } from 'lucide-react';
import type { ParsedEvent } from '@/lib/logParser';

interface AnalyticsDashboardProps {
  events: ParsedEvent[];
}

const CHART_COLORS = [
  'hsl(185, 72%, 48%)',
  'hsl(152, 60%, 45%)',
  'hsl(38, 92%, 55%)',
  'hsl(210, 80%, 56%)',
  'hsl(0, 72%, 55%)',
  'hsl(270, 60%, 55%)',
];

function compactTimestamp(ts: string): string {
  if (!ts) return '';
  const dateMatch = ts.match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (dateMatch) {
    return `${dateMatch[1].slice(5)} ${dateMatch[2]}`;
  }
  return ts.split('T')[1]?.slice(0, 8) || ts.slice(-8);
}

export default function AnalyticsDashboard({ events }: AnalyticsDashboardProps) {
  const stats = useMemo(() => {
    const numericEvents = events.filter(e => !isNaN(parseFloat(e.value)));
    
    const paramCounts: Record<string, number> = {};
    events.forEach(e => { paramCounts[e.parameter] = (paramCounts[e.parameter] || 0) + 1; });
    const paramDistribution = Object.entries(paramCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const equipCounts: Record<string, number> = {};
    events.forEach(e => { equipCounts[e.equipment_id] = (equipCounts[e.equipment_id] || 0) + 1; });
    const equipmentData = Object.entries(equipCounts)
      .map(([name, events]) => ({ name, events }));

    const paramGroups: Record<string, { time: string; value: number }[]> = {};
    numericEvents.forEach(e => {
      if (!paramGroups[e.parameter]) paramGroups[e.parameter] = [];
      paramGroups[e.parameter].push({
        time: compactTimestamp(e.timestamp),
        value: parseFloat(e.value),
      });
    });

    const paramAvgs: { parameter: string; avg: number; min: number; max: number }[] = [];
    for (const [param, vals] of Object.entries(paramGroups)) {
      const values = vals.map(v => v.value);
      paramAvgs.push({
        parameter: param,
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      });
    }

    return { paramDistribution, equipmentData, paramGroups, paramAvgs };
  }, [events]);

  const paramKeys = Object.keys(stats.paramGroups);
  const [trendParam, setTrendParam] = useState<string>(paramKeys[0] || '');
  if (trendParam && !paramKeys.includes(trendParam) && paramKeys.length > 0) {
    setTrendParam(paramKeys[0]);
  }
  const trendData = trendParam ? (stats.paramGroups[trendParam] || []) : [];

  const summaryCards = [
    { icon: Activity, label: 'Total Events', value: events.length, color: 'text-primary' },
    { icon: Thermometer, label: 'Parameters', value: stats.paramDistribution.length, color: 'text-success' },
    { icon: Gauge, label: 'Equipment', value: stats.equipmentData.length, color: 'text-info' },
    { icon: Zap, label: 'Alarms', value: events.filter(e => e.severity === 'alarm' || e.severity === 'critical').length, color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass rounded-xl p-4"
          >
            <div className="flex items-center gap-3">
              <card.icon className={`w-5 h-5 ${card.color}`} />
              <div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Parameter trend */}
        {paramKeys.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground capitalize">
                {trendParam} Trend
              </h3>
              <select
                value={trendParam}
                onChange={e => setTrendParam(e.target.value)}
                className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground"
              >
                {paramKeys.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(215, 12%, 52%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215, 12%, 52%)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(220, 18%, 10%)',
                    border: '1px solid hsl(220, 14%, 18%)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(200, 20%, 92%)',
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="hsl(185, 72%, 48%)" strokeWidth={2} dot={{ fill: 'hsl(185, 72%, 48%)', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Parameter distribution pie */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-xl p-5"
        >
          <h3 className="text-sm font-medium text-foreground mb-4">Parameter Distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={stats.paramDistribution}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {stats.paramDistribution.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(220, 18%, 10%)',
                  border: '1px solid hsl(220, 14%, 18%)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(200, 20%, 92%)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2">
            {stats.paramDistribution.slice(0, 6).map((p, i) => (
              <span key={p.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                {p.name}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Equipment events bar */}
        {stats.equipmentData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass rounded-xl p-5"
          >
            <h3 className="text-sm font-medium text-foreground mb-4">Events per Equipment</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.equipmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(215, 12%, 52%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215, 12%, 52%)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(220, 18%, 10%)',
                    border: '1px solid hsl(220, 14%, 18%)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(200, 20%, 92%)',
                  }}
                />
                <Bar dataKey="events" fill="hsl(185, 72%, 48%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Parameter Stats Table */}
        {stats.paramAvgs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass rounded-xl p-5"
          >
            <h3 className="text-sm font-medium text-foreground mb-4">Parameter Statistics</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Parameter</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Min</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Avg</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.paramAvgs.map(p => (
                    <tr key={p.parameter} className="border-b border-border/30">
                      <td className="py-2 px-3 text-foreground">{p.parameter}</td>
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">{p.min.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono text-primary font-medium">{p.avg.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">{p.max.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
