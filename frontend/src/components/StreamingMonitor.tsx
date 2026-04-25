import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Radio, Play, Square, AlertCircle, AlertTriangle, Server, MonitorSmartphone } from 'lucide-react';
import { useStreaming } from '@/contexts/StreamingContext';

export default function StreamingMonitor() {
  const {
    streaming,
    streamEvents,
    speed,
    setSpeed,
    mode,
    backendRunId,
    totalServerEvents,
    alarmCount,
    warningCount,
    startStream,
    stopStream,
  } = useStreaming();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamEvents]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Radio className={`w-4 h-4 ${streaming ? 'text-destructive animate-pulse' : 'text-primary'}`} />
          Real-Time Streaming
          {streaming && <span className="px-2 py-0.5 rounded-full bg-destructive/20 text-destructive text-[10px] font-bold animate-pulse">LIVE</span>}
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[10px]">
            {mode === 'backend' ? (
              <span className="flex items-center gap-1 text-green-400"><Server className="w-3 h-3" /> Backend</span>
            ) : mode === 'simulation' ? (
              <span className="flex items-center gap-1 text-yellow-400"><MonitorSmartphone className="w-3 h-3" /> Simulation</span>
            ) : (
              <span className="text-muted-foreground">Checking...</span>
            )}
          </div>
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
            onClick={streaming ? stopStream : () => startStream({ speed })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              streaming ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
            }`}
          >
            {streaming ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {streaming ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3 flex-wrap">
        <div className="glass rounded-lg px-3 py-2 text-xs flex items-center gap-2">
          <span className="text-muted-foreground">Events:</span>
          <span className="font-mono text-foreground font-bold">
            {mode === 'backend' && totalServerEvents > 0 ? totalServerEvents : streamEvents.length}
          </span>
        </div>
        <div className="glass rounded-lg px-3 py-2 text-xs flex items-center gap-2">
          <AlertCircle className="w-3 h-3 text-destructive" />
          <span className="font-mono text-destructive font-bold">{alarmCount}</span>
        </div>
        <div className="glass rounded-lg px-3 py-2 text-xs flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-warning" />
          <span className="font-mono text-warning font-bold">{warningCount}</span>
        </div>
        {backendRunId && (
          <div className="glass rounded-lg px-3 py-2 text-xs flex items-center gap-2">
            <span className="text-muted-foreground">Run:</span>
            <span className="font-mono text-primary font-bold">{backendRunId}</span>
          </div>
        )}
      </div>

      {/* Log stream */}
      <div ref={scrollRef} className="glass rounded-xl overflow-hidden max-h-[500px] overflow-y-auto font-mono text-xs">
        {streamEvents.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Press Start to begin {mode === 'backend' ? 'backend-connected' : ''} real-time log streaming
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {streamEvents.map((e, i) => (
              <div
                key={i}
                className={`px-3 py-1.5 flex items-center gap-3 ${
                  e.severity === 'alarm' || e.severity === 'critical' ? 'bg-destructive/5' :
                  e.severity === 'warning' ? 'bg-warning/5' : ''
                } ${i === streamEvents.length - 1 ? 'animate-pulse-glow' : ''}`}
              >
                <span className="text-muted-foreground whitespace-nowrap w-20">
                  {e.timestamp.split('T')[1]?.slice(0, 12) || ''}
                </span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  e.severity === 'alarm' || e.severity === 'critical' ? 'bg-destructive' :
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
