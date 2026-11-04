import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Compass, ChevronDown, ChevronUp, MapPin, Navigation, ArrowUp,
  ArrowUpLeft, ArrowUpRight, RotateCw, RotateCcw, CheckCircle2,
  Flag, Shield, Clock, Route, AlertCircle, RefreshCw, ChevronLeft,
  ChevronRight, ArrowRight, ArrowLeft
} from 'lucide-react';
import { formatDistance, formatDuration } from '../../services/navigationService';

/**
 * Returns an appropriate Lucide icon for a given maneuver type.
 */
function renderManeuverIcon(maneuver, size = 16) {
  const m = String(maneuver).toUpperCase();
  switch (m) {
    case 'DEPART':
      return <Flag size={size} color="var(--ok)" />;
    case 'ARRIVE':
      return <CheckCircle2 size={size} color="var(--ok)" />;
    case 'WAYPOINT':
      return <Shield size={size} color="var(--warn)" />;
    case 'TURN_LEFT':
      return <ArrowUpLeft size={size} color="var(--accent)" />;
    case 'BEAR_LEFT':
      return <ArrowUpLeft size={size} color="var(--accent)" style={{ opacity: 0.8 }} />;
    case 'TURN_RIGHT':
      return <ArrowUpRight size={size} color="var(--accent)" />;
    case 'BEAR_RIGHT':
      return <ArrowUpRight size={size} color="var(--accent)" style={{ opacity: 0.8 }} />;
    case 'ROUNDABOUT':
      return <RotateCw size={size} color="var(--warn)" />;
    case 'U_TURN':
      return <RotateCcw size={size} color="var(--warn)" />;
    case 'STRAIGHT':
    default:
      return <ArrowUp size={size} color="var(--text-muted)" />;
  }
}

/**
 * Clean, compact, Google Maps-style Turn-by-Turn Route Directions Panel.
 */
export default function RouteDirectionsPanel({
  originName = 'Origin',
  destName = 'Destination',
  totalDistanceKm = null,
  totalEtaHours = null,
  instructions = [],
  loading = false,
  source = '',
  selectedInstruction = null,
  onSelectInstruction = null,
  isRecalculated = false,
  routeType = 'PLANNED', // 'PLANNED' | 'RECALCULATED'
  onToggleRouteType = null,
  hasRecalculatedOption = false,
  initiallyExpanded = false,
  collapsible = true,
  maxHeight = 360
}) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [filterMode, setFilterMode] = useState('ALL'); // 'ALL' | 'CHECKPOINTS'
  const listContainerRef = useRef(null);
  const activeItemRef = useRef(null);

  // Auto-scroll list when selectedInstruction changes
  useEffect(() => {
    if (activeItemRef.current && isExpanded) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [selectedInstruction, isExpanded]);

  // Filter instructions if Checkpoints-only tab is active
  const filteredInstructions = useMemo(() => {
    if (!Array.isArray(instructions)) return [];
    if (filterMode === 'CHECKPOINTS') {
      return instructions.filter(
        (ins) => ins.isCheckpoint || ins.maneuver === 'DEPART' || ins.maneuver === 'ARRIVE'
      );
    }
    return instructions;
  }, [instructions, filterMode]);

  const checkpointCount = useMemo(() => {
    if (!Array.isArray(instructions)) return 0;
    return instructions.filter((ins) => ins.isCheckpoint).length;
  }, [instructions]);

  const totalSteps = instructions.length;

  // Handle step selection with keyboard / next-prev
  const handleNextStep = () => {
    if (!instructions.length || typeof onSelectInstruction !== 'function') return;
    const currentIdx = selectedInstruction
      ? instructions.findIndex((ins) => ins.id === selectedInstruction.id)
      : -1;
    const nextIdx = currentIdx + 1 < instructions.length ? currentIdx + 1 : 0;
    onSelectInstruction(instructions[nextIdx], nextIdx);
  };

  const handlePrevStep = () => {
    if (!instructions.length || typeof onSelectInstruction !== 'function') return;
    const currentIdx = selectedInstruction
      ? instructions.findIndex((ins) => ins.id === selectedInstruction.id)
      : instructions.length;
    const prevIdx = currentIdx - 1 >= 0 ? currentIdx - 1 : instructions.length - 1;
    onSelectInstruction(instructions[prevIdx], prevIdx);
  };

  const activeIndex = selectedInstruction
    ? instructions.findIndex((ins) => ins.id === selectedInstruction.id)
    : -1;

  return (
    <div className="vayu-directions-panel">
      {/* ── Summary & Header Bar ── */}
      <div className="vayu-directions-header">
        <div className="vayu-directions-header-left">
          <div className="vayu-directions-title-row">
            <Compass size={15} color="var(--accent)" />
            <span className="vayu-directions-title">Route Directions</span>
            {source && (
              <span className={`pill ${isRecalculated ? 'DISRUPTED' : 'ACTIVE'}`} style={{ fontSize: 9.5, padding: '1px 6px' }}>
                {isRecalculated ? 'Recalculated Detour' : (source.includes('ROAD') ? 'Road Network Verified' : 'Tactical Milestones')}
              </span>
            )}
          </div>

          <div className="vayu-directions-route-meta">
            <span className="vayu-directions-endpoints">
              {originName} <span style={{ color: 'var(--accent)' }}>→</span> {destName}
            </span>
            <span className="vayu-directions-metrics">
              {totalDistanceKm != null ? `${totalDistanceKm} km` : '—'}
              {totalEtaHours != null ? ` • ~${totalEtaHours} hrs` : ''}
              {totalSteps > 0 ? ` • ${totalSteps} step${totalSteps === 1 ? '' : 's'}` : ''}
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="vayu-directions-header-actions">
          {hasRecalculatedOption && typeof onToggleRouteType === 'function' && (
            <div className="vayu-route-switch" role="group" aria-label="Route version toggle">
              <button
                type="button"
                className={`vayu-route-switch-btn ${routeType === 'PLANNED' ? 'active' : ''}`}
                onClick={() => onToggleRouteType('PLANNED')}
              >
                Planned
              </button>
              <button
                type="button"
                className={`vayu-route-switch-btn ${routeType === 'RECALCULATED' ? 'active' : ''}`}
                onClick={() => onToggleRouteType('RECALCULATED')}
              >
                Detour
              </button>
            </div>
          )}

          {collapsible && (
            <button
              type="button"
              className="btn small vayu-directions-toggle-btn"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse turn-by-turn directions' : 'View turn-by-turn directions'}
            >
              <Navigation size={12} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              <span>{isExpanded ? 'Hide Directions' : `View Directions (${totalSteps})`}</span>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded Directions Content ── */}
      {(!collapsible || isExpanded) && (
        <div className="vayu-directions-body">
          {/* Controls sub-bar (Filter tabs + Step Prev/Next) */}
          <div className="vayu-directions-controls-bar">
            <div className="vayu-directions-tabs">
              <button
                type="button"
                className={`vayu-directions-tab ${filterMode === 'ALL' ? 'active' : ''}`}
                onClick={() => setFilterMode('ALL')}
              >
                All Steps ({totalSteps})
              </button>
              <button
                type="button"
                className={`vayu-directions-tab ${filterMode === 'CHECKPOINTS' ? 'active' : ''}`}
                onClick={() => setFilterMode('CHECKPOINTS')}
              >
                Checkpoints ({checkpointCount})
              </button>
            </div>

            {totalSteps > 0 && typeof onSelectInstruction === 'function' && (
              <div className="vayu-directions-step-nav">
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: "'Share Tech Mono', monospace" }}>
                  {activeIndex >= 0 ? `Step ${activeIndex + 1} of ${totalSteps}` : 'Select a step'}
                </span>
                <button
                  type="button"
                  className="btn small vayu-step-arrow-btn"
                  style={{ padding: '2px 6px' }}
                  onClick={handlePrevStep}
                  title="Previous Step (← arrow)"
                  aria-label="Previous navigation step"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  className="btn small vayu-step-arrow-btn"
                  style={{ padding: '2px 6px' }}
                  onClick={handleNextStep}
                  title="Next Step (→ arrow)"
                  aria-label="Next navigation step"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Instruction List State Handling */}
          {loading ? (
            <div className="vayu-directions-state">
              <RefreshCw size={20} className="spin" style={{ color: 'var(--accent)', marginBottom: 6 }} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Resolving road network navigation guidance…
              </div>
            </div>
          ) : totalSteps === 0 ? (
            <div className="vayu-directions-state">
              <AlertCircle size={22} style={{ opacity: 0.4, marginBottom: 6 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', marginBottom: 2 }}>
                Navigation Instructions Unavailable
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 360 }}>
                Turn-by-turn road guidance could not be generated for this tactical corridor path. Navigation adheres strictly to approved military waypoints.
              </div>
            </div>
          ) : (
            <div
              ref={listContainerRef}
              className="vayu-directions-list"
              style={{ maxHeight }}
              tabIndex={0}
              role="list"
              aria-label="Turn-by-turn navigation instructions"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  handleNextStep();
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  handlePrevStep();
                }
              }}
            >
              {filteredInstructions.map((ins, idx) => {
                const isSelected = selectedInstruction?.id === ins.id;
                const isCheckpoint = ins.isCheckpoint;
                const isDepart = ins.maneuver === 'DEPART';
                const isArrive = ins.maneuver === 'ARRIVE';

                return (
                  <div
                    key={ins.id ?? idx}
                    ref={isSelected ? activeItemRef : null}
                    className={`vayu-instruction-item ${isSelected ? 'active' : ''} ${isCheckpoint ? 'checkpoint-item' : ''}`}
                    onClick={() => onSelectInstruction?.(ins, idx)}
                    role="listitem"
                    aria-selected={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectInstruction?.(ins, idx);
                      }
                    }}
                  >
                    {/* Step Number & In-built Maneuver Badge Button */}
                    <div className="vayu-instruction-icon-col">
                      <button
                        type="button"
                        className={`vayu-instruction-badge ${isDepart || isArrive ? 'terminal' : (isCheckpoint ? 'checkpoint' : '')} ${isSelected ? 'active-badge' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectInstruction?.(ins, idx);
                        }}
                        title={`Focus Step #${ins.stepNumber || idx + 1} (${ins.maneuver || 'Maneuver'}) on map`}
                        aria-label={`Focus Step #${ins.stepNumber || idx + 1} on map`}
                      >
                        {renderManeuverIcon(ins.maneuver, 14)}
                      </button>
                      <span className="vayu-instruction-step-num">
                        {ins.stepNumber || idx + 1}
                      </span>
                    </div>

                    {/* Instruction Message & Road */}
                    <div className="vayu-instruction-content">
                      <div className="vayu-instruction-message">
                        {ins.message}
                      </div>

                      <div className="vayu-instruction-meta">
                        {ins.street ? (
                          <span className="vayu-instruction-street">
                            {ins.street}
                          </span>
                        ) : null}

                        {ins.checkpointName && !ins.street ? (
                          <span className="vayu-instruction-checkpoint-tag">
                            Tactical Checkpoint: {ins.checkpointName}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Distance & Travel Time */}
                    <div className="vayu-instruction-distance-col">
                      <span className="vayu-instruction-dist">
                        {ins.stepDistanceFormatted || formatDistance(ins.stepDistanceM)}
                      </span>
                      {ins.stepTimeSec > 0 && (
                        <span className="vayu-instruction-time">
                          {ins.stepTimeFormatted || formatDuration(ins.stepTimeSec)}
                        </span>
                      )}
                      {ins.routeOffsetM > 0 && (
                        <span className="vayu-instruction-offset">
                          at {formatDistance(ins.routeOffsetM)}
                        </span>
                      )}
                    </div>

                    {/* In-built Direction Arrow Button */}
                    <button
                      type="button"
                      className={`vayu-instruction-arrow-btn ${isSelected ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectInstruction?.(ins, idx);
                      }}
                      title={`Focus Step #${ins.stepNumber || idx + 1} on map`}
                      aria-label={`Focus Step #${ins.stepNumber || idx + 1} on map`}
                    >
                      <ArrowRight size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
