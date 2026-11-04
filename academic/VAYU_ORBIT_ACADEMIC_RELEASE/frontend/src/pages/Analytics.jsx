import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import {
  Route, CheckCircle2, Activity, Truck, RefreshCw, AlertCircle,
  ExternalLink, ChevronRight, Layers, ShieldCheck, MapPin,
  Calendar, ArrowRight, Info
} from 'lucide-react';

function statusClass(status) {
  const s = String(status || '').toUpperCase();
  const valid = ['SCHEDULED', 'ACTIVE', 'DISRUPTED', 'COMPLETED', 'CANCELLED'];
  return valid.includes(s) ? `pill ${s}` : 'pill';
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch {
    return isoStr.slice(5, 10);
  }
}

/**
 * Reusable mathematical SVG Donut chart
 */
function AnalyticsDonut({ total, segments, centerValue, centerLabel, size = 130, strokeWidth = 14 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const renderedSegments = useMemo(() => {
    if (!total || total <= 0) {
      return [{
        key: 'empty',
        color: 'var(--color-surface-secondary)',
        dashArray: `${circumference} 0`,
        dashOffset: 0
      }];
    }

    let currentOffset = 0;
    return segments.map(seg => {
      const segLength = (seg.value / total) * circumference;
      const item = {
        key: seg.key,
        color: seg.color,
        dashArray: `${segLength} ${circumference - segLength}`,
        dashOffset: -currentOffset
      };
      currentOffset += segLength;
      return item;
    });
  }, [total, segments, circumference]);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} className="analytics-donut-svg" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="var(--color-surface-secondary)"
          strokeWidth={strokeWidth}
        />
        {renderedSegments.map(s => (
          <circle
            key={s.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeDasharray={s.dashArray}
            strokeDashoffset={s.dashOffset}
            strokeLinecap="round"
          />
        ))}
        <g className="analytics-donut-center-text">
          <text
            x={size / 2}
            y={size / 2 - 4}
            className="analytics-donut-center-val"
          >
            {centerValue}
          </text>
          <text
            x={size / 2}
            y={size / 2 + 13}
            className="analytics-donut-center-lbl"
          >
            {centerLabel}
          </text>
        </g>
      </svg>
    </div>
  );
}

export default function Analytics({ currentUser, setPage, onOpenJourney }) {
  const [data, setData] = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [activeTooltip, setActiveTooltip] = useState(null);

  const fetchAll = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      api.analytics(),
      api.journeys()
    ])
      .then(([analyticsRes, journeysRes]) => {
        setData(analyticsRes);
        setJourneys(Array.isArray(journeysRes) ? journeysRes : []);
        setLoading(false);
        setLastRefreshed(new Date().toLocaleTimeString('en-GB', { hour12: false }));
      })
      .catch(err => {
        setError(err.message || 'Unable to retrieve analytics data.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleOpenJourney = (journeyId) => {
    if (!journeyId) return;
    if (typeof onOpenJourney === 'function') {
      onOpenJourney(journeyId);
    } else if (typeof window.vayuOpenHistoricalJourney === 'function') {
      window.vayuOpenHistoricalJourney(journeyId);
    } else if (typeof setPage === 'function') {
      setPage('Journey Operations');
    } else {
      window.dispatchEvent(new CustomEvent('vayu_navigate', { detail: 'Journey Operations' }));
    }
  };

  // 1. Extract verified numbers
  const jMetrics = data?.journeys || {};
  const fMetrics = data?.fleet || {};
  const pMetrics = data?.places || {};
  const incMetrics = data?.incidents || {};

  const totalJourneys = Number(jMetrics.total ?? (data?.journeys_total ?? journeys.length));
  const activeJourneys = Number(jMetrics.active ?? 0);
  const scheduledJourneys = Number(jMetrics.scheduled ?? 0);
  const completedJourneys = Number(jMetrics.completed ?? (data?.completed ?? 0));
  const cancelledJourneys = Number(jMetrics.cancelled ?? 0);
  const disruptedJourneys = Number(jMetrics.disrupted ?? (data?.disrupted ?? 0));

  const physicalUnits = Number(fMetrics.physical_units_total ?? 4);
  const unitsAvailable = Number(fMetrics.physical_units_available ?? 4);
  const unitsInOp = Number(fMetrics.physical_units_in_operation ?? 0);
  const unitsMaint = Number(fMetrics.physical_units_maintenance ?? 0);
  const unitsAssigned = Number(fMetrics.physical_units_assigned ?? 0);
  const unitsRetired = Number(fMetrics.physical_units_retired ?? 0);
  const catalogueModels = Number(fMetrics.catalogue_models ?? (data?.vehicles ?? 7));

  const totalPlaces = Number(pMetrics.total ?? (data?.places_total ?? 116));
  const activePlaces = Number(pMetrics.active ?? (data?.active_places ?? 116));
  const inactivePlaces = Number(pMetrics.inactive ?? 0);

  const totalIncidents = Number(incMetrics.total ?? 0);
  const openIncidents = Number(incMetrics.open ?? 0);
  const resolvedIncidents = Number(incMetrics.resolved ?? 0);
  const resolutionRate = Number(incMetrics.resolution_rate_percent ?? 0);

  // 2. Real Time-Series Aggregation from Actual created_at Timestamps
  const timelineData = useMemo(() => {
    if (!Array.isArray(journeys) || journeys.length === 0) return [];

    const map = new Map();
    journeys.forEach(j => {
      if (!j.created_at) return;
      const dateStr = j.created_at.slice(0, 10); // 'YYYY-MM-DD'
      if (!map.has(dateStr)) {
        map.set(dateStr, { date: dateStr, count: 0, completed: 0, active: 0, scheduled: 0 });
      }
      const entry = map.get(dateStr);
      entry.count += 1;
      if (j.status === 'COMPLETED') entry.completed += 1;
      if (j.status === 'ACTIVE') entry.active += 1;
      if (j.status === 'SCHEDULED') entry.scheduled += 1;
    });

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [journeys]);

  // Timeline SVG calculations
  const timelineChart = useMemo(() => {
    if (timelineData.length === 0) return null;

    const width = 560;
    const height = 180;
    const padding = { top: 24, right: 24, bottom: 28, left: 45 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const maxCount = Math.max(...timelineData.map(d => d.count), 1);
    // Round to a clean upper grid bound
    const yMax = Math.ceil(maxCount / 20) * 20;

    const yTicks = [0, Math.round(yMax * 0.25), Math.round(yMax * 0.5), Math.round(yMax * 0.75), yMax];

    const numBars = timelineData.length;
    const slotW = plotW / numBars;
    const barWidth = Math.min(32, Math.max(14, slotW * 0.62));

    const bars = timelineData.map((d, i) => {
      const x = padding.left + (i + 0.5) * slotW - barWidth / 2;
      const barH = (d.count / yMax) * plotH;
      const y = padding.top + plotH - barH;
      return {
        ...d,
        x,
        y,
        width: barWidth,
        height: Math.max(barH, 3),
        centerX: x + barWidth / 2
      };
    });

    return {
      width,
      height,
      padding,
      plotW,
      plotH,
      yMax,
      yTicks,
      bars
    };
  }, [timelineData]);

  // 3. Journey Status Donut Segments
  const statusSegments = useMemo(() => [
    { key: 'scheduled', label: 'Scheduled', value: scheduledJourneys, color: 'var(--status-scheduled-text)' },
    { key: 'active', label: 'Active', value: activeJourneys, color: 'var(--status-active-text)' },
    { key: 'completed', label: 'Completed', value: completedJourneys, color: 'var(--status-success-text)' },
    { key: 'cancelled', label: 'Cancelled', value: cancelledJourneys, color: 'var(--status-neutral-text)' },
    { key: 'disrupted', label: 'Disrupted', value: disruptedJourneys, color: 'var(--status-warning-text)' }
  ], [scheduledJourneys, activeJourneys, completedJourneys, cancelledJourneys, disruptedJourneys]);

  // 4. Fleet Status Breakdown Bars
  const fleetStatusList = useMemo(() => [
    { label: 'Available', count: unitsAvailable, color: 'var(--color-primary)' },
    { label: 'In Operation', count: unitsInOp, color: 'var(--status-success-text)' },
    { label: 'Maintenance', count: unitsMaint, color: 'var(--status-warning-text)' },
    { label: 'Assigned', count: unitsAssigned, color: 'var(--status-scheduled-text)' },
    { label: 'Retired', count: unitsRetired, color: 'var(--status-neutral-text)' }
  ], [unitsAvailable, unitsInOp, unitsMaint, unitsAssigned, unitsRetired]);

  const headerActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {lastRefreshed && (
        <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', fontFamily: 'Share Tech Mono, monospace' }}>
          UPDATED {lastRefreshed} IST
        </span>
      )}
      <button
        className="btn"
        onClick={fetchAll}
        disabled={loading}
        title="Refresh analytics metrics from database"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}
      >
        <RefreshCw size={13} className={loading ? 'spin' : ''} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        <span>{loading ? 'Refreshing…' : 'Refresh Data'}</span>
      </button>
    </div>
  );

  return (
    <Shell
      title="Analytics"
      eyebrow="OPERATIONAL INTELLIGENCE"
      description="Operational overview of journey activity and fleet status."
      actions={headerActions}
    >
      <div className="analytics-container">
        {/* Error Notification */}
        {error && !data && (
          <div className="card" style={{ padding: 20, borderColor: 'var(--bad)', background: 'var(--bad-dim)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <AlertCircle size={20} color="var(--bad)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', margin: '0 0 4px' }}>
                  DATABASE ANALYTICS UNAVAILABLE
                </h3>
                <p style={{ fontSize: 12.5, color: 'var(--text-main)', margin: '0 0 10px' }}>{error}</p>
                <button className="btn primary" onClick={fetchAll} style={{ fontSize: 12, padding: '5px 12px' }}>
                  <RefreshCw size={12} style={{ marginRight: 5 }} /> Retry Query
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 1. KPI Row (Compact 4-Card Grid) ── */}
        <section className="analytics-kpi-grid" aria-label="Executive Key Metrics">
          {/* Card 1: Total Journeys */}
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">
              <span className="analytics-kpi-label">Total Journeys</span>
              <div className="analytics-kpi-badge badge-total" title="Total logged movements">
                <Route size={16} />
              </div>
            </div>
            <div className="analytics-kpi-body">
              <span className="analytics-kpi-value">
                {loading ? '—' : totalJourneys.toLocaleString()}
              </span>
              <span className="analytics-kpi-sub">
                All persisted movement orders
              </span>
            </div>
          </div>

          {/* Card 2: Active Journeys */}
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">
              <span className="analytics-kpi-label">Active Journeys</span>
              <div className="analytics-kpi-badge badge-active" title="Convoys in active movement">
                <Activity size={16} />
              </div>
            </div>
            <div className="analytics-kpi-body">
              <span className="analytics-kpi-value" style={{ color: 'var(--color-success)' }}>
                {loading ? '—' : activeJourneys.toLocaleString()}
              </span>
              <span className="analytics-kpi-sub">
                Convoys in transit on corridors
              </span>
            </div>
          </div>

          {/* Card 3: Completed Journeys */}
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">
              <span className="analytics-kpi-label">Completed Journeys</span>
              <div className="analytics-kpi-badge badge-completed" title="Missions completed">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div className="analytics-kpi-body">
              <span className="analytics-kpi-value">
                {loading ? '—' : completedJourneys.toLocaleString()}
              </span>
              <span className="analytics-kpi-sub">
                Successfully reached destination
              </span>
            </div>
          </div>

          {/* Card 4: Fleet Units */}
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">
              <span className="analytics-kpi-label">Fleet Readiness</span>
              <div className="analytics-kpi-badge badge-fleet" title="Physical fleet readiness">
                <Truck size={16} />
              </div>
            </div>
            <div className="analytics-kpi-body">
              <span className="analytics-kpi-value">
                {loading ? '—' : `${unitsAvailable} / ${physicalUnits}`}
              </span>
              <span className="analytics-kpi-sub">
                {unitsAvailable === physicalUnits ? '100% Available' : `${unitsAvailable} Available`} • {catalogueModels} Models
              </span>
            </div>
          </div>
        </section>

        {/* ── 2. Main Dashboard Content Grid ── */}
        <div className="analytics-main-grid">
          {/* ──── LEFT COLUMN: Timeline Activity + Recent Journeys Table ──── */}
          <div className="analytics-left-col">
            {/* Journey Activity Timeline Card */}
            <section className="analytics-chart-card" aria-label="Journey Activity Timeline">
              <div className="analytics-card-header">
                <div className="analytics-card-title-group">
                  <h2 className="analytics-card-title">Journey Activity Timeline</h2>
                  <span className="analytics-card-sub">
                    Logged movements grouped by persisted creation date ({timelineData.length} active dates)
                  </span>
                </div>
                {timelineData.length > 0 && (
                  <span className="pill" style={{ fontSize: 11, fontFamily: 'Share Tech Mono, monospace' }}>
                    {totalJourneys} MOVEMENTS LOGGED
                  </span>
                )}
              </div>

              {/* Time-Series SVG Chart */}
              {timelineChart && (
                <div className="analytics-timeline-wrap" style={{ position: 'relative' }}>
                  <svg
                    viewBox={`0 0 ${timelineChart.width} ${timelineChart.height}`}
                    className="analytics-timeline-svg"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {/* Horizontal Gridlines & Y-Axis Labels */}
                    {timelineChart.yTicks.map(val => {
                      const y = timelineChart.padding.top + timelineChart.plotH -
                        (val / timelineChart.yMax) * timelineChart.plotH;
                      return (
                        <g key={`y-${val}`}>
                          <line
                            x1={timelineChart.padding.left}
                            y1={y}
                            x2={timelineChart.width - timelineChart.padding.right}
                            y2={y}
                            className="analytics-timeline-gridline"
                          />
                          <text
                            x={timelineChart.padding.left - 8}
                            y={y + 3.5}
                            className="analytics-timeline-axis-label"
                            textAnchor="end"
                          >
                            {val}
                          </text>
                        </g>
                      );
                    })}

                    {/* Bars & X-Axis Labels */}
                    {timelineChart.bars.map((b) => (
                      <g
                        key={`bar-${b.date}`}
                        onMouseEnter={() => setActiveTooltip(b)}
                        onMouseLeave={() => setActiveTooltip(null)}
                      >
                        <rect
                          x={b.x}
                          y={b.y}
                          width={b.width}
                          height={b.height}
                          rx={3}
                          className="analytics-timeline-bar"
                          style={{
                            fill: activeTooltip?.date === b.date ? 'var(--color-accent-primary)' : 'var(--color-accent-secondary)'
                          }}
                        />
                        {/* Value label above bar */}
                        <text
                          x={b.centerX}
                          y={b.y - 6}
                          className="analytics-timeline-bar-val"
                        >
                          {b.count}
                        </text>
                        {/* Date label on X axis */}
                        <text
                          x={b.centerX}
                          y={timelineChart.height - 8}
                          className="analytics-timeline-axis-label"
                          textAnchor="middle"
                        >
                          {formatDate(b.date)}
                        </text>
                      </g>
                    ))}
                  </svg>

                  {/* Contextual Hover Detail Banner */}
                  {activeTooltip && (
                    <div style={{
                      position: 'absolute',
                      top: 10,
                      right: 14,
                      background: 'var(--color-surface)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 4,
                      padding: '4px 10px',
                      fontSize: 11,
                      boxShadow: 'var(--card-shadow)',
                      display: 'flex',
                      gap: 12
                    }}>
                      <span><strong>{activeTooltip.date}:</strong> {activeTooltip.count} Journeys</span>
                      <span style={{ color: 'var(--color-accent-primary)' }}>Active: {activeTooltip.active}</span>
                      <span style={{ color: 'var(--color-success)' }}>Completed: {activeTooltip.completed}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Empty state if no timeline records */}
              {!loading && timelineData.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                  No historical journey activity records found in the database.
                </div>
              )}
            </section>

            {/* Recent Operational Journeys Table */}
            <section className="analytics-chart-card" aria-label="Recent Operational Movements">
              <div className="analytics-card-header">
                <div className="analytics-card-title-group">
                  <h2 className="analytics-card-title">Recent Operational Movements</h2>
                  <span className="analytics-card-sub">
                    Latest records persisted in military logistics database
                  </span>
                </div>
                <button
                  className="btn"
                  style={{ fontSize: 11.5, padding: '4px 10px' }}
                  onClick={() => {
                    if (typeof setPage === 'function') setPage('Journey History');
                    else window.dispatchEvent(new CustomEvent('vayu_navigate', { detail: 'Journey History' }));
                  }}
                  title="Inspect all journey records in Journey History"
                >
                  <span>Full Archive</span>
                  <ChevronRight size={12} />
                </button>
              </div>

              {journeys.length > 0 ? (
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Movement</th>
                        <th>Journey ID</th>
                        <th>Scheduled Departure</th>
                        <th>Distance</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journeys.slice(0, 7).map(j => {
                        const origin = j.origin_name || j.origin || '—';
                        const dest = j.dest_name || j.dest || '—';
                        const dep = j.departure_date ? `${j.departure_date} ${j.departure_time || ''}`.trim() : '—';
                        const dist = j.distance_km != null ? `${Number(j.distance_km).toFixed(0)} km` : '—';

                        return (
                          <tr
                            key={j.journey_id}
                            className="analytics-table-row"
                            onClick={() => handleOpenJourney(j.journey_id)}
                            title={`Inspect ${j.journey_id} in Journey Operations`}
                          >
                            <td>
                              <div className="analytics-path-cell">
                                <span>{origin}</span>
                                <span className="analytics-path-arrow">→</span>
                                <span>{dest}</span>
                              </div>
                            </td>
                            <td>
                              <span className="mono" style={{ fontSize: 11 }}>{j.journey_id}</span>
                            </td>
                            <td>
                              <span style={{ fontSize: 11.5 }}>{dep}</span>
                            </td>
                            <td>
                              <span className="mono" style={{ fontSize: 11.5 }}>{dist}</span>
                            </td>
                            <td>
                              <span className={statusClass(j.status)} style={{ fontSize: 10.5, padding: '2px 7px' }}>
                                {j.status || 'UNKNOWN'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="btn"
                                style={{ padding: '3px 8px', fontSize: 11 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenJourney(j.journey_id);
                                }}
                                title="Open in Operations"
                              >
                                <ExternalLink size={11} style={{ marginRight: 4 }} /> Open
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  No recent journey records found.
                </div>
              )}
            </section>
          </div>

          {/* ──── RIGHT COLUMN: Status Donut + Fleet Status + Safety/Network ──── */}
          <div className="analytics-right-col">
            {/* 1. Journey Status Distribution Donut */}
            <section className="analytics-chart-card" aria-label="Journey Status Distribution">
              <div className="analytics-card-header">
                <div className="analytics-card-title-group">
                  <h2 className="analytics-card-title">Journey Status Distribution</h2>
                  <span className="analytics-card-sub">
                    Verified breakdown across all {totalJourneys} recorded journeys
                  </span>
                </div>
              </div>

              <div className="analytics-donut-container">
                <AnalyticsDonut
                  total={totalJourneys}
                  segments={statusSegments}
                  centerValue={totalJourneys.toString()}
                  centerLabel="Total"
                  size={130}
                  strokeWidth={14}
                />

                <div className="analytics-donut-legend">
                  {statusSegments.map(s => {
                    const pct = totalJourneys > 0 ? ((s.value / totalJourneys) * 100).toFixed(1) : '0.0';
                    return (
                      <div key={s.key} className="analytics-donut-legend-item">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                          <span className="analytics-legend-dot" style={{ background: s.color }} />
                          {s.label}
                        </span>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
                          {s.value} ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 2. Fleet Status Breakdown (Horizontal Bar Chart) */}
            <section className="analytics-chart-card" aria-label="Fleet Status Breakdown">
              <div className="analytics-card-header">
                <div className="analytics-card-title-group">
                  <h2 className="analytics-card-title">Fleet Status Breakdown</h2>
                  <span className="analytics-card-sub">
                    Physical serialized vehicles ({physicalUnits} active units)
                  </span>
                </div>
                <span className="pill" style={{ fontSize: 11, fontFamily: 'Share Tech Mono, monospace' }}>
                  {unitsAvailable} AVAILABLE
                </span>
              </div>

              <div className="analytics-fleet-list">
                {fleetStatusList.map(st => {
                  const pct = physicalUnits > 0 ? (st.count / physicalUnits) * 100 : 0;
                  return (
                    <div key={st.label} className="analytics-fleet-row">
                      <div className="analytics-fleet-meta">
                        <span className="analytics-fleet-status-name">
                          <span className="analytics-legend-dot" style={{ background: st.color }} />
                          {st.label}
                        </span>
                        <span className="analytics-fleet-status-count">
                          {st.count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="analytics-fleet-bar-track">
                        <div
                          className="analytics-fleet-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: st.color
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="analytics-fleet-note">
                <strong>Inventory Note:</strong> Reflects {physicalUnits} serialized physical units in active service ledger across {catalogueModels} technical model blueprints in `vehicle_master`.
              </div>
            </section>

            {/* 3. Safety Incidents & Tactical Network Coverage */}
            <section className="analytics-chart-card" aria-label="Safety & Network Coverage">
              <div className="analytics-card-header">
                <div className="analytics-card-title-group">
                  <h2 className="analytics-card-title">Network & Safety Telemetry</h2>
                  <span className="analytics-card-sub">
                    Simulation nodes and safety observation metrics
                  </span>
                </div>
              </div>

              <div className="analytics-safety-grid">
                <div className="analytics-safety-item">
                  <span className="analytics-safety-label">Tactical Nodes</span>
                  <span className="analytics-safety-value" style={{ color: 'var(--color-primary)' }}>
                    {totalPlaces}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
                    {activePlaces} Active in Graph
                  </span>
                </div>

                <div className="analytics-safety-item">
                  <span className="analytics-safety-label">Logged Incidents</span>
                  <span className="analytics-safety-value" style={{ color: totalIncidents > 0 ? 'var(--color-warning-text)' : 'var(--color-success)' }}>
                    {totalIncidents}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
                    {openIncidents} Open • {resolvedIncidents} Resolved
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Shell>
  );
}
