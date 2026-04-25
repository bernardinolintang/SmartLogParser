import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  User, Building2, Briefcase, Mail, Save, Check, Shield,
  Cpu, Clock, FileText, Camera, X, Upload
} from 'lucide-react';
import { loadHistory } from './UploadHistory';

interface Profile {
  name: string;
  role: string;
  company: string;
  email: string;
  department: string;
  avatarColor: string;
  avatarImage: string; // base64 data URL or ''
}

const STORAGE_KEY = 'slp_profile';

const AVATAR_COLORS = [
  'from-primary to-primary/60',
  'from-violet-500 to-violet-700',
  'from-emerald-500 to-emerald-700',
  'from-amber-500 to-amber-700',
  'from-rose-500 to-rose-700',
  'from-sky-500 to-sky-700',
  'from-orange-500 to-orange-700',
];

const DEFAULT_PROFILE: Profile = {
  name: '',
  role: '',
  company: '',
  email: '',
  department: '',
  avatarColor: AVATAR_COLORS[0],
  avatarImage: '',
};

function loadProfile(): Profile {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return stored ? { ...DEFAULT_PROFILE, ...stored } : { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile(p: Profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon: React.ElementType;
  type?: string;
}

function Field({ label, value, onChange, placeholder, icon: Icon, type = 'text' }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <Icon className="w-3 h-3" />
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-primary focus:border-primary/60 outline-none transition-all"
      />
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [saved, setSaved] = useState(false);
  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const history = loadHistory();
  const totalEvents = history.reduce((s, e) => s + e.totalEvents, 0);
  const totalAlarms = history.reduce((s, e) => s + e.alarms, 0);
  const lastUpload = history[0]?.uploadedAt;

  const update = useCallback((field: keyof Profile) => (value: string) => {
    setProfile(p => ({ ...p, [field]: value }));
  }, []);

  const handleSave = () => {
    saveProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const processImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      setProfile(p => ({ ...p, avatarImage: dataUrl }));
    };
    reader.readAsDataURL(file);
  }, []);

  const handleAvatarFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
    e.target.value = '';
  }, [processImageFile]);

  const handleAvatarDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAvatar(false);
    const file = e.dataTransfer.files[0];
    if (file) processImageFile(file);
  }, [processImageFile]);

  const removeAvatar = () => setProfile(p => ({ ...p, avatarImage: '' }));

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header / Avatar card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 border border-border"
      >
        <div className="flex items-start gap-5">

          {/* Avatar upload zone */}
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            <div
              onDragOver={e => { e.preventDefault(); setIsDraggingAvatar(true); }}
              onDragLeave={() => setIsDraggingAvatar(false)}
              onDrop={handleAvatarDrop}
              className="relative group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={`w-24 h-24 rounded-2xl overflow-hidden shadow-lg transition-all duration-200 ${isDraggingAvatar ? 'ring-2 ring-primary scale-105' : 'group-hover:ring-2 group-hover:ring-primary/60'}`}>
                {profile.avatarImage ? (
                  <img src={profile.avatarImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${profile.avatarColor} flex items-center justify-center`}>
                    <span className="text-2xl font-bold text-white select-none">{getInitials(profile.name)}</span>
                  </div>
                )}
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 rounded-2xl bg-black/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <Camera className="w-5 h-5 text-white" />
                <span className="text-[10px] text-white font-medium">Change</span>
              </div>

              {/* Drag hint */}
              {isDraggingAvatar && (
                <div className="absolute inset-0 rounded-2xl bg-primary/30 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileInput}
            />

            <p className="text-[9px] text-muted-foreground/60 text-center leading-tight max-w-[96px]">
              Click or drag<br />an image
            </p>

            {profile.avatarImage && (
              <button
                onClick={removeAvatar}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" /> Remove
              </button>
            )}

            {/* Color swatches (shown when no photo) */}
            {!profile.avatarImage && (
              <div className="flex gap-1 flex-wrap justify-center max-w-[96px]">
                {AVATAR_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setProfile(p => ({ ...p, avatarColor: c }))}
                    title="Pick color"
                    className={`w-5 h-5 rounded-full bg-gradient-to-br ${c} transition-all ${profile.avatarColor === c ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110' : 'opacity-50 hover:opacity-100'}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="flex-1 min-w-0 pt-1">
            <h2 className="text-xl font-bold text-foreground leading-tight">
              {profile.name || <span className="text-muted-foreground italic font-normal text-base">Your Name</span>}
            </h2>
            {(profile.role || profile.department) && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {[profile.role, profile.department].filter(Boolean).join(' · ')}
              </p>
            )}
            {profile.company && (
              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {profile.company}
              </p>
            )}
            {profile.email && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {profile.email}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/50 mt-3">Edit your details below and hit Save</p>
          </div>
        </div>
      </motion.div>

      {/* Editable fields */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="glass rounded-2xl p-6 border border-border"
      >
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-5">
          <User className="w-4 h-4 text-primary" />
          Personal Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Full Name"
            value={profile.name}
            onChange={update('name')}
            placeholder="e.g. Alex Chen"
            icon={User}
          />
          <Field
            label="Email"
            value={profile.email}
            onChange={update('email')}
            placeholder="you@company.com"
            icon={Mail}
            type="email"
          />
          <Field
            label="Role / Title"
            value={profile.role}
            onChange={update('role')}
            placeholder="e.g. Process Engineer"
            icon={Briefcase}
          />
          <Field
            label="Department"
            value={profile.department}
            onChange={update('department')}
            placeholder="e.g. Etch Module"
            icon={Shield}
          />
          <div className="sm:col-span-2">
            <Field
              label="Company"
              value={profile.company}
              onChange={update('company')}
              placeholder="e.g. Micron Technology"
              icon={Building2}
            />
          </div>
        </div>

        {/* Save button */}
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shadow-glow-primary"
          >
            <Save className="w-4 h-4" />
            Save Profile
          </button>
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 text-sm text-success"
            >
              <Check className="w-4 h-4" /> Saved!
            </motion.span>
          )}
        </div>
      </motion.div>

      {/* Activity stats */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="glass rounded-2xl p-6 border border-border"
      >
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-primary" />
          Your Activity
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: FileText, label: 'Files Parsed', value: history.length, color: 'text-primary' },
            { icon: Cpu, label: 'Events Processed', value: totalEvents.toLocaleString(), color: 'text-info' },
            { icon: Shield, label: 'Alarms Found', value: totalAlarms, color: totalAlarms > 0 ? 'text-destructive' : 'text-muted-foreground' },
            {
              icon: Clock,
              label: 'Last Upload',
              value: lastUpload ? (() => {
                const diff = Date.now() - new Date(lastUpload).getTime();
                const mins = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);
                if (mins < 1) return 'just now';
                if (mins < 60) return `${mins}m ago`;
                if (hours < 24) return `${hours}h ago`;
                return `${days}d ago`;
              })() : 'Never',
              color: 'text-muted-foreground',
            },
          ].map(stat => (
            <div key={stat.label} className="p-3 rounded-xl bg-secondary/20 text-center">
              <stat.icon className={`w-5 h-5 mx-auto mb-1.5 ${stat.color}`} />
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* App info */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="glass rounded-2xl p-4 border border-border"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Cpu className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Smart Log Parser</p>
              <p className="text-[10px] text-muted-foreground">Semiconductor Observability · Profile stored locally</p>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground/50">v1.0.0</span>
        </div>
      </motion.div>
    </div>
  );
}
