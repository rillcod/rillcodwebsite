// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, ClipboardIcon, CheckIcon } from '@/lib/icons';

interface ShareToParentModalProps {
  open: boolean;
  onClose: () => void;
  defaultMessage: string;
  title?: string;
}

export default function ShareToParentModal({ open, onClose, defaultMessage, title }: ShareToParentModalProps) {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [copied, setCopied] = useState(false);

  // Reset message when defaultMessage changes (different assignment opened)
  useEffect(() => { setMessage(defaultMessage); }, [defaultMessage]);

  if (!open) return null;

  const normalisePhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    // Nigerian numbers: 08012345678 → 2348012345678
    if (digits.startsWith('0') && digits.length === 11) return '234' + digits.slice(1);
    // Already has country code
    if (digits.length >= 10) return digits;
    return digits;
  };

  const handleWhatsApp = () => {
    const encoded = encodeURIComponent(message);
    const num = normalisePhone(phone);
    const url = num.length >= 10
      ? `https://wa.me/${num}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    if (navigator.share && !num) {
      navigator.share({ text: message }).catch(() => {});
    } else {
      window.open(url, '_blank');
    }
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-background border border-border shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="text-[10px] font-black text-[#25D366] uppercase tracking-widest flex items-center gap-2">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Share to Parent
            </p>
            {title && <p className="text-sm font-bold text-foreground mt-0.5 truncate">{title}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted transition-colors">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Phone number */}
          <div>
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
              Parent's WhatsApp Number <span className="normal-case font-normal">(optional — leave blank to pick contact in WhatsApp)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 08012345678 or +2348012345678"
              className="w-full px-4 py-2.5 bg-white/5 border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-[#25D366]/50 font-mono"
            />
            {phone && normalisePhone(phone).length >= 10 && (
              <p className="text-[10px] text-[#25D366] mt-1 font-bold">
                → Will open chat with +{normalisePhone(phone)}
              </p>
            )}
          </div>

          {/* Message preview / editor */}
          <div>
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
              Message <span className="normal-case font-normal">(editable — tap to customise)</span>
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={10}
              className="w-full px-4 py-3 bg-white/5 border border-border rounded-none text-sm text-foreground font-mono leading-relaxed focus:outline-none focus:border-[#25D366]/50 resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{message.length} characters</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 border-t border-border flex-shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-3 bg-white/[0.06] border border-border text-muted-foreground hover:text-foreground font-black text-[10px] uppercase tracking-widest transition-all flex-shrink-0"
          >
            {copied
              ? <><CheckIcon className="w-4 h-4 text-emerald-400" /> Copied</>
              : <><ClipboardIcon className="w-4 h-4" /> Copy</>
            }
          </button>
          <button
            onClick={handleWhatsApp}
            disabled={!message.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#20ba59] disabled:opacity-40 text-white font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-[#25D366]/20"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Open in WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
