import { motion } from 'framer-motion';
import { FileText, Clock, Cpu, AlertCircle, AlertTriangle, Hash } from 'lucide-react';
import type { ParseResult, LogFormat } from '@/lib/logParser';

interface LogSummaryProps {
  result: ParseResult;
  fileName: string;
}

const FORMAT_BADGES: Record<LogFormat, { label: string; className: string }> = {
  json: { label: 'JSON', className: 'bg-primary/20 text-primary' },
  xml: { label: 'XML', className: 'bg-info/20 text-info' },
  csv: { label: 'CSV', className: 'bg-success/20 text-success' },
  syslog: { label: 'SYSLOG', className: 'bg-warning/20 text-warning' },
  text: { label: 'TEXT', className: 'bg-secondary text-secondary-foreground' },
  hex: { label: 'HEX', className: 'bg-destructive/20 text-destructive' },
  keyvalue: { label: 'KEY-VALUE', className: 'bg-primary/20 text-primary' },
  kv: { label: 'KEY-VALUE', className: 'bg-primary/20 text-primary' },
};

export default function LogSummary({ result, fileName }: LogSummaryProps) {
  const badge = FORMAT_BADGES[result.format] ?? { label: String(result.format).toUpperCase(), className: 'bg-secondary text-secondary-foreground' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-6 space-y-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{fileName}</h2>
            <p className="text-sm text-muted-foreground">Parsed successfully</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-mono font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-lg font-bold text-foreground">{result.summary.totalEvents}</p>
            <p className="text-xs text-muted-foreground">Events</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-lg font-bold text-foreground">{result.summary.equipmentIds.length}</p>
            <p className="text-xs text-muted-foreground">Equipment</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <div>
            <p className="text-lg font-bold text-foreground">{result.summary.alarms}</p>
            <p className="text-xs text-muted-foreground">Alarms</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <div>
            <p className="text-lg font-bold text-foreground">{result.summary.warnings}</p>
            <p className="text-xs text-muted-foreground">Warnings</p>
          </div>
        </div>
      </div>

      {result.summary.timeRange.start && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-mono">{result.summary.timeRange.start}</span>
          <span>→</span>
          <span className="font-mono">{result.summary.timeRange.end}</span>
        </div>
      )}

      {/* Raw preview */}
      <details className="group">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
          View raw log preview
        </summary>
        <pre className="mt-2 p-3 rounded-lg bg-background/50 text-xs font-mono text-muted-foreground overflow-x-auto max-h-40">
          {result.rawPreview}
        </pre>
      </details>
    </motion.div>
  );
}
