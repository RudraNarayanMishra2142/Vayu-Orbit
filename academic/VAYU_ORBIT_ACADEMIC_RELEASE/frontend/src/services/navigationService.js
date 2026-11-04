/**
 * VAYU ORBIT - Navigation & Turn-by-Turn Routing Service
 * Handles high-fidelity road-network guidance, maneuver instruction parsing,
 * tactical segment slicing, and military corridor milestone fallbacks.
 */

/**
 * Format distance in meters to a clean human-readable string.
 * e.g., 350 -> "350 m", 4200 -> "4.2 km"
 */
export function formatDistance(meters) {
  if (meters == null || isNaN(meters)) return '—';
  const m = Number(meters);
  if (m < 1000) {
    return `${Math.round(m)} m`;
  }
  return `${(m / 1000).toFixed(1)} km`;
}

/**
 * Format duration in seconds to a clean human-readable string.
 * e.g., 45 -> "< 1 min", 180 -> "3 min", 4500 -> "1h 15m"
 */
export function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return '—';
  const s = Number(seconds);
  if (s < 60) return '< 1 min';
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

/**
 * Determine a clean maneuver category and icon identifier.
 */
export function normalizeManeuverType(rawManeuver = '', rawType = '') {
  const m = String(rawManeuver).toUpperCase();
  const t = String(rawType).toUpperCase();

  if (m === 'DEPART' || t.includes('DEPARTURE')) return 'DEPART';
  if (m.includes('ARRIVE') || t.includes('ARRIVAL')) return 'ARRIVE';
  if (m.includes('WAYPOINT') || t.includes('WAYPOINT')) return 'WAYPOINT';
  if (m.includes('ROUNDABOUT')) return 'ROUNDABOUT';
  if (m.includes('U_TURN') || m.includes('UTURN')) return 'U_TURN';
  if (m.includes('SHARP_LEFT') || m.includes('TURN_LEFT')) return 'TURN_LEFT';
  if (m.includes('BEAR_LEFT') || m.includes('KEEP_LEFT')) return 'BEAR_LEFT';
  if (m.includes('SHARP_RIGHT') || m.includes('TURN_RIGHT')) return 'TURN_RIGHT';
  if (m.includes('BEAR_RIGHT') || m.includes('KEEP_RIGHT')) return 'BEAR_RIGHT';
  if (m === 'STRAIGHT' || m === 'CONTINUE') return 'STRAIGHT';

  return 'STRAIGHT';
}

/**
 * Build road-following route geometry and turn-by-turn guidance from TomTom Routing API
 * pinned through the approved military corridor waypoints.
 *
 * @param {Array<string>} path - Sequence of node IDs (e.g. ['PLC-CN-61', 'AF-08', 'FO-01'])
 * @param {Object} nodeDict - Mapping of node IDs to node records { lat, lon/lng, place_name, ... }
 * @param {string} apiKey - TomTom API Key
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Object|null>} Route geometry, distance, ETA, and ordered instructions
 */
export async function fetchRouteWithGuidance(path, nodeDict = {}, apiKey, signal = null) {
  if (!apiKey || !Array.isArray(path) || path.length < 2) {
    return null;
  }

  // Resolve nodes and coordinates
  const pts = path
    .map((id) => {
      const cleanId = (id || '').replace('PLC-', '');
      return nodeDict[cleanId] || nodeDict[id] || null;
    })
    .filter((n) => n && n.lat != null && (n.lon != null || n.lng != null));

  if (pts.length < 2) return null;

  // Build TomTom waypoint locations
  const locs = pts
    .map((p) => `${Number(p.lat)},${Number(p.lon != null ? p.lon : p.lng)}`)
    .join(':');

  const url = `https://api.tomtom.com/routing/1/calculateRoute/${locs}/json?key=${apiKey}&instructionsType=text&language=en-GB`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      // If multi-waypoint failed (e.g. MAP_MATCHING_FAILURE on a remote waypoint),
      // attempt origin-to-destination direct routing if > 2 points
      if (pts.length > 2) {
        const originPt = pts[0];
        const destPt = pts[pts.length - 1];
        const directLocs = `${Number(originPt.lat)},${Number(originPt.lon != null ? originPt.lon : originPt.lng)}:${Number(destPt.lat)},${Number(destPt.lon != null ? destPt.lon : destPt.lng)}`;
        const directUrl = `https://api.tomtom.com/routing/1/calculateRoute/${directLocs}/json?key=${apiKey}&instructionsType=text&language=en-GB`;
        const directRes = await fetch(directUrl, { signal });
        if (directRes.ok) {
          const directData = await directRes.json();
          return parseTomTomRouteData(directData, pts, 'ROAD_NETWORK_DIRECT');
        }
      }
      return null;
    }

    const data = await res.json();
    return parseTomTomRouteData(data, pts, 'ROAD_NETWORK_VERIFIED');
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('TomTom guidance resolution notice:', err);
    }
    return null;
  }
}

/**
 * Parse TomTom route data into normalized geometry, summary, and instructions.
 */
function parseTomTomRouteData(data, waypoints = [], source = 'ROAD_NETWORK_VERIFIED') {
  const r = data?.routes?.[0];
  if (!r || !r.legs) return null;

  // Flatten leg points into continuous [lon, lat] coordinate array
  const allCoords = [];
  r.legs.forEach((leg) => {
    if (leg.points) {
      leg.points.forEach((p) => {
        allCoords.push([Number(p.longitude), Number(p.latitude)]);
      });
    }
  });

  if (allCoords.length === 0) return null;

  const rawInstructions = Array.isArray(r.guidance?.instructions)
    ? r.guidance.instructions
    : [];

  // Parse ordered instructions with segment coordinates and step metrics
  const instructions = rawInstructions.map((ins, idx) => {
    const nextIns = rawInstructions[idx + 1] || null;
    const normManeuver = normalizeManeuverType(ins.maneuver, ins.instructionType);

    // Compute step distance and duration to next maneuver
    const stepDistanceM = nextIns
      ? Math.max(0, (nextIns.routeOffsetInMeters || 0) - (ins.routeOffsetInMeters || 0))
      : Math.max(0, (r.summary?.lengthInMeters || 0) - (ins.routeOffsetInMeters || 0));

    const stepTimeSec = nextIns
      ? Math.max(0, (nextIns.travelTimeInSeconds || 0) - (ins.travelTimeInSeconds || 0))
      : Math.max(0, (r.summary?.travelTimeInSeconds || 0) - (ins.travelTimeInSeconds || 0));

    // Slice segment coordinates for this maneuver
    const startIdx = typeof ins.pointIndex === 'number' ? ins.pointIndex : 0;
    const endIdx = nextIns && typeof nextIns.pointIndex === 'number'
      ? nextIns.pointIndex
      : allCoords.length - 1;

    let segment = [];
    if (startIdx <= endIdx && startIdx < allCoords.length) {
      segment = allCoords.slice(startIdx, Math.min(allCoords.length, endIdx + 1));
    }
    if (segment.length < 2 && allCoords.length >= 2) {
      const safeStart = Math.max(0, startIdx - 1);
      const safeEnd = Math.min(allCoords.length, endIdx + 2);
      segment = allCoords.slice(safeStart, safeEnd);
    }

    const lat = ins.point?.latitude != null ? Number(ins.point.latitude) : null;
    const lon = ins.point?.longitude != null ? Number(ins.point.longitude) : null;

    // Check if this instruction coincides with a military waypoint/checkpoint
    let isCheckpoint = normManeuver === 'WAYPOINT';
    let checkpointName = null;

    if (lat != null && lon != null && waypoints.length > 2) {
      // Find matching intermediate waypoint within ~300 meters
      for (let i = 1; i < waypoints.length - 1; i++) {
        const wp = waypoints[i];
        const wLat = Number(wp.lat);
        const wLon = Number(wp.lon != null ? wp.lon : wp.lng);
        if (!isNaN(wLat) && !isNaN(wLon)) {
          const dLat = Math.abs(lat - wLat);
          const dLon = Math.abs(lon - wLon);
          if (dLat < 0.003 && dLon < 0.003) {
            isCheckpoint = true;
            checkpointName = wp.place_name || wp.installation_name || wp.name || `Checkpoint #${i}`;
            break;
          }
        }
      }
    }

    // Refine message for military clarity
    let message = ins.message || '';
    if (idx === 0 && !message) {
      message = 'Depart from origin';
    } else if (normManeuver === 'ARRIVE' && (!message || message.toLowerCase() === 'you have arrived')) {
      message = 'Arrive at destination';
    } else if (isCheckpoint && checkpointName && !message.includes(checkpointName)) {
      message = `Arrive at checkpoint: ${checkpointName}`;
    }

    return {
      id: idx,
      stepNumber: idx + 1,
      maneuver: normManeuver,
      instructionType: ins.instructionType || 'TURN',
      message,
      street: ins.street || '',
      routeOffsetM: ins.routeOffsetInMeters || 0,
      stepDistanceM,
      stepDistanceFormatted: formatDistance(stepDistanceM),
      stepTimeSec,
      stepTimeFormatted: formatDuration(stepTimeSec),
      pointIndex: startIdx,
      lat,
      lon,
      segment,
      isCheckpoint,
      checkpointName
    };
  });

  return {
    source,
    geometry: {
      type: 'LineString',
      coordinates: allCoords
    },
    distanceKm: r.summary?.lengthInMeters
      ? Number((r.summary.lengthInMeters / 1000).toFixed(1))
      : null,
    etaHours: r.summary?.travelTimeInSeconds
      ? Number((r.summary.travelTimeInSeconds / 3600).toFixed(1))
      : null,
    travelTimeSeconds: r.summary?.travelTimeInSeconds || null,
    instructions
  };
}

/**
 * Fallback: generate structured tactical corridor milestone instructions directly
 * from approved military route legs when road-level routing is offline or unmapped.
 *
 * @param {Array<string>} path - Node ID sequence
 * @param {Object} nodeDict - Node catalog
 * @param {Array<Object>} legs - Tactical router legs
 * @returns {Array<Object>} Milestone instructions
 */
export function generateTacticalMilestoneInstructions(path = [], nodeDict = {}, legs = []) {
  if (!Array.isArray(path) || path.length < 2) return [];

  const instructions = [];
  let cumDistanceM = 0;

  path.forEach((nodeId, idx) => {
    const cleanId = (nodeId || '').replace('PLC-', '');
    const n = nodeDict[cleanId] || nodeDict[nodeId] || {};
    const name = n.place_name || n.name || cleanId;
    const lat = n.lat != null ? Number(n.lat) : null;
    const lon = Number(n.lon != null ? n.lon : (n.lng != null ? n.lng : null));

    const isOrigin = idx === 0;
    const isDest = idx === path.length - 1;
    const leg = legs && legs[idx] ? legs[idx] : null;

    const stepDistKm = leg?.distance_km ?? 0;
    const stepDistM = stepDistKm * 1000;
    const stepTimeHrs = leg?.time_hours ?? 0;
    const stepTimeSec = stepTimeHrs * 3600;

    let maneuver = 'STRAIGHT';
    let message = '';

    if (isOrigin) {
      maneuver = 'DEPART';
      message = `Depart from ${name}`;
    } else if (isDest) {
      maneuver = 'ARRIVE';
      message = `Arrive at destination: ${name}`;
    } else {
      maneuver = 'WAYPOINT';
      message = `Checkpoint reached: ${name} [${cleanId}]`;
    }

    instructions.push({
      id: idx,
      stepNumber: idx + 1,
      maneuver,
      instructionType: isOrigin ? 'LOCATION_DEPARTURE' : (isDest ? 'LOCATION_ARRIVAL' : 'LOCATION_WAYPOINT'),
      message,
      street: leg ? `Tactical Corridor Leg #${idx}` : '',
      routeOffsetM: cumDistanceM,
      stepDistanceM: isDest ? 0 : stepDistM,
      stepDistanceFormatted: isDest ? '0 m' : formatDistance(stepDistM),
      stepTimeSec: isDest ? 0 : stepTimeSec,
      stepTimeFormatted: isDest ? '—' : formatDuration(stepTimeSec),
      lat,
      lon,
      segment: [],
      isCheckpoint: !isOrigin && !isDest,
      checkpointName: !isOrigin && !isDest ? name : null
    });

    cumDistanceM += stepDistM;
  });

  return instructions;
}
