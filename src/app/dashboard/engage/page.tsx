// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  FireIcon, SparklesIcon, CodeBracketIcon, PlusIcon, XMarkIcon,
  ArrowPathIcon, ClockIcon, CheckCircleIcon, ChatBubbleLeftRightIcon,
  RocketLaunchIcon, CpuChipIcon, GlobeAltIcon, LightBulbIcon,
  UserGroupIcon, StarIcon, BoltIcon, BeakerIcon,
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
    <div className={`w-9 h-9 flex items-center justify-center text-foreground text-sm font-bold flex-shrink-0 ${colors[initial.charCodeAt(0) % colors.length]}`}>
      {initial}
    </div>
  );
}

// ── Starter discussion prompts per program ─────────────────────────────────
const YOUNG_INNOVATORS_PROMPTS = [
  { icon: CpuChipIcon,          color: '#f59e0b', text: 'What would you build if you had your own robot at home?' },
  { icon: CodeBracketIcon,      color: '#6366f1', text: 'Share your favourite Scratch project — what does it do?' },
  { icon: LightBulbIcon,        color: '#10b981', text: 'If you could invent one thing to help your school, what would it be?' },
  { icon: BeakerIcon,           color: '#06b6d4', text: 'What STEM topic are you most excited to learn about this term?' },
  { icon: RocketLaunchIcon,     color: '#8b5cf6', text: 'Describe a cool experiment you did in class or at home!' },
];

const TEEN_DEVELOPER_PROMPTS = [
  { icon: GlobeAltIcon,         color: '#06b6d4', text: 'Show us your latest web project — what tech stack did you use?' },
  { icon: SparklesIcon,         color: '#8b5cf6', text: 'What AI idea would you build to solve a problem in Nigeria?' },
  { icon: CodeBracketIcon,      color: '#6366f1', text: 'Share a Python code snippet you are proud of and explain what it does.' },
  { icon: CpuChipIcon,          color: '#ef4444', text: 'What Arduino or IoT project have you built or want to build?' },
  { icon: BoltIcon,             color: '#f59e0b', text: 'Which programming language do you think every student should learn first, and why?' },
  { icon: BeakerIcon,           color: '#10b981', text: 'How would you use data and code to improve education in your community?' },
];

const STEM_EXPLORER_PROMPTS = [
  { icon: CodeBracketIcon,  color: '#6366f1', text: 'What is the first program you ever wrote? Share it with us!' },
  { icon: GlobeAltIcon,     color: '#06b6d4', text: 'Which website do you visit most? Could you build something like it?' },
  { icon: SparklesIcon,     color: '#8b5cf6', text: 'How do you think AI is changing education in Nigeria?' },
  { icon: CpuChipIcon,      color: '#ef4444', text: 'What sensor would you add to a smart classroom and why?' },
  { icon: BeakerIcon,       color: '#10b981', text: 'If you could automate one chore at home using code, what would it be?' },
  { icon: StarIcon,         color: '#f59e0b', text: 'Which Rillcod course has taught you the most so far, and what did you build?' },
];

const COURSE_PROMPTS: Record<string, { color: string; prompts: string[] }> = {
  'Python':       { color: '#3572A5', prompts: ['Share a Python function you wrote this week', 'What was the hardest Python concept to understand at first?'] },
  'Web Dev':      { color: '#06b6d4', prompts: ['Show us your latest HTML/CSS page!', 'What makes a website design look professional?'] },
  'AI & ML':      { color: '#8b5cf6', prompts: ['What dataset would you use to train a model that helps Nigerian farmers?', 'How can AI be used to fight exam malpractice?'] },
  'Robotics':     { color: '#10b981', prompts: ['What is the most useful robot you can imagine for daily life in Nigeria?', 'Share your Arduino project — what does it do?'] },
  'Game Dev':     { color: '#f97316', prompts: ['What game are you building or want to build? Describe it!', 'Which Nigerian story or folktale would make a great video game?'] },
  'Scratch':      { color: '#f59e0b', prompts: ['Share your coolest Scratch animation — what inspired it?', 'What is the trickiest Scratch block to understand?'] },
  'Cyber Safety': { color: '#ec4899', prompts: ['What is one online safety rule every student must know?', 'How do you protect your password?'] },
};

const WEEKLY_CHALLENGE = {
  title: 'Weekly Coding Challenge',
  badge: 'Week Challenge',
  description: 'Build a simple weather checker: given a city name, display whether it is hot (above 30°C), warm, or cold. Use Python or JavaScript.',
  tags: ['python', 'javascript', 'beginner-friendly'],
  forPrograms: 'All students',
};

export default function CommunityPage() {
  const { profile, loading: authLoading } = useAuth();
  const db = createClient();

  const [posts, setPosts]             = useState<EngagePost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [filter, setFilter]           = useState<FilterTab>('all');
  const [error, setError]             = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<Set<string>>(new Set());
  const [likedPosts, setLikedPosts]   = useState<Set<string>>(new Set());

  // Composer
  const [message, setMessage]         = useState('');
  const [showCode, setShowCode]       = useState(false);
  const [codeSnippet, setCodeSnippet] = useState('');
  const [language, setLanguage]       = useState<Language>('python');
  const [posting, setPosting]         = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => { fetchPosts(); }, []);

  async function fetchPosts() {
    setLoadingPosts(true);
    try {
      const { data } = await db.from('engage_posts').select('*').order('created_at', { ascending: false }).limit(30);
      setPosts(data || []);
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
        likes:        0,
      }).select().single();
      if (err) throw err;
      setPosts(p => [data, ...p]);
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

  async function handleGetInspired() {
    setAiGenerating(true);
    try {
      const prompts = [
        'What would you build with Python to help students in Nigeria?',
        'Share a coding tip or trick you recently learned!',
        'What is the hardest bug you have ever fixed, and how did you solve it?',
        'If you could add one feature to any app you use daily, what would it be?',
        'What real-world problem do you want to solve with code someday?',
      ];
      setMessage(prompts[Math.floor(Math.random() * prompts.length)]);
    } catch { setError('Could not get inspiration — try again!'); }
    finally { setAiGenerating(false); }
  }

  const filteredPosts = posts.filter(p => {
    if (filter === 'code')       return !!p.code_snippet;
    if (filter === 'discussion') return !p.code_snippet;
    return true;
  });

  if (authLoading || !profile) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const FILTER_TABS = [
    { key: 'all' as FilterTab,        label: 'All Posts',    count: posts.length },
    { key: 'code' as FilterTab,       label: 'Code Shares',  count: posts.filter(p => !!p.code_snippet).length },
    { key: 'discussion' as FilterTab, label: 'Discussions',  count: posts.filter(p => !p.code_snippet).length },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden bg-card border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-violet-500/10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-[100px] pointer-events-none -translate-y-1/2" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-[0_0_30px_rgba(249,115,22,0.3)] border border-border">
                <UserGroupIcon className="w-8 h-8 text-foreground" />
              </div>
              <div>
                <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1 drop-shadow-md">Rillcod Academy</p>
                <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 uppercase tracking-tight mb-2 drop-shadow-sm">Student Hub</h1>
                <p className="text-sm text-muted-foreground font-medium">Share ideas, post code, ask questions, and grow together</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-muted border border-border px-5 py-3 rounded-2xl backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.5)]">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
              <span className="text-xs font-black uppercase tracking-widest text-foreground/70">{posts.length} Post{posts.length !== 1 ? 's' : ''} Shared</span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Main feed column ─────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Weekly Challenge Banner */}
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="bg-gradient-to-r from-violet-600/20 to-indigo-600/20 border border-violet-500/30 p-6 md:p-8 rounded-3xl relative overflow-hidden backdrop-blur-xl group hover:border-violet-500/50 transition-colors shadow-[0_0_30px_rgba(139,92,246,0.15)]">
              <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/20 rounded-full blur-[80px] pointer-events-none translate-x-1/3 -translate-y-1/3 group-hover:bg-violet-500/30 transition-colors" />
              <div className="relative flex items-start gap-5">
                <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(139,92,246,0.4)] border border-border">
                  <BoltIcon className="w-6 h-6 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest drop-shadow-md">{WEEKLY_CHALLENGE.badge}</p>
                    <span className="text-[9px] text-foreground/70 bg-muted border border-border px-2.5 py-1 rounded-full uppercase tracking-widest font-black">{WEEKLY_CHALLENGE.forPrograms}</span>
                  </div>
                  <h3 className="text-xl font-black text-foreground mb-2 tracking-tight">{WEEKLY_CHALLENGE.title}</h3>
                  <p className="text-sm text-foreground/60 leading-relaxed mb-4 font-medium">{WEEKLY_CHALLENGE.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {WEEKLY_CHALLENGE.tags.map(t => (
                      <span key={t} className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-lg text-violet-300">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setMessage('🏆 My solution to the Weekly Challenge:\n\n')}
                className="mt-6 w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-muted border border-border hover:bg-muted hover:border-primary/30 rounded-xl text-foreground text-[11px] font-black uppercase tracking-widest transition-all"
              >
                <RocketLaunchIcon className="w-4 h-4" /> Submit My Solution
              </button>
            </motion.div>

            {/* Error banner */}
            {error && (
              <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
              </div>
            )}

            {/* Post Composer */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-muted/30 border border-border p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md relative overflow-hidden group">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              
              <div className="flex items-center gap-2 mb-4">
                <ChatBubbleLeftRightIcon className="w-4 h-4 text-orange-400" />
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Share with the community</span>
              </div>

              <div className="flex items-start gap-4 mb-4">
                <AuthorAvatar name={profile.full_name || 'You'} />
                <textarea
                  className="flex-1 bg-muted border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder-white/30 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 resize-none transition-all shadow-inner"
                  placeholder="Ask a question, share your project, post a challenge, or celebrate a win..."
                  rows={3}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
              </div>

              <AnimatePresence>
                {showCode && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 pl-12 overflow-hidden">
                    <div className="flex items-center gap-2 mb-2">
                      <select
                        className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-bold tracking-wider text-foreground focus:outline-none focus:border-orange-500 transition-colors uppercase"
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
                    <div className="border border-border rounded-xl overflow-hidden shadow-inner bg-muted">
                      <CodeEditor value={codeSnippet} onChange={v => setCodeSnippet(v || '')} language={language} height={180} title="Code Snippet" showHeader={false} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-2 flex-wrap pt-2 pl-12">
                <button onClick={() => setShowCode(v => !v)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-indigo-400 bg-muted hover:bg-muted/80 border border-transparent hover:border-indigo-500/30 transition-all">
                  <CodeBracketIcon className="w-3.5 h-3.5" />
                  {showCode ? 'Remove Code' : 'Attach Code Snippet'}
                </button>
                <button onClick={handleGetInspired} disabled={aiGenerating}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-amber-400 bg-muted hover:bg-muted/80 border border-transparent hover:border-amber-500/30 transition-all disabled:opacity-50">
                  <LightBulbIcon className="w-3.5 h-3.5" />
                  {aiGenerating ? 'Finding idea...' : 'Get Inspired'}
                </button>
                <button onClick={handlePost} disabled={posting || !message.trim()}
                  className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-orange-500 flex-shrink-0 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-lg text-black text-[11px] font-black uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(249,115,22,0.3)] disabled:opacity-40 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0">
                  {posting ? 'Posting...' : 'Post Message'}
                </button>
              </div>
            </motion.div>

            {/* Filter Tabs */}
            <div className="flex gap-2 border-b border-border pb-5">
              {FILTER_TABS.map(tab => (
                <button key={tab.key} onClick={() => setFilter(tab.key)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                    filter === tab.key ? 'bg-orange-500/10 border border-orange-500/30 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-muted/30 border border-border text-muted-foreground hover:text-foreground/80 hover:bg-muted'
                  }`}>
                  {tab.label}
                  <span className={`text-[9px] px-2 py-0.5 rounded-full ${filter === tab.key ? 'bg-orange-500/20 text-orange-400' : 'bg-muted text-muted-foreground'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
              <button onClick={fetchPosts} className="ml-auto p-3 bg-muted/30 border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all shadow-inner" title="Refresh">
                <ArrowPathIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Posts Feed */}
            {loadingPosts ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredPosts.length === 0 ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-16 bg-card border border-dashed border-border rounded-3xl backdrop-blur-sm">
                <div className="w-20 h-20 bg-muted border border-border rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <UserGroupIcon className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <p className="text-foreground text-xl font-black tracking-tight mb-2">
                  {filter === 'all' ? 'No posts yet — be the first!' : filter === 'code' ? 'No code shared yet' : 'No discussions started yet'}
                </p>
                <p className="text-muted-foreground text-sm mb-10 font-medium">
                  {filter === 'all' ? 'Ask a question, share your project or start a discussion' : 'Use the composer above to share one'}
                </p>
                {/* Starter prompt suggestion */}
                <div className="max-w-md mx-auto text-left space-y-3">
                  <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest text-center mb-4">Try posting one of these:</p>
                  {[...YOUNG_INNOVATORS_PROMPTS.slice(0, 2), ...TEEN_DEVELOPER_PROMPTS.slice(0, 2)].map((p, i) => {
                    const Icon = p.icon;
                    return (
                      <motion.button initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} key={i} onClick={() => setMessage(p.text)}
                        className="w-full flex items-center gap-4 px-5 py-4 bg-muted/30 border border-border hover:border-orange-500/30 hover:bg-orange-500/10 rounded-xl text-left transition-all group shadow-sm hover:shadow-[0_0_20px_rgba(249,115,22,0.1)]">
                        <span style={{ color: p.color }} className="flex-shrink-0 bg-muted/50 p-2 rounded-lg border border-border group-hover:border-current transition-colors"><Icon className="w-5 h-5" /></span>
                        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground/90 transition-colors leading-relaxed">{p.text}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {filteredPosts.map((post, idx) => (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} key={post.id} className="bg-card rounded-2xl border border-border hover:border-primary/20 transition-all p-6 shadow-sm hover:shadow-md">
                    <div className="flex items-start gap-3 mb-3">
                      <AuthorAvatar name={post.author_name} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-foreground">{post.author_name}</span>
                          {post.code_snippet && (
                            <span className="px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 text-[9px] font-black uppercase tracking-widest">Code Share</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <ClockIcon className="w-3 h-3" />
                          <span>{timeAgo(post.created_at || '')}</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-foreground/70 leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>

                    {post.code_snippet && (
                      <div className="mb-3">
                        {expandedCode.has(post.id) ? (
                          <div>
                            <CodeEditor value={post.code_snippet} language={(post.language as Language) || 'python'} height={150} readOnly showHeader={false} />
                            <button onClick={() => setExpandedCode(p => { const n = new Set(p); n.delete(post.id); return n; })}
                              className="text-xs text-muted-foreground hover:text-foreground/60 mt-1.5 underline">
                              Hide code
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setExpandedCode(p => new Set([...p, post.id]))}
                            className="flex items-center gap-2 w-full px-3 py-2.5 bg-muted border border-border hover:border-indigo-500/40 text-sm text-muted-foreground hover:text-indigo-400 transition-all">
                            <CodeBracketIcon className="w-4 h-4" />
                            <span>View {post.language || 'code'} snippet</span>
                            <span className="ml-auto text-[10px] text-muted-foreground/50">tap to expand</span>
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-2.5 border-t border-border">
                      <button onClick={() => handleLike(post)}
                        className={`flex items-center gap-1.5 text-sm transition-colors ${likedPosts.has(post.id) ? 'text-orange-400' : 'text-muted-foreground hover:text-orange-400'}`}>
                        <FireIcon className="w-4 h-4" />
                        <span className="font-bold">{post.likes || 0}</span>
                      </button>
                      {likedPosts.has(post.id) && (
                        <span className="text-xs text-orange-400 flex items-center gap-1">
                          <CheckCircleIcon className="w-3 h-3" /> Liked
                        </span>
                      )}
                      <button onClick={() => setMessage(`Replying to ${post.author_name}: `)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors ml-auto">
                        <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> Reply
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* ── Sidebar ──────────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Young Innovators */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="bg-muted/30 backdrop-blur-md rounded-2xl border border-amber-500/20 overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/5 border-b border-amber-500/15">
                <StarIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Young Innovators</p>
                  <p className="text-[9px] text-muted-foreground">Basic 1 – JSS 1 · Ages 6–12</p>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest px-1 mb-2">Suggested discussion starters</p>
                {YOUNG_INNOVATORS_PROMPTS.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button key={i} onClick={() => setMessage(p.text)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 bg-muted/30 border border-border hover:border-amber-500/30 hover:bg-amber-500/5 text-left transition-all group">
                      <span style={{ color: p.color }} className="flex-shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5" /></span>
                      <span className="text-[10px] text-muted-foreground group-hover:text-foreground/70 leading-snug transition-colors">{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Teen Developers */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="bg-muted/30 backdrop-blur-md rounded-2xl border border-violet-500/20 overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 px-4 py-3 bg-violet-500/5 border-b border-violet-500/15">
                <RocketLaunchIcon className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Teen Developers</p>
                  <p className="text-[9px] text-muted-foreground">JSS 2 – SS 3 · Ages 12–18</p>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest px-1 mb-2">Suggested discussion starters</p>
                {TEEN_DEVELOPER_PROMPTS.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button key={i} onClick={() => setMessage(p.text)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 bg-muted/30 border border-border hover:border-violet-500/30 hover:bg-violet-500/5 text-left transition-all group">
                      <span style={{ color: p.color }} className="flex-shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5" /></span>
                      <span className="text-[10px] text-muted-foreground group-hover:text-foreground/70 leading-snug transition-colors">{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* STEM Explorers — All Students */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="bg-muted/30 backdrop-blur-md rounded-2xl border border-emerald-500/20 overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/15">
                <BeakerIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">STEM Explorers</p>
                  <p className="text-[9px] text-muted-foreground">All students · All courses</p>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest px-1 mb-2">General community starters</p>
                {STEM_EXPLORER_PROMPTS.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button key={i} onClick={() => setMessage(p.text)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 bg-muted/30 border border-border hover:border-emerald-500/30 hover:bg-emerald-500/5 text-left transition-all group">
                      <span style={{ color: p.color }} className="flex-shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5" /></span>
                      <span className="text-[10px] text-muted-foreground group-hover:text-foreground/70 leading-snug transition-colors">{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Per-course prompts */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="bg-muted/30 backdrop-blur-md rounded-2xl border border-border overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-border">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">Discuss Your Course</p>
              </div>
              <div className="p-4 space-y-3">
                {Object.entries(COURSE_PROMPTS).map(([course, { color, prompts }]) => (
                  <div key={course}>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1 px-1" style={{ color }}>{course}</p>
                    <div className="space-y-1">
                      {prompts.map((prompt, i) => (
                        <button key={i} onClick={() => setMessage(`[${course}] ${prompt}`)}
                          className="w-full text-left px-3 py-2 bg-muted/30 border border-border hover:bg-muted/50 transition-all group">
                          <span className="text-[10px] text-muted-foreground group-hover:text-foreground/60 leading-snug transition-colors">{prompt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Community rules */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }} className="bg-muted/30 backdrop-blur-md rounded-2xl border border-border p-5 shadow-sm">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 leading-none">Community Guidelines</p>
              <div className="space-y-3">
                {[
                  { icon: '✅', text: 'Be kind and respectful to every student' },
                  { icon: '💡', text: 'Share your real work — show your code, not just results' },
                  { icon: '❓', text: 'No question is too small — ask freely' },
                  { icon: '🙌', text: 'Celebrate others\' wins with a fire reaction' },
                  { icon: '🚫', text: 'No copying others\' work without credit' },
                ].map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-sm flex-shrink-0">{r.icon}</span>
                    <span className="text-[10px] text-muted-foreground leading-snug">{r.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Course topics to explore */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 }} className="bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-md rounded-2xl border border-border p-5 shadow-[0_0_20px_rgba(255,255,255,0.02)]">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 leading-none">Topics Covered</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Python', color: '#3572A5' },
                  { label: 'Scratch', color: '#f59e0b' },
                  { label: 'Web Dev', color: '#06b6d4' },
                  { label: 'Arduino', color: '#ef4444' },
                  { label: 'AI & ML', color: '#8b5cf6' },
                  { label: 'Robotics', color: '#10b981' },
                  { label: 'Game Dev', color: '#f97316' },
                  { label: 'JavaScript', color: '#f7df1e' },
                  { label: 'HTML/CSS', color: '#e34c26' },
                  { label: 'IoT', color: '#06b6d4' },
                  { label: 'Data Science', color: '#6366f1' },
                  { label: 'Cyber Safety', color: '#ec4899' },
                ].map(t => (
                  <button key={t.label}
                    onClick={() => setMessage(`Let's talk about ${t.label}! `)}
                    className="text-[10px] font-bold px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-all text-muted-foreground hover:text-foreground cursor-pointer"
                    style={{ '--tw-border-opacity': 0.3 } as any}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = t.color + '80')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
                    {t.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </div>
  );
}
