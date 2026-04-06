import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu, Upload, Table, BarChart3, FileText, GitCompare, ShieldAlert,
  AlertCircle, TrendingUp, Layers, Star, Heart, Radio, FileCode, Map,
  ChevronLeft, ChevronRight, Menu
} from 'lucide-react';
import LogUpload from '@/components/LogUpload';
import LogSummary from '@/components/LogSummary';
import LogTable from '@/components/LogTable';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import EngineerReport from '@/components/EngineerReport';
import CrossVendorCompare from '@/components/CrossVendorCompare';
import AnomalyDetection from '@/components/AnomalyDetection';
import EquipmentHierarchy from '@/components/EquipmentHierarchy';
import type { HierarchyFilter } from '@/components/EquipmentHierarchy';
import ToolOverview from '@/components/ToolOverview';
import AlarmInvestigation from '@/components/AlarmInvestigation';
import ParameterTrends from '@/components/ParameterTrends';
import RecipeTimeline from '@/components/RecipeTimeline';
import GoldenRunCompare from '@/components/GoldenRunCompare';
import ToolHealthDashboard from '@/components/ToolHealthDashboard';
import StreamingMonitor from '@/components/StreamingMonitor';
import RawLogViewer from '@/components/RawLogViewer';
import ArchitectureDiagram from '@/components/ArchitectureDiagram';
import type { ParseResult } from '@/lib/logParser';

type Tab = 'upload' | 'overview' | 'table' | 'analytics' | 'trends' | 'timeline' | 'alarms' | 'anomaly' | 'golden' | 'health' | 'streaming' | 'raw' | 'report' | 'compare' | 'architecture';

const Index = () => {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [filter, setFilter] = useState<HierarchyFilter>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleParsed = useCallback((r: ParseResult, name: string) => {
    setResult(r);
    setFileName(name);
    setActiveTab('overview');
  }, []);

  const filteredEvents = useMemo(() => {
    if (!result) return [];
    let e = result.events;
    if (filter.tool_id) e = e.filter(ev => ev.tool_id === filter.tool_id);
    if (filter.chamber_id) e = e.filter(ev => ev.chamber_id === filter.chamber_id);
    if (filter.recipe_name) e = e.filter(ev => ev.recipe_name === filter.recipe_name);
    if (filter.recipe_step) e = e.filter(ev => ev.recipe_step === filter.recipe_step);
    if (filter.run_id) e = e.filter(ev => ev.run_id === filter.run_id);
    return e;
  }, [result, filter]);

  const tabs: { id: Tab; label: string; icon: React.ElementType; requiresResult?: boolean; group: string }[] = [
    { id: 'upload', label: 'Upload', icon: Upload, group: 'Ingest' },
    { id: 'streaming', label: 'Streaming', icon: Radio, group: 'Ingest' },
    { id: 'overview', label: 'Overview', icon: Cpu, requiresResult: true, group: 'Monitor' },
    { id: 'health', label: 'Health', icon: Heart, requiresResult: true, group: 'Monitor' },
    { id: 'table', label: 'Data', icon: Table, requiresResult: true, group: 'Analyze' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, requiresResult: true, group: 'Analyze' },
    { id: 'trends', label: 'Trends', icon: TrendingUp, requiresResult: true, group: 'Analyze' },
    { id: 'timeline', label: 'Recipe', icon: Layers, requiresResult: true, group: 'Analyze' },
    { id: 'alarms', label: 'Alarms', icon: AlertCircle, requiresResult: true, group: 'Investigate' },
    { id: 'anomaly', label: 'Anomaly', icon: ShieldAlert, requiresResult: true, group: 'Investigate' },
    { id: 'golden', label: 'Golden Run', icon: Star, requiresResult: true, group: 'Investigate' },
    { id: 'raw', label: 'Raw Log', icon: FileCode, requiresResult: true, group: 'Tools' },
    { id: 'report', label: 'Report', icon: FileText, requiresResult: true, group: 'Tools' },
    { id: 'compare', label: 'Compare', icon: GitCompare, group: 'Tools' },
    { id: 'architecture', label: 'Architecture', icon: Map, group: 'Tools' },
  ];

  const groups = ['Ingest', 'Monitor', 'Analyze', 'Investigate', 'Tools'];

  return (
    <div className="min-h-screen bg-background grid-bg flex">
      <div className="scanline fixed inset-0 pointer-events-none z-50" />

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-0'} flex-shrink-0 border-r border-border bg-card/60 backdrop-blur-lg transition-all duration-300 overflow-hidden z-30 fixed lg:relative h-screen flex flex-col`}>
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-4 border-b border-border">
          <div className="p-1.5 rounded-lg bg-primary/10 glow-primary">
            <Cpu className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs font-bold text-foreground tracking-tight truncate">Smart Log Parser</h1>
            <p className="text-[9px] text-muted-foreground">Semiconductor Observability</p>
          </div>
        </div>

        {/* Nav tabs */}
        <nav className="py-2 overflow-y-auto flex-1 min-h-0">
          {groups.map(group => {
            const groupTabs = tabs.filter(t => t.group === group);
            return (
              <div key={group} className="mb-1">
                <p className="px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">{group}</p>
                {groupTabs.map(tab => {
                  const disabled = tab.requiresResult && !result;
                  const active = activeTab === tab.id;
                  const hasAlarms = tab.id === 'alarms' && result && result.summary.alarms > 0;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => !disabled && setActiveTab(tab.id)}
                      disabled={disabled}
                      className={`
                        flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-medium transition-all
                        ${active
                          ? 'bg-primary/15 text-primary border-r-2 border-primary'
                          : disabled
                            ? 'text-muted-foreground/30 cursor-not-allowed'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                        }
                      `}
                    >
                      <tab.icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{tab.label}</span>
                      {hasAlarms && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive text-[9px] font-bold">
                          {result!.summary.alarms}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Equipment tree */}
          {result && (
            <div className="mt-2 border-t border-border pt-2">
              <EquipmentHierarchy events={result.events} filter={filter} onFilterChange={setFilter} />
            </div>
          )}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b border-border bg-card/60 backdrop-blur-lg sticky top-0 z-40">
          <div className="px-4 py-3 flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              {sidebarOpen ? <ChevronLeft className="w-4 h-4 text-muted-foreground" /> : <Menu className="w-4 h-4 text-muted-foreground" />}
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground capitalize">{tabs.find(t => t.id === activeTab)?.label}</span>
              {filter.tool_id && (
                <>
                  <span>·</span>
                  <span className="font-mono text-primary">{filter.tool_id}</span>
                </>
              )}
              {filter.chamber_id && (
                <>
                  <span>›</span>
                  <span className="font-mono">{filter.chamber_id}</span>
                </>
              )}
              {filter.recipe_name && (
                <>
                  <span>›</span>
                  <span className="font-mono text-success truncate max-w-32">{filter.recipe_name}</span>
                </>
              )}
            </div>
            {result && (
              <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>{filteredEvents.length} events</span>
                {result.summary.alarms > 0 && (
                  <span className="text-destructive font-semibold">{result.summary.alarms} alarms</span>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 relative z-10">
          <div className="max-w-6xl mx-auto">
            {activeTab === 'upload' && (
              <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="text-center max-w-2xl mx-auto mb-8">
                  <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
                    Parse Any <span className="text-primary">Tool Log</span>
                  </motion.h2>
                  <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-muted-foreground">
                    Upload logs from any semiconductor equipment vendor. Auto-detect format, normalize parameters, and generate structured analytics.
                  </motion.p>
                </div>
                <LogUpload onParsed={handleParsed} />
              </motion.div>
            )}

            {activeTab === 'overview' && result && (
              <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <LogSummary result={result} fileName={fileName} />
                <ToolOverview events={filteredEvents} filter={filter} />
              </motion.div>
            )}

            {activeTab === 'table' && result && (
              <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <LogTable events={filteredEvents} fileName={fileName} />
              </motion.div>
            )}

            {activeTab === 'analytics' && result && (
              <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <AnalyticsDashboard events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'trends' && result && (
              <motion.div key="trends" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ParameterTrends events={filteredEvents} filter={filter} />
              </motion.div>
            )}

            {activeTab === 'timeline' && result && (
              <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <RecipeTimeline events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'alarms' && result && (
              <motion.div key="alarms" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <AlarmInvestigation events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'anomaly' && result && (
              <motion.div key="anomaly" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <AnomalyDetection events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'golden' && result && (
              <motion.div key="golden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <GoldenRunCompare events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'health' && result && (
              <motion.div key="health" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ToolHealthDashboard events={filteredEvents} />
              </motion.div>
            )}
            {activeTab === 'streaming' && (
              <motion.div key="streaming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                {/* Industrial Sync Component */}
                <div className="p-6 border border-primary/20 rounded-xl bg-card/40 backdrop-blur-md shadow-glow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Radio className="w-5 h-5 text-primary animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Industrial Fab Ingestion</h3>
                      <p className="text-xs text-muted-foreground">Pull raw telemetry from Elasticsearch (Simulated Fab Storage)</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      id="sync-tool-id"
                      type="text"
                      defaultValue="ETCH_01"
                      placeholder="Tool ID (e.g. ETCH_01)"
                      className="px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono text-foreground focus:ring-1 focus:ring-primary outline-none w-40"
                    />
                    <button 
                      onClick={async () => {
                        const btn = document.getElementById('sync-btn');
                        const input = document.getElementById('sync-tool-id') as HTMLInputElement;
                        const toolId = input?.value?.trim() || 'ETCH_01';
                        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8001';
                        if (btn) btn.innerText = 'Syncing...';
                        try {
                          const res = await fetch(`${apiBase}/api/ingest/sync/${encodeURIComponent(toolId)}`, { method: 'POST' });
                          const data = await res.json();
                          alert(data.status);
                        } catch {
                          alert('Sync Failed. Check if Backend & Elastic are running.');
                        } finally {
                          if (btn) btn.innerText = 'Sync from Fab Storage';
                        }
                      }}
                      id="sync-btn"
                      className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-bold text-sm hover:opacity-90 transition-all shadow-glow-primary"
                    >
                      Sync from Fab Storage
                    </button>
                  </div>
                </div>

                {/* Original Streaming Monitor */}
                <StreamingMonitor />
              </motion.div>
            )}

            {activeTab === 'raw' && result && (
              <motion.div key="raw" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <RawLogViewer rawContent={result.rawContent} events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'report' && result && (
              <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <EngineerReport result={result} fileName={fileName} />
              </motion.div>
            )}

            {activeTab === 'compare' && (
              <motion.div key="compare" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <CrossVendorCompare />
              </motion.div>
            )}

            {activeTab === 'architecture' && (
              <motion.div key="architecture" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ArchitectureDiagram />
              </motion.div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
