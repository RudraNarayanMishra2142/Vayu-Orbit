import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sliders,
  ChevronDown,
  ChevronUp,
  Activity,
  Layers,
  FileText,
  Clock,
  ArrowRight,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { api } from '../../services/api';

/**
 * Authoritative 10-parameter specification for VORAM v0.1
 */
export const VORAM_PARAMETERS = [
  { id: 'road_condition', name: 'Road Condition', weight: 15, desc: 'Surface degradation, pavement distress, and carriageway defects.' },
  { id: 'bridge_load_compatibility', name: 'Bridge & Load Compatibility', weight: 15, desc: 'Bridge classification, culvert load ceilings, and gross vehicle weight safety margins.' },
  { id: 'road_closure_access', name: 'Road Closure & Access Restrictions', weight: 12, desc: 'Confirmed physical closures, military access checkpoints, and route blockades.' },
  { id: 'flooding_waterlogging', name: 'Flooding & Waterlogging', weight: 12, desc: 'Monsoon inundation, riverine spillage, and low-lying water accumulation.' },
  { id: 'weather_impact', name: 'Weather Impact', weight: 10, desc: 'Precipitation intensity, visibility reduction (dense fog/dust), and high crosswinds.' },
  { id: 'terrain_gradient', name: 'Terrain & Gradient', weight: 8, desc: 'Incline steepness, switchback hairpin frequency, and narrow mountain pass friction.' },
  { id: 'road_width_clearance', name: 'Road Width & Clearance', weight: 8, desc: 'Carriageway width, vertical overhead clearance, and tight corner radius.' },
  { id: 'traffic_congestion', name: 'Traffic Congestion', weight: 7, desc: 'Civilian traffic density, commercial choke points, and bottleneck delays.' },
  { id: 'travel_time_variability', name: 'Travel-Time Variability', weight: 5, desc: 'Transit time predictability, checkpoint hold times, and corridor delay dispersion.' },
  { id: 'logistics_support_availability', name: 'Logistics Support Availability', weight: 8, desc: 'Proximity to military supply depots, recovery workshops, and refuelling stations.' }
];

export function getVoramCategoryInfo(score, categoryName) {
  if (score == null && !categoryName) {
    return {
      label: 'Unassessed / Incomplete',
      badgeClass: 'unknown',
      color: 'var(--text-muted)',
      bg: 'rgba(148, 163, 184, 0.12)',
      border: 'rgba(148, 163, 184, 0.35)'
    };
  }

  const s = Number(score);
  const cat = (categoryName || '').toLowerCase();

  if (cat.includes('low') || (!categoryName && s < 25)) {
    return {
      label: 'Low Concern',
      badgeClass: 'low-concern',
      color: '#8ED8F8', // Approved Ice Blue
      bg: 'rgba(142, 216, 248, 0.12)',
      border: 'rgba(142, 216, 248, 0.40)'
    };
  }
  if (cat.includes('moderate') || (!categoryName && s < 50)) {
    return {
      label: 'Moderate Concern',
      badgeClass: 'moderate-concern',
      color: '#F48CA0', // Approved Coral Pink
      bg: 'rgba(244, 140, 160, 0.12)',
      border: 'rgba(244, 140, 160, 0.40)'
    };
  }
  if (cat.includes('high') && !cat.includes('critical') || (!categoryName && s < 75)) {
    return {
      label: 'High Concern',
      badgeClass: 'high-concern',
      color: '#AB1D79', // Approved Berry
      bg: 'rgba(171, 29, 121, 0.15)',
      border: 'rgba(171, 29, 121, 0.45)'
    };
  }
  return {
    label: 'Critical Concern',
    badgeClass: 'critical-concern',
    color: '#A10F18', // Approved Deep Red
    bg: 'rgba(161, 15, 24, 0.18)',
    border: 'rgba(161, 15, 24, 0.50)'
  };
}

export function getStatusExplanation(status) {
  switch (status) {
    case 'PASS_WITHIN_TESTED_RULES':
      return {
        title: 'Passed Tested Rules',
        text: 'The route passed the implemented and tested rules for available inputs. This does not constitute an operational safety certificate.',
        type: 'ok',
        icon: ShieldCheck
      };
    case 'FAIL':
      return {
        title: 'Mandatory Constraint Failure',
        text: 'The route violates one or more mandatory physical constraints (e.g. confirmed road closure or bridge load capacity). This corridor is ineligible.',
        type: 'bad',
        icon: XCircle
      };
    case 'UNKNOWN':
      return {
        title: 'Incomplete Telemetry',
        text: 'Eligibility cannot be established because required telemetry (e.g. hydrological flood sensors, live GPS variability, or weather satellite feeds) is unrecorded.',
        type: 'unknown',
        icon: HelpCircle
      };
    case 'REVIEW_REQUIRED':
      return {
        title: 'Tactical Review Required',
        text: 'Conflicting or unverified intelligence reports were detected across sources. Human tactical review is mandatory before clearing movement.',
        type: 'warn',
        icon: AlertTriangle
      };
    case 'MODEL_ERROR':
      return {
        title: 'Model Evaluation Error',
        text: 'The corridor risk assessment could not be computed due to disconnected nodes, missing edges, or invalid convoy parameters.',
        type: 'bad',
        icon: ShieldAlert
      };
    default:
      return {
        title: status ? `Status: ${status}` : 'Status Pending',
        text: 'Awaiting verified risk assessment telemetry from the tactical routing engine.',
        type: 'unknown',
        icon: Info
      };
  }
}

/**
 * Main VORAM v0.1 Assessment Panel
 */
export default function VoramAssessmentPanel({
  assessment,
  selectedRoute,
  onRecalculate,
  isLoading = false,
  error = null
}) {
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simParams, setSimParams] = useState({});
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState(null);

  const voram = assessment || selectedRoute?.voram_assessment || null;

  const score = voram?.risk_score != null ? Number(voram.risk_score) : null;
  const status = voram?.assessment_status || 'UNKNOWN';
  const categoryName = voram?.risk_category;
  const categoryInfo = getVoramCategoryInfo(score, categoryName);
  const statusInfo = getStatusExplanation(status);
  const StatusIcon = statusInfo.icon;

  const constraintFindings = voram?.constraint_findings || [];
  const mandatoryFailures = constraintFindings.filter(
    (c) => c.status === 'FAIL' || c.is_ineligible
  );
  const missingParams = voram?.missing_parameters || [];
  const highestConcern = voram?.highest_concern_segment || null;

  // Derive parameter data mapping
  const paramMap = useMemo(() => {
    const map = {};
    if (voram?.parameters && Array.isArray(voram.parameters)) {
      voram.parameters.forEach((p) => {
        map[p.id] = p;
      });
    }
    return map;
  }, [voram?.parameters]);

  // Run on-demand standalone simulation
  const handleRunSimulation = async () => {
    setSimLoading(true);
    setSimError(null);
    try {
      const payload = {
        parameters: { ...simParams }
      };
      const res = await api.voramAssess(payload);
      setSimResult(res);
    } catch (err) {
      setSimError(err.message || 'Simulation request failed.');
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="voram-panel-container">
      {/* ── HEADER BANNER ────────────────────────────────────────── */}
      <div className="voram-header-bar">
        <div className="voram-header-left">
          <div className="voram-title-row">
            <span className="voram-kicker">DECISION SUPPORT HEURISTIC</span>
            <span className="voram-version-tag">VORAM v0.1</span>
          </div>
          <h3 className="voram-main-title">VAYU ORBIT Risk Assessment Model</h3>
        </div>

        <div className="voram-header-right">
          {selectedRoute?.mode && (
            <span className="voram-mode-pill">
              CORRIDOR: <b>{selectedRoute.mode.replace('_', ' ').toUpperCase()}</b>
            </span>
          )}
          {voram?.assessed_at && (
            <span className="voram-timestamp">
              <Clock size={11} /> {new Date(voram.assessed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* ── CRITICAL MANDATORY CONSTRAINT ALERT (Hard Precedence) ──── */}
      {mandatoryFailures.length > 0 && (
        <div className="voram-hard-constraint-banner">
          <div className="voram-constraint-icon-col">
            <ShieldAlert size={22} color="var(--bad)" />
          </div>
          <div className="voram-constraint-content">
            <div className="voram-constraint-header">
              <span className="voram-constraint-badge">CORRIDOR INELIGIBLE</span>
              <span className="voram-constraint-count">{mandatoryFailures.length} Mandatory Violation(s)</span>
            </div>
            <div className="voram-constraint-title">
              Mandatory Physical Constraint Violated
            </div>
            <div className="voram-constraint-desc">
              A low numerical score never overrides a mandatory physical restriction. This corridor cannot be cleared for movement.
            </div>
            <div className="voram-constraint-list">
              {mandatoryFailures.map((f, i) => (
                <div key={i} className="voram-constraint-item">
                  <span className="voram-constraint-item-type">{f.constraint_type}:</span>
                  <span className="voram-constraint-item-reason">{f.reason}</span>
                  {f.affected_segment && (
                    <span className="voram-constraint-item-seg">[{f.affected_segment}]</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SUMMARY SCORECARD GRID ───────────────────────────────── */}
      <div className="voram-scorecard-grid">
        {/* Card 1: Score & Provisional Category */}
        <div className="voram-card voram-score-card">
          <div className="voram-card-kicker">COMPOSITE RISK CONCERN</div>
          <div className="voram-score-row">
            <div className="voram-score-number" style={{ color: categoryInfo.color }}>
              {score != null ? score.toFixed(1) : '—'}
            </div>
            <div className="voram-score-denom">/ 100</div>
          </div>

          <div
            className="voram-category-badge"
            style={{
              color: categoryInfo.color,
              background: categoryInfo.bg,
              borderColor: categoryInfo.border
            }}
          >
            <Activity size={12} />
            <span>{categoryInfo.label}</span>
          </div>

          <div className="voram-score-caption">
            {score != null
              ? 'Computed via 10-parameter weighted mean with corridor safeguard.'
              : 'Complete numerical score withheld due to unmeasured parameters.'}
          </div>
        </div>

        {/* Card 2: Assessment Outcome State */}
        <div className="voram-card voram-status-card">
          <div className="voram-card-kicker">MODEL EVALUATION STATE</div>
          <div className="voram-status-row">
            <StatusIcon size={20} color={categoryInfo.color} />
            <span className="voram-status-title" style={{ color: categoryInfo.color }}>
              {statusInfo.title}
            </span>
          </div>
          <div className="voram-status-raw-code">STATE CODE: {status}</div>
          <div className="voram-status-explanation">{statusInfo.text}</div>
        </div>

        {/* Card 3: Dominant Hazard / Bottleneck Segment */}
        <div className="voram-card voram-bottleneck-card">
          <div className="voram-card-kicker">HIGHEST CONCERN SEGMENT</div>
          {highestConcern ? (
            <div>
              <div className="voram-bottleneck-nodes">
                <span className="voram-node-pill">{highestConcern.from_node}</span>
                <ArrowRight size={12} color="var(--text-muted)" />
                <span className="voram-node-pill active">{highestConcern.to_node}</span>
              </div>
              <div className="voram-bottleneck-meta">
                <span>Peak Parameter: <b style={{ color: 'var(--warn)' }}>{highestConcern.peak_parameter_score ?? '—'}</b></span>
                {highestConcern.risk_category && (
                  <span className="voram-meta-cat">({highestConcern.risk_category})</span>
                )}
              </div>
              {highestConcern.reasons && highestConcern.reasons.length > 0 && (
                <div className="voram-bottleneck-reason">
                  {highestConcern.reasons[0]}
                </div>
              )}
            </div>
          ) : (
            <div className="voram-bottleneck-empty">
              No single bottleneck segment elevated above baseline corridor variance.
            </div>
          )}
        </div>
      </div>

      {/* ── UNRECORDED / MISSING TELEMETRY NOTICE ──────────────────── */}
      {missingParams.length > 0 && (
        <div className="voram-missing-telemetry-notice">
          <div className="voram-notice-icon">
            <Info size={16} color="var(--warn)" />
          </div>
          <div className="voram-notice-text">
            <strong>Honest Telemetry Reporting:</strong> Physical sensors for{' '}
            <span className="voram-missing-tag-list">
              {missingParams.map((p) => p.replace('_', ' ')).join(', ')}
            </span>{' '}
            are unrecorded in the baseline database. Unmeasured telemetry is marked{' '}
            <b>UNRECORDED</b> and is never assumed to represent zero risk.
          </div>
        </div>
      )}

      {/* ── 10-PARAMETER DETAILED BREAKDOWN ACCORDION ─────────────── */}
      <div className="voram-breakdown-section">
        <div
          className="voram-section-toggle"
          onClick={() => setShowBreakdown((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setShowBreakdown((prev) => !prev);
          }}
          aria-expanded={showBreakdown}
        >
          <div className="voram-toggle-left">
            <Layers size={14} color="var(--accent)" />
            <span className="voram-toggle-title">Ten Operational Parameters Breakdown (100% Total Weight)</span>
          </div>
          <div className="voram-toggle-right">
            <span className="voram-toggle-hint">
              {showBreakdown ? 'Collapse' : 'Expand Details'}
            </span>
            {showBreakdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {showBreakdown && (
          <div className="voram-breakdown-table-wrapper">
            <table className="voram-param-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Parameter</th>
                  <th style={{ width: '10%' }}>Weight</th>
                  <th style={{ width: '14%' }}>Reported Score</th>
                  <th style={{ width: '18%' }}>Weighted Contrib.</th>
                  <th style={{ width: '15%' }}>Evidence State</th>
                  <th style={{ width: '15%' }}>Context / Reason</th>
                </tr>
              </thead>
              <tbody>
                {VORAM_PARAMETERS.map((pDef) => {
                  const rec = paramMap[pDef.id];
                  const rawScore = rec?.score;
                  const isMissing = rec?.is_missing || rawScore == null;
                  const evState = rec?.evidence_state || (isMissing ? 'MISSING' : 'VERIFIED');
                  const weightedContrib =
                    !isMissing && typeof rawScore === 'number'
                      ? (rawScore * (pDef.weight / 100)).toFixed(2)
                      : null;

                  return (
                    <tr key={pDef.id} className={isMissing ? 'row-missing' : 'row-active'}>
                      <td>
                        <div className="voram-td-name">
                          <b>{pDef.name}</b>
                        </div>
                        <div className="voram-td-desc">{pDef.desc}</div>
                      </td>

                      <td>
                        <span className="voram-weight-pill">{pDef.weight}%</span>
                      </td>

                      <td>
                        {isMissing ? (
                          <span className="voram-score-missing">UNRECORDED</span>
                        ) : (
                          <div className="voram-score-cell">
                            <span className="voram-score-val">{Number(rawScore).toFixed(1)}</span>
                            <div className="voram-mini-bar-bg">
                              <div
                                className="voram-mini-bar-fill"
                                style={{
                                  width: `${Math.min(100, Math.max(0, rawScore))}%`,
                                  background:
                                    rawScore >= 75
                                      ? 'var(--bad)'
                                      : rawScore >= 50
                                      ? '#AB1D79'
                                      : rawScore >= 25
                                      ? 'var(--warn)'
                                      : 'var(--accent)'
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      <td>
                        {weightedContrib != null ? (
                          <span className="voram-contrib-val">+{weightedContrib} pts</span>
                        ) : (
                          <span className="voram-dash">—</span>
                        )}
                      </td>

                      <td>
                        <span className={`voram-evidence-badge ${evState.toLowerCase()}`}>
                          {evState}
                        </span>
                      </td>

                      <td>
                        <span className="voram-context-note">
                          {rec?.status_note || (isMissing ? 'Telemetry offline' : 'Verified sensor')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile Card Layout for Narrow Screens */}
            <div className="voram-mobile-cards-list">
              {VORAM_PARAMETERS.map((pDef) => {
                const rec = paramMap[pDef.id];
                const rawScore = rec?.score;
                const isMissing = rec?.is_missing || rawScore == null;
                const evState = rec?.evidence_state || (isMissing ? 'MISSING' : 'VERIFIED');
                const weightedContrib =
                  !isMissing && typeof rawScore === 'number'
                    ? (rawScore * (pDef.weight / 100)).toFixed(2)
                    : null;

                return (
                  <div key={pDef.id} className={`voram-mobile-card ${isMissing ? 'missing' : ''}`}>
                    <div className="voram-mc-top">
                      <div className="voram-mc-name">{pDef.name}</div>
                      <span className="voram-weight-pill">{pDef.weight}%</span>
                    </div>

                    <div className="voram-mc-middle">
                      <div className="voram-mc-score">
                        {isMissing ? (
                          <span className="voram-score-missing">UNRECORDED</span>
                        ) : (
                          <>
                            Score: <b>{Number(rawScore).toFixed(1)}</b> / 100
                            {weightedContrib && (
                              <span className="voram-mc-contrib">(+{weightedContrib} pts)</span>
                            )}
                          </>
                        )}
                      </div>

                      <span className={`voram-evidence-badge ${evState.toLowerCase()}`}>
                        {evState}
                      </span>
                    </div>

                    <div className="voram-mc-desc">{pDef.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── INTERACTIVE LIVE PARAMETER EXPLORER / SIMULATOR ────────── */}
      <div className="voram-simulator-drawer">
        <div
          className="voram-sim-header"
          onClick={() => setShowSimulator((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setShowSimulator((prev) => !prev);
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sliders size={13} color="var(--accent)" />
            <span style={{ fontWeight: 600, fontSize: 12 }}>
              VORAM v0.1 Live Parameter Sensitivity Simulator
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
            {showSimulator ? 'Close Simulator' : 'Test Custom Parameters'}
          </span>
        </div>

        {showSimulator && (
          <div className="voram-sim-body">
            <div className="voram-sim-intro">
              Simulate hypothetical operational conditions against the live backend endpoint{' '}
              <code>POST /api/voram/assess</code>. Sliders adjust parameter concerns from 0 to 100.
            </div>

            <div className="voram-sim-sliders-grid">
              {VORAM_PARAMETERS.map((p) => {
                const val = simParams[p.id] != null ? simParams[p.id] : 25;
                return (
                  <div key={p.id} className="voram-slider-item">
                    <div className="voram-slider-label">
                      <span>{p.name} ({p.weight}%)</span>
                      <b style={{ fontFamily: 'monospace' }}>{val}</b>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={val}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setSimParams((prev) => ({ ...prev, [p.id]: n }));
                      }}
                      className="voram-range-input"
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
              <button
                type="button"
                className="btn primary"
                disabled={simLoading}
                onClick={handleRunSimulation}
                style={{ fontSize: 12, padding: '7px 14px' }}
              >
                {simLoading ? 'Evaluating Model…' : 'Compute Live VORAM Assessment'}
              </button>

              <button
                type="button"
                className="btn"
                onClick={() => {
                  const reset = {};
                  VORAM_PARAMETERS.forEach((p) => {
                    reset[p.id] = 20;
                  });
                  setSimParams(reset);
                  setSimResult(null);
                }}
                style={{ fontSize: 12, padding: '7px 12px' }}
              >
                Reset Sliders
              </button>
            </div>

            {simError && (
              <div className="alert" style={{ marginTop: 10, fontSize: 11 }}>
                <AlertTriangle size={14} style={{ marginRight: 6 }} />
                {simError}
              </div>
            )}

            {simResult && (
              <div className="voram-sim-result-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span className="kicker">Live Simulation Result</span>
                  <span className={`pill ${simResult.risk_score >= 50 ? 'bad' : simResult.risk_score >= 25 ? 'warn' : 'ok'}`}>
                    {simResult.risk_category}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 20, fontFamily: 'monospace', fontSize: 12 }}>
                  <div>Score: <b>{simResult.risk_score}</b></div>
                  <div>Weighted Mean: <b>{simResult.weighted_mean}</b></div>
                  <div>Peak Parameter: <b>{simResult.max_parameter_score}</b></div>
                  <div>Safeguard ({simResult.safeguard_coefficient}x): <b>{simResult.safeguard_value}</b></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── COMPREHENSIVE EXPERIMENTAL DISCLAIMER ─────────────────── */}
      <div className="voram-disclaimer-card">
        <div className="voram-disclaimer-header">
          <Info size={12} color="var(--accent)" />
          <span>EXPERIMENTAL MODEL GOVERNANCE & RISK NOTICE</span>
        </div>
        <p className="voram-disclaimer-text">
          VORAM v0.1 is an experimental decision-support heuristic. Its mathematical weights, thresholds,
          and safeguard factor (0.8) have not been empirically validated or calibrated on live operational
          military operational data. A passing status (<code>PASS_WITHIN_TESTED_RULES</code>) indicates
          compliance with tested rules only and does NOT constitute a certificate of tactical safety.
        </p>
      </div>
    </div>
  );
}
