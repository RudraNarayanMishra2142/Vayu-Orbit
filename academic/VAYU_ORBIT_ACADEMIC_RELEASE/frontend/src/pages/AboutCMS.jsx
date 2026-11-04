/**
 * AboutCMS.jsx — VAYU ORBIT Visual-First Product Showcase
 * 
 * Re-architected as a polished defence-logistics product showcase:
 * 1. Visual Hero Section with brand identity, concise one-sentence description, and route map visual.
 * 2. Visual Capability Showcase with 3 genuine application panels (Planning, Route Intelligence, Operations).
 * 3. Product Architecture Visualization depicting the 4 actual system tiers.
 * 4. Compact System Information Strip (Version, Environment, Verified API status, Timezone).
 * 5. Restrained Product Attribution & Footer (VAYU DYNAMICS © 2026).
 */

import React, { useState, useEffect } from 'react';
import {
  MapPinned, Route, PlayCircle, ArrowRight,
  Layers, Server, Database, Compass, CheckCircle2,
  Activity, ExternalLink
} from 'lucide-react';
import { api } from '../services/api';

/* ── Global navigation helper wired to Layout.jsx listener ── */
function navigate(page) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vayu_navigate', { detail: page }));
  }
}

/* ── Hero Inline Route Planning Visual (Connected Nodes Motif) ──── */
function HeroRouteVisual() {
  return (
    <div className="vayu-about-hero-visual" aria-hidden="true">
      <svg
        className="vayu-about-hero-svg"
        viewBox="0 0 960 140"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        <defs>
          <linearGradient id="heroRouteGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
            <stop offset="30%" stopColor="var(--accent)" stopOpacity="0.95" />
            <stop offset="70%" stopColor="var(--ok)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="heroGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Subtle tactical coordinate grid */}
        <line x1="40" y1="70" x2="920" y2="70" stroke="rgba(102,140,160,0.15)" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="180" y1="20" x2="180" y2="120" stroke="rgba(102,140,160,0.1)" strokeWidth="1" />
        <line x1="360" y1="20" x2="360" y2="120" stroke="rgba(102,140,160,0.1)" strokeWidth="1" />
        <line x1="540" y1="20" x2="540" y2="120" stroke="rgba(102,140,160,0.1)" strokeWidth="1" />
        <line x1="720" y1="20" x2="720" y2="120" stroke="rgba(102,140,160,0.1)" strokeWidth="1" />

        {/* Outer tactical glow trail */}
        <path
          d="M 50 70 C 140 70, 170 30, 240 30 C 310 30, 350 110, 430 110 C 510 110, 560 40, 640 40 C 720 40, 770 90, 840 90 L 910 70"
          fill="none"
          stroke="url(#heroGlow)"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Main connected route geometry */}
        <path
          className="vayu-about-hero-path"
          d="M 50 70 C 140 70, 170 30, 240 30 C 310 30, 350 110, 430 110 C 510 110, 560 40, 640 40 C 720 40, 770 90, 840 90 L 910 70"
          fill="none"
          stroke="url(#heroRouteGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Waypoint nodes along the tactical corridor */}
        {[
          { cx: 50, cy: 70, tag: 'PLANNING', label: '01' },
          { cx: 240, cy: 30, tag: 'CONVOY', label: '02' },
          { cx: 430, cy: 110, tag: 'ASSESSMENT', label: '03' },
          { cx: 640, cy: 40, tag: 'PREVIEW', label: '04' },
          { cx: 840, cy: 90, tag: 'OPERATIONS', label: '05' },
          { cx: 910, cy: 70, tag: 'DEBRIEF', label: '06' },
        ].map(({ cx, cy, tag, label }) => (
          <g key={tag} className="vayu-about-waypoint-group">
            <circle cx={cx} cy={cy} r="9" fill="var(--panel-bg)" stroke="var(--accent)" strokeWidth="1.5" />
            <circle cx={cx} cy={cy} r="4" fill="var(--accent)" />
            <text
              x={cx}
              y={cy > 70 ? cy + 20 : cy - 14}
              textAnchor="middle"
              fill="var(--text-main)"
              fontSize="9.5"
              fontFamily="'Share Tech Mono', monospace"
              letterSpacing="1"
              fontWeight="bold"
            >
              {label} · {tag}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── Main About CMS Component ─────────────────────────────────────── */
export default function AboutCMS({ setPage }) {
  const [apiHealthy, setApiHealthy] = useState(true);

  // Check live API connectivity for compact system information
  useEffect(() => {
    let mounted = true;
    api.health()
      .then(() => { if (mounted) setApiHealthy(true); })
      .catch(() => { if (mounted) setApiHealthy(false); });
    return () => { mounted = false; };
  }, []);

  const handleNavigate = (pageName) => {
    if (typeof setPage === 'function') {
      setPage(pageName);
    } else {
      navigate(pageName);
    }
  };

  return (
    <div className="vayu-about-root">
      <div className="vayu-about-container">

        {/* ══════════════════════════════════════════════════════════
            SECTION 1 — VISUAL HERO SECTION
        ══════════════════════════════════════════════════════════ */}
        <header className="vayu-about-hero" aria-label="Product introduction">
          <div className="vayu-about-hero-topline">
            <span className="vayu-about-proto-pill">
              <span className="vayu-about-proto-dot" aria-hidden="true" />
              Demonstration Prototype
            </span>
            <span className="vayu-about-version-badge">v6.0.0</span>
          </div>

          <div className="vayu-about-hero-brand">
            <div className="vayu-about-hero-logo-frame">
              <img src="/vayu.png" alt="VAYU ORBIT" className="vayu-about-hero-logo" />
            </div>
            <div className="vayu-about-hero-brand-text">
              <h1 className="vayu-about-hero-title">VAYU ORBIT</h1>
              <p className="vayu-about-hero-tagline">
                Intelligent Convoy Planning
              </p>
            </div>
          </div>

          <p className="vayu-about-hero-description" style={{ maxWidth: 760, fontSize: 14.5, lineHeight: 1.6 }}>
            An intelligent convoy movement planning and logistics decision-support platform designed to unify corridor route assessment, vehicle manifest configuration, departure feasibility gates, and operational tracking into one connected workflow.
          </p>

          {/* Visual Representation of Route Planning & Connected Nodes */}
          <HeroRouteVisual />

          <div className="vayu-about-hero-actions" style={{ marginTop: 22 }}>
            <button
              type="button"
              className="btn primary vayu-about-cta-btn"
              onClick={() => handleNavigate('Overview')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <span>Open Operations Dashboard</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
            <span className="vayu-about-hero-meta-note">
              Simulation environment active · Kolkata Standard Time (IST)
            </span>
          </div>
        </header>

        {/* ══════════════════════════════════════════════════════════
            SECTION 2 — VISUAL CAPABILITY SHOWCASE (3 PANELS)
        ══════════════════════════════════════════════════════════ */}
        <section className="vayu-about-section" aria-labelledby="showcase-heading">
          <div className="vayu-about-eyebrow">CORE CAPABILITIES</div>
          <h2 id="showcase-heading" className="vayu-about-heading">
            Platform Capabilities at a Glance
          </h2>
          <p className="vayu-about-body" style={{ marginBottom: 18, maxWidth: 700 }}>
            Visual preview of the primary operational interfaces supporting mission planning, tactical routing, and active convoy monitoring.
          </p>

          <div className="vayu-showcase-grid">
            {/* Panel 1: Journey Planning */}
            <article
              className="vayu-showcase-card"
              onClick={() => handleNavigate('Journey Planning')}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => e.key === 'Enter' && handleNavigate('Journey Planning')}
              aria-label="Open Journey Planning module"
            >
              <div className="vayu-showcase-img-wrap">
                <img
                  src="/showcase/planning.png"
                  alt="Journey Planning Interface with military nodes map and departure schedule"
                  className="vayu-showcase-img"
                />
              </div>
              <div className="vayu-showcase-body">
                <span className="vayu-showcase-tag">01 · PLANNING</span>
                <h3 className="vayu-showcase-title">Journey Planning</h3>
                <p className="vayu-showcase-caption">
                  Plan and organize convoy journeys.
                </p>
                <div className="vayu-showcase-btn">
                  <span>Launch Planning Module</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </div>
              </div>
            </article>

            {/* Panel 2: Route Intelligence */}
            <article
              className="vayu-showcase-card"
              onClick={() => handleNavigate('Route Assessment')}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => e.key === 'Enter' && handleNavigate('Route Assessment')}
              aria-label="Open Route Assessment module"
            >
              <div className="vayu-showcase-img-wrap">
                <img
                  src="/showcase/route_intelligence.png"
                  alt="Route Intelligence map showing tactical route geometries and turn instructions"
                  className="vayu-showcase-img"
                />
              </div>
              <div className="vayu-showcase-body">
                <span className="vayu-showcase-tag">02 · INTELLIGENCE</span>
                <h3 className="vayu-showcase-title">Route Intelligence</h3>
                <p className="vayu-showcase-caption">
                  Assess routes against supported constraints.
                </p>
                <div className="vayu-showcase-btn">
                  <span>Explore Route Assessment</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </div>
              </div>
            </article>

            {/* Panel 3: Journey Operations */}
            <article
              className="vayu-showcase-card"
              onClick={() => handleNavigate('Journey Operations')}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => e.key === 'Enter' && handleNavigate('Journey Operations')}
              aria-label="Open Journey Operations module"
            >
              <div className="vayu-showcase-img-wrap">
                <img
                  src="/showcase/operations.png"
                  alt="Journey Operations tracking dashboard showing live checkpoints and fleet status"
                  className="vayu-showcase-img"
                />
              </div>
              <div className="vayu-showcase-body">
                <span className="vayu-showcase-tag">03 · OPERATIONS</span>
                <h3 className="vayu-showcase-title">Journey Operations</h3>
                <p className="vayu-showcase-caption">
                  Monitor journey status and manage operational updates.
                </p>
                <div className="vayu-showcase-btn">
                  <span>Open Operations View</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 3 — PRODUCT ARCHITECTURE VISUALIZATION
        ══════════════════════════════════════════════════════════ */}
        <section className="vayu-about-section" aria-labelledby="arch-heading">
          <div className="vayu-about-eyebrow">PRODUCT ARCHITECTURE</div>
          <h2 id="arch-heading" className="vayu-about-heading">
            System Layers & Technical Foundation
          </h2>
          <p className="vayu-about-body" style={{ marginBottom: 20, maxWidth: 700 }}>
            Four interconnected layers power VAYU ORBIT from user interface to deterministic routing and audited state persistence:
          </p>

          <div className="vayu-arch-container">
            {/* Layer 1: Frontend Client */}
            <div className="vayu-arch-card">
              <div className="vayu-arch-header">
                <h3 className="vayu-arch-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Layers size={16} color="var(--accent)" aria-hidden="true" />
                  <span>Frontend Client Application</span>
                </h3>
                <span className="vayu-arch-badge">PRESENTATION LAYER</span>
              </div>
              <p className="vayu-arch-desc">
                Tactical command shell, role-based access control (RBAC), turn-by-turn guidance panels, and dual-theme design system.
              </p>
              <div className="vayu-arch-techs">
                <span className="vayu-arch-pill">React 18</span>
                <span className="vayu-arch-pill">Vite</span>
                <span className="vayu-arch-pill">CSS Custom Properties</span>
                <span className="vayu-arch-pill">Lucide Icons</span>
              </div>
            </div>

            {/* Downward Connector Line */}
            <div className="vayu-arch-connector" aria-hidden="true">
              <div className="vayu-arch-connector-line" />
              <span>REST API · Stateless JSON Web Tokens (HS256)</span>
              <div className="vayu-arch-connector-line" />
            </div>

            {/* Layer 2: Backend Decision Engine & APIs */}
            <div className="vayu-arch-card">
              <div className="vayu-arch-header">
                <h3 className="vayu-arch-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Server size={16} color="var(--accent)" aria-hidden="true" />
                  <span>Backend Services & Decision Engine</span>
                </h3>
                <span className="vayu-arch-badge">APPLICATION & DECISION LOGIC</span>
              </div>
              <p className="vayu-arch-desc">
                FastAPI microservices executing convoy constraint validation, fuel departure safety gates, and incident dispatch bus.
              </p>
              <div className="vayu-arch-techs">
                <span className="vayu-arch-pill">FastAPI</span>
                <span className="vayu-arch-pill">Python 3.13</span>
                <span className="vayu-arch-pill">Uvicorn ASGI</span>
                <span className="vayu-arch-pill">BCrypt & PyJWT</span>
              </div>
            </div>

            {/* Downward Connector to Split Tiers */}
            <div className="vayu-arch-connector" aria-hidden="true">
              <div className="vayu-arch-connector-line" />
              <span>Internal Service Data Binding</span>
              <div className="vayu-arch-connector-line" />
            </div>

            {/* Split Tiers: Mapping & Routing + Database Persistence */}
            <div className="vayu-arch-split-grid">
              {/* Layer 3: Mapping & Tactical Routing */}
              <div className="vayu-arch-card">
                <div className="vayu-arch-header">
                  <h3 className="vayu-arch-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
                    <Compass size={15} color="var(--accent)" aria-hidden="true" />
                    <span>Mapping & Routing Components</span>
                  </h3>
                  <span className="vayu-arch-badge">ROUTING</span>
                </div>
                <p className="vayu-arch-desc">
                  Vector road geometries, tile layers, and shortest-path graph calculations over northern theatre corridors.
                </p>
                <div className="vayu-arch-techs">
                  <span className="vayu-arch-pill">TomTom Maps SDK</span>
                  <span className="vayu-arch-pill">116-Node Graph</span>
                  <span className="vayu-arch-pill">Dijkstra Algorithm</span>
                </div>
              </div>

              {/* Layer 4: Audited Database Store */}
              <div className="vayu-arch-card">
                <div className="vayu-arch-header">
                  <h3 className="vayu-arch-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
                    <Database size={15} color="var(--accent)" aria-hidden="true" />
                    <span>Database & Audit Store</span>
                  </h3>
                  <span className="vayu-arch-badge">PERSISTENCE</span>
                </div>
                <p className="vayu-arch-desc">
                  Relational persistence store managing journeys, vehicle catalog, fleet units, and immutable event logs.
                </p>
                <div className="vayu-arch-techs">
                  <span className="vayu-arch-pill">SQLite 3</span>
                  <span className="vayu-arch-pill">14 Relational Tables</span>
                  <span className="vayu-arch-pill">Atomic Transactions</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 4 — COMPACT SYSTEM INFORMATION
        ══════════════════════════════════════════════════════════ */}
        <div className="vayu-sysinfo-strip" role="region" aria-label="System status">
          <div className="vayu-sysinfo-item">
            <span className="vayu-sysinfo-label">Product Version</span>
            <span className="vayu-sysinfo-val">v6.0.0</span>
          </div>

          <div className="vayu-sysinfo-divider" aria-hidden="true" />

          <div className="vayu-sysinfo-item">
            <span className="vayu-sysinfo-label">Environment</span>
            <span className="vayu-sysinfo-val">Simulation & Decision Support</span>
          </div>

          <div className="vayu-sysinfo-divider" aria-hidden="true" />

          <div className="vayu-sysinfo-item">
            <span className="vayu-sysinfo-label">Backend Connection</span>
            <span className="vayu-sysinfo-val" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: apiHealthy ? 'var(--ok)' : 'var(--warn)',
                  display: 'inline-block'
                }}
                aria-hidden="true"
              />
              <span>{apiHealthy ? 'API Connected (Phase 6)' : 'Connecting…'}</span>
            </span>
          </div>

          <div className="vayu-sysinfo-divider" aria-hidden="true" />

          <div className="vayu-sysinfo-item">
            <span className="vayu-sysinfo-label">Timezone</span>
            <span className="vayu-sysinfo-val">Asia/Kolkata (IST)</span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            SECTION 5 — ATTRIBUTION AND RESTRAINED FOOTER
        ══════════════════════════════════════════════════════════ */}
        <footer className="vayu-about-closing">
          <div className="vayu-about-closing-rule" aria-hidden="true" />

          <div style={{ maxWidth: 760, margin: '0 auto 20px', textAlign: 'center' }}>
            <p className="muted small" style={{ margin: 0, lineHeight: 1.6, fontSize: 11.5 }}>
              <strong>Prototype Development Boundary:</strong> VAYU ORBIT is a logistics decision-support demonstration prototype developed under the Army Design Bureau Problem Definition Statement 3 (7th Edition). It is non-operational, unclassified, and does not constitute official military certification, operational clearance, or deployment authorization.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <button
              type="button"
              className="btn primary vayu-about-cta-btn"
              onClick={() => handleNavigate('Overview')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <span>Return to Operations Dashboard</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="vayu-about-closing-meta">
            <span className="vayu-about-closing-brand">VAYU ORBIT</span>
            <span className="vayu-about-closing-sep" aria-hidden="true">·</span>
            <span className="vayu-about-closing-label">Demonstration Prototype</span>
            <span className="vayu-about-closing-sep" aria-hidden="true">·</span>
            <span className="vayu-about-closing-ver">Version 6.0.0</span>
          </div>

          <div className="vayu-about-signature">
            <div className="vayu-about-signature-line" aria-hidden="true" />
            <p className="vayu-about-signature-text">
              <span className="vayu-about-signature-entity">VAYU DYNAMICS</span>{' '}
              <span className="vayu-about-signature-copy">© 2026. All rights reserved.</span>
            </p>
          </div>
        </footer>

      </div>
    </div>
  );
}
