import { motion } from 'framer-motion';
import {
  ArrowDown, Database, BarChart3, Cpu, FileText, Shield, Search, Radio,
  Route, Bot, Activity, AlertTriangle, Clock, Zap, FileWarning, Hash,
  TrendingUp, GitMerge, Server, Layers, CheckCircle, Box,
} from 'lucide-react';

const pipeline = [
  {
    icon: Cpu,
    title: 'Semiconductor Tool Sources',
    desc: 'JSON · XML · CSV · Syslog · Key-Value · Plain Text · Hex/Binary · Parquet',
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-l-primary',
  },
  {
    icon: Radio,
    title: 'Log Ingestion Layer',
    desc: 'File Upload · Streaming API · Drag & Drop · Elasticsearch Sync',
    color: 'text-info',
    bg: 'bg-info/10',
    border: 'border-l-info',
  },
  {
    icon: Search,
    title: 'Format Detection Engine',
    desc: 'Auto-detects log structure and vendor format — zero configuration',
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-l-warning',
  },
  {
    icon: Route,
    title: 'Parser Router',
    desc: 'Routes each file to the optimal parser path based on detected format',
    color: 'text-secondary-foreground',
    bg: 'bg-secondary/60',
    border: 'border-l-secondary-foreground',
  },
];

const parsers = [
  { name: 'JSON', color: 'bg-primary/10 text-primary border-primary/30', desc: 'Nested + flat' },
  { name: 'XML', color: 'bg-info/10 text-info border-info/30', desc: 'SAX + DOM' },
  { name: 'CSV', color: 'bg-success/10 text-success border-success/30', desc: 'Backend ★' },
  { name: 'Text', color: 'bg-warning/10 text-warning border-warning/30', desc: 'Backend ★' },
  { name: 'Key-Value', color: 'bg-primary/10 text-primary border-primary/30', desc: 'Syslog / KV' },
  { name: 'Hex / Binary', color: 'bg-destructive/10 text-destructive border-destructive/30', desc: 'Raw bytes' },
  { name: 'Parquet', color: 'bg-violet-500/10 text-violet-400 border-violet-400/30', desc: 'Backend ★' },
];

const anomalyTypes = [
  { icon: Activity, label: 'Z-Score', desc: '|z| > 2.5σ from mean', cls: 'text-primary', bg: 'bg-primary/10' },
  { icon: TrendingUp, label: 'Rolling Drift', desc: 'Window=10, |z| > 2.0', cls: 'text-secondary-foreground', bg: 'bg-secondary/50' },
  { icon: Zap, label: 'Alarm Cascade', desc: '3+ alarms within 30 s', cls: 'text-destructive', bg: 'bg-destructive/10' },
  { icon: Clock, label: 'Timestamp Gap', desc: 'Gap > 5 min', cls: 'text-warning', bg: 'bg-warning/10' },
  { icon: Clock, label: 'TS Reversal', desc: 'Out-of-order events', cls: 'text-warning', bg: 'bg-warning/10' },
  { icon: FileWarning, label: 'Corrupt Field', desc: 'ERR_ADC / 0xFFFF / #N/A', cls: 'text-destructive', bg: 'bg-destructive/10' },
  { icon: Hash, label: 'Missing Field', desc: 'Null tool_id / wafer placeholder', cls: 'text-warning', bg: 'bg-warning/10' },
];

const downstream = [
  {
    icon: Database,
    title: 'Structured Event Storage',
    desc: 'Validated schema · run_id keyed · SQLite + REST API · backend deduplication',
    color: 'text-info',
    bg: 'bg-info/10',
    border: 'border-l-info',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboards',
    desc: 'Parameter trends · recipe timelines · tool health · cross-vendor compare',
    color: 'text-success',
    bg: 'bg-success/10',
    border: 'border-l-success',
  },
  {
    icon: Shield,
    title: 'Insights & Reporting',
    desc: 'Alarm forensics · golden-run comparison · engineer export reports',
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    border: 'border-l-destructive',
  },
];

const features = [
  {
    icon: GitMerge,
    title: 'Hybrid Parsing Strategy',
    desc: 'Deterministic parsers first (CSV, Text, JSON, XML, KV). LLM Groq fallback only for partial or ambiguous lines — reducing cost and increasing reliability.',
    color: 'text-primary',
  },
  {
    icon: Layers,
    title: 'Fab-Ready Context Model',
    desc: 'Standardised Fab → Tool → Chamber → Recipe → Step hierarchy powers cross-run investigations and equipment traceability.',
    color: 'text-info',
  },
  {
    icon: Server,
    title: 'Backend + Client Modes',
    desc: 'Full-fidelity backend parsing with deduplication, anomaly service, and DB storage. Seamless client-side fallback when offline.',
    color: 'text-success',
  },
];

function Arrow() {
  return (
    <div className="flex justify-center py-1">
      <ArrowDown className="w-4 h-4 text-muted-foreground/40" />
    </div>
  );
}

export default function ArchitectureDiagram() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">System Architecture</h2>
        <p className="text-sm text-muted-foreground">
          Smart Semiconductor Tool Log Parser — Industrial Observability Pipeline
        </p>
      </div>

      <div className="max-w-xl mx-auto space-y-0">
        {/* Upper pipeline */}
        {pipeline.map((stage, i) => (
          <motion.div
            key={stage.title}
            initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div className={`glass rounded-xl p-4 flex items-center gap-4 border-l-2 ${stage.border}`}>
              <div className={`p-2.5 rounded-lg ${stage.bg} flex-shrink-0`}>
                <stage.icon className={`w-5 h-5 ${stage.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{stage.title}</h3>
                <p className="text-[11px] text-muted-foreground">{stage.desc}</p>
              </div>
            </div>
            <Arrow />
          </motion.div>
        ))}

        {/* Deterministic Parsers block */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <div className="glass rounded-xl p-4 border-l-2 border-l-success">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg bg-success/10 flex-shrink-0">
                <FileText className="w-5 h-5 text-success" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Deterministic Parsers</h3>
                <p className="text-[11px] text-muted-foreground">
                  Rule-based tokenisation and extraction for structured and semi-structured logs
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              {parsers.map(p => (
                <div key={p.name} className={`rounded-lg border p-2 text-center ${p.color}`}>
                  <p className="text-xs font-semibold">{p.name}</p>
                  <p className="text-[9px] opacity-70 mt-0.5">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <Arrow />
        </motion.div>

        {/* LLM Fallback */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.55 }}
        >
          <div className="glass rounded-xl p-4 flex items-center gap-4 border-l-2 border-l-warning">
            <div className="p-2.5 rounded-lg bg-warning/10 flex-shrink-0">
              <Bot className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">LLM Fallback Parser</h3>
              <p className="text-[11px] text-muted-foreground">
                Groq-powered extraction for messy or unknown vendor lines — used only when deterministic parsers fail
              </p>
            </div>
          </div>
          <Arrow />
        </motion.div>

        {/* Normalization */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.65 }}
        >
          <div className="glass rounded-xl p-4 flex items-center gap-4 border-l-2 border-l-primary">
            <div className="p-2.5 rounded-lg bg-primary/10 flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Normalization Engine</h3>
              <p className="text-[11px] text-muted-foreground">
                Canonical mapping: TEMP_C → temperature · PRESSURE_TORR → pressure · cross-vendor unit unification
              </p>
            </div>
          </div>
          <Arrow />
        </motion.div>

        {/* Anomaly Detection Service */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
        >
          <div className="glass rounded-xl p-4 border-l-2 border-l-destructive">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg bg-destructive/10 flex-shrink-0">
                <Activity className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Anomaly Detection Service</h3>
                  <span className="px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive text-[9px] font-bold">7 types</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Statistical + structural anomaly detection — server-side with client-side fallback
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {anomalyTypes.map(a => (
                <div key={a.label} className={`rounded-lg p-2 ${a.bg} border border-border/30`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <a.icon className={`w-3 h-3 ${a.cls}`} />
                    <span className={`text-[10px] font-semibold ${a.cls}`}>{a.label}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{a.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <Arrow />
        </motion.div>

        {/* Downstream */}
        {downstream.map((stage, i) => (
          <motion.div
            key={stage.title}
            initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.85 + i * 0.1 }}
          >
            <div className={`glass rounded-xl p-4 flex items-center gap-4 border-l-2 ${stage.border}`}>
              <div className={`p-2.5 rounded-lg ${stage.bg} flex-shrink-0`}>
                <stage.icon className={`w-5 h-5 ${stage.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{stage.title}</h3>
                <p className="text-[11px] text-muted-foreground">{stage.desc}</p>
              </div>
            </div>
            {i < downstream.length - 1 && <Arrow />}
          </motion.div>
        ))}
      </div>

      {/* Supported formats */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.15 }}
        className="glass rounded-xl p-6 mt-8"
      >
        <h3 className="text-sm font-medium text-foreground mb-4 text-center">Supported Log Formats</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { name: 'JSON', color: 'bg-primary/10 text-primary border-primary/30' },
            { name: 'XML', color: 'bg-info/10 text-info border-info/30' },
            { name: 'CSV', color: 'bg-success/10 text-success border-success/30' },
            { name: 'Syslog', color: 'bg-warning/10 text-warning border-warning/30' },
            { name: 'Key-Value', color: 'bg-primary/10 text-primary border-primary/30' },
            { name: 'Hex/Binary', color: 'bg-destructive/10 text-destructive border-destructive/30' },
          ].map(f => (
            <div key={f.name} className={`rounded-lg border p-3 text-center text-xs font-medium ${f.color}`}>
              {f.name}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Key features */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        {features.map((feat, i) => (
          <motion.div
            key={feat.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 + i * 0.1 }}
            className="glass rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <feat.icon className={`w-4 h-4 ${feat.color}`} />
              <h4 className="text-xs font-semibold text-foreground">{feat.title}</h4>
            </div>
            <p className="text-[11px] text-muted-foreground">{feat.desc}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Status indicators */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="glass rounded-xl p-4"
      >
        <h3 className="text-xs font-medium text-muted-foreground mb-3 text-center uppercase tracking-widest">Service Status</h3>
        <div className="flex flex-wrap justify-center gap-4">
          {[
            { label: 'CSV Parser', note: 'backend/client', ok: true },
            { label: 'Text Parser', note: 'backend/client', ok: true },
            { label: 'JSON Parser', note: 'backend/client', ok: true },
            { label: 'XML Parser', note: 'backend/client', ok: true },
            { label: 'LLM Fallback', note: 'Groq API', ok: true },
            { label: 'Anomaly Service', note: '7 detection types', ok: true },
            { label: 'Golden Run', note: 'DB required', ok: true },
            { label: 'Streaming', note: 'Elasticsearch', ok: true },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 text-[10px]">
              <CheckCircle className="w-3 h-3 text-success" />
              <span className="text-foreground font-medium">{s.label}</span>
              <span className="text-muted-foreground">({s.note})</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Data flow badges */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="flex flex-wrap justify-center gap-2"
      >
        {[
          { label: 'Hybrid Parsing', color: 'bg-primary/10 text-primary border-primary/30' },
          { label: 'Fab Context Model', color: 'bg-info/10 text-info border-info/30' },
          { label: 'Backend + Client Modes', color: 'bg-success/10 text-success border-success/30' },
          { label: 'Statistical Anomaly Detection', color: 'bg-destructive/10 text-destructive border-destructive/30' },
          { label: 'Structural Anomaly Detection', color: 'bg-warning/10 text-warning border-warning/30' },
          { label: 'LLM-Augmented Parsing', color: 'bg-warning/10 text-warning border-warning/30' },
        ].map(b => (
          <span key={b.label} className={`px-3 py-1 rounded-full border text-[10px] font-medium ${b.color}`}>
            {b.label}
          </span>
        ))}
      </motion.div>
    </motion.div>
  );
}
