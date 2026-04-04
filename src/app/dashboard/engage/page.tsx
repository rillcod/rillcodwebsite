// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
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
  tag: string | null;
  created_at: string | null;
  likes: number;
}

type FilterTab = 'all' | 'code' | 'discussion';
type Language = 'javascript' | 'python' | 'html' | 'robotics';

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
  const colors = ['bg-violet-600','bg-indigo-600','bg-emerald-600','bg-amber-600','bg-rose-600','bg-cyan-600'];
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
    color: 'text-violet-400',
    border: 'border-violet-500/30',
    bg: 'bg-violet-500/5',
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
      const { data, error: err } = await db.from('engage_posts').insert({
        user_id:      profile.id,
        author_name:  profile.full_name || profile.email || 'Anonymous',
        content:      message.trim(),
        code_snippet: showCode && codeSnippet.trim() ? codeSnippet.trim() : null,
        language:     showCode && codeSnippet.trim() ? language : null,
        tag:          postTag || 'General',
        likes:        0,
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

  function usePrompt(text: string) {
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
    p.author_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.tag ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
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
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
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
                <span className="flex items-center gap-1.5 px-3 py-2 bg-violet-500/10 border border-violet-500/30 rounded-xl text-xs font-bold text-violet-400">
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
            <div className="bg-gradient-to-r from-violet-600/15 to-indigo-600/15 border border-violet-500/30 p-5 sm:p-6 rounded-2xl">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-violet-500/20 border border-violet-500/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BoltIcon className="w-5 h-5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest">This Week</span>
                    <span className="text-[9px] bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">All Students</span>
                  </div>
                  <h3 className="text-base font-black text-foreground mb-1">{WEEKLY_CHALLENGE.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{WEEKLY_CHALLENGE.description}</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {WEEKLY_CHALLENGE.tags.map(t => (
                      <span key={t} className="text-[10px] font-bold px-2.5 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg text-violet-300">{t}</span>
                    ))}
                  </div>
                  <button
                    onClick={() => { setMessage('My solution to the Weekly Challenge:\n\n'); setShowCode(true); composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); composerRef.current?.focus(); }}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all"
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
                <ChatBubbleLeftRightIcon className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Share with the community</span>
              </div>

              <div className="flex items-start gap-3">
                <AuthorAvatar name={profile.full_name || 'You'} />
                <div className="flex-1 space-y-2">
                  <textarea
                    ref={composerRef}
                    className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500/60 resize-none transition-all"
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
                        className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-bold text-foreground focus:outline-none focus:border-orange-500 transition-colors"
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
                  className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-[11px] font-black uppercase tracking-widest transition-all">
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
                  className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500/50 transition-all"
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
                        ? 'bg-orange-500/10 border border-orange-500/30 text-orange-400'
                        : 'bg-muted/50 border border-border text-muted-foreground hover:text-foreground'
                    }`}>
                    {tab.label}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${filter === tab.key ? 'bg-orange-500/20 text-orange-400' : 'bg-muted text-muted-foreground'}`}>
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
                  const tagColor = TOPIC_COLOR[post.tag ?? ''] ?? '#6b7280';
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      key={post.id}
                      className={`bg-card rounded-2xl border transition-all p-5 ${isOwn ? 'border-orange-500/20' : 'border-border hover:border-border/80'}`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <AuthorAvatar name={post.author_name} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-foreground">{post.author_name}</span>
                            {isOwn && <span className="text-[9px] font-black px-1.5 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded">You</span>}
                            {(post.user_id === profile.id ? false : isStaff) && <span className="text-[9px] font-black px-1.5 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded">Staff</span>}
                            {post.code_snippet && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded">Code</span>
                            )}
                            {post.tag && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border" style={{ color: tagColor, borderColor: tagColor + '40', background: tagColor + '12' }}>
                                {post.tag}
                              </span>
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
                          className={`flex items-center gap-1.5 text-sm transition-colors disabled:cursor-default ${likedPosts.has(post.id) ? 'text-orange-400' : 'text-muted-foreground hover:text-orange-400'}`}>
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
                    <button key={i} onClick={() => usePrompt(p.text)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 bg-muted/30 border border-border hover:border-orange-500/30 hover:bg-orange-500/5 text-left transition-all group rounded-xl">
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
