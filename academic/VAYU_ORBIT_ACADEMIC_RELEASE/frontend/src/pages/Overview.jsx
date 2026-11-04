import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import MapView from '../components/MapView';
import { selectOverviewJourney } from '../services/journeySelection';
import {
  Route, CheckCircle2, Clock, Truck, Plus, ChevronRight,
  ExternalLink, RefreshCw, AlertCircle, Maximize2, Minimize2,
  ShieldCheck, Navigation
} from 'lucide-react';

function statusClass(status) {
  const s = String(status || '').toUpperCase();
  const valid = ['SCHEDULED', 'ACTIVE', 'DISRUPTED', 'COMPLETED', 'CANCELLED'];
  return valid.includes(s) ? `pill ${s}` : 'pill';
}

/**
 * Fetch road-following route geometry from TomTom Routing API using corridor path nodes.
 */
async function fetchRoadGeometry(path, nodeDict, apiKey, signal) {
  if (!apiKey || !Array.isArray(path) || path.length < 2) return null;

  const pts = path
    .map((id) => {
      const cleanId = (id || '').replace(/^PLC-/, '');
      return nodeDict[cleanId] || nodeDict[id] || nodeDict[`PLC-${cleanId}`] || null;
    })
    .filter((n) => n && n.lat != null && (n.lon != null || n.lng != null));

  if (pts.length < 2) return null;

  const locs = pts
    .map((p) => `${Number(p.lat)},${Number(p.lon != null ? p.lon : p.lng)}`)
    .join(':');

  const url = `https://api.tomtom.com/routing/1/calculateRoute/${locs}/json?key=${apiKey}&instructionsType=text&language=en-GB`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.routes?.[0];
    if (!r || !r.legs) return null;

    const allCoords = [];
    r.legs.forEach((leg) => {
      if (leg.points) {
        leg.points.forEach((p) => allCoords.push([p.longitude, p.latitude]));
      }
    });

    if (allCoords.length > 0) {
      return {
        type: 'LineString',
        coordinates: allCoords
      };
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('TomTom route geometry lookup failed for overview:', err);
    }
  }
  return null;
}

/**
 * Reusable mathematical SVG Donut chart
 */
function SvgDonut({ total, segments, centerValue, centerLabel, size = 120, strokeWidth = 14 }) {
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
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} className="overview-donut-svg" viewBox={`0 0 ${size} ${size}`}>
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
        <g className="overview-donut-center-text">
          <text
            x={size / 2}
            y={size / 2 - 5}
            className="overview-donut-center-val"
          >
            {centerValue}
          </text>
          <text
            x={size / 2}
            y={size / 2 + 13}
            className="overview-donut-center-lbl"
          >
            {centerLabel}
          </text>
        </g>
      </svg>
    </div>
  );
}

export default function Overview({ setPage, currentUser, onOpenJourney }) {
  const [metricsState, setMetricsState] = useState({
    data: null,
    loading: true,
    error: null,
  });

  const [journeysState, setJourneysState] = useState({
    data: [],
    loading: true,
    error: null,
  });

  const [placesState, setPlacesState] = useState({
    data: [],
    loading: true
  });

  // Selected Tactical Journey and Map Data
  const [selectedJourney, setSelectedJourney] = useState(null);
  const [journeyDetailLoading, setJourneyDetailLoading] = useState(false);
  const [journeyDetailError, setJourneyDetailError] = useState(null);
  const [routeGeom, setRouteGeom] = useState(null);
  const [routeOrigin, setRouteOrigin] = useState(null);
  const [routeDestination, setRouteDestination] = useState(null);
  const [routeWaypoints, setRouteWaypoints] = useState([]);
  const [geometryStatus, setGeometryStatus] = useState('NONE'); // 'PERSISTED' | 'TOMTOM' | 'UNAVAILABLE' | 'NONE'
  const [isFullscreenMap, setIsFullscreenMap] = useState(false);

  // 1. Fetch Analytics Aggregates
  const fetchMetrics = () => {
    setMetricsState(prev => ({ ...prev, loading: true, error: null }));
    api.analytics()
      .then(data => {
        setMetricsState({ data, loading: false, error: null });
      })
      .catch(err => {
        setMetricsState({
          data: null,
          loading: false,
          error: err.message || 'Analytics metrics unavailable',
        });
      });
  };

  // 2. Load full details and route geometry for the selected journey
  const loadJourneyDetails = async (selectedSummary, placesList) => {
    if (!selectedSummary || !selectedSummary.journey_id) {
      setSelectedJourney(null);
      setRouteGeom(null);
      setRouteOrigin(null);
      setRouteDestination(null);
      setRouteWaypoints([]);
      setGeometryStatus('NONE');
      return;
    }

    setJourneyDetailLoading(true);
    setJourneyDetailError(null);

    try {
      const full = await api.journey(selectedSummary.journey_id);
      const merged = { ...selectedSummary, ...(full || {}) };
      setSelectedJourney(merged);

      const placesToUse = Array.isArray(placesList) && placesList.length > 0
        ? placesList
        : placesState.data;

      const nodeDict = {};
      placesToUse.forEach(p => {
        const cleanId = (p.place_id || '').replace(/^PLC-/, '');
        nodeDict[cleanId] = p;
        nodeDict[p.place_id] = p;
      });

      // 1. Origin coordinates & metadata
      const origId = (merged.origin_id || '').replace(/^PLC-/, '');
      const origPlace = nodeDict[origId] || nodeDict[merged.origin_id];
      let originObj = null;
      if (origPlace && origPlace.lat != null && (origPlace.lon != null || origPlace.lng != null)) {
        originObj = {
          lat: Number(origPlace.lat),
          lon: Number(origPlace.lon != null ? origPlace.lon : origPlace.lng),
          place_name: merged.origin_name || origPlace.place_name || origPlace.name
        };
      }
      setRouteOrigin(originObj);

      // 2. Destination coordinates & metadata
      const destId = (merged.dest_id || '').replace(/^PLC-/, '');
      const destPlace = nodeDict[destId] || nodeDict[merged.dest_id];
      let destObj = null;
      if (destPlace && destPlace.lat != null && (destPlace.lon != null || destPlace.lng != null)) {
        destObj = {
          lat: Number(destPlace.lat),
          lon: Number(destPlace.lon != null ? destPlace.lon : destPlace.lng),
          place_name: merged.dest_name || destPlace.place_name || destPlace.name
        };
      }
      setRouteDestination(destObj);

      // 3. Intermediate route waypoints from path
      const path = merged.route?.path || merged.baseline_route?.path || [];
      const intermediateWaypoints = [];
      if (Array.isArray(path) && path.length > 2) {
        for (let i = 1; i < path.length - 1; i++) {
          const pId = (path[i] || '').replace(/^PLC-/, '');
          const wp = nodeDict[pId] || nodeDict[path[i]];
          if (wp && wp.lat != null && (wp.lon != null || wp.lng != null)) {
            intermediateWaypoints.push({
              lat: Number(wp.lat),
              lon: Number(wp.lon != null ? wp.lon : wp.lng),
              installation_name: wp.place_name || wp.name || `Waypoint #${i}`
            });
          }
        }
      }
      setRouteWaypoints(intermediateWaypoints);

      // 4. Resolve Route Geometry
      // Check A: Authoritative persisted road geometry in journey record
      const persistedGeom = merged.route?.geometry;
      if (persistedGeom && Array.isArray(persistedGeom.coordinates) && persistedGeom.coordinates.length > 1) {
        setRouteGeom(persistedGeom);
        setGeometryStatus('PERSISTED');
        return;
      }

      // Check B: Attempt TomTom high-fidelity routing lookup if path has >= 2 nodes
      const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;
      if (apiKey && Array.isArray(path) && path.length >= 2) {
        try {
          const tomtomGeom = await fetchRoadGeometry(path, nodeDict, apiKey);
          if (tomtomGeom && Array.isArray(tomtomGeom.coordinates) && tomtomGeom.coordinates.length > 1) {
            setRouteGeom(tomtomGeom);
            setGeometryStatus('TOMTOM');
            return;
          }
        } catch (e) {
          console.warn('TomTom geometry lookup notice:', e);
        }
      }

      // Check C: If road geometry unavailable, do not fabricate road or straight line
      setRouteGeom(null);
      setGeometryStatus('UNAVAILABLE');
    } catch (err) {
      console.warn('Failed to load journey detail:', err);
      setJourneyDetailError(err.message || 'Journey detail lookup failed');
      setRouteGeom(null);
      setGeometryStatus('UNAVAILABLE');
    } finally {
      setJourneyDetailLoading(false);
    }
  };

  // 3. Fetch Places and Journeys, selecting the active/upcoming movement
  const fetchAllData = async () => {
    setJourneysState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const [placesRes, journeysRes] = await Promise.allSettled([
        api.places('ALL', 'ALL'),
        api.journeys()
      ]);

      let placesList = [];
      if (placesRes.status === 'fulfilled' && Array.isArray(placesRes.value)) {
        placesList = placesRes.value;
        setPlacesState({ data: placesList, loading: false });
      } else {
        setPlacesState({ data: [], loading: false });
      }

      if (journeysRes.status === 'fulfilled') {
        const arr = Array.isArray(journeysRes.value) ? journeysRes.value : [];
        setJourneysState({ data: arr, loading: false, error: null });

        // Select the most relevant journey (Operational > Upcoming > null)
        const selected = selectOverviewJourney(arr, new Date());
        if (selected) {
          loadJourneyDetails(selected, placesList);
        } else {
          setSelectedJourney(null);
          setRouteGeom(null);
          setRouteOrigin(null);
          setRouteDestination(null);
          setRouteWaypoints([]);
          setGeometryStatus('NONE');
        }
      } else {
        const err = journeysRes.reason;
        setJourneysState({
          data: [],
          loading: false,
          error: err?.message || 'Recent journey records unavailable',
        });
        setSelectedJourney(null);
        setRouteGeom(null);
        setRouteOrigin(null);
        setRouteDestination(null);
        setRouteWaypoints([]);
        setGeometryStatus('NONE');
      }
    } catch (err) {
      setJourneysState({
        data: [],
        loading: false,
        error: err.message || 'Failed to retrieve journey records',
      });
      setSelectedJourney(null);
      setRouteGeom(null);
      setRouteOrigin(null);
      setRouteDestination(null);
      setRouteWaypoints([]);
      setGeometryStatus('NONE');
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchAllData();
  }, []);

  const handleOpenJourney = (journeyId) => {
    if (!journeyId) return;
    if (typeof onOpenJourney === 'function') {
      onOpenJourney(journeyId);
    } else if (typeof window.vayuOpenHistoricalJourney === 'function') {
      window.vayuOpenHistoricalJourney(journeyId);
    } else {
      setPage('Journey Operations');
    }
  };

  // Derived verified metrics
  const jData = metricsState.data?.journeys || {};
  const fData = metricsState.data?.fleet || {};

  const totalJourneys = Number(jData.total ?? 0);
  const activeJourneys = Number(jData.active ?? 0);
  const scheduledJourneys = Number(jData.scheduled ?? 0);
  const completedJourneys = Number(jData.completed ?? 0);
  const cancelledJourneys = Number(jData.cancelled ?? 0);

  const fleetTotal = Number(fData.physical_units_total ?? 0);
  const fleetAvail = Number(fData.physical_units_available ?? 0);
  const fleetInOp = Number(fData.physical_units_in_operation ?? 0);
  const fleetMaint = Number(fData.physical_units_maintenance ?? 0);

  // Journey Status Donut Segments
  const journeySegments = useMemo(() => [
    { key: 'active', label: 'Active', value: activeJourneys, color: 'var(--status-active-text)' },
    { key: 'scheduled', label: 'Scheduled', value: scheduledJourneys, color: 'var(--status-scheduled-text)' },
    { key: 'completed', label: 'Completed', value: completedJourneys, color: 'var(--status-success-text)' },
    { key: 'cancelled', label: 'Cancelled', value: cancelledJourneys, color: 'var(--status-neutral-text)' }
  ], [activeJourneys, scheduledJourneys, completedJourneys, cancelledJourneys]);

  // Fleet Availability Donut Segments
  const fleetSegments = useMemo(() => [
    { key: 'available', label: 'Available', value: fleetAvail, color: 'var(--color-primary)' },
    { key: 'in_op', label: 'In Operation', value: fleetInOp, color: 'var(--status-success-text)' },
    { key: 'maintenance', label: 'Maintenance', value: fleetMaint, color: 'var(--status-warning-text)' }
  ], [fleetAvail, fleetInOp, fleetMaint]);

  const primaryActions = (
    <button
      className="btn primary"
      onClick={() => setPage('Journey Planning')}
      title="Plan a new military movement"
    >
      <Plus size={14} />
      <span>Plan Journey</span>
    </button>
  );

  return (
    <Shell
      title="Operations Overview"
      eyebrow="COMMAND & CONTROL"
      description="Real-time strategic convoy tracking, journey lifecycle pipeline, and fleet readiness."
      actions={primaryActions}
    >
      <div className="overview-container">
        {/* ── 1. Top 4 Verified KPI Metric Cards ── */}
        <section className="overview-kpi-grid" aria-label="Key Operational Indicators">
          {/* Card 1: Total Journeys */}
          <div className="overview-kpi-card">
            <div className="overview-kpi-header">
              <span className="overview-kpi-label">Total Journeys</span>
              <div className="overview-kpi-badge badge-total" title="Total logged journeys">
                <Route size={16} />
              </div>
            </div>
            <div className="overview-kpi-body">
              <span className="overview-kpi-value">
                {metricsState.loading ? '—' : totalJourneys.toLocaleString()}
              </span>
              <span className="overview-kpi-sub">
                <span>Logged system movements</span>
              </span>
            </div>
          </div>

          {/* Card 2: Active Convoys */}
          <div className="overview-kpi-card">
            <div className="overview-kpi-header">
              <span className="overview-kpi-label">Active Convoys</span>
              <div className="overview-kpi-badge badge-active" title="Currently deployed convoys">
                <Navigation size={16} />
              </div>
            </div>
            <div className="overview-kpi-body">
              <span className="overview-kpi-value" style={{ color: 'var(--status-success-text)' }}>
                {metricsState.loading ? '—' : activeJourneys.toLocaleString()}
              </span>
              <span className="overview-kpi-sub">
                <span>In transit on tactical corridors</span>
              </span>
            </div>
          </div>

          {/* Card 3: Scheduled Convoys */}
          <div className="overview-kpi-card">
            <div className="overview-kpi-header">
              <span className="overview-kpi-label">Scheduled Convoys</span>
              <div className="overview-kpi-badge badge-scheduled" title="Pending departure order">
                <Clock size={16} />
              </div>
            </div>
            <div className="overview-kpi-body">
              <span className="overview-kpi-value" style={{ color: 'var(--status-scheduled-text)' }}>
                {metricsState.loading ? '—' : scheduledJourneys.toLocaleString()}
              </span>
              <span className="overview-kpi-sub">
                <span>Awaiting departure window</span>
              </span>
            </div>
          </div>

          {/* Card 4: Completed Journeys */}
          <div className="overview-kpi-card">
            <div className="overview-kpi-header">
              <span className="overview-kpi-label">Completed Missions</span>
              <div className="overview-kpi-badge badge-completed" title="Successfully reached destination">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div className="overview-kpi-body">
              <span className="overview-kpi-value">
                {metricsState.loading ? '—' : completedJourneys.toLocaleString()}
              </span>
              <span className="overview-kpi-sub">
                <span>Successfully debriefed</span>
              </span>
            </div>
          </div>
        </section>

        {/* ── 2. Main 2-Column Command Workspace (Left ~65% / Right ~35%) ── */}
        <div className="overview-main-layout">
          {/* ──── LEFT COLUMN: Tactical Map + Proportional Breakdown + Fleet Availability ──── */}
          <div className="overview-left-col">
            {/* Tactical Active / Upcoming Convoys Map Card */}
            <section className="card overview-map-card" aria-label="Tactical Movement Corridor Map">
              <div className="overview-map-header">
                <div className="overview-map-title-group">
                  <h2 className="overview-map-title">
                    {selectedJourney
                      ? (selectedJourney.status === 'ACTIVE'
                          ? 'Active Convoy Movement'
                          : selectedJourney.status === 'DISRUPTED'
                            ? 'Disrupted Convoy — Monitoring'
                            : 'Upcoming Convoy Movement')
                      : 'Tactical Corridor Map'}
                  </h2>

                  {selectedJourney?.status === 'ACTIVE' && (
                    <div className="live-pulse-badge">
                      <span className="live-pulse-dot" />
                      <span>ACTIVE TRANSIT</span>
                    </div>
                  )}

                  {selectedJourney?.status === 'DISRUPTED' && (
                    <span className="pill DISRUPTED" style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>
                      DISRUPTED
                    </span>
                  )}

                  {selectedJourney?.status === 'SCHEDULED' && (
                    <span className="pill SCHEDULED" style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>
                      SCHEDULED
                    </span>
                  )}
                </div>

                <div className="overview-map-controls">
                  {selectedJourney && (selectedJourney.origin_name || selectedJourney.dest_name) ? (
                    <span className="overview-sector-pill">
                      {selectedJourney.origin_name || 'Origin'} → {selectedJourney.dest_name || 'Destination'}
                    </span>
                  ) : (
                    <span className="overview-sector-pill">Northern Sector</span>
                  )}

                  <button
                    className="btn"
                    style={{ padding: '5px 8px' }}
                    onClick={() => { fetchMetrics(); fetchAllData(); }}
                    title="Refresh Movement Data"
                  >
                    <RefreshCw size={13} className={journeysState.loading ? 'spin' : ''} />
                  </button>

                  <button
                    className="btn"
                    style={{ padding: '5px 8px' }}
                    onClick={() => setIsFullscreenMap(v => !v)}
                    title={isFullscreenMap ? 'Exit Fullscreen' : 'Expand Map Frame'}
                  >
                    {isFullscreenMap ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  </button>
                </div>
              </div>

              {/* Synchronized Selected Journey Infobar */}
              {selectedJourney && (
                <div className="overview-journey-infobar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleOpenJourney(selectedJourney.journey_id)}
                      className="btn"
                      style={{
                        fontFamily: "'Share Tech Mono', monospace",
                        fontSize: '11px',
                        padding: '3px 8px',
                        color: 'var(--color-accent-primary)',
                        background: 'var(--color-surface-selected)',
                        border: '1px solid var(--color-border)',
                        cursor: 'pointer'
                      }}
                      title="Open in Journey Operations"
                    >
                      <span>{selectedJourney.journey_id}</span>
                      <ExternalLink size={11} style={{ marginLeft: 5 }} />
                    </button>

                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      {selectedJourney.origin_name || selectedJourney.origin_id || '—'}
                      <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
                      {selectedJourney.dest_name || selectedJourney.dest_id || '—'}
                    </span>

                    <span style={{ color: 'var(--border)' }}>•</span>

                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                      <Clock size={12} />
                      <span>
                        {selectedJourney.status === 'ACTIVE' || selectedJourney.status === 'DISRUPTED' ? 'Departed: ' : 'Departure: '}
                        <strong style={{ color: 'var(--text-main)' }}>
                          {selectedJourney.departure_date ? `${selectedJourney.departure_date} ${selectedJourney.departure_time || ''}` : '—'}
                        </strong>
                      </span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {selectedJourney.convoy && Array.isArray(selectedJourney.convoy) && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                        <Truck size={12} />
                        <strong>{selectedJourney.convoy.length}</strong> {selectedJourney.convoy.length === 1 ? 'vehicle' : 'vehicles'}
                      </span>
                    )}

                    {selectedJourney.distance_km != null && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                        <Route size={12} />
                        <strong>{Number(selectedJourney.distance_km).toFixed(0)} km</strong>
                      </span>
                    )}

                    <span className={statusClass(selectedJourney.status)} style={{ fontSize: '10.5px', padding: '2px 8px' }}>
                      {selectedJourney.status}
                    </span>
                  </div>
                </div>
              )}

              {/* Map Viewport Container with Lifecycle States */}
              <div
                className="overview-map-frame"
                style={{ height: isFullscreenMap ? '540px' : '380px', transition: 'height 0.25s ease' }}
              >
                {/* 1. Loading State */}
                {journeysState.loading && !selectedJourney && (
                  <div className="overview-map-loading">
                    <RefreshCw size={24} className="spin" style={{ color: 'var(--color-accent-primary)' }} />
                    <span>Analyzing operational movements & corridors...</span>
                  </div>
                )}

                {/* 2. Error State */}
                {!journeysState.loading && journeysState.error && !selectedJourney && (
                  <div className="overview-map-error">
                    <AlertCircle size={28} style={{ color: 'var(--bad)', marginBottom: 8 }} />
                    <h3>Tactical Movement Data Unavailable</h3>
                    <p>{journeysState.error}</p>
                    <button className="btn" onClick={fetchAllData} style={{ fontSize: 12 }}>
                      <RefreshCw size={12} /> Retry Connection
                    </button>
                  </div>
                )}

                {/* 3. Empty State (No active or upcoming journeys) */}
                {!journeysState.loading && !journeysState.error && !selectedJourney && (
                  <div className="overview-map-empty">
                    <Navigation size={32} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                    <h3>No Active or Upcoming Convoys</h3>
                    <p>There are currently no active convoys in transit or scheduled movements awaiting departure.</p>
                    <button
                      className="btn primary"
                      onClick={() => setPage('Journey Planning')}
                      title="Plan a new military movement"
                      style={{ fontSize: 12 }}
                    >
                      <Plus size={13} />
                      <span>Plan Journey</span>
                    </button>
                  </div>
                )}

                {/* 4. Active or Upcoming Journey Map Display */}
                {selectedJourney && (
                  <MapView
                    places={placesState.data}
                    routeGeometry={routeGeom}
                    origin={routeOrigin}
                    destination={routeDestination}
                    waypoints={routeWaypoints}
                    cameraMode="overview"
                  />
                )}
              </div>

              {/* Honest Telemetry & Route Source Notice */}
              {selectedJourney && (
                <div className={`overview-telemetry-notice ${
                  selectedJourney.status === 'ACTIVE'
                    ? 'active'
                    : selectedJourney.status === 'DISRUPTED'
                      ? 'warn'
                      : 'info'
                }`}>
                  <ShieldCheck size={14} style={{ flexShrink: 0 }} />
                  <span>
                    {selectedJourney.status === 'SCHEDULED'
                      ? 'Planned Corridor · Convoy awaiting departure window · Displaying approved movement route'
                      : selectedJourney.status === 'DISRUPTED'
                        ? 'Disruption Alert Active · Convoy paused or rerouting · Displaying baseline corridor'
                        : 'Telemetry: Live GPS Tracking Offline · Displaying approved operational corridor'}
                    {geometryStatus === 'UNAVAILABLE' && (
                      <strong style={{ marginLeft: 6, color: 'var(--warn)' }}>
                        (Road-following geometry unavailable · Verified installation markers active)
                      </strong>
                    )}
                  </span>
                </div>
              )}

              {/* Tactical Map Legend */}
              <div className="overview-map-legend">
                <div className="overview-legend-item">
                  <span className="pin pin-o sm" style={{ transform: 'scale(0.8)' }}>A</span>
                  <span>Origin Installation</span>
                </div>
                <div className="overview-legend-item">
                  <span className="pin pin-d sm" style={{ transform: 'scale(0.8)' }}>B</span>
                  <span>Destination Node</span>
                </div>
                {routeWaypoints.length > 0 && (
                  <div className="overview-legend-item">
                    <span className="vayu-node-dot" style={{ display: 'inline-block' }} />
                    <span>Corridor Waypoints</span>
                  </div>
                )}
                <div className="overview-legend-item">
                  <span className="legend-line" />
                  <span>
                    {routeGeom ? 'Approved Road Network' : 'Tactical Corridor Link'}
                  </span>
                </div>
              </div>
            </section>

            {/* Bottom Dual Grid: Journey Lifecycle Breakdown + Fleet Readiness Donut */}
            <div className="overview-bottom-grid">
              {/* Card 2A: Proportional Journey Status Distribution */}
              <div className="card overview-sub-card">
                <div className="overview-card-title-row">
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Journey Distribution</h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Lifecycle Status</span>
                </div>

                {/* Proportional Segmented Bar */}
                <div className="overview-proportional-bar">
                  {totalJourneys > 0 ? (
                    <>
                      <div
                        className="overview-bar-segment seg-active"
                        style={{ width: `${(activeJourneys / totalJourneys) * 100}%` }}
                        title={`Active: ${activeJourneys} (${((activeJourneys / totalJourneys) * 100).toFixed(1)}%)`}
                      />
                      <div
                        className="overview-bar-segment seg-scheduled"
                        style={{ width: `${(scheduledJourneys / totalJourneys) * 100}%` }}
                        title={`Scheduled: ${scheduledJourneys} (${((scheduledJourneys / totalJourneys) * 100).toFixed(1)}%)`}
                      />
                      <div
                        className="overview-bar-segment seg-completed"
                        style={{ width: `${(completedJourneys / totalJourneys) * 100}%` }}
                        title={`Completed: ${completedJourneys} (${((completedJourneys / totalJourneys) * 100).toFixed(1)}%)`}
                      />
                      <div
                        className="overview-bar-segment seg-cancelled"
                        style={{ width: `${(cancelledJourneys / totalJourneys) * 100}%` }}
                        title={`Cancelled: ${cancelledJourneys} (${((cancelledJourneys / totalJourneys) * 100).toFixed(1)}%)`}
                      />
                    </>
                  ) : (
                    <div style={{ width: '100%', background: 'var(--color-surface-secondary)' }} />
                  )}
                </div>

                {/* Legend 2x2 Grid */}
                <div className="overview-breakdown-legend">
                  <div className="overview-breakdown-item">
                    <span className="overview-breakdown-key">
                      <span className="legend-dot cyan" /> Active
                    </span>
                    <span className="overview-breakdown-val">
                      {activeJourneys} ({totalJourneys > 0 ? ((activeJourneys / totalJourneys) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <div className="overview-breakdown-item">
                    <span className="overview-breakdown-key">
                      <span className="legend-dot scheduled" /> Scheduled
                    </span>
                    <span className="overview-breakdown-val">
                      {scheduledJourneys} ({totalJourneys > 0 ? ((scheduledJourneys / totalJourneys) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <div className="overview-breakdown-item">
                    <span className="overview-breakdown-key">
                      <span className="legend-dot emerald" /> Completed
                    </span>
                    <span className="overview-breakdown-val">
                      {completedJourneys} ({totalJourneys > 0 ? ((completedJourneys / totalJourneys) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <div className="overview-breakdown-item">
                    <span className="overview-breakdown-key">
                      <span className="legend-dot cancelled" /> Cancelled
                    </span>
                    <span className="overview-breakdown-val">
                      {cancelledJourneys} ({totalJourneys > 0 ? ((cancelledJourneys / totalJourneys) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2B: Fleet Availability (100% Verified Real Data) */}
              <div className="card overview-sub-card">
                <div className="overview-card-title-row">
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Fleet Availability</h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Readiness State</span>
                </div>

                <div className="overview-donut-container">
                  <SvgDonut
                    total={fleetTotal}
                    segments={fleetSegments}
                    centerValue={fleetTotal.toString()}
                    centerLabel={fleetTotal > 0 && fleetAvail === fleetTotal ? '100% Avail' : 'Units'}
                    size={110}
                    strokeWidth={13}
                  />

                  <div className="overview-donut-legend">
                    <div className="overview-donut-legend-item">
                      <span className="overview-breakdown-key">
                        <span className="legend-dot cyan" /> Available
                      </span>
                      <strong className="overview-breakdown-val">{fleetAvail}</strong>
                    </div>
                    <div className="overview-donut-legend-item">
                      <span className="overview-breakdown-key">
                        <span className="legend-dot emerald" /> In Operation
                      </span>
                      <strong className="overview-breakdown-val">{fleetInOp}</strong>
                    </div>
                    <div className="overview-donut-legend-item">
                      <span className="overview-breakdown-key">
                        <span className="legend-dot amber" /> Maintenance
                      </span>
                      <strong className="overview-breakdown-val">{fleetMaint}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ──── RIGHT COLUMN: Journey Status Donut + Quick Actions + Recent Movements ──── */}
          <div className="overview-right-col">
            {/* 1. Journey Status Donut Card */}
            <section className="card" style={{ padding: '16px 18px' }} aria-label="Journey Status Breakdown">
              <div className="overview-card-title-row">
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Journey Status</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Movements</span>
              </div>

              <div className="overview-donut-container" style={{ padding: '6px 0 12px' }}>
                <SvgDonut
                  total={totalJourneys}
                  segments={journeySegments}
                  centerValue={totalJourneys.toString()}
                  centerLabel="Total"
                  size={120}
                  strokeWidth={14}
                />

                <div className="overview-donut-legend">
                  <div className="overview-donut-legend-item">
                    <span className="overview-breakdown-key">
                      <span className="legend-dot cyan" /> Active
                    </span>
                    <strong className="overview-breakdown-val">{activeJourneys}</strong>
                  </div>
                  <div className="overview-donut-legend-item">
                    <span className="overview-breakdown-key">
                      <span className="legend-dot scheduled" /> Scheduled
                    </span>
                    <strong className="overview-breakdown-val">{scheduledJourneys}</strong>
                  </div>
                  <div className="overview-donut-legend-item">
                    <span className="overview-breakdown-key">
                      <span className="legend-dot emerald" /> Completed
                    </span>
                    <strong className="overview-breakdown-val">{completedJourneys}</strong>
                  </div>
                  <div className="overview-donut-legend-item">
                    <span className="overview-breakdown-key">
                      <span className="legend-dot cancelled" /> Cancelled
                    </span>
                    <strong className="overview-breakdown-val">{cancelledJourneys}</strong>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Quick Actions Card */}
            <section className="card" style={{ padding: '16px 18px' }} aria-label="Quick Actions">
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 10px' }}>Quick Actions</h3>
              <div className="overview-actions-grid">
                <button
                  type="button"
                  className="quick-action-btn action-primary"
                  onClick={() => setPage('Journey Planning')}
                  title="Plan and coordinate a new journey"
                >
                  <Plus size={15} />
                  <span>Plan New Journey</span>
                </button>
                <button
                  type="button"
                  className="quick-action-btn action-secondary"
                  onClick={() => setPage('Fleet Management')}
                  title="Inspect available fleet units and inventory"
                >
                  <Truck size={15} />
                  <span>View Fleet Assets</span>
                </button>
              </div>
            </section>

            {/* 3. Recent Movements List (100% Real Backend Data) */}
            <section className="card" style={{ padding: '16px 18px' }} aria-label="Recent Movement Operations">
              <div className="overview-card-title-row" style={{ marginBottom: '8px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Recent Movements</h3>
                <button
                  className="btn"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  onClick={() => setPage('Journey History')}
                  title="Inspect full movement archive in Journey History"
                >
                  <span>View All</span>
                  <ChevronRight size={12} />
                </button>
              </div>

              {/* Loading State */}
              {journeysState.loading && (
                <div style={{ padding: '16px 0' }}>
                  <div className="overview-skeleton-row" style={{ height: '38px' }} />
                  <div className="overview-skeleton-row" style={{ height: '38px' }} />
                  <div className="overview-skeleton-row" style={{ height: '38px' }} />
                </div>
              )}

              {/* Error State */}
              {!journeysState.loading && journeysState.error && (
                <div className="overview-empty-box" style={{ color: 'var(--bad)' }}>
                  <AlertCircle size={16} style={{ marginBottom: 4 }} />
                  <div>{journeysState.error}</div>
                  <button className="btn" onClick={fetchAllData} style={{ marginTop: 8, fontSize: 11 }}>
                    <RefreshCw size={11} /> Retry
                  </button>
                </div>
              )}

              {/* Empty State */}
              {!journeysState.loading && !journeysState.error && journeysState.data.length === 0 && (
                <div className="overview-empty-box">
                  <p>No journey records logged yet.</p>
                </div>
              )}

              {/* Verified Movement Records */}
              {!journeysState.loading && !journeysState.error && journeysState.data.length > 0 && (
                <div className="overview-movements-list">
                  {journeysState.data.slice(0, 5).map(j => {
                    const origin = j.origin_name || j.origin || '—';
                    const dest = j.dest_name || j.dest || '—';
                    const depDate = j.departure_date || '—';
                    const dist = j.distance_km != null ? `${Number(j.distance_km).toFixed(0)} km` : '—';

                    return (
                      <div
                        key={j.journey_id}
                        className="overview-movement-row"
                        onClick={() => handleOpenJourney(j.journey_id)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open journey ${j.journey_id}`}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpenJourney(j.journey_id);
                          }
                        }}
                      >
                        <div className="overview-movement-left">
                          <span className="overview-movement-path">
                            <span>{origin}</span>
                            <span className="overview-movement-arrow">→</span>
                            <span>{dest}</span>
                          </span>
                          <span className="overview-movement-meta">
                            <span className="mono" style={{ fontSize: '10.5px' }}>{j.journey_id}</span>
                            <span>•</span>
                            <span>{depDate}</span>
                            <span>•</span>
                            <span>{dist}</span>
                          </span>
                        </div>
                        <div>
                          <span className={statusClass(j.status)} style={{ fontSize: '10.5px', padding: '2px 7px' }}>
                            {j.status || 'UNKNOWN'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </Shell>
  );
}
