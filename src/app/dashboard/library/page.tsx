"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import {
  BookOpenIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowUpRightIcon,
  ArrowDownIcon,
  SparklesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";

type ContentItem = {
  id: string;
  title: string;
  description?: string | null;
  content_type: string;
  category?: string | null;
  tags?: string[] | null;
  subject?: string | null;
  grade_level?: string | null;
  license_type?: string | null;
  attribution?: string | null;
  is_approved: boolean;
  rating_average?: number | null;
  rating_count?: number | null;
  usage_count?: number | null;
  created_at: string;
  files?: {
    public_url?: string | null;
    file_type?: string | null;
    thumbnail_url?: string | null;
  } | null;
};

export default function ContentLibraryPage() {
  const { profile, loading: authLoading } = useAuth();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [ratingState, setRatingState] = useState<{ id: string; rating: number; review: string } | null>(null);

  // AI generation state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState('');
  const [aiGrade, setAiGrade] = useState('JSS1–SS3');

  const [form, setForm] = useState({
    title: "",
    description: "",
    contentType: "video",
    fileId: "",
    category: "",
    tags: "",
    subject: "",
    gradeLevel: "",
    licenseType: "",
    attribution: "",
  });

  const isStaff = profile?.role === "admin" || profile?.role === "teacher" || profile?.role === "school";
  const canApprove = profile?.role === "admin";
  const canUpload = profile?.role === "admin" || profile?.role === "teacher";

  const loadItems = async (query = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      const res = await fetch(`/api/content-library?${params.toString()}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load library");
      setItems(payload.data ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load library");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    loadItems();

    if (isStaff) {
      createClient()
        .from("courses")
        .select("id, title")
        .order("title")
        .then(({ data }) => setCourses((data ?? []) as any));
    }
  }, [profile?.id, authLoading]); // eslint-disable-line

  const filtered = useMemo(() => {
    if (!search) return items;
    return items.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));
  }, [items, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        contentType: form.contentType,
        fileId: form.fileId.trim() || undefined,
        category: form.category.trim() || undefined,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        subject: form.subject.trim() || undefined,
        gradeLevel: form.gradeLevel.trim() || undefined,
        licenseType: form.licenseType.trim() || undefined,
        attribution: form.attribution.trim() || undefined,
      };
      const res = await fetch("/api/content-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to create content");
      setItems((prev) => [data.data, ...prev]);
      setForm({
        title: "",
        description: "",
        contentType: "video",
        fileId: "",
        category: "",
        tags: "",
        subject: "",
        gradeLevel: "",
        licenseType: "",
        attribution: "",
      });
    } catch (e: any) {
      setError(e.message ?? "Failed to create content");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string, approved: boolean) => {
    try {
      const res = await fetch(`/api/content-library/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to update approval");
      setItems((prev) => prev.map((item) => (item.id === id ? data.data : item)));
    } catch (e: any) {
      setError(e.message ?? "Failed to update approval");
    }
  };

  const handleCopyToCourse = async (id: string) => {
    if (!selectedCourse) {
      setError("Select a course to copy into.");
      return;
    }
    try {
      const res = await fetch(`/api/content-library/${id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourse }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to copy content");
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, usage_count: (item.usage_count ?? 0) + 1 } : item
        )
      );
    } catch (e: any) {
      setError(e.message ?? "Failed to copy content");
    }
  };

  const handleRate = async (id: string, rating: number, review: string) => {
    try {
      const res = await fetch(`/api/content-library/${id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, review }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to submit rating");
      setRatingState(null);
      await loadItems(search);
    } catch (e: any) {
      setError(e.message ?? "Failed to submit rating");
    }
  };

  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) { setAiError('Enter a topic first.'); return; }
    setAiGenerating(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'library-content',
          topic: aiTopic,
          gradeLevel: aiGrade,
          subject: form.subject || undefined,
          contentType: form.contentType,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Generation failed');
      const d = payload.data;
      setForm(prev => ({
        ...prev,
        title: d.title ?? prev.title,
        description: d.description ?? prev.description,
        category: d.category ?? prev.category,
        tags: Array.isArray(d.tags) ? d.tags.join(', ') : prev.tags,
        subject: d.subject ?? prev.subject,
        gradeLevel: d.grade_level ?? prev.gradeLevel,
        licenseType: d.license_type ?? prev.licenseType,
        attribution: d.attribution ?? prev.attribution,
      }));
      setAiOpen(false);
    } catch (e: any) {
      setAiError(e.message ?? 'Failed to generate');
    } finally {
      setAiGenerating(false);
    }
  };

  const handlePreview = (item: ContentItem) => {
    const url = item.files?.public_url;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      setError("No preview link available for this item.");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/40 text-sm">Loading content library…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpenIcon className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Content Library</span>
            </div>
            <h1 className="text-3xl font-extrabold">Library</h1>
            <p className="text-white/40 text-sm mt-1">Browse and reuse approved content</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search content"
                className="pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30"
              />
            </div>
            <button
              onClick={() => loadItems(search)}
              className="px-3 py-2 text-xs font-bold bg-white/10 hover:bg-white/15 rounded-xl"
            >
              Search
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {canUpload && (
          <>
          {/* AI Generation Panel */}
          <div className="bg-gradient-to-br from-violet-500/10 to-cyan-500/5 border border-violet-500/20 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setAiOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
                  <SparklesIcon className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Generate metadata with AI</p>
                  <p className="text-xs text-white/40">Auto-fill content fields using Claude AI</p>
                </div>
              </div>
              {aiOpen ? <ChevronUpIcon className="w-4 h-4 text-white/40" /> : <ChevronDownIcon className="w-4 h-4 text-white/40" />}
            </button>

            {aiOpen && (
              <div className="px-5 pb-5 space-y-4 border-t border-violet-500/20">
                {aiError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 mt-4">{aiError}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Content Topic *</p>
                    <input
                      value={aiTopic}
                      onChange={e => setAiTopic(e.target.value)}
                      placeholder="e.g. Introduction to Scratch Programming"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Grade Level</p>
                    <select
                      value={aiGrade}
                      onChange={e => setAiGrade(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                    >
                      {['Basic 1–Basic 3','Basic 4–Basic 6','JSS1–JSS3','SS1–SS3','JSS1–SS3','Basic 1–SS3'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleAiGenerate}
                    disabled={aiGenerating}
                    className="md:col-span-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all"
                  >
                    {aiGenerating ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <SparklesIcon className="w-4 h-4" />
                    )}
                    {aiGenerating ? 'Generating...' : 'Generate Metadata'}
                  </button>
                </div>
                <p className="text-[10px] text-white/30">AI will fill in the title, description, category, tags, grade level, and license. You can edit everything before saving.</p>
              </div>
            )}
          </div>

          <form onSubmit={handleCreate} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <PlusIcon className="w-4 h-4 text-violet-300" />
              <p className="text-sm font-bold text-white">Add content</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={form.title}
                onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                placeholder="Title"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
                required
              />
              <select
                value={form.contentType}
                onChange={(e) => setForm((s) => ({ ...s, contentType: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              >
                <option value="video">Video</option>
                <option value="document">Document</option>
                <option value="quiz">Quiz</option>
                <option value="presentation">Presentation</option>
                <option value="interactive">Interactive</option>
              </select>
              <input
                value={form.fileId}
                onChange={(e) => setForm((s) => ({ ...s, fileId: e.target.value }))}
                placeholder="File ID (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
              <input
                value={form.category}
                onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
                placeholder="Category"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
              <input
                value={form.tags}
                onChange={(e) => setForm((s) => ({ ...s, tags: e.target.value }))}
                placeholder="Tags (comma separated)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
              <input
                value={form.subject}
                onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))}
                placeholder="Subject"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
              <input
                value={form.gradeLevel}
                onChange={(e) => setForm((s) => ({ ...s, gradeLevel: e.target.value }))}
                placeholder="Grade level"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
              <input
                value={form.licenseType}
                onChange={(e) => setForm((s) => ({ ...s, licenseType: e.target.value }))}
                placeholder="License type"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
              <input
                value={form.attribution}
                onChange={(e) => setForm((s) => ({ ...s, attribution: e.target.value }))}
                placeholder="Attribution"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
            </div>
            <textarea
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              placeholder="Description"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
              rows={3}
            />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add Content"}
            </button>
          </form>
          </>
        )}

        {isStaff && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-white/40">
            <span className="text-white/60 font-bold">Copy to course:</span>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
            >
              <option value="">Select a course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((item) => (
            <div key={item.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">{item.title}</p>
                  <p className="text-xs text-white/30">{item.content_type} · {item.subject ?? "General"}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.is_approved ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border-amber-500/30"}`}>
                  {item.is_approved ? "Approved" : "Pending"}
                </span>
              </div>
              {item.description && <p className="text-xs text-white/40 line-clamp-3">{item.description}</p>}
              <div className="flex flex-wrap gap-2 text-[10px] text-white/40">
                {(item.tags ?? []).slice(0, 4).map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">#{tag}</span>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-white/40">
                <span>Rating: {item.rating_average ?? "N/A"} ({item.rating_count ?? 0})</span>
                <span>Used: {item.usage_count ?? 0}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handlePreview(item)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15"
                >
                  Preview
                </button>
                {isStaff && (
                  <button
                    onClick={() => handleCopyToCourse(item.id)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
                  >
                    Copy to course
                  </button>
                )}
                {canApprove && !item.is_approved && (
                  <>
                    <button
                      onClick={() => handleApprove(item.id, true)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleApprove(item.id, false)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                    >
                      Reject
                    </button>
                  </>
                )}
                <button
                  onClick={() =>
                    setRatingState({
                      id: item.id,
                      rating: 5,
                      review: "",
                    })
                  }
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                >
                  Rate
                </button>
              </div>
              {ratingState?.id === item.id && (
                <div className="border-t border-white/10 pt-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <span>Rating</span>
                    <select
                      value={ratingState.rating}
                      onChange={(e) =>
                        setRatingState((prev) =>
                          prev ? { ...prev, rating: parseInt(e.target.value, 10) } : prev
                        )
                      }
                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
                    >
                      {[5, 4, 3, 2, 1].map((rating) => (
                        <option key={rating} value={rating}>
                          {rating}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={ratingState.review}
                    onChange={(e) =>
                      setRatingState((prev) => (prev ? { ...prev, review: e.target.value } : prev))
                    }
                    placeholder="Optional review"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30"
                    rows={2}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRate(item.id, ratingState.rating, ratingState.review)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    >
                      Submit
                    </button>
                    <button
                      onClick={() => setRatingState(null)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 text-white/60 hover:bg-white/15"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-white/40 text-sm">No content found.</div>
        )}
      </div>
    </div>
  );
}
