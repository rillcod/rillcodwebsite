'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOffice } from './OfficeContext';

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

export function OfficeCommandBar() {
  const office = useOffice();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const baseCommands = useMemo<CommandItem[]>(
    () => [
      { id: 'desk', label: 'Go to Office Desk', hint: 'Today', run: () => office.setWorkspace('desk') },
      { id: 'cases', label: 'Go to Help Requests', hint: 'Conversations', run: () => office.setWorkspace('cases') },
      { id: 'inbox', label: 'Go to WhatsApp Inbox', hint: 'Conversations', run: () => office.setWorkspace('inbox', 'chats') },
      { id: 'groups', label: 'Go to WhatsApp Groups', hint: 'Conversations', run: () => office.setWorkspace('inbox', 'groups') },
      { id: 'feedback', label: 'Go to Feedback', hint: 'Conversations', run: () => office.setWorkspace('feedback') },
      { id: 'duty', label: 'Go to Duty Roster', hint: 'Today', run: () => office.setWorkspace('duty') },
      { id: 'crm', label: 'Go to Retention (CRM)', hint: 'Relationships', run: () => office.setWorkspace('crm') },
      { id: 'newsletters', label: 'Go to Newsletters', hint: 'Relationships', run: () => office.setWorkspace('newsletters') },
      { id: 'automation', label: 'Go to Automations', hint: 'Operations', run: () => office.setWorkspace('settings', 'automation') },
      { id: 'templates', label: 'Go to Message Templates', hint: 'Operations', run: () => office.setWorkspace('settings', 'templates') },
      { id: 'health', label: 'Go to Scheduled Jobs', hint: 'Operations', run: () => office.setWorkspace('settings', 'health') },
      { id: 'results', label: 'Go to Office Results', hint: 'Operations', run: () => office.setWorkspace('settings', 'results') },
      {
        id: 'academic-exceptions',
        label: 'Open Academic Exceptions',
        hint: 'Academic Office',
        run: () => { window.location.assign('/dashboard/academic#academic-exceptions'); },
      },
      {
        id: 'accountability',
        label: 'Open Accountability Census',
        hint: 'Academic Office',
        run: () => { window.location.assign('/dashboard/accountability'); },
      },
    ],
    [office],
  );

  const attentionCommands = useMemo<CommandItem[]>(() => {
    const rows = office.deskPayload?.attention ?? [];
    return rows
      .filter((row) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return `${row.person} ${row.item} ${row.owner} ${row.reason}`.toLowerCase().includes(q);
      })
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        label: `${row.person} — ${row.item}`,
        hint: row.caseId ? row.reason : `${row.reason} · Scheduled jobs`,
        run: () => {
          if (row.caseId) office.openCase(row.caseId);
          else office.setWorkspace('settings', 'health');
        },
      }));
  }, [office, query]);

  const filteredBase = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseCommands;
    return baseCommands.filter((command) =>
      `${command.label} ${command.hint || ''}`.toLowerCase().includes(q),
    );
  }, [baseCommands, query]);

  const commands = query.trim()
    ? [...filteredBase, ...attentionCommands]
    : baseCommands;

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    },
    [],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]">
      <button type="button" className="absolute inset-0" aria-label="Close command palette" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Jump to a workspace or search attention queue…"
          className="w-full border-b border-border bg-background px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {commands.map((command) => (
            <li key={command.id}>
              <button
                type="button"
                onClick={() => {
                  command.run();
                  setOpen(false);
                  setQuery('');
                }}
                className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted"
              >
                <span className="text-sm font-black">{command.label}</span>
                {command.hint ? <span className="text-[11px] text-muted-foreground">{command.hint}</span> : null}
              </button>
            </li>
          ))}
          {!commands.length ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>
          ) : null}
        </ul>
        <p className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          Tip: Ctrl/Cmd+K opens this palette. Press Esc to close.
        </p>
      </div>
    </div>
  );
}
