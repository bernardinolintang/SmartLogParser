import { motion } from 'framer-motion';
import { ArrowDown, Database, BarChart3, Cpu, FileText, Shield, Search, Radio, Route, Bot } from 'lucide-react';

const stages = [
  {
    icon: Cpu,
    title: 'Semiconductor Tools',
    desc: 'JSON / XML / CSV / Syslog / Key-Value / Hex',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    icon: Radio,
    title: 'Log Ingestion Layer',
    desc: 'File Upload / Streaming Logs / Drag & Drop',
    color: 'text-info',
    bg: 'bg-info/10',
  },
  {
    icon: Search,
    title: 'Format Detection',
    desc: 'Auto-detect log structure and vendor format',
    color: 'text-warning',
    bg: 'bg-warning/10',
  },
  {
    icon: Route,
    title: 'Parser Router',
    desc: 'Routes to JSON/XML/CSV/KV/Syslog/Text/Hex parser paths',
    color: 'text-secondary-foreground',
    bg: 'bg-secondary/60',
  },
  {
    icon: FileText,
    title: 'Deterministic Parsers',
    desc: 'Rule-based extraction for structured and semi-structured logs',
    color: 'text-success',
    bg: 'bg-success/10',
  },
  {
    icon: Bot,
    title: 'LLM Fallback Parser',
    desc: 'Groq-based extraction for messy or unknown vendor lines only',
    color: 'text-warning',
    bg: 'bg-warning/10',
  },
  {
    icon: Shield,
    title: 'Normalization Engine',
    desc: 'Canonical mapping: TEMP_C -> temperature, PRESSURE_TORR -> pressure',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    icon: Database,
    title: 'Structured Event + Storage',
    desc: 'Validated schema stored by run_id for traceability and analytics',
    color: 'text-info',
    bg: 'bg-info/10',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboards',
    desc: 'Parameter trends, recipe timelines, tool health monitoring',
    color: 'text-success',
    bg: 'bg-success/10',
  },
  {
    icon: Shield,
    title: 'Insights & Detection',
    desc: 'Alarm forensics, drift detection, golden-run comparison',
    color: 'text-destructive',
    bg: 'bg-destructive/10',
  },
];

export default function ArchitectureDiagram() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">System Architecture</h2>
        <p className="text-sm text-muted-foreground">Smart Semiconductor Tool Log Parser - Industrial Observability Pipeline</p>
      </div>

      <div className="max-w-lg mx-auto space-y-0">
        {stages.map((stage, i) => (
          <motion.div
            key={stage.title}
            initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.12 }}
          >
            <div className={`glass rounded-xl p-4 flex items-center gap-4 border-l-2 ${
              stage.color === 'text-primary' ? 'border-l-primary' :
              stage.color === 'text-info' ? 'border-l-info' :
              stage.color === 'text-warning' ? 'border-l-warning' :
              stage.color === 'text-success' ? 'border-l-success' :
              stage.color === 'text-secondary-foreground' ? 'border-l-secondary-foreground' :
              'border-l-destructive'
            }`}>
              <div className={`p-2.5 rounded-lg ${stage.bg} flex-shrink-0`}>
                <stage.icon className={`w-5 h-5 ${stage.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{stage.title}</h3>
                <p className="text-[11px] text-muted-foreground">{stage.desc}</p>
              </div>
            </div>
            {i < stages.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="w-4 h-4 text-muted-foreground/40" />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Supported formats */}
      <div className="glass rounded-xl p-6 mt-8">
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
      </div>

      {/* Key features */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { title: 'Hybrid Parsing Strategy', desc: 'Deterministic parsers first, LLM only for partial or ambiguous lines to reduce cost and increase reliability' },
          { title: 'Fab-Ready Context Model', desc: 'Standardized Fab -> Tool -> Chamber -> Recipe -> Step context supports real manufacturing investigations' },
          { title: 'Streaming + Historical Analysis', desc: 'Same schema powers both line-by-line live ingestion and deep post-run engineering analysis' },
        ].map((feat, i) => (
          <motion.div
            key={feat.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 + i * 0.1 }}
            className="glass rounded-xl p-4"
          >
            <h4 className="text-xs font-semibold text-foreground mb-1">{feat.title}</h4>
            <p className="text-[11px] text-muted-foreground">{feat.desc}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
