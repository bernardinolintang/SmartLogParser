import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { GitCompare, Upload, ArrowLeftRight } from 'lucide-react';
import { parseLog, getSampleLogs } from '@/lib/logParser';
import type { ParseResult } from '@/lib/logParser';

export default function CrossVendorCompare() {
  const [logA, setLogA] = useState<{ result: ParseResult; name: string } | null>(null);
  const [logB, setLogB] = useState<{ result: ParseResult; name: string } | null>(null);

  const loadSample = useCallback((key: string, slot: 'A' | 'B') => {
    const samples = getSampleLogs();
    const result = parseLog(samples[key]);
    if (slot === 'A') setLogA({ result, name: key });
    else setLogB({ result, name: key });
  }, []);

  const handleFile = useCallback((file: File, slot: 'A' | 'B') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = parseLog(content);
      if (slot === 'A') setLogA({ result, name: file.name });
      else setLogB({ result, name: file.name });
    };
    reader.readAsText(file);
  }, []);

  const comparison = useMemo(() => {
    if (!logA || !logB) return null;

    // Find common parameters
    const paramsA: Record<string, { values: number[]; unit?: string }> = {};
    const paramsB: Record<string, { values: number[]; unit?: string }> = {};

    logA.result.events.forEach(e => {
      const v = parseFloat(e.value);
      if (!isNaN(v)) {
        if (!paramsA[e.parameter]) paramsA[e.parameter] = { values: [], unit: e.unit };
        paramsA[e.parameter].values.push(v);
      }
    });
    logB.result.events.forEach(e => {
      const v = parseFloat(e.value);
      if (!isNaN(v)) {
        if (!paramsB[e.parameter]) paramsB[e.parameter] = { values: [], unit: e.unit };
        paramsB[e.parameter].values.push(v);
      }
    });

    const allParams = [...new Set([...Object.keys(paramsA), ...Object.keys(paramsB)])].sort();

    return allParams.map(param => {
      const a = paramsA[param];
      const b = paramsB[param];
      const avgA = a ? a.values.reduce((s, v) => s + v, 0) / a.values.length : null;
      const avgB = b ? b.values.reduce((s, v) => s + v, 0) / b.values.length : null;
      const diff = avgA !== null && avgB !== null ? ((avgB - avgA) / avgA * 100) : null;
      return {
        parameter: param,
        avgA, avgB, diff,
        minA: a ? Math.min(...a.values) : null,
        maxA: a ? Math.max(...a.values) : null,
        minB: b ? Math.min(...b.values) : null,
        maxB: b ? Math.max(...b.values) : null,
        unit: a?.unit || b?.unit || '',
      };
    });
  }, [logA, logB]);

  const sampleKeys = Object.keys(getSampleLogs());

  const SlotPicker = ({ slot, current }: { slot: 'A' | 'B'; current: { name: string } | null }) => (
    <div className="glass rounded-xl p-4 space-y-3 flex-1">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${slot === 'A' ? 'bg-primary text-primary-foreground' : 'bg-success text-success-foreground'}`}>
          {slot}
        </span>
        <span className="text-sm font-medium text-foreground">
          {current ? current.name : `Select Log ${slot}`}
        </span>
      </div>
      <label className="flex items-center justify-center h-16 rounded-lg border border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors">
        <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f, slot); }} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Upload className="w-4 h-4" /> Upload file
        </div>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {sampleKeys.map(key => (
          <button
            key={key}
            onClick={() => loadSample(key, slot)}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              current?.name === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {key.split('.')[0].replace(/_/g, ' ')}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <GitCompare className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-medium text-foreground">Cross-Vendor Comparison</h3>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-stretch">
        <SlotPicker slot="A" current={logA} />
        <div className="flex items-center justify-center">
          <ArrowLeftRight className="w-5 h-5 text-muted-foreground" />
        </div>
        <SlotPicker slot="B" current={logB} />
      </div>

      {comparison && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Parameter</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-primary uppercase">Log A (Avg)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-success uppercase">Log B (Avg)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Δ %</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Range A</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Range B</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(row => (
                  <tr key={row.parameter} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-foreground">{row.parameter}</td>
                    <td className="px-4 py-2.5 text-xs text-right font-mono text-primary">
                      {row.avgA !== null ? row.avgA.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right font-mono text-success">
                      {row.avgB !== null ? row.avgB.toFixed(2) : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-xs text-right font-mono font-medium ${
                      row.diff === null ? 'text-muted-foreground' :
                      Math.abs(row.diff) > 20 ? 'text-destructive' :
                      Math.abs(row.diff) > 10 ? 'text-warning' : 'text-muted-foreground'
                    }`}>
                      {row.diff !== null ? `${row.diff > 0 ? '+' : ''}${row.diff.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">
                      {row.minA !== null ? `${row.minA}–${row.maxA}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">
                      {row.minB !== null ? `${row.minB}–${row.maxB}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
            {comparison.length} parameters compared · Δ &gt; 20% highlighted in red
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
