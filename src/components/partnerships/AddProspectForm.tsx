"use client";

/**
 * Adding a school you have not won yet.
 *
 * The desk was only usable against schools already in the system, which made a
 * prospecting tool that could only talk to existing customers. A proposal is
 * what you send to somebody who is not a partner — so this is the door in.
 *
 * A new school is created as `pending`, which is what this platform already
 * calls a school that has applied but is not partnered. That matters beyond
 * tidiness: the proposal's proof band counts only `approved` schools, so a
 * prospect can never be counted as a partner in the very document being sent to
 * win them. Approving them is a separate, deliberate act on the Schools page.
 *
 * It posts to `/api/schools`, the endpoint that already creates schools and
 * files a CRM lead, rather than adding a second way to make one.
 */

import { useState } from "react";
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  XMarkIcon,
} from "@/lib/icons";
import type { SchoolRow } from "./types";

const INPUT =
  "w-full px-3.5 py-2 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5";

type Draft = {
  name: string;
  address: string;
  city: string;
  state: string;
  contact_person: string;
  email: string;
  phone: string;
  student_count: string;
};

const EMPTY: Draft = {
  name: "",
  address: "",
  city: "",
  state: "Edo",
  contact_person: "",
  email: "",
  phone: "",
  student_count: "",
};

export function AddProspectForm({
  onAdded,
  onSelectExisting,
}: {
  /** Hands back the created school so the desk can select it immediately. */
  onAdded: (school: SchoolRow) => void | Promise<void>;
  /** A school already on file — select it rather than making a second one. */
  onSelectExisting: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function close() {
    setOpen(false);
    setDraft(EMPTY);
    setError("");
    setDuplicate(null);
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) {
      setError("A school needs a name.");
      return;
    }
    setSaving(true);
    setError("");
    setDuplicate(null);
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          address: draft.address.trim() || null,
          city: draft.city.trim() || null,
          state: draft.state.trim() || null,
          contact_person: draft.contact_person.trim() || null,
          email: draft.email.trim() || null,
          phone: draft.phone.trim() || null,
          student_count: draft.student_count ? Number(draft.student_count) : null,
          // A prospect, not a partner. Approving is a separate decision.
          status: "pending",
          enrollment_types: ["school"],
        }),
      });
      const json = await res.json();

      if (res.status === 409) {
        setDuplicate(json.existing ?? null);
        setError(json.error || "That school is already on file.");
        return;
      }
      if (!res.ok) throw new Error(json.error || "Could not add that school.");

      await onAdded({
        id: String(json.school?.id ?? ""),
        name,
        city: draft.city.trim() || null,
        state: draft.state.trim() || null,
        student_count: draft.student_count ? Number(draft.student_count) : null,
        status: "pending",
      });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that school.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
      >
        <PlusIcon className="w-4 h-4" /> Add a school to pitch
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">New prospect</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Added as pending, so it is not counted as a partner on the proposal you send it.
          </p>
        </div>
        <button
          onClick={close}
          aria-label="Cancel"
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className={LABEL} htmlFor="prospect-name">
          School name
        </label>
        <input
          id="prospect-name"
          className={INPUT}
          placeholder="Grace Height Academy"
          value={draft.name}
          autoFocus
          onChange={(e) => set("name", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="prospect-address">
          Address (if you have it)
        </label>
        <input
          id="prospect-address"
          className={INPUT}
          placeholder="12 Airport Road, off Sapele Road"
          value={draft.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={LABEL} htmlFor="prospect-city">
            Town
          </label>
          <input
            id="prospect-city"
            className={INPUT}
            placeholder="Benin City"
            value={draft.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="prospect-state">
            State
          </label>
          <input
            id="prospect-state"
            className={INPUT}
            value={draft.state}
            onChange={(e) => set("state", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={LABEL} htmlFor="prospect-contact">
            Contact
          </label>
          <input
            id="prospect-contact"
            className={INPUT}
            placeholder="Proprietor or head"
            value={draft.contact_person}
            onChange={(e) => set("contact_person", e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="prospect-roll">
            Approx. students
          </label>
          <input
            id="prospect-roll"
            className={INPUT}
            inputMode="numeric"
            placeholder="140"
            value={draft.student_count}
            onChange={(e) => set("student_count", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={LABEL} htmlFor="prospect-email">
            Email
          </label>
          <input
            id="prospect-email"
            className={INPUT}
            placeholder="head@school.com"
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="prospect-phone">
            Phone
          </label>
          <input
            id="prospect-phone"
            className={INPUT}
            placeholder="0801 234 5678"
            value={draft.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        The roll drives what the proposal says the programme is worth to them, and the email is
        where it gets sent. Both can be filled in later.
      </p>

      {error && (
        <div className="text-xs text-destructive flex items-start gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-px" />
          <div>
            {error}
            {duplicate && (
              <button
                onClick={() => {
                  onSelectExisting(duplicate.id);
                  close();
                }}
                className="block mt-1 text-primary hover:underline font-medium"
              >
                Open {duplicate.name} instead
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={save}
          disabled={saving || !draft.name.trim()}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground transition-colors flex items-center gap-2"
        >
          {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
          Add and open
        </button>
        <button
          onClick={close}
          className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
