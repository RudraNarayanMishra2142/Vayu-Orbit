import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import MapView from '../components/MapView';
import RouteDirectionsPanel from '../components/navigation/RouteDirectionsPanel';
import { fetchRouteWithGuidance, generateTacticalMilestoneInstructions } from '../services/navigationService';
import { parseDepartureDateTime } from '../services/journeySelection';
import {
  AlertTriangle, CheckCircle2, Clock, Truck, MapPin, Calendar,
  ShieldCheck, ShieldAlert, ArrowRight, RefreshCw, Copy, Check,
  Route, Compass, Radio, Search, Filter, Plus, ChevronRight,
  ArrowLeft, X, Fuel, FileText, AlertCircle, Eye, Shield, CheckSquare
} from 'lucide-react';

function statusColor(s) {
  const m = {
    SCHEDULED: 'var(--accent)',
    ACTIVE: 'var(--ok)',
    DISRUPTED: 'var(--warn)',
    COMPLETED: 'var(--text-muted)',
    CANCELLED: 'var(--bad)'
  };
  return m[s] || 'var(--text-muted)';
}

/**
 * Deterministic operational journey sorting:
 * 1. Active journeys requiring monitoring (ACTIVE)
 * 2. Disrupted or overdue journeys needing attention (DISRUPTED / overdue)
 * 3. Upcoming journeys ordered by scheduled departure (SCHEDULED / DRAFT)
 * 4. Completed or cancelled journeys (other)
 */
function sortJourneysOperational(journeys = []) {
  const nowMs = Date.now();

  return [...journeys].sort((a, b) => {
    const aStatus = (a.status || '').toUpperCase();
    const bStatus = (b.status || '').toUpperCase();
    const aTime = parseDepartureDateTime(a) || Infinity;
    const bTime = parseDepartureDateTime(b) || Infinity;

    const getBucket = (status, time) => {
      if (status === 'ACTIVE') return 1;
      if (status === 'DISRUPTED') return 2;
      if (status === 'SCHEDULED' || status === 'DRAFT') {
        if (time < nowMs) return 2; // Overdue -> Needs attention
        return 3; // Upcoming
      }
      return 4; // Completed / Cancelled
    };

    const bucketA = getBucket(aStatus, aTime);
    const bucketB = getBucket(bStatus, bTime);

    if (bucketA !== bucketB) {
      return bucketA - bucketB;
    }

    if (aTime !== bTime) {
      return aTime - bTime;
    }

    return String(a.journey_id || '').localeCompare(String(b.journey_id || ''));
  });
}

export default function JourneyOperations({
  mission = {},
  journey = null,
  loading = false,
  error = '',
  setPage,
  onUpdateJourney,
  currentUser
}) {
  // Directory & active journey state
  const [journeysList, setJourneysList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [selectedJourney, setSelectedJourney] = useState(journey || mission?.journey || null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL_ACTIVE_UPCOMING'); // 'ALL_ACTIVE_UPCOMING' | 'ACTIVE' | 'UPCOMING' | 'ATTENTION' | 'COMPLETED' | 'ALL'

  // Operation action feedback
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  // Node catalog
  const [nodeDict, setNodeDict] = useState({});
  const [roadGeometry, setRoadGeometry] = useState(null);

  // Turn-by-Turn Navigation & Guidance State
  const [instructions, setInstructions] = useState([]);
  const [navLoading, setNavLoading] = useState(false);
  const [navSource, setNavSource] = useState('');
  const [selectedInstruction, setSelectedInstruction] = useState(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);
  const [activeRouteView, setActiveRouteView] = useState('PLANNED'); // 'PLANNED' | 'RECALCULATED'

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

  // Action Modals
  const [checkpointModal, setCheckpointModal] = useState({ open: false, checkpoint: '', message: '' });
  const [disruptionModal, setDisruptionModal] = useState({ open: false, type: 'ROAD_CLOSED', message: '', validationError: '' });
  const [overrideModal, setOverrideModal] = useState({ open: false, reason: '', validationError: '' });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', action: null, isDestructive: false });

  // Modal accessibility & focus management
  const modalTriggerRef = useRef(null);
  const firstInputRef = useRef(null);

  // Recalculation result
  const [recalculating, setRecalculating] = useState(false);
  const [detourResult, setDetourResult] = useState(null);

  // Departure gate blocker state
  const [departureGateBlocked, setDepartureGateBlocked] = useState(null);

  const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;

  // Role permissions
  const role = currentUser?.role || '';
  const canCreate = !currentUser || ['CREATOR', 'COORDINATOR', 'ADMIN'].includes(role);
  const canCoordinate = !currentUser || ['COORDINATOR', 'ADMIN'].includes(role);
  const canRecordCheckpoint = !currentUser || ['CHECKPOINT_OPERATOR', 'COORDINATOR', 'ADMIN'].includes(role);

  // Close helper for Disruption Modal
  const handleCloseDisruption = useCallback(() => {
    if (actionBusy) return;
    setDisruptionModal({ open: false, type: 'ROAD_CLOSED', message: '', validationError: '' });
    if (modalTriggerRef.current) {
      modalTriggerRef.current.focus();
    }
  }, [actionBusy]);

  // Close helper for Checkpoint Modal
  const handleCloseCheckpoint = useCallback(() => {
    if (actionBusy) return;
    setCheckpointModal({ open: false, checkpoint: '', message: '' });
    if (modalTriggerRef.current) {
      modalTriggerRef.current.focus();
    }
  }, [actionBusy]);

  // Close helper for Override Modal
  const handleCloseOverride = useCallback(() => {
    if (actionBusy) return;
    setOverrideModal({ open: false, reason: '', validationError: '' });
    if (modalTriggerRef.current) {
      modalTriggerRef.current.focus();
    }
  }, [actionBusy]);

  // Close helper for Confirm Modal
  const handleCloseConfirm = useCallback(() => {
    if (actionBusy) return;
    setConfirmModal({ open: false, title: '', message: '', action: null, isDestructive: false });
    if (modalTriggerRef.current) {
      modalTriggerRef.current.focus();
    }
  }, [actionBusy]);

  // Global Escape key listener to dismiss open modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !actionBusy) {
        if (disruptionModal.open) handleCloseDisruption();
        else if (checkpointModal.open) handleCloseCheckpoint();
        else if (overrideModal.open) handleCloseOverride();
        else if (confirmModal.open) handleCloseConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actionBusy, disruptionModal.open, checkpointModal.open, overrideModal.open, confirmModal.open, handleCloseDisruption, handleCloseCheckpoint, handleCloseOverride, handleCloseConfirm]);

  // Auto-focus first input when any modal opens
  useEffect(() => {
    if (disruptionModal.open || checkpointModal.open || overrideModal.open || confirmModal.open) {
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [disruptionModal.open, checkpointModal.open, overrideModal.open, confirmModal.open]);

  // Load places and nodes catalog
  useEffect(() => {
    let active = true;
    Promise.all([
      api.places().catch(() => []),
      api.nodes().catch(() => ({}))
    ]).then(([places, nodes]) => {
      if (!active) return;
      const dict = {};
      if (Array.isArray(places)) {
        places.forEach((p) => {
          const clean = (p.place_id || '').replace('PLC-', '');
          dict[p.place_id] = p;
          dict[clean] = p;
        });
      }
      if (nodes && typeof nodes === 'object') {
        Object.entries(nodes).forEach(([id, n]) => {
          const clean = id.replace('PLC-', '');
          if (!dict[id]) {
            dict[id] = {
              place_id: id,
              place_name: n.installation_name || n.name || id,
              lat: n.lat,
              lon: n.lon != null ? n.lon : n.lng
            };
          }
          if (!dict[clean]) dict[clean] = dict[id];
        });
      }
      setNodeDict(dict);
    });
    return () => { active = false; };
  }, []);

  // Synchronize incoming journey prop
  useEffect(() => {
    if (journey) {
      setSelectedJourney(journey);
    } else if (mission?.journey) {
      setSelectedJourney(mission.journey);
    }
  }, [journey, mission?.journey]);

  // Load journeys list
  const loadJourneys = useCallback(async () => {
    setLoadingList(true);
    setListError('');
    try {
      const data = await api.journeys();
      setJourneysList(Array.isArray(data) ? data : []);
    } catch (err) {
      setListError(err.message || 'Failed to load operational journeys.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadJourneys();
  }, [loadJourneys]);

  // Select journey handler
  const handleSelectJourney = async (jid) => {
    if (!jid) return;
    setLoadingDetail(true);
    setActionError('');
    setActionSuccess('');
    setDepartureGateBlocked(null);
    setDetourResult(null);
    setActiveRouteView('PLANNED');
    setSelectedInstruction(null);
    setSelectedCheckpoint(null);
    try {
      const full = await api.journey(jid);
      setSelectedJourney(full);
      if (onUpdateJourney) onUpdateJourney(full);
      try {
        window.sessionStorage.setItem('vayu_active_operations_journey_id', jid);
      } catch {}
    } catch (err) {
      setActionError(`Could not load journey ${jid}: ${err.message}`);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Back to directory
  const handleBackToList = () => {
    setSelectedJourney(null);
    setDetourResult(null);
    setActiveRouteView('PLANNED');
    setSelectedInstruction(null);
    setSelectedCheckpoint(null);
    setActionError('');
    setActionSuccess('');
    loadJourneys();
  };

  // Resolve active path, legs, and metrics based on activeRouteView ('PLANNED' vs 'RECALCULATED')
  const activeRouteData = useMemo(() => {
    if (!selectedJourney) return null;
    if (activeRouteView === 'RECALCULATED' && detourResult?.updated?.selected_route) {
      const r = detourResult.updated.selected_route;
      return {
        path: r.path || [],
        legs: r.legs || [],
        distance_km: r.distance_km,
        eta_hours: r.eta_hours,
        isRecalculated: true
      };
    }
    const r = selectedJourney.route || selectedJourney.baseline_route || {};
    return {
      path: r.path || [],
      legs: r.legs || [],
      distance_km: selectedJourney.distance_km || r.distance_km,
      eta_hours: selectedJourney.eta_hours || r.eta_hours,
      isRecalculated: false
    };
  }, [selectedJourney, activeRouteView, detourResult]);

  // Resolve road geometry & turn-by-turn guidance for selected journey & route version
  useEffect(() => {
    if (!selectedJourney || !activeRouteData?.path || activeRouteData.path.length < 2) {
      setRoadGeometry(null);
      setInstructions([]);
      setNavSource('');
      return;
    }

    if (Object.keys(nodeDict).length === 0) return;

    // If viewing planned route and instructions are already in selectedJourney
    if (
      activeRouteView === 'PLANNED' &&
      selectedJourney.route?.geometry?.coordinates?.length > 1 &&
      Array.isArray(selectedJourney.route?.instructions) &&
      selectedJourney.route.instructions.length > 0
    ) {
      setRoadGeometry(selectedJourney.route.geometry);
      setInstructions(selectedJourney.route.instructions);
      setNavSource('Persisted Approved Route');
      return;
    }

    let active = true;
    const ctl = new AbortController();
    setNavLoading(true);

    fetchRouteWithGuidance(activeRouteData.path, nodeDict, apiKey, ctl.signal)
      .then((res) => {
        if (!active) return;
        if (res && res.geometry && res.geometry.coordinates?.length > 0) {
          setRoadGeometry(res.geometry);
          setInstructions(res.instructions || []);
          setNavSource(
            res.source === 'ROAD_NETWORK_DIRECT'
              ? 'Road Network (Direct Corridor)'
              : (activeRouteView === 'RECALCULATED'
                ? 'Recalculated Detour Road Network'
                : 'Road Network (TomTom Routing)')
          );
        } else {
          // Fallback to structured military corridor milestones
          const milestones = generateTacticalMilestoneInstructions(
            activeRouteData.path,
            nodeDict,
            activeRouteData.legs
          );
          setInstructions(milestones);
          setNavSource('Tactical Milestones (Road Geometry Unavailable)');
        }
      })
      .catch(() => {
        if (active) {
          const milestones = generateTacticalMilestoneInstructions(
            activeRouteData.path,
            nodeDict,
            activeRouteData.legs
          );
          setInstructions(milestones);
          setNavSource('Tactical Milestones (Road Geometry Unavailable)');
        }
      })
      .finally(() => {
        if (active) setNavLoading(false);
      });

    return () => {
      active = false;
      ctl.abort();
    };
  }, [selectedJourney, activeRouteData, nodeDict, apiKey, activeRouteView]);

  // Copy Journey ID
  const handleCopyId = (id) => {
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    });
  };

  // Lifecycle status transition
  const handleTransitionStatus = async (newStatus, message = '', overrideReason = null) => {
    if (!selectedJourney?.journey_id || actionBusy) return;
    setActionBusy(true);
    setActionError('');
    setActionSuccess('');

    try {
      const updated = await api.journeyStatus(selectedJourney.journey_id, newStatus, message, overrideReason);
      setSelectedJourney(updated);
      if (onUpdateJourney) onUpdateJourney(updated);
      setDepartureGateBlocked(null);
      handleCloseOverride();
      setActionSuccess(`Journey status updated to ${newStatus}.`);
      loadJourneys();
    } catch (err) {
      if (err.detail?.code?.startsWith('DEPARTURE_BLOCKED_') || err.message?.includes('Departure blocked by fuel safety gate')) {
        setDepartureGateBlocked(err.detail || {
          code: 'DEPARTURE_BLOCKED',
          message: err.message
        });
        setActionError(err.message || 'Departure blocked by fuel safety gate.');
        return;
      }
      setActionError(err.message || `Failed to transition journey to ${newStatus}.`);
    } finally {
      setActionBusy(false);
    }
  };

  // Record Checkpoint Event
  const handleSubmitCheckpoint = async () => {
    if (!selectedJourney?.journey_id || !checkpointModal.checkpoint || actionBusy) return;
    setActionBusy(true);
    setActionError('');
    setActionSuccess('');

    try {
      const checkpointName = checkpointModal.checkpoint;
      const msg = checkpointModal.message.trim() || `Convoy reached and verified at checkpoint ${checkpointName}.`;
      await api.event(selectedJourney.journey_id, {
        event_type: 'CHECKPOINT_REACHED',
        message: msg,
        payload: { checkpoint_id: checkpointName, timestamp: new Date().toISOString() }
      });
      setActionSuccess(`Checkpoint event recorded for ${checkpointName}.`);
      handleCloseCheckpoint();
      // Refresh journey
      const fresh = await api.journey(selectedJourney.journey_id);
      setSelectedJourney(fresh);
      if (onUpdateJourney) onUpdateJourney(fresh);
    } catch (err) {
      setActionError(err.message || 'Failed to record checkpoint event.');
    } finally {
      setActionBusy(false);
    }
  };

  // Submit Disruption
  const handleSubmitDisruption = async () => {
    if (!selectedJourney?.journey_id || actionBusy) return;
    if (!disruptionModal.message.trim()) {
      setDisruptionModal((prev) => ({
        ...prev,
        validationError: 'Please provide disruption details before logging.'
      }));
      firstInputRef.current?.focus();
      return;
    }
    setActionBusy(true);
    setActionError('');
    setActionSuccess('');

    try {
      await api.disruption(selectedJourney.journey_id, {
        disruption_type: disruptionModal.type,
        message: disruptionModal.message.trim()
      });
      setActionSuccess('Disruption logged. Journey marked DISRUPTED.');
      handleCloseDisruption();
      const fresh = await api.journey(selectedJourney.journey_id);
      setSelectedJourney(fresh);
      if (onUpdateJourney) onUpdateJourney(fresh);
      loadJourneys();
    } catch (err) {
      setActionError(err.message || 'Failed to log disruption.');
    } finally {
      setActionBusy(false);
    }
  };

  // Recalculate route for disrupted journey
  const handleRecalculateRoute = async () => {
    if (!selectedJourney?.journey_id || recalculating) return;
    setRecalculating(true);
    setActionError('');
    setActionSuccess('');

    try {
      const orig = selectedJourney.origin_id || selectedJourney.route?.path?.[0];
      const dest = selectedJourney.dest_id || selectedJourney.route?.path?.[selectedJourney.route?.path?.length - 1];
      const res = await api.recalc({
        origin_id: orig,
        dest_id: dest,
        convoy_speed_kmh: selectedJourney.convoy_speed_kmh || 40,
        max_vehicle_tons: selectedJourney.max_vehicle_tons || 35.0,
        disruptions: [{
          node_id: selectedJourney.route?.path?.[1] || orig,
          disruption_type: 'ROAD_CLOSED',
          factor: 2.0
        }]
      });
      if (res?.updated?.selected_route) {
        setDetourResult(res);
        setActiveRouteView('RECALCULATED');
        setSelectedInstruction(null);
        setSelectedCheckpoint(null);
        setActionSuccess('Alternative tactical detour route calculated successfully.');
      } else {
        setActionError('No alternative corridor path found around disruption.');
      }
    } catch (err) {
      setActionError(err.message || 'Failed to recalculate alternative route.');
    } finally {
      setRecalculating(false);
    }
  };

  // Tally counts for status summary
  const statusSummary = useMemo(() => {
    const nowMs = Date.now();
    let active = 0;
    let upcoming = 0;
    let attention = 0;

    journeysList.forEach((j) => {
      const st = (j.status || '').toUpperCase();
      const depMs = parseDepartureDateTime(j);
      if (st === 'ACTIVE') {
        active++;
      } else if (st === 'DISRUPTED') {
        attention++;
      } else if (st === 'SCHEDULED' || st === 'DRAFT') {
        if (depMs && depMs < nowMs) {
          attention++; // Overdue
        } else {
          upcoming++;
        }
      }
    });

    return { active, upcoming, attention };
  }, [journeysList]);

  // Filter and sort journeys
  const displayJourneys = useMemo(() => {
    const sorted = sortJourneysOperational(journeysList);
    const nowMs = Date.now();
    const q = searchQuery.trim().toLowerCase();

    return sorted.filter((j) => {
      const st = (j.status || '').toUpperCase();
      const depMs = parseDepartureDateTime(j);
      const isOverdue = (st === 'SCHEDULED' || st === 'DRAFT') && depMs && depMs < nowMs;

      // Status filter
      if (statusFilter === 'ALL_ACTIVE_UPCOMING') {
        if (st === 'COMPLETED' || st === 'CANCELLED') return false;
      } else if (statusFilter === 'ACTIVE') {
        if (st !== 'ACTIVE') return false;
      } else if (statusFilter === 'UPCOMING') {
        if ((st !== 'SCHEDULED' && st !== 'DRAFT') || isOverdue) return false;
      } else if (statusFilter === 'ATTENTION') {
        if (st !== 'DISRUPTED' && !isOverdue) return false;
      } else if (statusFilter === 'COMPLETED') {
        if (st !== 'COMPLETED') return false;
      } else if (statusFilter === 'CANCELLED') {
        if (st !== 'CANCELLED') return false;
      }

      // Search query
      if (q) {
        const jid = (j.journey_id || '').toLowerCase();
        const orig = (j.origin_name || j.origin_id || '').toLowerCase();
        const dest = (j.dest_name || j.dest_id || '').toLowerCase();
        if (!jid.includes(q) && !orig.includes(q) && !dest.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [journeysList, statusFilter, searchQuery]);

  // Format waypoints for selected journey
  const journeyWaypoints = useMemo(() => {
    if (!selectedJourney?.route?.path) return [];
    const path = selectedJourney.route.path;

    return path.map((nodeId, idx) => {
      const clean = (nodeId || '').replace('PLC-', '');
      const n = nodeDict[clean] || nodeDict[nodeId] || {};
      const isOrigin = idx === 0;
      const isDest = idx === path.length - 1;

      // Check if checkpoint event recorded
      const hasEvent = (selectedJourney.events || []).some(
        (e) => e.event_type === 'CHECKPOINT_REACHED' && (e.message?.includes(nodeId) || e.message?.includes(n.place_name || clean))
      );

      return {
        id: nodeId,
        name: n.place_name || n.name || nodeId,
        lat: n.lat != null ? Number(n.lat) : null,
        lon: Number(n.lon != null ? n.lon : (n.lng != null ? n.lng : null)),
        isOrigin,
        isDest,
        isCheckpoint: !isOrigin && !isDest,
        cleared: hasEvent
      };
    });
  }, [selectedJourney, nodeDict]);

  const originNode = useMemo(() => {
    const origId = selectedJourney?.origin_id || selectedJourney?.route?.path?.[0];
    if (!origId) return null;
    const clean = origId.replace('PLC-', '');
    const n = nodeDict[clean] || nodeDict[origId];
    if (n && n.lat != null) {
      return { lat: Number(n.lat), lon: Number(n.lon != null ? n.lon : n.lng), place_name: selectedJourney?.origin_name || n.place_name || origId };
    }
    return null;
  }, [selectedJourney, nodeDict]);

  const destNode = useMemo(() => {
    const destId = selectedJourney?.dest_id || selectedJourney?.route?.path?.[selectedJourney?.route?.path?.length - 1];
    if (!destId) return null;
    const clean = destId.replace('PLC-', '');
    const n = nodeDict[clean] || nodeDict[destId];
    if (n && n.lat != null) {
      return { lat: Number(n.lat), lon: Number(n.lon != null ? n.lon : n.lng), place_name: selectedJourney?.dest_name || n.place_name || destId };
    }
    return null;
  }, [selectedJourney, nodeDict]);

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW: JOURNEY DETAILS (SHOW ON DEMAND)
  // ─────────────────────────────────────────────────────────────────────────────
  if (selectedJourney) {
    const j = selectedJourney;
    const jStatus = (j.status || '').toUpperCase();
    const isScheduled = jStatus === 'SCHEDULED' || jStatus === 'DRAFT';
    const isActive = jStatus === 'ACTIVE';
    const isDisrupted = jStatus === 'DISRUPTED';
    const isCompleted = jStatus === 'COMPLETED';
    const isCancelled = jStatus === 'CANCELLED';
    const isTerminal = isCompleted || isCancelled;

    return (
      <Shell
        title="Journey Operations"
        eyebrow="OPERATIONAL MISSION CONTROL"
        description="Monitor journeys and manage operational updates."
        actions={
          <button
            type="button"
            className="btn small"
            onClick={handleBackToList}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={13} /> Back to Journey List
          </button>
        }
      >
        {/* Action Alerts */}
        {actionError && (
          <div className="alert alert-danger" style={{ marginBottom: 14 }}>
            <b>Action Alert:</b> {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="alert alert-success" style={{ marginBottom: 14 }}>
            <b>Success:</b> {actionSuccess}
          </div>
        )}

        {/* Departure Safety Gate Block Notice */}
        {departureGateBlocked && canCoordinate && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={16} /> Departure Fuel Safety Gate Blocked
            </div>
            <div style={{ fontSize: 12, marginBottom: 8 }}>{departureGateBlocked.message}</div>
            <button
              type="button"
              className="btn primary small"
              onClick={(e) => {
                modalTriggerRef.current = e.currentTarget;
                setOverrideModal({ open: true, reason: '', validationError: '' });
              }}
            >
              Authorize Departure Fuel Override →
            </button>
          </div>
        )}

        {/* ── SECTION 1: JOURNEY OVERVIEW ── */}
        <div className="jo-detail-header-bar">
          <div className="jo-detail-meta">
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Journey ID</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                  {j.journey_id}
                </span>
                <button
                  type="button"
                  className="btn small"
                  style={{ padding: '2px 5px', fontSize: 10 }}
                  onClick={() => handleCopyId(j.journey_id)}
                  title="Copy ID"
                >
                  {copiedId ? <Check size={11} color="var(--ok)" /> : <Copy size={11} />}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Corridor Route</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', marginTop: 2 }}>
                {j.origin_name || j.origin_id} <span style={{ color: 'var(--accent)' }}>→</span> {j.dest_name || j.dest_id}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scheduled Departure</div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: 'var(--text-main)', marginTop: 2 }}>
                {j.departure_date || '—'} {j.departure_time ? `@ ${j.departure_time} hrs` : ''}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operational Status</div>
              <span className={`pill ${jStatus}`} style={{ fontSize: 10, padding: '2px 8px', marginTop: 2, display: 'inline-block' }}>
                {jStatus}
              </span>
            </div>
          </div>

          {/* Primary Lifecycle Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {isScheduled && canCoordinate && (
              <button
                type="button"
                className="btn primary small"
                disabled={actionBusy}
                onClick={() => handleTransitionStatus('ACTIVE', 'Convoy departed origin and entered active transit.')}
              >
                {actionBusy ? 'Starting…' : 'Start Journey →'}
              </button>
            )}

            {isActive && canRecordCheckpoint && (
              <button
                type="button"
                className="btn primary small"
                onClick={(e) => {
                  modalTriggerRef.current = e.currentTarget;
                  const nextCp = journeyWaypoints.find((w) => w.isCheckpoint && !w.cleared);
                  setCheckpointModal({
                    open: true,
                    checkpoint: nextCp ? nextCp.id : (journeyWaypoints[1]?.id || ''),
                    message: ''
                  });
                }}
              >
                <CheckSquare size={13} style={{ marginRight: 4 }} /> Record Checkpoint Event
              </button>
            )}

            {isActive && canCoordinate && (
              <>
                <button
                  type="button"
                  className="btn small"
                  style={{ color: 'var(--warn)', borderColor: 'rgba(255, 184, 77, 0.4)' }}
                  onClick={(e) => {
                    modalTriggerRef.current = e.currentTarget;
                    setDisruptionModal({ open: true, type: 'ROAD_CLOSED', message: '', validationError: '' });
                  }}
                >
                  <AlertTriangle size={13} style={{ marginRight: 4 }} /> Log Disruption
                </button>
                <button
                  type="button"
                  className="btn small"
                  style={{ color: 'var(--ok)', borderColor: 'rgba(106, 154, 124, 0.4)' }}
                  disabled={actionBusy}
                  onClick={(e) => {
                    modalTriggerRef.current = e.currentTarget;
                    setConfirmModal({
                      open: true,
                      title: 'Mark Journey Completed',
                      message: `Are you sure you want to mark ${j.journey_id} as COMPLETED? This will finalize the transit record and generate the debrief report.`,
                      action: () => handleTransitionStatus('COMPLETED', 'Convoy arrived at destination. Journey marked completed.'),
                      isDestructive: false
                    });
                  }}
                >
                  Mark Completed
                </button>
              </>
            )}

            {isDisrupted && canCoordinate && (
              <>
                <button
                  type="button"
                  className="btn primary small"
                  disabled={actionBusy}
                  onClick={() => handleTransitionStatus('ACTIVE', 'Disruption resolved. Convoy resumed active movement.')}
                >
                  Resume Active Transit
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={recalculating}
                  onClick={handleRecalculateRoute}
                >
                  {recalculating ? 'Recalculating…' : 'Recalculate Route'}
                </button>
              </>
            )}

            {isCompleted && (
              <button
                type="button"
                className="btn primary small"
                onClick={() => setPage('Get Your Journey Report')}
              >
                <FileText size={13} style={{ marginRight: 4 }} /> View Debrief Report
              </button>
            )}

            {!isTerminal && canCoordinate && (
              <button
                type="button"
                className="btn small"
                style={{ color: 'var(--bad)', borderColor: 'rgba(255, 64, 96, 0.3)' }}
                onClick={(e) => {
                  modalTriggerRef.current = e.currentTarget;
                  setConfirmModal({
                    open: true,
                    title: 'Cancel Journey',
                    message: `Are you sure you want to cancel journey ${j.journey_id}? This operation cannot be undone.`,
                    action: () => handleTransitionStatus('CANCELLED', 'Journey cancelled by operational coordinator.'),
                    isDestructive: true
                  });
                }}
              >
                Cancel Journey
              </button>
            )}
          </div>
        </div>

        {/* ── SECTION 2: ROUTE AND VEHICLES ── */}
        <div className="jo-route-vehicles-grid">
          {/* Tactical Route Map */}
          <div className="jo-detail-section" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="jo-section-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Compass size={14} color="var(--accent)" />
                <span>Tactical Route Map</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {detourResult?.updated?.selected_route && (
                  <span className="pill DISRUPTED" style={{ fontSize: 9.5 }}>
                    Detour Available
                  </span>
                )}
                <span className="pill" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5 }}>
                  {activeRouteData?.distance_km ? `${activeRouteData.distance_km} km` : (j.distance_km ? `${j.distance_km} km` : 'Corridor')}
                </span>
              </div>
            </div>

            <div style={{ position: 'relative', height: 380, width: '100%', background: 'var(--color-bg)' }}>
              <MapView
                places={Object.values(nodeDict)}
                routeGeometry={roadGeometry}
                waypoints={journeyWaypoints.filter((w) => w.isCheckpoint)}
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
            </div>

            {/* Turn-by-Turn Route Directions Panel */}
            <RouteDirectionsPanel
              originName={j.origin_name || j.origin_id}
              destName={j.dest_name || j.dest_id}
              totalDistanceKm={activeRouteData?.distance_km}
              totalEtaHours={activeRouteData?.eta_hours}
              instructions={instructions}
              loading={navLoading}
              source={navSource}
              selectedInstruction={selectedInstruction}
              onSelectInstruction={(ins) => {
                setSelectedInstruction(ins);
                setSelectedCheckpoint(null);
              }}
              isRecalculated={activeRouteView === 'RECALCULATED'}
              routeType={activeRouteView}
              onToggleRouteType={(type) => {
                setActiveRouteView(type);
                setSelectedInstruction(null);
                setSelectedCheckpoint(null);
              }}
              hasRecalculatedOption={Boolean(detourResult?.updated?.selected_route)}
              collapsible={true}
              initiallyExpanded={false}
            />
          </div>

          {/* Checkpoints & Vehicles Split */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Available Checkpoints */}
            <div className="jo-detail-section">
              <div className="jo-section-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={14} color="var(--accent)" />
                  <span>Corridor Checkpoints</span>
                </div>
                <span className="pill" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5 }}>
                  {journeyWaypoints.length} nodes
                </span>
              </div>

              <div style={{ padding: '8px 12px', maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {journeyWaypoints.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
                    No intermediate checkpoints defined.
                  </div>
                ) : (
                  journeyWaypoints.map((w, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedCheckpoint(w);
                        setSelectedInstruction(null);
                      }}
                      title="Click to view checkpoint on map"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: 4,
                        cursor: 'pointer',
                        background: selectedCheckpoint?.id === w.id
                          ? 'var(--color-primary-soft)'
                          : (w.cleared ? 'var(--status-success-bg)' : 'var(--panel-raised)'),
                        border: `1px solid ${selectedCheckpoint?.id === w.id
                          ? 'var(--color-accent-primary)'
                          : (w.cleared ? 'var(--color-success-border)' : 'var(--border)')}`,
                        fontSize: 11.5,
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontFamily: "'Share Tech Mono', monospace",
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 4px',
                          borderRadius: 3,
                          background: w.isOrigin ? 'rgba(0, 229, 163, 0.15)' : (w.isDest ? 'rgba(255, 64, 96, 0.15)' : 'var(--panel-hover)'),
                          color: w.isOrigin ? 'var(--ok)' : (w.isDest ? 'var(--bad)' : 'var(--text-muted)')
                        }}>
                          {w.isOrigin ? 'A' : (w.isDest ? 'B' : `#${idx}`)}
                        </span>
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{w.name}</span>
                          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5, color: 'var(--text-muted)', marginLeft: 6 }}>
                            [{w.id}]
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {w.cleared && (
                          <span className="pill ACTIVE" style={{ fontSize: 8.5, padding: '1px 5px' }}>
                            CLEARED
                          </span>
                        )}
                        {isActive && canRecordCheckpoint && w.isCheckpoint && !w.cleared && (
                          <button
                            type="button"
                            className="btn small"
                            style={{ padding: '2px 6px', fontSize: 9.5 }}
                            onClick={(e) => {
                              modalTriggerRef.current = e.currentTarget;
                              setCheckpointModal({ open: true, checkpoint: w.id, message: '' });
                            }}
                          >
                            Log →
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Assigned Vehicles */}
            <div className="jo-detail-section">
              <div className="jo-section-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Truck size={14} color="var(--accent)" />
                  <span>Assigned Convoy Vehicles</span>
                </div>
                <span className="pill" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5 }}>
                  {j.convoy?.length || 0} vehicles
                </span>
              </div>

              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                <table className="jo-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Model / Unit</th>
                      <th>Role & Load</th>
                      <th>Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(j.convoy || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>
                          No vehicles recorded on manifest.
                        </td>
                      </tr>
                    ) : (
                      j.convoy.map((v, idx) => {
                        const unitId = v.unit_id ? String(v.unit_id).trim() : null;
                        const role = (v.role_category || 'DUAL').toUpperCase();
                        const gross = (Number(v.gvw_tons || 0) + Number(v.payload || v.cargo_tons || 0)).toFixed(1);

                        return (
                          <tr key={idx}>
                            <td style={{ fontFamily: "'Share Tech Mono', monospace", fontWeight: 700 }}>
                              #{idx + 1}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 11.5 }}>
                                {v.model_name || v.vehicle_id}
                              </div>
                              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9.5, color: unitId ? 'var(--accent)' : 'var(--text-muted)' }}>
                                {unitId ? `${unitId}${v.callsign ? ` (${v.callsign})` : ''}` : 'Depot Pool'}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{role}</div>
                              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10 }}>{gross}t</div>
                            </td>
                            <td style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10.5 }}>
                              {v.operational_range_km ? `${v.operational_range_km} km` : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 3: ALERTS AND REQUIRED ACTIONS ── */}
        <div className="jo-detail-section">
          <div className="jo-section-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={14} color="var(--accent)" />
              <span>Operational Alerts & Event Stream</span>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
              Recent events ({j.events?.length || 0})
            </span>
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Disruption Alert if Active */}
            {isDisrupted && (
              <div style={{ padding: '10px 14px', background: 'rgba(255, 184, 77, 0.08)', border: '1px solid rgba(255, 184, 77, 0.3)', borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--warn)', fontWeight: 600, fontSize: 12.5 }}>
                  <AlertTriangle size={15} /> Active Disruption Flagged on Corridor
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-main)', marginTop: 4 }}>
                  Convoy transit is paused or impeded. Review tactical detour or clear disruption to resume active transit.
                </div>
                {detourResult && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--panel-raised)', borderRadius: 4, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>Alternative Detour Corridor Ready:</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      New Path: {detourResult.updated?.selected_route?.path?.join(' → ')} ({detourResult.updated?.selected_route?.distance_km} km)
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recent Events (Last 4) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(j.events || []).length === 0 ? (
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                  No operational events recorded yet.
                </div>
              ) : (
                [...j.events].slice(-4).reverse().map((ev, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: 'var(--panel-raised)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      fontSize: 11.5
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`pill ${ev.event_type || 'ACTIVE'}`} style={{ fontSize: 8.5, padding: '1px 5px' }}>
                        {ev.event_type || 'EVENT'}
                      </span>
                      <span style={{ color: 'var(--text-main)' }}>{ev.message}</span>
                    </div>
                    <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: 'var(--text-muted)' }}>
                      {ev.created_at ? ev.created_at.slice(0, 16).replace('T', ' ') : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── MODALS ── */}
        {/* Record Checkpoint Modal */}
        {checkpointModal.open && (
          <div
            className="jo-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget && !actionBusy) handleCloseCheckpoint();
            }}
          >
            <div
              className="jo-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="checkpoint-modal-title"
            >
              <div className="jo-modal-header">
                <div className="jo-modal-header-title">
                  <CheckSquare size={16} color="var(--accent)" />
                  <span id="checkpoint-modal-title">Record Checkpoint Event</span>
                </div>
                <button
                  type="button"
                  className="jo-modal-close-btn"
                  onClick={handleCloseCheckpoint}
                  aria-label="Close modal"
                  disabled={actionBusy}
                >
                  <X size={15} />
                </button>
              </div>

              <div className="jo-modal-body">
                <div className="jo-modal-field">
                  <label htmlFor="checkpoint-select" className="jo-modal-label">
                    Select Checkpoint Node
                  </label>
                  <select
                    id="checkpoint-select"
                    ref={firstInputRef}
                    className="select input"
                    value={checkpointModal.checkpoint}
                    onChange={(e) => setCheckpointModal({ ...checkpointModal, checkpoint: e.target.value })}
                    disabled={actionBusy}
                  >
                    {journeyWaypoints.map((w, idx) => (
                      <option key={idx} value={w.id}>
                        {w.isOrigin ? 'Origin: ' : (w.isDest ? 'Destination: ' : 'Checkpoint: ')} {w.name} [{w.id}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="jo-modal-field">
                  <label htmlFor="checkpoint-message-input" className="jo-modal-label">
                    Operational Log Note
                  </label>
                  <input
                    id="checkpoint-message-input"
                    type="text"
                    className="input"
                    placeholder="e.g. Convoy reached and cleared checkpoint safely on schedule."
                    value={checkpointModal.message}
                    onChange={(e) => setCheckpointModal({ ...checkpointModal, message: e.target.value })}
                    disabled={actionBusy}
                  />
                </div>
              </div>

              <div className="jo-modal-footer">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleCloseCheckpoint}
                  disabled={actionBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={actionBusy}
                  onClick={handleSubmitCheckpoint}
                >
                  {actionBusy ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <RefreshCw size={13} className="spin" /> Recording…
                    </span>
                  ) : (
                    'Record Event'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Log Disruption Modal */}
        {disruptionModal.open && (
          <div
            className="jo-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget && !actionBusy) handleCloseDisruption();
            }}
          >
            <div
              className="jo-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="disruption-modal-title"
            >
              <div className="jo-modal-header">
                <div className="jo-modal-header-title">
                  <AlertTriangle size={16} color="var(--warn)" />
                  <span id="disruption-modal-title">Report Corridor Disruption</span>
                </div>
                <button
                  type="button"
                  className="jo-modal-close-btn"
                  onClick={handleCloseDisruption}
                  aria-label="Close modal"
                  disabled={actionBusy}
                >
                  <X size={15} />
                </button>
              </div>

              <div className="jo-modal-body">
                <div className="jo-modal-field">
                  <label htmlFor="disruption-type-select" className="jo-modal-label">
                    Disruption Classification
                  </label>
                  <select
                    id="disruption-type-select"
                    ref={firstInputRef}
                    className="select input"
                    value={disruptionModal.type}
                    onChange={(e) => setDisruptionModal({ ...disruptionModal, type: e.target.value })}
                    disabled={actionBusy}
                  >
                    <option value="ROAD_CLOSED">Road Blockage / Landslide</option>
                    <option value="BRIDGE_RESTRICTION">Bridge Restriction / Weight Cap</option>
                    <option value="WEATHER_RESTRICTION">Severe Weather / Flooding</option>
                    <option value="SECURITY_HOLD">Tactical Security Alert</option>
                    <option value="CIVIL_CONGESTION">Civilian Traffic Congestion</option>
                  </select>
                </div>

                <div className="jo-modal-field">
                  <label htmlFor="disruption-details-input" className="jo-modal-label">
                    <span>Disruption Details</span>
                    <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Required</span>
                  </label>
                  <textarea
                    id="disruption-details-input"
                    className="input"
                    rows={3}
                    placeholder="Describe the tactical disruption, location milepost, or corridor obstruction..."
                    value={disruptionModal.message}
                    onChange={(e) => setDisruptionModal({ ...disruptionModal, message: e.target.value, validationError: '' })}
                    disabled={actionBusy}
                    style={{ resize: 'vertical', minHeight: 76 }}
                  />
                  {disruptionModal.validationError && (
                    <div style={{ fontSize: 11, color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <AlertCircle size={12} /> {disruptionModal.validationError}
                    </div>
                  )}
                </div>
              </div>

              <div className="jo-modal-footer">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleCloseDisruption}
                  disabled={actionBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary jo-modal-submit-disruption"
                  style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)', color: '#FFFFFF', fontWeight: 600 }}
                  disabled={actionBusy}
                  onClick={handleSubmitDisruption}
                >
                  {actionBusy ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <RefreshCw size={13} className="spin" /> Logging…
                    </span>
                  ) : (
                    'Log Disruption'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Departure Fuel Override Modal */}
        {overrideModal.open && (
          <div
            className="jo-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget && !actionBusy) handleCloseOverride();
            }}
          >
            <div
              className="jo-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="override-modal-title"
            >
              <div className="jo-modal-header">
                <div className="jo-modal-header-title">
                  <Fuel size={16} color="var(--accent)" />
                  <span id="override-modal-title">Authorize Departure Fuel Override</span>
                </div>
                <button
                  type="button"
                  className="jo-modal-close-btn"
                  onClick={handleCloseOverride}
                  aria-label="Close modal"
                  disabled={actionBusy}
                >
                  <X size={15} />
                </button>
              </div>

              <div className="jo-modal-body">
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  Departure is gated due to unverified departure dips or theoretical range deficit. As Coordinator, provide an authoritative operational reason to override safety gate and dispatch convoy.
                </div>
                <div className="jo-modal-field">
                  <label htmlFor="override-reason-input" className="jo-modal-label">
                    <span>Operational Authorization Reason</span>
                    <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Required</span>
                  </label>
                  <textarea
                    id="override-reason-input"
                    ref={firstInputRef}
                    className="input"
                    rows={3}
                    placeholder="e.g. Physical dips verified 100% full at depot dispatch by Sgt. Singh..."
                    value={overrideModal.reason}
                    onChange={(e) => setOverrideModal({ ...overrideModal, reason: e.target.value, validationError: '' })}
                    disabled={actionBusy}
                    style={{ resize: 'vertical', minHeight: 76 }}
                  />
                  {overrideModal.validationError && (
                    <div style={{ fontSize: 11, color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <AlertCircle size={12} /> {overrideModal.validationError}
                    </div>
                  )}
                </div>
              </div>

              <div className="jo-modal-footer">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleCloseOverride}
                  disabled={actionBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={actionBusy}
                  onClick={() => {
                    if (!overrideModal.reason.trim()) {
                      setOverrideModal((prev) => ({ ...prev, validationError: 'An authorization reason is required.' }));
                      firstInputRef.current?.focus();
                      return;
                    }
                    handleTransitionStatus('ACTIVE', `Departed under authorized override: ${overrideModal.reason.trim()}`, overrideModal.reason.trim());
                  }}
                >
                  {actionBusy ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <RefreshCw size={13} className="spin" /> Authorizing…
                    </span>
                  ) : (
                    'Authorize & Start Journey'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmModal.open && (
          <div
            className="jo-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget && !actionBusy) handleCloseConfirm();
            }}
          >
            <div
              className="jo-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-modal-title"
            >
              <div className="jo-modal-header">
                <span id="confirm-modal-title">{confirmModal.title}</span>
                <button
                  type="button"
                  className="jo-modal-close-btn"
                  onClick={handleCloseConfirm}
                  aria-label="Close modal"
                  disabled={actionBusy}
                >
                  <X size={15} />
                </button>
              </div>

              <div className="jo-modal-body">
                <div style={{ fontSize: 12.5, color: 'var(--text-main)', lineHeight: 1.5 }}>
                  {confirmModal.message}
                </div>
              </div>

              <div className="jo-modal-footer">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleCloseConfirm}
                  disabled={actionBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  ref={firstInputRef}
                  className={confirmModal.isDestructive ? 'btn danger' : 'btn primary'}
                  disabled={actionBusy}
                  onClick={() => {
                    const act = confirmModal.action;
                    handleCloseConfirm();
                    if (typeof act === 'function') act();
                  }}
                >
                  Confirm Action
                </button>
              </div>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW: SIMPLIFIED MAIN SCREEN (DIRECTORY & TRIAGE)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Shell
      title="Journey Operations"
      eyebrow="OPERATIONAL MISSION CONTROL"
      description="Monitor journeys and manage operational updates."
      actions={
        canCreate && (
          <button
            type="button"
            className="btn primary small"
            onClick={() => setPage('Journey Planning')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> Create Journey
          </button>
        )
      }
    >
      {/* ── B. SIMPLE STATUS SUMMARY (3 COMPACT INDICATORS) ── */}
      <div className="jo-summary-grid">
        <div
          className={`jo-summary-card ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'ACTIVE' ? 'ALL_ACTIVE_UPCOMING' : 'ACTIVE')}
          title="Filter active journeys"
        >
          <div>
            <div className="jo-summary-label">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)' }} />
              Active
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Journeys in progress</div>
          </div>
          <div className="jo-summary-count active">{statusSummary.active}</div>
        </div>

        <div
          className={`jo-summary-card ${statusFilter === 'UPCOMING' ? 'active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'UPCOMING' ? 'ALL_ACTIVE_UPCOMING' : 'UPCOMING')}
          title="Filter upcoming scheduled journeys"
        >
          <div>
            <div className="jo-summary-label">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
              Upcoming
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Scheduled departures</div>
          </div>
          <div className="jo-summary-count upcoming">{statusSummary.upcoming}</div>
        </div>

        <div
          className={`jo-summary-card ${statusFilter === 'ATTENTION' ? 'active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'ATTENTION' ? 'ALL_ACTIVE_UPCOMING' : 'ATTENTION')}
          title="Filter journeys needing attention"
        >
          <div>
            <div className="jo-summary-label">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)' }} />
              Needs Attention
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Disrupted or overdue</div>
          </div>
          <div className="jo-summary-count attention">{statusSummary.attention}</div>
        </div>
      </div>

      {/* ── E. SEARCH AND FILTERING ── */}
      <div className="jo-filter-bar">
        <div className="jo-search-wrap">
          <Search size={14} color="var(--text-muted)" />
          <input
            type="text"
            className="jo-search-input"
            placeholder="Search by Journey ID, Origin, Destination…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
              onClick={() => setSearchQuery('')}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="jo-filter-pills">
          <button
            type="button"
            className={`jo-filter-btn ${statusFilter === 'ALL_ACTIVE_UPCOMING' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL_ACTIVE_UPCOMING')}
          >
            Active & Upcoming
          </button>
          <button
            type="button"
            className={`jo-filter-btn ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ACTIVE')}
          >
            Active
          </button>
          <button
            type="button"
            className={`jo-filter-btn ${statusFilter === 'UPCOMING' ? 'active' : ''}`}
            onClick={() => setStatusFilter('UPCOMING')}
          >
            Upcoming
          </button>
          <button
            type="button"
            className={`jo-filter-btn ${statusFilter === 'ATTENTION' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ATTENTION')}
          >
            Needs Attention
          </button>
          <button
            type="button"
            className={`jo-filter-btn ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('COMPLETED')}
          >
            Completed
          </button>
          <button
            type="button"
            className={`jo-filter-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            All Journeys
          </button>
        </div>
      </div>

      {/* ── C. JOURNEY LIST (MAIN FOCUS) ── */}
      {loadingList ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ color: 'var(--accent)', marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>Loading operational journeys…</div>
        </div>
      ) : listError ? (
        <div className="alert alert-danger">
          <b>Error:</b> {listError}
        </div>
      ) : displayJourneys.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Radio size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>
            No Journeys Found
          </div>
          <div style={{ fontSize: 12, maxWidth: 360, margin: '0 auto 16px' }}>
            {searchQuery
              ? `No journeys match query "${searchQuery}".`
              : 'There are no journeys in this status category.'}
          </div>
          {canCreate && (
            <button type="button" className="btn primary small" onClick={() => setPage('Journey Planning')}>
              + Plan New Journey
            </button>
          )}
        </div>
      ) : (
        <div className="jo-table-card">
          {/* Desktop Table View */}
          <table className="jo-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Journey ID</th>
                <th style={{ width: '32%' }}>Route</th>
                <th style={{ width: '22%' }}>Departure</th>
                <th style={{ width: '12%' }}>Status</th>
                <th style={{ width: '12%', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayJourneys.map((j) => {
                const jStatus = (j.status || '').toUpperCase();
                const orig = j.origin_name || j.origin_id || '—';
                const dest = j.dest_name || j.dest_id || '—';
                const dep = j.departure_date ? `${j.departure_date} ${j.departure_time ? `@ ${j.departure_time}` : ''}` : 'Unscheduled';

                return (
                  <tr
                    key={j.journey_id}
                    className={selectedJourney?.journey_id === j.journey_id ? 'selected-row' : ''}
                    onClick={() => handleSelectJourney(j.journey_id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontWeight: 700, color: 'var(--text-main)' }}>
                        {j.journey_id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        {orig} <span style={{ color: 'var(--accent)' }}>→</span> {dest}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11.5, color: 'var(--text-main)' }}>
                        {dep}
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${jStatus}`} style={{ fontSize: 9.5, padding: '2px 7px' }}>
                        {jStatus}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn small"
                        style={{ padding: '4px 10px', fontSize: 11 }}
                        onClick={() => handleSelectJourney(j.journey_id)}
                      >
                        {jStatus === 'SCHEDULED' && canCoordinate
                          ? 'Start Journey'
                          : (jStatus === 'ACTIVE' && canRecordCheckpoint
                            ? 'Record Checkpoint'
                            : (jStatus === 'DISRUPTED' && canCoordinate
                              ? 'Resolve / Review'
                              : 'Open Journey →'))}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile Card List View */}
          <div className="jo-card-list" style={{ padding: 12 }}>
            {displayJourneys.map((j) => {
              const jStatus = (j.status || '').toUpperCase();
              const orig = j.origin_name || j.origin_id || '—';
              const dest = j.dest_name || j.dest_id || '—';
              const dep = j.departure_date ? `${j.departure_date} ${j.departure_time ? `@ ${j.departure_time}` : ''}` : 'Unscheduled';

              return (
                <div
                  key={j.journey_id}
                  className={`jo-card-item ${selectedJourney?.journey_id === j.journey_id ? 'selected' : ''}`}
                >
                  <div className="jo-card-header">
                    <span style={{ fontFamily: "'Share Tech Mono', monospace", fontWeight: 700, fontSize: 13, color: 'var(--text-main)' }}>
                      {j.journey_id}
                    </span>
                    <span className={`pill ${jStatus}`} style={{ fontSize: 9.5 }}>
                      {jStatus}
                    </span>
                  </div>

                  <div className="jo-card-body">
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      {orig} → {dest}
                    </div>
                    <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>
                      Departure: {dep}
                    </div>
                  </div>

                  <div className="jo-card-footer">
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Tap to manage</span>
                    <button
                      type="button"
                      className="btn primary small"
                      onClick={() => handleSelectJourney(j.journey_id)}
                    >
                      Open Journey →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Shell>
  );
}
