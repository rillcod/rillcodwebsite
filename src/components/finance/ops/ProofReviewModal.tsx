'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DocumentTextIcon, PaperClipIcon } from '@/lib/icons';

type ProofStatus = 'pending' | 'approved' | 'rejected' | 'request_more';

interface ProofRecord {
  id: string;
  status?: ProofStatus;
  payer_note?: string | null;
  admin_note?: string | null;
  proof_image_url?: string | null;
  signed_url?: string | null;
  created_at: string;
  portal_users?: { full_name?: string | null; email?: string | null } | null;
}

const PROOF_STATUS_STYLES: Record<ProofStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  request_more: 'bg-primary/20 text-primary border-primary/30',
};

export function ProofReviewModal({
  invoiceId,
  invoiceNumber,
  onClose,
  onApprove,
}: {
  invoiceId: string;
  invoiceNumber: string;
  onClose: () => void;
  onApprove?: () => void;
}) {
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [acting, setActing] = useState(false);

  const loadProofs = () => {
    setLoading(true);
    fetch(`/api/invoices/${invoiceId}/proofs`)
      .then((r) => r.json())
      .then((d) => {
        setProofs(d.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadProofs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const handleReview = async (
    proofId: string,
    action: 'approved' | 'rejected' | 'request_more',
  ) => {
    setActing(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/proofs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof_id: proofId, action, admin_note: adminNote || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || 'Review failed');
        return;
      }
      if (action === 'approved') {
        toast.success('Proof approved — invoice marked paid');
        onApprove?.();
        onClose();
        return;
      }
      toast.success(action === 'rejected' ? 'Proof rejected' : 'Requested more info');
      setReviewingId(null);
      setAdminNote('');
      loadProofs();
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-background border border-border w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <div>
            <p className="font-black text-foreground text-sm">Payment Evidence Review</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Invoice #{invoiceNumber} · {proofs.length} submission{proofs.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground font-black text-xl"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : proofs.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <PaperClipIcon className="w-12 h-12 text-muted-foreground/30 mx-auto" />
              <p className="text-sm font-bold text-muted-foreground">No proof submitted yet</p>
              <p className="text-xs text-muted-foreground">
                The payer has not uploaded payment evidence for this invoice.
              </p>
            </div>
          ) : (
            proofs.map((proof) => {
              const proofStatus: ProofStatus = proof.status ?? 'pending';
              const isReviewing = reviewingId === proof.id;
              return (
                <div
                  key={proof.id}
                  className={`border rounded-xl overflow-hidden ${
                    proofStatus === 'approved'
                      ? 'border-emerald-500/30'
                      : proofStatus === 'rejected'
                      ? 'border-rose-500/30'
                      : 'border-border'
                  }`}
                >
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-foreground text-sm">
                            {proof.portal_users?.full_name ?? 'Payer'}
                          </p>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${PROOF_STATUS_STYLES[proofStatus]}`}
                          >
                            {proofStatus.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {proof.portal_users?.email ?? ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(proof.created_at).toLocaleString()}
                        </p>
                        {proof.payer_note && (
                          <div className="mt-2 bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300 italic rounded-md">
                            &ldquo;{proof.payer_note}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>

                    {proof.signed_url &&
                      (proof.proof_image_url?.endsWith('.pdf') ? (
                        <a
                          href={proof.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs font-bold text-primary hover:text-blue-300 underline"
                        >
                          <DocumentTextIcon className="w-4 h-4" /> View PDF Evidence
                        </a>
                      ) : (
                        <a href={proof.signed_url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={proof.signed_url}
                            alt="Payment evidence"
                            className="w-full max-h-72 object-contain bg-muted border border-border rounded-md cursor-zoom-in hover:opacity-90"
                          />
                        </a>
                      ))}

                    {proof.admin_note && (
                      <div className="bg-card border border-border px-3 py-2 text-xs text-card-foreground/70 rounded-md">
                        <span className="font-bold text-card-foreground/50 uppercase tracking-wide text-[10px]">
                          Admin note:{' '}
                        </span>
                        {proof.admin_note}
                      </div>
                    )}
                  </div>

                  {proofStatus === 'pending' && (
                    <div className="border-t border-border bg-card/50 p-3 space-y-3">
                      {isReviewing ? (
                        <>
                          <textarea
                            value={adminNote}
                            onChange={(e) => setAdminNote(e.target.value)}
                            placeholder="Optional note to payer (e.g. 'Thank you, payment verified')"
                            className="w-full text-xs border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary"
                            rows={2}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleReview(proof.id, 'approved')}
                              disabled={acting}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest rounded-md disabled:opacity-50"
                            >
                              Approve &amp; Mark Paid
                            </button>
                            <button
                              onClick={() => handleReview(proof.id, 'request_more')}
                              disabled={acting}
                              className="px-3 py-1.5 bg-primary hover:bg-primary text-white text-xs font-black uppercase tracking-widest rounded-md disabled:opacity-50"
                            >
                              Request More
                            </button>
                            <button
                              onClick={() => handleReview(proof.id, 'rejected')}
                              disabled={acting}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest rounded-md disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => {
                                setReviewingId(null);
                                setAdminNote('');
                              }}
                              disabled={acting}
                              className="px-3 py-1.5 bg-muted text-foreground text-xs font-black uppercase tracking-widest rounded-md disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => setReviewingId(proof.id)}
                          className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-md"
                        >
                          Review this proof
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default ProofReviewModal;
