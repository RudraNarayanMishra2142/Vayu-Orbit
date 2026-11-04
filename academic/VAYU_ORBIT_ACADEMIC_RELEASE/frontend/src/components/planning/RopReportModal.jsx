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
  Info
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

  const activeParam = VORAM_PARAMETERS.find(p => p.id === activeTab) || VORAM_PARAMETERS[0];
  const activeVal = parameters[activeParam.id] || {};

  return (
    <div className="vayu-modal-backdrop" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 12, 18, 0.82)',
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
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--panel-alt)'
        }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Forward Reconnaissance Telemetry
            </div>
            <h2 style={{ fontSize: 17, margin: '2px 0 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileCheck2 size={18} color="var(--accent)" />
              Road Opening Party (ROP) Recon Report
            </h2>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Journey Target: <span className="mono" style={{ color: 'var(--text-main)', fontWeight: 600 }}>{journeyId}</span> · Route Version: <span className="mono" style={{ color: 'var(--text-main)' }}>{routeVersion}</span>
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
          {/* Left Column: Parameter Selector Tabs */}
          <div style={{
            width: 280,
            borderRight: '1px solid var(--border)',
            background: 'rgba(15, 23, 42, 0.35)',
            overflowY: 'auto',
            padding: '10px 8px'
          }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', padding: '6px 8px', fontWeight: 600 }}>
              10 VORAM Parameters
            </div>
            {VORAM_PARAMETERS.map((p, idx) => {
              const pVal = parameters[p.id];
              const isFilled = pVal.status === 'OBSERVED' || pVal.status === 'CONFIRMED';
              const isSelected = activeTab === p.id;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveTab(p.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--accent)' : 'transparent',
                    background: isSelected ? 'rgba(142, 216, 248, 0.1)' : 'transparent',
                    color: isSelected ? 'var(--text-main)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    marginBottom: 3,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11.5, fontWeight: isSelected ? 700 : 500 }}>
                      {idx + 1}. {p.name}
                    </span>
                    <span style={{
                      fontSize: 9.5,
                      fontFamily: "'Share Tech Mono', monospace",
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: 'rgba(255,255,255,0.06)'
                    }}>
                      {p.weight}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                    <span style={{
                      color: isFilled ? 'var(--ok)' : 'var(--text-subtle)',
                      fontWeight: 600,
                      fontFamily: "'Share Tech Mono', monospace"
                    }}>
                      {pVal.status}
                    </span>
                    {pVal.rating !== '' && (
                      <span className="mono" style={{ color: 'var(--warn)' }}>
                        · Rating: {pVal.rating}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Column: Detailed Parameter Inspection & Observation Input */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Parameter Header */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 16, margin: 0, color: 'var(--text-main)' }}>
                  {activeParam.name}
                </h3>
                <span className="mono" style={{ fontSize: 11, background: 'rgba(142, 216, 248, 0.15)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                  Model Weight: {activeParam.weight}%
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                {activeParam.desc}
              </div>
            </div>

            {/* Field Reconnaissance Presets */}
            {PARAMETER_PRESETS[activeParam.id] && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Quick Field Presets (Click to autofill observed finding)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {PARAMETER_PRESETS[activeParam.id].map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => handleApplyPreset(activeParam.id, preset)}
                      style={{
                        padding: '6px 8px',
                        background: 'var(--panel-alt)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: 10.5,
                        color: 'var(--text-main)'
                      }}
                    >
                      <div style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{preset.label}</span>
                        <span className="mono" style={{ color: preset.rating < 30 ? 'var(--ok)' : preset.rating < 60 ? 'var(--warn)' : 'var(--bad)' }}>
                          {preset.rating}
                        </span>
                      </div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 2 }}>
                        {preset.desc.slice(0, 60)}…
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Inputs: Status, Rating, Source */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  Observation Status
                </label>
                <select
                  value={activeVal.status}
                  onChange={(e) => handleParamChange(activeParam.id, 'status', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12 }}
                >
                  {OBSERVATION_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 3 }}>
                  {OBSERVATION_STATUSES.find(s => s.value === activeVal.status)?.desc}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
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
                    style={{ width: 110, padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12, fontFamily: "'Share Tech Mono', monospace" }}
                  />
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    0 = Negligible Risk · 100 = Critical Concern
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  Evidence Source / Recon Method
                </label>
                <select
                  value={activeVal.source}
                  onChange={(e) => handleParamChange(activeParam.id, 'source', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12 }}
                >
                  {RECON_SOURCES.map(src => (
                    <option key={src.value} value={src.value}>{src.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  Milestone / Infrastructure Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. NH-44 KM 32 Bridge / Sector Alpha"
                  value={activeVal.reference}
                  onChange={(e) => handleParamChange(activeParam.id, 'reference', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12 }}
                />
              </div>
            </div>

            {/* Description Textarea */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Observation Description & Physical Findings
              </label>
              <textarea
                rows={3}
                placeholder="Enter specific physical observations recorded by forward party..."
                value={activeVal.description}
                onChange={(e) => handleParamChange(activeParam.id, 'description', e.target.value)}
                style={{ width: '100%', padding: '8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12, resize: 'vertical' }}
              />
            </div>

            {/* Uncertainty Notes */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Uncertainty or Limitations Note
              </label>
              <input
                type="text"
                placeholder="e.g. Surveyed at night; night-vision recon only; rain ongoing"
                value={activeVal.uncertainty_notes}
                onChange={(e) => handleParamChange(activeParam.id, 'uncertainty_notes', e.target.value)}
                style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12 }}
              />
            </div>
          </div>
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
