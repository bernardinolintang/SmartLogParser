import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, FileText, Trash2, Clock, Cpu, AlertCircle, TriangleAlert, ChevronRight, ChevronDown, Search, X, FlaskConical, Layers, Calendar, Tag } from 'lucide-react';

export interface HistoryEntry {
  id: string;
  fileName: string;
  uploadedAt: string; // ISO string
  format: string;
  totalEvents: number;
  alarms: number;
  warnings: number;
  toolIds: string[];
  recipeNames: string[];
  timeRange: { start: string; end: string };
  source: 'backend' | 'client';
}

const STORAGE_KEY = 'slp_upload_history';
const MAX_ENTRIES = 50;

export function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveToHistory(entry: Omit<HistoryEntry, 'id' | 'uploadedAt'>) {
  const history = loadHistory();
  const newEntry: HistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    uploadedAt: new Date().toISOString(),
  };
  const updated = [newEntry, ...history].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newEntry;
}

function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

function deleteEntry(id: string) {
  const history = loadHistory();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.filter(e => e.id !== id)));
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatTime(iso: string) {
  if (!iso || iso === 'N/A') return 'N/A';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const FORMAT_COLORS: Record<string, string> = {
  json: 'text-primary bg-primary/10 border-primary/20',
  xml: 'text-info bg-info/10 border-info/20',
  csv: 'text-success bg-success/10 border-success/20',
  syslog: 'text-warning bg-warning/10 border-warning/20',
  text: 'text-secondary-foreground bg-secondary/20 border-border',
  hex: 'text-destructive bg-destructive/10 border-destructive/20',
  keyvalue: 'text-primary bg-primary/10 border-primary/20',
  kv: 'text-primary bg-primary/10 border-primary/20',
  parquet: 'text-violet-400 bg-violet-500/10 border-violet-400/20',
  binary: 'text-destructive bg-destructive/10 border-destructive/20',
};

export default function UploadHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory());
  const [search, setSearch] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = entries.filter(e =>
    e.fileName.toLowerCase().includes(search.toLowerCase()) ||
    e.format.toLowerCase().includes(search.toLowerCase()) ||
    e.toolIds.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handleDelete = (id: string) => {
    deleteEntry(id);
    setEntries(loadHistory());
  };

  const handleClear = () => {
    clearHistory();
    setEntries([]);
    setConfirmClear(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Upload History
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {entries.length} file{entries.length !== 1 ? 's' : ''} parsed — stored locally in your browser
          </p>
        </div>
        {entries.length > 0 && (
          <div className="flex-shrink-0">
            {confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Clear all?</span>
                <button onClick={handleClear} className="px-2 py-1 text-[10px] rounded bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors">Yes</button>
                <button onClick={() => setConfirmClear(false)} className="px-2 py-1 text-[10px] rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">No</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="p-5 rounded-full bg-secondary/30">
            <History className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div>
            <p className="text-muted-foreground font-medium">No files uploaded yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Upload a log file to see it appear here
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by filename, format, or tool ID..."
              className="w-full pl-9 pr-9 py-2 bg-secondary/30 border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Files', value: entries.length },
              { label: 'Total Events', value: entries.reduce((s, e) => s + e.totalEvents, 0).toLocaleString() },
              { label: 'Total Alarms', value: entries.reduce((s, e) => s + e.alarms, 0) },
            ].map(stat => (
              <div key={stat.label} className="glass rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* List */}
          <AnimatePresence initial={false}>
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">No results for "{search}"</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((entry, i) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: i * 0.03 }}
                      className={`group glass rounded-xl border transition-all ${
                        isExpanded
                          ? 'border-primary/40 shadow-glow-sm'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      {/* Clickable header row */}
                      <button
                        className="w-full text-left p-4 flex items-start gap-3"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        <div className={`flex-shrink-0 p-2 rounded-lg mt-0.5 transition-colors ${isExpanded ? 'bg-primary/15' : 'bg-secondary/40 group-hover:bg-primary/10'}`}>
                          <FileText className={`w-4 h-4 transition-colors ${isExpanded ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-foreground truncate max-w-xs">{entry.fileName}</span>
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase ${FORMAT_COLORS[entry.format] ?? 'text-muted-foreground bg-secondary/20 border-border'}`}>
                              {entry.format}
                            </span>
                            {entry.source === 'backend' && (
                              <span className="px-1.5 py-0.5 rounded border text-[10px] text-success bg-success/10 border-success/20">backend</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {formatRelative(entry.uploadedAt)}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Cpu className="w-3 h-3" />
                              {entry.totalEvents.toLocaleString()} events
                            </span>
                            {entry.alarms > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
                                <AlertCircle className="w-3 h-3" />
                                {entry.alarms} alarm{entry.alarms !== 1 ? 's' : ''}
                              </span>
                            )}
                            {entry.warnings > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-warning">
                                <TriangleAlert className="w-3 h-3" />
                                {entry.warnings} warning{entry.warnings !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          {!isExpanded && entry.toolIds.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              {entry.toolIds.slice(0, 4).map(t => (
                                <span key={t} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono">{t}</span>
                              ))}
                              {entry.toolIds.length > 4 && (
                                <span className="text-[10px] text-muted-foreground">+{entry.toolIds.length - 4} more</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(entry.id); }}
                            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                            title="Remove from history"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-primary" />
                            : <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                          }
                        </div>
                      </button>

                      {/* Expanded details panel */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-0 border-t border-border/60 space-y-4">

                              {/* Stats row */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                                {[
                                  { label: 'Total Events', value: entry.totalEvents.toLocaleString(), cls: 'text-foreground' },
                                  { label: 'Alarms', value: entry.alarms, cls: entry.alarms > 0 ? 'text-destructive' : 'text-muted-foreground' },
                                  { label: 'Warnings', value: entry.warnings, cls: entry.warnings > 0 ? 'text-warning' : 'text-muted-foreground' },
                                  { label: 'Format', value: entry.format.toUpperCase(), cls: 'text-primary' },
                                ].map(s => (
                                  <div key={s.label} className="bg-secondary/30 rounded-lg px-3 py-2 text-center">
                                    <p className={`text-base font-bold font-mono ${s.cls}`}>{s.value}</p>
                                    <p className="text-[9px] text-muted-foreground mt-0.5">{s.label}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Time range */}
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                  <Calendar className="w-3 h-3" /> Time Range
                                </p>
                                <div className="flex items-center gap-2 text-xs font-mono text-foreground bg-secondary/20 rounded-lg px-3 py-2">
                                  <span>{formatTime(entry.timeRange.start)}</span>
                                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                  <span>{formatTime(entry.timeRange.end)}</span>
                                </div>
                              </div>

                              {/* Uploaded at */}
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                  <Clock className="w-3 h-3" /> Parsed At
                                </p>
                                <p className="text-xs text-foreground font-mono bg-secondary/20 rounded-lg px-3 py-2">
                                  {new Date(entry.uploadedAt).toLocaleString()}
                                </p>
                              </div>

                              {/* Tool IDs */}
                              {entry.toolIds.length > 0 && (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <Cpu className="w-3 h-3" /> Equipment IDs ({entry.toolIds.length})
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {entry.toolIds.map(t => (
                                      <span key={t} className="px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-primary text-[11px] font-mono">{t}</span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Recipe names */}
                              {entry.recipeNames && entry.recipeNames.length > 0 && (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <Layers className="w-3 h-3" /> Recipes ({entry.recipeNames.length})
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {entry.recipeNames.map(r => (
                                      <span key={r} className="px-2 py-1 rounded-md bg-success/10 border border-success/20 text-success text-[11px] font-mono truncate max-w-[200px]" title={r}>{r}</span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Source + format */}
                              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Tag className="w-3 h-3" /> Source:
                                  <span className={`font-medium ${entry.source === 'backend' ? 'text-success' : 'text-info'}`}>
                                    {entry.source === 'backend' ? 'Backend parser' : 'Client-side parser'}
                                  </span>
                                </span>
                                <span className="text-muted-foreground/40">·</span>
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <FlaskConical className="w-3 h-3" /> Format:
                                  <span className={`font-semibold uppercase ${FORMAT_COLORS[entry.format]?.split(' ')[0] ?? 'text-muted-foreground'}`}>
                                    {entry.format}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
