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
import { renderMarkdown } from '@/lib/newsletter-markdown';

import { useSearchParams, useRouter } from 'next/navigation';
import { brandContact } from '@/config/brand';

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
      <div role="dialog" aria-modal="true" className="bg-background border border-border rounded-[40px] w-full max-w-5xl h-[90vh] shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Header Bar */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/40">
              <SpeakerWaveIcon className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-black text-foreground">Important Announcement</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">From Rillcod Technologies Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-card shadow-sm hover:bg-muted rounded-xl text-xs font-bold transition-all border border-border"
            >
              <PrinterIcon className="w-4 h-4 text-primary" /> Save as PDF
            </button>
            <button 
              onClick={handleClose}
              className="p-2 hover:bg-muted rounded-xl transition-colors group"
            >
              <XMarkIcon className="w-6 h-6 text-muted-foreground group-hover:text-foreground" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Area */}
        <div className="flex-1 overflow-auto p-4 sm:p-12 bg-black/40">
           <div className="mx-auto rounded-[2rem] bg-card overflow-hidden shadow-2xl"
                  style={{ width: '210mm', minHeight: '297mm', padding: '20mm' }}>
                
                {/* Printable Content (Premium Letterhead) */}
                <div ref={pdfRef}>
                    {/* Branded Letterhead */}
                    <div style={{ borderBottom: '4px solid #1a1a1a', paddingBottom: '25px', marginBottom: '40px', display: 'flex', alignItems: 'center', gap: '30px' }}>
                      <div style={{ width: '90px', height: '90px', background: '#fff', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
                        <img src="/logo.png" alt="Rillcod" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#1a1a1a', letterSpacing: '-1px', textTransform: 'uppercase' }}>RILLCOD TECHNOLOGIES</div>
                        <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '2px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' }}>Official Institutional Communication</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '6px', fontWeight: 500 }}>26 Ogiesoba Avenue, Benin City &nbsp;·&nbsp; academy.rillcod.com &nbsp;·&nbsp; {brandContact.phoneShort}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: 900, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '1px' }}>VOL. {new Date().getFullYear()}</div>
                        <div style={{ fontSize: '10px', color: '#1a1a1a', marginTop: '4px', fontWeight: 800, textTransform: 'uppercase' }}>
                          {newsletter.published_at ? new Date(newsletter.published_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="max-w-none">
                      <div style={{ color: '#1a1a1a', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '15px' }}>Topic / Subject</div>
                      <h1 style={{ fontSize: '38px', fontWeight: 900, color: '#1a1a1a', marginBottom: '40px', lineHeight: '1.1', textTransform: 'uppercase', letterSpacing: '-1.5px' }}>
                        {newsletter.title}
                      </h1>
                      
                      <div
                        className="nl-body"
                        style={{ fontSize: '12pt', lineHeight: '1.8', color: '#374151', fontFamily: 'Georgia, serif', textAlign: 'justify' }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(newsletter.content || '') }}
                      />
                    </div>

                    {/* Signature */}
                    <div style={{ marginTop: '80px', borderTop: '2px solid #f3f4f6', paddingTop: '30px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                          <img src="/images/signature.png" alt="Official Signature" style={{ width: '180px', position: 'absolute', top: '-50px', left: '0', opacity: 0.8, mixBlendMode: 'multiply' }} />
                          <div style={{ marginTop: '20px' }}>
                            <div style={{ fontSize: '16px', fontWeight: 900, color: '#1a1a1a', textTransform: 'uppercase' }}>The Administrator</div>
                            <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Rillcod Technologies Executive</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                           <div style={{ width: '120px', height: '120px', border: '2px dashed #e5e7eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: '10px', color: '#d1d5db', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                             Official<br/>Academy<br/>Stamp
                           </div>
                        </div>
                      </div>
                    </div>
                </div>

           </div>
        </div>

        {/* Footer Action */}
        <div className="p-6 border-t border-border bg-white/[0.02] flex justify-center">
            <button 
              onClick={handleClose}
              className="flex items-center gap-2 px-10 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-black transition-all shadow-xl shadow-primary/40"
            >
              <CheckCircleIcon className="w-5 h-5" /> I Have Read the Newsletter
            </button>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          .nl-body { font-family: Georgia, serif; }
          .nl-h1 { font-size: 20pt; font-weight: 900; color: #111827; text-transform: uppercase; letter-spacing: -0.5px; margin: 1.2em 0 0.4em; }
          .nl-h2 { font-size: 14pt; font-weight: 800; color: #1f2937; text-transform: uppercase; letter-spacing: 0.5px; margin: 1em 0 0.3em; border-bottom: 1.5px solid #e5e7eb; padding-bottom: 4px; }
          .nl-h3 { font-size: 11pt; font-weight: 700; color: #374151; margin: 0.8em 0 0.2em; }
          .nl-p { margin: 0 0 0.9em; }
          .nl-ul { list-style-type: disc; padding-left: 1.6em; margin: 0 0 0.9em; }
          .nl-ol { list-style-type: decimal; padding-left: 1.6em; margin: 0 0 0.9em; }
          .nl-ul li, .nl-ol li { margin-bottom: 0.25em; }
          .nl-hr { border: none; border-top: 1.5px solid #e5e7eb; margin: 1.2em 0; }
          .nl-gap { height: 0.5em; }
          .nl-body strong { font-weight: 700; }
          .nl-body em { font-style: italic; }
          .nl-body code { font-family: monospace; background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
        `}} />
      </div>
    </div>
  );
}
