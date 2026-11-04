import React, { useState, useEffect } from 'react';
import Shell from '../components/Shell';
import {
  User, Shield, Cpu, Sliders, CheckCircle, AlertTriangle,
  RefreshCw, LogOut, ArrowRight, Info, Check, RotateCcw, Clock, Layout,
  Sun, Moon, Calendar, Map, Bell, BellOff, Lock, Key, FileText
} from 'lucide-react';
import { api } from '../services/api';
import {
  getPreferences,
  savePreferences,
  resetPreferences,
  CLOCK_FORMATS,
  DATE_FORMATS,
  MAP_VIEWS,
  SIDEBAR_STATES,
  THEMES,
  DEFAULT_PREFERENCES,
  applyThemeToDocument
} from '../services/preferences';

const ROLE_METADATA = {
  COORDINATOR: {
    label: 'COORDINATOR',
    fullName: 'Operational Movement Coordinator',
    className: 'COORDINATOR',
    description: 'Authorized for operational convoy movement management, tactical corridor planning, incident acknowledgement, and runtime fuel evaluation overrides.'
  },
  CREATOR: {
    label: 'CREATOR',
    fullName: 'Tactical Corridor Planner',
    className: 'CREATOR',
    description: 'Authorized for mission draft formulation, route alternative assessment, and convoy asset configuration.'
  },
  CHECKPOINT_OPERATOR: {
    label: 'CHECKPOINT OPERATOR',
    fullName: 'Station Checkpoint Observer',
    className: 'CHECKPOINT_OPERATOR',
    description: 'Authorized for operational route monitoring, checkpoint transponder observation, and route incident tracking.'
  },
  ADMIN: {
    label: 'ADMINISTRATOR',
    fullName: 'System Logistics Administrator',
    className: 'ADMIN',
    description: 'Administrative profile authorized with full operational, planning, and management access across all system modules.'
  }
};

const DEFAULT_ROLE_DESCRIPTION = 'Standard operational account authorized for logistics decision-support within assigned module boundaries.';

export default function ProfileSettings({ currentUser, onLogout }) {
  // Authenticated identity extraction with robust fallbacks
  const userEmail = currentUser?.email || 'Unavailable';
  const userId = currentUser?.id || 'Not assigned';
  const rawRole = currentUser?.role || 'UNKNOWN';
  const roleMeta = ROLE_METADATA[rawRole] || {
    label: rawRole,
    fullName: 'Operational System Operator',
    className: 'UNKNOWN',
    description: DEFAULT_ROLE_DESCRIPTION
  };

  const username = userEmail.includes('@') ? userEmail.split('@')[0] : userEmail;
  const userInitials = username.slice(0, 2).toUpperCase() || 'OP';

  // Workspace preferences state
  const initialPrefs = getPreferences(currentUser);
  const [clockFormat, setClockFormat] = useState(initialPrefs.clockFormat);
  const [dateFormat, setDateFormat] = useState(initialPrefs.dateFormat || DATE_FORMATS.DD_MMM_YYYY);
  const [sidebarState, setSidebarState] = useState(initialPrefs.sidebarState);
  const [theme, setThemeState] = useState(initialPrefs.theme || THEMES.DARK);
  const [mapView, setMapView] = useState(initialPrefs.mapView || MAP_VIEWS.TACTICAL);
  const [prefStatus, setPrefStatus] = useState(null); // { type: 'success' | 'error' | 'reset', message: string }

  // Sync state if currentUser changes
  useEffect(() => {
    const prefs = getPreferences(currentUser);
    setClockFormat(prefs.clockFormat);
    setDateFormat(prefs.dateFormat || DATE_FORMATS.DD_MMM_YYYY);
    setSidebarState(prefs.sidebarState);
    setThemeState(prefs.theme || THEMES.DARK);
    setMapView(prefs.mapView || MAP_VIEWS.TACTICAL);
    setPrefStatus(null);
  }, [currentUser]);

  const handleThemeChange = (newTheme) => {
    setThemeState(newTheme);
    applyThemeToDocument(newTheme);
  };

  // Sign out workflow
  const [isSigningOut, setIsSigningOut] = useState(false);
  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      if (typeof onLogout === 'function') {
        await onLogout();
      }
    } catch (err) {
      console.warn('[VAYU ORBIT] Sign-out error:', err);
      setIsSigningOut(false);
    }
  };

  // Preference actions
  const handleSavePreferences = (e) => {
    e.preventDefault();
    const result = savePreferences(currentUser, {
      clockFormat,
      dateFormat,
      sidebarState,
      theme,
      mapView
    });
    if (result.success) {
      setPrefStatus({
        type: 'success',
        message: 'Workspace preferences saved successfully to account storage.'
      });
    } else {
      setPrefStatus({
        type: 'error',
        message: result.error || 'Failed to save preferences to browser storage.'
      });
    }
  };

  const handleResetPreferences = () => {
    const result = resetPreferences(currentUser);
    setClockFormat(DEFAULT_PREFERENCES.clockFormat);
    setDateFormat(DEFAULT_PREFERENCES.dateFormat);
    setSidebarState(DEFAULT_PREFERENCES.sidebarState);
    setThemeState(DEFAULT_PREFERENCES.theme);
    setMapView(DEFAULT_PREFERENCES.mapView);
    applyThemeToDocument(DEFAULT_PREFERENCES.theme);
    setPrefStatus({
      type: 'reset',
      message: 'Workspace preferences reset to default values.'
    });
  };

  // On-demand API health test
  const [connState, setConnState] = useState({ status: 'idle', message: '', latency: null });
  const handleTestConnection = async () => {
    setConnState({ status: 'checking', message: 'Querying backend health endpoint…', latency: null });
    const start = performance.now();
    try {
      const res = await api.health();
      const elapsed = Math.round(performance.now() - start);
      setConnState({
        status: 'success',
        message: `HTTP 200 OK — Routing & simulation engine active (Phase: ${res?.phase ?? 6})`,
        latency: elapsed
      });
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      setConnState({
        status: 'failure',
        message: err.message || 'API endpoint unreachable or unauthorized.',
        latency: elapsed
      });
    }
  };

  // Navigation to About page via custom event
  const handleNavigateAbout = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vayu_navigate', { detail: 'About CMS' }));
    }
  };

  return (
    <Shell
      title="Profile & Settings"
      eyebrow="SYSTEM · OPERATIONAL ACCOUNT"
      description="Operator account profile, operational workspace preferences, alert telemetry channels, and security boundaries."
    >
      {/* ── Section 1: Operator Identity & Profile Hero ── */}
      <section className="vayu-profile-hero" aria-label="Operator Identity">
        <div className="vayu-profile-identity" style={{ width: '100%', flexWrap: 'wrap' }}>
          <div className="vayu-profile-avatar-lg" aria-hidden="true">
            {userInitials}
          </div>
          <div className="vayu-profile-details" style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h2 style={{ margin: '0 0 2px 0', fontSize: 18, fontWeight: 700, color: 'var(--text-main)' }}>
                  {roleMeta.fullName}
                </h2>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'Share Tech Mono, monospace' }}>
                  {userEmail} <span style={{ opacity: 0.6 }}>({username})</span>
                </div>
              </div>
              <span className="pill ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                Active Authenticated Session
              </span>
            </div>

            <div className="vayu-profile-meta-row" style={{ marginTop: 10 }}>
              <span className={`vayu-pill-role ${roleMeta.className}`} title={`Assigned Role: ${roleMeta.label}`}>
                {roleMeta.label}
              </span>
              <span className="muted">•</span>
              <span className="muted" style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 11.5 }}>
                Account ID: <strong>{userId}</strong>
              </span>
              <span className="muted">•</span>
              <span className="muted" style={{ fontSize: 11.5 }}>
                Station: <strong>HQ Logistics Command Node / Northern Sector</strong>
              </span>
              <span className="muted">•</span>
              <span className="muted" style={{ fontSize: 11.5 }}>
                Provisioning: <strong>Directory Managed</strong>
              </span>
            </div>

            {/* Role Authorization Scope & Policy Note */}
            <div className="vayu-role-description-card" style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--color-accent-primary)', fontSize: 12 }}>
                  Role Authorization Scope (RBAC):
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)', fontFamily: 'Share Tech Mono, monospace' }}>
                  Directory-Managed Profile (Read-Only)
                </span>
              </div>
              <p style={{ margin: '0 0 8px 0', fontSize: 12.5, lineHeight: 1.5 }}>
                {roleMeta.description}
              </p>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: 6, marginTop: 6 }}>
                <strong>Notice:</strong> Roles represent software Role-Based Access Control (RBAC) authorization boundaries within the VAYU ORBIT decision-support system. They do not represent military ranks, official command authorities, or security clearance classifications. Profile attributes are provisioned via administrative identity directory; self-service editing is restricted by policy.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Content Grid ── */}
      <div className="grid g2" style={{ gap: 20 }}>
        {/* ── Card 1: Operational Workspace Preferences ── */}
        <div className="card" role="region" aria-labelledby="pref-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Sliders size={16} color="var(--accent)" aria-hidden="true" />
            <h3 id="pref-heading" style={{ margin: 0 }}>Operational Workspace Preferences</h3>
          </div>
          <p className="muted small" style={{ marginBottom: 16 }}>
            Preferences are saved to account-scoped local storage for <code>{userEmail}</code> and apply immediately across the interface.
          </p>

          <form onSubmit={handleSavePreferences} noValidate>
            {/* Preference 1: Clock format */}
            <div className="vayu-pref-item">
              <div className="vayu-pref-header">
                <span className="vayu-pref-title" id="clock-format-label">Header Clock Format</span>
              </div>
              <p className="vayu-pref-desc">
                Controls the time presentation in the global header bar.
              </p>
              <div
                className="vayu-pref-radiogroup"
                role="radiogroup"
                aria-labelledby="clock-format-label"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={clockFormat === CLOCK_FORMATS.H24}
                  className={`vayu-pref-radio-btn${clockFormat === CLOCK_FORMATS.H24 ? ' active' : ''}`}
                  onClick={() => setClockFormat(CLOCK_FORMATS.H24)}
                >
                  <Clock size={13} aria-hidden="true" />
                  <span>24-Hour (Default)</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={clockFormat === CLOCK_FORMATS.H12}
                  className={`vayu-pref-radio-btn${clockFormat === CLOCK_FORMATS.H12 ? ' active' : ''}`}
                  onClick={() => setClockFormat(CLOCK_FORMATS.H12)}
                >
                  <Clock size={13} aria-hidden="true" />
                  <span>12-Hour (AM / PM)</span>
                </button>
              </div>
            </div>

            {/* Preference 2: Date format */}
            <div className="vayu-pref-item">
              <div className="vayu-pref-header">
                <span className="vayu-pref-title" id="date-format-label">Date Presentation Format</span>
              </div>
              <p className="vayu-pref-desc">
                Controls calendar date notation in the header clock and mission telemetry.
              </p>
              <div
                className="vayu-pref-radiogroup"
                role="radiogroup"
                aria-labelledby="date-format-label"
                style={{ flexWrap: 'wrap' }}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={dateFormat === DATE_FORMATS.DD_MMM_YYYY}
                  className={`vayu-pref-radio-btn${dateFormat === DATE_FORMATS.DD_MMM_YYYY ? ' active' : ''}`}
                  onClick={() => setDateFormat(DATE_FORMATS.DD_MMM_YYYY)}
                >
                  <Calendar size={13} aria-hidden="true" />
                  <span>DD-MMM-YYYY (Tactical)</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={dateFormat === DATE_FORMATS.YYYY_MM_DD}
                  className={`vayu-pref-radio-btn${dateFormat === DATE_FORMATS.YYYY_MM_DD ? ' active' : ''}`}
                  onClick={() => setDateFormat(DATE_FORMATS.YYYY_MM_DD)}
                >
                  <Calendar size={13} aria-hidden="true" />
                  <span>YYYY-MM-DD (ISO)</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={dateFormat === DATE_FORMATS.DD_MM_YYYY}
                  className={`vayu-pref-radio-btn${dateFormat === DATE_FORMATS.DD_MM_YYYY ? ' active' : ''}`}
                  onClick={() => setDateFormat(DATE_FORMATS.DD_MM_YYYY)}
                >
                  <Calendar size={13} aria-hidden="true" />
                  <span>DD/MM/YYYY</span>
                </button>
              </div>
            </div>

            {/* Preference 3: Appearance / Theme Mode */}
            <div className="vayu-pref-item">
              <div className="vayu-pref-header">
                <span className="vayu-pref-title" id="theme-mode-label">Appearance / Theme Mode</span>
              </div>
              <p className="vayu-pref-desc">
                Interface theme. Tactical high-contrast Night Mode or high-visibility Light Mode.
              </p>
              <div
                className="vayu-pref-radiogroup"
                role="radiogroup"
                aria-labelledby="theme-mode-label"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === THEMES.DARK}
                  className={`vayu-pref-radio-btn${theme === THEMES.DARK ? ' active' : ''}`}
                  onClick={() => handleThemeChange(THEMES.DARK)}
                  aria-label="Dark Mode"
                >
                  <Moon size={13} aria-hidden="true" />
                  <span>Dark Mode (Night)</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === THEMES.LIGHT}
                  className={`vayu-pref-radio-btn${theme === THEMES.LIGHT ? ' active' : ''}`}
                  onClick={() => handleThemeChange(THEMES.LIGHT)}
                  aria-label="Light Mode"
                >
                  <Sun size={13} aria-hidden="true" />
                  <span>Light Mode (Day)</span>
                </button>
              </div>
            </div>

            {/* Preference 4: Default Map View */}
            <div className="vayu-pref-item">
              <div className="vayu-pref-header">
                <span className="vayu-pref-title" id="map-view-label">Default Tactical Map Mode</span>
              </div>
              <p className="vayu-pref-desc">
                Initial raster layer and route geometry perspective across planning and operations maps.
              </p>
              <div
                className="vayu-pref-radiogroup"
                role="radiogroup"
                aria-labelledby="map-view-label"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={mapView === MAP_VIEWS.TACTICAL}
                  className={`vayu-pref-radio-btn${mapView === MAP_VIEWS.TACTICAL ? ' active' : ''}`}
                  onClick={() => setMapView(MAP_VIEWS.TACTICAL)}
                >
                  <Map size={13} aria-hidden="true" />
                  <span>Tactical High-Contrast (Vector)</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mapView === MAP_VIEWS.OVERVIEW}
                  className={`vayu-pref-radio-btn${mapView === MAP_VIEWS.OVERVIEW ? ' active' : ''}`}
                  onClick={() => setMapView(MAP_VIEWS.OVERVIEW)}
                >
                  <Map size={13} aria-hidden="true" />
                  <span>Regional Strategic Overview</span>
                </button>
              </div>
            </div>

            {/* Preference 5: Sidebar default */}
            <div className="vayu-pref-item">
              <div className="vayu-pref-header">
                <span className="vayu-pref-title" id="sidebar-mode-label">Default Sidebar Mode</span>
              </div>
              <p className="vayu-pref-desc">
                Initial desktop navigation state. On mobile screens navigation remains off-canvas.
              </p>
              <div
                className="vayu-pref-radiogroup"
                role="radiogroup"
                aria-labelledby="sidebar-mode-label"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={sidebarState === SIDEBAR_STATES.EXPANDED}
                  className={`vayu-pref-radio-btn${sidebarState === SIDEBAR_STATES.EXPANDED ? ' active' : ''}`}
                  onClick={() => setSidebarState(SIDEBAR_STATES.EXPANDED)}
                >
                  <Layout size={13} aria-hidden="true" />
                  <span>Expanded (Default)</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={sidebarState === SIDEBAR_STATES.COLLAPSED}
                  className={`vayu-pref-radio-btn${sidebarState === SIDEBAR_STATES.COLLAPSED ? ' active' : ''}`}
                  onClick={() => setSidebarState(SIDEBAR_STATES.COLLAPSED)}
                >
                  <Layout size={13} aria-hidden="true" />
                  <span>Collapsed (Icon Rail)</span>
                </button>
              </div>
            </div>

            {/* Status Announcement Message */}
            {prefStatus && (
              <div
                role="status"
                aria-live="polite"
                className={`alert ${prefStatus.type === 'error' ? '' : 'ok-alert'}`}
                style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {prefStatus.type === 'error' ? (
                  <AlertTriangle size={15} aria-hidden="true" />
                ) : (
                  <CheckCircle size={15} aria-hidden="true" />
                )}
                <span>{prefStatus.message}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="submit"
                className="btn primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Check size={14} aria-hidden="true" />
                <span>Save Preferences</span>
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleResetPreferences}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>Reset to Defaults</span>
              </button>
            </div>
          </form>
        </div>

        {/* ── Card 2: Operational Alerts & Notification Channels ── */}
        <div className="card" role="region" aria-labelledby="notif-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Bell size={16} color="var(--accent)" aria-hidden="true" />
            <h3 id="notif-heading" style={{ margin: 0 }}>Operational Alerts & Telemetry Dispatch</h3>
          </div>
          <p className="muted small" style={{ marginBottom: 16 }}>
            Status of live tactical alerts, convoy spacing warnings, and system notifications.
          </p>

          <div className="vayu-spec-grid" style={{ marginBottom: 16 }}>
            {/* Channel 1 */}
            <div className="vayu-spec-row" style={{ padding: '10px 0', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 12.5 }}>
                  Journey Status Updates
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Transponder check-ins, convoy departures, checkpoint arrivals, and completion events.
                </div>
              </div>
              <span className="pill ok" style={{ flexShrink: 0, marginTop: 2, fontSize: 10.5 }}>
                Active (In-App Polling)
              </span>
            </div>

            {/* Channel 2 */}
            <div className="vayu-spec-row" style={{ padding: '10px 0', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 12.5 }}>
                  Operational Warnings
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Spacing violations (&lt;100m, &gt;2000m), speed ceiling breaches, and bridge weight limits.
                </div>
              </div>
              <span className="pill ok" style={{ flexShrink: 0, marginTop: 2, fontSize: 10.5 }}>
                Active (Runtime Engine)
              </span>
            </div>

            {/* Channel 3 */}
            <div className="vayu-spec-row" style={{ padding: '10px 0', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 12.5 }}>
                  Critical System Alerts
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Corridor blockades, weather closures, vehicle breakdowns, and emergency refuel halts.
                </div>
              </div>
              <span className="pill ok" style={{ flexShrink: 0, marginTop: 2, fontSize: 10.5 }}>
                Active (Incident Modal)
              </span>
            </div>

            {/* Channel 4 */}
            <div className="vayu-spec-row" style={{ padding: '10px 0', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 12.5 }}>
                  External Email / SMS Notifications
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Out-of-band email dispatch and SMS cellular alerts to off-station personnel.
                </div>
              </div>
              <span className="pill muted" style={{ flexShrink: 0, marginTop: 2, fontSize: 10.5 }}>
                Unavailable (No Gateway)
              </span>
            </div>
          </div>

          {/* Explicit Backend Limitation Notice */}
          <div className="alert warn-alert" style={{ fontSize: 11.5, lineHeight: 1.5, marginBottom: 0 }}>
            <strong>Backend Limitation:</strong> The current backend service (v6.0.0) does not integrate external mail transfer agents (SMTP) or cellular SMS gateways. Notification delivery preferences are not persisted server-side; all tactical alerts are evaluated in real time and delivered directly within active operator sessions via the Sitrep feed and Incident Dispatch board.
          </div>
        </div>

        {/* ── Card 3: Authentication & Security Boundaries ── */}
        <div className="card" role="region" aria-labelledby="sec-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Shield size={16} color="var(--accent)" aria-hidden="true" />
            <h3 id="sec-heading" style={{ margin: 0 }}>Authentication Boundaries & Session Security</h3>
          </div>
          <p className="muted small" style={{ marginBottom: 14 }}>
            Active cryptographic parameters and session lifetime boundaries enforced for this session.
          </p>

          <div className="vayu-spec-grid" style={{ marginBottom: 16 }}>
            <div className="vayu-spec-row">
              <span className="vayu-spec-label">Token Scheme</span>
              <span className="vayu-spec-value">JSON Web Token (JWT Bearer)</span>
            </div>
            <div className="vayu-spec-row">
              <span className="vayu-spec-label">Signature Algorithm</span>
              <span className="vayu-spec-value">HMAC-SHA256 (HS256)</span>
            </div>
            <div className="vayu-spec-row">
              <span className="vayu-spec-label">Session Lifetime</span>
              <span className="vayu-spec-value">24 Hours from Issuance</span>
            </div>
            <div className="vayu-spec-row">
              <span className="vayu-spec-label">Token Storage</span>
              <span className="vayu-spec-value">SessionStorage & HTTP-only Cookie</span>
            </div>
            <div className="vayu-spec-row">
              <span className="vayu-spec-label">Subject Identifier</span>
              <span className="vayu-spec-value">{userId}</span>
            </div>
          </div>

          {/* System Boundaries & Architecture Disclosures */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <div style={{ background: 'var(--color-surface-secondary)', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', fontSize: 11.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Password Management</span>
                <span className="pill warn" style={{ fontSize: 9.5 }}>Admin-Managed</span>
              </div>
              <span style={{ color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                Self-service password update is not exposed via REST API. Account credentials and password resets are managed directly by system administrators.
              </span>
            </div>

            <div style={{ background: 'var(--color-surface-secondary)', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', fontSize: 11.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Active Sessions Registry</span>
                <span className="pill muted" style={{ fontSize: 9.5 }}>Stateless (No Store)</span>
              </div>
              <span style={{ color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                Tokens are validated cryptographically without a centralized Redis or database session registry. Multi-session tracking and remote revocation are not supported.
              </span>
            </div>

            <div style={{ background: 'var(--color-surface-secondary)', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', fontSize: 11.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Sign-in History</span>
                <span className="pill muted" style={{ fontSize: 9.5 }}>Access Logs Only</span>
              </div>
              <span style={{ color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                User sign-in attempts are logged in web server access logs. Operational auditing is focused on convoy modifications, fuel overrides, and incident actions.
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn danger"
            onClick={handleSignOut}
            disabled={isSigningOut}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <LogOut size={14} aria-hidden="true" />
            <span>{isSigningOut ? 'Signing Out…' : 'Sign Out Current Session'}</span>
          </button>
        </div>

        {/* ── Card 4: System & Runtime Environment ── */}
        <div className="card" role="region" aria-labelledby="sys-heading" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Cpu size={16} color="var(--accent)" aria-hidden="true" />
            <h3 id="sys-heading" style={{ margin: 0 }}>System & Runtime Environment</h3>
          </div>

          <div className="grid g2" style={{ gap: 20 }}>
            <div>
              <div className="vayu-spec-grid">
                <div className="vayu-spec-row">
                  <span className="vayu-spec-label">Application</span>
                  <span className="vayu-spec-value">VAYU ORBIT</span>
                </div>
                <div className="vayu-spec-row">
                  <span className="vayu-spec-label">Operational Context</span>
                  <span className="vayu-spec-value">Simulation & Decision Support</span>
                </div>
                <div className="vayu-spec-row">
                  <span className="vayu-spec-label">Primary Timezone</span>
                  <span className="vayu-spec-value">Asia/Kolkata (IST, UTC+05:30)</span>
                </div>
                <div className="vayu-spec-row">
                  <span className="vayu-spec-label">Software Version</span>
                  <span className="vayu-spec-value">v6.0.0</span>
                </div>
                <div className="vayu-spec-row">
                  <span className="vayu-spec-label">Target API Host</span>
                  <span className="vayu-spec-value">{api.base || 'http://127.0.0.1:8000'}</span>
                </div>
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--text-main)' }}>
                API Connectivity Check
              </div>
              <p className="muted small" style={{ marginBottom: 12 }}>
                Perform an on-demand verification of the local API health endpoint to confirm server-side availability.
              </p>

              <button
                type="button"
                className="btn"
                onClick={handleTestConnection}
                disabled={connState.status === 'checking'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}
              >
                <RefreshCw size={13} className={connState.status === 'checking' ? 'spin' : ''} aria-hidden="true" />
                <span>{connState.status === 'checking' ? 'Checking API…' : 'Test API Connectivity'}</span>
              </button>

              {connState.status !== 'idle' && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`alert ${connState.status === 'success' ? 'ok-alert' : connState.status === 'failure' ? '' : 'warn-alert'}`}
                  style={{ fontSize: 11.5 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {connState.status === 'success' && <CheckCircle size={14} aria-hidden="true" />}
                    {connState.status === 'failure' && <AlertTriangle size={14} aria-hidden="true" />}
                    {connState.status === 'checking' && <RefreshCw size={14} className="spin" aria-hidden="true" />}
                    <span>{connState.message}</span>
                  </div>
                  {connState.latency !== null && (
                    <div style={{ marginTop: 4, fontFamily: 'Share Tech Mono, monospace', fontSize: 10.5 }}>
                      Round-trip response latency: {connState.latency} ms
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Page Footer: Prototype Disclosure & Link to About ── */}
      <footer className="vayu-profile-footer" role="contentinfo">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: 720 }}>
          <Info size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
          <p className="muted small" style={{ margin: 0, lineHeight: 1.6 }}>
            <strong>Prototype Boundary:</strong> VAYU ORBIT is a logistics decision-support demonstration prototype developed under the Army Design Bureau Problem Definition Statement 3 (7th Edition). It is non-operational, unclassified, and does not constitute official military certification, operational clearance, or deployment authorization.
          </p>
        </div>
        <button
          type="button"
          className="vayu-footer-link"
          onClick={handleNavigateAbout}
          title="Open About VAYU ORBIT page"
        >
          <span>About VAYU ORBIT</span>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </footer>
    </Shell>
  );
}
