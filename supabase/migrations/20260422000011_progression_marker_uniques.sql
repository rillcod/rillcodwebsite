-- Stage 3b: DB-level dedupe guards for progression-generated records

create unique index if not exists uq_assignments_progression_marker
  on public.assignments ((metadata->>'marker'))
  where metadata ? 'marker';

create unique index if not exists uq_flashcard_decks_progression_marker
  on public.flashcard_decks ((progression_policy_snapshot->>'marker'))
  where progression_policy_snapshot ? 'marker';
