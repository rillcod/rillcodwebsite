'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TrophyIcon, AcademicCapIcon, ShieldCheckIcon } from '@/lib/icons';
import { toast } from 'sonner';

interface Child { id: string; full_name: string; user_id: string | null }
interface Certificate {
  id: string;
  certificate_number: string;
  verification_code: string;
  issued_date: string;
  pdf_url: string | null;
  course_title: string | null;
}

function ParentCertificatesContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(studentParam);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingCerts, setLoadingCerts] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setLoadingChildren(true);
    fetch('/api/parents/portal?section=children')
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to load children');
        const list = (data.children ?? []) as Child[];
        setChildren(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
        setLoadingChildren(false);
      })
      .catch(err => {
        toast.error('Could not load student list. Please try again.');
        console.error('Failed to load children:', err);
        setLoadingChildren(false);
      });
  }, [profile]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingCerts(true);
    fetch(`/api/parents/portal?section=certificates&child_id=${selectedId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to load certificates');
        setCerts((data.certs ?? []) as Certificate[]);
        setLoadingCerts(false);
      })
      .catch(err => {
        toast.error('Could not load certificates for this student.');
        console.error('Failed to load certificates:', err);
        setLoadingCerts(false);
      });
  }, [selectedId]);

  if (profile?.role !== 'parent') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted to parent accounts.</p>
      </div>
    );
  }

  const selectedChild = children.find(c => c.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Certificates</h1>
        <p className="text-sm text-muted-foreground mt-1">Certificates earned by your children.</p>
      </div>

      {/* Child Selector */}
      {!loadingChildren && children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map(child => (
            <button key={child.id}
              onClick={() => setSelectedId(child.id)}
              className={`px-4 py-2 text-xs font-black uppercase tracking-widest border rounded-none transition-all ${
                selectedId === child.id
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-card border-border text-muted-foreground hover:border-orange-500/50'
              }`}>
              {child.full_name}
            </button>
          ))}
        </div>
      )}

      {!loadingChildren && children.length === 0 && (
        <div className="bg-card border border-border rounded-none p-10 text-center">
          <AcademicCapIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No children linked</p>
        </div>
      )}

      {selectedChild && (
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Certificates for {selectedChild.full_name}
          </p>

          {!selectedChild.user_id && (
            <div className="bg-card border border-border rounded-none p-8 text-center">
              <TrophyIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-black text-foreground uppercase tracking-wider">Not yet registered</p>
              <p className="text-xs text-muted-foreground mt-1">This child has no portal account linked yet.</p>
            </div>
          )}

          {loadingCerts && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-none p-6 animate-pulse">
                  <div className="h-12 w-12 bg-muted rounded-none mb-4" />
                  <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {!loadingCerts && selectedChild.user_id && certs.length === 0 && (
            <div className="bg-card border border-border rounded-none p-8 text-center">
              <TrophyIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-black text-foreground uppercase tracking-wider">No certificates yet</p>
              <p className="text-xs text-muted-foreground mt-1">Certificates will appear here once awarded.</p>
            </div>
          )}

          {!loadingCerts && certs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {certs.map(cert => (
                <div key={cert.id} className="bg-card border border-border rounded-none p-6 hover:bg-white/5 transition-all group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500 to-orange-500 opacity-[0.04] blur-2xl -mr-16 -mt-16 group-hover:scale-150 transition-transform" />

                  {/* Icon */}
                  <div className="w-12 h-12 rounded-none bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-4 relative z-10">
                    <TrophyIcon className="w-6 h-6 text-white" />
                  </div>

                  {/* Info */}
                  <div className="relative z-10">
                    <p className="font-black text-foreground text-sm">{cert.course_title ?? 'Course Certificate'}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Issued: {new Date(cert.issued_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>

                    {/* Cert number */}
                    <div className="mt-3 p-2.5 bg-muted border border-border rounded-none">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Certificate No.</p>
                      <p className="text-xs font-black text-foreground font-mono">{cert.certificate_number}</p>
                    </div>

                    {/* Verification */}
                    <div className="mt-2 flex items-center gap-1.5">
                      <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <p className="text-[10px] text-emerald-400 font-bold">Verified · {cert.verification_code}</p>
                    </div>

                    {/* Download */}
                    {cert.pdf_url && (
                      <a href={cert.pdf_url} target="_blank" rel="noopener noreferrer"
                        className="mt-4 flex items-center justify-center gap-2 w-full px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-[10px] font-black uppercase tracking-widest hover:from-orange-500 hover:to-orange-400 transition-all">
                        Download PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ParentCertificatesPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-card border border-border rounded-none" />}>
      <ParentCertificatesContent />
    </Suspense>
  );
}
