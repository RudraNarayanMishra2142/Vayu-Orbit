import { useState, useEffect } from 'react';
import { api } from '../../services/api';

/**
 * Custom hook to request tactical corridor route calculation
 * from the authentic VAYU ORBIT backend (/api/route) combined
 * with TomTom Routing API for high-fidelity road geometry.
 */
export function useRoute(origin, destination) {
  const [state, setState] = useState({
    status: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
    route: null,
    error: null
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!origin || !destination || !origin.id || !destination.id || origin.id === destination.id) {
      setState({ status: 'idle', route: null, error: null });
      return;
    }

    const ctl = new AbortController();
    let active = true;
    setState({ status: 'loading', route: null, error: null });

    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;

    // Concurrently fetch tactical route from backend and road geometry from TomTom
    Promise.all([
      api.route({
        origin_id: origin.id,
        dest_id: destination.id,
        convoy_speed_kmh: 40,
        max_vehicle_tons: 0
      }),
      (async () => {
        if (!apiKey || origin.lat == null || origin.lng == null || destination.lat == null || destination.lng == null) {
          return null;
        }
        try {
          const url = `https://api.tomtom.com/routing/1/calculateRoute/${origin.lat},${origin.lng}:${destination.lat},${destination.lng}/json?key=${apiKey}`;
          const res = await fetch(url, { signal: ctl.signal });
          if (res.ok) {
            const data = await res.json();
            const pts = data.routes?.[0]?.legs?.[0]?.points;
            if (pts && pts.length > 0) {
              return {
                geometry: {
                  type: 'LineString',
                  coordinates: pts.map((p) => [p.longitude, p.latitude])
                },
                distanceM: data.routes[0].summary?.lengthInMeters,
                durationS: data.routes[0].summary?.travelTimeInSeconds
              };
            }
          }
        } catch (e) {
          if (e.name !== 'AbortError') {
            console.warn('TomTom road geometry lookup failed, using tactical corridor:', e);
          }
        }
        return null;
      })()
    ])
      .then(([res, ttData]) => {
        if (!active) return;
        if (res.status === 'ROUTE_UNAVAILABLE' || !res.selected_route) {
          setState({
            status: 'error',
            route: null,
            error: res.message || 'No feasible tactical corridor exists between selected nodes.'
          });
          return;
        }

        const sel = res.selected_route;
        setState({
          status: 'ready',
          route: {
            selected_route: sel,
            routes: res.routes || [sel],
            distanceKm: ttData?.distanceM ? (ttData.distanceM / 1000).toFixed(1) : sel.distance_km,
            etaHours: ttData?.durationS ? (ttData.durationS / 3600).toFixed(1) : sel.eta_hours,
            riskScore: sel.risk_score,
            explanation: sel.explanation,
            path: sel.path || [],
            geometry: ttData?.geometry || null,
            source: {
              name: ttData ? 'TomTom Routing & VAYU Tactical Router' : 'VAYU Tactical Router',
              note: ttData
                ? 'High-fidelity road geometry via TomTom Maps SDK'
                : 'Simulated corridor network.'
            }
          },
          error: null
        });
      })
      .catch((err) => {
        if (!active) return;
        setState({
          status: 'error',
          route: null,
          error: err.message || 'Failed to calculate tactical route.'
        });
      });

    return () => {
      active = false;
      ctl.abort();
    };
  }, [origin?.id, destination?.id, attempt]);

  return {
    ...state,
    retry: () => setAttempt((prev) => prev + 1)
  };
}
