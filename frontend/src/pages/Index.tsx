import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu, Upload, Table, BarChart3, FileText, GitCompare, ShieldAlert,
  AlertCircle, TrendingUp, Layers, Star, Heart, Radio, FileCode, Map,
  ChevronLeft, Menu, History, User
} from 'lucide-react';
import LogUpload from '@/components/LogUpload';
import LogSummary from '@/components/LogSummary';
import LogTable from '@/components/LogTable';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import EngineerReport from '@/components/EngineerReport';
import CrossVendorCompare from '@/components/CrossVendorCompare';
import AnomalyDetection, { computeLocalAnomalies } from '@/components/AnomalyDetection';
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
import UploadHistory, { saveToHistory, loadHistory } from '@/components/UploadHistory';
import ProfilePage from '@/components/ProfilePage';
import type { ParseResult } from '@/lib/logParser';

type Tab = 'upload' | 'overview' | 'table' | 'analytics' | 'trends' | 'timeline' | 'alarms' | 'anomaly' | 'golden' | 'health' | 'streaming' | 'raw' | 'report' | 'compare' | 'architecture' | 'history' | 'profile';

function getProfileData() {
  try {
    const p = JSON.parse(localStorage.getItem('slp_profile') || 'null');
    if (!p) return { initials: null, color: 'from-primary to-primary/60', image: '' };
    const parts = (p.name ?? '').trim().split(/\s+/);
    const initials = parts[0]
      ? parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : null;
    return { initials, color: p.avatarColor ?? 'from-primary to-primary/60', image: p.avatarImage ?? '' };
  } catch { return { initials: null, color: 'from-primary to-primary/60', image: '' }; }
}

const Index = () => {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [filter, setFilter] = useState<HierarchyFilter>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyCount, setHistoryCount] = useState(() => loadHistory().length);

  const handleParsed = useCallback((r: ParseResult, name: string) => {
    setResult(r);
    setFileName(name);
    setActiveTab('overview');
    saveToHistory({
      fileName: name,
      format: r.format,
      totalEvents: r.summary.totalEvents,
      alarms: r.summary.alarms,
      warnings: r.summary.warnings,
      toolIds: r.summary.toolIds,
      recipeNames: r.summary.recipeNames,
      timeRange: r.summary.timeRange,
      source: r.total_events !== undefined ? 'backend' : 'client',
    });
    setHistoryCount(loadHistory().length);
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

  const anomalyCount = useMemo(() => {
    if (!result || result.events.length === 0) return 0;
    return computeLocalAnomalies(result.events).anomaly_count;
  }, [result]);

  const tabs: { id: Tab; label: string; icon: React.ElementType; requiresResult?: boolean; group: string }[] = [
    { id: 'upload', label: 'Upload', icon: Upload, group: 'Ingest' },
    { id: 'history', label: 'History', icon: History, group: 'Ingest' },
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
                  const hasAnomalies = tab.id === 'anomaly' && anomalyCount > 0;
                  const hasBadge = hasAlarms || hasAnomalies;
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
                      {hasAnomalies && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-warning/20 text-warning text-[9px] font-bold">
                          {anomalyCount}
                        </span>
                      )}
                      {tab.id === 'history' && historyCount > 0 && !hasBadge && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground text-[9px] font-bold">
                          {historyCount}
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

        {/* Profile footer */}
        <div className="flex-shrink-0 border-t border-border p-2">
          {(() => {
            const pd = getProfileData();
            return (
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex items-center gap-2 w-full px-2 py-2 rounded-lg transition-all ${activeTab === 'profile' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}
              >
                <div className="w-6 h-6 rounded-md overflow-hidden flex-shrink-0">
                  {pd.image ? (
                    <img src={pd.image} alt="Profile" className="w-full h-full object-cover" />
                  ) : pd.initials ? (
                    <div className={`w-full h-full bg-gradient-to-br ${pd.color} flex items-center justify-center`}>
                      <span className="text-[10px] font-bold text-white">{pd.initials}</span>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-secondary flex items-center justify-center">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-medium truncate">Profile</span>
              </button>
            );
          })()}
        </div>
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
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-wrap justify-center gap-2 mt-4"
                  >
                    {[
                      { label: 'JSON', cls: 'bg-primary/10 text-primary border-primary/20' },
                      { label: 'XML', cls: 'bg-info/10 text-info border-info/20' },
                      { label: 'CSV', cls: 'bg-success/10 text-success border-success/20' },
                      { label: 'Syslog', cls: 'bg-warning/10 text-warning border-warning/20' },
                      { label: 'Key-Value', cls: 'bg-primary/10 text-primary border-primary/20' },
                      { label: 'Plain Text', cls: 'bg-secondary/50 text-secondary-foreground border-border' },
                      { label: 'Hex/Binary', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
                      { label: 'Parquet', cls: 'bg-violet-500/10 text-violet-400 border-violet-400/20' },
                    ].map(f => (
                      <span key={f.label} className={`px-2.5 py-0.5 rounded-full border text-[10px] font-medium ${f.cls}`}>{f.label}</span>
                    ))}
                  </motion.div>
                </div>
                <LogUpload onParsed={handleParsed} />
              </motion.div>
            )}

            {activeTab === 'overview' && result && (
              <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <LogSummary result={result} fileName={fileName} />
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                    <Cpu className="w-5 h-5 text-primary" />
                    Equipment Overview
                  </h2>
                  <ToolOverview events={filteredEvents} filter={filter} />
                </div>
              </motion.div>
            )}

            {activeTab === 'table' && result && (
              <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Table className="w-5 h-5 text-primary" />
                    Event Data
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    All parsed events with parameters, values, and context. Filter via the equipment tree.
                  </p>
                </div>
                <LogTable events={filteredEvents} fileName={fileName} />
              </motion.div>
            )}

            {activeTab === 'analytics' && result && (
              <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Analytics Dashboard
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Event distributions, severity breakdown, and parameter statistics.
                  </p>
                </div>
                <AnalyticsDashboard events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'trends' && result && (
              <motion.div key="trends" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Parameter Trends
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Time-series view of sensor readings across tools and chambers.
                  </p>
                </div>
                <ParameterTrends events={filteredEvents} filter={filter} />
              </motion.div>
            )}

            {activeTab === 'timeline' && result && (
              <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Layers className="w-5 h-5 text-primary" />
                    Recipe Timeline
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Step-by-step recipe execution timeline with event markers.
                  </p>
                </div>
                <RecipeTimeline events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'alarms' && result && (
              <motion.div key="alarms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    Alarm Investigation
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click an alarm to inspect event context, parameters before trigger, and timeline.
                  </p>
                </div>
                <AlarmInvestigation events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'anomaly' && result && (
              <motion.div key="anomaly" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-destructive" />
                    Anomaly Detection
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    7-type detection: Z-score · Rolling drift · Alarm cascade · Timestamp gap · TS reversal · Corrupt field · Missing field
                  </p>
                </div>
                <AnomalyDetection runId={result?.run_id ?? null} events={result.events} />
              </motion.div>
            )}

            {activeTab === 'golden' && result && (
              <motion.div key="golden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Star className="w-5 h-5 text-warning" />
                    Golden Run Comparison
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Save a known-good run as the golden baseline, then compare any other run against it to detect parameter drift.
                  </p>
                </div>
                <GoldenRunCompare events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'health' && result && (
              <motion.div key="health" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Heart className="w-5 h-5 text-success" />
                    Tool Health Dashboard
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Equipment health scores, alarm rates, and maintenance indicators.
                  </p>
                </div>
                <ToolHealthDashboard events={filteredEvents} />
              </motion.div>
            )}
            {activeTab === 'streaming' && (
              <motion.div key="streaming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Radio className="w-5 h-5 text-primary animate-pulse" />
                    Streaming Monitor
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Real-time log ingestion from fab storage (Elasticsearch) or simulated tool telemetry.
                  </p>
                </div>
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
              <motion.div key="raw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <FileCode className="w-5 h-5 text-primary" />
                    Raw Log Viewer
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Original log content with event alignment markers.
                  </p>
                </div>
                <RawLogViewer rawContent={result.rawContent} events={filteredEvents} />
              </motion.div>
            )}

            {activeTab === 'report' && result && (
              <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Engineer Report
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Exportable narrative report summarising run events, alarms, and parameters.
                  </p>
                </div>
                <EngineerReport result={result} fileName={fileName} />
              </motion.div>
            )}

            {activeTab === 'compare' && (
              <motion.div key="compare" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <GitCompare className="w-5 h-5 text-primary" />
                    Cross-Vendor Compare
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Side-by-side comparison of logs from different equipment vendors.
                  </p>
                </div>
                <CrossVendorCompare />
              </motion.div>
            )}

            {activeTab === 'architecture' && (
              <motion.div key="architecture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <ArchitectureDiagram />
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <UploadHistory />
              </motion.div>
            )}

            {activeTab === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <ProfilePage />
              </motion.div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
