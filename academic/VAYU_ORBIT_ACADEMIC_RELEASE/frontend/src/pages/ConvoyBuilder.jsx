import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import StepProgress from '../components/planning/StepProgress';
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Star,
  Search,
  CheckCircle2,
  AlertTriangle,
  Users,
  Package,
  Truck,
  Shield,
  Info
} from 'lucide-react';

const CATEGORIES = [
  { id: 'ALL', label: 'All Classes' },
  { id: 'LTV', label: 'LTV (Light Tactical)' },
  { id: 'MSV', label: 'MSV (Medium)' },
  { id: 'HSV', label: 'HSV (Heavy)' },
  { id: 'ACV', label: 'ACV (Combat)' },
  { id: 'HET', label: 'HET (Transporters)' },
  { id: 'VIP', label: 'VIP Capable' },
];

const ROLES = [
  { id: 'ALL', label: 'All Roles' },
  { id: 'PASSENGER', label: 'Passenger-Only' },
  { id: 'CARGO', label: 'Cargo-Only' },
  { id: 'DUAL', label: 'Dual-Purpose' },
  { id: 'SPECIALIST', label: 'Specialist' },
];

function Convoy({ setPage, mission, setMission }) {
  const [vehicles, setVehicles] = useState([]);
  const [fleetUnits, setFleetUnits] = useState([]);
  const [selected, setSelected] = useState(Array.isArray(mission?.convoy) ? mission.convoy : []);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Search & Filtering state
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [dragPosition, setDragPosition] = useState(null); // 'above' or 'below'

  // Load models and physical fleet units
  useEffect(() => {
    Promise.all([
      api.vehicles().catch(() => []),
      api.fleetUnits().catch(() => [])
    ]).then(([vehs, units]) => {
      setVehicles(vehs || []);
      setFleetUnits(units || []);
    });
  }, []);

  // Sync initial mission convoy if loaded from draft/previous step
  useEffect(() => {
    if (Array.isArray(mission?.convoy) && mission.convoy.length > 0 && selected.length === 0) {
      setSelected(mission.convoy);
    }
  }, [mission?.convoy]);

  // Continuously synchronize convoy changes to parent mission draft
  useEffect(() => {
    if (typeof setMission !== 'function') return;

    let totalWeight = 0;
    let totalOccupants = 0;
    let totalCargo = 0;
    let slowestSpeed = Infinity;
    let heaviestVehicle = 0;

    selected.forEach(v => {
      const pass = Number(v.passengers) || 0;
      const cargo = Number(v.payload) || 0;
      const tare = Number(v.gvw_tons) || 0;
      const gross = tare + cargo;
      const spd = Number(v.max_speed_kmh) || 60;

      totalWeight += gross;
      totalOccupants += pass;
      totalCargo += cargo;
      if (spd < slowestSpeed) slowestSpeed = spd;
      if (gross > heaviestVehicle) heaviestVehicle = gross;
    });

    const sequencedConvoy = selected.map((v, idx) => ({
      ...v,
      convoy_order: idx + 1,
      convoy_role: idx === 0 ? 'LEAD' : (idx === selected.length - 1 && selected.length > 1 ? 'TRAIL' : 'INTERMEDIATE')
    }));

    setMission(prev => {
      const prevConvoy = Array.isArray(prev?.convoy) ? prev.convoy : [];
      if (
        prevConvoy.length === sequencedConvoy.length &&
        prevConvoy.every((item, i) => item.vehicle_id === sequencedConvoy[i].vehicle_id &&
          item.unit_id === sequencedConvoy[i].unit_id &&
          item.payload === sequencedConvoy[i].payload &&
          item.passengers === sequencedConvoy[i].passengers)
      ) {
        return prev;
      }
      return {
        ...(prev || {}),
        convoy: sequencedConvoy,
        max_vehicle_tons: heaviestVehicle,
        convoy_speed_kmh: slowestSpeed !== Infinity ? slowestSpeed : 60,
        total_convoy_weight: totalWeight,
        total_convoy_occupants: totalOccupants,
        total_convoy_cargo: totalCargo
      };
    });
  }, [selected, setMission]);

  // Models count & physical fleet units count
  const totalModelsCount = vehicles.length;
  const totalUnitsCount = fleetUnits.length;

  // Filtered vehicles catalogue
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      // Status check
      if (v.status === 'RETIRED') return false;

      // Category filter
      if (categoryFilter === 'VIP') {
        if (!v.is_vip) return false;
      } else if (categoryFilter !== 'ALL') {
        if (v.class_type !== categoryFilter) return false;
      }

      // Role filter
      if (roleFilter !== 'ALL') {
        if (v.role_category !== roleFilter) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          (v.model_name && v.model_name.toLowerCase().includes(q)) ||
          (v.maker && v.maker.toLowerCase().includes(q)) ||
          (v.vehicle_id && v.vehicle_id.toLowerCase().includes(q)) ||
          (v.class_type && v.class_type.toLowerCase().includes(q)) ||
          (v.routing_footprint && v.routing_footprint.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [vehicles, categoryFilter, roleFilter, searchTerm]);

  // Physical units mapped by model_id
  const unitsByModel = useMemo(() => {
    const map = {};
    fleetUnits.forEach(u => {
      if (!map[u.model_id]) map[u.model_id] = [];
      map[u.model_id].push(u);
    });
    return map;
  }, [fleetUnits]);

  // Add vehicle to manifest
  const addVehicle = (v) => {
    const availableModelUnits = unitsByModel[v.vehicle_id] || [];
    // Find first unused unit if any
    const usedUnitIds = new Set(selected.map(s => s.unit_id).filter(Boolean));
    const firstFreeUnit = availableModelUnits.find(u => !usedUnitIds.has(u.unit_id) && u.status === 'AVAILABLE');

    // Default initial allocation based on role
    const defaultPassengers = v.role_category === 'CARGO' ? 0 : (v.rated_passenger_capacity ? Math.min(2, v.rated_passenger_capacity) : 2);
    const defaultPayload = v.role_category === 'PASSENGER' ? 0 : 0;

    setSelected(s => [
      ...s,
      {
        ...v,
        uid: crypto.randomUUID(),
        unit_id: firstFreeUnit ? firstFreeUnit.unit_id : null,
        unit_callsign: firstFreeUnit ? firstFreeUnit.callsign : null,
        passengers: defaultPassengers,
        payload: defaultPayload,
      }
    ]);
  };

  // Reordering helpers (HTML5 native Drag and Drop)
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'above' : 'below';

    setDragOverIndex(index);
    setDragPosition(pos);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
    setDragPosition(null);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      setDragPosition(null);
      return;
    }

    const reordered = [...selected];
    const [movedItem] = reordered.splice(draggedIndex, 1);

    // Calculate insertion index
    let insertIndex = targetIndex;
    if (dragPosition === 'below') {
      insertIndex = draggedIndex < targetIndex ? targetIndex : targetIndex + 1;
    } else {
      insertIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    }

    if (insertIndex < 0) insertIndex = 0;
    if (insertIndex > reordered.length) insertIndex = reordered.length;

    reordered.splice(insertIndex, 0, movedItem);

    setSelected(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDragPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDragPosition(null);
  };

  // Accessible Move Up / Move Down buttons
  const moveUp = (index) => {
    if (index <= 0) return;
    setSelected(s => {
      const next = [...s];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const moveDown = (index) => {
    if (index >= selected.length - 1) return;
    setSelected(s => {
      const next = [...s];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const removeVehicle = (uid) => {
    setSelected(s => s.filter(v => v.uid !== uid));
  };

  const updateAllocation = (uid, field, val) => {
    setSelected(s =>
      s.map(v => {
        if (v.uid !== uid) return v;
        return { ...v, [field]: val };
      })
    );
  };

  const selectPhysicalUnit = (uid, unitId) => {
    const unitObj = fleetUnits.find(u => u.unit_id === unitId);
    setSelected(s =>
      s.map(v => {
        if (v.uid !== uid) return v;
        return {
          ...v,
          unit_id: unitId || null,
          unit_callsign: unitObj ? unitObj.callsign : null
        };
      })
    );
  };

  // Live Convoy Tactical Aggregations
  const totalWeight = selected.reduce((sum, v) => sum + Number(v.gvw_tons || 0) + Number(v.payload || 0), 0);
  const heaviestVehicle = selected.length > 0 ? Math.max(...selected.map(v => Number(v.gvw_tons || 0))) : 0;
  const slowestSpeed = selected.length > 0 ? Math.min(...selected.map(v => Number(v.max_speed_kmh || 0))) : 0;
  const totalOccupants = selected.reduce((sum, v) => sum + Number(v.passengers || 0), 0);
  const totalCargo = selected.reduce((sum, v) => sum + Number(v.payload || 0), 0);

  // Validate Convoy and Continue
  const validateAndContinue = async () => {
    setMsg('');
    if (!selected || selected.length === 0) {
      setMsg('Convoy manifest cannot be empty. Select at least one vehicle.');
      return;
    }

    // Check for duplicate physical units
    const physicalUnits = selected.map(v => v.unit_id).filter(Boolean);
    const uniqueUnits = new Set(physicalUnits);
    if (uniqueUnits.size !== physicalUnits.length) {
      setMsg('Duplicate physical fleet unit detected. Each physical vehicle unit can only be assigned once.');
      return;
    }

    // Validate each vehicle allocation
    for (let i = 0; i < selected.length; i++) {
      const v = selected[i];
      const pos = i + 1;
      const gvw = Number(v.gvw_tons);
      const spd = Number(v.max_speed_kmh);
      const pass = Number(v.passengers ?? 0);
      const cargo = Number(v.payload ?? 0);

      if (isNaN(gvw) || gvw <= 0) {
        setMsg(`Position #${pos} (${v.model_name}): Invalid vehicle GVW.`);
        return;
      }
      if (isNaN(spd) || spd <= 0) {
        setMsg(`Position #${pos} (${v.model_name}): Invalid speed rating.`);
        return;
      }
      if (isNaN(pass) || pass < 0) {
        setMsg(`Position #${pos} (${v.model_name}): Occupants count cannot be negative.`);
        return;
      }
      if (isNaN(cargo) || cargo < 0) {
        setMsg(`Position #${pos} (${v.model_name}): Cargo payload cannot be negative.`);
        return;
      }

      if (v.role_category === 'PASSENGER' && cargo > 0) {
        setMsg(`Position #${pos} (${v.model_name}) is PASSENGER-ONLY and cannot be allocated freight cargo.`);
        return;
      }
      if (v.role_category === 'CARGO' && pass > 0) {
        setMsg(`Position #${pos} (${v.model_name}) is CARGO-ONLY and cannot be allocated extra passengers.`);
        return;
      }

      if (v.passenger_capacity_verified && v.rated_passenger_capacity && pass > Number(v.rated_passenger_capacity)) {
        setMsg(`Position #${pos} (${v.model_name}) exceeds verified passenger limit of ${v.rated_passenger_capacity} (allocated: ${pass}).`);
        return;
      }
      if (v.payload_capacity_verified && v.rated_payload_tons && cargo > Number(v.rated_payload_tons)) {
        setMsg(`Position #${pos} (${v.model_name}) exceeds verified payload limit of ${v.rated_payload_tons} t (allocated: ${cargo} t).`);
        return;
      }
    }

    const maxVehicleTons = heaviestVehicle;
    const minSpeedKmh = slowestSpeed;

    setLoading(true);
    try {
      const r = await api.route({
        origin_id: mission.origin,
        dest_id: mission.dest,
        convoy_speed_kmh: minSpeedKmh,
        max_vehicle_tons: maxVehicleTons,
      });

      if (r.status === 'ROUTE_UNAVAILABLE' || !r.routes || r.routes.length === 0) {
        setMsg(r.message || 'No feasible route exists for this convoy configuration.');
        return;
      }

      // Format convoy with sequence numbers
      const sequencedConvoy = selected.map((v, idx) => ({
        ...v,
        convoy_order: idx + 1,
        convoy_role: idx === 0 ? 'LEAD' : (idx === selected.length - 1 && selected.length > 1 ? 'TRAIL' : 'INTERMEDIATE')
      }));

      setMission({
        ...mission,
        convoy: sequencedConvoy,
        max_vehicle_tons: maxVehicleTons,
        convoy_speed_kmh: minSpeedKmh,
        total_convoy_weight: totalWeight,
        total_convoy_occupants: totalOccupants,
        total_convoy_cargo: totalCargo,
        route: r.selected_route,
        routes: r.routes
      });

      setPage('Route Assessment');
    } catch (err) {
      setMsg(err.message || 'Route assessment failed for selected convoy.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToPreview = async () => {
    if (selected.length === 0) {
      setMsg('Convoy manifest cannot be empty. Please select at least one vehicle.');
      return;
    }

    setMsg('');

    let totalWeight = 0;
    let totalOccupants = 0;
    let totalCargo = 0;
    let slowestSpeed = Infinity;
    let heaviestVehicle = 0;

    const usedUnits = new Set();
    for (let i = 0; i < selected.length; i++) {
      const v = selected[i];
      const pos = i + 1;

      if (v.unit_id) {
        if (usedUnits.has(v.unit_id)) {
          setMsg(`Duplicate physical unit assigned at Position #${pos} (${v.unit_id}).`);
          return;
        }
        usedUnits.add(v.unit_id);
      }

      const pass = Number(v.passengers);
      const cargo = Number(v.payload);
      const tare = Number(v.gvw_tons) || 0;
      const gross = tare + (isNaN(cargo) ? 0 : cargo);
      const spd = Number(v.max_speed_kmh) || 60;

      totalWeight += gross;
      totalOccupants += isNaN(pass) ? 0 : pass;
      totalCargo += isNaN(cargo) ? 0 : cargo;
      if (spd < slowestSpeed) slowestSpeed = spd;
      if (gross > heaviestVehicle) heaviestVehicle = gross;

      if (isNaN(pass) || pass < 0 || !Number.isInteger(pass)) {
        setMsg(`Position #${pos} (${v.model_name}): Occupants count must be a non-negative integer.`);
        return;
      }
      if (isNaN(cargo) || cargo < 0) {
        setMsg(`Position #${pos} (${v.model_name}): Cargo payload cannot be negative.`);
        return;
      }

      if (v.role_category === 'PASSENGER' && cargo > 0) {
        setMsg(`Position #${pos} (${v.model_name}) is PASSENGER-ONLY and cannot be allocated freight cargo.`);
        return;
      }
      if (v.role_category === 'CARGO' && pass > 0) {
        setMsg(`Position #${pos} (${v.model_name}) is CARGO-ONLY and cannot be allocated extra passengers.`);
        return;
      }

      if (v.passenger_capacity_verified && v.rated_passenger_capacity && pass > Number(v.rated_passenger_capacity)) {
        setMsg(`Position #${pos} (${v.model_name}) exceeds verified passenger limit of ${v.rated_passenger_capacity} (allocated: ${pass}).`);
        return;
      }
      if (v.payload_capacity_verified && v.rated_payload_tons && cargo > Number(v.rated_payload_tons)) {
        setMsg(`Position #${pos} (${v.model_name}) exceeds verified payload limit of ${v.rated_payload_tons} t (allocated: ${cargo} t).`);
        return;
      }
    }

    const maxVehicleTons = heaviestVehicle;
    const minSpeedKmh = slowestSpeed;

    const sequencedConvoy = selected.map((v, idx) => ({
      ...v,
      convoy_order: idx + 1,
      convoy_role: idx === 0 ? 'LEAD' : (idx === selected.length - 1 && selected.length > 1 ? 'TRAIL' : 'INTERMEDIATE')
    }));

    setLoading(true);
    try {
      let candidateRoute = mission?.route;
      let candidateRoutes = mission?.routes;

      if (!candidateRoute || !candidateRoute.path || candidateRoute.path.length < 2) {
        if (mission?.origin && mission?.dest) {
          const r = await api.route({
            origin_id: mission.origin,
            dest_id: mission.dest,
            convoy_speed_kmh: minSpeedKmh,
            max_vehicle_tons: maxVehicleTons,
          });
          if (r && r.selected_route) {
            candidateRoute = r.selected_route;
            candidateRoutes = r.routes || [candidateRoute];
          }
        }
      }

      setMission(prev => ({
        ...(prev || mission),
        convoy: sequencedConvoy,
        max_vehicle_tons: maxVehicleTons,
        convoy_speed_kmh: minSpeedKmh,
        total_convoy_weight: totalWeight,
        total_convoy_occupants: totalOccupants,
        total_convoy_cargo: totalCargo,
        route: candidateRoute,
        routes: candidateRoutes
      }));

      setPage('Final Journey Preview');
    } catch (err) {
      setMsg(err.message || 'Failed to prepare preview for selected convoy.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell
      title="Convoy Builder"
      eyebrow="STEP 2 OF 5 · CONVOY BUILDER"
      description="Configure convoy composition, assign physical units, and allocate payload."
    >
      <StepProgress current={2} total={5} />

      <div className="grid g2" style={{ alignItems: 'start' }}>
        {/* LEFT COLUMN: Visual Fleet Registry */}
        <div className="card" style={{ padding: '16px' }}>
          <div className="vayu-fleet-toolbar">
            <div className="between" style={{ marginBottom: 4 }}>
              <div>
                <h3 style={{ marginBottom: 2 }}>Fleet Registry</h3>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Catalog: <b style={{ color: 'var(--accent)' }}>{totalModelsCount}</b> models &nbsp;·&nbsp; <b style={{ color: 'var(--warn)' }}>{totalUnitsCount}</b> active units
                </div>
              </div>
              <span className="pill ok">STANDARDIZED</span>
            </div>

            {/* Search Input */}
            <div className="vayu-search-box">
              <Search size={14} className="vayu-search-icon" />
              <input
                type="text"
                className="input"
                placeholder="Search by model, class, or maker…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Category Filter Tabs */}
            <div className="vayu-cat-tabs">
              {CATEGORIES.map(c => (
                <button
                  key={c.id}
                  className={`vayu-cat-tab${categoryFilter === c.id ? ' active' : ''}`}
                  onClick={() => setCategoryFilter(c.id)}
                >
                  {c.id === 'VIP' && <Star size={11} color="var(--warn)" />}
                  {c.label}
                </button>
              ))}
            </div>

            {/* Role Filter Pills */}
            <div className="vayu-role-pills">
              {ROLES.map(r => (
                <button
                  key={r.id}
                  className={`vayu-role-pill${roleFilter === r.id ? ' active' : ''}`}
                  onClick={() => setRoleFilter(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Registry Cards List */}
          <div className="vayu-registry-scroll">
            {filteredVehicles.length === 0 ? (
              <div className="empty" style={{ padding: 40 }}>
                No vehicles match current search and filters.
              </div>
            ) : (
              <div className="vayu-card-grid">
                {filteredVehicles.map(v => {
                  const addedCount = selected.filter(s => s.vehicle_id === v.vehicle_id).length;
                  const modelUnits = unitsByModel[v.vehicle_id] || [];

                  return (
                    <div
                      key={v.vehicle_id}
                      className={`vayu-veh-card${addedCount > 0 ? ' in-convoy' : ''}`}
                    >
                      {/* Card Header */}
                      <div className="vayu-card-header">
                        <div className="vayu-card-badge-row">
                          <span className="vayu-class-tag">
                            {v.class_type} · {v.axle_config || 'STD'}
                          </span>
                          {v.is_vip === 1 && (
                            <span className="vayu-vip-chip">
                              <Star size={10} fill="var(--warn)" /> VIP ESCORT
                            </span>
                          )}
                        </div>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-subtle)' }}>
                          {v.vehicle_id}
                        </span>
                      </div>

                      {/* Schematic Graphic / Photo Frame */}
                      <div className="vayu-img-frame">
                        <img
                          src={v.image_url || '/vehicles/tata_safari_gs800.svg'}
                          alt={v.model_name}
                          onError={e => {
                            e.target.onerror = null;
                            e.target.src = '/vehicles/tata_safari_gs800.svg';
                          }}
                        />
                      </div>

                      {/* Card Body */}
                      <div className="vayu-card-body">
                        <div className="vayu-model-title">{v.model_name}</div>
                        <div className="vayu-maker-sub">{v.maker}</div>

                        {/* Specs Grid */}
                        <div className="vayu-specs-matrix">
                          <div className="vayu-spec-col">
                            <span className="vayu-spec-label">GVW</span>
                            <span className="vayu-spec-val" style={{ color: 'var(--warn)' }}>
                              {v.gvw_tons} t
                            </span>
                          </div>
                          <div className="vayu-spec-col">
                            <span className="vayu-spec-label">Speed</span>
                            <span className="vayu-spec-val" style={{ color: 'var(--ok)' }}>
                              {v.max_speed_kmh} <span style={{ fontSize: 9 }}>km/h</span>
                            </span>
                          </div>
                          <div className="vayu-spec-col">
                            <span className="vayu-spec-label">Range</span>
                            <span className="vayu-spec-val">
                              {v.operational_range_km} <span style={{ fontSize: 9 }}>km</span>
                            </span>
                          </div>
                        </div>

                        {/* Capacity & Role Verification */}
                        <div className="vayu-cap-row">
                          {/* Passengers */}
                          {(v.role_category === 'PASSENGER' || v.role_category === 'DUAL' || v.role_category === 'SPECIALIST') && (
                            <div className="vayu-cap-item">
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Users size={12} color="var(--accent)" />
                                {v.rated_passenger_capacity ? `${v.rated_passenger_capacity} Personnel` : 'Crew Only'}
                              </span>
                              {v.passenger_capacity_verified ? (
                                <span className="vayu-verified-pill" title={v.capacity_source_note}>
                                  <CheckCircle2 size={9} /> Verified
                                </span>
                              ) : (
                                <span className="vayu-unverified-pill" title={v.capacity_source_note}>
                                  <Info size={9} /> Estimated
                                </span>
                              )}
                            </div>
                          )}

                          {/* Cargo */}
                          {(v.role_category === 'CARGO' || v.role_category === 'DUAL') && (
                            <div className="vayu-cap-item">
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Package size={12} color="var(--warn)" />
                                {v.rated_payload_tons ? `${v.rated_payload_tons} t Payload` : 'Standard'}
                              </span>
                              {v.payload_capacity_verified ? (
                                <span className="vayu-verified-pill" title={v.capacity_source_note}>
                                  <CheckCircle2 size={9} /> Verified
                                </span>
                              ) : (
                                <span className="vayu-unverified-pill" title={v.capacity_source_note}>
                                  <Info size={9} /> Estimated
                                </span>
                              )}
                            </div>
                          )}

                          {/* Role Tag & Physical Units Info */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, marginTop: 2, color: 'var(--text-subtle)' }}>
                            <span style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                              ROLE: <b style={{ color: 'var(--text-main)' }}>{v.role_category}</b>
                            </span>
                            {modelUnits.length > 0 ? (
                              <span style={{ color: 'var(--warn)', fontFamily: "'Share Tech Mono', monospace" }}>
                                {modelUnits.length} Physical {modelUnits.length === 1 ? 'Unit' : 'Units'}
                              </span>
                            ) : (
                              <span style={{ fontFamily: "'Share Tech Mono', monospace" }}>Model Template</span>
                            )}
                          </div>
                        </div>

                        {/* Card Action */}
                        <div className="vayu-card-actions">
                          <button
                            className={`vayu-add-btn${addedCount > 0 ? ' added' : ''}`}
                            onClick={() => addVehicle(v)}
                          >
                            <Plus size={13} />
                            {addedCount > 0 ? `Add Another (${addedCount} in Convoy)` : 'Add to Convoy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Reorderable Convoy Composition */}
        <div className="card" style={{ padding: '16px' }}>
          <div className="between" style={{ marginBottom: 12 }}>
            <div>
              <h3 style={{ marginBottom: 2 }}>Convoy Manifest</h3>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Drag handle to reorder positions or use accessible buttons.
              </div>
            </div>
            <span className="mono" style={{ fontSize: 13, color: 'var(--warn)', fontWeight: 700 }}>
              {totalWeight.toFixed(1)} t total
            </span>
          </div>

          {/* Convoy Telemetry Banner */}
          {selected.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                marginBottom: 14,
                padding: '10px',
                background: 'var(--panel-alt)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)'
              }}
            >
              <div>
                <div className="kicker">Heaviest Axle</div>
                <div
                  style={{
                    fontFamily: "'Orbitron', monospace",
                    fontSize: 14,
                    fontWeight: 700,
                    color: heaviestVehicle > 40 ? 'var(--bad)' : 'var(--warn)'
                  }}
                >
                  {heaviestVehicle.toFixed(1)} t
                </div>
              </div>

              <div>
                <div className="kicker">Convoy Speed</div>
                <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: 'var(--ok)' }}>
                  {slowestSpeed} <span style={{ fontSize: 10 }}>km/h</span>
                </div>
              </div>

              <div>
                <div className="kicker">Personnel</div>
                <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                  {totalOccupants} <span style={{ fontSize: 10 }}>pax</span>
                </div>
              </div>

              <div>
                <div className="kicker">Cargo (t)</div>
                <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>
                  {totalCargo.toFixed(1)} t
                </div>
              </div>
            </div>
          )}

          {/* Manifest List */}
          {selected.length === 0 ? (
            <div className="empty" style={{ padding: 48 }}>
              No vehicles in convoy manifest.<br />
              <span style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 6, display: 'inline-block' }}>
                Select platforms from the Fleet Registry to form the operational convoy.
              </span>
            </div>
          ) : (
            <div className="vayu-manifest-list">
              {selected.map((v, idx) => {
                const pos = idx + 1;
                const isLead = idx === 0;
                const isTrail = idx === selected.length - 1 && selected.length > 1;

                const isDraggingThis = draggedIndex === idx;
                const isDragOverThis = dragOverIndex === idx;

                const availableUnits = unitsByModel[v.vehicle_id] || [];
                const assignedUnit = fleetUnits.find(u => u.unit_id === v.unit_id);

                // Inline limits check
                const passOverLimit = v.rated_passenger_capacity && Number(v.passengers) > Number(v.rated_passenger_capacity);
                const cargoOverLimit = v.rated_payload_tons && Number(v.payload) > Number(v.rated_payload_tons);

                return (
                  <div
                    key={v.uid}
                    className={`vayu-manifest-card${isDraggingThis ? ' dnd-dragging' : ''}${
                      isDragOverThis ? (dragPosition === 'above' ? ' dnd-over-above' : ' dnd-over-below') : ''
                    }`}
                    draggable
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                  >
                    {/* Header Row */}
                    <div className="vayu-manifest-top">
                      <div className="vayu-manifest-pos">
                        <span
                          className="vayu-drag-handle"
                          title="Click and drag to reorder convoy sequence"
                        >
                          <GripVertical size={16} />
                        </span>

                        <span className={`vayu-pos-tag${isLead ? ' lead' : isTrail ? ' trail' : ''}`}>
                          {isLead ? '#1 LEAD' : isTrail ? `#${pos} TRAIL` : `#${pos}`}
                        </span>

                        <span className="vayu-manifest-model">{v.model_name}</span>
                        {v.is_vip === 1 && (
                          <Star size={12} color="var(--warn)" fill="var(--warn)" title="VIP Platform" />
                        )}
                      </div>

                      {/* Accessible Reordering Buttons & Remove */}
                      <div className="vayu-manifest-controls">
                        <button
                          className="vayu-btn-icon"
                          disabled={idx === 0}
                          onClick={() => moveUp(idx)}
                          aria-label={`Move ${v.model_name} up to position ${idx}`}
                          title="Move Up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          className="vayu-btn-icon"
                          disabled={idx === selected.length - 1}
                          onClick={() => moveDown(idx)}
                          aria-label={`Move ${v.model_name} down to position ${idx + 2}`}
                          title="Move Down"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          className="vayu-btn-icon danger"
                          onClick={() => removeVehicle(v.uid)}
                          aria-label={`Remove ${v.model_name} from convoy`}
                          title="Remove Vehicle"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Metadata line */}
                    <div className="vayu-manifest-meta">
                      {v.vehicle_id} · GVW {v.gvw_tons} t · Max {v.max_speed_kmh} km/h · Range {v.operational_range_km} km
                      &nbsp;·&nbsp;
                      <span style={{ color: 'var(--text-main)' }}>{v.role_category}</span>
                    </div>

                    {/* Physical Unit Binding Picker (if units exist for model) */}
                    {availableUnits.length > 0 && (
                      <div className="vayu-physical-unit-picker">
                        <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontFamily: "'Share Tech Mono', monospace" }}>
                          Physical Unit Assignment:
                        </span>
                        <select
                          className="select-compact"
                          style={{
                            width: 'auto',
                            maxWidth: 240
                          }}
                          value={v.unit_id || ''}
                          onChange={e => selectPhysicalUnit(v.uid, e.target.value)}
                        >
                          <option value="">Generic Model Template</option>
                          {availableUnits.map(u => (
                            <option key={u.unit_id} value={u.unit_id}>
                              {u.callsign || u.unit_id} ({u.status})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Role-Aware Allocation Inputs */}
                    <div className="vayu-manifest-inputs">
                      {/* Passenger Input (Only for PASSENGER, DUAL, SPECIALIST) */}
                      {v.role_category !== 'CARGO' ? (
                        <div className="vayu-input-group">
                          <label className="vayu-input-label">
                            <span>Occupants</span>
                            {v.rated_passenger_capacity && (
                              <span style={{ color: v.passenger_capacity_verified ? 'var(--ok)' : 'var(--warn)' }}>
                                Rated: {v.rated_passenger_capacity}
                              </span>
                            )}
                          </label>
                          <input
                            type="number"
                            min="0"
                            className="vayu-number-input"
                            value={v.passengers ?? 0}
                            onChange={e => updateAllocation(v.uid, 'passengers', e.target.value)}
                          />
                          {passOverLimit && (
                            <div className="vayu-input-warning">
                              ⚠️ Exceeds {v.passenger_capacity_verified ? 'verified' : 'rated'} capacity ({v.rated_passenger_capacity})
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="vayu-input-group" style={{ opacity: 0.5 }}>
                          <label className="vayu-input-label">Occupants</label>
                          <div style={{ fontSize: 11, color: 'var(--text-subtle)', padding: '6px 0', fontFamily: "'Share Tech Mono', monospace" }}>
                            Cab Crew Only
                          </div>
                        </div>
                      )}

                      {/* Cargo Input (Only for CARGO, DUAL, SPECIALIST) */}
                      {v.role_category !== 'PASSENGER' ? (
                        <div className="vayu-input-group">
                          <label className="vayu-input-label">
                            <span>Cargo (Tonnes)</span>
                            {v.rated_payload_tons && (
                              <span style={{ color: v.payload_capacity_verified ? 'var(--ok)' : 'var(--warn)' }}>
                                Rated: {v.rated_payload_tons} t
                              </span>
                            )}
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            className="vayu-number-input"
                            value={v.payload ?? 0}
                            onChange={e => updateAllocation(v.uid, 'payload', e.target.value)}
                          />
                          {cargoOverLimit && (
                            <div className="vayu-input-warning">
                              ⚠️ Exceeds {v.payload_capacity_verified ? 'verified' : 'rated'} payload ({v.rated_payload_tons} t)
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="vayu-input-group" style={{ opacity: 0.5 }}>
                          <label className="vayu-input-label">Cargo (Tonnes)</label>
                          <div style={{ fontSize: 11, color: 'var(--text-subtle)', padding: '6px 0', fontFamily: "'Share Tech Mono', monospace" }}>
                            Passenger Only
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {msg && (
            <div className="alert" style={{ marginTop: 14 }}>
              <AlertTriangle size={14} style={{ marginRight: 6, flexShrink: 0 }} />
              {msg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              className="btn"
              style={{ flex: 1, padding: '10px 14px', fontSize: 13 }}
              disabled={loading || selected.length === 0}
              onClick={validateAndContinue}
              title="Assess Tactical Routes"
            >
              {loading ? 'Assessing Routes…' : 'Assess Tactical Routes →'}
            </button>
            <button
              className="btn primary"
              style={{ flex: 1, padding: '10px 14px', fontSize: 13 }}
              disabled={loading || selected.length === 0}
              onClick={handleGoToPreview}
              title="Go for Journey Preview"
              aria-label="Go for Journey Preview"
            >
              {loading ? 'Preparing Preview…' : 'Go for Journey Preview →'}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

export default Convoy;
