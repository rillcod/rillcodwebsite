// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, ClipboardIcon, CheckIcon, PlusIcon, TrashIcon } from '@/lib/icons';

const WA_ICON = (
  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

type SavedGroup = { id: string; name: string; link: string };
const STORAGE_KEY = 'rillcod_wa_groups';

function loadGroups(): SavedGroup[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveGroups(groups: SavedGroup[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(groups)); } catch {}
}

interface ShareToParentModalProps {
  open: boolean;
  onClose: () => void;
  defaultMessage: string;
  title?: string;
}

export default function ShareToParentModal({ open, onClose, defaultMessage, title }: ShareToParentModalProps) {
  const [tab, setTab] = useState<'individual' | 'group'>('individual');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [copied, setCopied] = useState(false);
  const [copiedGroup, setCopiedGroup] = useState(false);

  // Group state
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLink, setNewGroupLink] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);

  useEffect(() => { setMessage(defaultMessage); }, [defaultMessage]);
  useEffect(() => { if (open) setGroups(loadGroups()); }, [open]);

  if (!open) return null;

  const normalisePhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) return '234' + digits.slice(1);
    if (digits.length >= 10) return digits;
    return digits;
  };

  const handleIndividualShare = () => {
    const encoded = encodeURIComponent(message);
    const num = normalisePhone(phone);
    if (navigator.share && !num) {
      navigator.share({ text: message }).catch(() => {});
    } else {
      window.open(num.length >= 10 ? `https://wa.me/${num}?text=${encoded}` : `https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  const handleGroupShare = (group: SavedGroup) => {
    // Copy message then open the group link
    navigator.clipboard?.writeText(message).then(() => {
      setCopiedGroup(true);
      setTimeout(() => setCopiedGroup(false), 3000);
    });
    // Open the group link after a short delay so copy registers first
    setTimeout(() => window.open(group.link, '_blank'), 150);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveGroup = () => {
    if (!newGroupName.trim() || !newGroupLink.trim()) return;
    const link = newGroupLink.trim();
    if (!link.startsWith('https://chat.whatsapp.com/') && !link.startsWith('https://wa.me/')) {
      alert('Paste a valid WhatsApp group invite link (starts with chat.whatsapp.com)');
      return;
    }
    const updated = [...groups, { id: Date.now().toString(), name: newGroupName.trim(), link }];
    setGroups(updated);
    saveGroups(updated);
    setNewGroupName('');
    setNewGroupLink('');
    setAddingGroup(false);
  };

  const handleDeleteGroup = (id: string) => {
    const updated = groups.filter(g => g.id !== id);
    setGroups(updated);
    saveGroups(updated);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-background border border-border shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="text-[10px] font-black text-[#25D366] uppercase tracking-widest flex items-center gap-2">
              {WA_ICON} Share to Parents
            </p>
            {title && <p className="text-sm font-bold text-foreground mt-0.5 truncate max-w-[300px]">{title}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted transition-colors">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border flex-shrink-0">
          {(['individual', 'group'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                tab === t ? 'text-[#25D366] border-b-2 border-[#25D366]' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {t === 'individual' ? '👤 Individual Parent' : '👥 Class Group'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Individual tab ── */}
          {tab === 'individual' && (
            <>
              <div>
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
                  Parent's WhatsApp Number
                  <span className="normal-case font-normal ml-1">(optional — leave blank to pick from contacts)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. 08012345678"
                  className="w-full px-4 py-2.5 bg-white/5 border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-[#25D366]/50 font-mono"
                />
                {phone && normalisePhone(phone).length >= 10 && (
                  <p className="text-[10px] text-[#25D366] mt-1 font-bold">→ Opens chat with +{normalisePhone(phone)}</p>
                )}
              </div>
              <MessageEditor message={message} onChange={setMessage} />
            </>
          )}

          {/* ── Group tab ── */}
          {tab === 'group' && (
            <>
              {/* Saved groups */}
              {groups.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Saved Groups</p>
                  {groups.map(g => (
                    <div key={g.id} className="flex items-center gap-2 p-3 bg-white/[0.04] border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{g.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{g.link}</p>
                      </div>
                      <button
                        onClick={() => handleGroupShare(g)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366] hover:bg-[#20ba59] text-white font-black text-[10px] uppercase tracking-widest transition-all flex-shrink-0"
                      >
                        {WA_ICON} Send
                      </button>
                      <button onClick={() => handleDeleteGroup(g.id)}
                        className="p-2 text-rose-400/60 hover:text-rose-400 transition-colors flex-shrink-0">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {copiedGroup && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-bold">
                      <CheckIcon className="w-4 h-4" />
                      Message copied — paste it in the WhatsApp group after it opens
                    </div>
                  )}
                </div>
              )}

              {/* How to get group link hint */}
              {groups.length === 0 && !addingGroup && (
                <div className="bg-white/[0.03] border border-border p-4 text-sm text-muted-foreground space-y-1">
                  <p className="font-bold text-foreground text-xs">No saved groups yet</p>
                  <p className="text-xs">To get your WhatsApp group link: open the group → tap the group name → <strong>Invite via link</strong> → Copy link.</p>
                  <p className="text-xs mt-1">Paste it below and save — it stays on this device so you only do this once per group.</p>
                </div>
              )}

              {/* Add group form */}
              {addingGroup ? (
                <div className="space-y-3 border border-[#25D366]/30 p-4 bg-[#25D366]/5">
                  <p className="text-[10px] font-black text-[#25D366] uppercase tracking-widest">Add WhatsApp Group</p>
                  <input
                    type="text"
                    placeholder="Group name (e.g. JSS1A Parents)"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-[#25D366]/50"
                  />
                  <input
                    type="url"
                    placeholder="https://chat.whatsapp.com/..."
                    value={newGroupLink}
                    onChange={e => setNewGroupLink(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-[#25D366]/50 font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setAddingGroup(false)}
                      className="flex-1 py-2 border border-border text-muted-foreground text-xs font-black uppercase tracking-widest hover:text-foreground transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleSaveGroup}
                      disabled={!newGroupName.trim() || !newGroupLink.trim()}
                      className="flex-1 py-2 bg-[#25D366] hover:bg-[#20ba59] disabled:opacity-40 text-white text-xs font-black uppercase tracking-widest transition-colors">
                      Save Group
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingGroup(true)}
                  className="flex items-center gap-2 w-full py-3 border border-dashed border-[#25D366]/30 text-[#25D366] text-xs font-black uppercase tracking-widest hover:bg-[#25D366]/5 transition-colors justify-center">
                  <PlusIcon className="w-3.5 h-3.5" /> Add WhatsApp Group
                </button>
              )}

              <MessageEditor message={message} onChange={setMessage} />
            </>
          )}
        </div>

        {/* Actions footer */}
        <div className="flex gap-2 p-4 border-t border-border flex-shrink-0">
          <button onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-3 bg-white/[0.06] border border-border text-muted-foreground hover:text-foreground font-black text-[10px] uppercase tracking-widest transition-all flex-shrink-0">
            {copied ? <><CheckIcon className="w-4 h-4 text-emerald-400" /> Copied</> : <><ClipboardIcon className="w-4 h-4" /> Copy</>}
          </button>
          {tab === 'individual' && (
            <button onClick={handleIndividualShare} disabled={!message.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#20ba59] disabled:opacity-40 text-white font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-[#25D366]/20">
              {WA_ICON} Open in WhatsApp
            </button>
          )}
          {tab === 'group' && groups.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-3 bg-white/[0.04] border border-border text-muted-foreground text-xs font-bold uppercase tracking-widest">
              Add a group above to share
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageEditor({ message, onChange }: { message: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
        Message <span className="normal-case font-normal">(tap to edit)</span>
      </label>
      <textarea
        value={message}
        onChange={e => onChange(e.target.value)}
        rows={9}
        className="w-full px-4 py-3 bg-white/5 border border-border text-sm text-foreground font-mono leading-relaxed focus:outline-none focus:border-[#25D366]/50 resize-none"
      />
      <p className="text-[10px] text-muted-foreground mt-1">{message.length} chars</p>
    </div>
  );
}
