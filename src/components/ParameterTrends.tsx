import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Filter } from 'lucide-react';
import type { ParsedEvent } from '@/lib/logParser';
import type { HierarchyFilter } from './EquipmentHierarchy';

interface ParameterTrendsProps {
  events: ParsedEvent[];
  filter: HierarchyFilter;
}

const COLORS = [
  'hsl(185, 72%, 48%)',
  'hsl(152, 60%, 45%)',
  'hsl(38, 92%, 55%)',
  'hsl(210, 80%, 56%)',
  'hsl(0, 72%, 55%)',
  'hsl(270, 60%, 55%)',
];

export default function ParameterTrends({ events, filter }: ParameterTrendsProps) {
  const [selectedParams, setSelectedParams] = useState<string[]>([]);

  const filtered = useMemo(() => {
    let e = events;
    if (filter.tool_id) e = e.filter(ev => ev.tool_id === filter.tool_id);
    if (filter.chamber_id) e = e.filter(ev => ev.chamber_id === filter.chamber_id);
    if (filter.recipe_name) e = e.filter(ev => ev.recipe_name === filter.recipe_name);
    if (filter.recipe_step) e = e.filter(ev => ev.recipe_step === filter.recipe_step);
    if (filter.run_id) e = e.filter(ev => ev.run_id === filter.run_id);
    return e;
  }, [events, filter]);

  const params = useMemo(() => {
    const p = new Set<string>();
    filtered.forEach(e => {
      if (!isNaN(parseFloat(e.value))) p.add(e.parameter);
    });
    return [...p].sort();
  }, [filtered]);

  // Auto-select first 3 params
  const activeParams = selectedParams.length > 0 ? selectedParams : params.slice(0, 3);

  const chartData = useMemo(() => {
    const timeMap: Record<string, Record<string, number>> = {};
    filtered.forEach(e => {
      if (!activeParams.includes(e.parameter)) return;
      const v = parseFloat(e.value);
      if (isNaN(v)) return;
      const time = e.timestamp.split('T')[1]?.slice(0, 8) || e.timestamp.slice(-8);
      if (!timeMap[time]) timeMap[time] = {};
      timeMap[time][e.parameter] = v;
    });
    return Object.entries(timeMap)
      .map(([time, vals]) => ({ time, ...vals }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [filtered, activeParams]);

  // Individual charts per parameter
  const paramCharts = useMemo(() => {
    return activeParams.map(param => {
      const data = filtered
        .filter(e => e.parameter === param && !isNaN(parseFloat(e.value)))
        .map(e => ({
          time: e.timestamp.split('T')[1]?.slice(0, 8) || e.timestamp.slice(-8),
          value: parseFloat(e.value),
          tool: e.tool_id,
          chamber: e.chamber_id,
          step: e.recipe_step,
        }))
        .sort((a, b) => a.time.localeCompare(b.time));

      const values = data.map(d => d.value);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 0;

      return { param, data, avg, min, max, unit: filtered.find(e => e.parameter === param)?.unit || '' };
    });
  }, [filtered, activeParams]);

  const toggleParam = (p: string) => {
    setSelectedParams(prev => {
      const current = prev.length > 0 ? prev : params.slice(0, 3);
      return current.includes(p) ? current.filter(x => x !== p) : [...current, p];
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Parameter Trends
        </h3>
        {(filter.tool_id || filter.chamber_id) && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Filter className="w-3 h-3" />
            {[filter.tool_id, filter.chamber_id, filter.recipe_name, filter.recipe_step].filter(Boolean).join(' › ')}
          </div>
        )}
      </div>

      {/* Parameter selector */}
      <div className="flex flex-wrap gap-1.5">
        {params.map((p, i) => (
          <button
            key={p}
            onClick={() => toggleParam(p)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
              activeParams.includes(p)
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Combined overlay chart */}
      {chartData.length > 1 && (
        <div className="glass rounded-xl p-5">
          <h4 className="text-xs font-medium text-muted-foreground mb-3">Combined Overlay</h4>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'hsl(215, 12%, 52%)' }} />
              <YAxis tick={{ fontSize: 9, fill: 'hsl(215, 12%, 52%)' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(220, 18%, 10%)',
                  border: '1px solid hsl(220, 14%, 18%)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: 'hsl(200, 20%, 92%)',
                }}
              />
              <Legend />
              {activeParams.map((p, i) => (
                <Line key={p} type="monotone" dataKey={p} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Individual parameter charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {paramCharts.map((pc, i) => (
          <motion.div
            key={pc.param}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-medium text-foreground capitalize">{pc.param}</h4>
              <div className="flex gap-3 text-[10px] text-muted-foreground font-mono">
                <span>min: {pc.min.toFixed(1)}</span>
                <span className="text-primary">avg: {pc.avg.toFixed(1)}</span>
                <span>max: {pc.max.toFixed(1)}</span>
                {pc.unit && <span className="text-muted-foreground">{pc.unit}</span>}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={pc.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis dataKey="time" tick={{ fontSize: 8, fill: 'hsl(215, 12%, 52%)' }} />
                <YAxis tick={{ fontSize: 8, fill: 'hsl(215, 12%, 52%)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(220, 18%, 10%)',
                    border: '1px solid hsl(220, 14%, 18%)',
                    borderRadius: '8px',
                    fontSize: '10px',
                    color: 'hsl(200, 20%, 92%)',
                  }}
                />
                <Line type="monotone" dataKey="value" stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="glass rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm">No data matches current filter</p>
        </div>
      )}
    </motion.div>
  );
}
