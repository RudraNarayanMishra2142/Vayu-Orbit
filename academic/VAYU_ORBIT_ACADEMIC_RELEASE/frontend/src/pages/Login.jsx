import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, User } from 'lucide-react';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────
   VAYU ORBIT — MERIDIAN Login Experience
   Concept: Full-bleed operational canvas with floating auth panel.
   A large-scale India corridor geography SVG covers the entire 
   viewport. The login panel floats over it — no column partition.
   Brand is top-left, anchored to the canvas.
   ───────────────────────────────────────────────────────────── */

export default function Login({ onLoginSuccess }) {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your operator email and password to continue.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.login(email.trim(), password);
      if (res?.user) {
        onLoginSuccess(res.user);
      } else {
        throw new Error('Session could not be established. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSimFill = (roleEmail) => {
    setEmail(roleEmail);
    setPassword('VayuOrbit@2026');
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
        <p className="m-strapline-hed">
          Route assessment, convoy coordination,<br />
          and movement intelligence.
        </p>
        <p className="m-strapline-sub">VAYU ORBIT Decision Support System — Armed Forces Logistics v6.0.0</p>
      </div>

      {/* ── Floating Right-Panel: Authentication ── */}
      <aside className="m-panel" role="main" aria-label="Sign in">
        <div className="m-panel-inner">
          <div className="m-panel-header">
            <span className="m-panel-eyebrow">Operator Access</span>
            <h1 className="m-panel-title">Sign in</h1>
          </div>

          {error && (
            <div className="m-alert" role="alert">
              <AlertCircle size={15} className="m-alert-icon" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="m-form" noValidate>
            <div className="m-field">
              <label htmlFor="m-email" className="m-label">Email or operator ID</label>
              <div className="m-input-wrap">
                <User size={15} className="m-input-icon" />
                <input
                  id="m-email"
                  type="email"
                  className="m-input"
                  placeholder="operator@vayu.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="m-field">
              <label htmlFor="m-password" className="m-label">Password</label>
              <div className="m-input-wrap">
                <Lock size={15} className="m-input-icon" />
                <input
                  id="m-password"
                  type={showPassword ? 'text' : 'password'}
                  className="m-input m-input--pw"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="m-pw-toggle"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className={`m-submit${loading ? ' m-submit--busy' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <><Loader2 size={15} className="spin-icon" /><span>Verifying…</span></>
              ) : (
                <><span>Continue</span><ArrowRight size={15} /></>
              )}
            </button>
          </form>

          {/* Operational identity selector — quick-switch role profiles */}
          <div className="m-sim">
            <span className="m-sim-label">Operational role profiles</span>
            <div className="m-sim-row">
              {[
                ['creator@vayu.local', 'Creator'],
                ['checkpoint@vayu.local', 'Checkpoint'],
                ['coordinator@vayu.local', 'Coordinator'],
              ].map(([roleEmail, label]) => (
                <button
                  key={roleEmail}
                  type="button"
                  className={`m-sim-btn${email === roleEmail ? ' m-sim-btn--on' : ''}`}
                  onClick={() => handleSimFill(roleEmail)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CorridorCanvas — hand-composed SVG.
   
   Depicts an abstract representation of the Indian subcontinent
   silhouette and key logistics corridors (NH1, NH44, NH48) as
   clean vector paths. This is a DESIGNED ILLUSTRATION, not a 
   geographic data layer or live operational map.
   
   Landmarks are illustrative nodes, not actual military assets.
   The outline is a simplified artistic representation.
   ───────────────────────────────────────────────────────────── */
function CorridorCanvas() {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      className="m-map-svg"
    >
      <defs>
        {/* Main corridor route gradient — bottom-left to top-right */}
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

        <linearGradient id="corr-c" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#668CA0" stopOpacity="0.0" />
          <stop offset="60%"  stopColor="#668CA0" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#7DA1AC" stopOpacity="0.5" />
        </linearGradient>

        {/* Subcontinent silhouette gradient */}
        <radialGradient id="land-fill" cx="40%" cy="55%" r="60%">
          <stop offset="0%"   stopColor="#0D1520" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#05080F" stopOpacity="0.6" />
        </radialGradient>

        {/* Ambient glow at top-right for Himalayan region */}
        <radialGradient id="himal-glow" cx="70%" cy="10%" r="45%">
          <stop offset="0%"   stopColor="#668CA0" stopOpacity="0.09" />
          <stop offset="100%" stopColor="#668CA0" stopOpacity="0.0" />
        </radialGradient>

        {/* Glow for active node */}
        <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#9BBDCE" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#668CA0" stopOpacity="0.0" />
        </radialGradient>

        {/* Clip path for the subcontinent outline */}
        <clipPath id="india-clip">
          <path d="
            M 290 80
            C 340 60, 430 55, 510 70
            C 590 85, 660 95, 720 85
            C 790 75, 840 62, 880 80
            C 930 100, 940 140, 920 175
            C 905 205, 875 220, 870 255
            C 865 285, 885 310, 875 340
            C 865 370, 840 380, 830 405
            C 820 430, 825 455, 810 480
            C 795 510, 770 530, 755 565
            C 738 600, 735 635, 710 660
            C 685 685, 650 700, 630 730
            C 612 757, 608 785, 590 800
            C 575 815, 555 815, 540 800
            C 525 785, 520 760, 505 740
            C 488 718, 460 710, 440 690
            C 418 668, 408 640, 395 615
            C 380 588, 360 568, 348 540
            C 335 510, 330 478, 320 448
            C 308 415, 290 390, 280 360
            C 270 330, 272 300, 265 270
            C 258 240, 242 215, 240 185
            C 238 155, 250 125, 265 100
            Z
          " />
        </clipPath>

        <filter id="node-blur" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* ── Background ambient layers ── */}
      <rect width="1440" height="900" fill="#05080F" />
      <ellipse cx="1050" cy="130" rx="520" ry="300" fill="url(#himal-glow)" />
      <ellipse cx="200" cy="800" rx="350" ry="200" fill="rgba(102,140,160,0.025)" />

      {/* ── Subcontinent silhouette ── */}
      <path
        d="
          M 290 80
          C 340 60, 430 55, 510 70
          C 590 85, 660 95, 720 85
          C 790 75, 840 62, 880 80
          C 930 100, 940 140, 920 175
          C 905 205, 875 220, 870 255
          C 865 285, 885 310, 875 340
          C 865 370, 840 380, 830 405
          C 820 430, 825 455, 810 480
          C 795 510, 770 530, 755 565
          C 738 600, 735 635, 710 660
          C 685 685, 650 700, 630 730
          C 612 757, 608 785, 590 800
          C 575 815, 555 815, 540 800
          C 525 785, 520 760, 505 740
          C 488 718, 460 710, 440 690
          C 418 668, 408 640, 395 615
          C 380 588, 360 568, 348 540
          C 335 510, 330 478, 320 448
          C 308 415, 290 390, 280 360
          C 270 330, 272 300, 265 270
          C 258 240, 242 215, 240 185
          C 238 155, 250 125, 265 100
          Z
        "
        fill="url(#land-fill)"
        stroke="rgba(102, 140, 160, 0.2)"
        strokeWidth="1"
      />

      {/* ── Internal geographic suggestion lines ── */}
      {/* These are ILLUSTRATIVE only — stylized contour lines, not actual data */}
      <g opacity="0.06" stroke="#668CA0" strokeWidth="0.5" fill="none">
        <path d="M 330 200 Q 500 170 680 195 Q 800 210 870 240" />
        <path d="M 295 300 Q 450 270 620 290 Q 760 305 850 335" />
        <path d="M 275 400 Q 420 375 590 390 Q 730 405 815 435" />
        <path d="M 270 500 Q 400 480 560 492 Q 700 505 780 530" />
      </g>

      {/* ── Strategic Corridor Routes (Illustrative) ── */}
      {/* Primary: North-South Axis — Golden Quadrilateral analogue */}
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

      {/* Secondary: Western corridor */}
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

      {/* Tertiary: North-east spur */}
      <path
        d="M 560 390 C 600 355, 650 330, 710 315 C 760 302, 810 300, 855 285"
        stroke="url(#corr-c)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        className="m-route-tertiary"
      />

      {/* Cross-link */}
      <path
        d="M 510 450 Q 575 440 640 460"
        stroke="rgba(102, 140, 160, 0.15)"
        strokeWidth="1"
        strokeDasharray="3 5"
        fill="none"
      />

      {/* ── Strategic Nodes (Illustrative Locations) ── */}
      {/* Node: South Terminal */}
      <circle cx="560" cy="790" r="18" fill="url(#node-glow)" filter="url(#node-blur)" />
      <circle cx="560" cy="790" r="4"  fill="#668CA0" />
      <circle cx="560" cy="790" r="7"  stroke="rgba(102,140,160,0.45)" strokeWidth="1" fill="none" />
      <text x="575" y="788" fill="#4A6170" fontSize="10" fontFamily="'Share Tech Mono', monospace" letterSpacing="1">S-TERMINUS</text>

      {/* Node: Central Junction — Primary */}
      <circle cx="510" cy="390" r="28" fill="url(#node-glow)" filter="url(#node-blur)" className="m-beacon" />
      <circle cx="510" cy="390" r="5.5" fill="#DBE1E9" />
      <circle cx="510" cy="390" r="10" stroke="rgba(190,210,220,0.4)" strokeWidth="1" fill="none" />
      <text x="525" y="388" fill="#9BBDCE" fontSize="11" fontWeight="600" fontFamily="'Share Tech Mono', monospace" letterSpacing="1">CENTRAL</text>
      <text x="525" y="402" fill="#4A6170" fontSize="9"  fontFamily="'Share Tech Mono', monospace" letterSpacing="0.5">JUNCTION</text>

      {/* Node: Northern Hub */}
      <circle cx="540" cy="195" r="20" fill="url(#node-glow)" filter="url(#node-blur)" />
      <circle cx="540" cy="195" r="4"  fill="#9BBDCE" />
      <circle cx="540" cy="195" r="8"  stroke="rgba(155,189,206,0.35)" strokeWidth="1" fill="none" />
      <text x="555" y="193" fill="#668CA0" fontSize="10" fontFamily="'Share Tech Mono', monospace" letterSpacing="1">N-HUB</text>

      {/* Node: Eastern Branch */}
      <circle cx="855" cy="285" r="3.5" fill="#668CA0" />
      <circle cx="855" cy="285" r="7"   stroke="rgba(102,140,160,0.3)" strokeWidth="1" fill="none" />
      <text x="865" y="283" fill="#4A6170" fontSize="9" fontFamily="'Share Tech Mono', monospace" letterSpacing="1">E-BRANCH</text>

      {/* Node: Western Terminal */}
      <circle cx="390" cy="110" r="3.5" fill="#668CA0" />
      <circle cx="390" cy="110" r="7"   stroke="rgba(102,140,160,0.3)" strokeWidth="1" fill="none" />
      <text x="402" y="108" fill="#4A6170" fontSize="9" fontFamily="'Share Tech Mono', monospace" letterSpacing="1">W-TERMINAL</text>

      {/* ── Horizontal reference lines across the canvas ── */}
      {/* These are visual structure lines, not geographic data */}
      <line x1="200" y1="195" x2="1300" y2="195" stroke="rgba(102,140,160,0.04)" strokeWidth="1" />
      <line x1="200" y1="390" x2="1300" y2="390" stroke="rgba(102,140,160,0.04)" strokeWidth="1" />
      <line x1="200" y1="590" x2="1300" y2="590" stroke="rgba(102,140,160,0.04)" strokeWidth="1" />

      {/* ── Map legend line ── */}
      <text
        x="220" y="852"
        fill="rgba(74,97,112,0.6)"
        fontSize="10"
        fontFamily="'Share Tech Mono', monospace"
        letterSpacing="2"
      >
        ILLUSTRATIVE CORRIDOR MAP — NOT OPERATIONAL DATA
      </text>
    </svg>
  );
}
