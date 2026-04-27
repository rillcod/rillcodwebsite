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
  AcademicCapIcon 
} from '@/lib/icons';
import Link from 'next/link';

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
  const { profile } = useAuth();
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [joinLoading, setJoinLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    setLoading(true);
    const res = await fetch('/api/study-groups');
    const json = await res.json();
    setGroups(json.data ?? []);
    setLoading(false);
  }

  async function createGroup() {
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    
    // Auto-assign teacher based on student's assigned teacher or school
    let assignedTeacherId = null;
    if (profile?.role === 'student') {
      const db = createClient();
      
      // Try to find student's assigned teacher from school or find any teacher from same school
      if (profile?.school_id) {
        // Find a teacher from the same school
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
    }
    
    const res = await fetch('/api/study-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name,
        assigned_teacher_id: assignedTeacherId,
        school_id: profile?.school_id,
        grade_level: profile?.grade_level
      }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || 'Failed to create'); setCreating(false); return; }
    setGroups(prev => [json.data, ...prev]);
    setName('');
    setShowCreate(false);
    setCreating(false);
  }

  async function joinGroup(id: string) {
    setJoinLoading(id);
    const res = await fetch(`/api/study-groups/${id}/join`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) { alert(json.message || json.error); setJoinLoading(null); return; }
    await loadGroups();
    setJoinLoading(null);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UserGroupIcon className="w-5 h-5 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Collaboration</span>
            </div>
            <h1 className="text-3xl font-black">Peer Study Groups</h1>
            <p className="text-muted-foreground text-sm mt-1">Collaborate with classmates in real-time with shared chat and code pad</p>
          </div>
          {isTeacher && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary text-white text-sm font-bold rounded-xl transition-colors"
            >
              <PlusIcon className="w-4 h-4" /> Create Group
            </button>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-black text-foreground">New Study Group</h2>
                <button onClick={() => setShowCreate(false)}><XMarkIcon className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Group Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Python Study Squad"
                  className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl focus:outline-none focus:border-primary text-sm"
                  onKeyDown={e => e.key === 'Enter' && createGroup()}
                />
              </div>
              {error && <p className="text-rose-400 text-xs">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 bg-muted text-muted-foreground font-bold rounded-xl hover:bg-muted/80 text-sm transition-colors">Cancel</button>
                <button onClick={createGroup} disabled={!name.trim() || creating} className="flex-1 py-2.5 bg-primary hover:bg-primary disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-colors">
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Groups list */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <UserGroupIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No study groups yet. {isTeacher ? 'Create the first one!' : ''}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map(group => {
              const memberCount = group.study_group_members?.[0]?.count ?? 0;
              const isFull = memberCount >= 20;
              return (
                <div key={group.id} className="bg-card border border-border rounded-xl p-5 space-y-3 hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-foreground text-sm leading-snug">{group.name}</h3>
                    {isFull && <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">FULL</span>}
                  </div>
                  
                  {group.assigned_teacher && (
                    <div className="flex items-center gap-1 text-xs text-primary">
                      <AcademicCapIcon className="w-3.5 h-3.5" />
                      Moderated by {group.assigned_teacher.full_name}
                    </div>
                  )}
                  
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserGroupIcon className="w-3.5 h-3.5" />
                    {memberCount} / 20 members
                  </div>
                  <div className="w-full bg-muted rounded-full h-1">
                    <div className="h-1 bg-primary rounded-full transition-all" style={{ width: `${(memberCount / 20) * 100}%` }} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Link
                      href={`/dashboard/study-groups/${group.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
                    >
                      <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> Open
                    </Link>
                    {!isTeacher && (
                      <button
                        onClick={() => joinGroup(group.id)}
                        disabled={isFull || joinLoading === group.id}
                        className="flex-1 py-2 bg-primary hover:bg-primary disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors"
                      >
                        {joinLoading === group.id ? '…' : isFull ? 'Full' : 'Join'}
                      </button>
                    )}
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
