import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  UserCheck,
  FileText,
  Sliders,
  X,
  Loader2
} from 'lucide-react';
import { api } from '../../services/api';

const ADVISORY_STATES = {
  REVIEW_REQUIRED: {
    label: 'Review Required',
    badgeClass: 'warn',
    color: 'var(--warn)',
    bg: 'rgba(234, 179, 8, 0.12)',
    border: 'rgba(234, 179, 8, 0.4)',
    desc: 'Recorded sensitivity classification or policy requires authorized review of escort and QRT support before departure.'
  },
  REQUIREMENT_RECORDED: {
    label: 'Requirement Recorded',
    badgeClass: 'info',
    color: 'var(--accent)',
    bg: 'rgba(142, 216, 248, 0.12)',
    border: 'rgba(142, 216, 248, 0.4)',
    desc: 'Escort or QRT support requirement recorded by reviewer; operational arrangements pending confirmation.'
  },
  SUPPORT_CONFIRMED: {
    label: 'Support Confirmed',
    badgeClass: 'ok',
    color: 'var(--ok)',
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.4)',
    desc: 'Armed escort or QRT standby arrangements confirmed by authorized coordinator.'
  },
  NOT_REQUIRED_UNDER_RECORDED_POLICY: {
    label: 'Not Required under Recorded Policy',
    badgeClass: 'ok',
    color: 'var(--ok)',
    bg: 'rgba(34, 197, 94, 0.08)',
    border: 'rgba(34, 197, 94, 0.3)',
    desc: 'Authorized policy or reviewer has explicitly established that escort/QRT support is not required for this movement.'
  },
  NOT_ESTABLISHED: {
    label: 'Not Established',
    badgeClass: 'unknown',
    color: 'var(--text-muted)',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.3)',
    desc: 'Insufficient recorded data to establish escort or QRT support requirement.'
  }
};

export default function SensitivityAdvisoryCard({
  journeyId,
  convoy = [],
  advisory = null,
  currentUser,
  onAdvisoryUpdated,
  isModalOpen: externalModalOpen,
  setIsModalOpen: setExternalModalOpen
}) {
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const modalOpen = externalModalOpen !== undefined ? externalModalOpen : internalModalOpen;
  const setModalOpen = setExternalModalOpen || setInternalModalOpen;
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Check if convoy has VIP or sensitive role
  const hasVipVehicle = convoy.some(
    v => v.is_vip || String(v.role_category || '').toUpperCase().includes('VIP') || String(v.model_name || '').toUpperCase().includes('VIP')
  );

  const activeLevel = advisory?.sensitivity_level || (hasVipVehicle ? 'HIGH_SENSITIVITY' : 'STANDARD');
  const activeStateKey = advisory?.escort_requirement_state || (hasVipVehicle ? 'REVIEW_REQUIRED' : 'NOT_REQUIRED_UNDER_RECORDED_POLICY');
  const stateMeta = ADVISORY_STATES[activeStateKey] || ADVISORY_STATES.REVIEW_REQUIRED;

  const isCoordinator = !currentUser || ['COORDINATOR', 'ADMIN'].includes(currentUser.role);

  // Form state for editing
  const [formLevel, setFormLevel] = useState(activeLevel);
  const [formState, setFormState] = useState(activeStateKey);
  const [formNotes, setFormNotes] = useState(advisory?.support_notes || '');
  const [formPolicy, setFormPolicy] = useState(advisory?.policy_reference || 'DEF-LOG-SOP-2026/SEC-04');

  const handleOpenModal = () => {
    setFormLevel(activeLevel);
    setFormState(activeStateKey);
    setFormNotes(advisory?.support_notes || (hasVipVehicle ? 'VIP convoy movement: escort and QRT standby verified with Sector Operations.' : 'Standard peacetime highway transit.'));
    setFormPolicy(advisory?.policy_reference || 'DEF-LOG-SOP-2026/SEC-04');
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');

    try {
      const payload = {
        sensitivity_level: formLevel,
        escort_requirement_state: formState,
        policy_reference: formPolicy.trim(),
        support_notes: formNotes.trim()
      };

      const updated = await api.updateSensitivityAdvisory(journeyId, payload);
      if (typeof onAdvisoryUpdated === 'function') {
        onAdvisoryUpdated(updated);
      }
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update sensitivity advisory.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="jp-readiness-card" style={{ borderLeft: `4px solid ${stateMeta.color}` }}>
      <div className="jp-readiness-card-header">
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldAlert size={15} color={stateMeta.color} />
            <span>Escort / QRT Readiness Advisory</span>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
            Classification: <b style={{ color: activeLevel === 'HIGH_SENSITIVITY' ? 'var(--warn)' : 'var(--text-main)' }}>{activeLevel}</b> · Policy: <span className="mono">{advisory?.policy_reference || 'DEF-LOG-SOP-2026/SEC-04 (Provisional SOP Placeholder)'}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 4,
            background: stateMeta.bg,
            border: `1px solid ${stateMeta.border}`,
            color: stateMeta.color,
            fontFamily: "'Share Tech Mono', monospace"
          }}>
            {stateMeta.label.toUpperCase()}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-main)', lineHeight: 1.45, marginBottom: 8 }}>
        {stateMeta.desc}
      </div>

      {hasVipVehicle && (
        <div style={{
          background: 'rgba(234, 179, 8, 0.1)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          borderRadius: 4,
          padding: '6px 10px',
          fontSize: 10.5,
          color: 'var(--warn)',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <AlertTriangle size={13} />
          <span><b>Convoy contains VIP / Command Asset:</b> Authorized escort readiness review mandatory prior to commit.</span>
        </div>
      )}

      {advisory?.support_notes && (
        <div style={{
          background: 'var(--panel-alt)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '6px 10px',
          fontSize: 11,
          color: 'var(--text-muted)',
          marginBottom: 8
        }}>
          <b style={{ color: 'var(--text-main)' }}>Support Arrangements Note:</b> {advisory.support_notes}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>
          {advisory?.reviewed_by ? (
            <span>Reviewed by: <span className="mono">{advisory.reviewed_by}</span> {advisory.reviewed_at ? `(${new Date(advisory.reviewed_at).toLocaleTimeString()})` : ''} · Provisional decision support (automated tasking prohibited)</span>
          ) : (
            <span>Provisional decision support only (not command policy) · Automated asset dispatch prohibited</span>
          )}
        </div>

        {isCoordinator && (
          <button
            type="button"
            className="btn"
            onClick={handleOpenModal}
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            Review Support Arrangements
          </button>
        )}
      </div>

      {/* Review Dialog */}
      {modalOpen && (
        <div className="vayu-modal-backdrop" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 12, 18, 0.85)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 16
        }}>
          <div className="vayu-modal-dialog" style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            width: '100%',
            maxWidth: 580,
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)'
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--panel-alt)'
            }}>
              <div>
                <h3 style={{ fontSize: 15, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldAlert size={16} color="var(--accent)" />
                  Escort & QRT Support Review
                </h3>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Target: <span className="mono">{journeyId}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn icon"
                onClick={() => setModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div style={{ background: 'rgba(161, 15, 24, 0.15)', borderLeft: '4px solid #A10F18', padding: '8px 14px', color: '#FFC2C2', fontSize: 11.5 }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  Convoy Sensitivity Classification
                </label>
                <select
                  value={formLevel}
                  onChange={(e) => setFormLevel(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12 }}
                >
                  <option value="STANDARD">STANDARD — Regular Military Logistics Convoy</option>
                  <option value="RESTRICTED">RESTRICTED — Controlled Movement / Dangerous Freight</option>
                  <option value="HIGH_SENSITIVITY">HIGH_SENSITIVITY — VIP / Command Staff Convoy</option>
                  <option value="CRITICAL_CONVOY">CRITICAL_CONVOY — High Value Assets / Priority Munitions</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  Escort / QRT Support Determination
                </label>
                <select
                  value={formState}
                  onChange={(e) => setFormState(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12 }}
                >
                  <option value="SUPPORT_CONFIRMED">SUPPORT CONFIRMED — Escort/QRT arrangements assigned and confirmed</option>
                  <option value="NOT_REQUIRED_UNDER_RECORDED_POLICY">NOT REQUIRED — Peacetime policy permits unescorted transit</option>
                  <option value="REQUIREMENT_RECORDED">REQUIREMENT RECORDED — Requirement noted; pending assignment</option>
                  <option value="REVIEW_REQUIRED">REVIEW REQUIRED — Further sector coordination needed</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  Support Arrangements Notes / Call-Signs / Outposts
                </label>
                <textarea
                  rows={3}
                  placeholder="Record assigned QRT standby station, escort unit callsign, or policy justification..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12, resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  Governing Directive / SOP Reference
                </label>
                <input
                  type="text"
                  value={formPolicy}
                  onChange={(e) => setFormPolicy(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12, fontFamily: "'Share Tech Mono', monospace" }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={saving}
                  style={{ fontWeight: 700 }}
                >
                  {saving ? <><Loader2 size={13} className="spin" /> Saving…</> : 'Confirm Advisory Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
