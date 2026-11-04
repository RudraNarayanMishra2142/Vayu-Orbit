import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import MapView from '../components/MapView';
import StepProgress from '../components/planning/StepProgress';
import VoramAssessmentPanel, { getVoramCategoryInfo } from '../components/planning/VoramAssessmentPanel';
import {
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Truck,
  Scale,
  Gauge,
  Zap,
  RotateCcw,
  Info,
  Layers,
  MapPin,
  ArrowRight
} from 'lucide-react';

function riskColor(score) {
  if (score == null || score <= 0) return 'var(--text-muted)';
  if (score < 10) return 'var(--ok)';
  if (score < 25) return 'var(--warn)';
  return 'var(--bad)';
}

function modeLabel(mode) {
  if (!mode) return 'TACTICAL ROUTE';
  if (mode === 'balanced') return 'BALANCED CORRIDOR';
  if (mode === 'fastest') return 'FASTEST TRANSIT';
  if (mode === 'lowest_risk') return 'MINIMAL RISK';
  return mode.replace('_', ' ').toUpperCase();
}

const PRESET_SCENARIOS = [
  {
    id: 'landslide',
    label: 'Landslide near Hindon AFS (AF-01)',
    text: 'Severe landslide near AF-01 has closed road corridor.'
  },
  {
    id: 'bridge',
    label: 'Bridge Restriction: 20t Safe Limit',
    text: 'Bridge restriction on corridor: safe vehicle weight limit 20 tonnes.'
  },
  {
    id: 'weather',
    label: 'Monsoon Flooding: 1.8x Delay Multiplier',
    text: 'Heavy monsoon flooding and torrential rain causing 1.8x transit delay.'
  },
  {
    id: 'traffic',
    label: 'Highway Congestion: Traffic +65%',
    text: 'Severe civil traffic congestion: traffic increased by 65%.'
  }
];

/**
 * Fetch road-following route geometry from TomTom Routing API
 * using intermediate military waypoints along the tactical corridor path.
 */
async function fetchRoadGeometry(path, nodeDict, apiKey, signal) {
  if (!apiKey || !Array.isArray(path) || path.length < 2) return null;

  const pts = path
    .map((id) => {
      const cleanId = (id || '').replace('PLC-', '');
      return nodeDict[cleanId] || nodeDict[id] || null;
    })
    .filter((n) => n && n.lat != null && (n.lon != null || n.lng != null));

  if (pts.length < 2) return null;

  const locs = pts
    .map((p) => `${Number(p.lat)},${Number(p.lon != null ? p.lon : p.lng)}`)
    .join(':');

  const url = `https://api.tomtom.com/routing/1/calculateRoute/${locs}/json?key=${apiKey}`;

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
        coordinates: allCoords,
        distanceKm: r.summary?.lengthInMeters ? (r.summary.lengthInMeters / 1000).toFixed(1) : null,
        etaHours: r.summary?.travelTimeInSeconds ? (r.summary.travelTimeInSeconds / 3600).toFixed(1) : null
      };
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('TomTom road geometry lookup failed for path:', path, err);
    }
  }
  return null;
}

function RouteAssessment({ mission, setMission, setPage }) {
  const [nodeDict, setNodeDict] = useState(mission.placeMap || {});
  const [routes, setRoutes] = useState(mission.routes || []);
  const [selected, setSelected] = useState(mission.route || (mission.routes && mission.routes[0]) || null);
  const [routeGeometries, setRouteGeometries] = useState({});
  const [geometriesLoading, setGeometriesLoading] = useState(false);
  const [geometrySource, setGeometrySource] = useState('');

  // Baseline preservation for SITREP disruption & recovery
  const [baselineRoutes, setBaselineRoutes] = useState(null);
  const [baselineSelected, setBaselineSelected] = useState(null);
  const [baselineGeometries, setBaselineGeometries] = useState(null);

  const [sitrep, setSitrep] = useState('');
  const [activeChip, setActiveChip] = useState(null);
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [activeTab, setActiveTab] = useState('alternatives'); // 'alternatives' | 'legs' | 'convoy'

  const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;

  // Derive governing convoy constraints with automatic calculation from convoy manifest
  const computedConstraints = useMemo(() => {
    if (!Array.isArray(mission.convoy) || mission.convoy.length === 0) {
      return {
        speedKmh: Number(mission.convoy_speed_kmh) || 0,
        maxTons: Number(mission.max_vehicle_tons) || 0,
        totalWeight: Number(mission.total_convoy_weight) || 0
      };
    }
    let maxWeight = 0;
    let minSpeed = Infinity;
    let totalW = 0;
    mission.convoy.forEach((v) => {
      const gross = Number(v.gvw_tons || 0) + Number(v.payload || 0);
      const speed = Number(v.max_speed_kmh || 999);
      totalW += gross;
      if (gross > maxWeight) maxWeight = gross;
      if (speed < minSpeed) minSpeed = speed;
    });
    return {
      speedKmh: Number(mission.convoy_speed_kmh) || (minSpeed !== Infinity ? minSpeed : 60),
      maxTons: Number(mission.max_vehicle_tons) || maxWeight,
      totalWeight: Number(mission.total_convoy_weight) || totalW
    };
  }, [mission.convoy, mission.convoy_speed_kmh, mission.max_vehicle_tons, mission.total_convoy_weight]);

  const speedKmh = computedConstraints.speedKmh;
  const maxTons = computedConstraints.maxTons;

  // 1. Ensure node dictionary is fully populated from Place & Node APIs
  useEffect(() => {
    let active = true;
    Promise.all([
      api.places().catch(() => []),
      api.nodes().catch(() => ({}))
    ]).then(([placeList, nodesObj]) => {
      if (!active) return;
      const map = { ...(mission.placeMap || {}) };

      if (Array.isArray(placeList)) {
        placeList.forEach((p) => {
          const cleanId = (p.place_id || '').replace('PLC-', '');
          map[p.place_id] = p;
          map[cleanId] = p;
        });
      }

      if (nodesObj && typeof nodesObj === 'object') {
        Object.entries(nodesObj).forEach(([id, n]) => {
          if (!map[id]) {
            map[id] = {
              place_id: id,
              place_name: n.installation_name || id,
              installation_name: n.installation_name || id,
              lat: n.lat,
              lon: n.lon,
              max_axle_load_tons: n.max_axle_load_tons,
              delay_multiplier: n.delay_multiplier,
              clearance_time_mins: n.clearance_time_mins
            };
          }
        });
      }

      setNodeDict(map);
    });

    return () => {
      active = false;
    };
  }, []);

  // 2. Concurrently fetch high-fidelity road geometries from TomTom for all route alternatives
  useEffect(() => {
    if (!apiKey || !routes || routes.length === 0 || Object.keys(nodeDict).length === 0) {
      return;
    }

    const ctl = new AbortController();
    let active = true;
    setGeometriesLoading(true);

    Promise.all(
      routes.map(async (r, idx) => {
        const pathKey = r.path?.join('-') || `path_${idx}`;
        const modeKey = r.mode || `option_${idx}`;
        const geom = await fetchRoadGeometry(r.path, nodeDict, apiKey, ctl.signal);
        return { pathKey, modeKey, geom };
      })
    )
      .then((results) => {
        if (!active) return;
        const geomMap = {};
        let successCount = 0;
        results.forEach(({ pathKey, modeKey, geom }) => {
          if (geom) {
            geomMap[pathKey] = geom;
            geomMap[modeKey] = geom;
            successCount += 1;
          }
        });
        setRouteGeometries(geomMap);
        setGeometrySource(
          successCount > 0
            ? 'High-Fidelity Road Network (TomTom Routing API)'
            : 'Tactical Corridor Simulation (Linear Corridor Fallback)'
        );
      })
      .catch((err) => {
        if (!active) return;
        console.warn('Road geometry batch resolution error:', err);
      })
      .finally(() => {
        if (active) setGeometriesLoading(false);
      });

    return () => {
      active = false;
      ctl.abort();
    };
  }, [routes, nodeDict, apiKey]);

  // Synchronize initial routes/selected if mission updates externally
  useEffect(() => {
    if (mission.routes && mission.routes.length > 0 && routes.length === 0) {
      setRoutes(mission.routes);
      setSelected(mission.route || mission.routes[0]);
    }
  }, [mission.routes, mission.route]);

  // Assess fresh tactical routes from backend
  const assess = async () => {
    if (!speedKmh || speedKmh <= 0 || !maxTons || maxTons <= 0 || !mission.origin || !mission.dest) {
      setMsg('Convoy parameters missing. Please re-validate convoy in Convoy Builder.');
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const r = await api.route({
        origin_id: mission.origin,
        dest_id: mission.dest,
        convoy_speed_kmh: speedKmh,
        max_vehicle_tons: maxTons
      });
      if (r.status === 'ROUTE_UNAVAILABLE' || !r.routes || r.routes.length === 0) {
        setMsg(r.message || 'No feasible route for this convoy configuration.');
        setRoutes([]);
        setSelected(null);
        setMission({ ...mission, routes: [], route: null });
        return;
      }
      setRoutes(r.routes);
      setSelected(r.selected_route);
      setMission({ ...mission, routes: r.routes, route: r.selected_route });
      setBaselineRoutes(null);
      setBaselineSelected(null);
      setBaselineGeometries(null);
      setIntel(null);
    } catch (e) {
      setMsg(e.message || 'Failed to assess route.');
    } finally {
      setLoading(false);
    }
  };

  // Recalculate routes with simulated SITREP disruption
  const recalc = async () => {
    if (!speedKmh || speedKmh <= 0 || !maxTons || maxTons <= 0) {
      setMsg('Convoy parameters missing. Please re-validate convoy in Convoy Builder.');
      return;
    }
    if (!sitrep || sitrep.trim().length < 5) {
      setMsg('Please enter a valid SITREP description (minimum 5 characters).');
      return;
    }

    setLoading(true);
    setMsg('');

    // Capture baseline prior to disruption for one-click restore and delta comparison
    if (!baselineRoutes) {
      setBaselineRoutes(routes);
      setBaselineSelected(selected);
      setBaselineGeometries(routeGeometries);
    }

    try {
      const r = await api.recalc({
        origin_id: mission.origin,
        dest_id: mission.dest,
        convoy_speed_kmh: speedKmh,
        max_vehicle_tons: maxTons,
        sitrep
      });

      setIntel(r);

      if (r.status === 'ROUTE_LOST' || !r.updated?.routes || r.updated.routes.length === 0) {
        setMsg(r.message || 'CRITICAL ROUTE SEVERANCE: All viable corridors blocked by simulated disruption.');
        // Preserve baseline so user can review the disruption impact and restore cleanly
        return;
      }

      // Fetch fresh road geometries specifically for updated routes
      const newGeomMap = {};
      if (apiKey && r.updated?.routes) {
        setGeometriesLoading(true);
        await Promise.all(
          r.updated.routes.map(async (upRoute, idx) => {
            const pathKey = upRoute.path?.join('-') || `path_${idx}`;
            const modeKey = upRoute.mode || `option_${idx}`;
            const geom = await fetchRoadGeometry(upRoute.path, nodeDict, apiKey);
            if (geom) {
              newGeomMap[pathKey] = geom;
              newGeomMap[modeKey] = geom;
            }
          })
        );
        setGeometriesLoading(false);
      }

      // Atomically set new geometries and routes so baseline geometry is never presented as recalculated
      setRouteGeometries(newGeomMap);
      setRoutes(r.updated.routes);
      setSelected(r.updated.selected_route);
      setMission({ ...mission, routes: r.updated.routes, route: r.updated.selected_route });
    } catch (e) {
      setMsg(e.message || 'Failed to recalculate route.');
    } finally {
      setLoading(false);
    }
  };

  // Restore original planning routes before disruption
  const restoreBaseline = () => {
    if (!baselineRoutes) return;
    setRoutes(baselineRoutes);
    setSelected(baselineSelected);
    if (baselineGeometries) {
      setRouteGeometries(baselineGeometries);
    }
    setMission({ ...mission, routes: baselineRoutes, route: baselineSelected });
    setBaselineRoutes(null);
    setBaselineSelected(null);
    setBaselineGeometries(null);
    setIntel(null);
    setSitrep('');
    setActiveChip(null);
    setMsg('');
  };

  // 3. Bridge & Corridor Infrastructure Bottleneck Calculation
  const bridgeAnalysis = useMemo(() => {
    if (!selected || !selected.path || selected.path.length === 0) {
      return null;
    }

    let minLimit = Infinity;
    let bottleneckNode = null;
    const pathNodes = [];

    selected.path.forEach((id) => {
      const cleanId = (id || '').replace('PLC-', '');
      const n = nodeDict[cleanId] || nodeDict[id] || nodeDict[`PLC-${cleanId}`];
      if (n) {
        pathNodes.push(n);
        const limit = Number(
          n.max_axle_load_tons != null
            ? n.max_axle_load_tons
            : n.max_vehicle_tons != null
            ? n.max_vehicle_tons
            : 0
        );
        if (limit > 0 && limit < minLimit) {
          minLimit = limit;
          bottleneckNode = n;
        }
      }
    });

    if (minLimit === Infinity) {
      return {
        bottleneckLimit: 0,
        bottleneckName: 'Unrestricted Military Corridor',
        safetyMargin: 99,
        status: 'CLEAR',
        statusText: 'No Restricting Bridge Limits Recorded'
      };
    }

    const margin = minLimit - maxTons;
    let status = 'CLEAR';
    let statusText = `Simulated Clearance (+${margin.toFixed(1)} t margin)`;

    if (margin < 0) {
      status = 'EXCEEDED';
      statusText = `Simulated Deficit: -${Math.abs(margin).toFixed(1)} t vs Node Limit`;
    } else if (margin < 3.0) {
      status = 'MARGINAL';
      statusText = `Marginal Clearance Window (+${margin.toFixed(1)} t)`;
    }

    return {
      bottleneckLimit: minLimit,
      bottleneckName: bottleneckNode?.installation_name || bottleneckNode?.place_name || 'Corridor Crossing',
      bottleneckId: bottleneckNode?.node_id || bottleneckNode?.place_id,
      safetyMargin: margin,
      status,
      statusText
    };
  }, [selected, nodeDict, maxTons]);

  // 4. Governing Vehicle Constraints in Convoy
  const convoyConstraints = useMemo(() => {
    if (!Array.isArray(mission.convoy) || mission.convoy.length === 0) {
      return null;
    }

    let governingWeightVehicle = null;
    let governingSpeedVehicle = null;
    let maxVehicleGross = 0;
    let minVehicleSpeed = Infinity;

    mission.convoy.forEach((v) => {
      const gross = Number(v.gvw_tons || 0) + Number(v.payload || 0);
      const speed = Number(v.max_speed_kmh || 999);

      if (gross > maxVehicleGross) {
        maxVehicleGross = gross;
        governingWeightVehicle = v;
      }
      if (speed < minVehicleSpeed) {
        minVehicleSpeed = speed;
        governingSpeedVehicle = v;
      }
    });

    return {
      governingWeightVehicle,
      governingSpeedVehicle,
      governingWeight: maxVehicleGross,
      governingSpeed: minVehicleSpeed
    };
  }, [mission.convoy]);

  // Map view properties
  const selectedKey = selected?.path?.join('-') || selected?.mode || 'default';
  const selectedGeometry = routeGeometries[selectedKey] || (selected?.mode ? routeGeometries[selected.mode] : null);

  // Alternative route geometries for distinguishable rendering
  const alternativeGeometries = useMemo(() => {
    return routes
      .filter((r) => (r.path?.join('-') || r.mode) !== selectedKey)
      .map((r) => routeGeometries[r.path?.join('-')] || (r.mode ? routeGeometries[r.mode] : null))
      .filter(Boolean);
  }, [routes, selectedKey, routeGeometries]);

  // Intermediate route waypoints
  const waypoints = useMemo(() => {
    if (!selected || !selected.path) return [];
    return selected.path
      .map((id) => {
        const cleanId = (id || '').replace('PLC-', '');
        return nodeDict[cleanId] || nodeDict[id];
      })
      .filter(Boolean);
  }, [selected, nodeDict]);

  // Endpoint places
  const originNode = useMemo(() => {
    const origId = (mission.origin || '').replace('PLC-', '');
    return nodeDict[origId] || nodeDict[mission.origin] || null;
  }, [nodeDict, mission.origin]);

  const destNode = useMemo(() => {
    const dstId = (mission.dest || '').replace('PLC-', '');
    return nodeDict[dstId] || nodeDict[mission.dest] || null;
  }, [nodeDict, mission.dest]);

  // Fallback legacy points
  const pts = useMemo(() => {
    return (
      selected?.path
        ?.map((id) => {
          const cleanId = (id || '').replace('PLC-', '');
          const n = nodeDict[cleanId] || nodeDict[id];
          return n && n.lat != null && n.lon != null ? [n.lat, n.lon] : null;
        })
        .filter(Boolean) || []
    );
  }, [selected, nodeDict]);

  // EMPTY / INVALID STATE HANDLING
  if (!mission.origin || !mission.dest || !mission.convoy || mission.convoy.length === 0) {
    return (
      <Shell
        title="Route Assessment"
        eyebrow="STEP 3 OF 5 · ROUTE ASSESSMENT"
        description="Compare corridor alternatives, review bridge constraints, and evaluate terrain risks."
      >
        <StepProgress current={3} total={5} />

        <div className="card" style={{ maxWidth: 640, margin: '40px auto', padding: '32px 28px', textAlign: 'center' }}>
          <ShieldAlert size={48} color="var(--warn)" style={{ margin: '0 auto 16px', display: 'block' }} />
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Convoy & Route Parameters Required</h2>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
            Route Assessment requires a designated origin, destination, and configured convoy manifest from Steps 1 and 2.
            Please configure your mission parameters before evaluating corridor routing options.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn" onClick={() => setPage('Journey Planning')}>
              ← Step 1: Planning
            </button>
            <button className="btn primary" onClick={() => setPage('Convoy Builder')}>
              ← Step 2: Convoy Builder
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="Route Assessment"
      eyebrow="STEP 3 OF 5 · ROUTE ASSESSMENT"
      description="Compare corridor alternatives, review bridge constraints, and evaluate terrain risks."
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          {baselineRoutes && (
            <button className="btn" onClick={restoreBaseline} title="Revert to baseline routes prior to simulated disruption">
              <RotateCcw size={13} /> Restore Baseline
            </button>
          )}
          <button className="btn" disabled={loading} onClick={assess}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Recalculate
          </button>
        </div>
      }
    >
      <StepProgress current={3} total={5} />

      <div className="vayu-ra-grid">
        {/* LEFT COLUMN: Controls, Alternatives, Bridge Clearance & SITREP */}
        <div>
          {/* Corridor Infrastructure Telemetry Bar */}
          <div className="vayu-ra-metrics-bar">
            {/* Governing Axle Load */}
            <div className="vayu-ra-metric-card">
              <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Scale size={11} /> Governing Axle Load
              </div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: 'var(--warn)', marginTop: 2 }}>
                {maxTons.toFixed(1)} t
              </div>
              {convoyConstraints?.governingWeightVehicle && (
                <div style={{ fontSize: 9.5, color: 'var(--text-subtle)', fontFamily: "'Share Tech Mono', monospace", marginTop: 2 }}>
                  {convoyConstraints.governingWeightVehicle.model_name}
                </div>
              )}
            </div>

            {/* Convoy Speed Ceiling */}
            <div className="vayu-ra-metric-card">
              <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Gauge size={11} /> Convoy Speed Ceiling
              </div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: 'var(--ok)', marginTop: 2 }}>
                {speedKmh} km/h
              </div>
              {convoyConstraints?.governingSpeedVehicle && (
                <div style={{ fontSize: 9.5, color: 'var(--text-subtle)', fontFamily: "'Share Tech Mono', monospace", marginTop: 2 }}>
                  {convoyConstraints.governingSpeedVehicle.model_name}
                </div>
              )}
            </div>

            {/* Corridor Bridge Clearance */}
            {bridgeAnalysis && (
              <div className="vayu-ra-metric-card">
                <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ShieldCheck size={11} /> Corridor Load Limit
                </div>
                <div
                  style={{
                    fontFamily: "'Orbitron',monospace",
                    fontSize: 18,
                    fontWeight: 700,
                    color: bridgeAnalysis.status === 'CLEAR' ? 'var(--ok)' : bridgeAnalysis.status === 'MARGINAL' ? 'var(--warn)' : 'var(--bad)',
                    marginTop: 2
                  }}
                >
                  {bridgeAnalysis.bottleneckLimit > 0 ? `${bridgeAnalysis.bottleneckLimit} t` : 'UNRESTRICTED'}
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    fontFamily: "'Share Tech Mono', monospace",
                    color: bridgeAnalysis.status === 'CLEAR' ? 'var(--ok)' : bridgeAnalysis.status === 'MARGINAL' ? 'var(--warn)' : 'var(--bad)',
                    marginTop: 2
                  }}
                >
                  {bridgeAnalysis.status} (Simulated Margin: {bridgeAnalysis.safetyMargin >= 0 ? `+${bridgeAnalysis.safetyMargin.toFixed(1)}` : bridgeAnalysis.safetyMargin.toFixed(1)} t)
                </div>
              </div>
            )}
          </div>

          {/* Navigation Tabs for Deep Inspection */}
          <div className="vayu-ra-tabs">
            <button
              className={`vayu-ra-tab${activeTab === 'alternatives' ? ' active' : ''}`}
              onClick={() => setActiveTab('alternatives')}
            >
              Route Alternatives ({routes.length})
            </button>
            <button
              className={`vayu-ra-tab${activeTab === 'legs' ? ' active' : ''}`}
              onClick={() => setActiveTab('legs')}
            >
              Corridor Legs & Clearance
            </button>
            <button
              className={`vayu-ra-tab${activeTab === 'convoy' ? ' active' : ''}`}
              onClick={() => setActiveTab('convoy')}
            >
              Tactical Manifest ({mission.convoy.length})
            </button>
            <button
              className={`vayu-ra-tab${activeTab === 'voram' ? ' active' : ''}`}
              onClick={() => setActiveTab('voram')}
            >
              VORAM v0.1 Risk Assessment
            </button>
          </div>

          {/* TAB 1: Route Alternatives Selection Matrix */}
          {activeTab === 'alternatives' && (
            <div className="card" style={{ padding: '14px 16px' }}>
              <div className="between" style={{ marginBottom: 6 }}>
                <h3 style={{ fontSize: 13.5, marginBottom: 0 }}>Corridor Alternatives Comparison</h3>
                <span style={{ fontSize: 10.5, fontFamily: "'Share Tech Mono', monospace", color: 'var(--text-muted)' }}>
                  Road-level geometries active
                </span>
              </div>

              {routes.length === 0 ? (
                <div className="empty" style={{ padding: 28 }}>No route alternatives available.</div>
              ) : (
                routes.map((r, i) => {
                  const key = r.mode || r.path?.join('-');
                  const isSelected = (selected?.mode || selected?.path?.join('-')) === key;
                  const geom = routeGeometries[key];

                  // Trade-off deltas against the selected baseline
                  const distDelta = selected ? (r.distance_km - selected.distance_km).toFixed(1) : 0;
                  const timeDelta = selected ? (r.eta_hours - selected.eta_hours).toFixed(1) : 0;
                  const riskDelta = selected ? (r.risk_score - selected.risk_score).toFixed(1) : 0;

                  return (
                    <div
                      className={`vayu-ra-route-card${isSelected ? ' selected' : ''}`}
                      key={key || i}
                      onClick={() => {
                        setSelected(r);
                        setMission({ ...mission, route: r });
                      }}
                    >
                      <div className="between" style={{ alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span className={`vayu-ra-mode-badge ${r.mode || 'balanced'}`}>
                              {modeLabel(r.mode)}
                            </span>
                            {isSelected && (
                              <span style={{ fontSize: 10, color: 'var(--ok)', fontFamily: "'Share Tech Mono', monospace" }}>
                                ● ACTIVE SELECTION
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                            {r.explanation || 'Calculated using tactical corridor scoring.'}
                          </div>
                        </div>

                        {r.voram_assessment ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                            <span
                              className="voram-alt-badge"
                              style={{
                                color: getVoramCategoryInfo(r.voram_assessment.risk_score, r.voram_assessment.risk_category).color,
                                background: getVoramCategoryInfo(r.voram_assessment.risk_score, r.voram_assessment.risk_category).bg,
                                borderColor: getVoramCategoryInfo(r.voram_assessment.risk_score, r.voram_assessment.risk_category).border
                              }}
                            >
                              VORAM {r.voram_assessment.risk_score != null ? r.voram_assessment.risk_score.toFixed(1) : '—'} · {r.voram_assessment.risk_category || r.voram_assessment.assessment_status}
                            </span>
                            {r.voram_assessment.assessment_status === 'FAIL' && (
                              <span style={{ fontSize: 9.5, color: 'var(--bad)', fontWeight: 700, fontFamily: "'Share Tech Mono', monospace" }}>
                                ⚠️ INELIGIBLE (MANDATORY CONSTRAINT)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span
                            style={{
                              fontFamily: "'Orbitron',monospace",
                              fontSize: 12,
                              fontWeight: 700,
                              color: riskColor(r.risk_score)
                            }}
                          >
                            RISK {r.risk_score}
                          </span>
                        )}
                      </div>

                      {/* Route Metrics & Deltas */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginTop: 8,
                          paddingTop: 8,
                          borderTop: '1px solid rgba(102, 140, 160, 0.12)',
                          fontFamily: "'Share Tech Mono', monospace",
                          fontSize: 11
                        }}
                      >
                        <div style={{ color: 'var(--text-main)', display: 'flex', gap: 12 }}>
                          <span>
                            <b>{geom?.distanceKm || r.distance_km}</b> km
                          </span>
                          <span>
                            ETA <b>{geom?.etaHours || r.eta_hours}</b> h
                          </span>
                          <span>{r.path?.length || 0} Nodes</span>
                        </div>

                        {!isSelected && selected && (
                          <div style={{ fontSize: 10, color: 'var(--text-subtle)', display: 'flex', gap: 8 }}>
                            <span>Δ {distDelta > 0 ? `+${distDelta}` : distDelta} km</span>
                            <span>Δ {timeDelta > 0 ? `+${timeDelta}` : timeDelta} h</span>
                          </div>
                        )}
                      </div>

                      {/* Corridor path hop list */}
                      <div
                        style={{
                          fontSize: 9.5,
                          fontFamily: "'Share Tech Mono', monospace",
                          color: 'var(--text-subtle)',
                          marginTop: 6,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {r.path?.map((id) => {
                          const cleanId = (id || '').replace('PLC-', '');
                          const n = nodeDict[cleanId] || nodeDict[id];
                          return n?.installation_name || n?.place_name || id;
                        }).join(' → ')}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: Corridor Legs & Clearance Breakdown */}
          {activeTab === 'legs' && (
            <div className="card" style={{ padding: '14px 16px' }}>
              <div className="between" style={{ marginBottom: 10 }}>
                <h3 style={{ fontSize: 13.5, marginBottom: 0 }}>Corridor Transit Legs & Waypoint Nodes</h3>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {selected?.legs?.length || (selected?.path?.length ? selected.path.length - 1 : 0)} Transit Legs
                </span>
              </div>

              {selected?.legs && selected.legs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
                  {selected.legs.map((leg, idx) => {
                    const toNode = nodeDict[leg.to] || nodeDict[(leg.to || '').replace('PLC-', '')] || nodeDict[`PLC-${(leg.to || '').replace('PLC-', '')}`];
                    const bridgeLimit = Number(toNode?.max_axle_load_tons != null ? toNode.max_axle_load_tons : (toNode?.max_vehicle_tons != null ? toNode.max_vehicle_tons : 0));
                    const clearanceMins = Number(toNode?.clearance_time_mins || 0);

                    return (
                      <div
                        key={idx}
                        style={{
                          background: 'var(--panel-alt)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          padding: '8px 10px',
                          fontSize: 11
                        }}
                      >
                        <div className="between" style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                            <span style={{ color: 'var(--warn)', fontFamily: "'Share Tech Mono', monospace" }}>Leg #{idx + 1}</span>
                            <span>{leg.from_name || leg.from}</span>
                            <ArrowRight size={11} color="var(--text-muted)" />
                            <span style={{ color: 'var(--accent)' }}>{leg.to_name || leg.to}</span>
                          </div>
                          <span style={{ fontFamily: "'Share Tech Mono', monospace", color: 'var(--text-muted)' }}>
                            {leg.distance_km} km · {leg.time_hours} h
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 14, fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: 'var(--text-subtle)' }}>
                          <span>
                            Bridge Ceiling: <b style={{ color: bridgeLimit >= maxTons ? 'var(--ok)' : 'var(--bad)' }}>{bridgeLimit > 0 ? `${bridgeLimit} t` : 'None'}</b>
                          </span>
                          {clearanceMins > 0 && <span>Clearance: {clearanceMins} mins</span>}
                          <span>Risk: {leg.risk_score}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty" style={{ padding: 20 }}>
                  Detailed legs computed from military corridor network.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Tactical Convoy Manifest Breakdown */}
          {activeTab === 'convoy' && (
            <div className="card" style={{ padding: '14px 16px' }}>
              <div className="between" style={{ marginBottom: 10 }}>
                <div>
                  <h3 style={{ fontSize: 13.5, marginBottom: 2 }}>Tactical Convoy Order ({mission.convoy.length})</h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Verified weight distribution & allocated payload.
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 700 }}>
                  {Number(mission.total_convoy_weight || 0).toFixed(1)} t Total
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
                {mission.convoy.map((v, i) => {
                  const isLead = i === 0;
                  const isTrail = i === mission.convoy.length - 1 && mission.convoy.length > 1;
                  const totalGross = Number(v.gvw_tons || 0) + Number(v.payload || 0);
                  const isGovWeight = totalGross === maxTons;
                  const isGovSpeed = Number(v.max_speed_kmh || 999) === speedKmh;

                  return (
                    <div
                      key={v.uid || i}
                      style={{
                        padding: '8px 10px',
                        background: 'var(--panel-alt)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        fontSize: 11.5
                      }}
                    >
                      <div className="between" style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={`vayu-pos-tag${isLead ? ' lead' : isTrail ? ' trail' : ''}`}>
                            {isLead ? '#1 LEAD' : isTrail ? `#${i + 1} TRAIL` : `#${i + 1}`}
                          </span>
                          <b>{v.model_name}</b>
                          {v.unit_callsign && (
                            <span style={{ color: 'var(--warn)', fontFamily: "'Share Tech Mono', monospace", fontSize: 10 }}>
                              [{v.unit_callsign}]
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 6 }}>
                          {isGovWeight && (
                            <span className="vayu-ra-gov-badge weight">GOVERNING AXLE ({totalGross.toFixed(1)}t)</span>
                          )}
                          {isGovSpeed && (
                            <span className="vayu-ra-gov-badge speed">SPEED CEILING ({speedKmh} km/h)</span>
                          )}
                        </div>
                      </div>

                      {/* Segregated Tare GVW, Payload, and Occupants */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          fontFamily: "'Share Tech Mono', monospace",
                          fontSize: 10.5,
                          color: 'var(--text-muted)'
                        }}
                      >
                        <span>Tare GVW: <b style={{ color: 'var(--text-main)' }}>{v.gvw_tons} t</b></span>
                        {Number(v.payload || 0) > 0 ? (
                          <span style={{ color: 'var(--warn)' }}>Cargo: +{Number(v.payload).toFixed(1)} t</span>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)' }}>No Cargo</span>
                        )}
                        <span>Total: <b style={{ color: 'var(--text-main)' }}>{totalGross.toFixed(1)} t</b></span>
                        {Number(v.passengers || 0) > 0 && (
                          <span style={{ color: 'var(--ok)' }}>👤 {v.passengers} Occupants</span>
                        )}
                        <span style={{ marginLeft: 'auto', color: 'var(--text-subtle)' }}>ROLE: {v.role_category}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: VORAM v0.1 Risk Assessment Model */}
          {activeTab === 'voram' && (
            <div className="card" style={{ padding: '14px 16px' }}>
              <VoramAssessmentPanel
                assessment={selected?.voram_assessment}
                selectedRoute={selected}
                onRecalculate={assess}
                isLoading={loading}
                error={msg}
              />
            </div>
          )}

          {/* SITREP Intelligence Disruption Simulation */}
          <div className="card" style={{ marginTop: 14, padding: '14px 16px' }}>
            <div className="between" style={{ marginBottom: 6 }}>
              <div>
                <h3 style={{ fontSize: 13.5, marginBottom: 2 }}>Simulated Intelligence (SITREP)</h3>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Test corridor resilience by simulating field disruptions. Tactical router calculates real-time detours.
                </div>
              </div>
              <span className="pill warn">DYNAMIC SIMULATION</span>
            </div>

            {/* Quick Tactical Preset Chips */}
            <div className="vayu-ra-chips">
              {PRESET_SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  className={`vayu-ra-chip${activeChip === sc.id ? ' active' : ''}`}
                  onClick={() => {
                    setActiveChip(sc.id);
                    setSitrep(sc.text);
                  }}
                >
                  <Zap size={10} color={activeChip === sc.id ? 'var(--warn)' : 'var(--text-muted)'} />
                  {sc.label}
                </button>
              ))}
            </div>

            <textarea
              className="input"
              rows={3}
              placeholder="e.g. Severe landslide near Banihal Pass has closed road corridor..."
              value={sitrep}
              onChange={(e) => {
                setSitrep(e.target.value);
                setActiveChip(null);
              }}
              style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.5 }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                className="btn primary"
                disabled={loading || sitrep.trim().length < 5}
                onClick={recalc}
                style={{ flex: 1, padding: '8px 14px', fontSize: 12 }}
              >
                {loading ? 'Evaluating Tactical Detours…' : 'Apply SITREP & Recalculate Corridor'}
              </button>

              {baselineRoutes && (
                <button
                  className="btn"
                  onClick={restoreBaseline}
                  style={{ padding: '8px 12px', fontSize: 12 }}
                  title="Revert to baseline routes"
                >
                  <RotateCcw size={12} /> Restore Baseline
                </button>
              )}
            </div>

            {/* Recalculation Impact Assessment Box */}
            {intel && (
              <div className="vayu-ra-impact-box">
                <div className="between" style={{ marginBottom: 4 }}>
                  <div className="kicker" style={{ color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AlertTriangle size={11} /> Tactical Disruption Impact
                  </div>
                  <span
                    className={`pill ${intel.intelligence?.severity === 'HIGH' ? 'bad' : 'warn'}`}
                    style={{ fontSize: 9.5, padding: '1px 6px' }}
                  >
                    {intel.intelligence?.hazard_type || 'HAZARD'} · {intel.intelligence?.severity}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-main)', marginTop: 4, lineHeight: 1.4 }}>
                  {intel.intelligence?.interpretation || 'Simulated tactical constraint applied to routing network.'}
                </div>

                {intel.impact && (
                  <div className="vayu-ra-impact-grid">
                    <div className="vayu-ra-delta-chip">
                      <div className="kicker">Reroute Status</div>
                      <b style={{ color: intel.impact.route_changed ? 'var(--warn)' : 'var(--ok)', fontSize: 11 }}>
                        {intel.impact.route_changed ? 'DETOUR APPLIED' : 'CORRIDOR INTACT'}
                      </b>
                    </div>
                    <div className="vayu-ra-delta-chip">
                      <div className="kicker">Δ Distance</div>
                      <b style={{ color: intel.impact.distance_delta_km > 0 ? 'var(--warn)' : 'var(--ok)', fontSize: 11 }}>
                        {intel.impact.distance_delta_km > 0 ? `+${intel.impact.distance_delta_km}` : intel.impact.distance_delta_km} km
                      </b>
                    </div>
                    <div className="vayu-ra-delta-chip">
                      <div className="kicker">Δ Transit ETA</div>
                      <b style={{ color: intel.impact.eta_delta_hours > 0 ? 'var(--warn)' : 'var(--ok)', fontSize: 11 }}>
                        {intel.impact.eta_delta_hours > 0 ? `+${intel.impact.eta_delta_hours}` : intel.impact.eta_delta_hours} h
                      </b>
                    </div>
                    <div className="vayu-ra-delta-chip">
                      <div className="kicker">Δ Risk Score</div>
                      <b style={{ color: intel.impact.risk_delta > 0 ? 'var(--bad)' : 'var(--ok)', fontSize: 11 }}>
                        {intel.impact.risk_delta > 0 ? `+${intel.impact.risk_delta}` : intel.impact.risk_delta}
                      </b>
                    </div>
                  </div>
                )}
              </div>
            )}

            {msg && (
              <div className="alert" style={{ marginTop: 10, fontSize: 12 }}>
                <AlertTriangle size={14} style={{ marginRight: 6, flexShrink: 0 }} />
                {msg}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Road-Level Map & Tactical Mission Preview */}
        <div>
          {/* Road Network Status Banner */}
          <div
            style={{
              padding: '6px 12px',
              background: 'var(--panel-alt)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius) var(--radius) 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 10.5,
              fontFamily: "'Share Tech Mono', monospace"
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: geometriesLoading ? 'var(--color-warning-text)' : 'var(--color-success)' }} />
              <span style={{ color: 'var(--text-main)' }}>
                {geometriesLoading ? 'Resolving Road Network Geometry...' : 'Road-Following Geometry Active'}
              </span>
            </div>
            <span style={{ color: 'var(--text-subtle)' }}>
              {geometrySource || 'TomTom Maps SDK for Web'}
            </span>
          </div>

          {/* Tactical Map Container */}
          <div style={{ height: 420, border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 var(--radius) var(--radius)', overflow: 'hidden' }}>
            <MapView
              places={Object.values(nodeDict)}
              route={pts}
              routeGeometry={selectedGeometry}
              alternativeGeometries={alternativeGeometries}
              waypoints={waypoints}
              origin={originNode}
              destination={destNode}
            />
          </div>

          {/* Selected Corridor Tactical Summary Card */}
          <div className="card" style={{ marginTop: 14, padding: '16px' }}>
            <div className="between" style={{ marginBottom: 10 }}>
              <div>
                <span className="kicker">Selected Tactical Corridor</span>
                <h3 style={{ fontSize: 16, margin: '2px 0 0', color: 'var(--text-main)' }}>
                  {modeLabel(selected?.mode)}
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                {selected?.voram_assessment ? (
                  <span
                    className="voram-alt-badge"
                    style={{
                      color: getVoramCategoryInfo(selected.voram_assessment.risk_score, selected.voram_assessment.risk_category).color,
                      background: getVoramCategoryInfo(selected.voram_assessment.risk_score, selected.voram_assessment.risk_category).bg,
                      borderColor: getVoramCategoryInfo(selected.voram_assessment.risk_score, selected.voram_assessment.risk_category).border
                    }}
                  >
                    VORAM {selected.voram_assessment.risk_score != null ? selected.voram_assessment.risk_score.toFixed(1) : '—'} · {selected.voram_assessment.risk_category || selected.voram_assessment.assessment_status}
                  </span>
                ) : (
                  <span
                    style={{
                      fontFamily: "'Orbitron', monospace",
                      fontSize: 13,
                      fontWeight: 700,
                      color: riskColor(selected?.risk_score)
                    }}
                  >
                    RISK {selected?.risk_score ?? '—'}
                  </span>
                )}
                {activeTab !== 'voram' && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setActiveTab('voram')}
                    style={{ fontSize: 10, padding: '2px 7px', fontFamily: "'Share Tech Mono', monospace" }}
                  >
                    Inspect VORAM Details →
                  </button>
                )}
              </div>
            </div>

            {/* Core Distance & ETA Metrics */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
              <div className="metric" style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-main)' }}>
                {(selectedGeometry?.distanceKm || selected?.distance_km) ?? '—'}{' '}
                <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-muted)' }}>km</span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: "'Share Tech Mono', monospace" }}>
                ETA <b style={{ color: 'var(--text-main)', fontSize: 18 }}>{(selectedGeometry?.etaHours || selected?.eta_hours) ?? '—'}</b> h
              </div>
            </div>

            {/* Endpoints Routing Description */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                background: 'var(--panel-alt)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: 11,
                fontFamily: "'Share Tech Mono', monospace",
                marginBottom: 10
              }}
            >
              <MapPin size={12} color="var(--ok)" />
              <span style={{ color: 'var(--text-main)' }}>
                {originNode?.place_name || originNode?.installation_name || mission.origin}
              </span>
              <ArrowRight size={11} color="var(--text-muted)" />
              <MapPin size={12} color="var(--warn)" />
              <span style={{ color: 'var(--text-main)' }}>
                {destNode?.place_name || destNode?.installation_name || mission.dest}
              </span>
            </div>

            {/* Bridge clearance confirmation */}
            {bridgeAnalysis && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontFamily: "'Share Tech Mono', monospace",
                  color: bridgeAnalysis.status === 'CLEAR' ? 'var(--ok)' : bridgeAnalysis.status === 'MARGINAL' ? 'var(--warn)' : 'var(--bad)',
                  marginBottom: 14
                }}
              >
                <CheckCircle2 size={12} />
                <span>
                  {bridgeAnalysis.statusText} at {bridgeAnalysis.bottleneckName} (Simulated corridor data)
                </span>
              </div>
            )}

            {/* Continue to Preview CTA Button */}
            <button
              className="btn primary"
              style={{ width: '100%', padding: '11px 16px', fontSize: 13 }}
              disabled={!selected}
              onClick={() => {
                setMission({
                  ...mission,
                  route: selected,
                  routes: routes
                });
                setPage('Final Journey Preview');
              }}
              title="Go for Journey Preview"
              aria-label="Go for Journey Preview"
            >
              Go for Journey Preview →
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

export default RouteAssessment;
