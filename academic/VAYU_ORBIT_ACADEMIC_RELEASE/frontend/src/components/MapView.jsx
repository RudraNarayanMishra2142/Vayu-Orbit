import React, { useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Navigation, ArrowRight } from 'lucide-react';

const INITIAL_VIEW = { center: [78.9, 23.5], zoom: 5 };

function buildTomTomStyle(key) {
  if (!key) return undefined;
  const isLight = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
  const tileMode = isLight ? 'main' : 'night';
  return {
    version: 8,
    sources: {
      'tomtom-tiles': {
        type: 'raster',
        tiles: [
          `https://a.api.tomtom.com/map/1/tile/basic/${tileMode}/{z}/{x}/{y}.png?key=${key}`,
          `https://b.api.tomtom.com/map/1/tile/basic/${tileMode}/{z}/{x}/{y}.png?key=${key}`,
          `https://c.api.tomtom.com/map/1/tile/basic/${tileMode}/{z}/{x}/{y}.png?key=${key}`,
          `https://d.api.tomtom.com/map/1/tile/basic/${tileMode}/{z}/{x}/{y}.png?key=${key}`
        ],
        tileSize: 256,
        attribution: '© <a href="https://www.tomtom.com" target="_blank" rel="noopener">TomTom</a>'
      }
    },
    layers: [
      {
        id: 'tomtom-layer',
        type: 'raster',
        source: 'tomtom-tiles',
        minzoom: 0,
        maxzoom: 22
      }
    ]
  };
}

/**
 * Tactical MapView component powered by TomTom Maps SDK for Web.
 * Renders high-fidelity road-level routes, alternative paths, and tactical military nodes.
 *
 * Props:
 *  places               : Array<{ lat: number, lon: number, place_name?: string, name?: string, id?: string }>
 *  route                : Array<[lat: number, lon: number]> (legacy coordinate points fallback)
 *  routeGeometry        : GeoJSON LineString | null (road-following high-fidelity geometry)
 *  alternativeGeometries: Array<GeoJSON LineString> (road-following geometries for alternatives)
 *  waypoints            : Array<{ lat: number, lon: number, name?: string, installation_name?: string }>
 *  origin               : { lat: number, lon: number, place_name?: string, name?: string } | null
 *  destination          : { lat: number, lon: number, place_name?: string, name?: string } | null
 *  center               : [lat: number, lon: number] | null
 */
export default function MapView({
  places = [],
  route = [],
  routeGeometry = null,
  alternativeGeometries = [],
  waypoints = [],
  fuelStations = [],
  origin = null,
  destination = null,
  center = null,
  cameraMode = 'overview', // 'overview' | 'focus' | 'free' | 'navigation'
  focusCoord = null, // [lat, lon] or [lon, lat]
  onUserPan = null,
  onMapReady = null,
  // Turn-by-Turn Navigation Props
  selectedInstruction = null,
  highlightedSegment = null,
  selectedCheckpoint = null,
  onSelectCheckpoint = null,
  instructions = [],
  onSelectInstruction = null,
  onNextInstruction = null,
  onPrevInstruction = null
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const markersRef = useRef([]);
  const isUserInteractingRef = useRef(false);
  const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;

  const currentInstructionIdx = selectedInstruction && Array.isArray(instructions)
    ? instructions.findIndex((ins) => ins.id === selectedInstruction.id)
    : -1;

  const handleMapNextInstruction = useCallback((e) => {
    e?.stopPropagation?.();
    if (typeof onNextInstruction === 'function') {
      onNextInstruction();
    } else if (Array.isArray(instructions) && instructions.length > 0 && typeof onSelectInstruction === 'function') {
      const nextIdx = currentInstructionIdx + 1 < instructions.length ? currentInstructionIdx + 1 : 0;
      onSelectInstruction(instructions[nextIdx], nextIdx);
    }
  }, [onNextInstruction, instructions, onSelectInstruction, currentInstructionIdx]);

  const handleMapPrevInstruction = useCallback((e) => {
    e?.stopPropagation?.();
    if (typeof onPrevInstruction === 'function') {
      onPrevInstruction();
    } else if (Array.isArray(instructions) && instructions.length > 0 && typeof onSelectInstruction === 'function') {
      const prevIdx = currentInstructionIdx - 1 >= 0 ? currentInstructionIdx - 1 : instructions.length - 1;
      onSelectInstruction(instructions[prevIdx], prevIdx);
    }
  }, [onPrevInstruction, instructions, onSelectInstruction, currentInstructionIdx]);

  // Initialize TomTom Map instance
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!window.tt || typeof window.tt.map !== 'function') {
      console.warn('TomTom SDK not yet loaded on window.tt in MapView');
      return;
    }

    const currentStyle = buildTomTomStyle(apiKey);

    const initialCenter = center
      ? [Number(center[1]), Number(center[0])]
      : INITIAL_VIEW.center;

    const m = window.tt.map({
      key: apiKey || 'NO_KEY',
      container: containerRef.current,
      center: initialCenter,
      zoom: center ? 8 : INITIAL_VIEW.zoom,
      style: currentStyle,
      dragPan: true
    });

    m.addControl(new window.tt.NavigationControl({ showCompass: false }), 'top-right');

    const handleUserInteraction = () => {
      isUserInteractingRef.current = true;
      if (typeof onUserPan === 'function') {
        onUserPan();
      }
    };

    m.on('dragstart', handleUserInteraction);
    m.on('pitchstart', handleUserInteraction);
    m.on('rotatestart', handleUserInteraction);
    m.on('touchstart', handleUserInteraction);

    m.on('load', () => {
      mapLoadedRef.current = true;
      if (typeof onMapReady === 'function') {
        onMapReady(m);
      }
      updateMapData(m);
    });

    mapRef.current = m;

    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      }, 50);
    });
    ro.observe(containerRef.current);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      ro.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      m.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, [apiKey]);

  // Update places markers, route lines and camera bounds
  const updateMapData = useCallback((m) => {
    if (!m || !mapLoadedRef.current) return;

    // Clear old markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const bounds = new window.tt.LngLatBounds();
    let hasPoints = false;

    // Map of coordinate to place for labeling
    const placeCoordMap = new Map();
    places.forEach((p) => {
      const lat = Number(p.lat != null ? p.lat : p.latitude);
      const lon = Number(p.lon != null ? p.lon : (p.lng != null ? p.lng : p.longitude));
      if (!isNaN(lat) && !isNaN(lon)) {
        const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        placeCoordMap.set(key, p.place_name || p.name || 'Tactical Node');
      }
    });

    // Extract selected route coordinates (GeoJSON coordinates are [lon, lat])
    let routeCoords = [];
    if (routeGeometry && routeGeometry.coordinates && routeGeometry.coordinates.length > 0) {
      routeCoords = routeGeometry.coordinates;
    } else if (Array.isArray(route) && route.length > 0) {
      routeCoords = route.map((pt) => {
        const lat = Number(pt[0]);
        const lon = Number(pt[1]);
        return [lon, lat]; // TomTom expects [lng, lat]
      }).filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));
    }

    // Check if high-fidelity road network geometry is active
    const hasRoadGeom = Boolean(
      routeGeometry && routeGeometry.coordinates && routeGeometry.coordinates.length > 1
    );

    // 1. Render Alternative Routes (if provided) with distinguishable styling (Dashed Amber)
    const validAlts = (alternativeGeometries || []).filter(
      (g) => g && g.coordinates && g.coordinates.length > 1
    );

    const altGeojson = {
      type: 'FeatureCollection',
      features: validAlts.map((geom, idx) => ({
        type: 'Feature',
        geometry: geom,
        properties: { id: idx }
      }))
    };

    if (m.getSource('tactical-alternatives')) {
      m.getSource('tactical-alternatives').setData(altGeojson);
    } else {
      m.addSource('tactical-alternatives', {
        type: 'geojson',
        data: altGeojson
      });
      m.addLayer({
        id: 'tactical-alternatives',
        type: 'line',
        source: 'tactical-alternatives',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#FFB84D',
          'line-width': 3.5,
          'line-opacity': 0.65,
          'line-dasharray': [2, 2]
        }
      });
    }

    // Extend bounds for alternative routes
    validAlts.forEach((geom) => {
      geom.coordinates.forEach((coord) => {
        bounds.extend(coord);
        hasPoints = true;
      });
    });

    // 2. Render Selected Route: Solid Green with Glow for Road Network; Dashed Slate for Linear Fallback
    if (routeCoords.length > 1) {
      const geojson = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: routeCoords
        }
      };

      if (m.getSource('tactical-route')) {
        m.getSource('tactical-route').setData(geojson);
        if (m.getLayer('tactical-route')) {
          m.setPaintProperty('tactical-route', 'line-color', hasRoadGeom ? '#00E5A3' : '#668CA0');
          m.setPaintProperty('tactical-route', 'line-width', hasRoadGeom ? 4.5 : 3.0);
          m.setPaintProperty('tactical-route', 'line-opacity', hasRoadGeom ? 0.95 : 0.65);
          m.setPaintProperty('tactical-route', 'line-dasharray', hasRoadGeom ? [1, 0] : [2, 2]);
        }
        if (m.getLayer('tactical-route-glow')) {
          m.setPaintProperty('tactical-route-glow', 'line-opacity', hasRoadGeom ? 0.25 : 0.0);
        }
      } else {
        m.addSource('tactical-route', {
          type: 'geojson',
          data: geojson
        });

        // Glowing backdrop layer (only active for high-fidelity road routes)
        m.addLayer({
          id: 'tactical-route-glow',
          type: 'line',
          source: 'tactical-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#00E5A3',
            'line-width': 9,
            'line-opacity': hasRoadGeom ? 0.25 : 0.0
          }
        });

        // Foreground corridor line
        m.addLayer({
          id: 'tactical-route',
          type: 'line',
          source: 'tactical-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': hasRoadGeom ? '#00E5A3' : '#668CA0',
            'line-width': hasRoadGeom ? 4.5 : 3.0,
            'line-opacity': hasRoadGeom ? 0.95 : 0.65,
            'line-dasharray': hasRoadGeom ? [1, 0] : [2, 2]
          }
        });
      }

      routeCoords.forEach((coord) => {
        bounds.extend(coord);
        hasPoints = true;
      });

      // Endpoint A (Origin)
      const originCoord = origin && origin.lat != null
        ? [Number(origin.lon != null ? origin.lon : origin.lng), Number(origin.lat)]
        : routeCoords[0];

      const elA = document.createElement('div');
      elA.className = 'leaflet-pin-wrapper vayu-pin-marker';
      elA.innerHTML = '<span class="pin pin-o sm" aria-hidden="true">A</span>';
      const markerA = new window.tt.Marker({ element: elA, anchor: 'center' })
        .setLngLat(originCoord)
        .addTo(m);

      const origKey = `${originCoord[1].toFixed(4)},${originCoord[0].toFixed(4)}`;
      const origName = origin?.place_name || origin?.name || placeCoordMap.get(origKey) || 'Origin Node';
      const popupA = new window.tt.Popup({ offset: [0, 14], closeButton: false, className: 'map-endpoint-tooltip' })
        .setText(origName);
      markerA.setPopup(popupA);
      markerA.togglePopup();
      markersRef.current.push(markerA);

      // Endpoint B (Destination)
      const destCoord = destination && destination.lat != null
        ? [Number(destination.lon != null ? destination.lon : destination.lng), Number(destination.lat)]
        : routeCoords[routeCoords.length - 1];

      const elB = document.createElement('div');
      elB.className = 'leaflet-pin-wrapper vayu-pin-marker';
      elB.innerHTML = '<span class="pin pin-d sm" aria-hidden="true">B</span>';
      const markerB = new window.tt.Marker({ element: elB, anchor: 'center' })
        .setLngLat(destCoord)
        .addTo(m);

      const destKey = `${destCoord[1].toFixed(4)},${destCoord[0].toFixed(4)}`;
      const destName = destination?.place_name || destination?.name || placeCoordMap.get(destKey) || 'Destination Node';
      const popupB = new window.tt.Popup({ offset: [0, 14], closeButton: false, className: 'map-endpoint-tooltip' })
        .setText(destName);
      markerB.setPopup(popupB);
      markerB.togglePopup();
      markersRef.current.push(markerB);

      // Intermediate route waypoints
      if (Array.isArray(waypoints) && waypoints.length > 0) {
        waypoints.forEach((wp, idx) => {
          const wLat = Number(wp.lat);
          const wLon = Number(wp.lon != null ? wp.lon : wp.lng);
          if (isNaN(wLat) || isNaN(wLon)) return;

          // Skip if coincident with origin or destination
          if (Math.abs(wLat - originCoord[1]) < 0.001 && Math.abs(wLon - originCoord[0]) < 0.001) return;
          if (Math.abs(wLat - destCoord[1]) < 0.001 && Math.abs(wLon - destCoord[0]) < 0.001) return;

          const dot = document.createElement('div');
          dot.className = 'vayu-node-dot';
          dot.style.cursor = 'pointer';
          dot.title = `Checkpoint: ${wp.installation_name || wp.place_name || wp.name || `Waypoint #${idx + 1}`}`;
          dot.addEventListener('click', () => {
            if (typeof onSelectCheckpoint === 'function') {
              onSelectCheckpoint(wp);
            }
          });
          const nodeMarker = new window.tt.Marker({ element: dot, anchor: 'center' })
            .setLngLat([wLon, wLat])
            .addTo(m);

          const nodeName = wp.installation_name || wp.place_name || wp.name || `Waypoint #${idx + 1}`;
          const popupNode = new window.tt.Popup({ offset: [0, 10], closeButton: false, className: 'map-endpoint-tooltip' })
            .setText(nodeName);
          nodeMarker.setPopup(popupNode);
          markersRef.current.push(nodeMarker);
        });
      }

      // Plot candidate fuel stations
      if (Array.isArray(fuelStations) && fuelStations.length > 0) {
        fuelStations.forEach((st) => {
          const sLat = Number(st.lat);
          const sLon = Number(st.lon);
          if (isNaN(sLat) || isNaN(sLon)) return;
          const isAuth = st.authorization_status === 'AUTHORIZED_MILITARY_DEPOT';
          const isSel = Boolean(st.isSelected);

          const el = document.createElement('div');
          el.className = 'vayu-fuel-marker';
          el.style.cssText = `
            width: ${isSel ? '22px' : '16px'};
            height: ${isSel ? '22px' : '16px'};
            border-radius: 50%;
            background: ${isAuth ? '#3B82F6' : '#94A3B8'};
            border: 2px solid ${isSel ? '#D4AF37' : '#FFFFFF'};
            box-shadow: 0 0 ${isSel ? '10px #D4AF37' : '4px rgba(0,0,0,0.6)'};
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${isSel ? '11px' : '9px'};
            color: white;
            transition: all 0.2s ease;
          `;
          el.innerHTML = isAuth ? '⚓' : '⛽';

          const fuelMarker = new window.tt.Marker({ element: el, anchor: 'center' })
            .setLngLat([sLon, sLat])
            .addTo(m);

          const popupFuel = new window.tt.Popup({ offset: [0, 10], closeButton: false, className: 'map-endpoint-tooltip' })
            .setText(`${st.station_name} (${isAuth ? 'Authorized Military Depot' : 'Civilian Retail'}) - Detour: ${st.detour_km} km`);
          fuelMarker.setPopup(popupFuel);
          markersRef.current.push(fuelMarker);
        });
      }
    } else {
      if (m.getSource('tactical-route')) {
        m.getSource('tactical-route').setData({ type: 'FeatureCollection', features: [] });
      }

      // Endpoint A (Origin) if provided without route geometry
      if (origin && origin.lat != null && (origin.lon != null || origin.lng != null)) {
        const originCoord = [Number(origin.lon != null ? origin.lon : origin.lng), Number(origin.lat)];
        const elA = document.createElement('div');
        elA.className = 'leaflet-pin-wrapper vayu-pin-marker';
        elA.innerHTML = '<span class="pin pin-o sm" aria-hidden="true">A</span>';
        const markerA = new window.tt.Marker({ element: elA, anchor: 'center' })
          .setLngLat(originCoord)
          .addTo(m);

        const origKey = `${originCoord[1].toFixed(4)},${originCoord[0].toFixed(4)}`;
        const origName = origin?.place_name || origin?.name || placeCoordMap.get(origKey) || 'Origin Node';
        const popupA = new window.tt.Popup({ offset: [0, 14], closeButton: false, className: 'map-endpoint-tooltip' })
          .setText(origName);
        markerA.setPopup(popupA);
        markerA.togglePopup();
        markersRef.current.push(markerA);

        bounds.extend(originCoord);
        hasPoints = true;
      }

      // Endpoint B (Destination) if provided without route geometry
      if (destination && destination.lat != null && (destination.lon != null || destination.lng != null)) {
        const destCoord = [Number(destination.lon != null ? destination.lon : destination.lng), Number(destination.lat)];
        const elB = document.createElement('div');
        elB.className = 'leaflet-pin-wrapper vayu-pin-marker';
        elB.innerHTML = '<span class="pin pin-d sm" aria-hidden="true">B</span>';
        const markerB = new window.tt.Marker({ element: elB, anchor: 'center' })
          .setLngLat(destCoord)
          .addTo(m);

        const destKey = `${destCoord[1].toFixed(4)},${destCoord[0].toFixed(4)}`;
        const destName = destination?.place_name || destination?.name || placeCoordMap.get(destKey) || 'Destination Node';
        const popupB = new window.tt.Popup({ offset: [0, 14], closeButton: false, className: 'map-endpoint-tooltip' })
          .setText(destName);
        markerB.setPopup(popupB);
        markerB.togglePopup();
        markersRef.current.push(markerB);

        bounds.extend(destCoord);
        hasPoints = true;
      }

      // Intermediate waypoints if provided
      if (Array.isArray(waypoints) && waypoints.length > 0) {
        waypoints.forEach((wp, idx) => {
          const wLat = Number(wp.lat);
          const wLon = Number(wp.lon != null ? wp.lon : wp.lng);
          if (isNaN(wLat) || isNaN(wLon)) return;

          const dot = document.createElement('div');
          dot.className = 'vayu-node-dot';
          dot.style.cursor = 'pointer';
          dot.title = `Checkpoint: ${wp.installation_name || wp.place_name || wp.name || `Waypoint #${idx + 1}`}`;
          dot.addEventListener('click', () => {
            if (typeof onSelectCheckpoint === 'function') {
              onSelectCheckpoint(wp);
            }
          });
          const nodeMarker = new window.tt.Marker({ element: dot, anchor: 'center' })
            .setLngLat([wLon, wLat])
            .addTo(m);

          const nodeName = wp.installation_name || wp.place_name || wp.name || `Waypoint #${idx + 1}`;
          const popupNode = new window.tt.Popup({ offset: [0, 10], closeButton: false, className: 'map-endpoint-tooltip' })
            .setText(nodeName);
          nodeMarker.setPopup(popupNode);
          markersRef.current.push(nodeMarker);

          bounds.extend([wLon, wLat]);
          hasPoints = true;
        });
      }

      // Only plot generic place dots if neither origin nor destination was specified
      if (!origin && !destination) {
        places.forEach((p) => {
          const lat = Number(p.lat != null ? p.lat : p.latitude);
          const lon = Number(p.lon != null ? p.lon : (p.lng != null ? p.lng : p.longitude));
          if (isNaN(lat) || isNaN(lon)) return;

          const dot = document.createElement('div');
          dot.className = 'vayu-node-dot';
          const marker = new window.tt.Marker({ element: dot, anchor: 'center' })
            .setLngLat([lon, lat])
            .addTo(m);

          const popup = new window.tt.Popup({ offset: [0, 10], closeButton: false, className: 'map-endpoint-tooltip' })
            .setText(p.place_name || p.name || 'Tactical Node');
          marker.setPopup(popup);

          bounds.extend([lon, lat]);
          hasPoints = true;
          markersRef.current.push(marker);
        });
      }
    }

    // 3. Render Active Navigation Segment Highlight (if selectedInstruction or highlightedSegment exists)
    let segCoords = [];
    if (highlightedSegment && highlightedSegment.coordinates && highlightedSegment.coordinates.length > 1) {
      segCoords = highlightedSegment.coordinates;
    } else if (Array.isArray(highlightedSegment) && highlightedSegment.length > 1) {
      segCoords = highlightedSegment;
    } else if (selectedInstruction && Array.isArray(selectedInstruction.segment) && selectedInstruction.segment.length > 1) {
      segCoords = selectedInstruction.segment;
    }

    const segGeojson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: segCoords
      }
    };

    if (m.getSource('tactical-segment-highlight')) {
      m.getSource('tactical-segment-highlight').setData(segCoords.length > 1 ? segGeojson : { type: 'FeatureCollection', features: [] });
    } else if (segCoords.length > 1) {
      m.addSource('tactical-segment-highlight', {
        type: 'geojson',
        data: segGeojson
      });

      m.addLayer({
        id: 'tactical-segment-casing',
        type: 'line',
        source: 'tactical-segment-highlight',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#05080F',
          'line-width': 10,
          'line-opacity': 0.85
        }
      });

      m.addLayer({
        id: 'tactical-segment-highlight',
        type: 'line',
        source: 'tactical-segment-highlight',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#00F0FF',
          'line-width': 6,
          'line-opacity': 1.0
        }
      });
    }

    // Active Maneuver Pin Marker
    if (selectedInstruction && selectedInstruction.lat != null && selectedInstruction.lon != null) {
      const insCoord = [Number(selectedInstruction.lon), Number(selectedInstruction.lat)];
      if (!isNaN(insCoord[0]) && !isNaN(insCoord[1])) {
        const elNav = document.createElement('div');
        elNav.className = 'vayu-active-maneuver-pin interactive';
        elNav.setAttribute('role', 'button');
        elNav.setAttribute('tabindex', '0');
        elNav.setAttribute('title', 'Click to advance to next turn instruction');
        elNav.innerHTML = `
          <div class="vayu-maneuver-pulse"></div>
          <div class="vayu-maneuver-badge">${selectedInstruction.stepNumber || selectedInstruction.id + 1}</div>
        `;
        elNav.onclick = (e) => {
          e.stopPropagation();
          handleMapNextInstruction();
        };

        const markerNav = new window.tt.Marker({ element: elNav, anchor: 'center' })
          .setLngLat(insCoord)
          .addTo(m);

        const stepMsg = selectedInstruction.message || 'Continue';
        const stepStreet = selectedInstruction.street ? `<div style="font-size: 10px; color: #8FA2B4; margin-top: 2px;">Road: ${selectedInstruction.street}</div>` : '';
        const stepDist = selectedInstruction.stepDistanceFormatted ? `<div style="font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #00E5A3; margin-top: 2px;">Leg: ${selectedInstruction.stepDistanceFormatted}</div>` : '';

        const navPopup = new window.tt.Popup({ offset: [0, 16], closeButton: false, className: 'map-endpoint-tooltip' })
          .setHTML(`
            <div style="font-family: 'Inter', sans-serif; font-size: 11px; color: #DBE1E9; line-height: 1.4; padding: 2px 4px;">
              <div style="font-weight: 700; color: #00F0FF; margin-bottom: 2px;">
                Step #${selectedInstruction.stepNumber || selectedInstruction.id + 1}: ${selectedInstruction.maneuver || 'MANEUVER'}
              </div>
              <div>${stepMsg}</div>
              ${stepStreet}
              ${stepDist}
              <div style="margin-top: 6px; display: flex; justify-content: flex-end;">
                <button id="vayu-popup-next-btn" style="background: rgba(0, 240, 255, 0.15); border: 1px solid #00F0FF; color: #00F0FF; border-radius: 4px; padding: 2px 8px; font-size: 10px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                  Next Step →
                </button>
              </div>
            </div>
          `);
        markerNav.setPopup(navPopup);
        markerNav.togglePopup();
        markersRef.current.push(markerNav);

        setTimeout(() => {
          const btn = document.getElementById('vayu-popup-next-btn');
          if (btn) {
            btn.onclick = (e) => {
              e.stopPropagation();
              handleMapNextInstruction();
            };
          }
        }, 50);
      }
    }

    // Checkpoint focus handling
    if (selectedCheckpoint && selectedCheckpoint.lat != null && (selectedCheckpoint.lon != null || selectedCheckpoint.lng != null)) {
      const cpCoord = [Number(selectedCheckpoint.lon != null ? selectedCheckpoint.lon : selectedCheckpoint.lng), Number(selectedCheckpoint.lat)];
      if (!isNaN(cpCoord[0]) && !isNaN(cpCoord[1])) {
        const cpName = selectedCheckpoint.place_name || selectedCheckpoint.name || selectedCheckpoint.id || 'Checkpoint';
        const elCp = document.createElement('div');
        elCp.className = 'vayu-active-cp-pin';
        elCp.innerHTML = `<span class="vayu-cp-pulse"></span><span class="vayu-cp-icon">✦</span>`;
        const markerCp = new window.tt.Marker({ element: elCp, anchor: 'center' })
          .setLngLat(cpCoord)
          .addTo(m);
        const popupCp = new window.tt.Popup({ offset: [0, 14], closeButton: false, className: 'map-endpoint-tooltip' })
          .setText(`Checkpoint: ${cpName}`);
        markerCp.setPopup(popupCp);
        markerCp.togglePopup();
        markersRef.current.push(markerCp);
      }
    }

    // Camera framing based on cameraMode and selected items
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (selectedInstruction && selectedInstruction.lat != null && selectedInstruction.lon != null && !isUserInteractingRef.current) {
      const insCoord = [Number(selectedInstruction.lon), Number(selectedInstruction.lat)];
      if (!isNaN(insCoord[0]) && !isNaN(insCoord[1])) {
        if (segCoords.length > 2) {
          const segBounds = new window.tt.LngLatBounds();
          segCoords.forEach((c) => segBounds.extend(c));
          if (prefersReducedMotion) {
            m.fitBounds(segBounds, { padding: 90, maxZoom: 14.5 });
          } else {
            m.fitBounds(segBounds, { padding: 90, maxZoom: 14.5, duration: 600 });
          }
        } else {
          if (prefersReducedMotion) {
            m.jumpTo({ center: insCoord, zoom: 13.5 });
          } else {
            m.flyTo({ center: insCoord, zoom: 13.5, duration: 600 });
          }
        }
        return;
      }
    }

    if (selectedCheckpoint && selectedCheckpoint.lat != null && !isUserInteractingRef.current) {
      const cpCoord = [Number(selectedCheckpoint.lon != null ? selectedCheckpoint.lon : selectedCheckpoint.lng), Number(selectedCheckpoint.lat)];
      if (!isNaN(cpCoord[0]) && !isNaN(cpCoord[1])) {
        if (prefersReducedMotion) {
          m.jumpTo({ center: cpCoord, zoom: 13 });
        } else {
          m.flyTo({ center: cpCoord, zoom: 13, duration: 600 });
        }
        return;
      }
    }

    if (cameraMode === 'navigation') {
      if (hasPoints) {
        const navPadding = {
          top: 130,   // Clearance below Top Navigation HUD Card
          bottom: 50, // Clearance above Bottom strip / legend
          left: 50,
          right: 50
        };
        if (prefersReducedMotion) {
          m.fitBounds(bounds, { padding: navPadding, maxZoom: 11 });
        } else {
          m.fitBounds(bounds, { padding: navPadding, maxZoom: 11, duration: 1000 });
        }
      } else if (center) {
        m.jumpTo({ center: [Number(center[1]), Number(center[0])], zoom: 9 });
      }
    } else if (cameraMode === 'focus' && focusCoord && !isNaN(Number(focusCoord[0])) && !isNaN(Number(focusCoord[1]))) {
      // focusCoord can be [lat, lon] or [lon, lat]. Normalize to [lon, lat] for TomTom
      const ptLon = Number(focusCoord[1] > 60 ? focusCoord[1] : focusCoord[0]); // India lon is 68-98, lat 8-38
      const ptLat = Number(focusCoord[0] < 45 ? focusCoord[0] : focusCoord[1]);
      const targetCenter = [ptLon, ptLat];
      if (prefersReducedMotion) {
        m.jumpTo({ center: targetCenter, zoom: 12.5 });
      } else {
        m.flyTo({ center: targetCenter, zoom: 12.5, duration: 800 });
      }
    } else if (cameraMode === 'overview' || !cameraMode) {
      if (center && (!routeCoords || routeCoords.length === 0) && !origin && !destination) {
        if (prefersReducedMotion) {
          m.jumpTo({ center: [Number(center[1]), Number(center[0])], zoom: 9 });
        } else {
          m.flyTo({ center: [Number(center[1]), Number(center[0])], zoom: 9 });
        }
      } else if (hasPoints) {
        if (prefersReducedMotion) {
          m.fitBounds(bounds, { padding: 48, maxZoom: 9 });
        } else {
          m.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 800 });
        }
      } else {
        if (prefersReducedMotion) {
          m.jumpTo({ center: INITIAL_VIEW.center, zoom: INITIAL_VIEW.zoom });
        } else {
          m.flyTo({ center: INITIAL_VIEW.center, zoom: INITIAL_VIEW.zoom });
        }
      }
    }
    // If cameraMode === 'free', do not override the user's manual pan/zoom position!
  }, [places, route, routeGeometry, alternativeGeometries, waypoints, fuelStations, origin, destination, center, cameraMode, focusCoord, selectedInstruction, highlightedSegment, selectedCheckpoint, onSelectCheckpoint, handleMapNextInstruction]);

  useEffect(() => {
    if (mapRef.current && mapLoadedRef.current) {
      updateMapData(mapRef.current);
    }
  }, [places, route, routeGeometry, alternativeGeometries, waypoints, fuelStations, origin, destination, center, cameraMode, focusCoord, selectedInstruction, highlightedSegment, selectedCheckpoint, onSelectCheckpoint, updateMapData]);

  // Handle runtime theme switches
  useEffect(() => {
    const handleTheme = () => {
      if (mapRef.current && apiKey && typeof mapRef.current.setStyle === 'function') {
        try {
          const newStyle = buildTomTomStyle(apiKey);
          if (newStyle) {
            mapRef.current.setStyle(newStyle);
            mapRef.current.once('style.load', () => {
              if (mapRef.current) {
                updateMapData(mapRef.current);
              }
            });
          }
        } catch (e) {
          console.warn('MapView style switch notice:', e);
        }
      }
    };
    window.addEventListener('vayu_theme_changed', handleTheme);
    return () => window.removeEventListener('vayu_theme_changed', handleTheme);
  }, [apiKey, updateMapData]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        className="map"
        role="region"
        aria-label="Tactical Route Assessment Map"
      />

      {/* In-built Turn Navigation HUD Arrow Controls on Map */}
      {Array.isArray(instructions) && instructions.length > 0 && (
        <div className="vayu-map-nav-hud" role="region" aria-label="Turn Navigation Controls">
          <button
            type="button"
            className="vayu-map-hud-arrow-btn prev"
            onClick={handleMapPrevInstruction}
            title="Previous Step (← in-built arrow)"
            aria-label="Previous navigation step"
            disabled={currentInstructionIdx <= 0}
          >
            <ChevronLeft size={16} />
          </button>

          <div
            className="vayu-map-hud-content"
            onClick={currentInstructionIdx >= 0 ? undefined : handleMapNextInstruction}
            title={currentInstructionIdx >= 0 ? 'Active Navigation Step' : 'Click arrow to start turn-by-turn guidance'}
          >
            <div className="vayu-map-hud-row-top">
              <span className="vayu-map-hud-badge">
                {currentInstructionIdx >= 0
                  ? `STEP ${selectedInstruction?.stepNumber || currentInstructionIdx + 1} / ${instructions.length}`
                  : `DIRECTIONS (${instructions.length})`}
              </span>
              {selectedInstruction?.maneuver && (
                <span className="vayu-map-hud-maneuver">
                  {selectedInstruction.maneuver.replace('_', ' ')}
                </span>
              )}
            </div>
            <div className="vayu-map-hud-message">
              {selectedInstruction?.message || 'Click in-built arrow to start turn guidance'}
            </div>
            {(selectedInstruction?.stepDistanceFormatted || selectedInstruction?.street) && (
              <div className="vayu-map-hud-sub">
                {selectedInstruction.stepDistanceFormatted && (
                  <span style={{ color: '#00E5A3', fontWeight: 600 }}>
                    {selectedInstruction.stepDistanceFormatted}
                  </span>
                )}
                {selectedInstruction.street && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    • {selectedInstruction.street}
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className="vayu-map-hud-arrow-btn next"
            onClick={handleMapNextInstruction}
            title="Next Step (→ in-built arrow)"
            aria-label="Next navigation step"
            disabled={currentInstructionIdx >= instructions.length - 1 && currentInstructionIdx !== -1}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Tactical Map Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          zIndex: 10,
          background: 'var(--panel-bg)',
          opacity: 0.94,
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 10.5,
          fontFamily: "'Share Tech Mono', monospace",
          color: 'var(--text-main)',
          pointerEvents: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 14,
              height: 3,
              background: routeGeometry ? '#00E5A3' : '#668CA0',
              borderTop: routeGeometry ? 'none' : '2px dashed #668CA0',
              borderRadius: 2
            }}
          />
          <span style={{ color: routeGeometry ? 'var(--text-main)' : 'var(--text-muted)' }}>
            {routeGeometry
              ? 'Selected Corridor (Road Network)'
              : 'Corridor Link (Road Geometry Unavailable)'}
          </span>
        </div>
        {alternativeGeometries && alternativeGeometries.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2, borderTop: '2px dashed #FFB84D' }} />
            <span style={{ color: 'var(--warn)' }}>Tactical Alternative</span>
          </div>
        )}
        {selectedInstruction && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 3, background: '#00F0FF', borderRadius: 2 }} />
            <span style={{ color: '#00F0FF', fontWeight: 600 }}>Active Navigation Step</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="pin pin-o sm" style={{ transform: 'scale(0.8)' }}>A</span>
          <span>Origin</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="pin pin-d sm" style={{ transform: 'scale(0.8)' }}>B</span>
          <span>Destination</span>
        </div>
        {fuelStations && fuelStations.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6' }} />
            <span style={{ color: 'var(--text-main)' }}>Refuelling Depot</span>
          </div>
        )}
      </div>
    </div>
  );
}
