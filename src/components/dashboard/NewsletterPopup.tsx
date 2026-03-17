'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  XMarkIcon, 
  PrinterIcon, 
  CheckCircleIcon,
  SpeakerWaveIcon 
} from '@/lib/icons';
import { generateReportPDF } from '@/lib/pdf-utils';

import { useSearchParams, useRouter } from 'next/navigation';

interface NewsletterPopupProps {
  userId: string;
}

export default function NewsletterPopup({ userId }: NewsletterPopupProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [newsletter, setNewsletter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!userId) return;
    const specificId = searchParams.get('newsletterId');
    if (specificId) {
      loadSpecificNewsletter(specificId);
    } else {
      checkNewNewsletters();
    }
  }, [userId, searchParams]); // eslint-disable-line

  async function checkNewNewsletters() {
    const { data } = await supabase.from('newsletter_delivery')
      .select(`
        id,
        is_viewed,
        newsletters (
          id,
          title,
          content,
          published_at
        )
      `)
      .eq('user_id', userId)
      .eq('is_viewed', false)
      .order('delivered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const item: any = data;
    if (item && item.newsletters) {
      setNewsletter(item.newsletters);
      setShow(true);
    }
    setLoading(false);
  }

  async function loadSpecificNewsletter(id: string) {
    setLoading(true);
    const { data } = await supabase.from('newsletters')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (data) {
      setNewsletter(data);
      setShow(true);
    }
    setLoading(false);
  }

  async function handleClose() {
    if (!newsletter) return;
    
    // Only mark as viewed if it was not a specific request (optional, but safer)
    if (!searchParams.get('newsletterId')) {
      await supabase.from('newsletter_delivery')
        .update({ is_viewed: true })
        .eq('newsletter_id', newsletter.id)
        .eq('user_id', userId);
    } else {
      // Clear URL param
      const params = new URLSearchParams(window.location.search);
      params.delete('newsletterId');
      router.push(`?${params.toString()}`);
    }
    
    setShow(false);
  }

  async function handleDownloadPDF() {
    if (!pdfRef.current) return;
    await generateReportPDF(pdfRef.current, `${newsletter.title}.pdf`);
  }

  if (!show || !newsletter) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/90 backdrop-blur-md animate-in fade-in duration-500">
      <div className="bg-[#0f0f1a] border border-white/10 rounded-[40px] w-full max-w-5xl h-[90vh] shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Header Bar */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-900/40">
              <SpeakerWaveIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Important Announcement</h3>
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">From Rillcod Academy Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/10"
            >
              <PrinterIcon className="w-4 h-4 text-violet-400" /> Save as PDF
            </button>
            <button 
              onClick={handleClose}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors group"
            >
              <XMarkIcon className="w-6 h-6 text-white/20 group-hover:text-white" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Area */}
        <div className="flex-1 overflow-auto p-4 sm:p-12 bg-black/40">
           <div className="mx-auto rounded-[2rem] bg-white overflow-hidden shadow-2xl"
                  style={{ width: '210mm', minHeight: '297mm', padding: '20mm' }}>
                
                {/* Printable Content (Same as Admin Preview) */}
                <div ref={pdfRef}>
                    {/* Branded Letterhead */}
                    <div style={{ borderBottom: '3px solid #1d4ed8', paddingBottom: '20px', marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <img src="/logo.png" alt="Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#1d4ed8', letterSpacing: '-0.5px' }}>RILLCOD TECHNOLOGIES</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>Coding Today, Innovating Tomorrow</div>
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City &nbsp;·&nbsp; 08116600091</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>OFFICIAL NEWSLETTER</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                          {newsletter.published_at ? new Date(newsletter.published_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="max-w-none text-[#111827]">
                      <h1 className="text-3xl font-black text-[#111827] mb-8">{newsletter.title}</h1>
                      <div className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap font-serif bg-white p-4 rounded-xl border border-gray-100">
                        {newsletter.content}
                      </div>
                    </div>

                    {/* Signature */}
                    <div style={{ marginTop: '60px', borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                          <img src="/images/signature.png" alt="Official Signature" style={{ width: '150px', marginBottom: '10px' }} />
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#111827'  }}>THE ADMINISTRATOR</div>
                          <div style={{ fontSize: '11px', color: '#6b7280'  }}>Rillcod Academy Management</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                           <div style={{ width: '100px', height: '100px', border: '1px solid #f3f4f6', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', textTransform: 'uppercase', fontSize: '10px', color: '#e5e7eb' }}>STAMP SPACE</div>
                        </div>
                      </div>
                    </div>
                </div>
           </div>
        </div>

        {/* Footer Action */}
        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex justify-center">
            <button 
              onClick={handleClose}
              className="flex items-center gap-2 px-10 py-4 bg-violet-600 hover:bg-violet-500 rounded-2xl text-sm font-black transition-all shadow-xl shadow-violet-900/40"
            >
              <CheckCircleIcon className="w-5 h-5" /> I Have Read the Newsletter
            </button>
        </div>

        <style jsx global>{`
          .prose h1, .prose h2, .prose h3 { color: #111827 !important; margin-bottom: 0.5em; }
          .prose p { margin-bottom: 1em; }
          .prose ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; }
        `}</style>
      </div>
    </div>
  );
}
