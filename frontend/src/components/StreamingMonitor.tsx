import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Radio, Play, Pause, Square, AlertCircle, AlertTriangle, Server, MonitorSmartphone } from 'lucide-react';
import { generateStreamEvent, type ParsedEvent } from '@/lib/logParser';
import { streamStart, streamAppend, streamFinish, isBackendAvailable } from '@/lib/api';

interface StreamEvent {
  timestamp: string;
  tool_id: string;
  chamber_id: string;
  parameter: string;
  value: string;
  unit?: string;
  severity: string;
  alarm_code?: string;
}

interface StreamingMonitorProps {
  onNewEvents?: (events: ParsedEvent[]) => void;
}

export default function StreamingMonitor({ onNewEvents }: StreamingMonitorProps) {
  const [streaming, setStreaming] = useState(false);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [speed, setSpeed] = useState(1000);
  const [mode, setMode] = useState<'checking' | 'backend' | 'simulation'>('checking');
  const [backendRunId, setBackendRunId] = useState<string | null>(null);
  const [totalServerEvents, setTotalServerEvents] = useState(0);
  const [serverAlarms, setServerAlarms] = useState(0);
  const [serverWarnings, setServerWarnings] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isBackendAvailable().then(ok => setMode(ok ? 'backend' : 'simulation'));
  }, []);

  const generateLine = useCallback((): { event: StreamEvent; raw: string } => {
    const tools = ['ETCH_TOOL_01', 'DEP_TOOL_01', 'EUV_SCAN_01'];
    const chambers = ['CH_A', 'CH_B'];
    const params = ['temperature', 'pressure', 'rf_power', 'gas_flow'];
    const ranges: Record<string, { base: number; v: number; unit: string }> = {
      temperature: { base: 120, v: 30, unit: 'C' },
      pressure: { base: 1.0, v: 0.5, unit: 'Torr' },
      rf_power: { base: 500, v: 50, unit: 'W' },
      gas_flow: { base: 300, v: 80, unit: 'sccm' },
    };
    const tool = tools[Math.floor(Math.random() * tools.length)];
    const ch = chambers[Math.floor(Math.random() * chambers.length)];
    const param = params[Math.floor(Math.random() * params.length)];
    const r = ranges[param];
    const val = (r.base + (Math.random() - 0.5) * r.v * 2).toFixed(2);
    const isAlarm = Math.random() < 0.05;
    const isWarning = !isAlarm && Math.random() < 0.1;
    const sev = isAlarm ? 'alarm' : isWarning ? 'warning' : 'info';
    const ts = new Date().toISOString();
    const alarmCode = isAlarm ? `ALM_${param.toUpperCase()}_OOR` : undefined;
    const raw = `${ts},${tool},${ch},PARAMETER_READING,${param},${val},${r.unit},${alarmCode || ''},${sev},`;

    return {
      event: { timestamp: ts, tool_id: tool, chamber_id: ch, parameter: param, value: val, unit: r.unit, severity: sev, alarm_code: alarmCode },
      raw,
    };
  }, []);

  const startStream = useCallback(async () => {
    setStreaming(true);
    setStreamEvents([]);
    setTotalServerEvents(0);
    setServerAlarms(0);
    setServerWarnings(0);

    let runId: string | null = null;
    if (mode === 'backend') {
      try {
        const res = await streamStart('STREAM_TOOL');
        runId = res.run_id;
        setBackendRunId(runId);
      } catch {
        setMode('simulation');
      }
    }

    const batchLines: string[] = [];
    intervalRef.current = setInterval(async () => {
      const { event, raw } = generateLine();

      setStreamEvents(prev => {
        const next = [...prev, event].slice(-200);
        return next;
      });

      if (runId) {
        batchLines.push(raw);
        if (batchLines.length >= 3) {
          const header = 'timestamp,tool_id,chamber_id,event_type,parameter,value,unit,alarm_code,severity,message';
          const payload = [header, ...batchLines.splice(0)].join('\n');
          try {
            const resp = await streamAppend(runId, payload);
            setTotalServerEvents(resp.total_events);
            if (resp.alarm_count !== undefined) setServerAlarms(resp.alarm_count);
            if (resp.warning_count !== undefined) setServerWarnings(resp.warning_count);
          } catch { /* batch dropped, continue streaming */ }
        }
      }

      if (onNewEvents) {
        const pe = generateStreamEvent(event.tool_id, event.chamber_id, '', '', runId || 'SIM');
        onNewEvents([pe]);
      }
    }, speed);
  }, [speed, mode, generateLine, onNewEvents]);

  const stopStream = useCallback(async () => {
    setStreaming(false);
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (backendRunId && mode === 'backend') {
      try {
        await streamFinish(backendRunId);
      } catch { /* best effort */ }
    }
    setBackendRunId(null);
  }, [backendRunId, mode]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamEvents]);

  const localAlarms = streamEvents.filter(e => e.severity === 'alarm' || e.severity === 'critical').length;
  const localWarnings = streamEvents.filter(e => e.severity === 'warning').length;
  const alarmCount = mode === 'backend' && serverAlarms > 0 ? serverAlarms : localAlarms;
  const warningCount = mode === 'backend' && serverWarnings > 0 ? serverWarnings : localWarnings;

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
            onClick={streaming ? stopStream : startStream}
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
