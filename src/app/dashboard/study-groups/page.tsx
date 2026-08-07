'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { 
  ChatBubbleLeftRightIcon, 
  UserGroupIcon, 
  PlusIcon, 
  XMarkIcon, 
  UserIcon,
  AcademicCapIcon,
  SparklesIcon
} from '@/lib/icons';
import Link from 'next/link';
import { toast } from 'sonner';

interface StudyGroup {
  id: string;
  name: string;
  course_id: string | null;
  status: string;
  created_at: string;
  assigned_teacher_id: string | null;
  school_id: string | null;
  grade_level: string | null;
  study_group_members: { count: number }[];
  assigned_teacher?: { full_name: string };
}

export default function StudyGroupsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [joinLoading, setJoinLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isStaff = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    setLoading(true);
    try {
      const res = await fetch('/api/study-groups');
      const json = await res.json();
      setGroups(json.data ?? []);
    } catch {
      toast.error("Failed to load study groups");
    } finally {
      setLoading(false);
    }
  }

  async function createGroup() {
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    
    let assignedTeacherId = null;
    if (profile?.role === 'student' && profile?.school_id) {
      const db = createClient();
      const { data: teachers } = await db
        .from('portal_users')
        .select('id')
        .eq('role', 'teacher')
        .eq('school_id', profile.school_id)
        .limit(1);
      
      if (teachers && teachers.length > 0) {
        assignedTeacherId = teachers[0].id;
      }
    }
    
    try {
      const res = await fetch('/api/study-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: name.trim(),
          assigned_teacher_id: assignedTeacherId,
          school_id: profile?.school_id,
          grade_level: profile?.grade_level
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to create group'); setCreating(false); return; }
      setGroups(prev => [json.data, ...prev]);
      setName('');
      setShowCreate(false);
      toast.success("Study group created successfully!");
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  }

  async function joinGroup(id: string) {
    setJoinLoading(id);
    try {
      const res = await fetch(`/api/study-groups/${id}/join`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message || json.error || 'Failed to join'); setJoinLoading(null); return; }
      toast.success("Joined study group!");
      await loadGroups();
    } catch {
      toast.error("Failed to join group");
    } finally {
      setJoinLoading(null);
    }
  }

  if (authLoading) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 mobile-page-root">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Loading study groups...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card border border-border p-6 rounded-3xl shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-2 bg-primary/10 rounded-xl border border-primary/20 text-primary">
                <UserGroupIcon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Collaborative Workspace</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight">Peer Study Groups</h1>
            <p className="text-muted-foreground text-sm mt-1">Collaborate with classmates in real-time with shared live chat and interactive code pads.</p>
          </div>
          
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-primary hover:opacity-90 text-primary-foreground text-xs font-black uppercase tracking-widest rounded-2xl shadow-md transition-all shrink-0"
          >
            <PlusIcon className="w-4 h-4" /> Create Group
          </button>
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="bg-card border border-border rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl max-h-[85dvh] overflow-y-auto overscroll-contain">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <SparklesIcon className="w-4 h-4" />
                  </div>
                  <h2 className="font-black text-foreground text-base">New Peer Study Group</h2>
                </div>
                <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Group Title *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Python & AI Study Squad"
                  className="w-full bg-background border border-input text-foreground px-4 py-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-bold"
                  onKeyDown={e => e.key === 'Enter' && createGroup()}
                />
              </div>

              {error && <p className="text-destructive text-xs font-bold bg-destructive/10 border border-destructive/20 rounded-xl p-3">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-3 bg-muted text-foreground font-black uppercase tracking-widest rounded-xl hover:bg-secondary text-xs transition-colors">
                  Cancel
                </button>
                <button onClick={createGroup} disabled={!name.trim() || creating} className="flex-[2] py-3 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-xl text-xs hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2">
                  {creating ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : 'Create Group'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Groups list */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Loading study groups...</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-20 bg-card border-2 border-dashed border-border rounded-3xl p-8 max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground/40 border border-border">
              <UserGroupIcon className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-foreground">No Study Groups Yet</h3>
            <p className="text-muted-foreground text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
              Create the first study group to start collaborating with classmates in live chat and code rooms.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-3 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-2xl shadow-md hover:opacity-90 transition-all inline-flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" /> Create Study Group
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map(group => {
              const memberCount = group.study_group_members?.[0]?.count ?? 0;
              const isFull = memberCount >= 20;
              return (
                <div key={group.id} className="bg-card border border-border rounded-3xl p-6 space-y-4 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-black text-foreground text-lg leading-snug tracking-tight">{group.name}</h3>
                      {isFull && <span className="text-[9px] bg-destructive/10 text-destructive border border-destructive/20 px-2.5 py-1 rounded-full font-black uppercase tracking-widest whitespace-nowrap">FULL</span>}
                    </div>
                    
                    {group.assigned_teacher && (
                      <div className="flex items-center gap-1.5 text-xs text-primary font-bold">
                        <AcademicCapIcon className="w-4 h-4" />
                        <span>Moderator: {group.assigned_teacher.full_name}</span>
                      </div>
                    )}
                    
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <UserGroupIcon className="w-4 h-4 text-primary" /> Members
                        </span>
                        <span className="tabular-nums font-mono">{memberCount} / 20</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border/50">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(memberCount / 20) * 100}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Link
                      href={`/dashboard/study-groups/${group.id}`}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-muted hover:bg-secondary text-foreground text-xs font-black uppercase tracking-widest rounded-2xl border border-border transition-all"
                    >
                      <ChatBubbleLeftRightIcon className="w-4 h-4" /> Enter Room
                    </Link>
                    <button
                      onClick={() => joinGroup(group.id)}
                      disabled={isFull || joinLoading === group.id}
                      className="flex-1 py-3 bg-primary hover:opacity-90 disabled:opacity-40 text-primary-foreground text-xs font-black uppercase tracking-widest rounded-2xl shadow-sm transition-all flex items-center justify-center"
                    >
                      {joinLoading === group.id ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : isFull ? 'Full' : 'Join'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
