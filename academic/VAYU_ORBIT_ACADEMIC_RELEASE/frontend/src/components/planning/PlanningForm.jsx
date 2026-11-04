import React from 'react';
import EndpointSelector from './EndpointSelector';
import DepartureScheduler from './DepartureScheduler';

export default function PlanningForm({
  draft,
  errors = {},
  dirty = false,
  places = [],
  minDate = '',
  setField,
  touch,
  onSubmit,
  onReset,
  loading = false
}) {
  return (
    <form className="card planning-form" onSubmit={onSubmit} noValidate>
      <h2 className="form-section-title" style={{ fontSize: 14 }}>Corridor Endpoints & Schedule</h2>

      <EndpointSelector
        id="origin-node"
        label="Origin Node"
        value={draft.originId}
        places={places}
        excludeId={draft.destinationId}
        error={errors.originId}
        kind="origin"
        onChange={(v) => setField('originId', v)}
        onBlur={() => touch('originId')}
        disabled={loading}
      />

      <EndpointSelector
        id="destination-node"
        label="Destination Node"
        value={draft.destinationId}
        places={places}
        excludeId={draft.originId}
        error={errors.destinationId}
        kind="destination"
        onChange={(v) => setField('destinationId', v)}
        onBlur={() => touch('destinationId')}
        disabled={loading}
      />

      <DepartureScheduler
        date={draft.date}
        time={draft.time}
        minDate={minDate}
        errors={errors}
        onDate={(v) => setField('date', v)}
        onTime={(v) => setField('time', v)}
        onBlur={touch}
      />

      <div className="form-actions">
        <button
          type="submit"
          className="btn primary"
          disabled={loading}
        >
          {loading ? 'Assessing Corridor…' : 'Continue to Convoy Builder →'}
        </button>
        {dirty && (
          <button
            type="button"
            className="btn"
            onClick={onReset}
            disabled={loading}
          >
            Reset Draft
          </button>
        )}
      </div>
    </form>
  );
}
