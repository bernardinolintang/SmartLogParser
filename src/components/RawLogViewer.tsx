import { motion } from 'framer-motion';
import { FileCode, Eye } from 'lucide-react';

interface RawLogViewerProps {
  rawContent: string;
  events: { timestamp: string; parameter: string; value: string; unit?: string; severity?: string }[];
}

export default function RawLogViewer({ rawContent, events }: RawLogViewerProps) {
  const rawLines = rawContent.split('\n');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <FileCode className="w-4 h-4 text-primary" />
        Raw Log Viewer
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raw log */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Raw Log</span>
          </div>
          <pre className="p-4 text-xs font-mono text-muted-foreground leading-relaxed overflow-auto max-h-[500px] whitespace-pre-wrap">
            {rawLines.map((line, i) => (
              <div key={i} className="flex hover:bg-secondary/30 transition-colors">
                <span className="text-muted-foreground/40 w-8 text-right mr-3 select-none flex-shrink-0">{i + 1}</span>
                <span className={
                  line.includes('ALARM') ? 'text-destructive' :
                  line.includes('WARNING') ? 'text-warning' :
                  'text-foreground/80'
                }>{line || ' '}</span>
              </div>
            ))}
          </pre>
        </div>

        {/* Parsed events */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Parsed Events ({events.length})</span>
          </div>
          <div className="overflow-auto max-h-[500px] divide-y divide-border/30">
            {events.slice(0, 100).map((e, i) => (
              <div key={i} className={`px-4 py-2 text-xs font-mono flex items-center gap-3 ${
                e.severity === 'alarm' ? 'bg-destructive/5' :
                e.severity === 'warning' ? 'bg-warning/5' : ''
              }`}>
                <span className="text-muted-foreground w-20 whitespace-nowrap">
                  {e.timestamp.split('T')[1]?.slice(0, 8) || e.timestamp.slice(-8)}
                </span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  e.severity === 'alarm' ? 'bg-destructive' :
                  e.severity === 'warning' ? 'bg-warning' : 'bg-primary/40'
                }`} />
                <span className="text-foreground flex-1">
                  {e.parameter} = {e.value}{e.unit ? ` ${e.unit}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
