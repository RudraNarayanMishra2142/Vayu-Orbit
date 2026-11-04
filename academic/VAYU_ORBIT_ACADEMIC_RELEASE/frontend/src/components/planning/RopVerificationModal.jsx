import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  UserCheck,
  FileText,
  Loader2,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { VORAM_PARAMETERS } from './VoramAssessmentPanel';
import { api } from '../../services/api';

export default function RopVerificationModal({
  isOpen,
  onClose,
  journeyId,
  report,
  currentUser,
  onVerificationComplete
}) {
  if (!isOpen || !report) return null;

  const isAuthor = currentUser?.id && report.reporting_user_id === currentUser.id;
  const isCoordinator = !currentUser || ['COORDINATOR', 'ADMIN'].includes(currentUser.role);
  const canVerify = isCoordinator && !isAuthor;

  const paramsData = report.parameters || {};
  const [selectedParams, setSelectedParams] = useState(
    VORAM_PARAMETERS.filter(p => {
      const v = paramsData[p.id];
      return v && (v.status === 'OBSERVED' || v.status === 'CONFIRMED' || v.rating !== null);
    }).map(p => p.id)
  );

  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const toggleParam = (pId) => {
    setSelectedParams(prev =>
      prev.includes(pId) ? prev.filter(x => x !== pId) : [...prev, pId]
    );
  };

  const handleReviewDecision = async (decision) => {
    if (!reviewNotes.trim() || reviewNotes.trim().length < 3) {
      setErrorMsg('Please enter detailed review notes / operational rationale for this review decision.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const payload = {
        decision,
        review_notes: reviewNotes.trim(),
        verified_parameters: decision === 'VERIFIED' ? selectedParams : []
      };

      const updated = await api.reviewRopReport(journeyId, report.report_id, payload);
      if (typeof onVerificationComplete === 'function') {
        onVerificationComplete(updated, decision);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit review decision. Verify connectivity and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="vayu-modal-backdrop" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 12, 18, 0.85)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 16
    }}>
      <div className="vayu-modal-dialog" style={{
        background: 'var(--panel-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        width: '100%',
        maxWidth: 960,
        maxHeight: '94vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--panel-alt)'
        }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Governance Verification Gate
            </div>
            <h2 style={{ fontSize: 17, margin: '2px 0 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} color="var(--accent)" />
              ROP Evidence Review & Verification Workspace
            </h2>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Report ID: <span className="mono" style={{ color: 'var(--text-main)', fontWeight: 600 }}>{report.report_id}</span> · Submitter: <span style={{ color: 'var(--text-main)' }}>{report.reporting_user_email}</span> ({report.reporting_user_role})
            </div>
          </div>
          <button
            type="button"
            className="btn icon"
            onClick={onClose}
            title="Close dialog"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Separation of Duties Alert */}
        {isAuthor && (
          <div style={{
            background: 'rgba(171, 29, 121, 0.15)',
            borderLeft: '4px solid var(--berry)',
            padding: '10px 16px',
            color: '#FFC2C2',
            fontSize: 11.5,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <ShieldAlert size={16} color="var(--berry)" />
            <span>
              <b>Separation of Duties Notice:</b> You authored this ROP report. Under military logistics governance, authors cannot independently certify or verify their own submissions. An independent authorized coordinator must review.
            </span>
          </div>
        )}

        {errorMsg && (
          <div style={{
            background: 'rgba(161, 15, 24, 0.15)',
            borderLeft: '4px solid #A10F18',
            padding: '10px 16px',
            color: '#FFC2C2',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertTriangle size={15} color="#A10F18" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Metadata Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            background: 'var(--panel-alt)',
            padding: '10px 14px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)'
          }}>
            <div>
              <div className="kicker">Report Status</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>
                <span className={`pill ${report.status === 'VERIFIED' ? 'ACTIVE' : report.status === 'REJECTED' ? 'DISRUPTED' : 'SCHEDULED'}`}>
                  {report.status}
                </span>
              </div>
            </div>
            <div>
              <div className="kicker">Route Version</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                {report.route_version}
              </div>
            </div>
            <div>
              <div className="kicker">Observation Period</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {report.observation_period_start ? new Date(report.observation_period_start).toLocaleDateString() : '—'}
              </div>
            </div>
            <div>
              <div className="kicker">Submission Timestamp</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {report.created_at ? new Date(report.created_at).toLocaleTimeString() : '—'}
              </div>
            </div>
          </div>

          {/* Parameters Review Table */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>
                Field Observations by Parameter ({Object.keys(paramsData).length} Recorded)
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Select parameter items to verify for VORAM ingest
              </div>
            </div>

            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <thead>
                  <tr style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px', width: 36 }}>Verify</th>
                    <th style={{ padding: '8px 10px' }}>Parameter</th>
                    <th style={{ padding: '8px 10px', width: 110 }}>Obs. Status</th>
                    <th style={{ padding: '8px 10px', width: 85 }}>Rating</th>
                    <th style={{ padding: '8px 10px', width: 130 }}>Source</th>
                    <th style={{ padding: '8px 10px' }}>Findings & Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {VORAM_PARAMETERS.map(p => {
                    const item = paramsData[p.id] || { status: 'NOT_OBSERVED', description: '', rating: null };
                    const isSelected = selectedParams.includes(p.id);
                    const hasData = item.status === 'OBSERVED' || item.status === 'CONFIRMED' || item.rating !== null || item.description.length > 0;

                    return (
                      <tr key={p.id} style={{
                        borderBottom: '1px solid var(--border)',
                        background: isSelected ? 'rgba(142, 216, 248, 0.04)' : 'transparent',
                        opacity: hasData ? 1 : 0.65
                      }}>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!canVerify || !hasData}
                            onChange={() => toggleParam(p.id)}
                            style={{ cursor: canVerify && hasData ? 'pointer' : 'not-allowed' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Weight: {p.weight}%</div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            fontFamily: "'Share Tech Mono', monospace",
                            fontSize: 10,
                            fontWeight: 600,
                            color: item.status === 'CONFIRMED' ? 'var(--ok)' : item.status === 'OBSERVED' ? 'var(--accent)' : 'var(--text-subtle)'
                          }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {item.rating !== null && item.rating !== undefined && item.rating !== '' ? (
                            <span className="mono" style={{
                              fontWeight: 700,
                              color: item.rating < 30 ? 'var(--ok)' : item.rating < 60 ? 'var(--warn)' : 'var(--bad)'
                            }}>
                              {item.rating} / 100
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-subtle)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 10.5, color: 'var(--text-muted)' }}>
                          {item.source ? item.source.replace('_', ' ') : '—'}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ color: 'var(--text-main)', fontSize: 11 }}>
                            {item.description || 'No qualitative comments recorded.'}
                          </div>
                          {item.reference && (
                            <div style={{ fontSize: 10, color: 'var(--text-subtle)', fontFamily: "'Share Tech Mono', monospace", marginTop: 2 }}>
                              Ref: {item.reference}
                            </div>
                          )}
                          {item.uncertainty_notes && (
                            <div style={{ fontSize: 10, color: 'var(--warn)', marginTop: 2 }}>
                              Limitation: {item.uncertainty_notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Review Decision Notes */}
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: 4 }}>
              Authorized Review Notes & Governance Rationale (Required)
            </label>
            <textarea
              rows={3}
              placeholder="Enter cross-check details, verification justification, or specific clarification request..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              disabled={!canVerify}
              style={{
                width: '100%',
                padding: '8px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-main)',
                fontSize: 12,
                resize: 'vertical'
              }}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--panel-alt)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Reviewer: <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{currentUser?.email || 'Active Coordinator'}</span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={submitting}
              style={{ fontSize: 11.5 }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => handleReviewDecision('NEEDS_CLARIFICATION')}
              disabled={!canVerify || submitting}
              style={{ fontSize: 11.5, color: 'var(--warn)', borderColor: 'rgba(234, 179, 8, 0.4)' }}
            >
              Request Clarification
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => handleReviewDecision('REJECTED')}
              disabled={!canVerify || submitting}
              style={{ fontSize: 11.5, color: 'var(--bad)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
            >
              Reject Evidence
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => handleReviewDecision('VERIFIED')}
              disabled={!canVerify || submitting || selectedParams.length === 0}
              style={{ fontSize: 11.5, fontWeight: 700 }}
            >
              {submitting ? (
                <><Loader2 size={13} className="spin" /> Certifying…</>
              ) : (
                <><ShieldCheck size={14} /> Certify & Verify ({selectedParams.length} Parameters)</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
