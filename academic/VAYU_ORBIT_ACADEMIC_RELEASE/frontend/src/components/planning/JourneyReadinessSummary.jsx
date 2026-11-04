import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  Lock,
  Unlock,
  Loader2,
  X
} from 'lucide-react';
import { api } from '../../services/api';

export default function JourneyReadinessSummary({
  journeyId,
  routeConstraints,
  voramAssessment,
  ropReport,
  sensitivityAdvisory,
  convoyValidation,
  currentUser,
  onOpenRopModal,
  onOpenVerifyModal,
  onOpenAdvisoryModal,
  onOverrideRecorded,
  onReassessVoram,
  reassessing
}) {
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState('');

  const isCoordinator = !currentUser || ['COORDINATOR', 'ADMIN'].includes(currentUser.role);

  // 1. Route Constraints Dimension
  const isRouteBlocked = !routeConstraints?.bridgeCleared || voramAssessment?.assessment_status === 'FAIL' || (voramAssessment?.constraint_findings && voramAssessment.constraint_findings.some(c => c.is_ineligible));
  const routeDim = {
    label: 'Corridor & Physical Constraints',
    ok: !isRouteBlocked,
    status: isRouteBlocked ? 'BLOCKED' : 'CLEARED',
    detail: isRouteBlocked
      ? 'Corridor violates safe bridge gross vehicle weight limits or closed route segments.'
      : 'All corridor segments and bridge crossings cleared within tested physical limits.'
  };

  // 2. VORAM Assessment Dimension
  const voramStatus = voramAssessment?.assessment_status || 'UNKNOWN';
  const voramOk = voramStatus === 'PASS_WITHIN_TESTED_RULES';
  const voramDim = {
    label: 'VORAM v0.1 Multimodal Assessment',
    ok: voramOk,
    status: voramStatus === 'PASS_WITHIN_TESTED_RULES' ? 'PASSED' : (voramStatus === 'FAIL' ? 'FAILED' : 'INCOMPLETE TELEMETRY'),
    detail: voramStatus === 'PASS_WITHIN_TESTED_RULES'
      ? `Full 10-parameter assessment completed: Score ${voramAssessment.risk_score} (${voramAssessment.risk_category}).`
      : (voramStatus === 'FAIL'
        ? 'Mandatory constraint failure detected under VORAM criteria.'
        : 'Telemetry incomplete: unmonitored hydrologic or weather streams marked UNRECORDED.')
  };

  // 3. ROP Reconnaissance Evidence
  const ropStatus = ropReport?.status || 'NONE';
  const ropOk = ropStatus === 'VERIFIED';
  const ropDim = {
    label: 'ROP Field Reconnaissance Evidence',
    ok: ropOk,
    status: ropStatus === 'VERIFIED' ? 'VERIFIED' : (ropStatus === 'SUBMITTED' ? 'SUBMITTED' : (ropStatus === 'DRAFT' ? 'DRAFT' : 'NO REPORT')),
    detail: ropStatus === 'VERIFIED'
      ? `Forward ROP report ${ropReport.report_id} verified by authorized coordinator.`
      : (ropStatus === 'SUBMITTED'
        ? `Report ${ropReport.report_id} submitted; pending independent coordinator verification.`
        : (ropStatus === 'REJECTED'
          ? `Report ${ropReport.report_id} rejected by reviewer: ${ropReport.review_decision_notes || 'Deficiencies identified.'}`
          : 'No forward reconnaissance report on record for this corridor version.')),
    actionLabel: ropStatus === 'SUBMITTED' ? (isCoordinator ? 'Review Evidence' : 'View Report') : (ropStatus === 'NONE' ? 'Submit ROP Report' : 'Inspect Report'),
    action: ropStatus === 'SUBMITTED' && isCoordinator ? onOpenVerifyModal : onOpenRopModal,
    showReassess: ropStatus === 'VERIFIED' && typeof onReassessVoram === 'function'
  };

  // 4. Sensitivity & Escort Readiness
  const escortState = sensitivityAdvisory?.escort_requirement_state || 'REVIEW_REQUIRED';
  const escortOk = escortState === 'SUPPORT_CONFIRMED' || escortState === 'NOT_REQUIRED_UNDER_RECORDED_POLICY';
  const escortDim = {
    label: 'Escort / QRT Support Readiness',
    ok: escortOk,
    status: escortOk ? 'CONFIRMED' : 'REVIEW REQUIRED',
    detail: escortOk
      ? (escortState === 'SUPPORT_CONFIRMED' ? 'Escort and QRT standby arrangements confirmed.' : 'Support not required under recorded low-risk policy.')
      : 'Sensitivity classification or policy requires authorized review of escort support arrangements.',
    actionLabel: isCoordinator ? 'Review Support' : null,
    action: onOpenAdvisoryModal
  };

  // 5. Convoy Manifest Compliance
  const convoyOk = convoyValidation?.isValid;
  const convoyDim = {
    label: 'Convoy Manifest Allocation',
    ok: convoyOk,
    status: convoyOk ? 'COMPLIANT' : 'ALLOCATION CONFLICT',
    detail: convoyOk
      ? 'All vehicle gross weights, passenger allocations, and role limits verified compliant.'
      : `${convoyValidation?.errors?.length || 1} allocation conflict(s) detected in convoy manifest.`
  };

  // Overall Readiness Resolution
  let overallState = 'READY';
  let overallColor = 'var(--ok)';
  let headline = 'Operational Movement Cleared for Commitment';

  if (isRouteBlocked) {
    overallState = 'BLOCKED_BY_CONSTRAINT';
    overallColor = 'var(--bad)';
    headline = 'Movement Blocked: Mandatory Physical Constraint Violated';
  } else if (!convoyOk) {
    overallState = 'BLOCKED_BY_MANIFEST';
    overallColor = 'var(--bad)';
    headline = 'Movement Blocked: Convoy Allocation Incomplete or Conflicted';
  } else if (!escortOk) {
    overallState = 'REVIEW_REQUIRED';
    overallColor = 'var(--warn)';
    headline = 'Readiness Review Required: Escort/QRT Arrangements Pending';
  } else if (!voramOk || !ropOk) {
    overallState = 'READY_WITH_ADVISORY';
    overallColor = 'var(--accent)';
    headline = 'Ready with Operational Advisory: Incomplete Telemetry Unmonitored';
  }

  const handleSaveOverride = async (e) => {
    e.preventDefault();
    if (!overrideReason.trim() || overrideReason.trim().length < 5) {
      setOverrideError('Please provide a substantive operational justification (min 5 characters) for the override.');
      return;
    }
    setSavingOverride(true);
    setOverrideError('');
    try {
      const res = await api.readinessOverride(journeyId, { reason: overrideReason.trim() });
      if (typeof onOverrideRecorded === 'function') {
        onOverrideRecorded(res);
      }
      setOverrideModalOpen(false);
    } catch (err) {
      setOverrideError(err.message || 'Failed to record readiness override.');
    } finally {
      setSavingOverride(false);
    }
  };

  return (
    <div className="card" style={{
      padding: '16px 20px',
      borderLeft: `4px solid ${overallColor}`,
      marginBottom: 16
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, fontFamily: "'Share Tech Mono', monospace", color: overallColor, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Systemic Operational Readiness Summary
          </div>
          <h3 style={{ fontSize: 15, margin: '2px 0 0 0', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main)' }}>
            {isRouteBlocked ? <ShieldAlert size={17} color={overallColor} /> : <ShieldCheck size={17} color={overallColor} />}
            {headline}
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10.5,
            fontWeight: 700,
            padding: '3px 9px',
            borderRadius: 4,
            background: isRouteBlocked ? 'rgba(239, 68, 68, 0.15)' : escortOk ? 'rgba(34, 197, 94, 0.12)' : 'rgba(234, 179, 8, 0.12)',
            border: `1px solid ${overallColor}`,
            color: overallColor,
            fontFamily: "'Share Tech Mono', monospace"
          }}>
            {overallState}
          </span>
        </div>
      </div>

      {/* 5-Dimension Readiness Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[routeDim, voramDim, ropDim, escortDim, convoyDim].map((dim, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--panel-alt)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: '75%' }}>
              <div style={{ marginTop: 2 }}>
                {dim.ok ? (
                  <CheckCircle2 size={15} color="var(--ok)" />
                ) : dim.status === 'BLOCKED' || dim.status === 'FAILED' ? (
                  <XCircle size={15} color="var(--bad)" />
                ) : (
                  <Clock size={15} color="var(--warn)" />
                )}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{dim.label}</span>
                  <span style={{
                    fontSize: 9.5,
                    fontFamily: "'Share Tech Mono', monospace",
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: dim.ok ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                    color: dim.ok ? 'var(--ok)' : 'var(--warn)'
                  }}>
                    {dim.status}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {dim.detail}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {dim.actionLabel && dim.action && (
                <button
                  type="button"
                  className="btn"
                  onClick={dim.action}
                  style={{ fontSize: 10.5, padding: '4px 8px' }}
                >
                  {dim.actionLabel} →
                </button>
              )}
              {/* Reassess VORAM — only shown on the ROP row when status=VERIFIED */}
              {idx === 2 && ropStatus === 'VERIFIED' && typeof onReassessVoram === 'function' && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={onReassessVoram}
                  disabled={reassessing}
                  style={{ fontSize: 10.5, padding: '4px 8px' }}
                  title="Re-run VORAM v0.1 using verified ROP telemetry"
                >
                  {reassessing ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Loader2 size={11} className="spin" /> Reassessing…
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ↺ Reassess VORAM
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Advisory Override Option for Coordinators */}
      {!escortOk && isCoordinator && !isRouteBlocked && (
        <div style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'rgba(234, 179, 8, 0.08)',
          border: '1px solid rgba(234, 179, 8, 0.25)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: 11, color: 'var(--warn)' }}>
            <b>Escort Review Pending:</b> Operational policy allows coordinator override with recorded audit justification.
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => setOverrideModalOpen(true)}
            style={{ fontSize: 10.5, padding: '3px 8px', borderColor: 'var(--warn)', color: 'var(--warn)' }}
          >
            Apply Readiness Override…
          </button>
        </div>
      )}

      {/* Override Modal */}
      {overrideModalOpen && (
        <div className="vayu-modal-backdrop" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 12, 18, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001,
          padding: 16
        }}>
          <div className="vayu-modal-dialog" style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            width: '100%',
            maxWidth: 520,
            padding: 18
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontSize: 15, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Unlock size={16} color="var(--warn)" />
                Authorized Readiness Override
              </h3>
              <button
                type="button"
                className="btn icon"
                onClick={() => setOverrideModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            {overrideError && (
              <div style={{ background: 'rgba(161, 15, 24, 0.15)', borderLeft: '4px solid #A10F18', padding: '6px 10px', color: '#FFC2C2', fontSize: 11, marginBottom: 10 }}>
                {overrideError}
              </div>
            )}

            <form onSubmit={handleSaveOverride} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                You are applying an authorized operational override to permit journey commitment while escort support review is outstanding. This action will be permanently recorded in the cryptographic audit log.
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: 4 }}>
                  Operational Rationale & Authority Reason (Required)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Daytime secure highway corridor; escort dispensed by Sector Commander authority..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  style={{ width: '100%', padding: '8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-main)', fontSize: 12 }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOverrideModalOpen(false)}
                  disabled={savingOverride}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={savingOverride}
                  style={{ fontWeight: 700, borderColor: 'var(--warn)', color: 'var(--warn)' }}
                >
                  {savingOverride ? <><Loader2 size={13} className="spin" /> Recording…</> : 'Confirm & Record Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
