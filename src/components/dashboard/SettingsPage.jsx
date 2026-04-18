import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Shield, Bell, Monitor, Database, Clock, Wifi, Activity, Cpu, HardDrive, Globe, Download, Upload, FileJson, FolderOutput, Trash2, RefreshCw, CheckCircle, AlertCircle, Edit3, Save, X, Loader2 } from 'lucide-react';
import { DARK_THEME } from '@/constants/theme';

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function SettingsSection({ title, icon: Icon, children, accentColor = DARK_THEME.electric }) {
  return (
    <div
      style={{
        backgroundColor: DARK_THEME.surface,
        border: `1px solid ${DARK_THEME.border}`,
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ height: '4px', background: `linear-gradient(90deg, ${accentColor} 0%, transparent 100%)`, flexShrink: 0 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '20px 28px',
          borderBottom: `1px solid ${DARK_THEME.border}`,
          backgroundColor: 'rgba(79, 195, 247, 0.02)',
          flexShrink: 0,
        }}
      >
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: `${accentColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} style={{ color: accentColor }} />
        </div>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 500, letterSpacing: '0.15em', color: DARK_THEME.textMuted }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '10px 28px 20px', flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, description, children, noBorder = false }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '18px 0',
      borderBottom: noBorder ? 'none' : `1px solid ${DARK_THEME.gridLine}`,
      gap: '24px',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '16px', color: DARK_THEME.text, marginBottom: '4px' }}>{label}</div>
        {description && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: DARK_THEME.textMuted, lineHeight: 1.4 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <motion.button
      onClick={() => onChange(!value)}
      whileTap={{ scale: 0.95 }}
      style={{
        width: '54px',
        height: '30px',
        borderRadius: '15px',
        backgroundColor: value ? `${DARK_THEME.electric}30` : 'rgba(79, 195, 247, 0.08)',
        border: `1px solid ${value ? DARK_THEME.electric : DARK_THEME.border}`,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.2s',
      }}
    >
      <motion.div
        animate={{ x: value ? 24 : 3 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          backgroundColor: value ? DARK_THEME.electric : DARK_THEME.textMuted,
          position: 'absolute',
          top: '3px',
          boxShadow: value ? `0 0 8px ${DARK_THEME.electric}60` : 'none',
        }}
      />
    </motion.button>
  );
}

function ValueBadge({ children, color = DARK_THEME.electric }) {
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '13px',
      letterSpacing: '0.05em',
      color,
      padding: '7px 16px',
      backgroundColor: `${color}12`,
      border: `1px solid ${color}30`,
      borderRadius: '6px',
    }}>
      {children}
    </span>
  );
}

function StatusDot({ color = DARK_THEME.success, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
      <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', color }}>{label}</span>
    </div>
  );
}

function ActionButton({ icon: Icon, label, color = DARK_THEME.electric, onClick, disabled = false, loading = false }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || loading}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        backgroundColor: `${color}15`,
        border: `1px solid ${color}40`,
        borderRadius: '8px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '11px',
        letterSpacing: '0.05em',
        color: color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
      }}
    >
      {loading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Icon size={14} />}
      {label}
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════

const PREFS_KEY = 'ghost_preferences';
const isElectronPrefs = typeof window !== 'undefined' && window.electronAPI?.preferences;
const isElectronBackup = typeof window !== 'undefined' && window.electronAPI?.backup;

function loadPrefs() {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return null;
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
}

function SettingsPage({ user }) {
  const saved = loadPrefs();
  const [notifications, setNotifications] = useState(saved?.notifications ?? true);
  const [soundAlerts, setSoundAlerts] = useState(saved?.sound_alerts ?? false);
  const [criticalOnly, setCriticalOnly] = useState(saved?.critical_only ?? false);
  const [autoRefresh, setAutoRefresh] = useState(saved?.auto_refresh ?? true);
  const [compactMode, setCompactMode] = useState(saved?.compact_mode ?? false);
  const [uptime, setUptime] = useState(0);

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);

  // Update check state: 'idle' | 'checking' | 'up-to-date' | 'available'
  const [updateStatus, setUpdateStatus] = useState('idle');

  const handleCheckForUpdates = () => {
    setUpdateStatus('checking');
    // Simulate a check — cycles through states for demo
    setTimeout(() => {
      setUpdateStatus('up-to-date');
      setTimeout(() => setUpdateStatus('idle'), 4000);
    }, 2500);
  };

  // Backup state
  const [backups, setBackups] = useState([]);
  const [dbInfo, setDbInfo] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState(null);

  const showMessage = (text, type = 'success') => {
    setBackupMessage({ text, type });
    setTimeout(() => setBackupMessage(null), 4000);
  };

  // Profile editing handlers
  const startEditingProfile = () => {
    setEditDisplayName(user?.display_name || '');
    setEditEmail(user?.email || '');
    setProfileError(null);
    setIsEditingProfile(true);
  };

  const cancelEditingProfile = () => {
    setIsEditingProfile(false);
    setProfileError(null);
  };

  const saveProfile = async () => {
    if (!window.electronAPI?.profile?.update) {
      setProfileError('Profile update not available');
      return;
    }

    setProfileSaving(true);
    setProfileError(null);

    try {
      const result = await window.electronAPI.profile.update(user.id, {
        display_name: editDisplayName,
        email: editEmail,
      });

      if (result.success) {
        showMessage('Profile updated successfully');
        setIsEditingProfile(false);
        // Trigger a refresh of user data in parent component if needed
        if (result.user && typeof window !== 'undefined') {
          // Update localStorage auth data
          const authData = JSON.parse(localStorage.getItem('ghost_auth') || '{}');
          if (authData.user) {
            authData.user.display_name = result.user.display_name;
            authData.user.email = result.user.email;
            localStorage.setItem('ghost_auth', JSON.stringify(authData));
          }
          // Force page reload to reflect changes
          window.location.reload();
        }
      } else {
        setProfileError(result.error || 'Failed to update profile');
      }
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const fetchBackupInfo = useCallback(async () => {
    if (!isElectronBackup) return;
    try {
      const [info, list] = await Promise.all([
        window.electronAPI.backup.getDatabaseInfo(),
        window.electronAPI.backup.list(),
      ]);
      if (info.success) setDbInfo(info);
      if (list.success) setBackups(list.backups);
    } catch (err) {
      console.error('Failed to fetch backup info:', err);
    }
  }, []);

  useEffect(() => {
    fetchBackupInfo();
  }, [fetchBackupInfo]);

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const result = await window.electronAPI.backup.create(user?.id);
      if (result.success) {
        showMessage('Backup created successfully');
        fetchBackupInfo();
      } else {
        showMessage(result.error || 'Backup failed', 'error');
      }
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (backupPath = null) => {
    if (!confirm('This will replace all current data. Are you sure?')) return;
    setRestoreLoading(true);
    try {
      const result = backupPath
        ? await window.electronAPI.backup.restore(backupPath, user?.id)
        : await window.electronAPI.backup.restoreFromFile(user?.id);
      if (result.success) {
        showMessage('Database restored — please restart the app');
        fetchBackupInfo();
      } else if (result.error !== 'Cancelled') {
        showMessage(result.error || 'Restore failed', 'error');
      }
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleExportJson = async (toPath = false) => {
    setExportLoading(true);
    try {
      const result = toPath
        ? await window.electronAPI.backup.exportJsonToPath(user?.id)
        : await window.electronAPI.backup.exportJson(user?.id);
      if (result.success) {
        showMessage(toPath ? 'Exported successfully' : 'Exported to backup folder');
      } else if (result.error !== 'Cancelled') {
        showMessage(result.error || 'Export failed', 'error');
      }
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteBackup = async (backupPath) => {
    if (!confirm('Delete this backup?')) return;
    try {
      const result = await window.electronAPI.backup.delete(backupPath, user?.id);
      if (result.success) {
        showMessage('Backup deleted');
        fetchBackupInfo();
      } else {
        showMessage(result.error || 'Delete failed', 'error');
      }
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Load from Electron DB on mount
  useEffect(() => {
    if (isElectronPrefs && user?.id) {
      window.electronAPI.preferences.get(user.id).then((prefs) => {
        if (prefs) {
          setNotifications(!!prefs.notifications);
          setSoundAlerts(!!prefs.sound_alerts);
          setCriticalOnly(!!prefs.critical_only);
          setAutoRefresh(!!prefs.auto_refresh);
          setCompactMode(!!prefs.compact_mode);
        }
      }).catch(() => {}); // Silently fail - use default preferences
    }
  }, [user?.id]);

  // Persist on every change
  const updatePref = (key, value, setter) => {
    setter(value);
    const prefs = { notifications, sound_alerts: soundAlerts, critical_only: criticalOnly, auto_refresh: autoRefresh, compact_mode: compactMode, [key]: value };
    savePrefs(prefs);
    if (isElectronPrefs && user?.id) {
      window.electronAPI.preferences.update(user.id, { [key]: value }).catch(() => {});
    }
  };

  useEffect(() => {
    const interval = setInterval(() => setUptime((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  };

  const isElectronEnv = typeof window !== 'undefined' && window.electronAPI;

  return (
    <div style={{ flex: 1, padding: '32px', overflowY: 'auto', backgroundColor: 'transparent' }}>
      {/* Header */}
      <div style={{ marginBottom: '36px' }}>
        <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '30px', fontWeight: 700, letterSpacing: '0.1em', color: DARK_THEME.text, margin: '0 0 6px 0' }}>
          SETTINGS
        </h1>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', letterSpacing: '0.1em', color: DARK_THEME.textMuted }}>
          SYSTEM CONFIGURATION & AGENT PREFERENCES
        </span>
      </div>

      {/* Two-column grid filling available space — equal height rows */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>

        {/* ── Agent Profile ── */}
        <SettingsSection title="AGENT PROFILE" icon={User} accentColor={DARK_THEME.electric}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            padding: '22px',
            margin: '14px 0 10px',
            backgroundColor: 'rgba(79, 195, 247, 0.04)',
            borderRadius: '10px',
            border: `1px solid ${DARK_THEME.gridLine}`,
          }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${DARK_THEME.navy}, ${DARK_THEME.electric}30)`,
              border: `2px solid ${DARK_THEME.electric}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 20px ${DARK_THEME.glow}`,
              flexShrink: 0,
            }}>
              <Shield size={32} style={{ color: DARK_THEME.electric }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '24px', fontWeight: 700, letterSpacing: '0.05em', color: DARK_THEME.text, lineHeight: 1.1 }}>
                  AGENT_{user?.username?.toUpperCase() || 'UNKNOWN'}
                </div>
                {!isEditingProfile && (
                  <motion.button
                    onClick={startEditingProfile}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Edit Profile"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      backgroundColor: `${DARK_THEME.electric}15`,
                      border: `1px solid ${DARK_THEME.electric}40`,
                      borderRadius: '6px',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '10px',
                      letterSpacing: '0.05em',
                      color: DARK_THEME.electric,
                      cursor: 'pointer',
                    }}
                  >
                    <Edit3 size={12} />
                    EDIT
                  </motion.button>
                )}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: DARK_THEME.textMuted, marginTop: '5px' }}>
                {user?.role || 'Agent'} — IT Operations Division
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                <StatusDot color={DARK_THEME.success} label="ACTIVE" />
              </div>
            </div>
          </div>

          {/* Profile Error Message */}
          {profileError && (
            <div style={{
              padding: '10px 16px',
              margin: '0 0 12px',
              backgroundColor: `${DARK_THEME.danger}15`,
              border: `1px solid ${DARK_THEME.danger}40`,
              borderRadius: '8px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '12px',
              color: DARK_THEME.danger,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <AlertCircle size={14} />
              {profileError}
            </div>
          )}

          {/* Profile Editing Form */}
          {isEditingProfile && (
            <div style={{
              padding: '16px',
              marginBottom: '12px',
              backgroundColor: 'rgba(79, 195, 247, 0.04)',
              borderRadius: '8px',
              border: `1px solid ${DARK_THEME.electric}30`,
            }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: DARK_THEME.textMuted,
                  marginBottom: '6px',
                }}>
                  DISPLAY NAME
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="Enter display name"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: DARK_THEME.navy,
                    border: `1px solid ${DARK_THEME.border}`,
                    borderRadius: '6px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '13px',
                    color: DARK_THEME.text,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: DARK_THEME.textMuted,
                  marginBottom: '6px',
                }}>
                  EMAIL
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="Enter email address"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: DARK_THEME.navy,
                    border: `1px solid ${DARK_THEME.border}`,
                    borderRadius: '6px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '13px',
                    color: DARK_THEME.text,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <motion.button
                  onClick={cancelEditingProfile}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={profileSaving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${DARK_THEME.border}`,
                    borderRadius: '6px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    color: DARK_THEME.textMuted,
                    cursor: profileSaving ? 'not-allowed' : 'pointer',
                    opacity: profileSaving ? 0.5 : 1,
                  }}
                >
                  <X size={12} />
                  CANCEL
                </motion.button>
                <motion.button
                  onClick={saveProfile}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={profileSaving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    backgroundColor: `${DARK_THEME.success}20`,
                    border: `1px solid ${DARK_THEME.success}`,
                    borderRadius: '6px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    color: DARK_THEME.success,
                    cursor: profileSaving ? 'not-allowed' : 'pointer',
                    opacity: profileSaving ? 0.5 : 1,
                  }}
                >
                  {profileSaving ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                  {profileSaving ? 'SAVING...' : 'SAVE'}
                </motion.button>
              </div>
            </div>
          )}

          <SettingRow label="Username" description="Login identifier">
            <ValueBadge>{user?.username || 'moner'}</ValueBadge>
          </SettingRow>
          <SettingRow label="Display Name" description="Editable name shown in UI">
            <ValueBadge>{user?.display_name || user?.username || 'Not set'}</ValueBadge>
          </SettingRow>
          <SettingRow label="Email" description="Contact email address">
            <ValueBadge color={DARK_THEME.textMuted}>{user?.email || 'Not set'}</ValueBadge>
          </SettingRow>
          <SettingRow label="Department" description="Primary assignment">
            <ValueBadge>{(user?.department || 'Unassigned').toUpperCase()}</ValueBadge>
          </SettingRow>
          <SettingRow label="Role" description="Access level" noBorder>
            <ValueBadge color={user?.role === 'owner' ? DARK_THEME.danger : user?.role === 'admin' ? DARK_THEME.warning : DARK_THEME.success}>
              {(user?.role || 'viewer').toUpperCase()}
            </ValueBadge>
          </SettingRow>
        </SettingsSection>

        {/* ── Notifications ── */}
        <SettingsSection title="NOTIFICATIONS" icon={Bell} accentColor={DARK_THEME.warning}>
          <SettingRow label="Desktop Notifications" description="Push alerts for new incidents">
            <Toggle value={notifications} onChange={(v) => updatePref('notifications', v, setNotifications)} />
          </SettingRow>
          <SettingRow label="Sound Alerts" description="Audio cue on critical incidents">
            <Toggle value={soundAlerts} onChange={(v) => updatePref('sound_alerts', v, setSoundAlerts)} />
          </SettingRow>
          <SettingRow label="Critical Only" description="Suppress non-critical alerts">
            <Toggle value={criticalOnly} onChange={(v) => updatePref('critical_only', v, setCriticalOnly)} />
          </SettingRow>
          <SettingRow label="Alert Priority Threshold" description="Minimum priority to trigger notification" noBorder>
            <ValueBadge color={criticalOnly ? DARK_THEME.danger : DARK_THEME.electric}>
              {criticalOnly ? 'CRITICAL' : 'ALL'}
            </ValueBadge>
          </SettingRow>
        </SettingsSection>

        {/* ── Display & Data ── */}
        <SettingsSection title="DISPLAY & DATA" icon={Monitor} accentColor={DARK_THEME.electric2}>
          <SettingRow label="Auto-Refresh Dashboard" description="Live polling for real-time data">
            <Toggle value={autoRefresh} onChange={(v) => updatePref('auto_refresh', v, setAutoRefresh)} />
          </SettingRow>
          <SettingRow label="Compact Table Rows" description="Reduce row height in incident tables">
            <Toggle value={compactMode} onChange={(v) => updatePref('compact_mode', v, setCompactMode)} />
          </SettingRow>
          <SettingRow label="Polling Intervals" description="Metrics 10s · Charts 30s · Resolutions 60s">
            <ValueBadge>STANDARD</ValueBadge>
          </SettingRow>
          <SettingRow label="Theme" description="Interface visual profile" noBorder>
            <ValueBadge color={DARK_THEME.electric2}>DARK INTELLIGENCE</ValueBadge>
          </SettingRow>
        </SettingsSection>

        {/* ── System Information ── */}
        <SettingsSection title="SYSTEM INFORMATION" icon={Database} accentColor={DARK_THEME.gold}>
          <SettingRow label="Application" description="Ghost Protocol — IT Intelligence Suite">
            <ValueBadge color={DARK_THEME.textMuted}>v1.0.0</ValueBadge>
          </SettingRow>
          <SettingRow label="Database Engine" description="Persistent storage layer">
            <StatusDot color={DARK_THEME.success} label="SQLite" />
          </SettingRow>
          <SettingRow label="Runtime" description="Execution environment">
            <ValueBadge color={isElectronEnv ? DARK_THEME.electric : DARK_THEME.textMuted}>
              {isElectronEnv ? 'ELECTRON' : 'BROWSER'}
            </ValueBadge>
          </SettingRow>
          <SettingRow label="Session Uptime" description="Time since application started">
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', color: DARK_THEME.electric, letterSpacing: '0.05em' }}>
              {formatUptime(uptime)}
            </span>
          </SettingRow>
          <SettingRow label="Organization" description="Licensed operator" noBorder>
            <ValueBadge color={DARK_THEME.gold}>GHOST PROTOCOL</ValueBadge>
          </SettingRow>
        </SettingsSection>

      </div>

      {/* ── Updates (Full Width) ── */}
      <div style={{ marginTop: '24px' }}>
        <SettingsSection title="UPDATES" icon={Download} accentColor={DARK_THEME.electric}>
          <SettingRow label="Current Version" description="Installed application version">
            <ValueBadge color={DARK_THEME.electric}>v1.0.0</ValueBadge>
          </SettingRow>
          <SettingRow label="Last Checked" description="Most recent update check">
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', color: DARK_THEME.textMuted }}>Never</span>
          </SettingRow>
          <SettingRow label="Status" description="Current update status">
            {updateStatus === 'checking' ? (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: DARK_THEME.textMuted, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                Checking...
              </span>
            ) : updateStatus === 'up-to-date' ? (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: DARK_THEME.success, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: DARK_THEME.success, display: 'inline-block' }} />
                Up to date
              </span>
            ) : updateStatus === 'available' ? (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: DARK_THEME.warning, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: DARK_THEME.warning, display: 'inline-block' }} />
                Update available
              </span>
            ) : (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: DARK_THEME.textMuted, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: DARK_THEME.textMuted, display: 'inline-block' }} />
                Not checked
              </span>
            )}
          </SettingRow>
          <SettingRow label="Check for Updates" description="Query the latest release from GitHub" noBorder>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              {updateStatus === 'checking' ? (
                <ActionButton icon={RefreshCw} label="CHECKING..." color={DARK_THEME.textMuted} onClick={() => {}} disabled loading />
              ) : updateStatus === 'up-to-date' ? (
                <ActionButton icon={CheckCircle} label="YOU ARE UP TO DATE" color={DARK_THEME.success} onClick={() => {}} disabled />
              ) : updateStatus === 'available' ? (
                <ActionButton icon={Download} label="UPDATE AVAILABLE v1.1.0" color={DARK_THEME.warning} onClick={() => {}} />
              ) : (
                <ActionButton icon={RefreshCw} label="CHECK FOR UPDATES" color={DARK_THEME.electric} onClick={handleCheckForUpdates} />
              )}
              <div style={{ display: 'flex', gap: '16px' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: DARK_THEME.textMuted, opacity: 0.6 }}>
                  github.com/moner-dev/ghost-protocol-helpdesk
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: DARK_THEME.electric, opacity: 0.6, cursor: 'pointer' }}>
                  View releases
                </span>
              </div>
            </div>
          </SettingRow>
        </SettingsSection>
      </div>

      {/* ── Backup & Restore (Full Width) ── */}
      {isElectronBackup && (
        <div style={{ marginTop: '24px' }}>
          <SettingsSection title="BACKUP & RESTORE" icon={HardDrive} accentColor={DARK_THEME.success}>
            {/* Database Info */}
            {dbInfo && (
              <div style={{
                display: 'flex',
                gap: '24px',
                padding: '16px 20px',
                marginBottom: '16px',
                backgroundColor: 'rgba(79, 195, 247, 0.04)',
                borderRadius: '8px',
                border: `1px solid ${DARK_THEME.gridLine}`,
              }}>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: DARK_THEME.textMuted, marginBottom: '4px' }}>DATABASE SIZE</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '16px', color: DARK_THEME.electric }}>{formatBytes(dbInfo.size)}</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: DARK_THEME.textMuted, marginBottom: '4px' }}>USERS</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '16px', color: DARK_THEME.text }}>{dbInfo.counts?.users || 0}</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: DARK_THEME.textMuted, marginBottom: '4px' }}>INCIDENTS</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '16px', color: DARK_THEME.text }}>{dbInfo.counts?.incidents || 0}</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: DARK_THEME.textMuted, marginBottom: '4px' }}>AUDIT LOGS</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '16px', color: DARK_THEME.text }}>{dbInfo.counts?.audit_logs || 0}</div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <ActionButton
                icon={Download}
                label="CREATE BACKUP"
                color={DARK_THEME.success}
                onClick={handleCreateBackup}
                loading={backupLoading}
              />
              <ActionButton
                icon={Upload}
                label="RESTORE FROM FILE"
                color={DARK_THEME.warning}
                onClick={() => handleRestoreBackup(null)}
                loading={restoreLoading}
              />
              <ActionButton
                icon={FileJson}
                label="EXPORT JSON"
                color={DARK_THEME.electric}
                onClick={() => handleExportJson(false)}
                loading={exportLoading}
              />
              <ActionButton
                icon={FolderOutput}
                label="EXPORT TO..."
                color={DARK_THEME.gold}
                onClick={() => handleExportJson(true)}
                loading={exportLoading}
              />
            </div>

            {/* Backup List */}
            {backups.length > 0 && (
              <div>
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  color: DARK_THEME.textMuted,
                  marginBottom: '12px',
                }}>
                  AVAILABLE BACKUPS ({backups.length})
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {backups.map((backup, index) => (
                    <div
                      key={backup.path}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(79, 195, 247, 0.02)',
                        borderBottom: `1px solid ${DARK_THEME.gridLine}`,
                        borderRadius: index === 0 ? '8px 8px 0 0' : index === backups.length - 1 ? '0 0 8px 8px' : '0',
                      }}
                    >
                      <div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: DARK_THEME.text }}>
                          {backup.name}
                        </div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: DARK_THEME.textMuted, marginTop: '2px' }}>
                          {formatBytes(backup.size)} — {new Date(backup.created).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <motion.button
                          onClick={() => handleRestoreBackup(backup.path)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          title="Restore this backup"
                          style={{
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'transparent',
                            border: `1px solid ${DARK_THEME.warning}40`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <Upload size={14} style={{ color: DARK_THEME.warning }} />
                        </motion.button>
                        <motion.button
                          onClick={() => handleDeleteBackup(backup.path)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          title="Delete this backup"
                          style={{
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'transparent',
                            border: `1px solid ${DARK_THEME.danger}40`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} style={{ color: DARK_THEME.danger }} />
                        </motion.button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SettingsSection>
        </div>
      )}

      {/* Backup Message Toast */}
      <AnimatePresence>
        {backupMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              padding: '14px 24px',
              backgroundColor: backupMessage.type === 'error' ? `${DARK_THEME.danger}18` : `${DARK_THEME.success}18`,
              backdropFilter: 'blur(16px)',
              border: `1px solid ${backupMessage.type === 'error' ? DARK_THEME.danger : DARK_THEME.success}40`,
              borderRadius: '10px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '13px',
              color: backupMessage.type === 'error' ? DARK_THEME.danger : DARK_THEME.success,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {backupMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
            {backupMessage.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSS for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default SettingsPage;
