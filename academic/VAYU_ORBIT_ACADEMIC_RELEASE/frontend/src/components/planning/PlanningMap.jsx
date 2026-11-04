import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createEndpointElement } from './EndpointMarker';

const INITIAL_VIEW = { center: [78.9, 23.5], zoom: 5 };

/**
 * Props:
 *  origin, destination : { lat, lng/lon, name/place_name, code } | null
 *  routeGeometry       : GeoJSON LineString | null
 */
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

export default function PlanningMap({ origin = null, destination = null, routeGeometry = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const markersRef = useRef([]);
  const [tileError, setTileError] = useState(false);
  const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;

  const retryTiles = useCallback(() => {
    setTileError(false);
    if (mapRef.current) {
      mapRef.current.resize();
    }
  }, []);

  // Initialize TomTom Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!window.tt || typeof window.tt.map !== 'function') {
      console.warn('TomTom SDK not yet loaded on window.tt');
      return;
    }

    const currentStyle = buildTomTomStyle(apiKey);

    const m = window.tt.map({
      key: apiKey || 'NO_KEY',
      container: containerRef.current,
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      style: currentStyle,
      dragPan: true
    });

    m.addControl(new window.tt.NavigationControl({ showCompass: false }), 'top-right');

    m.on('load', () => {
      mapLoadedRef.current = true;
      setTileError(false);
      updateMapElements(m);
    });

    let failedCount = 0;
    m.on('error', (e) => {
      console.warn('TomTom Map notice/error:', e);
      failedCount += 1;
      if (failedCount >= 4) {
        setTileError(true);
      }
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

  // Synchronize markers, labels, route polyline, and camera bounds
  const updateMapElements = useCallback((m) => {
    if (!m || !mapLoadedRef.current) return;

    // Clear existing markers & popups
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const boundsPoints = [];
    const endpoints = [
      [origin, 'origin'],
      [destination, 'destination']
    ];

    endpoints.forEach(([p, kind]) => {
      if (!p) return;
      const lat = Number(p.lat != null ? p.lat : p.latitude);
      const lng = Number(p.lng != null ? p.lng : (p.lon != null ? p.lon : p.longitude));
      if (isNaN(lat) || isNaN(lng)) return;

      const markerEl = createEndpointElement(kind);
      const marker = new window.tt.Marker({ element: markerEl, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(m);

      const labelText = p.name || p.place_name || (kind === 'origin' ? 'Origin' : 'Destination');
      const popup = new window.tt.Popup({
        offset: [0, 18],
        closeButton: false,
        closeOnClick: false,
        className: 'map-endpoint-tooltip'
      }).setText(labelText);

      marker.setPopup(popup);
      marker.togglePopup();
      markersRef.current.push(marker);
      boundsPoints.push([lng, lat]);
    });

    // Update Route Line
    if (routeGeometry) {
      try {
        if (m.getSource('route')) {
          m.getSource('route').setData(routeGeometry);
        } else {
          m.addSource('route', {
            type: 'geojson',
            data: routeGeometry
          });
          m.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#668CA0',
              'line-width': 5,
              'line-opacity': 0.95
            }
          });
        }

        if (routeGeometry.coordinates && routeGeometry.coordinates.length > 0) {
          const b = new window.tt.LngLatBounds();
          routeGeometry.coordinates.forEach((coord) => b.extend(coord));
          m.fitBounds(b, { padding: 48, maxZoom: 10 });
        }
      } catch (err) {
        console.warn('Failed to parse or render route geometry:', err);
        if (boundsPoints.length === 2) {
          const b = new window.tt.LngLatBounds();
          boundsPoints.forEach((coord) => b.extend(coord));
          m.fitBounds(b, { padding: 64, maxZoom: 8 });
        }
      }
    } else {
      if (m.getSource('route')) {
        m.getSource('route').setData({ type: 'FeatureCollection', features: [] });
      }

      if (boundsPoints.length === 2) {
        const b = new window.tt.LngLatBounds();
        boundsPoints.forEach((coord) => b.extend(coord));
        m.fitBounds(b, { padding: 64, maxZoom: 8 });
      } else if (boundsPoints.length === 1) {
        m.flyTo({ center: boundsPoints[0], zoom: 8 });
      } else {
        m.flyTo({ center: INITIAL_VIEW.center, zoom: INITIAL_VIEW.zoom });
      }
    }
  }, [origin, destination, routeGeometry]);

  // Trigger update when endpoints or route geometry change
  useEffect(() => {
    if (mapRef.current && mapLoadedRef.current) {
      updateMapElements(mapRef.current);
    }
  }, [origin, destination, routeGeometry, updateMapElements]);

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
                updateMapElements(mapRef.current);
              }
            });
          }
        } catch (e) {
          console.warn('PlanningMap style switch notice:', e);
        }
      }
    };
    window.addEventListener('vayu_theme_changed', handleTheme);
    return () => window.removeEventListener('vayu_theme_changed', handleTheme);
  }, [apiKey, updateMapElements]);

  return (
    <div className="planning-map-wrapper">
      <div
        ref={containerRef}
        className="planning-map-canvas"
        role="region"
        aria-label="Map displaying selected origin and destination military nodes"
      />
      {tileError && (
        <div className="map-tile-error" role="status">
          <div className="tile-err-msg">
            <strong>TomTom tiles unavailable</strong>
            <span>Unable to load map tiles. Selected military endpoints remain plotted.</span>
          </div>
          <button type="button" className="btn btn-sm" onClick={retryTiles}>Retry Map</button>
        </div>
      )}
      <div className="planning-map-legend" aria-label="Map legend">
        <span className="legend-item">
          <i className="pin pin-o sm">A</i> Origin Node
        </span>
        <span className="legend-item">
          <i className="pin pin-d sm">B</i> Destination Node
        </span>
        <span className="legend-item">
          <i className="legend-swatch" /> Road corridor (when available)
        </span>
      </div>
    </div>
  );
}
