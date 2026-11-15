import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, User, CheckCircle2, ShieldCheck, KeyRound } from 'lucide-react';
import { api } from '../services/api';
import { resetPassword } from '../services/firebaseAuth';

/* ─────────────────────────────────────────────────────────────
   VAYU ORBIT — Tactical Operational Login Experience
   Design Principles:
   - Full-bleed operational terrain/corridor canvas.
   - Polished, accessible floating authentication panel.
   - Dynamic validation, password visibility toggling, clear error feedback.
   - Role quick-fill cards for Creator, Checkpoint, and Coordinator.
   - Robust Firebase Auth error handling with helpful guidance.
   ───────────────────────────────────────────────────────────── */

export default function Login({ onLoginSuccess }) {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [activeRole, setActiveRole]     = useState('coordinator');

  // Password reset state
  const [isResetMode, setIsResetMode]   = useState(false);
  const [resetEmail, setResetEmail]     = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetError, setResetError]     = useState('');

  // Email format validation helper
  const isEmailValid = (val) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your operator email address.');
      return;
    }
    if (!isEmailValid(cleanEmail)) {
      setError('Please enter a valid email address (e.g. coordinator@vayu.local).');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.login(cleanEmail, password);
      if (res?.user) {
        onLoginSuccess(res.user);
      } else {
        throw new Error('Session could not be established. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    const cleanResetEmail = resetEmail.trim();
    if (!cleanResetEmail) {
      setResetError('Enter your registered operator email to receive reset instructions.');
      return;
    }
    if (!isEmailValid(cleanResetEmail)) {
      setResetError('Enter a valid email address format.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    setResetSuccess('');
    try {
      await resetPassword(cleanResetEmail);
      setResetSuccess('Password reset link dispatched. Please check your operator inbox.');
    } catch (err) {
      setResetError(err.message || 'Failed to dispatch password reset link.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleSimFill = (roleKey, roleEmail) => {
    setActiveRole(roleKey);
    setEmail(roleEmail);
    setError('');
  };

  return (
    <div className="m-canvas">
      {/* ── Full-Bleed Corridor Canvas ── */}
      <div className="m-map" aria-hidden="true">
        <CorridorCanvas />
      </div>

      {/* ── Canvas Overlay: dark vignette + depth gradient ── */}
      <div className="m-vignette" />

      {/* ── Top-Left Brand Mark ── */}
      <header className="m-brand">
        <div className="m-brand-logo-wrap">
          <img src="/vayu.png" alt="VAYU ORBIT" className="m-brand-logo" />
        </div>
        <div className="m-brand-text">
          <span className="m-brand-name">VAYU ORBIT</span>
          <span className="m-brand-tag">Intelligence Around Every Journey</span>
        </div>
      </header>

      {/* ── Bottom-Left: Operational Copy ── */}
      <div className="m-strapline">
        <div className="m-badge-academic">
          <ShieldCheck size={13} className="m-badge-icon" />
          <span>Academic Evaluation Prototype v6.0.0</span>
        </div>
        <p className="m-strapline-hed">
          Route assessment, convoy coordination,<br />
          and tactical movement intelligence.
        </p>
        <p className="m-strapline-sub">
          School of Computer Science & Engineering · Problem Statement PDS-3
        </p>
      </div>

      {/* ── Floating Right-Panel: Authentication ── */}
      <aside className="m-panel" role="main" aria-label={isResetMode ? 'Password recovery' : 'Sign in'}>
        <div className="m-panel-inner">
          {isResetMode ? (
            <>
              <div className="m-panel-header">
                <span className="m-panel-eyebrow">Identity Recovery</span>
                <h1 className="m-panel-title">Reset password</h1>
                <p className="m-panel-desc">
                  Enter your registered operator email to receive password reset instructions via Firebase.
                </p>
              </div>

              {resetError && (
                <div className="m-alert m-alert--error" role="alert" aria-live="polite">
                  <AlertCircle size={15} className="m-alert-icon" />
                  <span>{resetError}</span>
                </div>
              )}

              {resetSuccess && (
                <div className="m-alert m-alert--success" role="status" aria-live="polite">
                  <CheckCircle2 size={15} className="m-alert-icon" />
                  <span>{resetSuccess}</span>
                </div>
              )}

              <form onSubmit={handleResetSubmit} className="m-form" noValidate>
                <div className="m-field">
                  <label htmlFor="m-reset-email" className="m-label">Operator email</label>
                  <div className="m-input-wrap">
                    <User size={15} className="m-input-icon" />
                    <input
                      id="m-reset-email"
                      type="email"
                      className="m-input"
                      placeholder="operator@vayu.local"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      autoFocus
                      disabled={resetLoading}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className={`m-submit${resetLoading ? ' m-submit--busy' : ''}`}
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <><Loader2 size={15} className="spin-icon" /><span>Dispatching…</span></>
                  ) : (
                    <><span>Send Reset Link</span><ArrowRight size={15} /></>
                  )}
                </button>

                <button
                  type="button"
                  className="m-btn-secondary"
                  onClick={() => {
                    setIsResetMode(false);
                    setResetSuccess('');
                    setResetError('');
                  }}
                >
                  Back to Sign in
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="m-panel-header">
                <span className="m-panel-eyebrow">Tactical Command Access</span>
                <h1 className="m-panel-title">Sign in</h1>
                <p className="m-panel-desc">
                  Authenticated access to route assessment and convoy management.
                </p>
              </div>

              {error && (
                <div className="m-alert m-alert--error" role="alert" aria-live="assertive">
                  <AlertCircle size={15} className="m-alert-icon" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="m-form" noValidate>
                <div className="m-field">
                  <div className="m-field-head">
                    <label htmlFor="m-email" className="m-label">Email or operator ID</label>
                    {emailTouched && email && !isEmailValid(email) && (
                      <span className="m-validation-hint">Invalid format</span>
                    )}
                  </div>
                  <div className={`m-input-wrap${emailTouched && email && !isEmailValid(email) ? ' m-input-wrap--invalid' : ''}`}>
                    <User size={15} className="m-input-icon" />
                    <input
                      id="m-email"
                      type="email"
                      className="m-input"
                      placeholder="operator@vayu.local"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError('');
                      }}
                      onBlur={() => setEmailTouched(true)}
                      autoComplete="username"
                      autoFocus
                      disabled={loading}
                      required
                      aria-invalid={emailTouched && email && !isEmailValid(email) ? 'true' : 'false'}
                    />
                  </div>
                </div>

                <div className="m-field">
                  <div className="m-field-head">
                    <label htmlFor="m-password" className="m-label">Password</label>
                    <button
                      type="button"
                      className="m-forgot-link"
                      onClick={() => {
                        setResetEmail(email);
                        setIsResetMode(true);
                        setError('');
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="m-input-wrap">
                    <Lock size={15} className="m-input-icon" />
                    <input
                      id="m-password"
                      type={showPassword ? 'text' : 'password'}
                      className="m-input m-input--pw"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError('');
                      }}
                      autoComplete="current-password"
                      disabled={loading}
                      required
                    />
                    <button
                      type="button"
                      className="m-pw-toggle"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={0}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className={`m-submit${loading ? ' m-submit--busy' : ''}`}
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? (
                    <><Loader2 size={15} className="spin-icon" /><span>Verifying credentials…</span></>
                  ) : (
                    <><span>Sign in to Console</span><ArrowRight size={15} /></>
                  )}
                </button>
              </form>

              {/* Operational identity selector — quick-switch role profiles */}
              <div className="m-sim">
                <div className="m-sim-header">
                  <KeyRound size={13} className="m-sim-icon" />
                  <span className="m-sim-label">Evaluation Role Profiles</span>
                </div>
                <div className="m-sim-row">
                  {[
                    ['coordinator', 'coordinator@vayu.local', 'Coordinator', 'Full Command'],
                    ['creator', 'creator@vayu.local', 'Creator', 'Convoy Planner'],
                    ['checkpoint', 'checkpoint@vayu.local', 'Checkpoint', 'Field Recon']
                  ].map(([key, roleEmail, label, roleDesc]) => (
                    <button
                      key={key}
                      type="button"
                      className={`m-sim-btn${email === roleEmail ? ' m-sim-btn--on' : ''}`}
                      onClick={() => handleSimFill(key, roleEmail)}
                      title={`${roleEmail} (${roleDesc})`}
                      aria-pressed={email === roleEmail}
                    >
                      <span className="m-sim-role-name">{label}</span>
                      <span className="m-sim-role-desc">{roleDesc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CorridorCanvas — hand-composed SVG.
   Depicts an abstract representation of tactical logistics corridors.
   ───────────────────────────────────────────────────────────── */
function CorridorCanvas() {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      className="m-map-svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="corr-a" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#668CA0" stopOpacity="0.0" />
          <stop offset="35%"  stopColor="#668CA0" stopOpacity="0.5" />
          <stop offset="75%"  stopColor="#9BBDCE" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#DBE1E9" stopOpacity="1.0" />
        </linearGradient>

        <linearGradient id="corr-b" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#668CA0" stopOpacity="0.0" />
          <stop offset="50%"  stopColor="#668CA0" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#9BBDCE" stopOpacity="0.6" />
        </linearGradient>

        <linearGradient id="corr-c" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#668CA0" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#DBE1E9" stopOpacity="0.7" />
        </linearGradient>

        <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#668CA0" stopOpacity="0.6" />
          <stop offset="50%"  stopColor="#668CA0" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#668CA0" stopOpacity="0.0" />
        </radialGradient>

        <filter id="node-blur">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Grid pattern background */}
      <pattern id="grid-dots" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="0.8" fill="rgba(102, 140, 160, 0.18)" />
      </pattern>
      <rect width="1440" height="900" fill="url(#grid-dots)" />

      {/* Subtle topographic contour lines */}
      <g stroke="rgba(102, 140, 160, 0.05)" strokeWidth="1" fill="none">
        <path d="M 320 200 Q 480 180 650 210 Q 780 230 870 260" />
        <path d="M 295 300 Q 450 270 620 290 Q 760 305 850 335" />
        <path d="M 275 400 Q 420 375 590 390 Q 730 405 815 435" />
        <path d="M 270 500 Q 400 480 560 492 Q 700 505 780 530" />
      </g>

      {/* Strategic Corridor Routes */}
      <path
        d="M 560 790 C 545 730, 530 660, 520 590 C 510 520, 505 460, 510 390 C 515 320, 530 260, 540 195"
        stroke="rgba(102, 140, 160, 0.12)"
        strokeWidth="2"
        strokeDasharray="6 5"
        fill="none"
      />
      <path
        d="M 560 790 C 545 730, 530 660, 520 590 C 510 520, 505 460, 510 390 C 515 320, 530 260, 540 195"
        stroke="url(#corr-a)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        className="m-route-primary"
      />

      <path
        d="M 490 700 C 460 640, 420 575, 390 505 C 360 435, 340 360, 335 285 C 330 215, 355 155, 390 110"
        stroke="rgba(102, 140, 160, 0.08)"
        strokeWidth="1.5"
        strokeDasharray="5 6"
        fill="none"
      />
      <path
        d="M 490 700 C 460 640, 420 575, 390 505 C 360 435, 340 360, 335 285 C 330 215, 355 155, 390 110"
        stroke="url(#corr-b)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
        className="m-route-secondary"
      />

      <path
        d="M 560 390 C 600 355, 650 330, 710 315 C 760 302, 810 300, 855 285"
        stroke="url(#corr-c)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        className="m-route-tertiary"
      />

      {/* Strategic Nodes */}
      <circle cx="560" cy="790" r="18" fill="url(#node-glow)" filter="url(#node-blur)" />
      <circle cx="560" cy="790" r="4"  fill="#668CA0" />
      <circle cx="560" cy="790" r="7"  stroke="rgba(102,140,160,0.45)" strokeWidth="1" fill="none" />
      <text x="575" y="788" fill="#4A6170" fontSize="10" fontFamily="'Share Tech Mono', monospace" letterSpacing="1">S-TERMINUS</text>

      <circle cx="510" cy="390" r="28" fill="url(#node-glow)" filter="url(#node-blur)" className="m-beacon" />
      <circle cx="510" cy="390" r="5.5" fill="#DBE1E9" />
      <circle cx="510" cy="390" r="10" stroke="rgba(190,210,220,0.4)" strokeWidth="1" fill="none" />
      <text x="525" y="388" fill="#9BBDCE" fontSize="11" fontWeight="600" fontFamily="'Share Tech Mono', monospace" letterSpacing="1">CENTRAL</text>
      <text x="525" y="402" fill="#4A6170" fontSize="9"  fontFamily="'Share Tech Mono', monospace" letterSpacing="0.5">JUNCTION</text>

      <circle cx="540" cy="195" r="20" fill="url(#node-glow)" filter="url(#node-blur)" />
      <circle cx="540" cy="195" r="4"  fill="#9BBDCE" />
      <circle cx="540" cy="195" r="8"  stroke="rgba(155,189,206,0.35)" strokeWidth="1" fill="none" />
      <text x="555" y="193" fill="#668CA0" fontSize="10" fontFamily="'Share Tech Mono', monospace" letterSpacing="1">N-HUB</text>

      <circle cx="855" cy="285" r="3.5" fill="#668CA0" />
      <circle cx="855" cy="285" r="7"   stroke="rgba(102,140,160,0.3)" strokeWidth="1" fill="none" />
      <text x="865" y="283" fill="#4A6170" fontSize="9" fontFamily="'Share Tech Mono', monospace" letterSpacing="1">E-BRANCH</text>

      <circle cx="390" cy="110" r="3.5" fill="#668CA0" />
      <circle cx="390" cy="110" r="7"   stroke="rgba(102,140,160,0.3)" strokeWidth="1" fill="none" />
      <text x="402" y="108" fill="#4A6170" fontSize="9" fontFamily="'Share Tech Mono', monospace" letterSpacing="1">W-TERMINAL</text>

      {/* Reference lines */}
      <line x1="200" y1="195" x2="1300" y2="195" stroke="rgba(102,140,160,0.04)" strokeWidth="1" />
      <line x1="200" y1="390" x2="1300" y2="390" stroke="rgba(102,140,160,0.04)" strokeWidth="1" />
      <line x1="200" y1="590" x2="1300" y2="590" stroke="rgba(102,140,160,0.04)" strokeWidth="1" />

      <text
        x="220" y="852"
        fill="rgba(74,97,112,0.6)"
        fontSize="10"
        fontFamily="'Share Tech Mono', monospace"
        letterSpacing="2"
      >
        TACTICAL LOGISTICS TRANSIT NETWORK — SIMULATION PROTOTYPE
      </text>
    </svg>
  );
}
