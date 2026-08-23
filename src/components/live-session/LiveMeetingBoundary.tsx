'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import BodyPortal from '@/components/ui/BodyPortal';

type Props = {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
  children: ReactNode;
};

type State = { failed: boolean };

/** Keeps a stale or failed classroom chunk from taking down the dashboard. */
export default class LiveMeetingBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[live-classroom] client module failed', {
      message: error.message,
      sessionId: this.props.sessionId,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const backupUrl = `https://meet.jit.si/Rillcod-${this.props.sessionId.slice(0, 12)}`;

    return (
      <BodyPortal>
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0a0a0a] p-5 text-white">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-6 text-center shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Live classroom recovery</p>
            <h2 className="mt-3 text-xl font-bold">The classroom needs to reconnect</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              {this.props.sessionTitle} is still available. Reload the classroom, use the backup room, or return to the session list.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-500">
                Reload classroom
              </button>
              <button type="button" onClick={() => window.open(backupUrl, '_blank', 'noopener,noreferrer')} className="min-h-11 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20">
                Open backup room
              </button>
              <button type="button" onClick={this.props.onClose} className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10 sm:col-span-2">
                Return to live sessions
              </button>
            </div>
          </div>
        </div>
      </BodyPortal>
    );
  }
}
