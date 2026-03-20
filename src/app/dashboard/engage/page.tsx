// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  FireIcon,
  SparklesIcon,
  CodeBracketIcon,
  PlusIcon,
  XMarkIcon,
  ArrowPathIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@/lib/icons';

const CodeEditor = dynamic(() => import('@/components/studio/IntegratedCodeRunner'), {
  ssr: false,
  loading: () => <div className="h-[150px] bg-black/20 animate-pulse rounded-none" />,
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
  const now = new Date();
  const then = new Date(dateStr);
  const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function AuthorAvatar({ name }: { name: string }) {
  const initial = (name || 'A')[0].toUpperCase();
  const colors = [
    'bg-violet-600', 'bg-indigo-600', 'bg-emerald-600',
    'bg-amber-600', 'bg-rose-600', 'bg-cyan-600',
  ];
  const color = colors[initial.charCodeAt(0) % colors.length];
  return (
    <div className={`w-9 h-9 rounded-none flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${color}`}>
      {initial}
    </div>
  );
}

export default function EngagePage() {
  const { profile, loading: authLoading } = useAuth();
  const db = createClient();

  const [posts, setPosts] = useState<EngagePost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [error, setError] = useState<string | null>(null);

  // Composer state
  const [message, setMessage] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [codeSnippet, setCodeSnippet] = useState('');
  const [language, setLanguage] = useState<Language>('javascript');
  const [posting, setPosting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Liked posts (optimistic)
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  // Expanded code posts
  const [expandedCode, setExpandedCode] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    setLoadingPosts(true);
    try {
      const { data, error: fetchError } = await db
        .from('engage_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (fetchError) throw fetchError;
      setPosts(data || []);
    } catch {
      // Table may not exist yet — show empty state gracefully
      setPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  }

  async function handlePost() {
    if (!profile || !message.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const payload = {
        user_id: profile.id,
        author_name: profile.full_name || profile.email || 'Anonymous',
        content: message.trim(),
        code_snippet: showCode && codeSnippet.trim() ? codeSnippet.trim() : null,
        language: showCode && codeSnippet.trim() ? language : null,
        likes: 0,
      };
      const { data, error: insertError } = await db
        .from('engage_posts')
        .insert(payload)
        .select()
        .single();
      if (insertError) throw insertError;
      setPosts((prev) => [data, ...prev]);
      setMessage('');
      setCodeSnippet('');
      setShowCode(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post. Please try again.';
      setError(msg);
    } finally {
      setPosting(false);
    }
  }

  async function handleLike(post: EngagePost) {
    if (likedPosts.has(post.id)) return;
    setLikedPosts((prev) => new Set([...prev, post.id]));
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, likes: (p.likes || 0) + 1 } : p))
    );
    try {
      await db
        .from('engage_posts')
        .update({ likes: (post.likes || 0) + 1 })
        .eq('id', post.id);
    } catch {
      // Revert optimistic update
      setLikedPosts((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likes: Math.max(0, (p.likes || 1) - 1) } : p))
      );
    }
  }

  async function handleAISpark() {
    setAiGenerating(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          prompt:
            'Generate an engaging discussion question or coding challenge for STEM students. Keep it concise and thought-provoking — 1-3 sentences max.',
        }),
      });
      const data = await res.json();
      if (data?.content) setMessage(data.content);
    } catch {
      setError('AI Spark failed. Try again.');
    } finally {
      setAiGenerating(false);
    }
  }

  function toggleCodeExpand(id: string) {
    setExpandedCode((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredPosts = posts.filter((p) => {
    if (filter === 'code') return !!p.code_snippet;
    if (filter === 'discussion') return !p.code_snippet;
    return true;
  });

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-orange-500/15 flex items-center justify-center rounded-none">
            <FireIcon className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Engage</h1>
            <p className="text-sm text-muted-foreground">Share ideas, code, and collaborate</p>
          </div>
          <button
            onClick={fetchPosts}
            className="ml-auto p-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="bg-card border border-border p-4 mb-6">
          <div className="flex items-start gap-3 mb-3">
            <AuthorAvatar name={profile.full_name || 'You'} />
            <textarea
              className="flex-1 bg-white/5 border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500 resize-none rounded-none"
              placeholder="Share an idea, ask a question, or post a challenge..."
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {/* Code editor toggle */}
          {showCode && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <select
                  className="px-3 py-1.5 bg-white/5 border border-border text-sm text-foreground focus:outline-none focus:border-violet-500 rounded-none"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="html">HTML</option>
                  <option value="robotics">Robotics</option>
                </select>
                <button
                  className="ml-auto p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowCode(false); setCodeSnippet(''); }}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <CodeEditor
                value={codeSnippet}
                onChange={(v) => setCodeSnippet(v || '')}
                language={language}
                height={180}
                title="Code Snippet"
                showHeader={false}
              />
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowCode((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-violet-400 border border-border hover:border-violet-500/50 transition-all rounded-none"
            >
              <CodeBracketIcon className="w-3.5 h-3.5" />
              {showCode ? 'Remove Code' : 'Add Code'}
            </button>
            <button
              onClick={handleAISpark}
              disabled={aiGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-amber-400 border border-border hover:border-amber-500/50 transition-all rounded-none disabled:opacity-50"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              {aiGenerating ? 'Generating...' : 'AI Spark'}
            </button>
            <button
              onClick={handlePost}
              disabled={posting || !message.trim()}
              className="ml-auto px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-5 border-b border-border">
          {(['all', 'code', 'discussion'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 text-sm font-bold capitalize transition-colors border-b-2 -mb-px ${
                filter === tab
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
              {tab === 'code' && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({posts.filter((p) => !!p.code_snippet).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Posts feed */}
        {loadingPosts ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-20">
            <FireIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-bold text-lg mb-1">No posts yet</p>
            <p className="text-muted-foreground text-sm">
              {filter === 'all'
                ? 'Be the first to post something!'
                : filter === 'code'
                ? 'No code posts yet — share some code!'
                : 'No discussion posts yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => (
              <div key={post.id} className="bg-card border border-border p-4">
                {/* Post header */}
                <div className="flex items-start gap-3 mb-3">
                  <AuthorAvatar name={post.author_name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground">{post.author_name}</span>
                      {post.code_snippet && (
                        <span className="px-1.5 py-0.5 bg-violet-500/15 text-violet-400 text-xs font-bold">
                          CODE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <ClockIcon className="w-3 h-3" />
                      <span>{timeAgo(post.created_at || '')}</span>
                    </div>
                  </div>
                </div>

                {/* Post content */}
                <p className="text-sm text-foreground leading-relaxed mb-3 whitespace-pre-wrap">
                  {post.content}
                </p>

                {/* Code snippet */}
                {post.code_snippet && (
                  <div className="mb-3">
                    {expandedCode.has(post.id) ? (
                      <div>
                        <CodeEditor
                          value={post.code_snippet}
                          language={(post.language as Language) || 'javascript'}
                          height={150}
                          readOnly
                          showHeader={false}
                        />
                        <button
                          onClick={() => toggleCodeExpand(post.id)}
                          className="text-xs text-muted-foreground hover:text-foreground mt-1.5 underline"
                        >
                          Hide code
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleCodeExpand(post.id)}
                        className="flex items-center gap-2 w-full px-3 py-2 bg-black/20 border border-border hover:border-violet-500/40 text-sm text-muted-foreground hover:text-violet-400 transition-all rounded-none"
                      >
                        <CodeBracketIcon className="w-4 h-4" />
                        <span>View {post.language || 'code'} snippet</span>
                        <span className="ml-auto text-xs">click to expand</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Post actions */}
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <button
                    onClick={() => handleLike(post)}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${
                      likedPosts.has(post.id)
                        ? 'text-orange-400'
                        : 'text-muted-foreground hover:text-orange-400'
                    }`}
                  >
                    <FireIcon className="w-4 h-4" />
                    <span>{post.likes || 0}</span>
                  </button>
                  {likedPosts.has(post.id) && (
                    <span className="text-xs text-orange-400 flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3" />
                      Liked
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
