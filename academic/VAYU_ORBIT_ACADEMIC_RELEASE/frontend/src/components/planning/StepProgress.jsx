import React from 'react';

const STEP_LABELS = [
  'Corridor & Schedule',
  'Convoy Manifest',
  'Route Assessment',
  'Pre-Commit Review',
  'Mission Operations'
];

export default function StepProgress({ current = 1, total = 5 }) {
  const currentLabel = STEP_LABELS[current - 1] || `Step ${current}`;
  return (
    <div className="planning-progress" role="img" aria-label={`Step ${current} of ${total}: ${currentLabel}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="planning-progress-label">STEP {current} OF {total}</span>
        <span style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: 'var(--text-muted)' }}>
          {currentLabel}
        </span>
      </div>
      <div className="planning-progress-bars">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`progress-pip ${i < current ? 'on' : ''} ${i < current - 1 ? 'done' : ''}`}
            title={`Step ${i + 1}: ${STEP_LABELS[i] || ''}`}
          />
        ))}
      </div>
    </div>
  );
}
