import { motion } from 'framer-motion';
import { FileText, Clock, Cpu, AlertCircle, AlertTriangle, Hash, Server, MonitorSmartphone, Copy, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import type { ParseResult, LogFormat } from '@/lib/logParser';

interface LogSummaryProps {
  result: ParseResult;
  fileName: string;
}

const FORMAT_BADGES: Record<string, { label: string; className: string }> = {
  json:     { label: 'JSON',      className: 'bg-primary/20 text-primary' },
  xml:      { label: 'XML',       className: 'bg-info/20 text-info' },
  csv:      { label: 'CSV',       className: 'bg-success/20 text-success' },
  syslog:   { label: 'SYSLOG',    className: 'bg-warning/20 text-warning' },
  text:     { label: 'TEXT',      className: 'bg-secondary text-secondary-foreground' },
  hex:      { label: 'HEX',       className: 'bg-destructive/20 text-destructive' },
  keyvalue: { label: 'KEY-VALUE', className: 'bg-primary/20 text-primary' },
  kv:       { label: 'KEY-VALUE', className: 'bg-primary/20 text-primary' },
  parquet:  { label: 'PARQUET',   className: 'bg-violet-500/20 text-violet-400' },
  binary:   { label: 'BINARY',    className: 'bg-destructive/20 text-destructive' },
};

export default function LogSummary({ result, fileName }: LogSummaryProps) {
  const [copied, setCopied] = useState(false);

  const badge = FORMAT_BADGES[result.format] ?? {
    label: String(result.format).toUpperCase(),
    className: 'bg-secondary text-secondary-foreground',
  };

  const isBackend = !!(result.run_id && result.run_id !== 'local');
  const totalEvents = result.total_events ?? result.summary.totalEvents;
  const alarmCount  = result.alarm_count  ?? result.summary.alarms;
  const warnCount   = result.warning_count ?? result.summary.warnings;

  const copyRunId = () => {
    if (result.run_id) {
      navigator.clipboard.writeText(result.run_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-6 space-y-4"
    >
      {/* File header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-lg bg-primary/10 flex-shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{fileName}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-success flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Parsed successfully
              </p>
              {isBackend ? (
                <span className="flex items-center gap-1 text-[10px] text-green-400">
                  <Server className="w-3 h-3" /> Backend
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-yellow-400">
                  <MonitorSmartphone className="w-3 h-3" /> Client-side
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-xs font-mono font-medium ${badge.className}`}>
            {badge.label}
          </span>
          {result.run_id && (
            <button
              onClick={copyRunId}
              title="Copy run_id"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-[10px] font-mono text-muted-foreground"
            >
              {copied ? <CheckCircle className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
              {result.run_id.slice(0, 16)}…
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-background/50 rounded-lg p-3 flex items-center gap-2">
          <Hash className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-lg font-bold text-foreground">{totalEvents.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Events</p>
          </div>
        </div>
        <div className="bg-background/50 rounded-lg p-3 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-lg font-bold text-foreground">{result.summary.equipmentIds.length}</p>
            <p className="text-xs text-muted-foreground">Equipment</p>
          </div>
        </div>
        <div className={`bg-background/50 rounded-lg p-3 flex items-center gap-2 ${alarmCount > 0 ? 'ring-1 ring-destructive/30' : ''}`}>
          <AlertCircle className={`w-4 h-4 ${alarmCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
          <div>
            <p className={`text-lg font-bold ${alarmCount > 0 ? 'text-destructive' : 'text-foreground'}`}>{alarmCount}</p>
            <p className="text-xs text-muted-foreground">Alarms</p>
          </div>
        </div>
        <div className={`bg-background/50 rounded-lg p-3 flex items-center gap-2 ${warnCount > 0 ? 'ring-1 ring-warning/30' : ''}`}>
          <AlertTriangle className={`w-4 h-4 ${warnCount > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          <div>
            <p className={`text-lg font-bold ${warnCount > 0 ? 'text-warning' : 'text-foreground'}`}>{warnCount}</p>
            <p className="text-xs text-muted-foreground">Warnings</p>
          </div>
        </div>
      </div>

      {/* Backend extra stats */}
      {isBackend && (result.duplicates_dropped !== undefined || result.failed_event_count !== undefined) && (
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {result.duplicates_dropped !== undefined && result.duplicates_dropped > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-warning/10 text-warning">
              <Hash className="w-3 h-3" /> {result.duplicates_dropped} duplicate{result.duplicates_dropped !== 1 ? 's' : ''} dropped
            </span>
          )}
          {result.failed_event_count !== undefined && result.failed_event_count > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="w-3 h-3" /> {result.failed_event_count} event{result.failed_event_count !== 1 ? 's' : ''} failed to parse
            </span>
          )}
          {result.summary.runIds?.length > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary">
              <Hash className="w-3 h-3" /> {result.summary.runIds.length} run{result.summary.runIds.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Time range */}
      {result.summary.timeRange.start && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background/30 rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-mono truncate">{result.summary.timeRange.start}</span>
          <span className="flex-shrink-0">→</span>
          <span className="font-mono truncate">{result.summary.timeRange.end}</span>
        </div>
      )}

      {/* Raw preview */}
      <details className="group">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
          View raw log preview
        </summary>
        <pre className="mt-2 p-3 rounded-lg bg-background/50 text-xs font-mono text-muted-foreground overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
          {result.rawPreview}
        </pre>
      </details>
    </motion.div>
  );
}
