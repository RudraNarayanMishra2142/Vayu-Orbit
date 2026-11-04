import React, { useState, useRef, useEffect } from 'react';

const pad = (n) => String(n).padStart(2, '0');

const getTodayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const getCurrentTimeStr = () => {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DOWS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// ── Custom Accessible Date Picker ─────────────────────────────────
function DatePicker({ date, min, error, onDate, onBlur }) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const dateId = 'departure-date';

  // Parse current date or default to today
  const parsed = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').map(Number) : null;
  const today = getTodayStr().split('-').map(Number);

  const [viewYear, setViewYear] = useState(parsed ? parsed[0] : today[0]);
  const [viewMonth, setViewMonth] = useState(parsed ? parsed[1] - 1 : today[1] - 1);

  // Sync view when date changes externally (e.g. form reset)
  useEffect(() => {
    if (parsed) {
      setViewYear(parsed[0]);
      setViewMonth(parsed[1] - 1);
    }
  }, [date]);

  // Flip upward if space below is limited
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setUpward(spaceBelow < 340 && spaceAbove > spaceBelow);
  }, [open]);

  // Outside click and Escape to close
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        onBlur?.('date');
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        onBlur?.('date');
      }
    };
    document.addEventListener('pointerdown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onBlur]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelect = (day) => {
    const dStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    onDate(dStr);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const selectToday = () => {
    const todayStr = getTodayStr();
    if (!min || todayStr >= min) {
      onDate(todayStr);
      setViewYear(today[0]);
      setViewMonth(today[1] - 1);
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const clearDate = () => {
    onDate('');
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Calendar grid calculations (Monday-first)
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = getTodayStr();

  // Year options (+5 years)
  const baseYear = today[0];
  const yearOptions = Array.from({ length: 6 }, (_, i) => baseYear + i);

  return (
    <div className={`field custom-picker-field ${open ? 'picker-open' : ''}`} ref={containerRef}>
      <label htmlFor={dateId} id={`${dateId}-lbl`} className="field-label">
        Departure Date
      </label>
      <div className="picker-trigger-wrap">
        <button
          type="button"
          id={dateId}
          data-id="dep-date"
          ref={triggerRef}
          className={`picker-trigger ${open ? 'open' : ''} ${error ? 'err-field' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={`${dateId}-lbl ${dateId}-val`}
          aria-invalid={!!error}
          aria-describedby={error ? `${dateId}-err` : undefined}
        >
          <span className="picker-trigger-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </span>
          <span id={`${dateId}-val`} className={date ? 'trigger-val' : 'trigger-ph'}>
            {date || 'Select date (YYYY-MM-DD)'}
          </span>
          <span className="picker-chevron" aria-hidden="true">&#x25BE;</span>
        </button>
      </div>

      {open && (
        <div
          className={`calendar-popover ${upward ? 'pop-up' : 'pop-down'}`}
          role="dialog"
          aria-modal="true"
          aria-label="Departure date picker"
        >
          <div className="cal-head">
            <button
              type="button"
              className="cal-nav-btn"
              onClick={prevMonth}
              aria-label="Previous month"
            >
              &#x25C2;
            </button>
            <div className="cal-title-group">
              <select
                aria-label="Month"
                className="cal-select month-select"
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
              <select
                aria-label="Year"
                className="cal-select year-select"
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="cal-nav-btn"
              onClick={nextMonth}
              aria-label="Next month"
            >
              &#x25B8;
            </button>
          </div>

          <div className="cal-grid" role="grid" aria-readonly="true">
            {DOWS.map((dow) => (
              <div key={dow} className="cal-dow" role="columnheader">
                {dow}
              </div>
            ))}
            {Array.from({ length: firstDow }, (_, i) => (
              <div key={`blank-${i}`} className="cal-cell empty" aria-hidden="true" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              const isPast = min ? dateStr < min : false;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === date;

              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  className={`cal-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  disabled={isPast}
                  aria-selected={isSelected}
                  aria-label={`${day} ${MONTHS[viewMonth]} ${viewYear}${isToday ? ', Today' : ''}`}
                  onClick={() => handleSelect(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="cal-foot">
            <button
              type="button"
              className="cal-foot-btn"
              onClick={selectToday}
              disabled={min && todayStr < min}
            >
              Today
            </button>
            {date && (
              <button type="button" className="cal-foot-btn" onClick={clearDate}>
                Clear
              </button>
            )}
            <button
              type="button"
              className="cal-foot-btn"
              onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {error && <p className="field-err" id={`${dateId}-err`} role="alert">{error}</p>}
    </div>
  );
}

// ── Custom 24-Hour Military Time Picker ───────────────────────────
function TimePicker({ time, error, onTime, onBlur }) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const timeId = 'departure-time';

  const [inputH, setInputH] = useState(time ? time.split(':')[0] : '08');
  const [inputM, setInputM] = useState(time ? time.split(':')[1] : '00');

  useEffect(() => {
    if (time && time.includes(':')) {
      const [h, m] = time.split(':');
      setInputH(h);
      setInputM(m);
    }
  }, [time]);

  // Flip upward if space below is limited
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setUpward(spaceBelow < 300 && spaceAbove > spaceBelow);
  }, [open]);

  // Outside click and Escape to close
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        onBlur?.('time');
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        onBlur?.('time');
      }
    };
    document.addEventListener('pointerdown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onBlur]);

  const confirmTime = (h, m) => {
    const finalVal = `${pad(h)}:${pad(m)}`;
    onTime(finalVal);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const setNow = () => {
    const [nowH, nowM] = getCurrentTimeStr().split(':');
    setInputH(nowH);
    setInputM(nowM);
    confirmTime(nowH, nowM);
  };

  const clearTime = () => {
    onTime('');
    setOpen(false);
    triggerRef.current?.focus();
  };

  const hoursList = Array.from({ length: 24 }, (_, i) => pad(i));
  const minutesList = Array.from({ length: 60 }, (_, i) => pad(i));

  return (
    <div className={`field custom-picker-field ${open ? 'picker-open' : ''}`} ref={containerRef}>
      <label htmlFor={timeId} id={`${timeId}-lbl`} className="field-label">
        Departure Time
      </label>
      <div className="picker-trigger-wrap">
        <button
          type="button"
          id={timeId}
          data-id="dep-time"
          ref={triggerRef}
          className={`picker-trigger ${open ? 'open' : ''} ${error ? 'err-field' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={`${timeId}-lbl ${timeId}-val`}
          aria-invalid={!!error}
          aria-describedby={error ? `${timeId}-err` : undefined}
        >
          <span className="picker-trigger-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </span>
          <span id={`${timeId}-val`} className={time ? 'trigger-val' : 'trigger-ph'}>
            {time ? `${time} hrs` : 'Select time (HH:MM)'}
          </span>
          <span className="picker-chevron" aria-hidden="true">&#x25BE;</span>
        </button>
      </div>

      {open && (
        <div
          className={`time-popover ${upward ? 'pop-up' : 'pop-down'}`}
          role="dialog"
          aria-modal="true"
          aria-label="Departure time picker (24-hour format)"
        >
          <div className="time-popover-head">
            <span className="time-badge">24-HOUR MILITARY TIME</span>
            <span className="time-display-large">{pad(inputH)}:{pad(inputM)}</span>
          </div>

          <div className="time-columns-container">
            {/* Hours column (00 to 23) */}
            <div className="time-column">
              <span className="time-col-header">Hour</span>
              <div className="time-scroll-list" role="listbox" aria-label="Hour selection">
                {hoursList.map((h) => (
                  <button
                    key={h}
                    type="button"
                    role="option"
                    aria-selected={inputH === h}
                    className={`time-unit-btn ${inputH === h ? 'selected' : ''}`}
                    onClick={() => setInputH(h)}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Minutes column (00 to 59) */}
            <div className="time-column">
              <span className="time-col-header">Minute</span>
              <div className="time-scroll-list" role="listbox" aria-label="Minute selection">
                {minutesList.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={inputM === m}
                    className={`time-unit-btn ${inputM === m ? 'selected' : ''}`}
                    onClick={() => setInputM(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="time-foot">
            <button type="button" className="cal-foot-btn" onClick={setNow}>
              Now
            </button>
            {time && (
              <button type="button" className="cal-foot-btn" onClick={clearTime}>
                Clear
              </button>
            )}
            <button
              type="button"
              className="cal-foot-btn primary-foot-btn"
              onClick={() => confirmTime(inputH, inputM)}
            >
              Set Time
            </button>
          </div>
        </div>
      )}

      {error && <p className="field-err" id={`${timeId}-err`} role="alert">{error}</p>}
    </div>
  );
}

export default function DepartureScheduler({
  date = '',
  time = '',
  minDate = '',
  min = '',
  errors = {},
  onDate,
  onTime,
  onBlur
}) {
  const effectiveMin = minDate || min;

  return (
    <div className="scheduler-row">
      <DatePicker
        date={date}
        min={effectiveMin}
        error={errors.date}
        onDate={onDate}
        onBlur={onBlur}
      />
      <TimePicker
        time={time}
        error={errors.time}
        onTime={onTime}
        onBlur={onBlur}
      />
    </div>
  );
}
