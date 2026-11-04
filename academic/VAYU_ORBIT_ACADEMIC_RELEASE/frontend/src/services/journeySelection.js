/**
 * VAYU ORBIT — Operational Journey Selection Logic
 *
 * Implements deterministic journey selection for the Overview Command Dashboard:
 * 1. Active / In-Transit Operational Convoys (ACTIVE or DISRUPTED) take top priority.
 *    If multiple active convoys exist, selects the one with earliest operational departure.
 * 2. If no active journeys exist, selects the earliest eligible upcoming journey (SCHEDULED)
 *    whose scheduled departure is >= current system time.
 *    Compares complete date-time values (not hour-only).
 * 3. Excludes CANCELLED and COMPLETED journeys entirely.
 * 4. Returns null if no eligible active or upcoming journeys exist (triggering empty state).
 */

/**
 * Parse complete date-time from journey departure fields.
 * Returns millisecond timestamp or null if unparseable.
 *
 * @param {Object} journey - Journey database or API record
 * @returns {number|null} Milliseconds timestamp or null
 */
export function parseDepartureDateTime(journey) {
  if (!journey || !journey.departure_date) return null;

  const dateStr = String(journey.departure_date).trim();
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // If not standard YYYY-MM-DD, try generic Date.parse
    const fallback = Date.parse(dateStr);
    return isNaN(fallback) ? null : fallback;
  }

  let timeStr = '00:00:00';
  if (journey.departure_time && typeof journey.departure_time === 'string') {
    const rawTime = journey.departure_time.trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(rawTime)) {
      const parts = rawTime.split(':');
      const hh = parts[0].padStart(2, '0');
      const mm = parts[1].padStart(2, '0');
      const ss = parts[2] ? parts[2].padStart(2, '0') : '00';
      timeStr = `${hh}:${mm}:${ss}`;
    }
  }

  const iso = `${dateStr}T${timeStr}`;
  const parsed = Date.parse(iso);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse created_at timestamp for secondary deterministic sorting.
 *
 * @param {Object} journey
 * @returns {number}
 */
export function parseCreatedAt(journey) {
  if (!journey || !journey.created_at) return 0;
  const parsed = Date.parse(journey.created_at);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Deterministic chronological comparator:
 * 1. departure date-time ascending (valid timestamps first, nulls last)
 * 2. created_at ascending
 * 3. journey_id ascending (locale string compare)
 */
export function compareJourneysChronological(a, b) {
  const tA = parseDepartureDateTime(a);
  const tB = parseDepartureDateTime(b);

  if (tA !== null && tB !== null && tA !== tB) {
    return tA - tB;
  }
  if (tA !== null && tB === null) return -1;
  if (tA === null && tB !== null) return 1;

  const cA = parseCreatedAt(a);
  const cB = parseCreatedAt(b);
  if (cA !== cB) return cA - cB;

  return String(a?.journey_id || '').localeCompare(String(b?.journey_id || ''));
}

/**
 * Select the most relevant journey for the Overview Command Dashboard.
 *
 * Decision Order:
 * 1. Operational journeys (ACTIVE or DISRUPTED) -> earliest departure priority.
 * 2. Earliest eligible upcoming journey (SCHEDULED with departure >= currentTime).
 * 3. null (empty state).
 *
 * @param {Array<Object>} journeys - List of journey records from /api/journeys
 * @param {Date|number|string} [currentTime=new Date()] - Reference clock time
 * @returns {Object|null} Selected journey or null
 */
export function selectOverviewJourney(journeys, currentTime = new Date()) {
  if (!Array.isArray(journeys) || journeys.length === 0) {
    return null;
  }

  const currentMs = currentTime instanceof Date
    ? currentTime.getTime()
    : (typeof currentTime === 'number' ? currentTime : Date.parse(currentTime));

  // 1. Operational Convoys: ACTIVE or DISRUPTED (In Transit)
  // Exclude COMPLETED and CANCELLED
  const operational = journeys.filter(j => {
    const s = String(j?.status || '').toUpperCase();
    return s === 'ACTIVE' || s === 'DISRUPTED';
  });

  if (operational.length > 0) {
    operational.sort(compareJourneysChronological);
    return operational[0];
  }

  // 2. Upcoming Convoys: SCHEDULED (or DRAFT if any)
  // Exclude CANCELLED, COMPLETED, ACTIVE, DISRUPTED
  // Exclude scheduled departures in the past (< currentMs)
  const upcoming = journeys.filter(j => {
    const s = String(j?.status || '').toUpperCase();
    if (s === 'COMPLETED' || s === 'CANCELLED' || s === 'ACTIVE' || s === 'DISRUPTED') {
      return false;
    }
    const depMs = parseDepartureDateTime(j);
    if (depMs === null) {
      // Missing departure date cannot be verified as future upcoming
      return false;
    }
    return depMs >= currentMs;
  });

  if (upcoming.length > 0) {
    upcoming.sort(compareJourneysChronological);
    return upcoming[0];
  }

  // 3. No eligible journeys exist
  return null;
}
