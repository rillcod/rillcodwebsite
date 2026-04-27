// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/supabase';
import {
  FireIcon, SparklesIcon, CodeBracketIcon, PlusIcon, XMarkIcon,
  ArrowPathIcon, ClockIcon, CheckCircleIcon, ChatBubbleLeftRightIcon,
  RocketLaunchIcon, CpuChipIcon, GlobeAltIcon, LightBulbIcon,
  UserGroupIcon, StarIcon, BoltIcon, BeakerIcon, MagnifyingGlassIcon,
  TrashIcon, TagIcon, ShieldCheckIcon,
} from '@/lib/icons';

const CodeEditor = dynamic(() => import('@/components/studio/IntegratedCodeRunner'), {
  ssr: false,
  loading: () => <div className="h-[150px] bg-muted/50 animate-pulse" />,
});

interface EngagePost {
  id: string;
  user_id: string;
  author_name: string;
  content: string;
  code_snippet: string | null;
  language: string | null;
  created_at: string | null;
  likes: number;
}

type FilterTab = 'all' | 'code' | 'discussion';
type Language = 'javascript' | 'python' | 'html' | 'robotics';
type EngagePostInsert = Database['public']['Tables']['engage_posts']['Insert'];

const TOPICS = ['Python', 'JavaScript', 'Web Dev', 'AI & ML', 'Robotics', 'Arduino', 'Scratch', 'Game Dev', 'Cyber Safety', 'General'];

const TOPIC_COLOR: Record<string, string> = {
  Python: '#3572A5', JavaScript: '#f7df1e', 'Web Dev': '#06b6d4',
  'AI & ML': '#8b5cf6', Robotics: '#10b981', Arduino: '#ef4444',
  Scratch: '#f59e0b', 'Game Dev': '#f97316', 'Cyber Safety': '#ec4899', General: '#6b7280',
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function AuthorAvatar({ name }: { name: string }) {
  const initial = (name || 'A')[0].toUpperCase();
  const colors = ['bg-primary','bg-indigo-600','bg-emerald-600','bg-amber-600','bg-rose-600','bg-cyan-600'];
  return (
    <div className={`w-9 h-9 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 rounded-full ${colors[initial.charCodeAt(0) % colors.length]}`}>
      {initial}
    </div>
  );
}

// ── Discussion prompt banks ──────────────────────────────────────────────────
const PROMPT_GROUPS = [
  {
    label: 'Young Innovators',
    sublabel: 'Ages 6–12',
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    icon: StarIcon,
    prompts: [
      { icon: CpuChipIcon,      color: '#f59e0b', text: 'What would you build if you had your own robot at home?' },
      { icon: CodeBracketIcon,  color: '#6366f1', text: 'Share your favourite Scratch project — what does it do?' },
      { icon: LightBulbIcon,    color: '#10b981', text: 'If you could invent one thing to help your school, what would it be?' },
      { icon: BeakerIcon,       color: '#06b6d4', text: 'What STEM topic are you most excited to learn about this term?' },
      { icon: RocketLaunchIcon, color: '#8b5cf6', text: 'Describe a cool experiment you did in class or at home!' },
    ],
  },
  {
    label: 'Teen Developers',
    sublabel: 'Ages 12–18',
    color: 'text-primary',
    border: 'border-primary/30',
    bg: 'bg-primary/5',
    icon: RocketLaunchIcon,
    prompts: [
      { icon: GlobeAltIcon,    color: '#06b6d4', text: 'Show us your latest web project — what tech stack did you use?' },
      { icon: SparklesIcon,    color: '#8b5cf6', text: 'What AI idea would you build to solve a problem in Nigeria?' },
      { icon: CodeBracketIcon, color: '#6366f1', text: 'Share a Python snippet you are proud of and explain what it does.' },
      { icon: CpuChipIcon,     color: '#ef4444', text: 'What Arduino or IoT project have you built or want to build?' },
      { icon: BoltIcon,        color: '#f59e0b', text: 'Which language should every student learn first, and why?' },
    ],
  },
  {
    label: 'All Students',
    sublabel: 'Any course',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    icon: BeakerIcon,
    prompts: [
      { icon: CodeBracketIcon, color: '#6366f1', text: 'What is the first program you ever wrote? Share it!' },
      { icon: GlobeAltIcon,    color: '#06b6d4', text: 'Which website do you visit most? Could you build something like it?' },
      { icon: SparklesIcon,    color: '#8b5cf6', text: 'How do you think AI is changing education in Nigeria?' },
      { icon: StarIcon,        color: '#f59e0b', text: 'Which Rillcod course has taught you the most so far?' },
      { icon: LightBulbIcon,   color: '#10b981', text: 'What real-world problem do you want to solve with code?' },
    ],
  },
];

const WEEKLY_CHALLENGE = {
  title: 'Weekly Challenge',
  description: 'Build a simple weather checker: given a city name, display whether it is hot (above 30°C), warm, or cold. Use Python or JavaScript.',
  tags: ['python', 'javascript', 'beginner-friendly'],
};

const MAX_CHARS = 1000;

export default function CommunityPage() {
  const { profile, loading: authLoading } = useAuth();
  const db = createClient();
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const [posts, setPosts]               = useState<EngagePost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [filter, setFilter]             = useState<FilterTab>('all');
  const [search, setSearch]             = useState('');
  const [error, setError]               = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<Set<string>>(new Set());
  const [likedPosts, setLikedPosts]     = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  // Composer
  const [message, setMessage]         = useState('');
  const [postTag, setPostTag]         = useState('General');
  const [showCode, setShowCode]       = useState(false);
  const [codeSnippet, setCodeSnippet] = useState('');
  const [language, setLanguage]       = useState<Language>('python');
  const [posting, setPosting]         = useState(false);

  // Sidebar prompt tab
  const [promptGroup, setPromptGroup] = useState(0);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  useEffect(() => { fetchPosts(); }, []); // eslint-disable-line

  async function fetchPosts() {
    setLoadingPosts(true);
    try {
      const { data } = await db.from('engage_posts').select('*').order('created_at', { ascending: false }).limit(50);
      setPosts((data || []) as EngagePost[]);
    } catch { setPosts([]); }
    finally { setLoadingPosts(false); }
  }

  async function handlePost() {
    if (!profile || !message.trim()) return;
    setPosting(true); setError(null);
    try {
      const payload: EngagePostInsert = {
        user_id: profile.id,
        author_name: profile.full_name || profile.email || 'Anonymous',
        content: message.trim(),
        code_snippet: showCode && codeSnippet.trim() ? codeSnippet.trim() : null,
        language: showCode && codeSnippet.trim() ? language : null,
        likes: 0,
      };
      const { data, error: err } = await db.from('engage_posts').insert({
        ...payload,
      }).select().single();
      if (err) throw err;
      setPosts(p => [data as EngagePost, ...p]);
      setMessage(''); setCodeSnippet(''); setShowCode(false);
    } catch (e: any) {
      setError(e.message || 'Failed to post. Please try again.');
    } finally { setPosting(false); }
  }

  async function handleLike(post: EngagePost) {
    if (likedPosts.has(post.id)) return;
    setLikedPosts(p => new Set([...p, post.id]));
    setPosts(p => p.map(x => x.id === post.id ? { ...x, likes: (x.likes || 0) + 1 } : x));
    try {
      await db.from('engage_posts').update({ likes: (post.likes || 0) + 1 }).eq('id', post.id);
    } catch {
      setLikedPosts(p => { const n = new Set(p); n.delete(post.id); return n; });
      setPosts(p => p.map(x => x.id === post.id ? { ...x, likes: Math.max(0, (x.likes || 1) - 1) } : x));
    }
  }

  async function handleDelete(postId: string) {
    if (!confirm('Delete this post?')) return;
    setDeletingId(postId);
    try {
      await db.from('engage_posts').delete().eq('id', postId);
      setPosts(p => p.filter(x => x.id !== postId));
    } catch (e: any) {
      setError(e.message || 'Could not delete post.');
    } finally { setDeletingId(null); }
  }

  function handleReply(authorName: string) {
    setMessage(`@${authorName} `);
    composerRef.current?.focus();
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function applyPrompt(text: string) {
    setMessage(text);
    composerRef.current?.focus();
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const filteredPosts = posts.filter(p => {
    if (filter === 'code')       return !!p.code_snippet;
    if (filter === 'discussion') return !p.code_snippet;
    return true;
  }).filter(p =>
    !search.trim() ||
    p.content.toLowerCase().includes(search.toLowerCase()) ||
    p.author_name.toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const FILTER_TABS = [
    { key: 'all' as FilterTab,        label: 'All',         count: posts.length },
    { key: 'code' as FilterTab,       label: 'Code',        count: posts.filter(p => !!p.code_snippet).length },
    { key: 'discussion' as FilterTab, label: 'Discussion',  count: posts.filter(p => !p.code_snippet).length },
  ];

  const charsLeft = MAX_CHARS - message.length;

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <UserGroupIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground">Student Hub</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Share ideas, post code, ask questions, and learn together</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-muted border border-border rounded-xl">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-muted-foreground">{posts.length} posts</span>
              </div>
              {isStaff && (
                <span className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 border border-primary/30 rounded-xl text-xs font-bold text-primary">
                  <ShieldCheckIcon className="w-3.5 h-3.5" /> Staff
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Main column ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Weekly Challenge */}
            <div className="bg-gradient-to-r from-primary/15 to-indigo-600/15 border border-primary/30 p-5 sm:p-6 rounded-2xl">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-primary/20 border border-primary/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BoltIcon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest">This Week</span>
                    <span className="text-[9px] bg-primary/10 border border-primary/20 text-violet-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">All Students</span>
                  </div>
                  <h3 className="text-base font-black text-foreground mb-1">{WEEKLY_CHALLENGE.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{WEEKLY_CHALLENGE.description}</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {WEEKLY_CHALLENGE.tags.map(t => (
                      <span key={t} className="text-[10px] font-bold px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-lg text-violet-300">{t}</span>
                    ))}
                  </div>
                  <button
                    onClick={() => { setMessage('My solution to the Weekly Challenge:\n\n'); setShowCode(true); composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); composerRef.current?.focus(); }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all"
                  >
                    <RocketLaunchIcon className="w-3.5 h-3.5" /> Submit My Solution
                  </button>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
              </div>
            )}

            {/* Post Composer */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ChatBubbleLeftRightIcon className="w-4 h-4 text-primary" />
                <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Share with the community</span>
              </div>

              <div className="flex items-start gap-3">
                <AuthorAvatar name={profile.full_name || 'You'} />
                <div className="flex-1 space-y-2">
                  <textarea
                    ref={composerRef}
                    className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none transition-all"
                    placeholder="Ask a question, share your project, or celebrate a win..."
                    rows={3}
                    value={message}
                    maxLength={MAX_CHARS}
                    onChange={e => setMessage(e.target.value)}
                  />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                    <span>Topic:</span>
                    <span className={charsLeft < 100 ? 'text-rose-400 font-bold' : ''}>{charsLeft} chars left</span>
                  </div>
                  {/* Topic tag row */}
                  <div className="flex flex-wrap gap-1.5">
                    {TOPICS.map(t => (
                      <button key={t} onClick={() => setPostTag(t)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${postTag === t ? 'text-white border-transparent' : 'bg-muted border-border text-muted-foreground hover:text-foreground'}`}
                        style={postTag === t ? { background: TOPIC_COLOR[t] ?? '#6b7280', borderColor: 'transparent' } : {}}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {showCode && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="flex items-center gap-2 mb-2 pl-12">
                      <select
                        className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-bold text-foreground focus:outline-none focus:border-primary transition-colors"
                        value={language}
                        onChange={e => setLanguage(e.target.value as Language)}
                      >
                        <option value="python">Python</option>
                        <option value="javascript">JavaScript</option>
                        <option value="html">HTML / CSS</option>
                        <option value="robotics">Robotics / Arduino</option>
                      </select>
                      <button className="ml-auto p-1.5 bg-muted hover:bg-muted/80 border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all" onClick={() => { setShowCode(false); setCodeSnippet(''); }}>
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="border border-border rounded-xl overflow-hidden pl-12">
                      <CodeEditor value={codeSnippet} onChange={v => setCodeSnippet(v || '')} language={language} height={180} title="Code Snippet" showHeader={false} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-2 flex-wrap pl-12">
                <button onClick={() => setShowCode(v => !v)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${showCode ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-muted border-border text-muted-foreground hover:text-indigo-400 hover:border-indigo-500/30'}`}>
                  <CodeBracketIcon className="w-3.5 h-3.5" />
                  {showCode ? 'Remove Code' : 'Add Code'}
                </button>
                <button
                  onClick={() => {
                    const bank = PROMPT_GROUPS[Math.floor(Math.random() * PROMPT_GROUPS.length)];
                    const p = bank.prompts[Math.floor(Math.random() * bank.prompts.length)];
                    setMessage(p.text);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-muted border border-border text-muted-foreground hover:text-amber-400 hover:border-amber-500/30 transition-all">
                  <LightBulbIcon className="w-3.5 h-3.5" /> Get Inspired
                </button>
                <button onClick={handlePost} disabled={posting || !message.trim() || message.length > MAX_CHARS}
                  className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-[11px] font-black uppercase tracking-widest transition-all">
                  {posting ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <PlusIcon className="w-4 h-4" />}
                  {posting ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>

            {/* Search + Filter */}
            <div className="space-y-3">
              <div className="relative">
                <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search posts..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 border-b border-border pb-4">
                {FILTER_TABS.map(tab => (
                  <button key={tab.key} onClick={() => setFilter(tab.key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                      filter === tab.key
                        ? 'bg-primary/10 border border-primary/30 text-primary'
                        : 'bg-muted/50 border border-border text-muted-foreground hover:text-foreground'
                    }`}>
                    {tab.label}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${filter === tab.key ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
                <button onClick={fetchPosts} className="ml-auto p-2.5 bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground transition-all" title="Refresh">
                  <ArrowPathIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Posts Feed */}
            {loadingPosts ? (
              <div className="flex flex-col gap-3">
                {[1,2,3].map(i => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse">
                    <div className="flex gap-3 mb-3">
                      <div className="w-9 h-9 bg-muted rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted rounded w-32" />
                        <div className="h-2 bg-muted rounded w-20" />
                      </div>
                    </div>
                    <div className="h-3 bg-muted rounded w-full mb-2" />
                    <div className="h-3 bg-muted rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="text-center py-16 bg-card border border-dashed border-border rounded-2xl">
                <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-foreground font-black mb-1">
                  {search ? `No posts matching "${search}"` : filter === 'all' ? 'No posts yet — be the first!' : filter === 'code' ? 'No code shared yet' : 'No discussions yet'}
                </p>
                <p className="text-muted-foreground text-sm">
                  {search ? 'Try a different search term' : 'Use the composer above to start'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPosts.map((post, idx) => {
                  const isOwn = post.user_id === profile.id;
                  const canDelete = isOwn || isStaff;
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      key={post.id}
                      className={`bg-card rounded-2xl border transition-all p-5 ${isOwn ? 'border-primary/20' : 'border-border hover:border-border/80'}`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <AuthorAvatar name={post.author_name} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-foreground">{post.author_name}</span>
                            {isOwn && <span className="text-[9px] font-black px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary rounded">You</span>}
                            {(post.user_id === profile.id ? false : isStaff) && <span className="text-[9px] font-black px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary rounded">Staff</span>}
                            {post.code_snippet && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded">Code</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                            <ClockIcon className="w-3 h-3" />
                            <span>{timeAgo(post.created_at || '')}</span>
                          </div>
                        </div>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(post.id)}
                            disabled={deletingId === post.id}
                            className="p-1.5 text-muted-foreground/40 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all disabled:opacity-40 flex-shrink-0"
                            title="Delete post"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <p className="text-sm text-foreground/80 leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>

                      {post.code_snippet && (
                        <div className="mb-3">
                          {expandedCode.has(post.id) ? (
                            <div>
                              <div className="border border-border rounded-xl overflow-hidden">
                                <CodeEditor value={post.code_snippet} language={(post.language as Language) || 'python'} height={150} readOnly showHeader={false} />
                              </div>
                              <button onClick={() => setExpandedCode(p => { const n = new Set(p); n.delete(post.id); return n; })}
                                className="text-xs text-muted-foreground hover:text-foreground mt-1.5 underline">
                                Hide code
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setExpandedCode(p => new Set([...p, post.id]))}
                              className="flex items-center gap-2 w-full px-3 py-2.5 bg-muted border border-border rounded-xl hover:border-indigo-500/40 text-sm text-muted-foreground hover:text-indigo-400 transition-all">
                              <CodeBracketIcon className="w-4 h-4" />
                              <span>View {post.language || 'code'} snippet</span>
                              <span className="ml-auto text-[10px] text-muted-foreground/50">tap to expand</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-4 pt-2.5 border-t border-border">
                        <button onClick={() => handleLike(post)}
                          disabled={likedPosts.has(post.id)}
                          className={`flex items-center gap-1.5 text-sm transition-colors disabled:cursor-default ${likedPosts.has(post.id) ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}>
                          <FireIcon className="w-4 h-4" />
                          <span className="font-bold">{post.likes || 0}</span>
                        </button>
                        <button onClick={() => handleReply(post.author_name)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto">
                          <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> Reply
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Sidebar ─────────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Discussion Starters — tabbed */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 pt-4 pb-0">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3">Discussion Starters</p>
                <div className="flex gap-1 border-b border-border">
                  {PROMPT_GROUPS.map((g, i) => (
                    <button key={i} onClick={() => setPromptGroup(i)}
                      className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 -mb-px ${
                        promptGroup === i ? `${g.color} border-current` : 'text-muted-foreground border-transparent hover:text-foreground'
                      }`}>
                      {g.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest px-1 mb-2">
                  {PROMPT_GROUPS[promptGroup].sublabel}
                </p>
                {PROMPT_GROUPS[promptGroup].prompts.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button key={i} onClick={() => applyPrompt(p.text)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 bg-muted/30 border border-border hover:border-primary/30 hover:bg-primary/5 text-left transition-all group rounded-xl">
                      <span style={{ color: p.color }} className="flex-shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5" /></span>
                      <span className="text-[10px] text-muted-foreground group-hover:text-foreground/80 leading-snug transition-colors">{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Topics */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3">Browse by Topic</p>
              <div className="flex flex-wrap gap-1.5">
                {TOPICS.map(t => (
                  <button key={t}
                    onClick={() => setSearch(t)}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all ${
                      search === t ? 'text-white border-transparent' : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                    }`}
                    style={search === t ? { background: TOPIC_COLOR[t] ?? '#6b7280' } : {}}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* 🚀 Teen Developers — Learning Paths */}
            <div className="bg-gradient-to-br from-primary/10 to-indigo-600/10 border border-primary/20 rounded-2xl overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-primary/10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🚀</span>
                  <p className="text-xs font-black text-primary uppercase tracking-widest">Teen Developers</p>
                  <span className="ml-auto text-[8px] font-black text-primary/50 uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded-full">Ages 12–18</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Hands-on projects, real code, real skills</p>
              </div>

              {/* Track 1: Web Dev */}
              <div className="px-3 pt-3 pb-1">
                <p className="text-[8px] font-black text-primary/60 uppercase tracking-widest mb-2 px-1">🌐 Web Development</p>
                <div className="space-y-1.5">
                  {[
                    { emoji: '🎨', title: 'Portfolio Site', desc: 'HTML + CSS glassmorphism card', path: '/dashboard/playground?lang=html', badge: 'Beginner' },
                    { emoji: '⚡', title: 'Live Score Tracker', desc: 'JavaScript DOM + onclick events', path: '/dashboard/playground?lang=javascript', badge: 'Beginner' },
                    { emoji: '📱', title: 'Responsive Dashboard', desc: 'CSS Grid + animations', path: '/dashboard/missions?lang=css', badge: 'Intermediate' },
                    { emoji: '🔷', title: 'TypeScript App', desc: 'Typed interfaces + generics', path: '/dashboard/missions?lang=typescript', badge: 'Advanced' },
                  ].map((sim, i) => (
                    <a key={i} href={sim.path}
                      className="flex items-center gap-2.5 p-2.5 bg-card/60 border border-border hover:border-primary/40 hover:bg-primary/5 rounded-xl transition-all group">
                      <span className="text-lg leading-none shrink-0">{sim.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-foreground group-hover:text-primary transition-colors truncate">{sim.title}</p>
                        <p className="text-[8px] text-muted-foreground truncate">{sim.desc}</p>
                      </div>
                      <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${sim.badge === 'Beginner' ? 'bg-emerald-500/10 text-emerald-400' : sim.badge === 'Intermediate' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{sim.badge}</span>
                    </a>
                  ))}
                </div>
              </div>

              {/* Track 2: Python & Data */}
              <div className="px-3 pt-3 pb-1">
                <p className="text-[8px] font-black text-primary/60 uppercase tracking-widest mb-2 px-1">🐍 Python & Data Science</p>
                <div className="space-y-1.5">
                  {[
                    { emoji: '📊', title: 'Student Report System', desc: 'Classes, dicts, loops, grades', path: '/dashboard/protocol?phase=5', badge: 'Beginner' },
                    { emoji: '🔢', title: 'Sorting Algorithms', desc: 'Bubble sort vs selection sort', path: '/dashboard/missions?lang=python', badge: 'Intermediate' },
                    { emoji: '🧬', title: 'OOP School System', desc: 'Inheritance, methods, super()', path: '/dashboard/missions?lang=python', badge: 'Intermediate' },
                    { emoji: '⚙️', title: 'Decorators & Generators', desc: 'Advanced Python patterns', path: '/dashboard/missions?lang=python', badge: 'Advanced' },
                    { emoji: '📈', title: 'Data Pipeline', desc: 'Process & rank student datasets', path: '/dashboard/missions?lang=python', badge: 'Advanced' },
                  ].map((sim, i) => (
                    <a key={i} href={sim.path}
                      className="flex items-center gap-2.5 p-2.5 bg-card/60 border border-border hover:border-primary/40 hover:bg-primary/5 rounded-xl transition-all group">
                      <span className="text-lg leading-none shrink-0">{sim.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-foreground group-hover:text-primary transition-colors truncate">{sim.title}</p>
                        <p className="text-[8px] text-muted-foreground truncate">{sim.desc}</p>
                      </div>
                      <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${sim.badge === 'Beginner' ? 'bg-emerald-500/10 text-emerald-400' : sim.badge === 'Intermediate' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{sim.badge}</span>
                    </a>
                  ))}
                </div>
              </div>

              {/* Track 3: Robotics & IoT */}
              <div className="px-3 pt-3 pb-1">
                <p className="text-[8px] font-black text-cyan-400/60 uppercase tracking-widest mb-2 px-1">🤖 Robotics & IoT</p>
                <div className="space-y-1.5">
                  {[
                    { emoji: '💡', title: 'Blink LED', desc: 'Arduino setup() + loop() basics', path: '/dashboard/missions?lang=robotics', badge: 'Beginner' },
                    { emoji: '🎛️', title: 'Potentiometer Dimmer', desc: 'analogRead → PWM brightness', path: '/dashboard/missions?lang=robotics', badge: 'Beginner' },
                    { emoji: '📡', title: 'Distance Alert System', desc: 'HC-SR04 ultrasonic + LED zones', path: '/dashboard/missions?lang=robotics', badge: 'Intermediate' },
                    { emoji: '🚗', title: 'Obstacle-Avoiding Robot', desc: 'L298N motors + autonomous logic', path: '/dashboard/missions?lang=robotics', badge: 'Advanced' },
                    { emoji: '🌡️', title: 'IoT Sensor Node', desc: 'Temp/humidity → MQTT publish', path: '/dashboard/protocol?phase=40', badge: 'Advanced' },
                  ].map((sim, i) => (
                    <a key={i} href={sim.path}
                      className="flex items-center gap-2.5 p-2.5 bg-card/60 border border-border hover:border-cyan-500/40 hover:bg-cyan-500/5 rounded-xl transition-all group">
                      <span className="text-lg leading-none shrink-0">{sim.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-foreground group-hover:text-cyan-400 transition-colors truncate">{sim.title}</p>
                        <p className="text-[8px] text-muted-foreground truncate">{sim.desc}</p>
                      </div>
                      <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${sim.badge === 'Beginner' ? 'bg-emerald-500/10 text-emerald-400' : sim.badge === 'Intermediate' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{sim.badge}</span>
                    </a>
                  ))}
                </div>
              </div>

              {/* Track 4: Databases */}
              <div className="px-3 pt-3 pb-3">
                <p className="text-[8px] font-black text-emerald-400/60 uppercase tracking-widest mb-2 px-1">🗄️ Databases & Backend</p>
                <div className="space-y-1.5">
                  {[
                    { emoji: '🔍', title: 'SQL SELECT & WHERE', desc: 'Query a student database', path: '/dashboard/missions?lang=sql', badge: 'Beginner' },
                    { emoji: '🔗', title: 'SQL JOINs', desc: 'Link students to courses', path: '/dashboard/missions?lang=sql', badge: 'Intermediate' },
                    { emoji: '🏗️', title: 'API Design Concepts', desc: 'REST endpoints & JSON responses', path: '/dashboard/protocol', badge: 'Advanced' },
                  ].map((sim, i) => (
                    <a key={i} href={sim.path}
                      className="flex items-center gap-2.5 p-2.5 bg-card/60 border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 rounded-xl transition-all group">
                      <span className="text-lg leading-none shrink-0">{sim.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-foreground group-hover:text-emerald-400 transition-colors truncate">{sim.title}</p>
                        <p className="text-[8px] text-muted-foreground truncate">{sim.desc}</p>
                      </div>
                      <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${sim.badge === 'Beginner' ? 'bg-emerald-500/10 text-emerald-400' : sim.badge === 'Intermediate' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{sim.badge}</span>
                    </a>
                  ))}
                </div>
                <a href="/dashboard/missions" className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl text-[9px] font-black text-primary uppercase tracking-widest transition-all">
                  View All Missions →
                </a>
              </div>
            </div>

            {/* ⭐ Young Innovators — Learning Paths */}
            <div className="bg-gradient-to-br from-amber-600/10 to-primary/10 border border-amber-500/20 rounded-2xl overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-amber-500/10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">⭐</span>
                  <p className="text-xs font-black text-amber-400 uppercase tracking-widest">Young Innovators</p>
                  <span className="ml-auto text-[8px] font-black text-amber-400/50 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded-full">Ages 6–12</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Fun, visual, step-by-step coding adventures</p>
              </div>

              {/* Track 1: Python for Kids */}
              <div className="px-3 pt-3 pb-1">
                <p className="text-[8px] font-black text-amber-400/60 uppercase tracking-widest mb-2 px-1">🐍 Python Adventures</p>
                <div className="space-y-1.5">
                  {[
                    { emoji: '👋', title: 'Hello World!', desc: 'Print your name with Python', path: '/dashboard/protocol?phase=1', badge: '⭐ Start Here' },
                    { emoji: '🔢', title: 'Count & Loop', desc: 'Print patterns with for loops', path: '/dashboard/protocol?phase=41', badge: '⭐⭐' },
                    { emoji: '🤔', title: 'Yes or No?', desc: 'If-else decisions with examples', path: '/dashboard/protocol?phase=42', badge: '⭐⭐' },
                    { emoji: '🧮', title: 'School Fee Calc', desc: 'Maths with ₦ Nigerian money', path: '/dashboard/protocol?phase=43', badge: '⭐⭐' },
                    { emoji: '📋', title: 'Class Register', desc: 'Lists, scores, and averages', path: '/dashboard/protocol?phase=44', badge: '⭐⭐⭐' },
                    { emoji: '🍳', title: 'Recipe Functions', desc: 'Write reusable code blocks', path: '/dashboard/protocol?phase=45', badge: '⭐⭐⭐' },
                  ].map((sim, i) => (
                    <a key={i} href={sim.path}
                      className="flex items-center gap-2.5 p-2.5 bg-card/60 border border-border hover:border-amber-500/40 hover:bg-amber-500/5 rounded-xl transition-all group">
                      <span className="text-lg leading-none shrink-0">{sim.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-foreground group-hover:text-amber-400 transition-colors truncate">{sim.title}</p>
                        <p className="text-[8px] text-muted-foreground truncate">{sim.desc}</p>
                      </div>
                      <span className="text-[8px] text-amber-400/60 shrink-0">{sim.badge}</span>
                    </a>
                  ))}
                </div>
              </div>

              {/* Track 2: Web for Kids */}
              <div className="px-3 pt-3 pb-1">
                <p className="text-[8px] font-black text-primary/60 uppercase tracking-widest mb-2 px-1">🌐 Web Design</p>
                <div className="space-y-1.5">
                  {[
                    { emoji: '🎨', title: 'My Profile Page', desc: 'Build a colourful HTML card', path: '/dashboard/protocol?phase=46', badge: '⭐⭐' },
                    { emoji: '🎮', title: 'Score Tracker App', desc: 'Buttons + JavaScript clicks', path: '/dashboard/protocol?phase=47', badge: '⭐⭐⭐' },
                    { emoji: '🏆', title: 'My Portfolio', desc: 'Showcase all your projects', path: '/dashboard/protocol?phase=48', badge: '⭐⭐⭐⭐' },
                  ].map((sim, i) => (
                    <a key={i} href={sim.path}
                      className="flex items-center gap-2.5 p-2.5 bg-card/60 border border-border hover:border-primary/40 hover:bg-primary/5 rounded-xl transition-all group">
                      <span className="text-lg leading-none shrink-0">{sim.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-foreground group-hover:text-primary transition-colors truncate">{sim.title}</p>
                        <p className="text-[8px] text-muted-foreground truncate">{sim.desc}</p>
                      </div>
                      <span className="text-[8px] text-primary/60 shrink-0">{sim.badge}</span>
                    </a>
                  ))}
                </div>
              </div>

              {/* Track 3: Robotics for Kids */}
              <div className="px-3 pt-3 pb-3">
                <p className="text-[8px] font-black text-cyan-400/60 uppercase tracking-widest mb-2 px-1">🤖 Robotics Fun</p>
                <div className="space-y-1.5">
                  {[
                    { emoji: '⬆️', title: 'Move Forward', desc: 'robot.forward() basics', path: '/dashboard/playground?lang=robotics', badge: '⭐' },
                    { emoji: '🔲', title: 'Draw a Square', desc: 'forward + turnRight × 4', path: '/dashboard/playground?lang=robotics', badge: '⭐⭐' },
                    { emoji: '🌈', title: 'Rainbow Spiral', desc: 'Loops + setColor patterns', path: '/dashboard/playground?lang=robotics', badge: '⭐⭐⭐' },
                  ].map((sim, i) => (
                    <a key={i} href={sim.path}
                      className="flex items-center gap-2.5 p-2.5 bg-card/60 border border-border hover:border-cyan-500/40 hover:bg-cyan-500/5 rounded-xl transition-all group">
                      <span className="text-lg leading-none shrink-0">{sim.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-foreground group-hover:text-cyan-400 transition-colors truncate">{sim.title}</p>
                        <p className="text-[8px] text-muted-foreground truncate">{sim.desc}</p>
                      </div>
                      <span className="text-[8px] text-cyan-400/60 shrink-0">{sim.badge}</span>
                    </a>
                  ))}
                </div>
                <a href="/dashboard/protocol" className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 bg-amber-600/10 hover:bg-amber-600/20 border border-amber-500/20 rounded-xl text-[9px] font-black text-amber-400 uppercase tracking-widest transition-all">
                  Start Learning Path →
                </a>
              </div>
            </div>

            {/* Community Guidelines */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3">Community Guidelines</p>
              <div className="space-y-2.5">
                {[
                  { icon: '✅', text: 'Be kind and respectful to everyone' },
                  { icon: '💡', text: 'Share real work — show your code, not just results' },
                  { icon: '❓', text: 'No question is too small — ask freely' },
                  { icon: '🙌', text: 'Celebrate others\' wins with a fire reaction' },
                  { icon: '🚫', text: 'No copying others\' work without credit' },
                ].map((r, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="text-sm flex-shrink-0">{r.icon}</span>
                    <span className="text-xs text-muted-foreground leading-snug">{r.text}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
