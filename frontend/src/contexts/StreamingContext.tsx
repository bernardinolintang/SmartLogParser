import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { generateStreamEvent, type ParsedEvent } from "@/lib/logParser";
import { isBackendAvailable, streamAppend, streamFinish, streamStart } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export interface StreamEvent {
  timestamp: string;
  tool_id: string;
  chamber_id: string;
  parameter: string;
  value: string;
  unit?: string;
  severity: string;
  alarm_code?: string;
}

type StreamMode = "checking" | "backend" | "simulation";

type StartOptions = {
  speed?: number;
};

type StreamingContextValue = {
  streaming: boolean;
  streamEvents: StreamEvent[];
  speed: number;
  mode: StreamMode;
  backendRunId: string | null;
  totalServerEvents: number;
  serverAlarms: number;
  serverWarnings: number;
  localAlarms: number;
  localWarnings: number;
  alarmCount: number;
  warningCount: number;
  startStream: (opts?: StartOptions) => Promise<void>;
  stopStream: () => Promise<void>;
  setSpeed: (ms: number) => void;
};

const StreamingContext = createContext<StreamingContextValue | null>(null);

function generateLine(): { event: StreamEvent; raw: string } {
  const tools = ["ETCH_TOOL_01", "DEP_TOOL_01", "EUV_SCAN_01"];
  const chambers = ["CH_A", "CH_B"];
  const params = ["temperature", "pressure", "rf_power", "gas_flow"];
  const ranges: Record<string, { base: number; v: number; unit: string }> = {
    temperature: { base: 120, v: 30, unit: "C" },
    pressure: { base: 1.0, v: 0.5, unit: "Torr" },
    rf_power: { base: 500, v: 50, unit: "W" },
    gas_flow: { base: 300, v: 80, unit: "sccm" },
  };
  const tool = tools[Math.floor(Math.random() * tools.length)];
  const ch = chambers[Math.floor(Math.random() * chambers.length)];
  const param = params[Math.floor(Math.random() * params.length)];
  const r = ranges[param];
  const val = (r.base + (Math.random() - 0.5) * r.v * 2).toFixed(2);
  const isAlarm = Math.random() < 0.05;
  const isWarning = !isAlarm && Math.random() < 0.1;
  const sev = isAlarm ? "alarm" : isWarning ? "warning" : "info";
  const ts = new Date().toISOString();
  const alarmCode = isAlarm ? `ALM_${param.toUpperCase()}_OOR` : undefined;
  const raw = `${ts},${tool},${ch},PARAMETER_READING,${param},${val},${r.unit},${alarmCode || ""},${sev},`;

  return {
    event: { timestamp: ts, tool_id: tool, chamber_id: ch, parameter: param, value: val, unit: r.unit, severity: sev, alarm_code: alarmCode },
    raw,
  };
}

export function StreamingProvider({ children }: { children: React.ReactNode }) {
  const [streaming, setStreaming] = useState(false);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [speed, setSpeed] = useState(1000);
  const [mode, setMode] = useState<StreamMode>("checking");
  const [backendRunId, setBackendRunId] = useState<string | null>(null);
  const [totalServerEvents, setTotalServerEvents] = useState(0);
  const [serverAlarms, setServerAlarms] = useState(0);
  const [serverWarnings, setServerWarnings] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchLinesRef = useRef<string[]>([]);
  const backendRunIdRef = useRef<string | null>(null);
  const modeRef = useRef<StreamMode>("checking");

  useEffect(() => {
    isBackendAvailable().then((ok) => setMode(ok ? "backend" : "simulation"));
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    backendRunIdRef.current = backendRunId;
  }, [backendRunId]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const stopStream = useCallback(async () => {
    if (!streaming) return;
    setStreaming(false);
    clearTimer();

    const runId = backendRunIdRef.current;
    const currentMode = modeRef.current;
    if (runId && currentMode === "backend") {
      try {
        await streamFinish(runId);
      } catch {
        // best effort
      }
    }
    setBackendRunId(null);

    toast({
      title: "Streaming finished",
      description: runId ? `Run ${runId} is complete.` : "Simulation stream stopped.",
    });
  }, [clearTimer, streaming]);

  const startStream = useCallback(
    async (opts?: StartOptions) => {
      const nextSpeed = opts?.speed ?? speed;
      setSpeed(nextSpeed);

      setStreaming(true);
      setStreamEvents([]);
      setTotalServerEvents(0);
      setServerAlarms(0);
      setServerWarnings(0);
      batchLinesRef.current = [];

      let runId: string | null = null;
      if (modeRef.current === "backend") {
        try {
          const res = await streamStart("STREAM_TOOL");
          runId = res.run_id;
          setBackendRunId(runId);
        } catch {
          setMode("simulation");
        }
      }

      clearTimer();
      intervalRef.current = setInterval(async () => {
        const { event, raw } = generateLine();

        setStreamEvents((prev) => [...prev, event].slice(-200));

        if (runId) {
          batchLinesRef.current.push(raw);
          if (batchLinesRef.current.length >= 3) {
            const header = "timestamp,tool_id,chamber_id,event_type,parameter,value,unit,alarm_code,severity,message";
            const payload = [header, ...batchLinesRef.current.splice(0)].join("\n");
            try {
              const resp = await streamAppend(runId, payload);
              setTotalServerEvents(resp.total_events);
              if (resp.alarm_count !== undefined) setServerAlarms(resp.alarm_count);
              if (resp.warning_count !== undefined) setServerWarnings(resp.warning_count);
            } catch {
              // batch dropped, continue streaming
            }
          }
        }

        // Keep parity with old component's callback behavior by generating a parsed event
        // (Consumers can build dashboards off this if desired in future).
        generateStreamEvent(event.tool_id, event.chamber_id, "", "", runId || "SIM");
      }, nextSpeed);
    },
    [clearTimer, speed],
  );

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const localAlarms = useMemo(
    () => streamEvents.filter((e) => e.severity === "alarm" || e.severity === "critical").length,
    [streamEvents],
  );
  const localWarnings = useMemo(() => streamEvents.filter((e) => e.severity === "warning").length, [streamEvents]);
  const alarmCount = mode === "backend" && serverAlarms > 0 ? serverAlarms : localAlarms;
  const warningCount = mode === "backend" && serverWarnings > 0 ? serverWarnings : localWarnings;

  const value: StreamingContextValue = useMemo(
    () => ({
      streaming,
      streamEvents,
      speed,
      mode,
      backendRunId,
      totalServerEvents,
      serverAlarms,
      serverWarnings,
      localAlarms,
      localWarnings,
      alarmCount,
      warningCount,
      startStream,
      stopStream,
      setSpeed,
    }),
    [
      streaming,
      streamEvents,
      speed,
      mode,
      backendRunId,
      totalServerEvents,
      serverAlarms,
      serverWarnings,
      localAlarms,
      localWarnings,
      alarmCount,
      warningCount,
      startStream,
      stopStream,
    ],
  );

  return <StreamingContext.Provider value={value}>{children}</StreamingContext.Provider>;
}

export function useStreaming() {
  const ctx = useContext(StreamingContext);
  if (!ctx) throw new Error("useStreaming must be used within StreamingProvider");
  return ctx;
}

