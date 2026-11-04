import React, { useMemo } from 'react';
import { Mountain } from 'lucide-react';

/**
 * Extracts genuine elevation samples from route telemetry if present.
 * Returns an array of { dist: number, ele: number, label?: string } or null.
 */
function extractElevationSamples(route) {
  if (!route) return null;

  // 1. Direct elevation_profile on route or selected_route
  const profile = route.elevation_profile ||
                  route.elevationProfile ||
                  route.selected_route?.elevation_profile ||
                  route.selected_route?.elevationProfile;

  if (Array.isArray(profile) && profile.length >= 2) {
    const valid = profile.map((p, idx) => {
      const dist = Number(p.distance_km ?? p.distance ?? p.dist ?? p[0]);
      const ele = Number(p.elevation_m ?? p.elevation ?? p.alt ?? p.altitude ?? p[1]);
      const label = p.name || p.label || p.waypoint || (idx === 0 ? 'Origin' : idx === profile.length - 1 ? 'Destination' : null);
      return { dist, ele, label };
    }).filter(p => !isNaN(p.dist) && !isNaN(p.ele));

    if (valid.length >= 2) return valid;
  }

  // 2. 3D coordinates in GeoJSON LineString [lon, lat, ele]
  const coords = route.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2 && coords[0]?.length >= 3) {
    let cumulativeDist = 0;
    const samples = [];
    let hasNonZeroEle = false;

    for (let i = 0; i < coords.length; i++) {
      const [lon, lat, ele] = coords[i];
      if (i > 0) {
        // Approximate distance between coordinates in km
        const prevLat = coords[i - 1][1];
        const prevLon = coords[i - 1][0];
        const dLat = (lat - prevLat) * (Math.PI / 180);
        const dLon = (lon - prevLon) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(prevLat * (Math.PI / 180)) * Math.cos(lat * (Math.PI / 180)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        cumulativeDist += 6371 * c;
      }

      const numEle = Number(ele);
      if (!isNaN(numEle) && numEle !== 0) {
        hasNonZeroEle = true;
      }
      samples.push({ dist: cumulativeDist, ele: numEle || 0 });
    }

    if (hasNonZeroEle && samples.length >= 2) {
      return samples;
    }
  }

  return null;
}

/**
 * Computes a smooth cubic Bézier spline SVG path string through points.
 */
function buildSmoothPath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return d;
}

/**
 * ElevationProfile Component
 * Renders an elevation-profile graph matching the Journey Planning design reference.
 * If genuine elevation data is unavailable, displays the mandated clean empty state.
 */
export default function ElevationProfile({ route, status = 'idle', routeName = 'Route 1' }) {
  const samples = useMemo(() => extractElevationSamples(route), [route]);

  // Derived title badge
  const routeLabel = route?.selected_route?.mode_name
    ? `(${route.selected_route.mode_name})`
    : routeName
    ? `(${routeName})`
    : '';

  const routeDistance = route?.distanceKm || route?.selected_route?.distance_km;

  // Chart layout calculations when samples exist
  const chartData = useMemo(() => {
    if (!samples || samples.length < 2) return null;

    const width = 640;
    const height = 160;
    const padding = { top: 24, right: 36, bottom: 26, left: 60 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const maxDist = Math.max(...samples.map(s => s.dist), 1);
    const rawMinEle = Math.min(...samples.map(s => s.ele));
    const rawMaxEle = Math.max(...samples.map(s => s.ele));

    // Nice round bounds
    const minEle = Math.floor(rawMinEle / 500) * 500;
    const maxEle = Math.max(Math.ceil(rawMaxEle / 500) * 500, minEle + 1000);
    const eleRange = maxEle - minEle;

    // Y ticks (4 evenly spaced levels)
    const yTicks = [
      minEle,
      minEle + Math.round(eleRange * 0.33),
      minEle + Math.round(eleRange * 0.66),
      maxEle
    ];

    // X ticks (5 evenly spaced distance marks)
    const xTicks = [
      0,
      Math.round(maxDist * 0.25),
      Math.round(maxDist * 0.5),
      Math.round(maxDist * 0.75),
      Math.round(maxDist)
    ];

    // Map samples to screen pixel coordinates
    const pixelPoints = samples.map(s => {
      const x = padding.left + (s.dist / maxDist) * plotW;
      const y = padding.top + plotH - ((s.ele - minEle) / eleRange) * plotH;
      return { x, y, dist: s.dist, ele: s.ele, label: s.label };
    });

    const linePath = buildSmoothPath(pixelPoints);
    const firstX = pixelPoints[0].x;
    const lastX = pixelPoints[pixelPoints.length - 1].x;
    const bottomY = padding.top + plotH;
    const areaPath = `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

    return {
      width,
      height,
      padding,
      plotW,
      plotH,
      minEle,
      maxEle,
      yTicks,
      xTicks,
      pixelPoints,
      linePath,
      areaPath,
      bottomY
    };
  }, [samples]);

  return (
    <section className="card elevation-profile-card" aria-label="Elevation Profile">
      <div className="elevation-profile-header">
        <h2 className="elevation-profile-title">
          <Mountain size={15} style={{ color: 'var(--color-primary)' }} />
          <span>Elevation Profile {routeLabel}</span>
        </h2>
        {routeDistance && (
          <span className="elevation-profile-badge">{routeDistance} km</span>
        )}
      </div>

      {/* Case 1: Genuine elevation data available -> Plot SVG graph */}
      {status === 'ready' && chartData && (
        <div className="elevation-profile-chart-wrap">
          <svg
            viewBox={`0 0 ${chartData.width} ${chartData.height}`}
            className="elevation-profile-svg"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="elevationGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#0284C7" stopOpacity="0.32" />
                <stop offset="70%" stopColor="#0284C7" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#0284C7" stopOpacity="0.00" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines & Y-Axis Labels (Elevation in metres) */}
            {chartData.yTicks.map((val) => {
              const y = chartData.padding.top + chartData.plotH -
                ((val - chartData.minEle) / (chartData.maxEle - chartData.minEle)) * chartData.plotH;

              return (
                <g key={`y-${val}`} className="elevation-grid-row">
                  <line
                    x1={chartData.padding.left}
                    y1={y}
                    x2={chartData.width - chartData.padding.right}
                    y2={y}
                    className="elevation-gridline"
                  />
                  <text
                    x={chartData.padding.left - 8}
                    y={y + 3.5}
                    className="elevation-axis-label y-axis"
                    textAnchor="end"
                  >
                    {val.toLocaleString()} m
                  </text>
                </g>
              );
            })}

            {/* X-Axis Labels (Distance in kilometres) */}
            {chartData.xTicks.map((distVal) => {
              const maxDist = chartData.xTicks[chartData.xTicks.length - 1] || 1;
              const x = chartData.padding.left + (distVal / maxDist) * chartData.plotW;

              return (
                <text
                  key={`x-${distVal}`}
                  x={x}
                  y={chartData.height - 6}
                  className="elevation-axis-label x-axis"
                  textAnchor="middle"
                >
                  {distVal} km
                </text>
              );
            })}

            {/* Light blue shaded area beneath the line */}
            <path
              d={chartData.areaPath}
              fill="url(#elevationGrad)"
            />

            {/* Smooth blue elevation line */}
            <path
              d={chartData.linePath}
              fill="none"
              stroke="#0284C7"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Key Waypoint Pins & Callouts */}
            {chartData.pixelPoints.map((pt, idx) => {
              if (!pt.label) return null;
              return (
                <g key={`pt-${idx}`} className="elevation-waypoint-pin">
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={3.5}
                    fill="#0284C7"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                  <text
                    x={pt.x}
                    y={pt.y - 8}
                    className="elevation-waypoint-text"
                    textAnchor="middle"
                  >
                    {pt.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Case 2: Route is ready, but genuine elevation data is unavailable -> Mandated Empty State */}
      {status === 'ready' && !chartData && (
        <div className="elevation-profile-empty">
          <Mountain size={26} className="elevation-profile-empty-icon" />
          <p className="elevation-profile-empty-text">
            Elevation data unavailable for this route.
          </p>
          <p className="elevation-profile-empty-sub">
            The corridor navigation telemetry for this route does not provide 3D terrain elevation samples.
          </p>
        </div>
      )}

      {/* Case 3: Route is calculating -> Loading state */}
      {status === 'loading' && (
        <div className="elevation-profile-empty">
          <span className="preview-pulse-dot" />
          <p className="elevation-profile-empty-text" style={{ fontWeight: 500 }}>
            Evaluating corridor elevation profile…
          </p>
        </div>
      )}

      {/* Case 4: Idle state -> Prompt user to select nodes */}
      {status === 'idle' && (
        <div className="elevation-profile-empty">
          <Mountain size={26} className="elevation-profile-empty-icon" />
          <p className="elevation-profile-empty-text" style={{ fontWeight: 500, color: 'var(--text-subtle)' }}>
            Select origin and destination nodes to view corridor elevation profile.
          </p>
        </div>
      )}

      {/* Case 5: Error state */}
      {status === 'error' && (
        <div className="elevation-profile-empty">
          <p className="elevation-profile-empty-text" style={{ color: 'var(--text-subtle)' }}>
            Elevation profile unavailable while route calculation is pending.
          </p>
        </div>
      )}
    </section>
  );
}
