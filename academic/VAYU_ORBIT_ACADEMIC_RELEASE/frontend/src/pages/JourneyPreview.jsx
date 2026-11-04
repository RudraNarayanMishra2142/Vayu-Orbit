import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import MapView from '../components/MapView';
import StepProgress from '../components/planning/StepProgress';
import RouteDirectionsPanel from '../components/navigation/RouteDirectionsPanel';
import RopReportModal from '../components/planning/RopReportModal';
import RopVerificationModal from '../components/planning/RopVerificationModal';
import SensitivityAdvisoryCard from '../components/planning/SensitivityAdvisoryCard';
import JourneyReadinessSummary from '../components/planning/JourneyReadinessSummary';
import { fetchRouteWithGuidance, generateTacticalMilestoneInstructions } from '../services/navigationService';
import {
  CheckCircle2, AlertTriangle, AlertCircle, ShieldAlert, ShieldCheck,
  ArrowRight, Truck, MapPin, Calendar, Clock, RefreshCw, Route,
  Fuel, FileText, ChevronRight, Scale, Gauge, Edit3, Compass,
  FileCheck2, UserCheck, Shield
} from 'lucide-react';

/**
 * Validates convoy vehicles against authoritative backend business rules.
 * Mirrors backend/api.py create_journey validation logic.
 */
function validateConvoyVehicles(convoy = []) {
  const errors = [];
  const vehicleStatusMap = {};
  const seenUnits = new Set();

  convoy.forEach((v, idx) => {
    const pos = idx + 1;
    const modelName = v.model_name || v.vehicle_id || `Vehicle #${pos}`;
    const unitId = v.unit_id ? String(v.unit_id).trim() : null;
    const vErrors = [];

    // Duplicate physical unit check
    if (unitId) {
      if (seenUnits.has(unitId)) {
        const err = `Duplicate physical unit ${unitId} at position #${pos}. Each physical unit can only be assigned once.`;
        vErrors.push(err);
        errors.push(err);
      } else {
        seenUnits.add(unitId);
      }
    }

    // Role category
    const role = (v.role_category || 'DUAL').toUpperCase();

    // Passenger / Occupants
    const rawPass = v.passengers !== undefined ? v.passengers : (v.occupants !== undefined ? v.occupants : 0);
    const passVal = Number(rawPass) || 0;
    if (passVal < 0) {
      const err = `Position #${pos} (${modelName}): Occupant count cannot be negative.`;
      vErrors.push(err);
      errors.push(err);
    }

    // Cargo / Payload
    const rawCargo = v.payload !== undefined ? v.payload : (v.cargo_tons !== undefined ? v.cargo_tons : 0);
    const cargoVal = Number(rawCargo) || 0;
    if (cargoVal < 0) {
      const err = `Position #${pos} (${modelName}): Cargo payload cannot be negative.`;
      vErrors.push(err);
      errors.push(err);
    }

    // Role restrictions
    if (role === 'PASSENGER' && cargoVal > 0) {
      const err = `Position #${pos} (${modelName}): Vehicle is classified as PASSENGER-ONLY and cannot carry freight cargo (${cargoVal} t).`;
      vErrors.push(err);
      errors.push(err);
    }
    if (role === 'CARGO' && passVal > 0) {
      const err = `Position #${pos} (${modelName}): Vehicle is classified as CARGO-ONLY and cannot carry additional passengers (${passVal} pax).`;
      vErrors.push(err);
      errors.push(err);
    }

    // Verified capacity enforcement
    if (v.passenger_capacity_verified && v.rated_passenger_capacity != null) {
      const maxPass = Number(v.rated_passenger_capacity);
      if (passVal > maxPass) {
        const err = `Position #${pos} (${modelName}): Occupants (${passVal}) exceed verified capacity of ${maxPass} pax.`;
        vErrors.push(err);
        errors.push(err);
      }
    }

    if (v.payload_capacity_verified && v.rated_payload_tons != null) {
      const maxCargo = Number(v.rated_payload_tons);
      if (cargoVal > maxCargo) {
        const err = `Position #${pos} (${modelName}): Cargo (${cargoVal} t) exceeds verified payload capacity of ${maxCargo} tonnes.`;
        vErrors.push(err);
        errors.push(err);
      }
    }

    vehicleStatusMap[idx] = {
      isValid: vErrors.length === 0,
      errors: vErrors
    };
  });

  return {
    isValid: errors.length === 0,
    errors,
    vehicleStatusMap
  };
}

export default function JourneyPreview({ mission = {}, setMission, setPage, currentUser }) {
  const safeMission = useMemo(() => {
    const hasData = mission && (mission.origin || mission.dest || (Array.isArray(mission.convoy) && mission.convoy.length > 0));
    if (hasData) return mission;
    try {
      const stored = window.sessionStorage.getItem('vayu_active_planning_draft_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && (parsed.origin || parsed.dest || parsed.convoy?.length)) {
          return { ...parsed, ...(mission || {}) };
        }
      }
    } catch {}
    return mission || {};
  }, [mission]);

  // Synchronize restored draft to parent if parent mission state was uninitialized
  useEffect(() => {
    if (
      (!mission?.origin && safeMission?.origin) ||
      (!mission?.convoy?.length && safeMission?.convoy?.length)
    ) {
      if (typeof setMission === 'function') {
        setMission(safeMission);
      }
    }
  }, [mission, safeMission, setMission]);

  const [creating, setCreating] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const lockRef = useRef(false);

  const convoy = useMemo(() => Array.isArray(safeMission.convoy) ? safeMission.convoy : [], [safeMission.convoy]);
  const route = safeMission.route || null;
  const originId = safeMission.origin || '';
  const destId = safeMission.dest || '';
  const originName = safeMission.originName || originId;
  const destName = safeMission.destName || destId;
  const departureDate = safeMission.date || '';
  const departureTime = safeMission.time || '';
  const journeyId = safeMission.journey?.journey_id || null;
  const notes = safeMission.notes || safeMission.instructions || safeMission.journey?.notes || '';

  // Staged Journey Target Identifier for pre-commit ROP evidence and sensitivity tracking (SEC-01)
  const [stagedSessionId, setStagedSessionId] = useState(safeMission.staged_journey_id || null);

  useEffect(() => {
    if (journeyId || stagedSessionId) return;
    let active = true;
    api.createStagedSession()
      .then(res => {
        if (!active) return;
        const sid = res?.staged_id || ('STAGE-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).substring(2, 15)));
        setStagedSessionId(sid);
        if (typeof setMission === 'function') {
          setMission(prev => ({ ...(prev || safeMission), staged_journey_id: sid }));
        }
      })
      .catch(() => {
        if (!active) return;
        const sid = 'STAGE-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).substring(2, 15));
        setStagedSessionId(sid);
        if (typeof setMission === 'function') {
          setMission(prev => ({ ...(prev || safeMission), staged_journey_id: sid }));
        }
      });
    return () => { active = false; };
  }, [journeyId, stagedSessionId, setMission, safeMission]);

  const stagedTargetId = journeyId || stagedSessionId || null;
  const [ropReport, setRopReport] = useState(null);
  const [ropLoading, setRopLoading] = useState(false);
  const [sensitivityAdvisory, setSensitivityAdvisory] = useState(null);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [readinessOverride, setReadinessOverride] = useState(null);
  const [ropModalOpen, setRopModalOpen] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [advisoryModalOpen, setAdvisoryModalOpen] = useState(false);
  const [reassessing, setReassessing] = useState(false);
  const [currentVoram, setCurrentVoram] = useState(route?.voram_assessment || null);

  // Synchronize road geometry and instructions when route updates
  useEffect(() => {
    if (route?.geometry && !roadGeometry) {
      setRoadGeometry(route.geometry);
      setGeometrySource('Persisted Road Network');
    }
    if (route?.instructions?.length && (!instructions || instructions.length === 0)) {
      setInstructions(route.instructions);
    }
    if (route?.voram_assessment && !currentVoram) {
      setCurrentVoram(route.voram_assessment);
    }
  }, [route]);

  // Self-healing: if origin and destination are present but route is missing, evaluate candidate route
  useEffect(() => {
    if (journeyId || route) return;
    if (!originId || !destId) return;

    let active = true;
    const speed = Number(safeMission.convoy_speed_kmh) || 40;
    const tons = Number(safeMission.max_vehicle_tons) || 12;

    api.route({
      origin_id: originId,
      dest_id: destId,
      convoy_speed_kmh: speed,
      max_vehicle_tons: tons
    }).then(res => {
      if (!active) return;
      if (res && res.selected_route && typeof setMission === 'function') {
        setMission(prev => ({
          ...(prev || safeMission),
          route: res.selected_route,
          routes: res.routes || [res.selected_route]
        }));
      }
    }).catch(err => {
      console.warn('Automatic corridor route evaluation failed:', err);
    });

    return () => { active = false; };
  }, [journeyId, route, originId, destId, safeMission, setMission]);

  // Fetch ROP report and sensitivity advisory for current corridor / staged journey
  useEffect(() => {
    if (!stagedTargetId) return;
    let active = true;
    setRopLoading(true);
    setAdvisoryLoading(true);

    Promise.all([
      api.ropReport(stagedTargetId).catch(() => null),
      api.sensitivityAdvisory(stagedTargetId).catch(() => null)
    ]).then(([ropRes, advRes]) => {
      if (!active) return;
      const rep = ropRes?.report || (ropRes?.report_id ? ropRes : null);
      if (rep) {
        setRopReport(rep);
      }
      const adv = advRes?.advisory || (advRes?.journey_id ? advRes : null);
      if (adv) {
        setSensitivityAdvisory(adv);
      }
    }).finally(() => {
      if (active) {
        setRopLoading(false);
        setAdvisoryLoading(false);
      }
    });

    return () => { active = false; };
  }, [stagedTargetId]);

  // Node catalog, places, and geometry persistence resolution
  const [nodeDict, setNodeDict] = useState(safeMission.placeMap || {});
  const [placesList, setPlacesList] = useState([]);
  const [roadGeometry, setRoadGeometry] = useState(route?.geometry || null);
  const [instructions, setInstructions] = useState(route?.instructions || []);
  const [geometryLoading, setGeometryLoading] = useState(false);
  const [geometrySource, setGeometrySource] = useState(
    route?.geometry ? 'Persisted Road Network' : ''
  );
  const [selectedInstruction, setSelectedInstruction] = useState(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);
  const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;

  const handleNextInstruction = useCallback(() => {
    if (!instructions || instructions.length === 0) return;
    const currentIdx = selectedInstruction
      ? instructions.findIndex((ins) => ins.id === selectedInstruction.id)
      : -1;
    const nextIdx = currentIdx + 1 < instructions.length ? currentIdx + 1 : 0;
    setSelectedInstruction(instructions[nextIdx]);
    setSelectedCheckpoint(null);
  }, [instructions, selectedInstruction]);

  const handlePrevInstruction = useCallback(() => {
    if (!instructions || instructions.length === 0) return;
    const currentIdx = selectedInstruction
      ? instructions.findIndex((ins) => ins.id === selectedInstruction.id)
      : instructions.length;
    const prevIdx = currentIdx - 1 >= 0 ? currentIdx - 1 : instructions.length - 1;
    setSelectedInstruction(instructions[prevIdx]);
    setSelectedCheckpoint(null);
  }, [instructions, selectedInstruction]);

  // Load places and military nodes to ensure complete coordinate dictionary
  useEffect(() => {
    let active = true;
    Promise.all([
      api.places().catch(() => []),
      api.nodes().catch(() => ({}))
    ]).then(([placeList, nodesObj]) => {
      if (!active) return;
      if (Array.isArray(placeList)) {
        setPlacesList(placeList);
      }
      const dict = { ...(safeMission.placeMap || {}) };
      if (Array.isArray(placeList)) {
        placeList.forEach((p) => {
          const cleanId = (p.place_id || '').replace('PLC-', '');
          dict[p.place_id] = p;
          dict[cleanId] = p;
        });
      }
      if (nodesObj && typeof nodesObj === 'object') {
        Object.entries(nodesObj).forEach(([id, n]) => {
          const cleanId = id.replace('PLC-', '');
          if (!dict[id]) {
            dict[id] = {
              place_id: id,
              place_name: n.installation_name || n.name || id,
              lat: n.lat,
              lon: n.lon != null ? n.lon : n.lng
            };
          }
          if (!dict[cleanId]) dict[cleanId] = dict[id];
        });
      }
      setNodeDict(dict);
    });
    return () => { active = false; };
  }, [safeMission.placeMap]);

  // Ensure road geometry & manoeuvre instructions are resolved before commit
  useEffect(() => {
    if (!route || !Array.isArray(route.path) || route.path.length < 2) return;
    if (roadGeometry && instructions.length > 0) return;
    if (Object.keys(nodeDict).length === 0) return;

    let active = true;
    const ctl = new AbortController();
    setGeometryLoading(true);

    fetchRouteWithGuidance(route.path, nodeDict, apiKey, ctl.signal)
      .then((res) => {
        if (!active) return;
        if (res && res.geometry && res.geometry.coordinates?.length > 0) {
          setRoadGeometry(res.geometry);
          setInstructions(res.instructions || []);
          setGeometrySource(
            res.source === 'ROAD_NETWORK_DIRECT'
              ? 'Road Network (Direct Corridor)'
              : 'Road Network (TomTom Routing)'
          );
        } else {
          // Fallback to structured military corridor milestones
          const milestones = generateTacticalMilestoneInstructions(route.path, nodeDict, route.legs);
          setInstructions(milestones);
          setGeometrySource('Tactical Milestones (Road Geometry Unavailable)');
        }
      })
      .catch(() => {
        if (active) {
          const milestones = generateTacticalMilestoneInstructions(route.path, nodeDict, route.legs);
          setInstructions(milestones);
          setGeometrySource('Tactical Milestones (Road Geometry Unavailable)');
        }
      })
      .finally(() => {
        if (active) setGeometryLoading(false);
      });

    return () => {
      active = false;
      ctl.abort();
    };
  }, [route, nodeDict, apiKey, roadGeometry, instructions.length]);

  // Convoy business rules validation
  const convoyValidation = useMemo(() => validateConvoyVehicles(convoy), [convoy]);

  // High-level pre-commit checks
  const checks = [
    {
      label: 'Origin & Destination Specified',
      detail: originId && destId ? `${originName} → ${destName}` : 'Missing origin or destination',
      ok: !!(originId && destId && originId !== destId),
      fixPage: 'Journey Planning'
    },
    {
      label: 'Endpoints Distinct',
      detail: originId === destId && originId ? 'Origin and destination cannot be identical' : 'Endpoints verified distinct',
      ok: !!(originId && destId && originId !== destId),
      fixPage: 'Journey Planning'
    },
    {
      label: 'Departure Schedule Set',
      detail: departureDate && departureTime ? `${departureDate} @ ${departureTime} hrs` : 'Schedule incomplete',
      ok: !!(departureDate && departureTime),
      fixPage: 'Journey Planning'
    },
    {
      label: 'Tactical Corridor Selected',
      detail: route?.mode ? `${route.mode.toUpperCase()} (${route.path?.length || 0} nodes)` : (route ? 'Corridor selected' : 'No route evaluated'),
      ok: !!route && Array.isArray(route.path) && route.path.length >= 2,
      fixPage: 'Route Assessment'
    },
    {
      label: 'Convoy Manifest Non-Empty',
      detail: convoy.length > 0 ? `${convoy.length} vehicle${convoy.length === 1 ? '' : 's'} assigned` : 'Convoy manifest is empty',
      ok: convoy.length > 0,
      fixPage: 'Convoy Builder'
    },
    {
      label: 'Convoy Capacity & Role Limits',
      detail: convoyValidation.isValid
        ? 'All vehicles comply with capacity and role limits'
        : `${convoyValidation.errors.length} allocation conflict${convoyValidation.errors.length === 1 ? '' : 's'} detected`,
      ok: convoyValidation.isValid && convoy.length > 0,
      fixPage: 'Convoy Builder'
    }
  ];

  const allReady = checks.every((c) => c.ok);

  // Aggregated totals
  const manifestTotals = useMemo(() => {
    let tare = 0;
    let payload = 0;
    let pax = 0;
    convoy.forEach((v) => {
      const vTare = Number(v.gvw_tons) || 0;
      const vPayload = Number(v.payload !== undefined ? v.payload : (v.cargo_tons || 0)) || 0;
      const vPax = Number(v.passengers !== undefined ? v.passengers : (v.occupants || 0)) || 0;
      tare += vTare;
      payload += vPayload;
      pax += vPax;
    });
    return {
      tare: Number(tare.toFixed(2)),
      payload: Number(payload.toFixed(2)),
      gross: Number((tare + payload).toFixed(2)),
      pax
    };
  }, [convoy]);

  // Origin & destination coordinate objects for MapView
  const originNode = useMemo(() => {
    const cleanId = (originId || '').replace('PLC-', '');
    const n = nodeDict[cleanId] || nodeDict[originId];
    if (n && n.lat != null && (n.lon != null || n.lng != null)) {
      return {
        lat: Number(n.lat),
        lon: Number(n.lon != null ? n.lon : n.lng),
        place_name: originName || n.place_name || originId
      };
    }
    return null;
  }, [nodeDict, originId, originName]);

  const destNode = useMemo(() => {
    const cleanId = (destId || '').replace('PLC-', '');
    const n = nodeDict[cleanId] || nodeDict[destId];
    if (n && n.lat != null && (n.lon != null || n.lng != null)) {
      return {
        lat: Number(n.lat),
        lon: Number(n.lon != null ? n.lon : n.lng),
        place_name: destName || n.place_name || destId
      };
    }
    return null;
  }, [nodeDict, destId, destName]);

  // Ordered Route Checkpoints with cumulative distances
  const checkpoints = useMemo(() => {
    if (!route || !Array.isArray(route.path) || route.path.length === 0) return [];

    let cumDist = 0;
    const legDistMap = {};
    if (Array.isArray(route.legs)) {
      route.legs.forEach((leg) => {
        const toId = leg.to;
        cumDist += Number(leg.distance_km || 0);
        legDistMap[toId] = Number(cumDist.toFixed(1));
        legDistMap[(toId || '').replace('PLC-', '')] = Number(cumDist.toFixed(1));
      });
    }

    return route.path.map((nodeId, idx) => {
      const cleanId = (nodeId || '').replace('PLC-', '');
      const nodeInfo = nodeDict[cleanId] || nodeDict[nodeId] || {};
      const isOrigin = idx === 0;
      const isDest = idx === route.path.length - 1;
      const hasCoords = nodeInfo.lat != null && (nodeInfo.lon != null || nodeInfo.lng != null);

      let distanceStr = '—';
      if (isOrigin) {
        distanceStr = '0.0 km';
      } else if (isDest) {
        distanceStr = route.distance_km != null ? `${route.distance_km} km` : '—';
      } else if (legDistMap[nodeId] != null || legDistMap[cleanId] != null) {
        distanceStr = `${legDistMap[nodeId] ?? legDistMap[cleanId]} km`;
      } else if (route.distance_km != null && route.path.length > 2) {
        const estDist = ((route.distance_km / (route.path.length - 1)) * idx).toFixed(1);
        distanceStr = `~${estDist} km`;
      }

      return {
        id: nodeId,
        name: nodeInfo.place_name || nodeInfo.name || nodeId,
        lat: nodeInfo.lat != null ? Number(nodeInfo.lat) : null,
        lon: Number(nodeInfo.lon != null ? nodeInfo.lon : (nodeInfo.lng != null ? nodeInfo.lng : null)),
        isOrigin,
        isDest,
        isCheckpoint: !isOrigin && !isDest,
        distanceStr,
        hasCoords
      };
    });
  }, [route, nodeDict]);

  // Intermediate waypoints passed to MapView
  const intermediateWaypoints = useMemo(() => {
    return checkpoints.filter((cp) => cp.isCheckpoint && cp.hasCoords);
  }, [checkpoints]);

  // Nearest authorized military refuelling point along corridor
  const nearestFuelDepot = useMemo(() => {
    if (!placesList || placesList.length === 0 || !Array.isArray(route?.path) || route.path.length < 2) return null;

    const origClean = (originId || '').replace('PLC-', '');
    const fuelPlaces = placesList.filter((p) => {
      const svcs = (p.support_services || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const cleanPid = (p.place_id || '').replace('PLC-', '');
      const isFuelSupported = svcs.includes('fuel') || desc.includes('fuel') || p.category === 'Supply Depot' || p.category === 'Cantonment';
      return isFuelSupported && cleanPid !== origClean && p.place_id !== originId;
    });

    if (fuelPlaces.length === 0) return null;

    const pathCoords = route.path
      .map((id) => {
        const clean = (id || '').replace('PLC-', '');
        return nodeDict[clean] || nodeDict[id] || null;
      })
      .filter((n) => n && n.lat != null && (n.lon != null || n.lng != null));

    if (pathCoords.length === 0) return null;

    let bestPlace = null;
    let minDistance = Infinity;

    for (const fp of fuelPlaces) {
      const fpLat = Number(fp.lat);
      const fpLon = Number(fp.lon != null ? fp.lon : fp.lng);
      if (isNaN(fpLat) || isNaN(fpLon)) continue;

      for (const pt of pathCoords) {
        const ptLat = Number(pt.lat);
        const ptLon = Number(pt.lon != null ? pt.lon : pt.lng);
        const dLat = (fpLat - ptLat) * (Math.PI / 180);
        const dLon = (fpLon - ptLon) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(ptLat * (Math.PI / 180)) * Math.cos(fpLat * (Math.PI / 180)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distKm = 6371 * c;

        if (distKm < minDistance) {
          minDistance = distKm;
          bestPlace = {
            ...fp,
            detour_km: Number(distKm.toFixed(1))
          };
        }
      }
    }

    if (bestPlace && minDistance <= 65) {
      return bestPlace;
    }
    return null;
  }, [placesList, route, originId, nodeDict]);

  // Fuel Feasibility analysis
  const fuelFeasibility = useMemo(() => {
    const totalDist = Number(route?.distance_km || 0);
    const requiredWithReserve = Number((totalDist * 1.10).toFixed(1)); // 10% reserve buffer

    if (convoy.length === 0) {
      return {
        status: 'EMPTY_CONVOY',
        statusLabel: 'NO CONVOY ASSIGNED',
        statusClass: 'unassessed',
        limitingVehicle: null,
        limitingRatedRange: 0,
        limitingUsableRange: 0,
        requiredWithReserve: 0,
        totalDist: 0,
        isFeasible: false,
        advisory: 'Assign vehicles to the convoy manifest to calculate fuel feasibility.'
      };
    }

    if (totalDist <= 0) {
      return {
        status: 'PENDING_CORRIDOR',
        statusLabel: 'CORRIDOR PENDING',
        statusClass: 'unassessed',
        limitingVehicle: null,
        limitingRatedRange: 0,
        limitingUsableRange: 0,
        requiredWithReserve: 0,
        totalDist: 0,
        isFeasible: false,
        advisory: 'Select a valid movement corridor in Route Assessment.'
      };
    }

    let limiting = convoy[0];
    let minRange = Number(limiting.operational_range_km) || 350;

    convoy.forEach((v) => {
      const r = Number(v.operational_range_km) || 350;
      if (r < minRange) {
        minRange = r;
        limiting = v;
      }
    });

    const limitingUsableRange = Number((minRange * 0.90).toFixed(1));
    const isFeasible = limitingUsableRange >= requiredWithReserve;

    let status = isFeasible ? 'FEASIBLE' : 'REQUIRES_REFUELLING';
    let statusLabel = isFeasible ? 'FEASIBLE' : 'REFUELLING REQUIRED';
    let statusClass = isFeasible ? 'low' : 'medium';

    if (!isFeasible) {
      if (nearestFuelDepot) {
        status = 'REQUIRES_REFUELLING';
        statusLabel = 'REFUELLING REQUIRED';
        statusClass = 'medium';
      } else {
        status = 'INFEASIBLE_STRANDING_RISK';
        statusLabel = 'STRANDING RISK';
        statusClass = 'high';
      }
    }

    return {
      status,
      statusLabel,
      statusClass,
      limitingVehicle: limiting,
      limitingRatedRange: minRange,
      limitingUsableRange,
      requiredWithReserve,
      totalDist,
      isFeasible,
      advisory: 'Standard pre-departure rule: Physical fuel dip required at dispatch to confirm 100% tank volume.'
    };
  }, [convoy, route, nearestFuelDepot]);

  // Route Constraints
  const routeConstraints = useMemo(() => {
    let maxWeight = 0;
    convoy.forEach((v) => {
      const tare = Number(v.gvw_tons || 0);
      const payload = Number(v.payload !== undefined ? v.payload : (v.cargo_tons || 0)) || 0;
      const total = tare + payload;
      if (total > maxWeight) maxWeight = total;
    });

    const bridgeLimit = Number(route?.max_vehicle_tons || 35.0);
    const bridgeCleared = maxWeight <= bridgeLimit;

    return {
      maxWeight: Number(maxWeight.toFixed(1)),
      bridgeLimit,
      bridgeCleared,
      speedLimitKmh: 40,
      etaHours: route?.eta_hours ?? '—'
    };
  }, [convoy, route]);

  // Reassess VORAM v0.1 using verified ROP telemetry
  const handleReassessVoram = useCallback(async () => {
    if (reassessing) return;
    setReassessing(true);
    try {
      let res;
      if (journeyId) {
        res = await api.reassessVoram(journeyId);
      } else {
        const obsSources = {};
        if (ropReport?.parameters && typeof ropReport.parameters === 'object') {
          Object.entries(ropReport.parameters).forEach(([key, val]) => {
            if (val && val.verified && val.rating !== null && val.rating !== undefined && val.rating !== '') {
              obsSources[key] = Number(val.rating);
            }
          });
        }

        const stagedPayload = {
          path: route?.path || [],
          convoy_speed_kmh: 40.0,
          max_vehicle_tons: routeConstraints.maxWeight,
          observation_sources: obsSources
        };
        res = await api.stagedReassessVoram(stagedPayload);
      }

      if (res && res.voram_assessment) {
        setCurrentVoram(res.voram_assessment);
        if (route) {
          route.voram_assessment = res.voram_assessment;
        }
        if (safeMission.route) {
          safeMission.route.voram_assessment = res.voram_assessment;
        }
      }
    } catch (err) {
      console.error('Reassess VORAM failed:', err);
    } finally {
      setReassessing(false);
    }
  }, [reassessing, journeyId, ropReport, route, routeConstraints, safeMission]);

  // Risk Analysis & VORAM Integration
  const riskAnalysis = useMemo(() => {
    const riskScore = Number(route?.risk_score ?? 0);
    const eta = Number(route?.eta_hours ?? 0);
    const voram = currentVoram || route?.voram_assessment;

    const bridgeRisk = routeConstraints.bridgeCleared
      ? { level: 'low', text: 'Convoy gross axle load cleared by bridge limits' }
      : { level: 'high', text: `Gross vehicle load (${routeConstraints.maxWeight} t) exceeds bridge rating (${routeConstraints.bridgeLimit} t)` };

    const fatigueRisk = eta > 8
      ? { level: 'high', text: `Long transit duration (${eta}h) exceeds single-shift limit` }
      : (eta > 4
        ? { level: 'medium', text: `Moderate transit duration (${eta}h); driver rotation recommended` }
        : { level: 'low', text: `Transit duration (${eta || '—'}h) within standard operational shift` });

    const voramItem = voram
      ? {
          label: `VORAM v0.1: ${voram.risk_score != null ? `${voram.risk_score} / 100 (${voram.risk_category || 'Assessed'})` : 'INCOMPLETE TELEMETRY'}`,
          level: voram.assessment_status === 'FAIL' ? 'high' : (voram.assessment_status === 'REVIEW_REQUIRED' ? 'medium' : (voram.risk_score != null && voram.risk_score >= 50 ? 'high' : (voram.risk_score != null && voram.risk_score >= 25 ? 'medium' : 'low'))),
          text: voram.assessment_status === 'FAIL'
            ? 'Mandatory constraint failure: corridor contains impassable or load-incompatible segments.'
            : (voram.assessment_status === 'UNKNOWN'
              ? 'Assessment incomplete: required flood, weather, or travel-time telemetry unrecorded.'
              : `10-parameter weighted assessment passed tested rules (safeguard factor: ${voram.safeguard_coefficient}x).`)
        }
      : {
          label: 'Corridor Dynamic Risk',
          level: riskScore >= 4 ? 'high' : (riskScore >= 2 ? 'medium' : 'low'),
          text: `Corridor risk factor ${riskScore} evaluated by tactical router.`
        };

    return {
      riskScore: voram?.risk_score != null ? voram.risk_score : riskScore,
      voram,
      items: [
        voramItem,
        { label: 'Bridge & Axle Structural Clearance', ...bridgeRisk },
        { label: 'Transit Duration & Crew Fatigue', ...fatigueRisk },
        { label: 'Live Weather Radar Stream', level: 'unassessed', text: 'Not assessed (radar telemetry offline)' },
        { label: 'Real-Time Cellular Coverage', level: 'unassessed', text: 'Not assessed (civil telecom unmonitored; tactical radio active)' }
      ]
    };
  }, [route, routeConstraints, currentVoram]);

  // Check user role permission for journey creation
  const canCreate = !currentUser || ['CREATOR', 'COORDINATOR', 'ADMIN'].includes(currentUser.role);

  // Synchronous lock commit handler
  const handleCommitJourney = async () => {
    if (lockRef.current || creating) return;
    if (!allReady) {
      setSubmitError('Resolve all validation checks before committing the journey.');
      return;
    }
    if (!canCreate) {
      setSubmitError(`Role '${currentUser?.role}' does not have planning authority to commit journeys.`);
      return;
    }

    lockRef.current = true;
    setCreating(true);
    setSubmitError('');

    try {
      const selectedMode = route?.mode || 'balanced';
      const modeLabels = {
        balanced: 'BALANCED CORRIDOR',
        fastest: 'FASTEST TRANSIT',
        lowest_risk: 'LOWEST RISK CORRIDOR'
      };

      const finalRoute = {
        ...(route || {}),
        mode: selectedMode,
        mode_name: modeLabels[selectedMode] || (typeof selectedMode === 'string' ? selectedMode.toUpperCase() : 'TACTICAL CORRIDOR'),
        path: route?.path || [],
        distance_km: route?.distance_km ?? null,
        eta_hours: route?.eta_hours ?? null,
        risk_score: route?.risk_score ?? null,
        geometry: roadGeometry || route?.geometry || null,
        instructions: (instructions && instructions.length > 0) ? instructions : (route?.instructions || []),
        alternative_id: selectedMode,
        voram_assessment: currentVoram || route?.voram_assessment || null
      };

      const payload = {
        origin_id:           originId,
        dest_id:             destId,
        origin_name:         originName,
        dest_name:           destName,
        departure_date:      departureDate,
        departure_time:      departureTime,
        convoy:              convoy,
        route:               finalRoute,
        staged_journey_id:   stagedTargetId,
        readiness_override:  readinessOverride
      };

      const committedJourney = await api.createJourney(payload);

      if (!committedJourney || !committedJourney.journey_id) {
        throw new Error('Backend failed to return a valid Journey ID.');
      }

      // Handoff to Operations
      if (typeof setMission === 'function') {
        setMission({ ...mission, journey: committedJourney });
      }
      setPage('Journey Operations');
    } catch (err) {
      console.error('Commit journey failed:', err);
      setSubmitError(err.message || 'Server rejected journey commitment. Check network and database status.');
      lockRef.current = false;
      setCreating(false);
    }
  };

  const hasRouteGeometry = Boolean(
    (roadGeometry && roadGeometry.coordinates && roadGeometry.coordinates.length > 1) ||
    (route?.geometry && route.geometry.coordinates && route.geometry.coordinates.length > 1)
  );

  return (
    <Shell
      title="Journey Preview"
      eyebrow="STEP 4 OF 5 · PRE-COMMIT REVIEW"
      description="Review tactical corridor, fleet readiness, and fuel feasibility before operational commitment."
      actions={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn small"
            onClick={() => setPage('Journey Planning')}
            title="Return to Journey Planning to modify schedule or endpoints"
          >
            <Edit3 size={13} style={{ marginRight: 5 }} /> Edit Journey
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => setPage('Route Assessment')}
            title="Re-evaluate corridor options or apply disruptions"
          >
            <Route size={13} style={{ marginRight: 5 }} /> Recalculate Route
          </button>
          {journeyId ? (
            <button
              type="button"
              className="btn primary small"
              onClick={() => setPage('Journey Operations')}
            >
              Proceed to Operations →
            </button>
          ) : (
            <button
              type="button"
              className="btn primary small"
              onClick={handleCommitJourney}
              disabled={creating || !allReady || !canCreate}
            >
              {creating ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={13} className="spin" /> Committing…
                </span>
              ) : (
                'Commit & Proceed →'
              )}
            </button>
          )}
        </div>
      }
    >
      <StepProgress current={4} total={5} />

      {submitError && (
        <div className="alert alert-danger" style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--bad)' }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Commitment Rejected</div>
            <div style={{ fontSize: 13 }}>{submitError}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              Staged planning data is retained. You can correct parameters without loss of configuration.
            </div>
          </div>
        </div>
      )}

      {/* Compact Header Bar */}
      <div className="jp-header-bar">
        <div className="jp-header-meta">
          <div className="jp-header-meta-item">
            <span className="jp-header-meta-label">Journey ID:</span>
            <span className="jp-header-meta-val">{journeyId || 'DRAFT-PLAN'}</span>
          </div>
          <div className="jp-header-meta-item">
            <span className="jp-header-meta-label">Status:</span>
            <span className={`pill ${journeyId ? 'ACTIVE' : (allReady ? 'ACTIVE' : 'DISRUPTED')}`} style={{ fontSize: 10, padding: '2px 8px' }}>
              {journeyId ? 'COMMITTED' : (allReady ? 'READY FOR COMMIT' : 'DRAFT')}
            </span>
          </div>
          <div className="jp-header-meta-item">
            <span className="jp-header-meta-label">Corridor:</span>
            <span className="jp-header-meta-val">
              {originName} <span style={{ color: 'var(--accent)' }}>→</span> {destName}
            </span>
          </div>
          <div className="jp-header-meta-item">
            <span className="jp-header-meta-label">Departure:</span>
            <span className="jp-header-meta-val">
              {departureDate || 'Unscheduled'} {departureTime ? `@ ${departureTime} hrs` : ''}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pill" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5 }}>
            {route?.mode ? route.mode.toUpperCase() : 'TACTICAL CORRIDOR'}
          </span>
        </div>
      </div>

      {/* Main Route Section (Map ~65%, Summary ~35%) */}
      <div className="jp-main-grid">
        {/* Left Column: Interactive Map */}
        <div className="jp-map-panel">
          <div className="jp-map-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
              <Compass size={15} color="var(--accent)" />
              <span>Tactical Movement Corridor Map</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="pill" style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 9.5,
                background: hasRouteGeometry ? 'rgba(0, 229, 163, 0.12)' : 'rgba(102, 140, 160, 0.12)',
                color: hasRouteGeometry ? 'var(--ok)' : 'var(--text-muted)'
              }}>
                {geometryLoading ? 'Resolving geometry…' : (hasRouteGeometry ? 'Road network verified' : 'Linear corridor')}
              </span>
            </div>
          </div>

          <div className="jp-map-container">
            {(!route || !Array.isArray(route.path) || route.path.length < 2) ? (
              <div className="jp-map-empty-overlay">
                <Route size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>
                  No Tactical Corridor Geometry
                </div>
                <div style={{ fontSize: 12, maxWidth: 360 }}>
                  Select origin, destination, and evaluate movement corridor in Route Assessment to visualize road geometry.
                </div>
              </div>
            ) : (
              <MapView
                places={Object.values(nodeDict)}
                routeGeometry={roadGeometry || route?.geometry || null}
                waypoints={intermediateWaypoints}
                origin={originNode}
                destination={destNode}
                selectedInstruction={selectedInstruction}
                highlightedSegment={selectedInstruction?.segment || null}
                selectedCheckpoint={selectedCheckpoint}
                onSelectCheckpoint={(wp) => {
                  setSelectedCheckpoint(wp);
                  setSelectedInstruction(null);
                }}
                instructions={instructions}
                onSelectInstruction={(ins) => {
                  setSelectedInstruction(ins);
                  setSelectedCheckpoint(null);
                }}
                onNextInstruction={handleNextInstruction}
                onPrevInstruction={handlePrevInstruction}
              />
            )}
          </div>

          {/* Turn-by-Turn Route Directions Panel */}
          {route && Array.isArray(route.path) && route.path.length >= 2 && (
            <RouteDirectionsPanel
              originName={originName}
              destName={destName}
              totalDistanceKm={route?.distance_km}
              totalEtaHours={route?.eta_hours}
              instructions={instructions}
              loading={geometryLoading}
              source={geometrySource}
              selectedInstruction={selectedInstruction}
              onSelectInstruction={(ins) => {
                setSelectedInstruction(ins);
                setSelectedCheckpoint(null);
              }}
              collapsible={true}
              initiallyExpanded={false}
            />
          )}
        </div>

        {/* Right Column: Compact Journey Summary */}
        <div className="jp-summary-panel">
          <div className="jp-summary-header">
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={15} color="var(--accent)" />
              <span>Journey Summary</span>
            </div>
            <span className="pill" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5 }}>
              {convoy.length} vehicle{convoy.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Stats Grid */}
          <div className="jp-summary-stats">
            <div className="jp-stat-box">
              <div className="jp-stat-label">Total Distance</div>
              <div className="jp-stat-value accent">
                {route?.distance_km ?? '—'} <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>km</span>
              </div>
            </div>
            <div className="jp-stat-box">
              <div className="jp-stat-label">Est. Travel Time</div>
              <div className="jp-stat-value ok">
                {route?.eta_hours ?? '—'} <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>hrs</span>
              </div>
            </div>
            <div className="jp-stat-box">
              <div className="jp-stat-label">Convoy Weight</div>
              <div className="jp-stat-value">
                {manifestTotals.gross} <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>t</span>
              </div>
            </div>
            <div className="jp-stat-box">
              <div className="jp-stat-label">Total Occupants</div>
              <div className="jp-stat-value">
                {manifestTotals.pax} <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>pax</span>
              </div>
            </div>
          </div>

          {/* Trajectory Details */}
          <div style={{ padding: '8px 10px', background: 'var(--panel-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 11.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Origin:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{originName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Destination:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{destName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Departure:</span>
              <span style={{ fontFamily: "'Share Tech Mono', monospace" }}>{departureDate || '—'} {departureTime ? `@ ${departureTime}` : ''}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Route Profile:</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{route?.mode_name || route?.mode?.toUpperCase() || 'BALANCED'}</span>
            </div>
          </div>

          {/* Verification checklist pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pre-Commit Status
            </div>
            {checks.map((chk, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  borderRadius: 4,
                  background: chk.ok ? 'rgba(106, 154, 124, 0.08)' : 'rgba(255, 64, 96, 0.12)',
                  border: `1px solid ${chk.ok ? 'rgba(106, 154, 124, 0.2)' : 'rgba(255, 64, 96, 0.3)'}`,
                  fontSize: 10.5
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {chk.ok ? (
                    <CheckCircle2 size={12} color="var(--ok)" />
                  ) : (
                    <AlertTriangle size={12} color="var(--bad)" />
                  )}
                  <span style={{ color: chk.ok ? 'var(--text-main)' : 'var(--warn)' }}>{chk.label}</span>
                </div>
                {!chk.ok && (
                  <button
                    type="button"
                    className="btn small"
                    style={{ padding: '1px 5px', fontSize: 9.5 }}
                    onClick={() => setPage(chk.fixPage)}
                  >
                    Fix →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Three Essential Readiness Panels (3-Column Grid) */}
      <div className="jp-readiness-grid">
        {/* Panel 1: Route & Checkpoints */}
        <div className="jp-readiness-card">
          <div className="jp-readiness-card-header">
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} color="var(--accent)" />
                <span>Route & Checkpoints</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Ordered corridor nodes and transit waypoints
              </div>
            </div>
            <span className="pill" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5 }}>
              {checkpoints.length} stops
            </span>
          </div>

          <div className="jp-checkpoint-list">
            {checkpoints.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11.5 }}>
                No tactical corridor nodes selected.
              </div>
            ) : (
              checkpoints.map((cp, idx) => (
                <div key={idx} className="jp-checkpoint-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: "'Share Tech Mono', monospace",
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: cp.isOrigin ? 'rgba(0, 229, 163, 0.15)' : (cp.isDest ? 'rgba(255, 64, 96, 0.15)' : 'var(--panel-hover)'),
                      color: cp.isOrigin ? 'var(--ok)' : (cp.isDest ? 'var(--bad)' : 'var(--accent)'),
                      border: '1px solid var(--border)'
                    }}>
                      {cp.isOrigin ? 'A' : (cp.isDest ? 'B' : `#${idx}`)}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 11.5 }}>
                        {cp.name}
                      </div>
                      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5, color: 'var(--text-muted)' }}>
                        [{cp.id}] {!cp.hasCoords && '• Telemetry unmonitored'}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10.5, color: 'var(--accent)', fontWeight: 600 }}>
                    {cp.distanceStr}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 2: Fleet Readiness */}
        <div className="jp-readiness-card">
          <div className="jp-readiness-card-header">
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Truck size={14} color="var(--accent)" />
                <span>Fleet Readiness</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Assigned vehicles, physical units, and cargo
              </div>
            </div>
            <span className="pill" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5 }}>
              {convoy.length} units
            </span>
          </div>

          <div className="jp-table-wrapper">
            {convoy.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11.5 }}>
                No vehicles assigned.
                <div style={{ marginTop: 6 }}>
                  <button type="button" className="btn small" onClick={() => setPage('Convoy Builder')}>
                    Assemble in Convoy Builder →
                  </button>
                </div>
              </div>
            ) : (
              <table className="jp-compact-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vehicle / Unit</th>
                    <th>Role & Load</th>
                    <th>Range</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {convoy.map((v, idx) => {
                    const pos = idx + 1;
                    const vStatus = convoyValidation.vehicleStatusMap[idx];
                    const tare = Number(v.gvw_tons || 0);
                    const payload = Number(v.payload !== undefined ? v.payload : (v.cargo_tons || 0)) || 0;
                    const gross = (tare + payload).toFixed(1);
                    const unitId = v.unit_id ? String(v.unit_id).trim() : null;
                    const role = (v.role_category || 'DUAL').toUpperCase();

                    return (
                      <tr key={idx}>
                        <td style={{ fontFamily: "'Share Tech Mono', monospace", fontWeight: 700 }}>
                          {pos === 1 ? 'LEAD' : `#${pos}`}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{v.model_name || v.vehicle_id}</div>
                          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5, color: unitId ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {unitId ? `${unitId}${v.callsign ? ` (${v.callsign})` : ''}` : 'Depot Pool'}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{role}</div>
                          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10 }}>
                            {gross}t gross {payload > 0 ? `(${payload}t cargo)` : ''}
                          </div>
                        </td>
                        <td style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10.5 }}>
                          {v.operational_range_km ? `${v.operational_range_km} km` : '350 km'}
                        </td>
                        <td>
                          {vStatus?.isValid ? (
                            <span className="pill" style={{
                              fontSize: 9,
                              padding: '2px 5px',
                              background: 'rgba(106, 154, 124, 0.15)',
                              color: 'var(--ok)',
                              border: '1px solid rgba(106, 154, 124, 0.3)'
                            }}>
                              READY
                            </span>
                          ) : (
                            <span className="pill" style={{
                              fontSize: 9,
                              padding: '2px 5px',
                              background: 'rgba(255, 64, 96, 0.15)',
                              color: 'var(--bad)',
                              border: '1px solid rgba(255, 64, 96, 0.3)'
                            }}>
                              CONFLICT
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Panel 3: Fuel Feasibility */}
        <div className="jp-readiness-card">
          <div className="jp-readiness-card-header">
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Fuel size={14} color="var(--accent)" />
                <span>Fuel Feasibility</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Usable autonomous range vs route requirement
              </div>
            </div>
            <span className={`jp-risk-pill ${fuelFeasibility.statusClass}`}>
              {fuelFeasibility.statusLabel}
            </span>
          </div>

          <div className="jp-fuel-metrics">
            <div className="jp-fuel-metric-row">
              <span style={{ color: 'var(--text-muted)' }}>Limiting Usable Range:</span>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontWeight: 700, color: fuelFeasibility.isFeasible ? 'var(--ok)' : 'var(--warn)' }}>
                {fuelFeasibility.limitingVehicle
                  ? `${fuelFeasibility.limitingUsableRange} km (${fuelFeasibility.limitingVehicle.model_name || fuelFeasibility.limitingVehicle.vehicle_id})`
                  : '—'}
              </span>
            </div>

            <div className="jp-fuel-metric-row">
              <span style={{ color: 'var(--text-muted)' }}>Required Range (+10% Reserve):</span>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontWeight: 700, color: 'var(--text-main)' }}>
                {fuelFeasibility.requiredWithReserve > 0
                  ? `${fuelFeasibility.requiredWithReserve} km (${fuelFeasibility.totalDist} km + 10%)`
                  : '—'}
              </span>
            </div>

            <div className="jp-fuel-metric-row">
              <span style={{ color: 'var(--text-muted)' }}>Nearest Military Refuelling Depot:</span>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", color: nearestFuelDepot ? 'var(--accent)' : 'var(--text-muted)', textAlign: 'right' }}>
                {nearestFuelDepot
                  ? `${nearestFuelDepot.place_name || nearestFuelDepot.place_id} (~${nearestFuelDepot.detour_km} km)`
                  : 'No intermediate depot on corridor'}
              </span>
            </div>

            <div style={{
              marginTop: 4,
              padding: '6px 8px',
              borderRadius: 4,
              background: 'rgba(102, 140, 160, 0.08)',
              border: '1px solid var(--border)',
              fontSize: 10.5,
              color: 'var(--text-muted)',
              lineHeight: 1.4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontWeight: 600, marginBottom: 2 }}>
                <ShieldCheck size={12} /> Dispatch Compliance
              </div>
              {fuelFeasibility.advisory}
            </div>
          </div>
        </div>
      </div>

      {/* Route Assessment and Risks (2-Column Grid) */}
      <div className="jp-assessment-grid">
        {/* Left Column: Route Constraints */}
        <div className="jp-readiness-card">
          <div className="jp-readiness-card-header">
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Scale size={14} color="var(--accent)" />
                <span>Route Constraints & Infrastructure</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Bridge structural limits and convoy regulated speed
              </div>
            </div>
            <span className={`jp-risk-pill ${routeConstraints.bridgeCleared ? 'low' : 'high'}`}>
              {routeConstraints.bridgeCleared ? 'CLEARED' : 'BRIDGE BOTTLENECK'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="jp-risk-row">
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Bridge Capacity Limit</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Corridor structural limit: {routeConstraints.bridgeLimit} t | Heaviest convoy vehicle: {routeConstraints.maxWeight} t
                </div>
              </div>
              <span className={`jp-risk-pill ${routeConstraints.bridgeCleared ? 'low' : 'high'}`}>
                {routeConstraints.bridgeCleared ? 'PASS' : 'EXCEEDED'}
              </span>
            </div>

            <div className="jp-risk-row">
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Regulated Convoy Speed</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Standard tactical convoy speed: {routeConstraints.speedLimitKmh} km/h
                </div>
              </div>
              <span className="jp-risk-pill low">40 KM/H</span>
            </div>

            <div className="jp-risk-row">
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Corridor Terrain Classification</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Standard National / Strategic Highway transit corridor
                </div>
              </div>
              <span className="jp-risk-pill low">CLASSIFIED</span>
            </div>
          </div>
        </div>

        {/* Right Column: Risk Analysis */}
        <div className="jp-readiness-card">
          <div className="jp-readiness-card-header">
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldAlert size={14} color="var(--accent)" />
                <span>Corridor Risk Analysis</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Evaluated hazard indicators — see Readiness Summary below for VORAM status
              </div>
            </div>
          </div>

          {riskAnalysis.voram?.assessment_status === 'FAIL' && (
            <div style={{ background: 'rgba(161, 15, 24, 0.15)', border: '1px solid #A10F18', borderRadius: 4, padding: '8px 10px', fontSize: 11, color: '#FFC2C2', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={14} color="#A10F18" />
              <span><b>Mandatory Constraint Failure:</b> Route corridor violates hard physical constraints.</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {riskAnalysis.items.map((item, idx) => (
              <div key={idx} className="jp-risk-row">
                <div style={{ maxWidth: '75%' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 11 }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.text}</div>
                </div>
                <span className={`jp-risk-pill ${item.level}`}>
                  {item.level.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Journey Sensitivity & Escort Support Advisory */}
      <div style={{ marginBottom: 16 }}>
        <SensitivityAdvisoryCard
          journeyId={stagedTargetId}
          convoy={convoy}
          advisory={sensitivityAdvisory}
          currentUser={currentUser}
          onAdvisoryUpdated={(newAdv) => setSensitivityAdvisory(newAdv)}
          isModalOpen={advisoryModalOpen}
          setIsModalOpen={setAdvisoryModalOpen}
        />
      </div>

      {/* Systemic Operational Readiness Summary (5 Dimensions) */}
      <div style={{ marginBottom: 16 }}>
        <JourneyReadinessSummary
          journeyId={stagedTargetId}
          routeConstraints={routeConstraints}
          voramAssessment={currentVoram || route?.voram_assessment}
          ropReport={ropReport}
          sensitivityAdvisory={sensitivityAdvisory}
          convoyValidation={convoyValidation}
          currentUser={currentUser}
          onOpenRopModal={() => setRopModalOpen(true)}
          onOpenVerifyModal={() => setVerifyModalOpen(true)}
          onOpenAdvisoryModal={() => setAdvisoryModalOpen(true)}
          onOverrideRecorded={(ov) => setReadinessOverride(ov)}
          onReassessVoram={handleReassessVoram}
          reassessing={reassessing}
        />
      </div>

      {/* Optional Notes Section */}
      {notes && (
        <div style={{
          background: 'var(--panel-bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          marginBottom: 16
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={13} color="var(--accent)" /> Operational Notes
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {notes}
          </div>
        </div>
      )}

      {/* Bottom Actions Bar */}
      <div className="jp-bottom-bar">
        <button
          type="button"
          className="btn secondary"
          onClick={() => setPage('Convoy Builder')}
        >
          ← Back to Convoy Builder
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!allReady && (
            <span style={{ fontSize: 11, color: 'var(--warn)' }}>
              Complete all pre-commit checks to enable operational commitment.
            </span>
          )}

          {journeyId ? (
            <button
              type="button"
              className="btn primary"
              style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}
              onClick={() => setPage('Journey Operations')}
            >
              Proceed to Journey Operations →
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}
              onClick={handleCommitJourney}
              disabled={creating || !allReady || !canCreate}
            >
              {creating ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <RefreshCw size={14} className="spin" /> Committing Journey to Registry…
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck size={15} /> Commit & Proceed to Operations →
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ROP Evidence Submission Modal */}
      <RopReportModal
        isOpen={ropModalOpen}
        onClose={() => setRopModalOpen(false)}
        journeyId={stagedTargetId}
        routeVersion={route?.mode || 'primary'}
        existingReport={ropReport}
        currentUser={currentUser}
        onReportSaved={(saved) => {
          setRopReport(saved);
          setRopModalOpen(false);
        }}
      />

      {/* ROP Verification Workspace Modal (Authorized Reviewers) */}
      <RopVerificationModal
        isOpen={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        journeyId={stagedTargetId}
        report={ropReport}
        currentUser={currentUser}
        onVerificationComplete={(verified) => {
          setRopReport(verified);
          setVerifyModalOpen(false);
          handleReassessVoram();
        }}
      />
    </Shell>
  );
}
