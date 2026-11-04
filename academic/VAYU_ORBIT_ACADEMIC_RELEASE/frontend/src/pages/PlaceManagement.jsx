import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import MapView from '../components/MapView';
import { Plus, Search } from 'lucide-react';

const DEFAULT_FORM = {
  place_name: '', category: 'Logistics Hub', region: '',
  lat: 28, lon: 77, status: 'ACTIVE', access_class: 'SIMULATION',
  max_vehicle_tons: 12, clearance_m: 4, support_services: 'Fuel, maintenance', description: ''
};

const FIELD_LABELS = {
  place_name: 'Place Name', category: 'Category', region: 'Region',
  lat: 'Latitude', lon: 'Longitude', status: 'Status', access_class: 'Access Class',
  max_vehicle_tons: 'Max Vehicle (t)', clearance_m: 'Clearance (m)',
  support_services: 'Support Services', description: 'Description'
};

function Places() {
  const [data,  setData]  = useState([]);
  const [show,  setShow]  = useState(false);
  const [q,     setQ]     = useState('');
  const [form,  setForm]  = useState(DEFAULT_FORM);
  const [msg,   setMsg]   = useState('');
  const [busy,  setBusy]  = useState(false);

  const load = () => {
    api.places()
      .then(res => setData(Array.isArray(res) ? res : []))
      .catch(err => setMsg(err.message || 'Failed to load places.'));
  };
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    setBusy(true); setMsg('');
    try {
      await api.addPlace({
        ...form,
        lat: Number(form.lat), lon: Number(form.lon),
        max_vehicle_tons: Number(form.max_vehicle_tons),
        clearance_m: Number(form.clearance_m),
      });
      setShow(false); setForm(DEFAULT_FORM); setMsg('Place added to backend.');
      load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const safeData = Array.isArray(data) ? data : [];
  const rows = safeData.filter(p =>
    `${p?.place_name || ''} ${p?.place_id || ''} ${p?.category || ''} ${p?.region || ''}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <Shell
      title="Place Management"
      eyebrow="MANAGEMENT · CORRIDOR NODES"
      description="Corridor military installations and logistics node registry."
      actions={
        <button className="btn primary" onClick={() => setShow(s => !s)}>
          <Plus size={13} /> {show ? 'Cancel' : 'Add Place'}
        </button>
      }
    >
      {msg && <div className={`alert ${msg.includes('added') ? 'ok-alert' : ''}`} style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Add Place Form */}
      {show && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>New Place Record</h3>
          <div className="formgrid">
            {Object.entries(form).map(([k, v]) => (
              <div key={k}>
                <label className="label">{FIELD_LABELS[k] || k}</label>
                <input
                  className="input"
                  value={v}
                  onChange={e => setForm({ ...form, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <button className="btn primary" style={{ marginTop: 14 }} onClick={add} disabled={busy}>
            {busy ? 'Saving…' : 'Save Place'}
          </button>
        </div>
      )}

      {/* Search + list */}
      <div className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="Search places…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <span className="muted small" style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10 }}>
            {rows.length} / {data.length} nodes
          </span>
        </div>

        <div className="list">
          {rows.map(p => (
            <div className="place" key={p.place_id}>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13 }}>{p.place_name}</b>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9.5, color: 'var(--text-subtle)', marginTop: 2 }}>
                  {p.place_id} · {p.category}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {p.region} · {p.access_class} · max {p.max_vehicle_tons} t
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <span className={`pill ${p.status === 'ACTIVE' ? 'ACTIVE' : 'CANCELLED'}`}>{p.status}</span>
                <button
                  className="btn"
                  style={{ padding: '4px 9px', fontSize: 10 }}
                  onClick={() => api.placeStatus(p.place_id, p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE').then(load).catch(err => setMsg(err.message || 'Failed to update place status.'))}
                >
                  Toggle Status
                </button>
              </div>
            </div>
          ))}
          {!rows.length && <div className="empty">No places found.</div>}
        </div>
      </div>
    </Shell>
  );
}

export default Places;
