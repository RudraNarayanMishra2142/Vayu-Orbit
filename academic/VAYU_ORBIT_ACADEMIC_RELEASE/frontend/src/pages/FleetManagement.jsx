import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import Shell from '../components/Shell';
import { Plus, Trash2, Shield, Star, CheckCircle2, Info, Truck, Search } from 'lucide-react';

const DEFAULT_MODEL_FORM = {
  vehicle_id: '',
  class_type: 'LTV',
  model_name: '',
  maker: '',
  axle_config: '4x4',
  gvw_tons: 3.0,
  operational_range_km: 500,
  max_speed_kmh: 80,
  routing_footprint: 'Standard clearance',
  role_category: 'DUAL',
  is_vip: 0,
  rated_passenger_capacity: 5,
  passenger_capacity_verified: 1,
  rated_payload_tons: 1.0,
  payload_capacity_verified: 1,
  capacity_source_note: 'OEM Datasheet'
};

const DEFAULT_UNIT_FORM = {
  unit_id: '',
  model_id: '',
  callsign: '',
  status: 'AVAILABLE',
  registration_no: '',
  assigned_base: 'PLC-CN-55',
  notes: ''
};

function statusPill(s) {
  const m = { AVAILABLE: 'ok', ASSIGNED: 'warn', IN_OPERATION: 'warn', MAINTENANCE: 'bad', RETIRED: 'bad' };
  return <span className={`pill ${m[s] || ''}`}>{s}</span>;
}

function Fleet() {
  const [activeTab, setActiveTab] = useState('MODELS'); // 'MODELS' or 'UNITS'
  const [models, setModels] = useState([]);
  const [units, setUnits] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [showModelForm, setShowModelForm] = useState(false);
  const [modelForm, setModelForm] = useState(DEFAULT_MODEL_FORM);

  const [showUnitForm, setShowUnitForm] = useState(false);
  const [unitForm, setUnitForm] = useState(DEFAULT_UNIT_FORM);

  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(m =>
      (m.vehicle_id && m.vehicle_id.toLowerCase().includes(q)) ||
      (m.model_name && m.model_name.toLowerCase().includes(q)) ||
      (m.maker && m.maker.toLowerCase().includes(q)) ||
      (m.class_type && m.class_type.toLowerCase().includes(q)) ||
      (m.role_category && m.role_category.toLowerCase().includes(q))
    );
  }, [models, searchQuery]);

  const filteredUnits = useMemo(() => {
    if (!searchQuery.trim()) return units;
    const q = searchQuery.toLowerCase();
    return units.filter(u =>
      (u.unit_id && u.unit_id.toLowerCase().includes(q)) ||
      (u.callsign && u.callsign.toLowerCase().includes(q)) ||
      (u.model_name && u.model_name.toLowerCase().includes(q)) ||
      (u.model_id && u.model_id.toLowerCase().includes(q)) ||
      (u.registration_no && u.registration_no.toLowerCase().includes(q)) ||
      (u.status && u.status.toLowerCase().includes(q))
    );
  }, [units, searchQuery]);

  const loadAll = () => {
    Promise.all([
      api.vehicles().catch(err => { setMsg(err.message || 'Failed to load models.'); return []; }),
      api.fleetUnits().catch(err => { setMsg(err.message || 'Failed to load units.'); return []; })
    ]).then(([mList, uList]) => {
      setModels(mList || []);
      setUnits(uList || []);
      if (mList && mList.length > 0 && !unitForm.model_id) {
        setUnitForm(f => ({ ...f, model_id: mList[0].vehicle_id }));
      }
    });
  };

  useEffect(loadAll, []);

  const addModel = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api.addVehicle(modelForm);
      setShowModelForm(false);
      setModelForm(DEFAULT_MODEL_FORM);
      setMsg('Vehicle model added to catalogue.');
      loadAll();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addUnit = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api.addFleetUnit(unitForm);
      setShowUnitForm(false);
      setUnitForm({ ...DEFAULT_UNIT_FORM, model_id: models[0]?.vehicle_id || '' });
      setMsg('Physical fleet unit registered.');
      loadAll();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Fleet Management"
      eyebrow="MANAGEMENT · FLEET"
      description="Master vehicle model catalog and physical unit asset management."
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          {activeTab === 'MODELS' ? (
            <button className="btn primary" onClick={() => setShowModelForm(s => !s)}>
              <Plus size={13} /> {showModelForm ? 'Cancel' : 'New Model'}
            </button>
          ) : (
            <button className="btn primary" onClick={() => setShowUnitForm(s => !s)}>
              <Plus size={13} /> {showUnitForm ? 'Cancel' : 'Register Unit'}
            </button>
          )}
        </div>
      }
    >
      {msg && (
        <div className={`alert ${msg.includes('added') || msg.includes('registered') ? 'ok-alert' : ''}`} style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* Tabs & Search Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`vayu-cat-tab${activeTab === 'MODELS' ? ' active' : ''}`}
            onClick={() => setActiveTab('MODELS')}
          >
            Vehicle Models Catalogue ({models.length})
          </button>
          <button
            className={`vayu-cat-tab${activeTab === 'UNITS' ? ' active' : ''}`}
            onClick={() => setActiveTab('UNITS')}
          >
            Physical Fleet Units ({units.length})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', width: 220 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: 28, fontSize: 11.5, height: 32, width: '100%' }}
              placeholder={activeTab === 'MODELS' ? "Search models…" : "Search units…"}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: 'var(--text-muted)' }}>
            {activeTab === 'MODELS' ? `${filteredModels.length} models` : `${filteredUnits.length} units`}
          </div>
        </div>
      </div>

      {/* NEW MODEL FORM */}
      {showModelForm && activeTab === 'MODELS' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>New Vehicle Model Record</h3>
          <div className="formgrid">
            <div>
              <label className="label">Vehicle ID</label>
              <input
                className="input"
                placeholder="e.g. V-LTV-08"
                value={modelForm.vehicle_id}
                onChange={e => setModelForm({ ...modelForm, vehicle_id: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Model Name</label>
              <input
                className="input"
                placeholder="e.g. Mahindra Armado ALSV"
                value={modelForm.model_name}
                onChange={e => setModelForm({ ...modelForm, model_name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Maker / Manufacturer</label>
              <input
                className="input"
                placeholder="e.g. Mahindra Defence"
                value={modelForm.maker}
                onChange={e => setModelForm({ ...modelForm, maker: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Class Type</label>
              <select
                className="input"
                value={modelForm.class_type}
                onChange={e => setModelForm({ ...modelForm, class_type: e.target.value })}
              >
                {['LTV', 'MSV', 'HSV', 'ACV', 'HET'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Role Category</label>
              <select
                className="input"
                value={modelForm.role_category}
                onChange={e => setModelForm({ ...modelForm, role_category: e.target.value })}
              >
                {['PASSENGER', 'CARGO', 'DUAL', 'SPECIALIST', 'FLAGGED_FOR_REVIEW'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Axle Config</label>
              <input
                className="input"
                placeholder="e.g. 4x4, 6x6, 8x8, Tracked"
                value={modelForm.axle_config}
                onChange={e => setModelForm({ ...modelForm, axle_config: e.target.value })}
              />
            </div>
            <div>
              <label className="label">GVW (Tonnes)</label>
              <input
                className="input"
                type="number"
                step="0.1"
                value={modelForm.gvw_tons}
                onChange={e => setModelForm({ ...modelForm, gvw_tons: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="label">Max Speed (km/h)</label>
              <input
                className="input"
                type="number"
                value={modelForm.max_speed_kmh}
                onChange={e => setModelForm({ ...modelForm, max_speed_kmh: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="label">Range (km)</label>
              <input
                className="input"
                type="number"
                value={modelForm.operational_range_km}
                onChange={e => setModelForm({ ...modelForm, operational_range_km: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="label">Rated Passengers</label>
              <input
                className="input"
                type="number"
                value={modelForm.rated_passenger_capacity}
                onChange={e => setModelForm({ ...modelForm, rated_passenger_capacity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="label">Rated Payload (Tonnes)</label>
              <input
                className="input"
                type="number"
                step="0.1"
                value={modelForm.rated_payload_tons}
                onChange={e => setModelForm({ ...modelForm, rated_payload_tons: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="label">VIP Designation</label>
              <select
                className="input"
                value={modelForm.is_vip}
                onChange={e => setModelForm({ ...modelForm, is_vip: parseInt(e.target.value) || 0 })}
              >
                <option value="0">Standard Military Platform</option>
                <option value="1">VIP Escort / Command Capable</option>
              </select>
            </div>
          </div>
          <button className="btn primary" style={{ marginTop: 14 }} onClick={addModel} disabled={busy}>
            {busy ? 'Saving…' : 'Save Vehicle Model'}
          </button>
        </div>
      )}

      {/* NEW UNIT FORM */}
      {showUnitForm && activeTab === 'UNITS' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Register New Physical Fleet Unit</h3>
          <div className="formgrid">
            <div>
              <label className="label">Unit Serial / ID</label>
              <input
                className="input"
                placeholder="e.g. UNIT-LTV-019"
                value={unitForm.unit_id}
                onChange={e => setUnitForm({ ...unitForm, unit_id: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Vehicle Model</label>
              <select
                className="input"
                value={unitForm.model_id}
                onChange={e => setUnitForm({ ...unitForm, model_id: e.target.value })}
              >
                {models.map(m => (
                  <option key={m.vehicle_id} value={m.vehicle_id}>
                    {m.model_name} ({m.vehicle_id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Callsign</label>
              <input
                className="input"
                placeholder="e.g. BRAVO-LEAD-01"
                value={unitForm.callsign}
                onChange={e => setUnitForm({ ...unitForm, callsign: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Registration No.</label>
              <input
                className="input"
                placeholder="e.g. 24D-48291"
                value={unitForm.registration_no}
                onChange={e => setUnitForm({ ...unitForm, registration_no: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Assigned Station / Base</label>
              <input
                className="input"
                placeholder="e.g. PLC-CN-55 (Delhi Cantt)"
                value={unitForm.assigned_base}
                onChange={e => setUnitForm({ ...unitForm, assigned_base: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Initial Status</label>
              <select
                className="input"
                value={unitForm.status}
                onChange={e => setUnitForm({ ...unitForm, status: e.target.value })}
              >
                {['AVAILABLE', 'ASSIGNED', 'IN_OPERATION', 'MAINTENANCE', 'RETIRED'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn primary" style={{ marginTop: 14 }} onClick={addUnit} disabled={busy}>
            {busy ? 'Registering…' : 'Register Physical Unit'}
          </button>
        </div>
      )}

      {/* TAB 1: VEHICLE MODELS TABLE */}
      {activeTab === 'MODELS' && (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Vehicle ID</th>
                  <th>Model & Maker</th>
                  <th>Class / Axle</th>
                  <th>Role</th>
                  <th>GVW</th>
                  <th>Speed</th>
                  <th>Rated Capacity</th>
                  <th>Physical Units</th>
                </tr>
              </thead>
              <tbody>
                {filteredModels.map(v => (
                  <tr key={v.vehicle_id}>
                    <td className="mono">{v.vehicle_id}</td>
                    <td>
                      <b style={{ fontSize: 13 }}>{v.model_name}</b>
                      {v.is_vip === 1 && (
                        <span className="vayu-vip-chip" style={{ marginLeft: 6 }}>
                          <Star size={9} fill="var(--warn)" /> VIP
                        </span>
                      )}
                      <div className="muted small">{v.maker}</div>
                    </td>
                    <td>
                      <span className="vayu-class-tag" style={{ fontSize: 10 }}>{v.class_type}</span>
                      <span className="mono" style={{ fontSize: 10.5, marginLeft: 4, color: 'var(--text-subtle)' }}>
                        {v.axle_config}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-main)' }}>
                        {v.role_category}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, color: 'var(--warn)' }}>
                      {v.gvw_tons} t
                    </td>
                    <td style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, color: 'var(--ok)' }}>
                      {v.max_speed_kmh} km/h
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {v.rated_passenger_capacity && (
                        <div>👤 {v.rated_passenger_capacity} pax {v.passenger_capacity_verified ? '✓' : '(est)'}</div>
                      )}
                      {v.rated_payload_tons && (
                        <div>📦 {v.rated_payload_tons} t {v.payload_capacity_verified ? '✓' : '(est)'}</div>
                      )}
                    </td>
                    <td>
                      <span
                        className="mono"
                        style={{
                          fontSize: 11,
                          color: v.total_units > 0 ? 'var(--warn)' : 'var(--text-subtle)',
                          fontWeight: v.total_units > 0 ? 700 : 400
                        }}
                      >
                        {v.total_units || 0} in pool
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredModels.length === 0 && (
              <div className="empty">
                {models.length === 0 ? 'No vehicles in fleet registry.' : 'No vehicles match current search filter.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PHYSICAL FLEET UNITS TABLE */}
      {activeTab === 'UNITS' && (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Unit ID</th>
                  <th>Callsign</th>
                  <th>Assigned Model</th>
                  <th>Reg No.</th>
                  <th>Base</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnits.map(u => (
                  <tr key={u.unit_id}>
                    <td className="mono">{u.unit_id}</td>
                    <td>
                      <b style={{ fontSize: 13, color: 'var(--text-main)' }}>{u.callsign || '—'}</b>
                    </td>
                    <td>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{u.model_name}</span>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-subtle)' }}>
                        {u.model_id} · {u.class_type}
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>{u.registration_no || '—'}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{u.assigned_base || '—'}</td>
                    <td>
                      {u.is_demo === 1 ? (
                        <span className="pill warn">DEMO UNIT</span>
                      ) : (
                        <span className="pill ok">OPERATIONAL</span>
                      )}
                    </td>
                    <td>
                      <select
                        className="select-compact"
                        style={{ width: 'auto', minWidth: 130 }}
                        value={u.status || 'AVAILABLE'}
                        onChange={e =>
                          api.fleetUnitStatus(u.unit_id, e.target.value)
                            .then(loadAll)
                            .catch(err => setMsg(err.message || 'Failed to update unit status.'))
                        }
                      >
                        {['AVAILABLE', 'ASSIGNED', 'IN_OPERATION', 'MAINTENANCE', 'RETIRED'].map(s => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUnits.length === 0 && (
              <div className="empty">
                {units.length === 0 ? 'No physical fleet units registered yet.' : 'No units match current search filter.'}
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

export default Fleet;
