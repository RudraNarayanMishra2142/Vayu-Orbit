const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE;
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname || '127.0.0.1';
    return `http://${host}:8000`;
  }
  return 'http://127.0.0.1:8000';
};
const BASE = getApiBase();

const TOKEN_KEY = 'vayu_auth_token';

export function getAuthToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

function parseErrorDetail(d, status) {
  if (typeof d?.detail === 'string') return d.detail;
  if (typeof d?.detail === 'object' && d?.detail?.message) return d.detail.message;
  if (Array.isArray(d?.detail)) return d.detail.map(e => (e.loc && e.loc.length > 1 ? e.loc.slice(1).join('.') + ': ' : e.loc && e.loc.length === 1 ? e.loc[0] + ': ' : '') + e.msg).join('; ');
  if (d?.message) return d.message;
  return `Request failed (${status})`;
}

async function req(path, opts = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {})
  };
  const r = await fetch(BASE + path, {
    credentials: 'include',
    headers,
    ...opts
  });
  let d = null;
  try {
    d = await r.json();
  } catch {}
  if (r.status === 401 && path !== '/api/auth/login') {
    setAuthToken(null);
    if (typeof unauthorizedHandler === 'function') {
      try {
        unauthorizedHandler();
      } catch (err) {
        console.warn('Unauthorized handler error:', err);
      }
    }
  }
  if (!r.ok) {
    const err = new Error(parseErrorDetail(d, r.status));
    err.status = r.status;
    err.detail = d?.detail;
    err.data = d;
    throw err;
  }
  return d;
}

export const api = {
  base: BASE,
  // Phase 1 Authentication
  login: async (email, password) => {
    const res = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (res?.token) {
      setAuthToken(res.token);
    }
    return res;
  },
  logout: async () => {
    try {
      await req('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },
  getMe: () => req('/api/auth/me'),

  // Existing Endpoints
  health: () => req('/api/health'),
  nodes: () => req('/api/nodes'),
  vehicles: () => req('/api/vehicles'),
  addVehicle: v => req('/api/vehicles', { method: 'POST', body: JSON.stringify(v) }),
  vehicleStatus: (id, status) => req(`/api/vehicles/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  fleetUnits: (q = '') => req('/api/fleet-units' + q),
  addFleetUnit: fu => req('/api/fleet-units', { method: 'POST', body: JSON.stringify(fu) }),
  fleetUnitStatus: (id, status) => req(`/api/fleet-units/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  places: (q = '') => req('/api/places' + q),
  addPlace: p => req('/api/places', { method: 'POST', body: JSON.stringify(p) }),
  placeStatus: (id, status) => req(`/api/places/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  route: r => req('/api/route', { method: 'POST', body: JSON.stringify(r) }),
  // VORAM v0.1 Risk Assessment Model Endpoints
  voramConfig: () => req('/api/voram/config'),
  voramAssess: payload => req('/api/voram/assess', { method: 'POST', body: JSON.stringify(payload) }),
  voramAssessRoute: payload => req('/api/voram/assess-route', { method: 'POST', body: JSON.stringify(payload) }),
  sitrep: s => req('/api/intelligence/sitrep', { method: 'POST', body: JSON.stringify({ sitrep: s }) }),
  recalc: r => req('/api/route/recalculate', { method: 'POST', body: JSON.stringify(r) }),
  whatif: r => req('/api/simulation/what-if', { method: 'POST', body: JSON.stringify(r) }),
  journeys: () => req('/api/journeys'),
  journey: id => req(`/api/journeys/${id}`),
  journeyReport: id => req(`/api/journeys/${id}/report`),
  downloadJourneyReportPdf: async (journeyId) => {
    const token = getAuthToken();
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
    const r = await fetch(`${BASE}/api/journeys/${journeyId}/report/pdf`, {
      credentials: 'include',
      headers
    });
    if (r.status === 401) {
      setAuthToken(null);
      if (typeof unauthorizedHandler === 'function') {
        try {
          unauthorizedHandler();
        } catch (err) {
          console.warn('Unauthorized handler error:', err);
        }
      }
    }
    if (!r.ok) {
      let d = null;
      try {
        d = await r.json();
      } catch {}
      const err = new Error(parseErrorDetail(d, r.status));
      err.status = r.status;
      err.detail = d?.detail;
      err.data = d;
      throw err;
    }
    const blob = await r.blob();
    const disposition = r.headers.get('content-disposition') || '';
    let filename = `VAYU-ORBIT-Journey-Debrief-${journeyId}.pdf`;
    const match = disposition.match(/filename="?([^";]+)"?/i);
    if (match && match[1]) {
      filename = match[1];
    }
    return { blob, filename };
  },
  createJourney: j => req('/api/journeys', { method: 'POST', body: JSON.stringify(j) }),
  journeyStatus: (id, status, message = '', override_reason = null) => req(`/api/journeys/${id}/status`, { method: 'POST', body: JSON.stringify({ status, message, override_reason }) }),
  fuelOverride: (id, data) => req(`/api/journeys/${id}/fuel-override`, { method: 'POST', body: JSON.stringify(data) }),
  deleteFuelOverride: id => req(`/api/journeys/${id}/fuel-override`, { method: 'DELETE' }),
  disruption: (id, data) => req(`/api/journeys/${id}/disruption`, { method: 'POST', body: JSON.stringify(data) }),
  event: (id, e) => req(`/api/journeys/${id}/events`, { method: 'POST', body: JSON.stringify(e) }),
  spacingConfig: id => req(`/api/journeys/${id}/spacing-config`),
  setSpacingConfig: (id, cfg) => req(`/api/journeys/${id}/spacing-config`, { method: 'POST', body: JSON.stringify(cfg) }),
  incidents: id => req(`/api/journeys/${id}/incidents`),
  createIncident: (id, inc) => req(`/api/journeys/${id}/incidents`, { method: 'POST', body: JSON.stringify(inc) }),
  ackIncident: (id, incId, reqBody = {}) => req(`/api/journeys/${id}/incidents/${incId}/ack`, { method: 'POST', body: JSON.stringify(reqBody) }),
  resolveIncident: (id, incId, res) => req(`/api/journeys/${id}/incidents/${incId}/resolve`, { method: 'POST', body: JSON.stringify(res) }),
  fuelIntelligence: id => req(`/api/journeys/${id}/fuel-intelligence`),
  setFuelConfig: (id, cfg) => req(`/api/journeys/${id}/fuel-config`, { method: 'POST', body: JSON.stringify(cfg) }),
  previewFuelDetour: (id, stationId) => req(`/api/journeys/${id}/fuel-preview-detour`, { method: 'POST', body: JSON.stringify({ station_id: stationId }) }),
  applyFuelDetour: (id, stationId) => req(`/api/journeys/${id}/fuel-apply-detour`, { method: 'POST', body: JSON.stringify({ station_id: stationId }) }),
  // ROP Evidence, VORAM Reassessment & Sensitivity Advisory
  createStagedSession: () => req('/api/staged-sessions', { method: 'POST' }),
  ropReport: (journeyId, routeVersion = '') => req(`/api/rop-reports/${journeyId}${routeVersion ? `?route_version=${encodeURIComponent(routeVersion)}` : ''}`),
  submitRopReport: (journeyId, data) => req(`/api/rop-reports/${journeyId}`, { method: 'POST', body: JSON.stringify(data) }),
  reviewRopReport: (journeyId, reportId, data) => req(`/api/rop-reports/${journeyId}/${reportId}/review`, { method: 'POST', body: JSON.stringify(data) }),
  reassessVoram: (journeyId) => req(`/api/journeys/${journeyId}/reassess-voram`, { method: 'POST' }),
  stagedReassessVoram: (payload) => req('/api/staged-reassess-voram', { method: 'POST', body: JSON.stringify(payload) }),
  sensitivityAdvisory: (journeyId) => req(`/api/sensitivity-advisory/${journeyId}`),
  updateSensitivityAdvisory: (journeyId, data) => req(`/api/sensitivity-advisory/${journeyId}`, { method: 'POST', body: JSON.stringify(data) }),
  journeyReadiness: (journeyId) => req(`/api/journeys/${journeyId}/readiness`),
  readinessOverride: (journeyId, data) => req(`/api/journeys/${journeyId}/readiness-override`, { method: 'POST', body: JSON.stringify(data) }),
  analytics: () => req('/api/analytics'),
  audit: () => req('/api/audit')
};
