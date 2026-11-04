import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import StepProgress from '../components/planning/StepProgress';
import PlanningForm from '../components/planning/PlanningForm';
import PlanningMap from '../components/planning/PlanningMap';
import ElevationProfile from '../components/planning/ElevationProfile';
import RoutePreview from '../components/planning/RoutePreview';
import { useRoute } from '../components/planning/useRoute';

const EMPTY = { originId: '', destinationId: '', date: '', time: '' };

const today = () => new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
const nowTime = () => new Date().toTimeString().slice(0, 5); // 'HH:MM'

function validate(d) {
  const e = {};
  if (!d.originId) {
    e.originId = 'Select an origin node.';
  }
  if (!d.destinationId) {
    e.destinationId = 'Select a destination node.';
  } else if (d.destinationId === d.originId) {
    e.destinationId = 'Destination node must differ from origin node.';
  }
  if (!d.date) {
    e.date = 'Enter a departure date.';
  } else if (d.date < today()) {
    e.date = 'Departure date cannot be in the past.';
  }
  if (!d.time) {
    e.time = 'Enter a departure time.';
  } else if (d.date === today() && d.time < nowTime()) {
    e.time = 'Departure time has already passed today.';
  }
  return e;
}

export default function Planning({
  setPage,
  mission,
  setMission,
  resetPlanning,
  currentUser
}) {
  const [places, setPlaces] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [draft, setDraft] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [topMsg, setTopMsg] = useState('');

  // 1. Fetch real active military nodes from Place Management API
  useEffect(() => {
    let active = true;
    setPlacesLoading(true);
    api.places('?status=ACTIVE')
      .then((rawPlaces) => {
        if (!active) return;
        const normalized = (rawPlaces || []).map((p) => ({
          id: (p.place_id || '').replace('PLC-', ''),
          place_id: p.place_id,
          name: p.place_name,
          code: (p.place_id || '').replace('PLC-', ''),
          category: p.category,
          region: p.region,
          lat: Number(p.lat),
          lng: Number(p.lon),
          lon: Number(p.lon),
          raw: p
        }));
        setPlaces(normalized);
      })
      .catch((err) => {
        if (!active) return;
        setTopMsg(`Failed to load military nodes: ${err.message}`);
      })
      .finally(() => {
        if (active) setPlacesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // 2. Synchronize draft state from existing mission / restored session draft
  useEffect(() => {
    if (mission) {
      setDraft((prev) => {
        const next = { ...prev };
        let changed = false;

        if (mission.origin !== undefined) {
          const sanitizedOrigin = (mission.origin || '').replace('PLC-', '');
          if (sanitizedOrigin !== next.originId) {
            next.originId = sanitizedOrigin;
            changed = true;
          }
        }

        if (mission.dest !== undefined) {
          const sanitizedDest = (mission.dest || '').replace('PLC-', '');
          if (sanitizedDest !== next.destinationId) {
            next.destinationId = sanitizedDest;
            changed = true;
          }
        }

        if (mission.date !== undefined && mission.date !== next.date) {
          next.date = mission.date || '';
          changed = true;
        }

        if (mission.time !== undefined && mission.time !== next.time) {
          next.time = mission.time || '';
          changed = true;
        }

        return changed ? next : prev;
      });
    }
  }, [mission]);

  // 3. Validation computation
  const allErrors = useMemo(() => validate(draft), [draft]);
  const visibleErrors = useMemo(() => {
    return Object.fromEntries(
      Object.entries(allErrors).filter(([k]) => submitted || touched[k])
    );
  }, [allErrors, submitted, touched]);

  const hasDraft = Boolean(draft.originId || draft.destinationId || draft.date || draft.time);
  const dirty = hasDraft;

  // 4. Resolve selected endpoints from real places list
  const origin = useMemo(() => {
    return places.find((p) => p.id === draft.originId) || null;
  }, [places, draft.originId]);

  const destination = useMemo(() => {
    return places.find((p) => p.id === draft.destinationId && p.id !== draft.originId) || null;
  }, [places, draft.destinationId, draft.originId]);

  // 5. Query live backend tactical router for corridor parameters
  const { status: routeStatus, route, error: routeError, retry: routeRetry } = useRoute(origin, destination);

  // Field change handler: updates local draft and synchronizes with parent mission draft
  const setField = (key, value) => {
    setTopMsg('');
    const nextDraft = { ...draft, [key]: value };
    setDraft(nextDraft);

    if (typeof setMission === 'function') {
      setMission({
        ...mission,
        origin: nextDraft.originId,
        dest: nextDraft.destinationId,
        date: nextDraft.date,
        time: nextDraft.time
      });
    }
  };

  const touch = (key) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  const handleReset = () => {
    setDraft(EMPTY);
    setTouched({});
    setSubmitted(false);
    setTopMsg('');
    if (typeof resetPlanning === 'function') {
      resetPlanning();
    }
  };

  // 6. Confirm Journey action -> Step 2 transition
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);

    const validationErrors = validate(draft);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    setTopMsg('');

    try {
      let selectedRoute = route?.selected_route;
      let availableRoutes = route?.routes;

      // If route is not ready or had an error, execute synchronous fetch
      if (!selectedRoute) {
        const res = await api.route({
          origin_id: draft.originId,
          dest_id: draft.destinationId,
          convoy_speed_kmh: 40,
          max_vehicle_tons: 12
        });

        if (res.status === 'ROUTE_UNAVAILABLE' || !res.selected_route) {
          setTopMsg(res.message || 'No feasible tactical corridor exists between selected nodes.');
          setSubmitting(false);
          return;
        }

        selectedRoute = res.selected_route;
        availableRoutes = res.routes;
      }

      const selOrigin = places.find((p) => p.id === draft.originId);
      const selDest = places.find((p) => p.id === draft.destinationId);

      setMission({
        ...mission,
        origin: draft.originId,
        dest: draft.destinationId,
        originName: selOrigin?.name || draft.originId,
        destName: selDest?.name || draft.destinationId,
        date: draft.date,
        time: draft.time,
        route: selectedRoute,
        routes: availableRoutes
      });

      setPage('Convoy Builder');
    } catch (err) {
      setTopMsg(err.message || 'Failed to calculate tactical route.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell
      title="Journey Planning"
      eyebrow="STEP 1 OF 5 · PLANNING"
      description="Select origin and destination nodes and configure departure schedule."
    >
      <StepProgress current={1} total={5} />

      <div className="planning-workspace">
        <div className="planning-col-left planning-col-form">
          <RoutePreview
            status={routeStatus}
            route={route}
            error={routeError}
            onRetry={routeRetry}
          />
          <PlanningForm
            draft={draft}
            errors={visibleErrors}
            dirty={dirty}
            places={places}
            minDate={today()}
            setField={setField}
            touch={touch}
            onSubmit={handleSubmit}
            onReset={handleReset}
            loading={submitting || placesLoading}
          />
          {topMsg && (
            <div className="planning-top-alert" role="alert">
              {topMsg}
            </div>
          )}
        </div>

        <div className="planning-col-right planning-col-map">
          <PlanningMap
            origin={origin}
            destination={destination}
            routeGeometry={route?.geometry}
          />
          <ElevationProfile
            route={route}
            status={routeStatus}
          />
        </div>
      </div>
    </Shell>
  );
}
