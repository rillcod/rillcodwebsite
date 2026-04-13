type DbClient = {
  from: (table: string) => any;
};

function makeCode(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function generateUniqueCode(db: DbClient, column: 'card_number' | 'verification_code', prefix: string) {
  for (let i = 0; i < 6; i++) {
    const code = makeCode(prefix);
    const { data } = await db.from('identity_cards').select('id').eq(column, code).maybeSingle();
    if (!data?.id) return code;
  }
  return makeCode(prefix);
}

export async function ensureStudentCardIssued(
  db: DbClient,
  args: {
    holderId: string;
    schoolId?: string | null;
    classId?: string | null;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { holderId, schoolId = null, classId = null, actorId = null, metadata = {} } = args;

  const { data: existing } = await db
    .from('identity_cards')
    .select('id, status')
    .eq('holder_type', 'student')
    .eq('holder_id', holderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { id: existing.id, created: false };
  }

  const card_number = await generateUniqueCode(db, 'card_number', 'CARD');
  const verification_code = await generateUniqueCode(db, 'verification_code', 'RC');

  const { data: created, error } = await db
    .from('identity_cards')
    .insert({
      holder_type: 'student',
      holder_id: holderId,
      school_id: schoolId,
      class_id: classId,
      card_number,
      verification_code,
      status: 'issued',
      template_type: 'student',
      issued_at: new Date().toISOString(),
      created_by: actorId,
      updated_by: actorId,
      metadata,
    })
    .select('id')
    .single();

  if (error) throw error;

  await db.from('card_audit_logs').insert({
    card_id: created.id,
    actor_id: actorId,
    school_id: schoolId,
    action: 'auto_issue:registration',
    entity: 'identity_card',
    details: { source: metadata.source ?? 'registration' },
  });

  return { id: created.id, created: true };
}

