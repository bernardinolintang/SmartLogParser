import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layers, AlertCircle } from 'lucide-react';
import type { ParsedEvent } from '@/lib/logParser';

interface RecipeTimelineProps {
  events: ParsedEvent[];
}

export default function RecipeTimeline({ events }: RecipeTimelineProps) {
  const timelines = useMemo(() => {
    // Group by tool+chamber+run
    const groups: Record<string, { steps: { name: string; events: ParsedEvent[]; hasAlarm: boolean; hasWarning: boolean }[] }> = {};

    events.forEach(e => {
      const key = `${e.tool_id}|${e.chamber_id}|${e.run_id}`;
      if (!groups[key]) groups[key] = { steps: [] };

      let step = groups[key].steps.find(s => s.name === e.recipe_step);
      if (!step) {
        step = { name: e.recipe_step || '(unnamed)', events: [], hasAlarm: false, hasWarning: false };
        groups[key].steps.push(step);
      }
      step.events.push(e);
      if (e.severity === 'alarm') step.hasAlarm = true;
      if (e.severity === 'warning') step.hasWarning = true;
    });

    return Object.entries(groups).map(([key, data]) => {
      const [tool_id, chamber_id, run_id] = key.split('|');
      const recipe = data.steps[0]?.events[0]?.recipe_name || 'Unknown';
      return { tool_id, chamber_id, run_id, recipe, steps: data.steps };
    });
  }, [events]);

  if (timelines.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <p className="text-muted-foreground text-sm">No recipe step data available</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <Layers className="w-4 h-4 text-primary" />
        Recipe Execution Timeline
      </h3>

      {timelines.map((tl, ti) => (
        <motion.div
          key={`${tl.tool_id}-${tl.run_id}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: ti * 0.1 }}
          className="glass rounded-xl p-5 space-y-3"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-primary font-semibold">{tl.tool_id}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">{tl.chamber_id}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-foreground">{tl.recipe}</span>
            <span className="text-muted-foreground ml-auto font-mono text-[10px]">{tl.run_id}</span>
          </div>

          {/* Visual timeline bar */}
          <div className="flex gap-1 h-10">
            {tl.steps.map((step, si) => (
              <div
                key={si}
                className={`flex-1 rounded-md flex items-center justify-center text-[10px] font-medium border transition-all cursor-default ${
                  step.hasAlarm
                    ? 'bg-destructive/20 border-destructive/50 text-destructive'
                    : step.hasWarning
                      ? 'bg-warning/20 border-warning/50 text-warning'
                      : 'bg-primary/10 border-primary/30 text-primary'
                }`}
                title={`${step.name}: ${step.events.length} events`}
              >
                <span className="truncate px-1">{step.name}</span>
                {step.hasAlarm && <AlertCircle className="w-3 h-3 ml-0.5 flex-shrink-0" />}
              </div>
            ))}
          </div>

          {/* Step details */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {tl.steps.map((step, si) => (
              <div
                key={si}
                className={`rounded-lg p-2 text-xs ${
                  step.hasAlarm ? 'bg-destructive/5 border border-destructive/20' :
                  step.hasWarning ? 'bg-warning/5 border border-warning/20' :
                  'bg-background/50 border border-border/50'
                }`}
              >
                <p className="font-medium text-foreground truncate">{step.name}</p>
                <p className="text-[10px] text-muted-foreground">{step.events.length} events</p>
                {step.hasAlarm && <p className="text-[10px] text-destructive font-medium mt-0.5">⚠ Alarm</p>}
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
