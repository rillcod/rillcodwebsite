import { describe, expect, it } from 'vitest';
import { EMBED, SELECT, embed } from '@/lib/supabase/embed-hints';

describe('supabase embed hints', () => {
  it('uses explicit FK names for ambiguous portal_users ↔ classes joins', () => {
    expect(EMBED.portalUserClass).toBe('classes!portal_users_class_id_fkey');
    expect(EMBED.classTeacher).toBe('portal_users!classes_teacher_id_fkey');
  });

  it('routes parent_student_links.student_id to students, not portal_users', () => {
    expect(EMBED.parentLinkStudent).toContain('students!');
    expect(EMBED.parentLinkStudent).not.toContain('portal_users');
  });

  it('covers finance and messaging embeds', () => {
    expect(EMBED.invoicePortalUser).toContain('invoices_portal_user_id_fkey');
    expect(EMBED.paymentTxnPortalUser).toContain('payment_transactions_portal_user_id_fkey');
    expect(EMBED.pttParent).toContain('parent_teacher_threads_parent_id_fkey');
  });

  it('SELECT fragments stay plain strings for Supabase parser', () => {
    expect(SELECT.invoiceWithPortalUser).toContain('portal_users!invoices_portal_user_id_fkey');
    expect(embed(EMBED.portalUserClass, 'name')).toBe('classes!portal_users_class_id_fkey(name)');
  });
});
