import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Box, BookOpen, AlertCircle, Activity, Clock, Heart, Hash } from 'lucide-react';
import type { ParsedEvent } from '@/lib/logParser';
import type { HierarchyFilter } from './EquipmentHierarchy';

interface ToolOverviewProps {
  events: ParsedEvent[];
  filter: HierarchyFilter;
}

export default function ToolOverview({ events, filter }: ToolOverviewProps) {
  const overview = useMemo(() => {
    const tools = [...new Set(events.map(e => e.tool_id))];
    return tools.map(toolId => {
      const toolEvents = events.filter(e => e.tool_id === toolId);
      const chambers = [...new Set(toolEvents.map(e => e.chamber_id))];
      const recipes = [...new Set(toolEvents.map(e => e.recipe_name).filter(Boolean))];
      const runs = [...new Set(toolEvents.map(e => e.run_id))];
      const alarms = toolEvents.filter(e => e.severity === 'alarm');
      const warnings = toolEvents.filter(e => e.severity === 'warning');
      const timestamps = toolEvents.map(e => e.timestamp).sort();
      const lastRun = timestamps[timestamps.length - 1] || 'N/A';

      // Health score: 100 - (alarms * 20) - (warnings * 5)
      const healthScore = Math.max(0, 100 - alarms.length * 20 - warnings.length * 5);
      const healthStatus = healthScore >= 80 ? 'Healthy' : healthScore >= 50 ? 'Degraded' : 'Critical';
      const healthColor = healthScore >= 80 ? 'text-success' : healthScore >= 50 ? 'text-warning' : 'text-destructive';

      // Current recipe/step (latest event)
      const latest = toolEvents[toolEvents.length - 1];

      return {
        toolId,
        chambers,
        recipes,
        runs,
        alarmCount: alarms.length,
        warningCount: warnings.length,
        totalEvents: toolEvents.length,
        lastRun,
        healthScore,
        healthStatus,
        healthColor,
        currentRecipe: latest?.recipe_name || 'N/A',
        currentStep: latest?.recipe_step || 'N/A',
        currentChamber: latest?.chamber_id || 'N/A',
      };
    });
  }, [events]);

  const cards = [
    { icon: Cpu, label: 'Total Tools', value: overview.length, color: 'text-primary' },
    { icon: Box, label: 'Chambers', value: [...new Set(events.map(e => e.chamber_id))].length, color: 'text-info' },
    { icon: AlertCircle, label: 'Active Alarms', value: events.filter(e => e.severity === 'alarm').length, color: 'text-destructive' },
    { icon: Hash, label: 'Total Runs', value: [...new Set(events.map(e => e.run_id))].length, color: 'text-success' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-xl p-4"
          >
            <div className="flex items-center gap-3">
              <card.icon className={`w-5 h-5 ${card.color}`} />
              <div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-[11px] text-muted-foreground">{card.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tool cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {overview.map((tool, i) => (
          <motion.div
            key={tool.toolId}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.05 }}
            className={`glass rounded-xl p-5 space-y-4 ${
              tool.healthStatus === 'Critical' ? 'border-destructive/40' :
              tool.healthStatus === 'Degraded' ? 'border-warning/40' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Cpu className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground font-mono">{tool.toolId}</h3>
                  <p className="text-[11px] text-muted-foreground">{tool.chambers.length} chamber{tool.chambers.length > 1 ? 's' : ''} · {tool.totalEvents} events</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Heart className={`w-4 h-4 ${tool.healthColor}`} />
                <span className={`text-xs font-semibold ${tool.healthColor}`}>{tool.healthStatus}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-background/50 rounded-lg p-2.5">
                <p className="text-muted-foreground mb-0.5">Chamber</p>
                <p className="font-mono text-foreground font-medium">{tool.currentChamber}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-2.5">
                <p className="text-muted-foreground mb-0.5">Recipe</p>
                <p className="font-mono text-foreground font-medium truncate">{tool.currentRecipe}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-2.5">
                <p className="text-muted-foreground mb-0.5">Step</p>
                <p className="font-mono text-foreground font-medium">{tool.currentStep}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-2.5">
                <p className="text-muted-foreground mb-0.5">Alarms</p>
                <p className={`font-mono font-bold ${tool.alarmCount > 0 ? 'text-destructive' : 'text-success'}`}>
                  {tool.alarmCount}
                </p>
              </div>
            </div>

            {/* Health bar */}
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Health Score</span>
                <span className={tool.healthColor}>{tool.healthScore}%</span>
              </div>
              <div className="h-1.5 bg-background/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${tool.healthScore}%` }}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                  className={`h-full rounded-full ${
                    tool.healthScore >= 80 ? 'bg-success' : tool.healthScore >= 50 ? 'bg-warning' : 'bg-destructive'
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>Last: {tool.lastRun}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
