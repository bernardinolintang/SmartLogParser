import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, Copy, Download } from 'lucide-react';
import type { ParseResult } from '@/lib/logParser';

interface EngineerReportProps {
  result: ParseResult;
  fileName: string;
}

export default function EngineerReport({ result, fileName }: EngineerReportProps) {
  const report = useMemo(() => {
    const { events, summary, format } = result;
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════');
    lines.push('  SEMICONDUCTOR TOOL LOG REPORT');
    lines.push('═══════════════════════════════════════════════');
    lines.push('');
    lines.push(`Source File    : ${fileName}`);
    lines.push(`Format         : ${format.toUpperCase()}`);
    lines.push(`Total Events   : ${summary.totalEvents}`);
    lines.push(`Equipment      : ${summary.equipmentIds.join(', ')}`);
    lines.push(`Parameters     : ${summary.parameters.join(', ')}`);
    if (summary.timeRange.start) {
      lines.push(`Time Range     : ${summary.timeRange.start} → ${summary.timeRange.end}`);
    }
    lines.push(`Alarms         : ${summary.alarms}`);
    lines.push(`Warnings       : ${summary.warnings}`);
    lines.push('');

    // Group by equipment
    const byEquipment: Record<string, typeof events> = {};
    events.forEach(e => {
      if (!byEquipment[e.equipment_id]) byEquipment[e.equipment_id] = [];
      byEquipment[e.equipment_id].push(e);
    });

    for (const [equipId, eqEvents] of Object.entries(byEquipment)) {
      lines.push('───────────────────────────────────────────────');
      lines.push(`  Tool: ${equipId}`);
      lines.push('───────────────────────────────────────────────');

      const recipe = eqEvents.find(e => e.recipe_id)?.recipe_id;
      const lot = eqEvents.find(e => e.lot_id)?.lot_id;
      if (recipe) lines.push(`  Recipe : ${recipe}`);
      if (lot) lines.push(`  Lot    : ${lot}`);
      lines.push('');

      // Group by step
      const byStep: Record<string, typeof events> = {};
      eqEvents.forEach(e => {
        const key = e.step_id || 'N/A';
        if (!byStep[key]) byStep[key] = [];
        byStep[key].push(e);
      });

      for (const [stepId, stepEvents] of Object.entries(byStep)) {
        if (stepId !== 'N/A') lines.push(`  Step ${stepId}:`);

        // Compute stats per parameter
        const paramStats: Record<string, { values: number[]; unit?: string }> = {};
        stepEvents.forEach(e => {
          const v = parseFloat(e.value);
          if (!isNaN(v)) {
            if (!paramStats[e.parameter]) paramStats[e.parameter] = { values: [], unit: e.unit };
            paramStats[e.parameter].values.push(v);
          }
        });

        for (const [param, stat] of Object.entries(paramStats)) {
          const vals = stat.values;
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const unit = stat.unit ? ` ${stat.unit}` : '';
          if (vals.length === 1) {
            lines.push(`    ${param.padEnd(20)} : ${vals[0]}${unit}`);
          } else {
            lines.push(`    ${param.padEnd(20)} : avg=${avg.toFixed(2)}${unit}  min=${Math.min(...vals)}  max=${Math.max(...vals)}  (${vals.length} readings)`);
          }
        }

        // Non-numeric events
        const nonNumeric = stepEvents.filter(e => isNaN(parseFloat(e.value)));
        nonNumeric.forEach(e => {
          lines.push(`    ${e.parameter.padEnd(20)} : ${e.value}`);
        });

        // Alarms/warnings in this step
        const alarms = stepEvents.filter(e => e.severity === 'alarm');
        const warnings = stepEvents.filter(e => e.severity === 'warning');
        if (alarms.length > 0) {
          lines.push(`    ⚠ ALARMS (${alarms.length}):`);
          alarms.forEach(a => lines.push(`      [ALARM] ${a.parameter}=${a.value}${a.unit ? a.unit : ''} at ${a.timestamp}`));
        }
        if (warnings.length > 0) {
          lines.push(`    ⚡ WARNINGS (${warnings.length}):`);
          warnings.forEach(w => lines.push(`      [WARN] ${w.parameter}=${w.value}${w.unit ? w.unit : ''} at ${w.timestamp}`));
        }
        lines.push('');
      }
    }

    lines.push('═══════════════════════════════════════════════');
    lines.push('  END OF REPORT');
    lines.push('═══════════════════════════════════════════════');

    return lines.join('\n');
  }, [result, fileName]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(report);
  };

  const downloadReport = () => {
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${fileName.replace(/\.\w+$/, '')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Engineer Report</h3>
        </div>
        <div className="flex gap-2">
          <button onClick={copyToClipboard} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-xs text-secondary-foreground transition-colors">
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          <button onClick={downloadReport} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-xs text-primary-foreground transition-colors">
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        </div>
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <pre className="p-5 text-xs font-mono text-foreground leading-relaxed overflow-x-auto whitespace-pre max-h-[600px] overflow-y-auto">
          {report}
        </pre>
      </div>
    </motion.div>
  );
}
