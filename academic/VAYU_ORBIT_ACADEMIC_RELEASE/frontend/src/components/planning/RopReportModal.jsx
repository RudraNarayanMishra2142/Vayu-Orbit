import React, { useState } from 'react';
import {
  X,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
  Layers,
  HelpCircle,
  Save,
  Send,
  Loader2,
  Info,
  ChevronLeft,
  ChevronRight,
  ClipboardList
} from 'lucide-react';
import { VORAM_PARAMETERS } from './VoramAssessmentPanel';
import { api } from '../../services/api';

const OBSERVATION_STATUSES = [
  { value: 'OBSERVED', label: 'Observed (Recorded on ground)', desc: 'Direct empirical observation by forward reconnaissance party' },
  { value: 'CONFIRMED', label: 'Confirmed (Cross-checked)', desc: 'Confirmed by multiple sources or physical engineering inspection' },
  { value: 'NOT_OBSERVED', label: 'Not Observed (No hazard noted)', desc: 'No active hazard observed along inspected sector (does not certify total absence)' },
  { value: 'UNKNOWN', label: 'Unknown (Sector uninspected)', desc: 'Reconnaissance could not survey this parameter' },
  { value: 'NOT_ASSESSED', label: 'Not Assessed (Outside scope)', desc: 'Parameter not assessed during this patrol' },
  { value: 'CONFLICTING', label: 'Conflicting Information', desc: 'Discrepant reports between ground party and intelligence sweeps' }
];

const RECON_SOURCES = [
  { value: 'PATROL_RECON', label: 'Patrol Reconnaissance (Ground Team)' },
  { value: 'PHYSICAL_INSPECTION', label: 'Physical Engineering Inspection' },
  { value: 'UAV_SURVEILLANCE', label: 'UAV / Aerial Surveillance Sweep' },
  { value: 'GROUND_CREW', label: 'Forward Checkpoint Crew' },
  { value: 'CIVIL_NOTICE', label: 'Civil Administration / Highway SITREP' }
];

// Presets for quick operational assessment
const PARAMETER_PRESETS = {
  road_condition: [
    { label: 'Paved & Smooth (Good Condition)', rating: 10, status: 'OBSERVED', desc: 'Carriageway asphalt intact, clear lane markings, no distress.' },
    { label: 'Minor Surface Wear / Potholes', rating: 30, status: 'OBSERVED', desc: 'Minor surface cracking and intermittent potholes on shoulder.' },
    { label: 'Severe Degradation / Rough Sector', rating: 65, status: 'OBSERVED', desc: 'Deep rutting, rough unpaved detour, convoy speed restricted.' },
    { label: 'Impassable / Washed Out Sector', rating: 95, status: 'OBSERVED', desc: 'Critical surface destruction; high risk of vehicle immobilization.' }
  ],
  bridge_load_compatibility: [
    { label: 'Bridge Intact & Cleared (>40t capacity)', rating: 5, status: 'CONFIRMED', desc: 'Military load class verified; no structural deflection noted.' },
    { label: 'Load Limit Marginal (Caution required)', rating: 40, status: 'OBSERVED', desc: 'Bridge capacity close to governing convoy axle load; single vehicle transit.' },
    { label: 'Structural Cracks / Restricted Limit', rating: 85, status: 'OBSERVED', desc: 'Spall damage or load restriction signposted; potential structural risk.' }
  ],
  road_closure_access: [
    { label: 'Clear & Open Transit Corridor', rating: 0, status: 'CONFIRMED', desc: 'Corridor fully open to military traffic, no blockades.' },
    { label: 'Security Checkpoint Delays (15-30m)', rating: 25, status: 'OBSERVED', desc: 'Controlled access checkpoint; identity and payload checks in effect.' },
    { label: 'Civil Curfew / Route Blockade Active', rating: 95, status: 'OBSERVED', desc: 'Confirmed physical road closure or civil movement restriction.' }
  ],
  flooding_waterlogging: [
    { label: 'Dry Roadbed / Effective Drainage', rating: 5, status: 'OBSERVED', desc: 'No standing water, culverts flowing freely.' },
    { label: 'Minor Shoulder Water Accumulation', rating: 25, status: 'OBSERVED', desc: 'Waterlogging on road shoulders; main carriageway passable.' },
    { label: 'Submerged Causeway / High Water (>0.5m)', rating: 75, status: 'OBSERVED', desc: 'Heavy inundation; fording depth limits exceeded for light vehicles.' },
    { label: 'Flash Flood Washout / Severe Inundation', rating: 95, status: 'OBSERVED', desc: 'Torrential riverine spillage across corridor; road impassable.' }
  ],
  weather_impact: [
    { label: 'Clear Skies & Normal Temperature', rating: 10, status: 'OBSERVED', desc: 'Visibility >10km, dry tarmac, optimal transit weather.' },
    { label: 'Dense Fog / Heavy Rain (Visibility <500m)', rating: 45, status: 'OBSERVED', desc: 'Reduced transit speed required; headlight convoys.' },
    { label: 'Severe Storm / Torrential Monsoon / Gale', rating: 85, status: 'OBSERVED', desc: 'Hazardous weather; zero visibility and high crosswind strain.' }
  ],
  terrain_gradient: [
    { label: 'Flat Plains / Low Incline (<3%)', rating: 10, status: 'OBSERVED', desc: 'Standard gradient, gentle curves, easy engine cooling.' },
    { label: 'Rolling Foothills (3-8% gradient)', rating: 35, status: 'OBSERVED', desc: 'Moderate climbs and descents; brake vigilance required.' },
    { label: 'Steep Mountain Pass / Hairpins (>10%)', rating: 75, status: 'OBSERVED', desc: 'Tight switchbacks, steep descent, brake fade risk for heavy trucks.' }
  ],
  road_width_clearance: [
    { label: 'Dual Carriageway / Wide Berm (>10m)', rating: 10, status: 'OBSERVED', desc: 'Adequate overtaking width and unencumbered vertical clearance.' },
    { label: 'Single Lane with Passing Bays (~5-7m)', rating: 40, status: 'OBSERVED', desc: 'Narrow bottlenecks; opposing civil traffic requires coordinated halting.' },
    { label: 'Critical Constriction / Low Overpass (<3.5m)', rating: 80, status: 'OBSERVED', desc: 'Low clearance arch or extreme constriction restricting high-cube cargo.' }
  ],
  traffic_congestion: [
    { label: 'Free Flowing / Rural Sparse', rating: 10, status: 'OBSERVED', desc: 'Minimal civil traffic friction.' },
    { label: 'Moderate Urban transit / Market Jam', rating: 45, status: 'OBSERVED', desc: 'Stop-and-go transit in built-up nodes; convoy spacing difficult.' },
    { label: 'Gridlock / Commercial Freight Choke', rating: 85, status: 'OBSERVED', desc: 'Severe civil congestion; 2+ hour delay anticipated without traffic police.' }
  ],
  travel_time_variability: [
    { label: 'Predictable Schedule (+/- 15 mins)', rating: 10, status: 'OBSERVED', desc: 'Transit corridor follows historical timing benchmarks.' },
    { label: 'Unpredictable Bottlenecks (+/- 60 mins)', rating: 50, status: 'OBSERVED', desc: 'Significant time variance due to intermittent rail crossings or construction.' },
    { label: 'Erratic Delay Dispersion (>2 hrs variance)', rating: 85, status: 'OBSERVED', desc: 'High variance; convoy ETAs cannot be reliably scheduled.' }
  ],
  logistics_support_availability: [
    { label: 'Full Military Depot & Recovery en route', rating: 10, status: 'CONFIRMED', desc: 'Cantonment workshop, Class III fuel point, and field medical hospital accessible.' },
    { label: 'Civil Workshops & Fuel Only', rating: 45, status: 'OBSERVED', desc: 'Commercial roadside pumps available; no military recovery assets.' },
    { label: 'Remote / Isolated Sector (No logistics support)', rating: 85, status: 'OBSERVED', desc: 'No recovery or refuelling support within 100km radius; full self-sufficiency needed.' }
  ]
};

export default function RopReportModal({
  isOpen,
  onClose,
  journeyId,
  routeVersion = 'primary',
  existingReport = null,
  currentUser,
  onReportSaved
}) {
  if (!isOpen) return null;

  // Initialize form state
  const initialParams = {};
  VORAM_PARAMETERS.forEach(p => {
    const existing = existingReport?.parameters?.[p.id];
    initialParams[p.id] = {
      status: existing?.status || 'NOT_OBSERVED',
      rating: existing?.rating !== undefined ? existing.rating : '',
      description: existing?.description || '',
      source: existing?.source || 'PATROL_RECON',
      reference: existing?.reference || '',
      uncertainty_notes: existing?.uncertainty_notes || ''
    };
  });

  const [parameters, setParameters] = useState(initialParams);
  const [obsStart, setObsStart] = useState(existingReport?.observation_period_start || new Date(Date.now() - 3600000).toISOString().slice(0, 16));
  const [obsEnd, setObsEnd] = useState(existingReport?.observation_period_end || new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState(existingReport?.notes || '');
  const [activeTab, setActiveTab] = useState(VORAM_PARAMETERS[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleParamChange = (paramId, field, value) => {
    setParameters(prev => ({
      ...prev,
      [paramId]: {
        ...prev[paramId],
        [field]: value
      }
    }));
  };

  const handleApplyPreset = (paramId, preset) => {
    setParameters(prev => ({
      ...prev,
      [paramId]: {
        ...prev[paramId],
        rating: preset.rating,
        status: preset.status,
        description: preset.desc
      }
    }));
  };

  const handleSubmit = async (submitStatus) => {
    setSubmitting(true);
    setErrorMsg('');

    try {
      // Validate that at least one parameter has observations if submitting for review
      if (submitStatus === 'SUBMITTED') {
        const hasObservations = Object.values(parameters).some(
          p => p.status === 'OBSERVED' || p.status === 'CONFIRMED' || p.description.trim().length > 0 || p.rating !== ''
        );
        if (!hasObservations) {
          throw new Error('Please record at least one parameter observation before submitting for coordinator verification.');
        }
      }

      // Format payload
      const cleanedParams = {};
      Object.entries(parameters).forEach(([k, v]) => {
        cleanedParams[k] = {
          status: v.status,
          description: v.description.trim(),
          rating: v.rating !== '' && v.rating !== null ? Number(v.rating) : null,
          source: v.source,
          reference: v.reference.trim() || null,
          uncertainty_notes: v.uncertainty_notes.trim() || null,
          observation_time: new Date().toISOString()
        };
      });

      const payload = {
        route_version: routeVersion,
        status: submitStatus,
        observation_period_start: obsStart,
        observation_period_end: obsEnd,
        parameters: cleanedParams,
        notes: notes.trim()
      };

      const res = await api.submitRopReport(journeyId, payload);
      if (typeof onReportSaved === 'function') {
        onReportSaved(res);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit ROP report. Verify connectivity and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const documentedCount = VORAM_PARAMETERS.filter(p => {
    const v = parameters[p.id];
    return v && (v.status === 'OBSERVED' || v.status === 'CONFIRMED' || (v.description && v.description.trim().length > 0) || (v.rating !== '' && v.rating !== null));
  }).length;

  const isReviewMode = activeTab === 'REVIEW_ALL';
  const activeParam = !isReviewMode ? (VORAM_PARAMETERS.find(p => p.id === activeTab) || VORAM_PARAMETERS[0]) : null;
  const activeVal = activeParam ? (parameters[activeParam.id] || {}) : {};
  const currentParamIdx = activeParam ? VORAM_PARAMETERS.findIndex(p => p.id === activeParam.id) : -1;

  return (
    <div className="vayu-modal-backdrop" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 12, 18, 0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 16
    }}>
      <div className="vayu-modal-dialog" style={{
        background: 'var(--panel-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        width: '100%',
        maxWidth: 920,
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 40px rgba(0,0,0,0.65)'
      }}>
        {/* Header with Telemetry & Progress Indicator */}
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--panel-alt)'
        }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Forward Reconnaissance Telemetry
            </div>
            <h2 style={{ fontSize: 16, margin: '2px 0 0 0', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main)' }}>
              <FileCheck2 size={17} color="var(--accent)" />
              Road Opening Party (ROP) Recon Report
            </h2>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Target: <span className="mono" style={{ color: 'var(--text-main)', fontWeight: 600 }}>{journeyId}</span> · Route Version: <span className="mono" style={{ color: 'var(--text-main)' }}>{routeVersion}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Completion Progress Indicator */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                Documented: <strong style={{ color: documentedCount > 0 ? 'var(--ok)' : 'var(--text-main)' }}>{documentedCount} / 10</strong> Parameters
              </div>
              <div style={{ width: 130, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(documentedCount / 10) * 100}%`,
                  background: documentedCount >= 8 ? 'var(--ok)' : (documentedCount >= 4 ? 'var(--accent)' : 'var(--warn)'),
                  transition: 'width 0.2s ease'
                }} />
              </div>
            </div>

            <button
              type="button"
              className="btn icon"
              onClick={onClose}
              title="Close dialog"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {errorMsg && (
          <div style={{
            background: 'rgba(161, 15, 24, 0.15)',
            borderLeft: '4px solid #A10F18',
            padding: '10px 16px',
            color: '#FFC2C2',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertTriangle size={15} color="#A10F18" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Body: Split Navigation & Parameter Form */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Left Column: Parameter Selector Tabs & Review Mode */}
          <div style={{
            width: 270,
            borderRight: '1px solid var(--border)',
            background: 'var(--panel-alt)',
            overflowY: 'auto',
            padding: '8px'
          }}>
            {/* Overview / Review Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('REVIEW_ALL')}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '7px 9px',
                borderRadius: 'var(--radius)',
                border: '1px solid',
                borderColor: isReviewMode ? 'var(--accent)' : 'var(--border)',
                background: isReviewMode ? 'var(--panel-hover)' : 'var(--panel-raised)',
                color: isReviewMode ? 'var(--accent)' : 'var(--text-main)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                fontWeight: 700,
                fontSize: 11,
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClipboardList size={13} />
                <span>Review All Parameters</span>
              </span>
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--ok)' }}>
                {documentedCount}/10
              </span>
            </button>

            <div style={{ fontSize: 9.5, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', padding: '3px 6px', fontWeight: 600 }}>
              10 VORAM Parameters
            </div>
            {VORAM_PARAMETERS.map((p, idx) => {
              const pVal = parameters[p.id];
              const isFilled = pVal.status === 'OBSERVED' || pVal.status === 'CONFIRMED' || (pVal.description && pVal.description.trim().length > 0) || (pVal.rating !== '' && pVal.rating !== null);
              const isSelected = activeTab === p.id;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveTab(p.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--accent)' : 'transparent',
                    background: isSelected ? 'var(--panel-hover)' : 'transparent',
                    color: isSelected ? 'var(--text-main)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    marginBottom: 2,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: isSelected ? 700 : 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {isFilled && <CheckCircle2 size={11} color="var(--ok)" style={{ flexShrink: 0 }} />}
                      <span>{idx + 1}. {p.name}</span>
                    </span>
                    <span style={{
                      fontSize: 9,
                      fontFamily: "'Share Tech Mono', monospace",
                      padding: '1px 4px',
                      borderRadius: 2,
                      background: 'var(--panel-raised)',
                      color: 'var(--text-muted)'
                    }}>
                      {p.weight}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, marginLeft: isFilled ? 16 : 0 }}>
                    <span style={{
                      color: isFilled ? 'var(--ok)' : 'var(--text-subtle)',
                      fontWeight: 600,
                      fontFamily: "'Share Tech Mono', monospace"
                    }}>
                      {pVal.status}
                    </span>
                    {pVal.rating !== '' && pVal.rating !== null && (
                      <span className="mono" style={{ color: 'var(--warn)' }}>
                        · Rating: {pVal.rating}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Column: Review All Mode or Parameter Inspection Form */}
          {isReviewMode ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 15, margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ClipboardList size={16} color="var(--accent)" />
                    All Parameters Review Summary
                  </h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    Review all 10 forward reconnaissance parameter findings prior to submission.
                  </div>
                </div>
                <span className="pill" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10.5, background: 'var(--panel-raised)' }}>
                  {documentedCount} of 10 Documented
                </span>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Parameter</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Weight</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rating</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Recorded Findings</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VORAM_PARAMETERS.map((p, idx) => {
                      const pVal = parameters[p.id] || {};
                      const isFilled = pVal.status === 'OBSERVED' || pVal.status === 'CONFIRMED' || (pVal.description && pVal.description.trim().length > 0) || (pVal.rating !== '' && pVal.rating !== null);
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel-alt)' }}>
                          <td style={{ padding: '6px 8px', fontFamily: "'Share Tech Mono', monospace", color: 'var(--text-muted)' }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--text-main)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {isFilled && <CheckCircle2 size={11} color="var(--ok)" />}
                              <span>{p.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 8px', fontFamily: "'Share Tech Mono', monospace", color: 'var(--text-muted)' }}>
                            {p.weight}%
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{
                              fontFamily: "'Share Tech Mono', monospace",
                              fontSize: 9.5,
                              fontWeight: 600,
                              padding: '2px 5px',
                              borderRadius: 3,
                              background: isFilled ? 'rgba(106, 154, 124, 0.15)' : 'var(--panel-raised)',
                              color: isFilled ? 'var(--ok)' : 'var(--text-subtle)',
                              border: `1px solid ${isFilled ? 'rgba(106, 154, 124, 0.3)' : 'var(--border)'}`
                            }}>
                              {pVal.status}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px', fontFamily: "'Share Tech Mono', monospace", fontWeight: 700 }}>
                            {pVal.rating !== '' && pVal.rating !== null ? (
                              <span style={{ color: pVal.rating < 30 ? 'var(--ok)' : pVal.rating < 60 ? 'var(--warn)' : 'var(--bad)' }}>
                                {pVal.rating}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-subtle)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: pVal.description ? 'var(--text-main)' : 'var(--text-subtle)' }}>
                            {pVal.description || 'No specific description recorded'}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn small"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={() => setActiveTab(p.id)}
                            >
                              Edit →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: 11.5 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>
                  Overall Recon Patrol Notes (Optional)
                </div>
                <textarea
                  rows={2}
                  placeholder="Enter overall corridor conditions, weather observations, or team telemetry summary..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12, resize: 'vertical' }}
                />
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Parameter Header */}
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: 15, margin: 0, color: 'var(--text-main)' }}>
                    {activeParam.name}
                  </h3>
                  <span className="mono" style={{ fontSize: 10.5, background: 'var(--panel-raised)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid var(--border)' }}>
                    Model Weight: {activeParam.weight}%
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {activeParam.desc}
                </div>
              </div>

              {/* Compact Field Presets Chips */}
              {PARAMETER_PRESETS[activeParam.id] && (
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                    Quick Field Presets (Click to autofill):
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {PARAMETER_PRESETS[activeParam.id].map((preset, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => handleApplyPreset(activeParam.id, preset)}
                        style={{
                          padding: '4px 8px',
                          background: 'var(--panel-alt)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 10.5,
                          color: 'var(--text-main)',
                          transition: 'all 0.15s ease'
                        }}
                        title={preset.desc}
                      >
                        <span style={{ fontWeight: 600 }}>{preset.label}</span>
                        <span className="mono" style={{
                          fontSize: 9.5,
                          padding: '1px 4px',
                          borderRadius: 2,
                          background: 'var(--panel-raised)',
                          color: preset.rating < 30 ? 'var(--ok)' : preset.rating < 60 ? 'var(--warn)' : 'var(--bad)',
                          fontWeight: 700
                        }}>
                          {preset.rating}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Inputs: Status, Rating, Source */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                    Observation Status
                  </label>
                  <select
                    value={activeVal.status}
                    onChange={(e) => handleParamChange(activeParam.id, 'status', e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 11.5 }}
                  >
                    {OBSERVATION_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 9.5, color: 'var(--text-subtle)', marginTop: 2 }}>
                    {OBSERVATION_STATUSES.find(s => s.value === activeVal.status)?.desc}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                    Assessed Risk Rating (0–100 Concern)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      placeholder="Optional (0–100)"
                      value={activeVal.rating}
                      onChange={(e) => handleParamChange(activeParam.id, 'rating', e.target.value)}
                      style={{ width: 100, padding: '5px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 11.5, fontFamily: "'Share Tech Mono', monospace" }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      0 = Negligible Risk · 100 = Critical Concern
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                    Evidence Source / Recon Method
                  </label>
                  <select
                    value={activeVal.source}
                    onChange={(e) => handleParamChange(activeParam.id, 'source', e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 11.5 }}
                  >
                    {RECON_SOURCES.map(src => (
                      <option key={src.value} value={src.value}>{src.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                    Milestone / Infrastructure Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. NH-44 KM 32 Bridge / Sector Alpha"
                    value={activeVal.reference}
                    onChange={(e) => handleParamChange(activeParam.id, 'reference', e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 11.5 }}
                  />
                </div>
              </div>

              {/* Description Textarea */}
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                  Observation Description & Physical Findings
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter specific physical observations recorded by forward party..."
                  value={activeVal.description}
                  onChange={(e) => handleParamChange(activeParam.id, 'description', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 11.5, resize: 'vertical' }}
                />
              </div>

              {/* Uncertainty Notes */}
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                  Uncertainty or Limitations Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Surveyed at night; night-vision recon only; rain ongoing"
                  value={activeVal.uncertainty_notes}
                  onChange={(e) => handleParamChange(activeParam.id, 'uncertainty_notes', e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 11.5 }}
                />
              </div>

              {/* Sequential Parameter Navigation Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    if (currentParamIdx > 0) setActiveTab(VORAM_PARAMETERS[currentParamIdx - 1].id);
                  }}
                  disabled={currentParamIdx <= 0}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <ChevronLeft size={13} /> Prev Parameter
                </button>

                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: "'Share Tech Mono', monospace" }}>
                  Parameter {currentParamIdx + 1} of {VORAM_PARAMETERS.length}
                </span>

                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    if (currentParamIdx < VORAM_PARAMETERS.length - 1) {
                      setActiveTab(VORAM_PARAMETERS[currentParamIdx + 1].id);
                    } else {
                      setActiveTab('REVIEW_ALL');
                    }
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <span>{currentParamIdx === VORAM_PARAMETERS.length - 1 ? 'Review All Summary' : 'Next Parameter'}</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Observation Timestamps & Operational Notes Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--panel-alt)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-muted)' }}>
            <div>
              <span>Period: </span>
              <input
                type="datetime-local"
                value={obsStart}
                onChange={(e) => setObsStart(e.target.value)}
                style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 4px', fontSize: 10.5, color: 'var(--text-main)' }}
              />
              <span> to </span>
              <input
                type="datetime-local"
                value={obsEnd}
                onChange={(e) => setObsEnd(e.target.value)}
                style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 4px', fontSize: 10.5, color: 'var(--text-main)' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => handleSubmit('DRAFT')}
              disabled={submitting}
              style={{ fontSize: 11.5 }}
            >
              <Save size={13} /> Save Draft
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => handleSubmit('SUBMITTED')}
              disabled={submitting}
              style={{ fontSize: 11.5, fontWeight: 700 }}
            >
              {submitting ? (
                <><Loader2 size={13} className="spin" /> Submitting…</>
              ) : (
                <><Send size={13} /> Submit ROP Report for Verification</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
