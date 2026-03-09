import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Download, ArrowUpDown, AlertTriangle, AlertCircle } from 'lucide-react';
import type { ParsedEvent } from '@/lib/logParser';

interface LogTableProps {
  events: ParsedEvent[];
  fileName: string;
}

export default function LogTable({ events, fileName }: LogTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof ParsedEvent>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    let items = events;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(e =>
        Object.values(e).some(v => v && String(v).toLowerCase().includes(q))
      );
    }
    return [...items].sort((a, b) => {
      const va = String(a[sortKey] || '');
      const vb = String(b[sortKey] || '');
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [events, search, sortKey, sortDir]);

  const toggleSort = (key: keyof ParsedEvent) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const downloadCSV = () => {
    const headers = ['timestamp', 'equipment_id', 'step_id', 'parameter', 'value', 'unit', 'severity'];
    const rows = filtered.map(e => headers.map(h => e[h as keyof ParsedEvent] || '').join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parsed_${fileName.replace(/\.\w+$/, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parsed_${fileName.replace(/\.\w+$/, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: { key: keyof ParsedEvent; label: string }[] = [
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'equipment_id', label: 'Equipment' },
    { key: 'step_id', label: 'Step' },
    { key: 'parameter', label: 'Parameter' },
    { key: 'value', label: 'Value' },
    { key: 'unit', label: 'Unit' },
    { key: 'severity', label: 'Severity' },
  ];

  const severityIcon = (s?: string) => {
    if (s === 'alarm') return <AlertCircle className="w-3.5 h-3.5 text-destructive" />;
    if (s === 'warning') return <AlertTriangle className="w-3.5 h-3.5 text-warning" />;
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={downloadCSV} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm text-secondary-foreground transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={downloadJSON} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-sm text-primary-foreground transition-colors">
            <Download className="w-4 h-4" /> JSON
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((event, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{event.timestamp}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-primary">{event.equipment_id}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{event.step_id || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground">{event.parameter}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground font-medium">{event.value}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{event.unit || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs">
                      {severityIcon(event.severity)}
                      <span className={
                        event.severity === 'alarm' ? 'text-destructive' :
                        event.severity === 'warning' ? 'text-warning' : 'text-muted-foreground'
                      }>
                        {event.severity || 'info'}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
          Showing {filtered.length} of {events.length} events
        </div>
      </div>
    </motion.div>
  );
}
