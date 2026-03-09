import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Radio, Play, Pause, AlertCircle, AlertTriangle } from 'lucide-react';
import { generateStreamEvent, type ParsedEvent } from '@/lib/logParser';

interface StreamingMonitorProps {
  onNewEvents?: (events: ParsedEvent[]) => void;
}

export default function StreamingMonitor({ onNewEvents }: StreamingMonitorProps) {
  const [streaming, setStreaming] = useState(false);
  const [streamEvents, setStreamEvents] = useState<ParsedEvent[]>([]);
  const [speed, setSpeed] = useState(1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const startStream = useCallback(() => {
    setStreaming(true);
    intervalRef.current = setInterval(() => {
      const tools = ['ETCH_TOOL_01', 'DEP_TOOL_01', 'EUV_SCAN_01'];
      const chambers = ['CH_A', 'CH_B'];
      const recipes = ['RCP_POLYETCH_02', 'CVD_OXIDE_01', 'EUV_EXPOSE_01'];
      const steps = ['Pump Down', 'Gas Stabilization', 'Plasma Etch', 'Main Etch', 'Cool Down'];

      const tool = tools[Math.floor(Math.random() * tools.length)];
      const ch = chambers[Math.floor(Math.random() * chambers.length)];
      const recipe = recipes[Math.floor(Math.random() * recipes.length)];
      const step = steps[Math.floor(Math.random() * steps.length)];

      const event = generateStreamEvent(tool, ch, recipe, step, `RUN_STREAM_001`);
      setStreamEvents(prev => {
        const next = [...prev, event].slice(-200);
        onNewEvents?.(next);
        return next;
      });
    }, speed);
  }, [speed, onNewEvents]);

  const stopStream = useCallback(() => {
    setStreaming(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamEvents]);

  const alarmCount = streamEvents.filter(e => e.severity === 'alarm').length;
  const warningCount = streamEvents.filter(e => e.severity === 'warning').length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Radio className={`w-4 h-4 ${streaming ? 'text-destructive animate-pulse' : 'text-primary'}`} />
          Real-Time Streaming
          {streaming && <span className="px-2 py-0.5 rounded-full bg-destructive/20 text-destructive text-[10px] font-bold animate-pulse">LIVE</span>}
        </h3>
        <div className="flex items-center gap-3">
          <select
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground"
          >
            <option value={2000}>0.5x</option>
            <option value={1000}>1x</option>
            <option value={500}>2x</option>
            <option value={200}>5x</option>
          </select>
          <button
            onClick={streaming ? stopStream : startStream}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              streaming ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
            }`}
          >
            {streaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {streaming ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3">
        <div className="glass rounded-lg px-3 py-2 text-xs flex items-center gap-2">
          <span className="text-muted-foreground">Events:</span>
          <span className="font-mono text-foreground font-bold">{streamEvents.length}</span>
        </div>
        <div className="glass rounded-lg px-3 py-2 text-xs flex items-center gap-2">
          <AlertCircle className="w-3 h-3 text-destructive" />
          <span className="font-mono text-destructive font-bold">{alarmCount}</span>
        </div>
        <div className="glass rounded-lg px-3 py-2 text-xs flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-warning" />
          <span className="font-mono text-warning font-bold">{warningCount}</span>
        </div>
      </div>

      {/* Log stream */}
      <div ref={scrollRef} className="glass rounded-xl overflow-hidden max-h-[500px] overflow-y-auto font-mono text-xs">
        {streamEvents.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Press Start to begin real-time log simulation
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {streamEvents.map((e, i) => (
              <div
                key={i}
                className={`px-3 py-1.5 flex items-center gap-3 ${
                  e.severity === 'alarm' ? 'bg-destructive/5' :
                  e.severity === 'warning' ? 'bg-warning/5' : ''
                } ${i === streamEvents.length - 1 ? 'animate-pulse-glow' : ''}`}
              >
                <span className="text-muted-foreground whitespace-nowrap w-20">
                  {e.timestamp.split('T')[1]?.slice(0, 12) || ''}
                </span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  e.severity === 'alarm' ? 'bg-destructive' :
                  e.severity === 'warning' ? 'bg-warning' : 'bg-success'
                }`} />
                <span className="text-primary w-28 truncate">{e.tool_id}</span>
                <span className="text-muted-foreground w-12">{e.chamber_id}</span>
                <span className="text-foreground flex-1 truncate">
                  {e.parameter}={e.value}{e.unit || ''}
                </span>
                {e.alarm_code && (
                  <span className="text-destructive font-semibold">{e.alarm_code}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
