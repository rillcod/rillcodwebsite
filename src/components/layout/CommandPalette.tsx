// @refresh reset
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from 'cmdk';
import {
  MagnifyingGlassIcon,
  AcademicCapIcon,
  BookOpenIcon,
  UserGroupIcon,
  CogIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  RocketLaunchIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';

export default function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<{ classes: any[]; lessons: any[]; students: any[] }>({
    classes: [],
    lessons: [],
    students: [],
  });
  const router = useRouter();
  const { profile } = useAuth();
  const db = createClient();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  React.useEffect(() => {
    if (!query || query.length < 2 || !profile) {
      setResults({ classes: [], lessons: [], students: [] });
      return;
    }

    const search = async () => {
      const [cRes, lRes, sRes] = await Promise.all([
        db.from('classes').select('id, name').ilike('name', `%${query}%`).limit(3),
        db.from('lessons').select('id, title').ilike('title', `%${query}%`).limit(3),
        db.from('students').select('id, full_name').ilike('full_name', `%${query}%`).limit(3),
      ]);

      setResults({
        classes: cRes.data || [],
        lessons: lRes.data || [],
        students: sRes.data || [],
      });
    };

    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [query, profile, db]);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  if (!profile) return null;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <div className="bg-[#0a0a1a] border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)]">
        <div className="flex items-center border-b border-white/5 px-6 py-4">
          <MagnifyingGlassIcon className="w-5 h-5 text-cyan-400 mr-4 opacity-50" />
          <CommandInput
            placeholder="Search activities, modules, or pupils..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-white/20 text-sm font-medium h-10 outline-none"
            onValueChange={setQuery}
          />
          <div className="flex items-center gap-1.5 ml-4">
             <kbd className="px-2 py-1 bg-white/5 rounded text-[10px] font-black text-white/20 uppercase">ESC</kbd>
          </div>
        </div>

        <CommandList className="max-h-[70vh] overflow-y-auto p-4 custom-scrollbar">
          <CommandEmpty className="py-20 text-center">
            <RocketLaunchIcon className="w-12 h-12 text-white/5 mx-auto mb-4" />
            <p className="text-xs font-black text-white/20 uppercase tracking-[0.3em]">No resonance detected</p>
          </CommandEmpty>

          {results.lessons.length > 0 && (
            <CommandGroup heading={<span className="text-[10px] font-black text-cyan-500/60 uppercase tracking-[0.3em] px-4 py-2 block">Operative Modules</span>}>
              {results.lessons.map((l) => (
                <CommandItem key={l.id} onSelect={() => runCommand(() => router.push(`/dashboard/lessons/${l.id}`))} className="flex items-center gap-4 px-4 py-4 rounded-2xl hover:bg-white/5 cursor-pointer group transition-all">
                  <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl group-hover:scale-110 transition-transform">
                    <BookOpenIcon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-white/80 group-hover:text-white">{l.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.classes.length > 0 && (
            <CommandGroup heading={<span className="text-[10px] font-black text-violet-500/60 uppercase tracking-[0.3em] px-4 py-2 block">Learning Cells</span>}>
              {results.classes.map((c) => (
                <CommandItem key={c.id} onSelect={() => runCommand(() => router.push(`/dashboard/classes/${c.id}`))} className="flex items-center gap-4 px-4 py-4 rounded-2xl hover:bg-white/5 cursor-pointer group transition-all">
                  <div className="p-3 bg-violet-500/10 text-violet-400 rounded-xl group-hover:scale-110 transition-transform">
                    <AcademicCapIcon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-white/80 group-hover:text-white">{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.students.length > 0 && (
            <CommandGroup heading={<span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.3em] px-4 py-2 block">Students</span>}>
              {results.students.map((s) => (
                <CommandItem key={s.id} onSelect={() => runCommand(() => router.push(`/dashboard/students/${s.id}`))} className="flex items-center gap-4 px-4 py-4 rounded-2xl hover:bg-white/5 cursor-pointer group transition-all">
                  <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:scale-110 transition-transform">
                    <UserGroupIcon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-white/80 group-hover:text-white">{s.full_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator className="my-4 h-px bg-white/5" />

          <CommandGroup heading={<span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] px-4 py-2 block">Quick Actions</span>}>
            <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/lessons'))} className="flex items-center gap-4 px-4 py-4 rounded-2xl hover:bg-white/5 cursor-pointer group transition-all">
              <div className="p-3 bg-white/5 text-white/40 rounded-xl group-hover:bg-cyan-500/20 group-hover:text-cyan-400 transition-all">
                <CommandLineIcon className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-white/60 group-hover:text-white uppercase tracking-wider">Lesson Hub</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/messages'))} className="flex items-center gap-4 px-4 py-4 rounded-2xl hover:bg-white/5 cursor-pointer group transition-all">
              <div className="p-3 bg-white/5 text-white/40 rounded-xl group-hover:bg-violet-500/20 group-hover:text-violet-400 transition-all">
                <EnvelopeIcon className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-white/60 group-hover:text-white uppercase tracking-wider">Messages</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/settings'))} className="flex items-center gap-4 px-4 py-4 rounded-2xl hover:bg-white/5 cursor-pointer group transition-all">
              <div className="p-3 bg-white/5 text-white/40 rounded-xl group-hover:bg-emerald-500/20 group-hover:text-emerald-400 transition-all">
                <CogIcon className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-white/60 group-hover:text-white uppercase tracking-wider">Parameters</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
        
        <div className="p-4 bg-black/40 border-t border-white/5 flex items-center justify-between text-[8px] font-black uppercase tracking-[0.2em] text-white/20">
           <div className="flex gap-4">
             <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-white/5 rounded">↑↓</kbd> Navigate</span>
             <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-white/5 rounded">ENTER</kbd> Activate</span>
           </div>
           <span className="text-cyan-500/40">Nucleus AI Search v1.0</span>
        </div>
      </div>
    </CommandDialog>
  );
}
