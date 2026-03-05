import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Upload, Table, BarChart3 } from 'lucide-react';
import LogUpload from '@/components/LogUpload';
import LogSummary from '@/components/LogSummary';
import LogTable from '@/components/LogTable';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import type { ParseResult } from '@/lib/logParser';

type Tab = 'upload' | 'table' | 'analytics';

const Index = () => {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('upload');

  const handleParsed = useCallback((r: ParseResult, name: string) => {
    setResult(r);
    setFileName(name);
    setActiveTab('table');
  }, []);

  const tabs: { id: Tab; label: string; icon: React.ElementType; disabled?: boolean }[] = [
    { id: 'upload', label: 'Upload', icon: Upload },
    { id: 'table', label: 'Data', icon: Table, disabled: !result },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, disabled: !result },
  ];

  return (
    <div className="min-h-screen bg-background grid-bg">
      <div className="scanline fixed inset-0 pointer-events-none z-50" />

      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 glow-primary">
              <Cpu className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                Smart Log Parser
              </h1>
              <p className="text-xs text-muted-foreground">Semiconductor Tool Log Analysis</p>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex gap-1 bg-secondary/50 rounded-lg p-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                  ${activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : tab.disabled
                      ? 'text-muted-foreground/40 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 relative z-10">
        {activeTab === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div className="text-center max-w-2xl mx-auto mb-8">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-3xl sm:text-4xl font-bold text-foreground mb-3"
              >
                Parse Any <span className="text-primary">Tool Log</span>
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-muted-foreground"
              >
                Upload logs from any semiconductor equipment vendor. 
                Auto-detect format, normalize parameters, and generate structured analytics.
              </motion.p>
            </div>
            <LogUpload onParsed={handleParsed} />
          </motion.div>
        )}

        {activeTab === 'table' && result && (
          <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <LogSummary result={result} fileName={fileName} />
            <LogTable events={result.events} fileName={fileName} />
          </motion.div>
        )}

        {activeTab === 'analytics' && result && (
          <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AnalyticsDashboard events={result.events} />
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default Index;
