import React, { useEffect, useMemo, useRef, useState } from 'react';

const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * Modern Searchable Endpoint Combobox Selector with A/B tactical badge,
 * real-time search across 116+ nodes, keyboard navigation, upward flip,
 * and mobile bottom-sheet modal.
 *
 * Props:
 *  id         : string ('origin-node' | 'destination-node')
 *  label      : string ('Origin Node' | 'Destination Node')
 *  value      : string (place id)
 *  places     : array [{ id, place_id, name, code, region, lat, lng }]
 *  excludeId  : string (id to exclude, preventing identical endpoints)
 *  error      : string (validation error)
 *  onChange   : (id) => void
 *  onBlur     : () => void
 *  disabled   : boolean
 *  kind       : 'origin' | 'destination' (optional, derived from id if omitted)
 */
export default function EndpointSelector({
  id,
  label,
  value,
  places = [],
  excludeId = '',
  error = '',
  onChange,
  onBlur,
  disabled = false,
  kind
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [upward, setUpward] = useState(false);

  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const triggerId = `${id}-trigger`;
  const listId = `${id}-list`;
  const effectiveKind = kind || (String(id).toLowerCase().includes('origin') ? 'origin' : 'destination');
  const badge = effectiveKind === 'origin' ? ['pin-o', 'A'] : ['pin-d', 'B'];

  // Exclude the other selected endpoint
  const options = useMemo(() => {
    return places.filter((p) => p && p.id !== excludeId);
  }, [places, excludeId]);

  // Selected place object
  const selected = useMemo(() => {
    return places.find((p) => p && p.id === value) || null;
  }, [places, value]);

  // Search filtering matching name, code, place_id, and region
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((p) => {
      const name = String(p?.name || '').toLowerCase();
      const code = String(p?.code || p?.place_id || p?.id || '').toLowerCase();
      const region = String(p?.region || '').toLowerCase();
      return name.includes(s) || code.includes(s) || region.includes(s);
    });
  }, [q, options]);

  // Check viewport space when opened to determine upward flip
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setUpward(spaceBelow < 320 && spaceAbove > spaceBelow);
  }, [open]);

  // Sync active index to current selection or first result
  useEffect(() => {
    if (!open) return;
    const idx = results.findIndex((p) => p.id === value);
    setActive(idx >= 0 ? idx : 0);
  }, [open, results, value]);

  // Keep active keyboard option scrolled into view
  useEffect(() => {
    if (open && listRef.current?.children[active]) {
      listRef.current.children[active].scrollIntoView({ block: 'nearest' });
    }
  }, [active, open]);

  // Handle outside click and Escape dismissal
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQ('');
        onBlur?.();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        setQ('');
        triggerRef.current?.focus();
        onBlur?.();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onBlur]);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setQ('');
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleSelect = (placeId) => {
    onChange?.(placeId);
    setOpen(false);
    setQ('');
    triggerRef.current?.focus();
  };

  const onSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(results.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) {
        handleSelect(results[active].id);
      }
    }
  };

  return (
    <div className={`field combo-field ${open ? 'picker-open' : ''}`} ref={containerRef}>
      <label htmlFor={triggerId} id={`${id}-lbl`} className="field-label">
        {label}
      </label>

      <div className="picker-trigger-wrap">
        <button
          type="button"
          id={triggerId}
          ref={triggerRef}
          disabled={disabled}
          className={`picker-trigger ${open ? 'open' : ''} ${error ? 'err-field' : ''}`}
          onClick={() => (open ? setOpen(false) : handleOpen())}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${id}-lbl ${id}-val`}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        >
          <span id={`${id}-val`} className="trigger-val-container">
            {selected ? (
              <span className="sel">
                <i className={`pin ${badge[0]} sm`}>{badge[1]}</i>
                <span className="sel-name">{selected.name}</span>
                <span className="combo-code">{selected.place_id || selected.code || selected.id}</span>
              </span>
            ) : (
              <span className="trigger-ph">Select {label.toLowerCase()}…</span>
            )}
          </span>
          <span className="picker-chevron" aria-hidden="true">
            <Chevron />
          </span>
        </button>
      </div>

      {open && (
        <>
          <div
            className="combo-backdrop"
            aria-hidden="true"
            onClick={() => {
              setOpen(false);
              setQ('');
              onBlur?.();
            }}
          />

          <div
            className={`combo-popover ${upward ? 'pop-up' : 'pop-down'} pop-sheet`}
            role="dialog"
            aria-label={`${label} selector`}
          >
            <div className="combo-search-wrap">
              <span className="combo-search-icon" aria-hidden="true">
                <SearchIcon />
              </span>
              <input
                ref={inputRef}
                className="combo-search"
                type="text"
                autoComplete="off"
                spellCheck="false"
                placeholder={`Search ${label.toLowerCase()} by name, code or region…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onSearchKeyDown}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-label={`Search ${label.toLowerCase()}`}
                aria-activedescendant={results[active] ? `${id}-opt-${results[active].id}` : undefined}
              />
              {q && (
                <button
                  type="button"
                  className="combo-search-clear"
                  onClick={() => {
                    setQ('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <CloseIcon />
                </button>
              )}
            </div>

            <ul id={listId} ref={listRef} role="listbox" aria-label={label} className="combo-list">
              {results.map((p, i) => {
                const isSelected = p.id === value;
                const isActive = i === active;
                return (
                  <li
                    key={p.id}
                    id={`${id}-opt-${p.id}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`combo-opt ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                    onMouseMove={() => setActive(i)}
                    onClick={() => handleSelect(p.id)}
                  >
                    <span className="combo-name">{p.name}</span>
                    <div className="combo-meta">
                      {p.region && <span className="combo-sub">{p.region}</span>}
                      <span className="combo-code">{p.place_id || p.code || p.id}</span>
                      {isSelected && <span className="combo-check" aria-hidden="true">✓</span>}
                    </div>
                  </li>
                );
              })}
              {results.length === 0 && (
                <li className="combo-empty" role="presentation">
                  No places match “{q}”.
                </li>
              )}
            </ul>

            <div className="combo-footer">
              <span className="combo-count">
                {results.length} {results.length === 1 ? 'place' : 'places'}
              </span>
              <button
                type="button"
                className="combo-close-btn"
                onClick={() => {
                  setOpen(false);
                  setQ('');
                  triggerRef.current?.focus();
                  onBlur?.();
                }}
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <p className="field-err" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
