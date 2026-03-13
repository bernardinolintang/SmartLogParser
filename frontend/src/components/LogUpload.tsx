import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Cpu, Zap, ChevronRight, Server, MonitorSmartphone } from 'lucide-react';
import { parseLog, getSampleLogs, type LogFormat } from '@/lib/logParser';
import type { ParseResult } from '@/lib/logParser';
import { uploadLogToBackend, isBackendAvailable } from '@/lib/api';

interface LogUploadProps {
  onParsed: (result: ParseResult, fileName: string) => void;
}

const FORMAT_LABELS: Record<LogFormat, string> = {
  json: 'JSON', xml: 'XML', csv: 'CSV',
  syslog: 'Syslog', text: 'Plain Text', hex: 'Binary/Hex', keyvalue: 'Key-Value', kv: 'Key-Value',
};

const FORMAT_COLORS: Record<LogFormat, string> = {
  json: 'text-primary', xml: 'text-info', csv: 'text-success',
  syslog: 'text-warning', text: 'text-secondary-foreground', hex: 'text-destructive', keyvalue: 'text-primary', kv: 'text-primary',
};

export default function LogUpload({ onParsed }: LogUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<LogFormat | null>(null);
  const [backendUp, setBackendUp] = useState(false);
  const [parseMode, setParseMode] = useState<'checking' | 'backend' | 'client'>('checking');
  const [statusMsg, setStatusMsg] = useState('Parsing & normalizing...');

  useEffect(() => {
    isBackendAvailable().then(ok => {
      setBackendUp(ok);
      setParseMode(ok ? 'backend' : 'client');
    });
  }, []);

  const processViaBackend = useCallback(async (file: File) => {
    setProcessing(true);
    setDetectedFormat(null);
    setStatusMsg('Detecting format...');
    try {
      const result = await uploadLogToBackend(file);
      setDetectedFormat(result.format as LogFormat);
      setStatusMsg('Normalizing events...');
      await new Promise(r => setTimeout(r, 300));
      setProcessing(false);
      onParsed(result as ParseResult, file.name);
    } catch {
      setStatusMsg('Backend unavailable, falling back to client...');
      await new Promise(r => setTimeout(r, 400));
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        setProcessing(true);
        setDetectedFormat(null);
        setStatusMsg('Detecting format...');
        await new Promise(r => setTimeout(r, 400));
        const result = parseLog(content);
        setDetectedFormat(result.format);
        setStatusMsg('Building dashboard...');
        await new Promise(r => setTimeout(r, 400));
        setProcessing(false);
        onParsed(result, file.name);
      };
      reader.readAsText(file);
    }
  }, [onParsed]);

  const processClientSide = useCallback(async (content: string, fileName: string) => {
    setProcessing(true);
    setDetectedFormat(null);
    setStatusMsg('Detecting format...');
    await new Promise(r => setTimeout(r, 400));
    const result = parseLog(content);
    setDetectedFormat(result.format);
    setStatusMsg('Building dashboard...');
    await new Promise(r => setTimeout(r, 400));
    setProcessing(false);
    onParsed(result, fileName);
  }, [onParsed]);

  const processFile = useCallback(async (content: string, fileName: string) => {
    if (backendUp) {
      const blob = new Blob([content], { type: 'text/plain' });
      const file = new File([blob], fileName);
      return processViaBackend(file);
    }
    return processClientSide(content, fileName);
  }, [backendUp, processViaBackend, processClientSide]);

  const handleFile = useCallback((file: File) => {
    if (backendUp) {
      processViaBackend(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        processClientSide(content, file.name);
      };
      reader.readAsText(file);
    }
  }, [backendUp, processViaBackend, processClientSide]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const loadSample = useCallback((key: string) => {
    const samples = getSampleLogs();
    processFile(samples[key], key);
  }, [processFile]);

  const sampleLogs = getSampleLogs();

  return (
    <div className="space-y-8">
      {/* Upload Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <label
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`
            relative flex flex-col items-center justify-center 
            h-56 rounded-xl border-2 border-dashed cursor-pointer
            transition-all duration-300
            ${isDragging
              ? 'border-primary bg-primary/5 glow-primary'
              : 'border-border hover:border-primary/50 hover:bg-card/50'
            }
          `}
        >
          <input type="file" className="hidden" onChange={handleFileInput} accept=".json,.xml,.csv,.log,.txt,.hex,.kv" />
          <AnimatePresence mode="wait">
            {processing ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center gap-4"
              >
                <Cpu className="w-10 h-10 text-primary animate-spin" />
                <div className="text-center space-y-2">
                  <p className="text-foreground font-medium">Processing Log...</p>
                  {detectedFormat && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`text-sm font-mono ${FORMAT_COLORS[detectedFormat]}`}
                    >
                      Format detected: {FORMAT_LABELS[detectedFormat]}
                    </motion.p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="animate-pulse-glow">●</span>
                    {statusMsg}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="upload"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="p-4 rounded-full bg-primary/10">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-foreground font-medium">Drop a log file or click to upload</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    JSON · XML · CSV · Syslog · Text · Hex · Key-Value
                  </p>
                  <div className="flex items-center justify-center gap-1.5 mt-2 text-[10px]">
                    {backendUp ? (
                      <span className="flex items-center gap-1 text-green-400"><Server className="w-3 h-3" /> Backend connected</span>
                    ) : parseMode !== 'checking' ? (
                      <span className="flex items-center gap-1 text-yellow-400"><MonitorSmartphone className="w-3 h-3" /> Client-side mode</span>
                    ) : (
                      <span className="text-muted-foreground">Checking backend...</span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </label>
      </motion.div>

      {/* Sample Logs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Or try a sample log
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.keys(sampleLogs).map((key, i) => {
            const ext = key.split('.').pop() || '';
            const name = key.split('.')[0].replace(/_/g, ' ');
            return (
              <motion.button
                key={key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                onClick={() => loadSample(key)}
                className="glass rounded-lg p-4 text-left hover:border-primary/50 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <div>
                      <p className="text-sm font-medium text-foreground capitalize">{name}</p>
                      <p className="text-xs text-muted-foreground font-mono">.{ext}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
