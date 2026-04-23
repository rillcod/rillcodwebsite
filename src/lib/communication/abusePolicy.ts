import { createClient } from '@supabase/supabase-js';

type SenderRole = 'student' | 'parent' | 'teacher' | 'admin' | 'school';
type Channel = 'whatsapp_direct' | 'inapp_direct' | 'broadcast' | 'group';

type CommunicationPolicy = {
  whatsapp_primary_mode: boolean;
  allow_inapp_fallback: boolean;
  student_dm_daily_limit: number;
  parent_dm_daily_limit: number;
  cooldown_seconds_between_messages: number;
  blocked_keywords_enabled: boolean;
  blocked_keywords_list: string;
  auto_escalate_after_reports: number;
  require_staff_assignment_for_external_wa: boolean;
};

type EvaluateInput = {
  senderId: string;
  senderRole: SenderRole;
  channel: Channel;
  message: string;
  targetConversationId?: string | null;
};

type EvaluateOutput = {
  allowed: boolean;
  reason?: string;
  remainingDaily?: number;
  cooldownRemainingSeconds?: number;
  recommendation?: 'use_group_or_broadcast' | 'none';
};

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const DEFAULT_POLICY: CommunicationPolicy = {
  whatsapp_primary_mode: true,
  allow_inapp_fallback: true,
  student_dm_daily_limit: 12,
  parent_dm_daily_limit: 20,
  cooldown_seconds_between_messages: 20,
  blocked_keywords_enabled: true,
  blocked_keywords_list: 'abuse,insult,threat,spam',
  auto_escalate_after_reports: 3,
  require_staff_assignment_for_external_wa: true,
};

function startOfDayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function parseKeywords(raw: string) {
  return raw
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

function messageHasBlockedKeyword(message: string, rawKeywords: string): string | null {
  const m = message.toLowerCase();
  const words = parseKeywords(rawKeywords);
  for (const word of words) {
    if (word.length >= 3 && m.includes(word)) return word;
  }
  return null;
}

function limitForRole(policy: CommunicationPolicy, role: SenderRole) {
  if (role === 'student') return Math.max(1, policy.student_dm_daily_limit);
  if (role === 'parent') return Math.max(1, policy.parent_dm_daily_limit);
  return 9999;
}

export async function loadCommunicationPolicy() {
  const admin = adminClient();
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'lms.ops.communication')
    .maybeSingle();
  if (!data?.value) return DEFAULT_POLICY;
  try {
    const parsed = JSON.parse(data.value) as Partial<CommunicationPolicy>;
    return { ...DEFAULT_POLICY, ...parsed };
  } catch {
    return DEFAULT_POLICY;
  }
}

export async function getSenderUsageToday(senderId: string) {
  const admin = adminClient();
  const dayStart = startOfDayIso();
  const { data } = await admin
    .from('communication_rate_limits')
    .select('daily_count, last_message_at')
    .eq('sender_id', senderId)
    .eq('day_bucket', dayStart)
    .maybeSingle();
  return {
    dailyCount: Number(data?.daily_count ?? 0),
    lastMessageAt: data?.last_message_at ? String(data.last_message_at) : null,
    dayBucket: dayStart,
  };
}

async function logAbuseEvent(input: {
  senderId: string;
  senderRole: string;
  channel: string;
  eventType: string;
  reason: string;
  targetConversationId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = adminClient();
  await admin.from('communication_abuse_events').insert({
    sender_id: input.senderId,
    sender_role: input.senderRole,
    channel: input.channel,
    event_type: input.eventType,
    reason: input.reason,
    target_conversation_id: input.targetConversationId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function evaluateAndTrackMessage(input: EvaluateInput): Promise<EvaluateOutput> {
  const policy = await loadCommunicationPolicy();
  const usage = await getSenderUsageToday(input.senderId);
  const senderLimit = limitForRole(policy, input.senderRole);

  if ((input.senderRole === 'student' || input.senderRole === 'parent') && input.channel === 'inapp_direct' && !policy.allow_inapp_fallback) {
    await logAbuseEvent({
      senderId: input.senderId,
      senderRole: input.senderRole,
      channel: input.channel,
      eventType: 'blocked_channel',
      reason: 'inapp_fallback_disabled',
      targetConversationId: input.targetConversationId,
    });
    return { allowed: false, reason: 'in-app fallback is disabled by policy' };
  }

  if (policy.blocked_keywords_enabled && (input.senderRole === 'student' || input.senderRole === 'parent')) {
    const hit = messageHasBlockedKeyword(input.message, policy.blocked_keywords_list);
    if (hit) {
      await logAbuseEvent({
        senderId: input.senderId,
        senderRole: input.senderRole,
        channel: input.channel,
        eventType: 'blocked_keyword',
        reason: `keyword:${hit}`,
        targetConversationId: input.targetConversationId,
        metadata: { keyword: hit },
      });
      return { allowed: false, reason: 'Message blocked by safety policy' };
    }
  }

  if (usage.lastMessageAt) {
    const last = new Date(usage.lastMessageAt).getTime();
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - last) / 1000);
    const cooldown = Math.max(0, policy.cooldown_seconds_between_messages - elapsedSeconds);
    if (cooldown > 0 && (input.senderRole === 'student' || input.senderRole === 'parent')) {
      await logAbuseEvent({
        senderId: input.senderId,
        senderRole: input.senderRole,
        channel: input.channel,
        eventType: 'cooldown_block',
        reason: `cooldown:${cooldown}s`,
        targetConversationId: input.targetConversationId,
      });
      return { allowed: false, reason: 'Please wait before sending another message', cooldownRemainingSeconds: cooldown };
    }
  }

  if ((input.senderRole === 'student' || input.senderRole === 'parent') && usage.dailyCount >= senderLimit) {
    await logAbuseEvent({
      senderId: input.senderId,
      senderRole: input.senderRole,
      channel: input.channel,
      eventType: 'daily_limit_block',
      reason: `limit:${senderLimit}`,
      targetConversationId: input.targetConversationId,
    });
    return {
      allowed: false,
      reason: 'Daily messaging limit reached',
      remainingDaily: 0,
      recommendation: 'use_group_or_broadcast',
    };
  }

  const nextCount = usage.dailyCount + 1;
  const remaining = Math.max(0, senderLimit - nextCount);
  const admin = adminClient();
  await admin.from('communication_rate_limits').upsert({
    sender_id: input.senderId,
    sender_role: input.senderRole,
    day_bucket: usage.dayBucket,
    daily_count: nextCount,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'sender_id,day_bucket' });

  return {
    allowed: true,
    remainingDaily: remaining,
    recommendation: nextCount >= Math.floor(senderLimit * 0.8) ? 'use_group_or_broadcast' : 'none',
  };
}

export async function createCommunicationReport(input: {
  reporterId: string;
  reporterRole: string;
  targetConversationId?: string | null;
  targetMessageId?: string | null;
  reason: string;
  details?: string | null;
}) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('communication_reports')
    .insert({
      reporter_id: input.reporterId,
      reporter_role: input.reporterRole,
      target_conversation_id: input.targetConversationId ?? null,
      target_message_id: input.targetMessageId ?? null,
      reason: input.reason,
      details: input.details ?? null,
      status: 'open',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const policy = await loadCommunicationPolicy();
  const threshold = Math.max(1, policy.auto_escalate_after_reports);
  if (input.targetConversationId) {
    const { count } = await admin
      .from('communication_reports')
      .select('id', { count: 'exact', head: true })
      .eq('target_conversation_id', input.targetConversationId)
      .eq('status', 'open');
    if ((count ?? 0) >= threshold) {
      await admin.from('communication_escalations').insert({
        target_conversation_id: input.targetConversationId,
        trigger: 'report_threshold',
        trigger_count: count ?? 0,
        status: 'open',
      });
    }
  }
  return data;
}
