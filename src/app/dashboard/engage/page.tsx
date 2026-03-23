// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
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
  loading: () => <div className="h-[150px] bg-black/20 animate-pulse" />,
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
    <div className={`w-9 h-9 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${colors[initial.charCodeAt(0) % colors.length]}`}>
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
      <div className="relative overflow-hidden bg-[#0a0a12] border-b border-white/[0.06]">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/10 via-transparent to-violet-900/10 pointer-events-none" />
        <div className="relative px-4 sm:px-6 md:px-10 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-500/15 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                <UserGroupIcon className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <p className="text-[9px] font-black text-orange-400/70 uppercase tracking-[0.3em] mb-0.5">Rillcod Academy</p>
                <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight italic leading-none">Student Community Hub</h1>
                <p className="text-xs text-white/40 font-semibold mt-1">Share ideas, post your code, ask questions, and grow together</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/30">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold">{posts.length} post{posts.length !== 1 ? 's' : ''} shared</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Main feed column ─────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Weekly Challenge Banner */}
            <div className="bg-gradient-to-r from-violet-900/30 to-indigo-900/20 border border-violet-500/30 p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="relative flex items-start gap-4">
                <div className="w-10 h-10 bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                  <BoltIcon className="w-5 h-5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <p className="text-[9px] font-black text-violet-400 uppercase tracking-[0.3em]">{WEEKLY_CHALLENGE.badge}</p>
                    <span className="text-[8px] text-violet-400/50 border border-violet-500/20 px-1.5 py-0.5">{WEEKLY_CHALLENGE.forPrograms}</span>
                  </div>
                  <h3 className="text-sm font-black text-white mb-1">{WEEKLY_CHALLENGE.title}</h3>
                  <p className="text-[11px] text-white/50 leading-relaxed mb-3">{WEEKLY_CHALLENGE.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKLY_CHALLENGE.tags.map(t => (
                      <span key={t} className="text-[9px] font-bold px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-400">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setMessage('🏆 My solution to the Weekly Challenge:\n\n')}
                className="mt-4 w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-violet-600/30 border border-violet-500/40 text-violet-300 text-xs font-black uppercase tracking-widest hover:bg-violet-600/40 transition-all"
              >
                <RocketLaunchIcon className="w-3.5 h-3.5" /> Submit My Solution
              </button>
            </div>

            {/* Error banner */}
            {error && (
              <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
              </div>
            )}

            {/* Post Composer */}
            <div className="bg-[#0d0d18] border border-white/[0.08] p-5">
              <div className="flex items-center gap-2 mb-3">
                <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-white/30" />
                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Share with the community</span>
              </div>

              <div className="flex items-start gap-3 mb-3">
                <AuthorAvatar name={profile.full_name || 'You'} />
                <textarea
                  className="flex-1 bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500 resize-none transition-colors"
                  placeholder="Ask a question, share your project, post a challenge, or celebrate a win..."
                  rows={3}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
              </div>

              {showCode && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      className="px-3 py-1.5 bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                      value={language}
                      onChange={e => setLanguage(e.target.value as Language)}
                    >
                      <option value="python">Python</option>
                      <option value="javascript">JavaScript</option>
                      <option value="html">HTML / CSS</option>
                      <option value="robotics">Robotics / Arduino</option>
                    </select>
                    <button className="ml-auto p-1 text-white/30 hover:text-white/60" onClick={() => { setShowCode(false); setCodeSnippet(''); }}>
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <CodeEditor value={codeSnippet} onChange={v => setCodeSnippet(v || '')} language={language} height={160} title="Code Snippet" showHeader={false} />
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button onClick={() => setShowCode(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/40 hover:text-violet-400 border border-white/10 hover:border-violet-500/40 transition-all">
                  <CodeBracketIcon className="w-3.5 h-3.5" />
                  {showCode ? 'Remove Code Snippet' : 'Attach Code Snippet'}
                </button>
                <button onClick={handleGetInspired} disabled={aiGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/40 hover:text-amber-400 border border-white/10 hover:border-amber-500/40 transition-all disabled:opacity-50">
                  <LightBulbIcon className="w-3.5 h-3.5" />
                  {aiGenerating ? 'Finding idea...' : 'Get Inspired'}
                </button>
                <button onClick={handlePost} disabled={posting || !message.trim()}
                  className="ml-auto px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {posting ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-0 border-b border-white/[0.06]">
              {FILTER_TABS.map(tab => (
                <button key={tab.key} onClick={() => setFilter(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${
                    filter === tab.key ? 'border-orange-500 text-orange-400' : 'border-transparent text-white/30 hover:text-white/60'
                  }`}>
                  {tab.label}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${filter === tab.key ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-white/20'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
              <button onClick={fetchPosts} className="ml-auto p-3 text-white/20 hover:text-white/60 transition-colors" title="Refresh">
                <ArrowPathIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Posts Feed */}
            {loadingPosts ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-white/10">
                <UserGroupIcon className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <p className="text-white text-base font-black mb-1">
                  {filter === 'all' ? 'No posts yet — be the first!' : filter === 'code' ? 'No code shared yet' : 'No discussions started yet'}
                </p>
                <p className="text-white/30 text-xs mb-6">
                  {filter === 'all' ? 'Ask a question, share your project or start a discussion' : 'Use the composer above to share one'}
                </p>
                {/* Starter prompt suggestion */}
                <div className="max-w-sm mx-auto text-left space-y-2">
                  <p className="text-[9px] font-black text-white/20 uppercase tracking-widest text-center mb-3">Try posting one of these:</p>
                  {[...YOUNG_INNOVATORS_PROMPTS.slice(0, 2), ...TEEN_DEVELOPER_PROMPTS.slice(0, 2)].map((p, i) => {
                    const Icon = p.icon;
                    return (
                      <button key={i} onClick={() => setMessage(p.text)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.02] border border-white/[0.06] hover:border-orange-500/30 hover:bg-orange-500/5 text-left transition-all group">
                        <span style={{ color: p.color }} className="flex-shrink-0"><Icon className="w-4 h-4" /></span>
                        <span className="text-xs text-white/40 group-hover:text-white/70 transition-colors">{p.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPosts.map(post => (
                  <div key={post.id} className="bg-[#0d0d18] border border-white/[0.06] hover:border-white/10 transition-all p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <AuthorAvatar name={post.author_name} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-white">{post.author_name}</span>
                          {post.code_snippet && (
                            <span className="px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 text-[9px] font-black uppercase tracking-widest">Code Share</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-white/30 mt-0.5">
                          <ClockIcon className="w-3 h-3" />
                          <span>{timeAgo(post.created_at || '')}</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-white/70 leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>

                    {post.code_snippet && (
                      <div className="mb-3">
                        {expandedCode.has(post.id) ? (
                          <div>
                            <CodeEditor value={post.code_snippet} language={(post.language as Language) || 'python'} height={150} readOnly showHeader={false} />
                            <button onClick={() => setExpandedCode(p => { const n = new Set(p); n.delete(post.id); return n; })}
                              className="text-xs text-white/30 hover:text-white/60 mt-1.5 underline">
                              Hide code
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setExpandedCode(p => new Set([...p, post.id]))}
                            className="flex items-center gap-2 w-full px-3 py-2.5 bg-black/30 border border-white/[0.06] hover:border-indigo-500/40 text-sm text-white/30 hover:text-indigo-400 transition-all">
                            <CodeBracketIcon className="w-4 h-4" />
                            <span>View {post.language || 'code'} snippet</span>
                            <span className="ml-auto text-[10px] text-white/20">tap to expand</span>
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-2.5 border-t border-white/[0.06]">
                      <button onClick={() => handleLike(post)}
                        className={`flex items-center gap-1.5 text-sm transition-colors ${likedPosts.has(post.id) ? 'text-orange-400' : 'text-white/30 hover:text-orange-400'}`}>
                        <FireIcon className="w-4 h-4" />
                        <span className="font-bold">{post.likes || 0}</span>
                      </button>
                      {likedPosts.has(post.id) && (
                        <span className="text-xs text-orange-400 flex items-center gap-1">
                          <CheckCircleIcon className="w-3 h-3" /> Liked
                        </span>
                      )}
                      <button onClick={() => setMessage(`Replying to ${post.author_name}: `)}
                        className="flex items-center gap-1.5 text-xs text-white/20 hover:text-white/50 transition-colors ml-auto">
                        <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> Reply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Sidebar ──────────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Young Innovators */}
            <div className="bg-[#0d0d18] border border-amber-500/20 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/5 border-b border-amber-500/15">
                <StarIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Young Innovators</p>
                  <p className="text-[9px] text-white/30">Basic 1 – JSS 1 · Ages 6–12</p>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-[9px] font-black text-white/20 uppercase tracking-widest px-1 mb-2">Suggested discussion starters</p>
                {YOUNG_INNOVATORS_PROMPTS.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button key={i} onClick={() => setMessage(p.text)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 bg-white/[0.02] border border-white/[0.04] hover:border-amber-500/30 hover:bg-amber-500/5 text-left transition-all group">
                      <span style={{ color: p.color }} className="flex-shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5" /></span>
                      <span className="text-[10px] text-white/40 group-hover:text-white/70 leading-snug transition-colors">{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Teen Developers */}
            <div className="bg-[#0d0d18] border border-violet-500/20 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-violet-500/5 border-b border-violet-500/15">
                <RocketLaunchIcon className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Teen Developers</p>
                  <p className="text-[9px] text-white/30">JSS 2 – SS 3 · Ages 12–18</p>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-[9px] font-black text-white/20 uppercase tracking-widest px-1 mb-2">Suggested discussion starters</p>
                {TEEN_DEVELOPER_PROMPTS.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button key={i} onClick={() => setMessage(p.text)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 bg-white/[0.02] border border-white/[0.04] hover:border-violet-500/30 hover:bg-violet-500/5 text-left transition-all group">
                      <span style={{ color: p.color }} className="flex-shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5" /></span>
                      <span className="text-[10px] text-white/40 group-hover:text-white/70 leading-snug transition-colors">{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEM Explorers — All Students */}
            <div className="bg-[#0d0d18] border border-emerald-500/20 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/15">
                <BeakerIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">STEM Explorers</p>
                  <p className="text-[9px] text-white/30">All students · All courses</p>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-[9px] font-black text-white/20 uppercase tracking-widest px-1 mb-2">General community starters</p>
                {STEM_EXPLORER_PROMPTS.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button key={i} onClick={() => setMessage(p.text)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 bg-white/[0.02] border border-white/[0.04] hover:border-emerald-500/30 hover:bg-emerald-500/5 text-left transition-all group">
                      <span style={{ color: p.color }} className="flex-shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5" /></span>
                      <span className="text-[10px] text-white/40 group-hover:text-white/70 leading-snug transition-colors">{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Per-course prompts */}
            <div className="bg-[#0d0d18] border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Discuss Your Course</p>
              </div>
              <div className="p-3 space-y-2">
                {Object.entries(COURSE_PROMPTS).map(([course, { color, prompts }]) => (
                  <div key={course}>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1 px-1" style={{ color }}>{course}</p>
                    <div className="space-y-1">
                      {prompts.map((prompt, i) => (
                        <button key={i} onClick={() => setMessage(`[${course}] ${prompt}`)}
                          className="w-full text-left px-3 py-2 bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all group">
                          <span className="text-[10px] text-white/30 group-hover:text-white/60 leading-snug transition-colors">{prompt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Community rules */}
            <div className="bg-[#0d0d18] border border-white/[0.06] p-4">
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Community Guidelines</p>
              <div className="space-y-2">
                {[
                  { icon: '✅', text: 'Be kind and respectful to every student' },
                  { icon: '💡', text: 'Share your real work — show your code, not just results' },
                  { icon: '❓', text: 'No question is too small — ask freely' },
                  { icon: '🙌', text: 'Celebrate others\' wins with a fire reaction' },
                  { icon: '🚫', text: 'No copying others\' work without credit' },
                ].map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-sm flex-shrink-0">{r.icon}</span>
                    <span className="text-[10px] text-white/30 leading-snug">{r.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Course topics to explore */}
            <div className="bg-[#0d0d18] border border-white/[0.06] p-4">
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Topics Covered in Your Courses</p>
              <div className="flex flex-wrap gap-1.5">
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
                    className="text-[9px] font-bold px-2 py-0.5 border border-white/10 hover:border-opacity-50 transition-all text-white/40 hover:text-white/80"
                    style={{ '--tw-border-opacity': 0.3 } as any}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = t.color + '80')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
