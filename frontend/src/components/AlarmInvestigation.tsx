import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Clock, ChevronRight, Cpu, Box, BookOpen, Layers } from 'lucide-react';
import type { ParsedEvent } from '@/lib/logParser';

interface AlarmInvestigationProps {
  events: ParsedEvent[];
}

export default function AlarmInvestigation({ events }: AlarmInvestigationProps) {
  const [selectedAlarm, setSelectedAlarm] = useState<number | null>(null);

  const alarms = useMemo(() => {
    return events
      .map((e, idx) => ({ event: e, index: idx }))
      .filter(({ event }) =>
        event.severity === 'alarm' ||
        event.severity === 'critical' ||
        event.event_type === 'alarm'
      );
  }, [events]);

  const investigation = useMemo(() => {
    if (selectedAlarm === null) return null;
    const alarmEntry = alarms[selectedAlarm];
    if (!alarmEntry) return null;

    const { event, index } = alarmEntry;
    // Get events within ±5 positions for context
    const contextRange = 8;
    const startIdx = Math.max(0, index - contextRange);
    const endIdx = Math.min(events.length - 1, index + contextRange);
    const contextEvents = events.slice(startIdx, endIdx + 1).map((e, i) => ({
      event: e,
      isAlarm: startIdx + i === index,
      relativeIndex: startIdx + i - index,
    }));

    // Get parameter values just before the alarm
    const beforeEvents = events.slice(Math.max(0, index - 10), index);
    const paramsBefore: Record<string, { value: string; unit?: string }> = {};
    beforeEvents.forEach(e => {
      paramsBefore[e.parameter] = { value: e.value, unit: e.unit };
    });

    return { alarm: event, contextEvents, paramsBefore };
  }, [selectedAlarm, alarms, events]);

  if (alarms.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-xl p-8 text-center">
        <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-3" />
        <p className="text-foreground font-medium">No Alarms Detected</p>
        <p className="text-sm text-muted-foreground mt-1">All events are within normal operational parameters.</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-destructive" />
        Alarm Investigation ({alarms.length} alarm{alarms.length > 1 ? 's' : ''})
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alarm list */}
        <div className="glass rounded-xl p-3 space-y-1 max-h-[600px] overflow-y-auto">
          {alarms.map((a, i) => (
            <button
              key={i}
              onClick={() => setSelectedAlarm(i)}
              className={`w-full text-left p-3 rounded-lg text-xs transition-all ${
                selectedAlarm === i
                  ? 'bg-destructive/15 border border-destructive/40'
                  : 'hover:bg-secondary/50 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-destructive font-semibold">
                  {a.event.alarm_code || `ALARM_${i + 1}`}
                </span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-mono">{a.event.tool_id} · {a.event.chamber_id}</p>
              <p className="text-muted-foreground mt-0.5">{a.event.parameter} = {a.event.value}{a.event.unit || ''}</p>
              <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                <Clock className="w-2.5 h-2.5" />
                {a.event.timestamp}
              </div>
            </button>
          ))}
        </div>

        {/* Investigation detail */}
        <div className="lg:col-span-2 space-y-4">
          {investigation ? (
            <>
              {/* Alarm info card */}
              <div className="glass rounded-xl p-4 border-destructive/30">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">
                      {investigation.alarm.alarm_code || 'ALARM'}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {investigation.alarm.parameter} = {investigation.alarm.value}{investigation.alarm.unit || ''}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-background/50 rounded p-2">
                    <Cpu className="w-3 h-3 text-primary mb-1" />
                    <p className="text-muted-foreground">Tool</p>
                    <p className="font-mono text-foreground">{investigation.alarm.tool_id}</p>
                  </div>
                  <div className="bg-background/50 rounded p-2">
                    <Box className="w-3 h-3 text-warning mb-1" />
                    <p className="text-muted-foreground">Chamber</p>
                    <p className="font-mono text-foreground">{investigation.alarm.chamber_id}</p>
                  </div>
                  <div className="bg-background/50 rounded p-2">
                    <BookOpen className="w-3 h-3 text-success mb-1" />
                    <p className="text-muted-foreground">Recipe</p>
                    <p className="font-mono text-foreground truncate">{investigation.alarm.recipe_name}</p>
                  </div>
                  <div className="bg-background/50 rounded p-2">
                    <Layers className="w-3 h-3 text-info mb-1" />
                    <p className="text-muted-foreground">Step</p>
                    <p className="font-mono text-foreground">{investigation.alarm.recipe_step || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Parameters before alarm */}
              {Object.keys(investigation.paramsBefore).length > 0 && (
                <div className="glass rounded-xl p-4">
                  <h4 className="text-xs font-medium text-muted-foreground mb-3">Parameters Before Alarm</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(investigation.paramsBefore).map(([param, v]) => (
                      <div key={param} className="bg-background/50 rounded p-2 text-xs">
                        <p className="text-muted-foreground">{param}</p>
                        <p className="font-mono text-foreground font-medium">{v.value}{v.unit ? ` ${v.unit}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Event timeline */}
              <div className="glass rounded-xl p-4">
                <h4 className="text-xs font-medium text-muted-foreground mb-3">Event Timeline</h4>
                <div className="space-y-0">
                  {investigation.contextEvents.map((ctx, i) => {
                    const e = ctx.event;
                    const isSev = e.severity === 'alarm' || e.severity === 'warning';
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-3 py-2 px-2 text-xs rounded ${
                          ctx.isAlarm ? 'bg-destructive/10 border border-destructive/30' :
                          isSev ? 'bg-warning/5' : ''
                        }`}
                      >
                        <div className="flex flex-col items-center min-w-0">
                          <div className={`w-2 h-2 rounded-full mt-1 ${
                            ctx.isAlarm ? 'bg-destructive' :
                            e.severity === 'warning' ? 'bg-warning' : 'bg-muted-foreground/30'
                          }`} />
                          {i < investigation.contextEvents.length - 1 && (
                            <div className="w-px h-4 bg-border mt-0.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground whitespace-nowrap">
                              {e.timestamp.split('T')[1]?.slice(0, 8) || e.timestamp.slice(-8)}
                            </span>
                            {ctx.isAlarm && (
                              <span className="px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-semibold text-[10px]">ALARM</span>
                            )}
                            {!ctx.isAlarm && e.severity === 'warning' && (
                              <span className="px-1.5 py-0.5 rounded bg-warning/20 text-warning font-semibold text-[10px]">WARN</span>
                            )}
                          </div>
                          <p className="text-foreground mt-0.5">
                            {e.parameter} = {e.value}{e.unit || ''}
                            <span className="text-muted-foreground ml-2">{e.tool_id}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="glass rounded-xl p-8 text-center">
              <p className="text-muted-foreground text-sm">Select an alarm to investigate</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
