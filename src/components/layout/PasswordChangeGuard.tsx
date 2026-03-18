// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  KeyIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
} from '@/lib/icons';

/**
 * Renders a full-screen, non-dismissible modal whenever the logged-in user's
 * auth metadata contains  must_change_password: true.
 * This flag is set by the bulk-register API for every newly created student.
 * The modal clears the flag after a successful password update.
 */
export default function PasswordChangeGuard() {
  const { user, refreshProfile } = useAuth();

  const [show,      setShow]      = useState(false);
  const [newPw,     setNewPw]     = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState(false);

  useEffect(() => {
    if (user?.user_metadata?.must_change_password === true) {
      setShow(true);
    }
  }, [user?.id, user?.user_metadata?.must_change_password]);

  if (!show || success) return null;

  const mismatch  = confirmPw.length > 0 && confirmPw !== newPw;
  const canSubmit = newPw.length >= 8 && newPw === confirmPw;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      // Update password AND clear the flag in user_metadata atomically
      const { error: err } = await supabase.auth.updateUser({
        password: newPw,
        data: { must_change_password: false },
      });
      if (err) throw err;
      setSuccess(true);
      setShow(false);
      await refreshProfile();
    } catch (err: any) {
      setError(err.message ?? 'Failed to update password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-[#0d1526] border border-amber-500/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Banner */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-4 flex items-center gap-3">
          <KeyIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-amber-300 font-black text-sm">Action Required — Set Your Password</p>
            <p className="text-amber-300/60 text-xs mt-0.5">Your account was created with a temporary password.</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Choose a secure personal password. You will use this every time you sign in to{' '}
            <strong className="text-foreground">Rillcod Technologies</strong>. Do not share it with anyone.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* New password */}
            <div>
              <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  autoFocus
                  placeholder="Minimum 8 characters"
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-amber-500/60 pr-11 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
              {/* Strength indicator */}
              {newPw.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {[4, 7, 10, 13].map((threshold, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        newPw.length > threshold
                          ? ['bg-rose-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-500'][i]
                          : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-2">
                Confirm Password
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                placeholder="Repeat your new password"
                className={`w-full px-4 py-3 bg-card shadow-sm border rounded-xl text-foreground text-sm focus:outline-none transition-colors ${
                  mismatch
                    ? 'border-rose-500/60 focus:border-rose-500'
                    : confirmPw && !mismatch
                    ? 'border-emerald-500/40 focus:border-emerald-500'
                    : 'border-border focus:border-amber-500/60'
                }`}
              />
              {mismatch && (
                <p className="text-rose-400 text-xs mt-1.5">Passwords do not match</p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !canSubmit}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-foreground font-black rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <ShieldCheckIcon className="w-4 h-4" />
              {saving ? 'Saving…' : 'Set My Password & Continue'}
            </button>
          </form>

          <p className="text-center text-muted-foreground text-[11px]">
            This dialog cannot be skipped. Contact your teacher if you need help.
          </p>
        </div>
      </div>
    </div>
  );
}
