import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import MapView from '../components/MapView';
import {
  Search,
  ExternalLink,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  Download,
  Calendar,
  Truck,
  Shield,
  Clock,
  Compass,
  MapPin,
  X,
  Layers,
  AlertTriangle,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

const PAGE_SIZE = 15;
const KNOWN_STATUSES = ['ALL', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DISRUPTED'];

function statusPill(s) {
  const cls = {
    SCHEDULED: 'SCHEDULED',
    ACTIVE: 'ACTIVE',
    DISRUPTED: 'DISRUPTED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED'
  };
  return <span className={`pill ${cls[s] || ''}`}>{s || 'UNKNOWN'}</span>;
}

function formatDateDisplay(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch {}
  return d;
}

function formatIsoTimestamp(iso) {
  if (!iso) return '—';
  try {
    const dt = new Date(iso);
    if (!isNaN(dt.getTime())) {
      const d = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const t = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      return `${d} ${t}`;
    }
  } catch {}
  return String(iso).replace('T', ' ').slice(0, 19);
}

export default function History({ onOpenJourney, onOpenReport, currentUser }) {
  const [data, setData] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search & Filter State
  const [q, setQ] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  // Selected Journey State
  const [selectedJourneyId, setSelectedJourneyId] = useState(null);
  const [selectedJourney, setSelectedJourney] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');

  // Load summary journeys list from existing endpoint
  const loadData = () => {
    setLoading(true);
    setError('');
    api.journeys()
      .then(res => {
        setData(Array.isArray(res) ? res : []);
      })
      .catch(err => {
        setError(err.message || 'Failed to load journey history.');
      })
      .finally(() => setLoading(false));
  };

  // Load places for coordinate mapping if geometry exists
  useEffect(() => {
    api.places('?status=ACTIVE')
      .then(raw => {
        if (Array.isArray(raw)) setPlaces(raw);
      })
      .catch(() => {});
    loadData();
  }, []);

  // When selectedJourneyId changes, load full detail
  useEffect(() => {
    if (!selectedJourneyId) {
      setSelectedJourney(null);
      setDetailError('');
      return;
    }

    let active = true;
    setDetailLoading(true);
    setDetailError('');
    setPdfMsg('');

    api.journey(selectedJourneyId)
      .then(full => {
        if (!active) return;
        setSelectedJourney(full);
      })
      .catch(err => {
        if (!active) return;
        setDetailError(err.message || `Failed to fetch details for ${selectedJourneyId}.`);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedJourneyId]);

  // Compute status counts across loaded genuine data
  const statusCounts = useMemo(() => {
    const counts = { ALL: data.length };
    data.forEach(j => {
      const st = j.status || 'UNKNOWN';
      counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }, [data]);

  // Combined filtering: text search, status, and departure date
  const filteredRows = useMemo(() => {
    return data.filter(j => {
      // 1. Status filter
      if (selectedStatus !== 'ALL' && j.status !== selectedStatus) {
        return false;
      }

      // 2. Date filter (departure date match)
      if (dateFilter) {
        const depDate = (j.departure_date || '').trim();
        if (!depDate.startsWith(dateFilter)) {
          return false;
        }
      }

      // 3. Text query search (Trip ID, origin, destination, status, date)
      if (!q.trim()) return true;
      const queryStr = q.toLowerCase();
      const origin = (j.origin_name || j.origin_id || '').toLowerCase();
      const dest = (j.dest_name || j.dest_id || '').toLowerCase();
      const jid = (j.journey_id || '').toLowerCase();
      const st = (j.status || '').toLowerCase();
      const depDate = (j.departure_date || '').toLowerCase();

      return (
        jid.includes(queryStr) ||
        origin.includes(queryStr) ||
        dest.includes(queryStr) ||
        st.includes(queryStr) ||
        depDate.includes(queryStr)
      );
    });
  }, [data, selectedStatus, dateFilter, q]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pagedRows = filteredRows.slice(startIndex, startIndex + PAGE_SIZE);

  const handleStatusChange = (status) => {
    setSelectedStatus(status);
    setPage(1);
  };

  const handleSearchChange = (e) => {
    setQ(e.target.value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setQ('');
    setSelectedStatus('ALL');
    setDateFilter('');
    setPage(1);
  };

  // Download debrief PDF action
  const handleDownloadPdf = async (journeyId) => {
    if (!journeyId) return;
    setDownloadingPdf(true);
    setPdfMsg('');
    try {
      const { blob, filename } = await api.downloadJourneyReportPdf(journeyId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setPdfMsg('PDF debrief exported successfully.');
    } catch (err) {
      setPdfMsg(`Export error: ${err.message || 'Failed to download report.'}`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const hasActiveFilters = Boolean(q.trim() || selectedStatus !== 'ALL' || dateFilter);

  // Selected journey resolved coordinates for MapView if geometry exists
  const originPlace = useMemo(() => {
    if (!selectedJourney || !places.length) return null;
    return places.find(p => p.place_id === selectedJourney.origin_id || p.id === selectedJourney.origin_id) || null;
  }, [selectedJourney, places]);

  const destPlace = useMemo(() => {
    if (!selectedJourney || !places.length) return null;
    return places.find(p => p.place_id === selectedJourney.dest_id || p.id === selectedJourney.dest_id) || null;
  }, [selectedJourney, places]);

  return (
    <Shell
      title="Journey History"
      eyebrow="MANAGEMENT · AUDIT TRAIL"
      description="Search and review recorded convoy journeys."
    >
      <div className="history-container">
        {/* ── Search & Filter Toolbar ── */}
        <div className="history-toolbar" role="search" aria-label="Journey filter toolbar">
          <div className="history-search-row">
            <div className="history-search-inputs">
              <div className="history-input-wrap">
                <Search size={14} className="history-search-icon" />
                <input
                  className="history-search-input"
                  placeholder="Search Trip ID, origin, destination, status…"
                  value={q}
                  onChange={handleSearchChange}
                  aria-label="Search journeys"
                />
                {q && (
                  <button
                    type="button"
                    className="history-clear-btn"
                    onClick={() => { setQ(''); setPage(1); }}
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="history-date-wrap" title="Filter by departure date">
                <Calendar size={13} color="var(--text-muted)" />
                <input
                  type="date"
                  className="history-date-input"
                  value={dateFilter}
                  onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
                  aria-label="Filter by departure date"
                />
                {dateFilter && (
                  <button
                    type="button"
                    className="history-clear-btn"
                    onClick={() => { setDateFilter(''); setPage(1); }}
                    title="Clear date"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="history-toolbar-actions">
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn"
                  onClick={handleClearFilters}
                  style={{ fontSize: 11, padding: '6px 10px' }}
                >
                  Reset Filters
                </button>
              )}
              <button
                type="button"
                className="btn"
                disabled={loading}
                onClick={loadData}
                style={{ fontSize: 11, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Refresh recorded journey records"
              >
                <RefreshCw size={12} className={loading ? 'spin' : ''} />
                <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Status Tabs */}
          <div className="history-status-row" role="tablist" aria-label="Filter by journey status">
            {KNOWN_STATUSES.map(st => {
              const count = statusCounts[st] || 0;
              const isActive = selectedStatus === st;
              return (
                <button
                  key={st}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`history-status-tab${isActive ? ' active' : ''}`}
                  onClick={() => handleStatusChange(st)}
                >
                  <span>{st}</span>
                  <span className="history-tab-count">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="alert danger-alert" role="alert">
            {error}
          </div>
        )}

        {/* ── Main Two-Column Content ── */}
        <div className="history-workspace">
          {/* Left Column: Journey Records Table (60–65%) */}
          <div className="history-table-card">
            <div className="history-table-header">
              <h2 className="history-table-title">Operational Records</h2>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Share Tech Mono', monospace" }}>
                {filteredRows.length} {filteredRows.length === 1 ? 'record' : 'records'}
              </span>
            </div>

            <div className="history-table-scroll">
              <table className="history-table" aria-label="Journey operational records">
                <thead>
                  <tr>
                    <th>Trip ID</th>
                    <th>Corridor Movement</th>
                    <th>Departure</th>
                    <th>Status</th>
                    <th>Distance</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map(j => {
                    const isSelected = selectedJourneyId === j.journey_id;
                    const isDebriefAuthorized = j.status === 'COMPLETED';

                    return (
                      <tr
                        key={j.journey_id}
                        className={`history-row${isSelected ? ' is-selected' : ''}`}
                        onClick={() => setSelectedJourneyId(j.journey_id)}
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedJourneyId(j.journey_id);
                          }
                        }}
                        aria-selected={isSelected}
                      >
                        <td>
                          <span className="history-id-mono">{j.journey_id}</span>
                        </td>
                        <td>
                          <div className="history-movement-cell">
                            <span>{j.origin_name || j.origin_id || '—'}</span>
                            <span className="history-arrow">→</span>
                            <span>{j.dest_name || j.dest_id || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="history-date-cell">
                            {j.departure_date ? formatDateDisplay(j.departure_date) : '—'}
                            {j.departure_time ? ` ${j.departure_time}` : ''}
                          </div>
                        </td>
                        <td>{statusPill(j.status)}</td>
                        <td>
                          <span className="history-dist-cell">
                            {j.distance_km != null ? `${Number(j.distance_km).toFixed(1)} km` : '—'}
                          </span>
                        </td>
                        <td>
                          {isDebriefAuthorized ? (
                            <button
                              type="button"
                              className="btn history-action-btn"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedJourneyId(j.journey_id);
                                if (onOpenReport) onOpenReport(j.journey_id);
                                else if (onOpenJourney) onOpenJourney(j.journey_id);
                              }}
                              title={`Inspect ${j.journey_id} debrief report`}
                            >
                              <FileText size={11} /> Debrief
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn history-action-btn"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedJourneyId(j.journey_id);
                                if (onOpenJourney) onOpenJourney(j.journey_id);
                              }}
                              title={`Open ${j.journey_id} in Mission Operations`}
                            >
                              <ExternalLink size={11} /> Inspect
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!pagedRows.length && !loading && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                        No journey records match the selected filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredRows.length > 0 && (
              <div className="history-pagination">
                <div className="history-pagination-info">
                  Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, filteredRows.length)} of {filteredRows.length} journeys
                  {selectedStatus !== 'ALL' ? ` · ${selectedStatus}` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={safePage <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    title="Previous page"
                  >
                    <ChevronLeft size={12} /> Prev
                  </button>
                  <span style={{ fontSize: 11, padding: '0 6px', fontFamily: "'Share Tech Mono', monospace" }}>
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    title="Next page"
                  >
                    Next <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Selected Journey Details Panel (35–40%) */}
          <div className="history-detail-card" aria-live="polite">
            {!selectedJourneyId && (
              <div className="history-empty-detail">
                <div className="history-empty-icon">
                  <Compass size={22} />
                </div>
                <h3 className="history-empty-title">Select a journey to view its details.</h3>
                <p className="history-empty-subtitle">
                  Click on any journey row in the operational records table to inspect corridor telemetry, assigned convoy units, historical route geometry, and event timeline.
                </p>
              </div>
            )}

            {selectedJourneyId && detailLoading && (
              <div className="history-empty-detail">
                <RefreshCw size={24} className="spin" color="var(--accent)" />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Loading recorded telemetry for {selectedJourneyId}…
                </p>
              </div>
            )}

            {selectedJourneyId && detailError && !detailLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="history-detail-header">
                  <span className="history-id-mono">{selectedJourneyId}</span>
                  <button
                    type="button"
                    className="history-close-btn"
                    onClick={() => setSelectedJourneyId(null)}
                    title="Deselect"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="alert danger-alert">
                  {detailError}
                </div>
              </div>
            )}

            {selectedJourney && !detailLoading && (
              <>
                {/* A. Journey Identification Header */}
                <div className="history-detail-header">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="history-detail-id">
                      <span>{selectedJourney.journey_id}</span>
                      {statusPill(selectedJourney.status)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="history-close-btn"
                    onClick={() => setSelectedJourneyId(null)}
                    title="Close details panel"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Primary Action Buttons */}
                <div className="history-detail-actions">
                  {selectedJourney.status === 'COMPLETED' ? (
                    <button
                      type="button"
                      className="btn primary"
                      style={{ fontSize: 11, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      onClick={() => {
                        if (onOpenReport) onOpenReport(selectedJourney.journey_id);
                        else if (onOpenJourney) onOpenJourney(selectedJourney.journey_id);
                      }}
                      title="Open full debrief compliance report"
                    >
                      <FileText size={12} /> Debrief Report
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn primary"
                      style={{ fontSize: 11, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      onClick={() => {
                        if (onOpenJourney) onOpenJourney(selectedJourney.journey_id);
                      }}
                      title="Open in Mission Operations interface"
                    >
                      <ExternalLink size={12} /> Mission Operations
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 11, padding: '6px 11px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    disabled={downloadingPdf}
                    onClick={() => handleDownloadPdf(selectedJourney.journey_id)}
                    title="Download debrief PDF"
                  >
                    <Download size={12} className={downloadingPdf ? 'spin' : ''} />
                    <span>{downloadingPdf ? 'Exporting…' : 'Export PDF'}</span>
                  </button>
                </div>

                {pdfMsg && (
                  <div style={{ fontSize: 11, color: pdfMsg.includes('error') ? 'var(--bad)' : 'var(--ok)', padding: '2px 0' }}>
                    {pdfMsg}
                  </div>
                )}

                {/* Corridor Movement Banner */}
                <div className="history-detail-movement">
                  <span className="history-movement-label">Tactical Corridor</span>
                  <div className="history-movement-path">
                    <MapPin size={13} color="var(--accent)" />
                    <span>{selectedJourney.origin_name || selectedJourney.origin_id || 'Origin'}</span>
                    <span className="history-arrow">→</span>
                    <span>{selectedJourney.dest_name || selectedJourney.dest_id || 'Destination'}</span>
                  </div>
                  <div className="history-movement-dates">
                    <span>Departure: {selectedJourney.departure_date ? formatDateDisplay(selectedJourney.departure_date) : 'Unscheduled'}</span>
                    {selectedJourney.departure_time && <span> · {selectedJourney.departure_time}</span>}
                    {selectedJourney.created_at && (
                      <span style={{ color: 'var(--text-subtle)', display: 'block', marginTop: 2 }}>
                        Created: {formatIsoTimestamp(selectedJourney.created_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* B. Summary Metric Cards */}
                <div>
                  <h3 className="history-section-title">
                    <Layers size={12} /> Mission Summary
                  </h3>
                  <div className="history-detail-grid">
                    <div className="history-metric-box">
                      <span className="history-metric-lbl">Total Distance</span>
                      <span className="history-metric-val">
                        {selectedJourney.distance_km != null ? `${Number(selectedJourney.distance_km).toFixed(1)} km` : '—'}
                      </span>
                    </div>

                    <div className="history-metric-box">
                      <span className="history-metric-lbl">Est. Transit Time</span>
                      <span className="history-metric-val">
                        {selectedJourney.eta_hours != null ? `${Number(selectedJourney.eta_hours).toFixed(1)} h` : '—'}
                      </span>
                    </div>

                    <div className="history-metric-box">
                      <span className="history-metric-lbl">Corridor Risk</span>
                      <span
                        className="history-metric-val"
                        style={{
                          color: selectedJourney.risk >= 40 ? 'var(--bad)' : selectedJourney.risk >= 20 ? 'var(--warn)' : 'var(--ok)'
                        }}
                      >
                        {selectedJourney.risk != null ? selectedJourney.risk : '—'}
                      </span>
                    </div>

                    <div className="history-metric-box">
                      <span className="history-metric-lbl">Convoy Manifest</span>
                      <span className="history-metric-val">
                        {Array.isArray(selectedJourney.convoy) ? selectedJourney.convoy.length : 0} units
                      </span>
                    </div>
                  </div>
                </div>

                {/* Assigned Convoy Manifest */}
                {Array.isArray(selectedJourney.convoy) && selectedJourney.convoy.length > 0 && (
                  <div>
                    <h3 className="history-section-title">
                      <Truck size={12} /> Assigned Convoy Units ({selectedJourney.convoy.length})
                    </h3>
                    <div className="history-vehicles-list">
                      {selectedJourney.convoy.map((v, idx) => (
                        <div key={v.uid || v.vehicle_id || idx} className="history-vehicle-item">
                          <div>
                            <span className="history-vehicle-id">{v.vehicle_id || `UNIT-${idx + 1}`}</span>
                            <span className="history-vehicle-name">
                              {v.model_name || v.maker || 'Vehicle'}
                            </span>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Share Tech Mono', monospace" }}>
                            {v.class_type ? `[${v.class_type}]` : ''} {v.gvw_tons ? `${v.gvw_tons}t` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* C. Historical Route Map */}
                <div>
                  <h3 className="history-section-title">
                    <Compass size={12} /> Historical Route Map
                  </h3>
                  {selectedJourney.route?.geometry ? (
                    <div className="history-map-container">
                      <MapView
                        places={places}
                        routeGeometry={selectedJourney.route.geometry}
                        origin={originPlace}
                        destination={destPlace}
                        cameraMode="overview"
                      />
                    </div>
                  ) : (
                    <div className="history-map-unavailable">
                      <Compass size={20} color="var(--text-subtle)" />
                      <p className="history-map-msg">
                        Historical route geometry is unavailable for this record.
                      </p>
                      {Array.isArray(selectedJourney.route?.path) && selectedJourney.route.path.length > 0 && (
                        <div>
                          <span style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>
                            Recorded Corridor Nodes:
                          </span>
                          <div className="history-waypoints-trail">
                            {selectedJourney.route.path.map((node, i) => (
                              <React.Fragment key={node}>
                                <span className="history-waypoint-chip">{node}</span>
                                {i < selectedJourney.route.path.length - 1 && <span style={{ color: 'var(--text-subtle)' }}>→</span>}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* D. Chronological Journey Event Timeline */}
                <div>
                  <h3 className="history-section-title">
                    <Clock size={12} /> Recorded Event Timeline
                  </h3>
                  {Array.isArray(selectedJourney.events) && selectedJourney.events.length > 0 ? (
                    <div className="history-timeline">
                      {selectedJourney.events.map(ev => (
                        <div key={ev.id} className="history-timeline-item">
                          <span className={`history-timeline-dot ${ev.event_type || ''}`} />
                          <div className="history-timeline-header">
                            <span className="history-timeline-type">{ev.event_type || 'EVENT'}</span>
                            <span className="history-timeline-time">{formatIsoTimestamp(ev.created_at)}</span>
                          </div>
                          <p className="history-timeline-msg">{ev.message || 'Operational update logged.'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="history-map-unavailable" style={{ padding: 12 }}>
                      <p className="history-map-msg">
                        No operational timeline events recorded for this journey.
                      </p>
                    </div>
                  )}
                </div>

                {/* Incident History (if any) */}
                {Array.isArray(selectedJourney.incidents) && selectedJourney.incidents.length > 0 && (
                  <div>
                    <h3 className="history-section-title" style={{ color: 'var(--warn)' }}>
                      <AlertTriangle size={12} /> Logged Incidents ({selectedJourney.incidents.length})
                    </h3>
                    <div className="history-vehicles-list">
                      {selectedJourney.incidents.map(inc => (
                        <div key={inc.id} className="history-vehicle-item" style={{ borderLeft: '2px solid var(--bad)' }}>
                          <div>
                            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: 'var(--bad)' }}>
                              [{inc.severity || 'INCIDENT'}]
                            </span>
                            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-main)' }}>
                              {inc.title || inc.description || 'Reported incident'}
                            </span>
                          </div>
                          <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: "'Share Tech Mono', monospace" }}>
                            {formatIsoTimestamp(inc.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
