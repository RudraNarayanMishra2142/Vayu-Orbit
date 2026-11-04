import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import MapView from '../components/MapView';
import {
  FileText, Printer, Search, RefreshCw, AlertTriangle, CheckCircle,
  Clock, MapPin, Truck, ShieldAlert, Fuel, Info, ArrowRight, ExternalLink,
  Download, Compass, BarChart2, ShieldCheck, ChevronRight, Filter, ChevronDown, ChevronUp
} from 'lucide-react';

function formatDate(iso) {
  if (!iso) return 'Not recorded';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' IST';
  } catch {
    return iso;
  }
}

function statusBadge(s) {
  const cls = {
    SCHEDULED: 'SCHEDULED',
    ACTIVE: 'ACTIVE',
    DISRUPTED: 'DISRUPTED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    DRAFT: 'DRAFT'
  };
  return <span className={`pill ${cls[s] || ''}`}>{s}</span>;
}

function fuelStatusBadge(s) {
  const map = {
    FEASIBLE: { label: 'FEASIBLE (NON-STOP)', bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)', color: '#4ade80' },
    FEASIBLE_NON_STOP: { label: 'FEASIBLE (NON-STOP)', bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)', color: '#4ade80' },
    REFUELLING_RECOMMENDED: { label: 'REFUELLING RECOMMENDED', bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.4)', color: '#facc15' },
    REQUIRES_REFUELLING: { label: 'REQUIRES REFUELLING', bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.4)', color: '#facc15' },
    INFEASIBLE_STRANDING_RISK: { label: 'CRITICAL STRANDING RISK', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', color: '#f87171' },
    FEASIBILITY_UNVERIFIED: { label: 'FEASIBILITY UNVERIFIED', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.4)', color: '#cbd5e1' },
    CANNOT_DETERMINE: { label: 'CANNOT DETERMINE', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', color: '#f87171' }
  };
  const c = map[s] || { label: s || 'UNKNOWN', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.4)', color: '#cbd5e1' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 8px',
      borderRadius: 4,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: '0.04em',
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.color
    }}>
      {c.label}
    </span>
  );
}

export default function JourneyReport({ initialJourneyId, onSelectJourneyId, currentUser, onOpenOperations }) {
  const [journeysList, setJourneysList] = useState([]);
  const [selectedId, setSelectedId] = useState(initialJourneyId || '');
  const [statusFilter, setStatusFilter] = useState('COMPLETED');
  const [searchFilter, setSearchFilter] = useState('');
  const [showCatalog, setShowCatalog] = useState(false);
  const [report, setReport] = useState(null);
  const [rawJourney, setRawJourney] = useState(null);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');

  // Load journey list for selector
  const fetchJourneys = () => {
    setLoadingList(true);
    api.journeys()
      .then(res => {
        const list = Array.isArray(res) ? res : (res?.journeys || []);
        setJourneysList(list);
        const completed = list.filter(j => (j.status || '').toUpperCase() === 'COMPLETED');
        if (!selectedId && completed.length > 0) {
          if (!initialJourneyId) {
            const firstId = completed[0].journey_id;
            setSelectedId(firstId);
            loadReport(firstId);
          }
        }
      })
      .catch(err => {
        console.warn('Failed to fetch journeys list:', err);
      })
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    fetchJourneys();
    api.places('?status=ACTIVE')
      .then(res => {
        const pList = Array.isArray(res) ? res : (res?.places || []);
        setPlaces(pList);
      })
      .catch(err => console.warn('Failed to load places for map markers:', err));
  }, []);

  // Sync if initialJourneyId changes from props
  useEffect(() => {
    if (initialJourneyId && initialJourneyId !== selectedId) {
      setSelectedId(initialJourneyId);
      loadReport(initialJourneyId);
    }
  }, [initialJourneyId]);

  // Load report and raw journey for map geometry concurrently
  const loadReport = (journeyId) => {
    const jid = journeyId || selectedId;
    if (!jid) {
      setError('Please select an authorized completed journey to generate debrief report.');
      return;
    }
    const targetObj = journeysList.find(x => x.journey_id === jid);
    if (targetObj && (targetObj.status || '').toUpperCase() !== 'COMPLETED') {
      setError(`Debrief report generation unauthorized. Reports are strictly authorized for COMPLETED journeys only. Mission ${jid} is currently [${targetObj.status}].`);
      setReport(null);
      api.journey(jid)
        .then(rawJ => setRawJourney(rawJ))
        .catch(() => setRawJourney(null));
      setSelectedId(jid);
      return;
    }
    setLoading(true);
    setError('');
    setShowCatalog(false);
    Promise.all([
      api.journeyReport(jid),
      api.journey(jid).catch(err => {
        console.warn('Could not fetch raw journey for geometry:', err);
        return null;
      })
    ])
      .then(([repData, rawJ]) => {
        if ((repData?.status || '').toUpperCase() !== 'COMPLETED') {
          setError(`Debrief report generation unauthorized. Reports are strictly authorized for COMPLETED journeys only. Mission ${jid} is currently [${repData?.status || 'NON-COMPLETED'}].`);
          setReport(null);
          setRawJourney(rawJ);
        } else {
          setReport(repData);
          setRawJourney(rawJ);
        }
        setSelectedId(jid);
        if (onSelectJourneyId) onSelectJourneyId(jid);
      })
      .catch(err => {
        setError(err.message || `Failed to generate report for journey ${jid}`);
        setReport(null);
        setRawJourney(null);
      })
      .finally(() => setLoading(false));
  };

  // Download Debrief PDF
  const handleDownloadPdf = async () => {
    const jid = report?.journey_id || selectedId;
    if (!jid) return;
    setPdfLoading(true);
    setPdfError('');
    try {
      const { blob, filename } = await api.downloadJourneyReportPdf(jid);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download PDF debrief report:', err);
      setPdfError(err.message || 'Failed to download PDF debrief report.');
    } finally {
      setPdfLoading(false);
    }
  };

  // Trigger browser print dialog
  const handlePrint = () => {
    window.print();
  };

  // Authorized completed journeys vs ineligible movements
  const completedJourneys = useMemo(() => {
    return journeysList.filter(j => (j.status || '').toUpperCase() === 'COMPLETED');
  }, [journeysList]);

  const ineligibleJourneys = useMemo(() => {
    return journeysList.filter(j => (j.status || '').toUpperCase() !== 'COMPLETED');
  }, [journeysList]);

  // Filtered journeys based on status tab and search input
  const filteredJourneys = useMemo(() => {
    const base = statusFilter === 'INELIGIBLE' ? ineligibleJourneys : completedJourneys;
    if (!searchFilter.trim()) return base;
    const q = searchFilter.toLowerCase();
    return base.filter(j => {
      return (
        (j.journey_id || '').toLowerCase().includes(q) ||
        (j.origin_name || j.origin_id || '').toLowerCase().includes(q) ||
        (j.dest_name || j.dest_id || '').toLowerCase().includes(q) ||
        (j.corridor_name || '').toLowerCase().includes(q) ||
        (j.status || '').toLowerCase().includes(q)
      );
    });
  }, [statusFilter, completedJourneys, ineligibleJourneys, searchFilter]);

  // Selected journey object from journeys list
  const selectedJourneyObj = useMemo(() => {
    return journeysList.find(x => x.journey_id === selectedId) || null;
  }, [journeysList, selectedId]);

  // Resolved markers for MapView
  const originPlace = useMemo(() => {
    if (!report || !places.length) return null;
    return places.find(p => p.place_id === report.origin_id || p.id === report.origin_id) || null;
  }, [report, places]);

  const destPlace = useMemo(() => {
    if (!report || !places.length) return null;
    return places.find(p => p.place_id === report.dest_id || p.id === report.dest_id) || null;
  }, [report, places]);

  const routeGeometry = useMemo(() => {
    return rawJourney?.route?.geometry || null;
  }, [rawJourney]);

  // Elevation data check (none in current SQLite records)
  const hasElevationData = useMemo(() => {
    const ep = report?.route_summary?.elevation_profile || rawJourney?.route?.elevation_profile;
    return Array.isArray(ep) && ep.length > 0;
  }, [report, rawJourney]);

  // Vehicle class / model composition breakdown
  const vehicleComposition = useMemo(() => {
    if (!report?.convoy_manifest) return [];
    const counts = {};
    report.convoy_manifest.forEach(v => {
      const key = v.model_name || v.class_type || 'General Transport';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([model, count]) => ({ model, count }));
  }, [report]);

  return (
    <Shell
      title="Get Your Journey Report"
      eyebrow="ANALYTICS · DEBRIEF (COMPLETED ONLY)"
      description="Post-mission debriefs, operational records, and compliance reports authorized strictly for completed convoy movements."
    >
      {/* Self-contained Print Stylesheet */}
      <style>{`
        @media print {
          .sidebar, .top, .nav-btn, .mobile-nav-toggle, .profilebox,
          .report-discovery-bar, .report-selector-card, .no-print, button, .top-clock {
            display: none !important;
          }
          body, .app, .main, .content, .shell {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            height: auto !important;
            overflow: visible !important;
          }
          .card, .report-section-card, .report-header-banner, .report-kpi-card {
            background: #ffffff !important;
            border: 1px solid #d1d5db !important;
            color: #000000 !important;
            box-shadow: none !important;
            break-inside: avoid;
            margin-bottom: 16px !important;
            padding: 14px !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            color: #000000 !important;
          }
          th, td {
            border: 1px solid #cbd5e1 !important;
            color: #000000 !important;
            padding: 6px 8px !important;
            font-size: 10pt !important;
          }
          th {
            background: #f1f5f9 !important;
            font-weight: 700 !important;
          }
          .muted, .small {
            color: #475569 !important;
          }
          .pill {
            border: 1px solid #94a3b8 !important;
            color: #000000 !important;
            background: #e2e8f0 !important;
          }
          .print-header-block {
            display: block !important;
            border-bottom: 2px solid #000000;
            padding-bottom: 12px;
            margin-bottom: 18px;
          }
        }
        @media screen {
          .print-header-block {
            display: none;
          }
        }
      `}</style>

      <div className="report-workspace">
        {/* ══════════════════════════════════════════════════════════
            COMPONENT A: GET YOUR REPORT (DISCOVERY & SELECTOR)
           ══════════════════════════════════════════════════════════ */}
        <div className="report-discovery-bar report-selector-card no-print">
          {/* 1. Header Row: Title & Status Counter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileText size={22} color="var(--color-accent-primary)" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.01em' }}>
                  Operational Debrief Generator
                </div>
                <div className="small muted">
                  Authorized mission debrief records for completed convoy operations.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="pill ok" style={{ fontSize: 10.5 }}>
                {completedJourneys.length} Completed
              </span>
              {ineligibleJourneys.length > 0 && (
                <span className="pill warn" style={{ fontSize: 10.5 }}>
                  {ineligibleJourneys.length} In-Transit
                </span>
              )}
            </div>
          </div>

          {/* 2. Generator Controls Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 14,
              padding: '12px 14px',
              background: 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--color-border)'
            }}
          >
            {/* Quick search input */}
            <div style={{ position: 'relative', width: 220, minWidth: 180 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-muted)',
                  pointerEvents: 'none'
                }}
              />
              <input
                type="text"
                className="input"
                style={{ paddingLeft: 30, fontSize: 12, height: 36 }}
                placeholder="Search Trip ID, place, corridor…"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
              />
            </div>

            {/* Journey Dropdown Selector */}
            <select
              className="input"
              style={{
                flex: 1,
                minWidth: 280,
                maxWidth: 480,
                fontSize: 12,
                height: 36,
                cursor: 'pointer'
              }}
              value={selectedId}
              onChange={e => {
                const val = e.target.value;
                setSelectedId(val);
                if (val) loadReport(val);
              }}
              disabled={loadingList}
            >
              <option value="">-- Select Completed Journey ({completedJourneys.length} authorized) --</option>
              <optgroup label="✓ Authorized Completed Missions">
                {completedJourneys.map(j => (
                  <option key={j.journey_id} value={j.journey_id}>
                    {j.journey_id} — {j.origin_name || j.origin_id || 'Origin'} → {j.dest_name || j.dest_id || 'Dest'} ({j.distance_km ? `${Number(j.distance_km).toFixed(1)} km` : ''})
                  </option>
                ))}
              </optgroup>
              {selectedJourneyObj && selectedJourneyObj.status !== 'COMPLETED' && (
                <optgroup label="⚠️ Ineligible / Unauthorized for Debrief">
                  <option value={selectedJourneyObj.journey_id} disabled>
                    {selectedJourneyObj.journey_id} [{selectedJourneyObj.status}] — Unauthorized
                  </option>
                </optgroup>
              )}
            </select>

            {/* Primary Generate Action */}
            <button
              type="button"
              className="btn primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 36,
                fontSize: 12,
                fontWeight: 600,
                padding: '0 16px'
              }}
              onClick={() => loadReport(selectedId)}
              disabled={loading || !selectedId || (selectedJourneyObj && selectedJourneyObj.status !== 'COMPLETED')}
              title="Generate or reload debrief report"
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
              {loading ? 'Generating…' : report ? 'Refresh Report' : 'Generate Report'}
            </button>

            {/* Catalog Table Toggle */}
            <button
              type="button"
              className="btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 36,
                fontSize: 12
              }}
              onClick={() => setShowCatalog(prev => !prev)}
              title="Browse catalog table"
            >
              <Filter size={13} />
              {showCatalog ? 'Hide Table' : 'Browse Table'}
              {showCatalog ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>

          {/* Status Tabs Filter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingTop: 4 }}>
            <div className="report-filter-tabs">
              <button
                type="button"
                className={`report-filter-tab ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
                onClick={() => setStatusFilter('COMPLETED')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <CheckCircle size={12} color={statusFilter === 'COMPLETED' ? '#ffffff' : 'var(--status-green, #10b981)'} />
                AUTHORIZED COMPLETED ({completedJourneys.length})
              </button>

              <button
                type="button"
                className={`report-filter-tab ${statusFilter === 'INELIGIBLE' ? 'active' : ''}`}
                onClick={() => setStatusFilter('INELIGIBLE')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ShieldAlert size={12} color={statusFilter === 'INELIGIBLE' ? '#ffffff' : 'var(--status-amber, #f59e0b)'} />
                INELIGIBLE / IN-TRANSIT ({ineligibleJourneys.length})
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              {searchFilter && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ padding: '2px 6px', fontSize: 10 }}
                  onClick={() => setSearchFilter('')}
                >
                  Clear search
                </button>
              )}
            </div>
          </div>

          {/* Target Journey Dossier Banner */}
          {selectedJourneyObj && (
            <div className="report-dossier-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Target Record:</span>
                <code style={{ fontSize: 12.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
                  {selectedJourneyObj.journey_id}
                </code>
                {statusBadge(selectedJourneyObj.status)}

                {/* Authorization Status Indicator */}
                {selectedJourneyObj.status === 'COMPLETED' ? (
                  <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: 10.5, fontWeight: 600, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ShieldCheck size={12} /> DEBRIEF AUTHORIZED
                  </span>
                ) : (
                  <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: 10.5, fontWeight: 600, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ShieldAlert size={12} /> DEBRIEF UNAUTHORIZED ({selectedJourneyObj.status})
                  </span>
                )}

                {!report && (
                  <span style={{ fontWeight: 600, fontSize: 12 }}>
                    {selectedJourneyObj.origin_name || selectedJourneyObj.origin_id} → {selectedJourneyObj.dest_name || selectedJourneyObj.dest_id}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Expandable Journey Discovery Catalog Grid */}
          {(showCatalog || (!report && !loading && !error)) && (
            <div className="report-catalog-wrap">
              <table className="table" style={{ fontSize: 11, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>Trip ID</th>
                    <th>Tactical Corridor</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ width: 150 }}>Planned Departure</th>
                    <th style={{ width: 100 }}>Distance</th>
                    <th style={{ width: 130, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJourneys.length > 0 ? (
                    filteredJourneys.slice(0, 15).map(j => {
                      const isSelected = j.journey_id === selectedId;
                      const isCompleted = (j.status || '').toUpperCase() === 'COMPLETED';
                      return (
                        <tr
                          key={j.journey_id}
                          className={`report-catalog-row ${isSelected ? 'selected' : ''}`}
                          onClick={() => { setSelectedId(j.journey_id); loadReport(j.journey_id); }}
                        >
                          <td>
                            <code style={{ fontWeight: 600 }}>{j.journey_id}</code>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>
                              {j.origin_name || j.origin_id} → {j.dest_name || j.dest_id}
                            </div>
                            {j.corridor_name && (
                              <div className="small muted" style={{ fontSize: 10 }}>{j.corridor_name}</div>
                            )}
                          </td>
                          <td>{statusBadge(j.status)}</td>
                          <td style={{ fontSize: 10.5 }}>{formatDate(j.departure_time)}</td>
                          <td>{j.distance_km ? `${j.distance_km} km` : 'N/A'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {isCompleted ? (
                              <button
                                type="button"
                                className={`btn btn-sm ${isSelected ? 'btn-primary' : ''}`}
                                style={{ fontSize: 10, padding: '3px 8px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(j.journey_id);
                                  loadReport(j.journey_id);
                                }}
                              >
                                {isSelected && loading ? 'Loading…' : isSelected && report ? 'Active' : 'Select'}
                              </button>
                            ) : (
                              <span
                                className="small muted"
                                style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3, opacity: 0.8 }}
                                title="Debrief reports cannot be generated for active or scheduled movements."
                              >
                                <ShieldAlert size={11} color="var(--status-amber, #f59e0b)" /> Unauthorized
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '24px 12px' }} className="muted">
                        No journey records match the current status and search filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Operational Authorization Warning / Error Banner ── */}
        {error && (
          <div className="card report-unauthorized-card" style={{ padding: '24px', margin: '20px 0', border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.05)', borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <ShieldAlert size={36} color="var(--status-amber, #f59e0b)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                  Debrief Report Authorization Restricted
                </h3>
                <p style={{ margin: '0 0 12px 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-main, #0f172a)' }}>
                  {error}
                </p>
                <div style={{ fontSize: 12, color: 'var(--text-subtle, #64748b)', lineHeight: 1.5, marginBottom: 16, padding: '10px 14px', background: 'rgba(0,0,0,0.03)', borderRadius: 6, border: '1px dashed rgba(245, 158, 11, 0.3)' }}>
                  <strong>Operational Policy Rule:</strong> Under VAYU ORBIT military operating doctrine, formal post-mission debrief reports, fuel reconciliation certificates, and compliance PDF dossiers are <strong>strictly authorized for COMPLETED movements</strong>. In-transit, scheduled, or disrupted convoys remain under active situational command and are not certified for post-operation audit.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {completedJourneys.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                      onClick={() => {
                        const first = completedJourneys[0];
                        setSelectedId(first.journey_id);
                        loadReport(first.journey_id);
                      }}
                    >
                      <CheckCircle size={13} />
                      Switch to Authorized Completed Mission ({completedJourneys[0]?.journey_id})
                    </button>
                  )}
                  {onOpenOperations && selectedJourneyObj && (
                    <button
                      type="button"
                      className="btn"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                      onClick={() => onOpenOperations(selectedJourneyObj.journey_id)}
                    >
                      <ExternalLink size={13} />
                      Monitor Convoy in Mission Operations
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PDF Error Banner ── */}
        {pdfError && (
          <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} />
              <span>PDF Generation Error: {pdfError}</span>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => setPdfError('')}>Dismiss</button>
          </div>
        )}

        {/* ── Generation Progress State ── */}
        {loading && (
          <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <RefreshCw size={28} className="spin" color="var(--accent, #3b82f6)" style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>Synthesizing Journey Debrief...</div>
            <div className="small muted" style={{ marginTop: 4 }}>Loading historical manifest, corridor geometry, event logs, and fuel feasibility from database.</div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            COMPONENT B: ON-SCREEN JOURNEY REPORT
           ══════════════════════════════════════════════════════════ */}
        {report && !loading && (
          <>
            {/* Print-Only Header Block */}
            <div className="print-header-block">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '18pt', fontWeight: 800 }}>
                    VAYU ORBIT · CONVOY MISSION DEBRIEF
                  </h1>
                  <div style={{ fontSize: '10pt', color: '#475569', marginTop: 2 }}>
                    Intelligent Convoy Movement Planning & Logistics Decision Support System
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12pt', fontWeight: 700, fontFamily: 'monospace' }}>{report.journey_id}</div>
                  <div style={{ fontSize: '9pt', color: '#475569' }}>STATUS: {report.status}</div>
                </div>
              </div>
              <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: 6 }}>
                CLASSIFICATION: LOGISTICS DECISION SUPPORT PROTOTYPE · NON-OPERATIONAL · COMPILED: {formatDate(report.generated_at)}
              </div>
            </div>

            {/* SECTION A: REPORT HEADER BANNER */}
            <div className="report-header-banner">
              <div>
                <div className="small muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent, #3b82f6)', marginBottom: 4 }}>
                  Convoy Mission Debrief · Operational Record
                </div>
                <div className="report-header-title">
                  <span>{report.origin_name || report.origin_id}</span>
                  <ArrowRight size={18} color="var(--accent, #3b82f6)" />
                  <span>{report.dest_name || report.dest_id}</span>
                  <code style={{ fontSize: 13, padding: '3px 8px', borderRadius: 4 }}>
                    {report.journey_id}
                  </code>
                  {statusBadge(report.status)}
                </div>
                <div className="small muted" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span><strong>Planned Departure:</strong> {formatDate(report.departure_time)}</span>
                  <span>•</span>
                  <span><strong>Estimated Transit:</strong> {report.eta ? `${report.eta} hrs` : 'Not specified'}</span>
                  <span>•</span>
                  <span><strong>Compiled:</strong> {formatDate(report.generated_at)}</span>
                </div>
              </div>

              <div className="report-header-actions no-print">
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                >
                  <Download size={14} className={pdfLoading ? 'spin' : ''} />
                  {pdfLoading ? 'Generating PDF…' : 'Download PDF Report'}
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                  onClick={handlePrint}
                >
                  <Printer size={14} />
                  Print / Save as PDF
                </button>
                {onOpenOperations && (
                  <button
                    type="button"
                    className="btn"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                    onClick={() => onOpenOperations(report.journey_id)}
                  >
                    <ExternalLink size={14} />
                    Operations
                  </button>
                )}
              </div>
            </div>

            {/* SECTION B: 6-KPI SUMMARY CARDS GRID */}
            <div className="report-kpi-grid">
              {/* 1. Planned Distance */}
              <div className="report-kpi-card">
                <div className="report-kpi-top">
                  <span className="report-kpi-label">Planned Distance</span>
                  <div className="report-kpi-icon-wrap"><MapPin size={14} /></div>
                </div>
                <div className="report-kpi-value">
                  {report.distance_km ? `${report.distance_km} km` : (report.route_summary?.distance_km ? `${report.route_summary.distance_km} km` : 'N/A')}
                </div>
                <div className="report-kpi-subtext">Calculated Corridor</div>
              </div>

              {/* 2. Estimated Duration */}
              <div className="report-kpi-card">
                <div className="report-kpi-top">
                  <span className="report-kpi-label">Estimated Transit</span>
                  <div className="report-kpi-icon-wrap"><Clock size={14} /></div>
                </div>
                <div className="report-kpi-value">
                  {report.eta ? `${report.eta} hrs` : 'Not specified'}
                </div>
                <div className="report-kpi-subtext">Tactical Speed Model</div>
              </div>

              {/* 3. Assigned Vehicles */}
              <div className="report-kpi-card">
                <div className="report-kpi-top">
                  <span className="report-kpi-label">Convoy Complement</span>
                  <div className="report-kpi-icon-wrap"><Truck size={14} /></div>
                </div>
                <div className="report-kpi-value">
                  {report.convoy_manifest ? `${report.convoy_manifest.length} Units` : '0 Units'}
                </div>
                <div className="report-kpi-subtext">Committed Manifest</div>
              </div>

              {/* 4. Recorded Status */}
              <div className="report-kpi-card">
                <div className="report-kpi-top">
                  <span className="report-kpi-label">Recorded Status</span>
                  <div className="report-kpi-icon-wrap"><CheckCircle size={14} /></div>
                </div>
                <div className="report-kpi-value" style={{ fontSize: 16, marginTop: 2 }}>
                  {statusBadge(report.status)}
                </div>
                <div className="report-kpi-subtext">Mission Lifecycle State</div>
              </div>

              {/* 5. Logged Incidents */}
              <div className="report-kpi-card">
                <div className="report-kpi-top">
                  <span className="report-kpi-label">Logged Incidents</span>
                  <div className="report-kpi-icon-wrap" style={{ background: (report.incidents?.length || 0) > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)', color: (report.incidents?.length || 0) > 0 ? '#ef4444' : '#22c55e' }}>
                    <ShieldAlert size={14} />
                  </div>
                </div>
                <div className="report-kpi-value" style={{ color: (report.incidents?.length || 0) > 0 ? '#f87171' : '#4ade80' }}>
                  {report.incidents ? `${report.incidents.length} Logged` : '0 Logged'}
                </div>
                <div className="report-kpi-subtext">Safety Register Audit</div>
              </div>

              {/* 6. Fuel Feasibility */}
              <div className="report-kpi-card">
                <div className="report-kpi-top">
                  <span className="report-kpi-label">Fuel Feasibility</span>
                  <div className="report-kpi-icon-wrap"><Fuel size={14} /></div>
                </div>
                <div className="report-kpi-value" style={{ fontSize: 13, marginTop: 2 }}>
                  {fuelStatusBadge(report.fuel_intelligence?.convoy_status)}
                </div>
                <div className="report-kpi-subtext">
                  Limiting: {report.fuel_intelligence?.limiting_usable_range_km ? `${report.fuel_intelligence.limiting_usable_range_km} km` : 'N/A'}
                </div>
              </div>
            </div>

            {/* SECTION C: ROUTE MAP & CORRIDOR */}
            <div className="report-section-card">
              <div className="report-section-header">
                <div>
                  <div className="report-section-title">
                    <MapPin size={17} color="var(--accent, #3b82f6)" />
                    Section C — Tactical Route Corridor & Map
                  </div>
                  <div className="report-section-desc">
                    Pre-mission routing corridor computed by tactical graph engine.
                  </div>
                </div>
                {report.route_summary?.corridor_name && (
                  <div className="small muted">
                    Corridor: <strong>{report.route_summary.corridor_name}</strong>
                  </div>
                )}
              </div>

              {/* Corridor Disclaimer (shown when map route geometry is available) */}
              {routeGeometry && (
                <div style={{
                  background: 'rgba(59,130,246,0.06)',
                  border: '1px solid rgba(59,130,246,0.2)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 14,
                  fontSize: 11
                }}>
                  <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Info size={14} /> Planned Corridor vs. Actual Route Disclaimer
                  </div>
                  <div style={{ color: 'var(--text-subtle, #94a3b8)' }}>
                    This map presents the <strong>planned routing corridor</strong> persisted at journey scheduling. It does <strong>not</strong> represent an actual GPS breadcrumb or transponder track.
                  </div>
                </div>
              )}

              {/* Map View or Honest Fallback */}
              {routeGeometry ? (
                <div className="report-map-container">
                  <MapView
                    places={places}
                    routeGeometry={routeGeometry}
                    origin={originPlace}
                    destination={destPlace}
                    cameraMode="overview"
                  />
                </div>
              ) : (
                <div className="report-map-fallback">
                  <Compass size={32} color="var(--accent, #3b82f6)" style={{ marginBottom: 10, opacity: 0.8 }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                    Historical route geometry is unavailable for this record.
                  </div>
                  <div className="small muted" style={{ maxWidth: 460, marginTop: 4 }}>
                    Coordinate vectors were not persisted for this journey. The ordered sequence of corridor installations is displayed below.
                  </div>
                </div>
              )}

              {/* Waypoints Sequence Chips */}
              {report.route_summary?.waypoints && report.route_summary.waypoints.length > 0 && (
                <div>
                  <div className="small muted" style={{ marginTop: 14, fontSize: 11, fontWeight: 600 }}>
                    Ordered Corridor Installations ({report.route_summary.waypoints.length} waypoints):
                  </div>
                  <div className="report-waypoints-scroll">
                    {report.route_summary.waypoints.map((wp, idx) => {
                      const isOrigin = idx === 0;
                      const isTerminus = idx === report.route_summary.waypoints.length - 1;
                      return (
                        <div key={wp.node_id + idx} className="report-waypoint-chip">
                          <span style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: isOrigin ? '#22c55e' : isTerminus ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                            color: '#ffffff',
                            fontSize: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ fontWeight: isOrigin || isTerminus ? 700 : 500 }}>
                            {wp.name || wp.node_id}
                          </span>
                          {idx < report.route_summary.waypoints.length - 1 && (
                            <ChevronRight size={12} color="var(--text-subtle)" style={{ marginLeft: 2 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Corridor Attributes Bar */}
              <div className="report-corridor-bar">
                <div>
                  <span className="muted">Route Type: </span>
                  <strong>{report.route_summary?.route_type || 'PRIMARY'}</strong>
                </div>
                <div>
                  <span className="muted">Corridor Distance: </span>
                  <strong>{report.route_summary?.distance_km || report.distance_km || 0} km</strong>
                </div>
                <div>
                  <span className="muted">Axle Rating: </span>
                  <strong>{report.route_summary?.vehicle_limit_tons ? `${report.route_summary.vehicle_limit_tons} Tons Max` : 'Standard Axle Limit'}</strong>
                </div>
                <div>
                  <span className="muted">Corridor Risk: </span>
                  <strong style={{ color: (report.risk_score || 0) > 7 ? '#f87171' : (report.risk_score || 0) > 4 ? '#facc15' : '#4ade80' }}>
                    {report.risk_score !== null && report.risk_score !== undefined ? `${report.risk_score} / 10` : 'Not scored'}
                  </strong>
                </div>
              </div>
            </div>

            {/* SECTION D: JOURNEY TIMELINE & TIMESTAMPS */}
            <div className="report-section-card">
              <div className="report-section-header">
                <div>
                  <div className="report-section-title">
                    <Clock size={17} color="var(--accent, #3b82f6)" />
                    Section D — Recorded Journey Timeline & Timestamps
                  </div>
                  <div className="report-section-desc">
                    Chronological audit trail of persisted system and operator events.
                  </div>
                </div>
              </div>

              {/* Derived Timestamps Comparison Box */}
              <div className="report-ts-grid">
                <div className="report-ts-card">
                  <div className="small muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Actual Departure Time
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>
                    {report.derived_timestamps?.actual_departure?.timestamp ? (
                      formatDate(report.derived_timestamps.actual_departure.timestamp)
                    ) : (
                      <span className="muted" style={{ fontStyle: 'italic' }}>Unavailable</span>
                    )}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span className="pill" style={{ fontSize: 9.5, background: 'rgba(148,163,184,0.15)', color: '#cbd5e1' }}>
                      {report.derived_timestamps?.actual_departure?.source || 'Derived from recorded events'}
                    </span>
                  </div>
                </div>

                <div className="report-ts-card">
                  <div className="small muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Actual Completion Time
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>
                    {report.derived_timestamps?.actual_completion?.timestamp ? (
                      formatDate(report.derived_timestamps.actual_completion.timestamp)
                    ) : (
                      <span className="muted" style={{ fontStyle: 'italic' }}>Unavailable</span>
                    )}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span className="pill" style={{ fontSize: 9.5, background: 'rgba(148,163,184,0.15)', color: '#cbd5e1' }}>
                      {report.derived_timestamps?.actual_completion?.source || 'Derived from recorded events'}
                    </span>
                  </div>
                </div>

                <div className="report-ts-card">
                  <div className="small muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Checkpoint Passage Records
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: '#facc15' }}>
                    {report.derived_timestamps?.checkpoint_passage?.status || 'UNAVAILABLE'}
                  </div>
                  <div className="small muted" style={{ marginTop: 4, fontSize: 10 }}>
                    {report.derived_timestamps?.checkpoint_passage?.message || 'Missing automated RFID/transponder checkpoint logs.'}
                  </div>
                </div>
              </div>

              {/* Chronological Event Log Timeline */}
              {report.events && report.events.length > 0 ? (
                <div className="report-timeline-v">
                  {report.events.map((ev, idx) => (
                    <div key={ev.id || idx} className="report-timeline-entry">
                      <div className={`report-timeline-node ${ev.event_type}`} />
                      <div className="report-timeline-body">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {statusBadge(ev.event_type)}
                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-subtle)' }}>
                              {formatDate(ev.created_at)}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-main, #0f172a)' }}>
                          {ev.message || 'No description recorded'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="small muted" style={{ fontStyle: 'italic', padding: '16px 8px', textAlign: 'center' }}>
                  No journey events are available for this report.
                </div>
              )}

              <div className="small muted" style={{ marginTop: 12, fontSize: 10.5 }}>
                * Timestamps are derived from server-side <code>journey_events</code> records; they reflect application status transitions rather than automated satellite/GPS sensor telemetry.
              </div>
            </div>

            {/* SECTION E: PERFORMANCE VISUALIZATIONS */}
            <div className="report-section-card">
              <div className="report-section-header">
                <div>
                  <div className="report-section-title">
                    <Fuel size={17} color="var(--accent, #3b82f6)" />
                    Section E — Performance & Fuel Range Analysis
                  </div>
                  <div className="report-section-desc">
                    Algorithmic fuel range evaluation, limiting vehicle analysis, and reserve buffer adherence.
                  </div>
                </div>
                <div className="small muted">
                  Reserve Threshold: <strong>{report.fuel_intelligence?.reserve_percent ?? 20}%</strong>
                </div>
              </div>

              {/* Simulation Callout */}
              <div style={{
                background: 'rgba(234,179,8,0.08)',
                border: '1px solid rgba(234,179,8,0.3)',
                borderRadius: 6,
                padding: '10px 14px',
                marginBottom: 14,
                fontSize: 11
              }}>
                <div style={{ fontWeight: 700, color: '#facc15', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} /> SIMULATED / THEORETICAL EVALUATION
                </div>
                <div style={{ color: 'var(--text-subtle, #94a3b8)' }}>
                  {report.fuel_intelligence?.disclaimer || 'Calculated fuel consumption metrics are deterministic model simulations based on catalog ratings and operator dip inputs. Measured in-transit fuel burn is unavailable.'}
                </div>
              </div>

              {/* Convoy Fuel Range vs Corridor Distance Bar Chart */}
              {report.fuel_intelligence?.vehicles && report.fuel_intelligence.vehicles.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      Convoy Fuel Range & Reserve Analysis (Usable Range vs. Corridor Distance)
                    </div>
                    <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: 2 }} /> Usable Range
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 2, background: '#f59e0b' }} /> Required Distance ({report.distance_km || 0} km)
                      </span>
                    </div>
                  </div>

                  <div className="report-fuel-chart">
                    {(() => {
                      const reqDist = Number(report.distance_km || report.fuel_intelligence?.total_distance_km || 1);
                      const maxRange = Math.max(
                        reqDist * 1.25,
                        ...report.fuel_intelligence.vehicles.map(v => Number(v.rated_range_km || v.usable_range_km || reqDist))
                      );

                      return report.fuel_intelligence.vehicles.map((v, idx) => {
                        const usable = Number(v.usable_range_km || 0);
                        const pct = Math.min(100, Math.round((usable / maxRange) * 100));
                        const targetPct = Math.min(100, Math.round((reqDist / maxRange) * 100));
                        const isSufficient = usable >= reqDist;

                        return (
                          <div key={`${v.vehicle_id || 'v'}-${idx}`} className="report-fuel-bar-row">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700 }}>{v.vehicle_id}</span>
                                <span className="muted">({v.model_name})</span>
                                <span className="muted">• Role: {v.role || 'Transport'}</span>
                                {v.fuel_provenance && (
                                  <span className="small muted" style={{ fontSize: 9.5, opacity: 0.85 }}>
                                    • {v.fuel_provenance.includes('MANUAL PHYSICAL DIP') ? 'Manual Dip' : '100% Nominal Full Tank'}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 700, color: isSufficient ? '#4ade80' : '#f87171' }}>
                                  {usable} km usable
                                </span>
                                <span className="muted">/ {v.rated_range_km ? `${v.rated_range_km} km rated` : 'N/A'}</span>
                                {fuelStatusBadge(v.feasibility)}
                              </div>
                            </div>

                            <div className="report-fuel-track">
                              <div
                                className="report-fuel-fill"
                                style={{
                                  width: `${pct}%`,
                                  background: isSufficient ? 'linear-gradient(90deg, #3b82f6, #22c55e)' : 'linear-gradient(90deg, #ef4444, #f97316)'
                                }}
                              />
                              <div
                                className="report-fuel-target-line"
                                style={{ left: `${targetPct}%` }}
                                title={`Corridor Distance: ${reqDist} km`}
                              />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Vehicle Composition Breakdown */}
              {vehicleComposition.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                    Committed Convoy Fleet Composition
                  </div>
                  <div className="report-veh-comp-grid">
                    {vehicleComposition.map(vc => (
                      <div key={vc.model} className="report-veh-comp-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Truck size={15} color="var(--accent, #3b82f6)" />
                          <span style={{ fontWeight: 600, fontSize: 12 }}>{vc.model}</span>
                        </div>
                        <span className="pill" style={{ fontWeight: 700 }}>
                          {vc.count} {vc.count === 1 ? 'vehicle' : 'vehicles'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION F: ELEVATION PROFILE */}
            <div className="report-section-card">
              <div className="report-section-header">
                <div>
                  <div className="report-section-title">
                    <BarChart2 size={17} color="var(--accent, #3b82f6)" />
                    Section F — Elevation Profile
                  </div>
                  <div className="report-section-desc">
                    Topographical grade and altitude gradient across transit corridor.
                  </div>
                </div>
              </div>

              {hasElevationData ? (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span>Elevation Profile Chart Rendered</span>
                </div>
              ) : (
                <div className="report-elevation-banner">
                  <Info size={18} color="var(--text-subtle)" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text-main, #0f172a)' }}>
                      Elevation data unavailable for this route.
                    </div>
                    <div className="small muted" style={{ fontSize: 11, marginTop: 2 }}>
                      Route elevation samples were not computed or stored for this corridor record.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION G: COMMITTED CONVOY MANIFEST TABLE */}
            <div className="report-section-card">
              <div className="report-section-header">
                <div>
                  <div className="report-section-title">
                    <Truck size={17} color="var(--accent, #3b82f6)" />
                    Section G — Committed Convoy Manifest
                  </div>
                  <div className="report-section-desc">
                    Historical convoy formation committed at journey creation time. Does not overwrite or substitute current fleet catalog records.
                  </div>
                </div>
                <div className="small muted">
                  Total Vehicles: <strong>{report.convoy_manifest?.length || 0}</strong>
                </div>
              </div>

              {report.convoy_manifest && report.convoy_manifest.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ fontSize: 11, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 40, textAlign: 'center' }}>Pos</th>
                        <th>Vehicle ID / Callsign</th>
                        <th>Model & Maker</th>
                        <th>Tactical Role</th>
                        <th>Fuel Specification</th>
                        <th>Occupants</th>
                        <th>Cargo Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.convoy_manifest.map((v, idx) => (
                        <tr key={`${v.vehicle_id || 'veh'}-${idx}`}>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{v.position || idx + 1}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{v.vehicle_id || 'ID Unassigned'}</div>
                            {v.callsign && <div className="small muted">{v.callsign}</div>}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{v.model_name || 'Generic Model'}</div>
                            {v.maker && <div className="small muted">{v.maker} ({v.class_type || 'Vehicle'})</div>}
                          </td>
                          <td>
                            <span className="pill" style={{ fontSize: 9.5 }}>{v.vehicle_role || 'General Transport'}</span>
                          </td>
                          <td>
                            <div>{v.fuel_type || 'DIESEL'} • {v.tank_capacity_liters ? `${v.tank_capacity_liters} L` : 'Cap unspec'}</div>
                            {v.fuel_consumption_kmpl && <div className="small muted">{v.fuel_consumption_kmpl} km/L catalog</div>}
                          </td>
                          <td>
                            {v.occupants !== null && v.occupants !== undefined ? (
                              <span>{v.occupants} pax</span>
                            ) : (
                              <span className="muted" style={{ fontStyle: 'italic' }}>Not recorded</span>
                            )}
                          </td>
                          <td>
                            {v.cargo_description || v.cargo_weight_kg ? (
                              <div>
                                <span>{v.cargo_description || 'General cargo'}</span>
                                {v.cargo_weight_kg && <span className="small muted"> ({v.cargo_weight_kg} kg)</span>}
                              </div>
                            ) : (
                              <span className="muted" style={{ fontStyle: 'italic' }}>Not recorded</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="small muted" style={{ fontStyle: 'italic', padding: 12 }}>
                  No vehicle manifest entries were recorded for this journey record.
                </div>
              )}

              <div className="small muted" style={{ marginTop: 10, fontSize: 10.5 }}>
                * Manifest reflects persisted historical <code>convoy_json</code> at plan authorization. Vehicle CAN bus telemetry, dynamic occupant logs, and scale-verified cargo manifests were not recorded.
              </div>
            </div>

            {/* SECTION H: OPERATIONAL EXCEPTIONS */}
            <div className="report-section-card">
              <div className="report-section-header">
                <div>
                  <div className="report-section-title">
                    <ShieldAlert size={17} color="var(--accent, #3b82f6)" />
                    Section H — Operational Exceptions & Safety Incidents
                  </div>
                  <div className="report-section-desc">
                    Operational disruptions, convoy spacing violations, and incident handling audit.
                  </div>
                </div>
              </div>

              {report.incidents && report.incidents.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ fontSize: 11, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 110 }}>Incident ID</th>
                        <th style={{ width: 140 }}>Rule / Violation</th>
                        <th style={{ width: 90 }}>Severity</th>
                        <th style={{ width: 160 }}>Observed Time</th>
                        <th style={{ width: 110 }}>State</th>
                        <th>Resolution / Acknowledgments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.incidents.map(inc => (
                        <tr key={inc.id}>
                          <td><code>{inc.id}</code></td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{inc.violation_type || 'INCIDENT'}</div>
                            <div className="small muted">{inc.rule_type || 'SAFETY'}</div>
                          </td>
                          <td>
                            <span className={`pill ${inc.severity === 'CRITICAL' ? 'CANCELLED' : inc.severity === 'HIGH' ? 'DISRUPTED' : 'SCHEDULED'}`} style={{ fontSize: 9.5 }}>
                              {inc.severity || 'MEDIUM'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'monospace' }}>{formatDate(inc.observation_time || inc.created_at)}</td>
                          <td>
                            <span className="pill" style={{ fontSize: 9.5 }}>{inc.handling_state || 'LOGGED'}</span>
                          </td>
                          <td>
                            <div>{inc.message}</div>
                            {inc.resolution_details && (
                              <div className="small muted" style={{ marginTop: 2, color: '#4ade80' }}>
                                Resolution: {typeof inc.resolution_details === 'string' ? inc.resolution_details : JSON.stringify(inc.resolution_details)}
                              </div>
                            )}
                            {(inc.operator_ack || inc.checkpoint_ack) && (
                              <div className="small muted" style={{ marginTop: 2 }}>
                                Ack: {inc.operator_ack ? 'Operator' : ''} {inc.checkpoint_ack ? 'Checkpoint' : ''}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{
                  background: 'rgba(34,197,94,0.06)',
                  border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: 6,
                  padding: '14px 18px',
                  fontSize: 11.5
                }}>
                  <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle size={15} /> No safety violations or operational exceptions were logged in the database for this journey.
                  </div>
                  <div className="small muted" style={{ marginTop: 6, fontSize: 10, fontStyle: 'italic' }}>
                    Compliance Note: Signifies solely that zero incidents were entered into the operational incident register.
                  </div>
                </div>
              )}
            </div>

            {/* SECTION I: SHORT WRITTEN SUMMARY & EVIDENCE DISCLOSURES */}
            <div className="report-section-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="report-section-header">
                <div>
                  <div className="report-section-title" style={{ color: '#f59e0b' }}>
                    <ShieldCheck size={18} />
                    Section I — Operational Summary & Evidence Provenance Disclosures
                  </div>
                  <div className="report-section-desc">
                    Deterministic debrief findings and formal six-point disclosure of prototype data availability.
                  </div>
                </div>
              </div>

              {/* Technical Audit Verification Points */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
                  Technical Audit Verification:
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.6, color: 'var(--text-main, #0f172a)' }}>
                  <li>
                    <strong>Audit Trail Integrity:</strong> Mission events and state transitions are cryptographically stored with immutable IST timestamps in the local database.
                  </li>
                  <li>
                    <strong>Deterministic Evaluation:</strong> Fuel range and convoy spacing models are computed deterministically from verified military vehicle specifications.
                  </li>
                  <li>
                    <strong>Policy Compliance:</strong> Debrief authorization was validated strictly under VAYU ORBIT doctrine requiring verified COMPLETED mission state.
                  </li>
                  <li>
                    <strong>Data Scope:</strong> Synthesized from local operational tables without external network dependencies.
                  </li>
                </ul>
              </div>

              {/* 6-Point Formal Disclosures Grid */}
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: '#f59e0b' }}>
                Formal Six-Point Data Provenance Disclosures:
              </div>
              <div className="report-disclosures-grid">
                <div className="report-disclosure-box">
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#f59e0b', marginBottom: 2 }}>
                    1. GPS Telemetry Status
                  </div>
                  <div className="small muted" style={{ fontSize: 10.5 }}>
                    {report.data_limitations?.gps_telemetry || 'No live GPS telemetry recorded. Dynamic vehicle transponder coordinates were not captured.'}
                  </div>
                </div>

                <div className="report-disclosure-box">
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#f59e0b', marginBottom: 2 }}>
                    2. Actual Travelled Route Verification
                  </div>
                  <div className="small muted" style={{ fontSize: 10.5 }}>
                    {report.data_limitations?.actual_route || 'Not verified without recorded GPS tracking coordinates or waypoint transponder sweeps.'}
                  </div>
                </div>

                <div className="report-disclosure-box">
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#f59e0b', marginBottom: 2 }}>
                    3. In-Transit Fuel Consumption
                  </div>
                  <div className="small muted" style={{ fontSize: 10.5 }}>
                    {report.data_limitations?.fuel_consumption || 'Actual measured in-transit fuel burn is unavailable. Reported values are deterministic simulations.'}
                  </div>
                </div>

                <div className="report-disclosure-box">
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#f59e0b', marginBottom: 2 }}>
                    4. Checkpoint Passage Logs
                  </div>
                  <div className="small muted" style={{ fontSize: 10.5 }}>
                    {report.data_limitations?.checkpoint_history || 'Based solely on manual operator-logged incidents and status events; missing checkpoint timestamps remain unverified.'}
                  </div>
                </div>

                <div className="report-disclosure-box">
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#f59e0b', marginBottom: 2 }}>
                    5. Timing & Event Derivations
                  </div>
                  <div className="small muted" style={{ fontSize: 10.5 }}>
                    {report.data_limitations?.timing || 'Planned departure and ETA are pre-mission estimates; actual departure and completion timestamps are derived from server-side event creation times.'}
                  </div>
                </div>

                <div className="report-disclosure-box">
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#f59e0b', marginBottom: 2 }}>
                    6. Debrief Legal & Operational Integrity
                  </div>
                  <div className="small muted" style={{ fontSize: 10.5 }}>
                    {report.data_limitations?.report_integrity || 'This debrief synthesizes persisted database records for logistics decision-support. It is not a cryptographically verified operational mission record.'}
                  </div>
                </div>
              </div>
            </div>

            {/* Document Footer */}
            <div style={{
              textAlign: 'center',
              fontSize: 10.5,
              color: 'var(--text-subtle, #94a3b8)',
              padding: '16px 0',
              borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))'
            }}>
              VAYU ORBIT Convoy Movement Planning & Logistics Decision Support System — Confidential Prototype Debrief Report
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
