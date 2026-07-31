// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import AIMarkdown from '@/components/ai/AIMarkdown';
import {
  ArchiveBoxIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  EyeIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  CodeBracketIcon,
  ClockIcon,
  ChevronRightIcon,
  CheckCircleIcon,
} from '@/lib/icons';

const CodeEditor = dynamic(() => import('@/components/studio/IntegratedCodeRunner'), {
  ssr: false,
  loading: () => <div className="h-[200px] bg-black/20 animate-pulse rounded-xl" />,
});

interface VaultItem {
  id: string;
  user_id: string;
  title: string;
  language: string;
  code: string;
  description: string | null;
  tags: string[] | null;
  created_at: string | null;
}

type VaultLanguage =
  | 'javascript'
  | 'python'
  | 'html'
  | 'css'
  | 'typescript'
  | 'sql'
  | 'bash';

const LANGUAGE_COLORS: Record<string, string> = {
  javascript: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  python: 'bg-primary/15 text-primary',
  html: 'bg-primary/15 text-primary',
  css: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  typescript: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  sql: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  bash: 'bg-slate-500/15 text-muted-foreground/70',
};

const RUNNER_LANGUAGES: Record<string, 'javascript' | 'python' | 'html' | 'robotics'> = {
  javascript: 'javascript',
  typescript: 'javascript',
  python: 'python',
  html: 'html',
  css: 'html',
  sql: 'javascript',
  bash: 'javascript',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface SnippetFormState {
  title: string;
  language: VaultLanguage;
  tags: string;
  description: string;
  code: string;
}

const BLANK_FORM: SnippetFormState = {
  title: '',
  language: 'javascript',
  tags: '',
  description: '',
  code: '',
};

const STARTER_TEMPLATES = [
  {
    title: 'Fetch Web Data',
    language: 'javascript',
    description: 'Simple utility to grab data from the web using modern fetch methods.',
    code: `// ⚡ Reusable API Fetch Wrapper
// Handles response validation and extracts JSON safely.

async function fetchJSON(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const config = { ...options, headers };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    return await response.json();
  } catch (error) {
    console.error('[API Fetch Error]:', error.message);
    throw error;
  }
}

// --- Usage Example ---
// fetchJSON('https://api.github.com/users/octocat')
//   .then(data => console.log('User Profile:', data))
//   .catch(err => console.error('Fetch failed:', err));`,
    tags: ['api', 'fetch', 'async', 'json']
  },
  {
    title: 'Frosted Glass Card',
    language: 'html',
    description: 'A modern card design with beautiful blurry glass backgrounds and hover scales.',
    code: `<!-- 🎨 CSS Glassmorphism Card Layout -->
<div class="glass-card">
  <div class="glow-orb"></div>
  <h3>My Creative Card</h3>
  <p>A standard card design with beautiful blurry glass backgrounds and hover scales.</p>
  <button class="glass-btn">Activate</button>
</div>

<style>
  .glass-card {
    position: relative;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    padding: 32px;
    text-align: center;
    max-width: 320px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
  }
  .glass-card:hover {
    transform: translateY(-8px) scale(1.02);
    border-color: rgba(249, 115, 22, 0.3);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }
  .glass-btn {
    background: linear-gradient(135deg, #f97316, #ec4899);
    border: none;
    color: white;
    padding: 10px 24px;
    border-radius: 12px;
    font-weight: bold;
    cursor: pointer;
    transition: transform 0.2s;
  }
  .glass-btn:hover {
    transform: scale(1.05);
  }
</style>`,
    tags: ['css', 'glassmorphism', 'card', 'ui']
  },
  {
    title: 'Python Grade Analyzer',
    language: 'python',
    description: 'A clean Python script to calculate average grades from a student database file.',
    code: `# 🐍 Python CSV Marksheet Analyzer
# Computes totals, averages, and ranks students based on score.
import csv

def analyze_marksheet(file_path):
    students = []
    
    with open(file_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row['Name']
            score = float(row['Score'])
            students.append({'name': name, 'score': score})
            
    # Calculations
    highest = max(students, key=lambda x: x['score'])
    lowest = min(students, key=lambda x: x['score'])
    avg_score = sum(s['score'] for s in students) / len(students)
    
    # Sort by rank
    students.sort(key=lambda x: x['score'], reverse=True)
    
    print(f"--- Student Report Analytics ({len(students)} Records) ---")
    print(f"Class Average: {avg_score:.2f}")
    print(f"Top Performer: {highest['name']} ({highest['score']})")
    print(f"Needs Support: {lowest['name']} ({lowest['score']})")
    print("-" * 40)
    for rank, s in enumerate(students, 1):
        print(f"#{rank} - {s['name']}: {s['score']}%")

# --- Example Usage (Assumes data.csv exists) ---
# analyze_marksheet('marks.csv')`,
    tags: ['python', 'csv', 'analytics', 'files']
  },
  {
    title: 'Arduino Blinking Light',
    language: 'robotics',
    description: 'A standard microcontroller script to blink an LED without blocking other sensors.',
    code: `// 🤖 Non-blocking LED Controller Class
// Replaces delay() with millis() comparison for responsive hardware.

class LedController {
  private:
    int pin;
    long interval;
    int state;
    unsigned long previousMillis;

  public:
    LedController(int pinNumber, long blinkInterval) {
      pin = pinNumber;
      interval = blinkInterval;
      state = LOW;
      previousMillis = 0;
    }

    void begin() {
      pinMode(pin, OUTPUT);
    }

    void update() {
      unsigned long currentMillis = millis();
      if (currentMillis - previousMillis >= interval) {
        previousMillis = currentMillis;
        state = (state == LOW) ? HIGH : LOW;
        digitalWrite(pin, state);
      }
    }
};

// --- Execution Setup ---
LedController statusLed(13, 500); // LED on PIN 13, blink every 500ms

void setup() {
  statusLed.begin();
}

void loop() {
  statusLed.update(); // Keeps responsive to other sensors
}`,
    tags: ['robotics', 'arduino', 'cpp', 'millis']
  },
  {
    title: 'Solar Microgrid Sizing Calculator',
    language: 'python',
    description: 'Calculate solar panel array size and lithium battery backup for home and school power systems.',
    code: `# ☀️ Solar Microgrid Capacity Calculator
def calculate_solar_system(appliance_watts, hours_per_day, sun_hours=5.5):
    daily_wh = appliance_watts * hours_per_day
    # 25% safety margin for inverter efficiency loss
    required_wh = daily_wh * 1.25
    panel_capacity_watts = required_wh / sun_hours
    # 24V battery bank calculation (Amp-hours)
    battery_ah = (required_wh / 24) * 1.5 # 50% DOD safety

    print("=== 🔋 SOLAR MICROGRID SYSTEM DESIGN ===")
    print(f"Total Daily Energy Demand : {daily_wh:.0f} Wh ({daily_wh/1000:.2f} kWh)")
    print(f"Required Solar Array Size : {panel_capacity_watts:.0f} Watts")
    print(f"Recommended Battery Bank  : {battery_ah:.0f} Ah @ 24V")

# Example: 450W total load running 8 hours per day
calculate_solar_system(appliance_watts=450, hours_per_day=8)`,
    tags: ['python', 'solar', 'engineering', 'green-energy']
  },
  {
    title: 'WAEC & Term Grade Classifier',
    language: 'python',
    description: 'Classify student test scores into WAEC official letter grades (A1, B2, B3, C4, C5, C6, D7, E8, F9).',
    code: `# 🏆 WAEC Official Grade Classifier
def get_waec_grade(score):
    if score >= 75: return "A1", "Excellent"
    if score >= 70: return "B2", "Very Good"
    if score >= 65: return "B3", "Good"
    if score >= 60: return "C4", "Credit"
    if score >= 55: return "C5", "Credit"
    if score >= 50: return "C6", "Credit"
    if score >= 45: return "D7", "Pass"
    if score >= 40: return "E8", "Pass"
    return "F9", "Fail"

students = [
    ("Amara Obi", 88),
    ("Chidi Eze", 72),
    ("Fatima Bello", 64),
    ("Emeka Kalu", 48),
    ("Blessing Ade", 38)
]

print("=== 📜 OFFICIAL TERMLY RESULT SHEET ===")
for name, score in students:
    code, remark = get_waec_grade(score)
    print(f"{name:<15} Score: {score:>2}%  Grade: {code} ({remark})")`,
    tags: ['python', 'education', 'waec', 'grades']
  },
  {
    title: 'AI Prompt Engineering: STEM Tutor Persona',
    language: 'python',
    description: 'System prompt & few-shot examples designed for tutoring secondary school STEM students.',
    code: `# 🤖 AI Prompt Engineering: STEM Tutor Framing
system_prompt = """
You are an expert STEM Tutor at Rillcod Academy.
Guidelines:
1. Always break down complex physics, math, or coding concepts into simple real-world analogies.
2. Structure your answer: [Core Concept, Code Example, Practice Question].
3. Encourage the student and keep the tone empowering.
"""

few_shot_examples = """
Question: What is a loop in Python?
Tutor Response:
Concept: A loop is like repeating your morning routine every day — it does the same set of actions until a condition is met!
Code:
for day in ["Mon", "Tue", "Wed", "Thu", "Fri"]:
    print(f"Wake up and code on {day}!")
Practice: Write a loop that prints numbers from 1 to 5.
"""

print("=== SYSTEM PROMPT SETUP ===")
print(system_prompt.strip())
print("\n=== FEW-SHOT DEMONSTRATION ===")
print(few_shot_examples.strip())`,
    tags: ['ai', 'prompt-engineering', 'few-shot', 'education']
  }
];

export function VaultPage({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const { profile, loading: authLoading } = useAuth();
  const db = createClient();

  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SnippetFormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  // Expanded snippets
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // AI explain per item
  const [aiExplaining, setAiExplaining] = useState<string | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState<string | null>(null);

  async function handleImport(template: typeof STARTER_TEMPLATES[0]) {
    if (!profile) return;
    setImporting(template.title);
    setError(null);
    try {
      const payload = {
        user_id: profile.id,
        title: template.title,
        language: template.language,
        code: template.code,
        description: template.description,
        tags: template.tags,
      };
      const { error: insertErr } = await db.from('vault_items').insert(payload);
      if (insertErr) throw insertErr;
      await fetchItems();
    } catch (e: any) {
      setError(e.message || 'Failed to import template.');
    } finally {
      setImporting(null);
    }
  }

  useEffect(() => {
    if (!authLoading && profile) fetchItems();
  }, [authLoading, profile]);

  async function fetchItems() {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error: fetchErr } = await db
        .from('vault_items')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;
      setItems(data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setForm(BLANK_FORM);
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(item: VaultItem) {
    setForm({
      title: item.title,
      language: item.language as VaultLanguage,
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
      description: item.description || '',
      code: item.code,
    });
    setEditId(item.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!profile || !form.title.trim() || !form.code.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        user_id: profile.id,
        title: form.title.trim(),
        language: form.language,
        code: form.code,
        description: form.description.trim() || null,
        tags: form.tags
          ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : null,
      };
      if (editId) {
        const { error: updateErr } = await db
          .from('vault_items')
          .update(payload)
          .eq('id', editId);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await db.from('vault_items').insert(payload);
        if (insertErr) throw insertErr;
      }
      setShowForm(false);
      await fetchItems();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save snippet.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this snippet? This cannot be undone.')) return;
    try {
      await db.from('vault_items').delete().eq('id', id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError('Failed to delete snippet.');
    }
  }

  function toggleExpand(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAIExplain(item: VaultItem) {
    setAiExplaining(item.id);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          prompt: `Explain this ${item.language} code in simple terms for a student:\n\n${item.code}\n\nKeep it concise — 3-5 sentences max.`,
        }),
      });
      const data = await res.json();
      if (data?.content) {
        setAiExplanations((prev) => ({ ...prev, [item.id]: data.content }));
        setExpandedExplanations((prev) => new Set([...prev, item.id]));
      }
    } catch {
      setError('AI explain failed.');
    } finally {
      setAiExplaining(null);
    }
  }

  function toggleExplanation(id: string) {
    setExpandedExplanations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredItems = items.filter((item) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.language.toLowerCase().includes(q) ||
      (item.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      (item.description || '').toLowerCase().includes(q)
    );
  });

  const stats = {
    total: items.length,
    languages: [...new Set(items.map((i) => i.language))].length,
    lastSaved: items[0]?.created_at ? formatDate(items[0].created_at) : '—',
  };

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`text-foreground ${isEmbedded ? '' : 'min-h-screen bg-background'}`}>
      <div className={`max-w-4xl mx-auto ${isEmbedded ? 'px-0 py-4' : 'px-4 py-8'}`}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          {!isEmbedded && (
            <>
              <div className="w-10 h-10 bg-primary/10 flex items-center justify-center rounded-xl">
                <ArchiveBoxIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">Vault</h1>
                <p className="text-sm text-muted-foreground">Your personal code library</p>
              </div>
            </>
          )}
          <button
            onClick={openNew}
            className={`${isEmbedded ? '' : 'ml-auto'} flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/95 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-primary/20`}
          >
            <PlusIcon className="w-4 h-4" />
            New Snippet
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total Snippets', value: stats.total, icon: <CodeBracketIcon className="w-4 h-4 text-primary" /> },
            { label: 'Languages', value: stats.languages, icon: <ArchiveBoxIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> },
            { label: 'Last Saved', value: stats.lastSaved, icon: <ClockIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" /> },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border p-4 rounded-xl shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                {stat.icon}
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{stat.label}</span>
              </div>
              <p className="text-xl font-black text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by title, language, or tag..."
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground placeholder:text-muted-foreground transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Modal / Inline form */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-card border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-base font-black text-foreground">
                  {editId ? 'Edit Snippet' : 'New Snippet'}
                </h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Title *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Debounce function"
                    className="w-full px-3 py-2.5 bg-white/5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Language
                    </label>
                    <select
                      className="w-full px-3 py-2.5 bg-white/5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground"
                      value={form.language}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, language: e.target.value as VaultLanguage }))
                      }
                    >
                      {(['javascript', 'python', 'html', 'css', 'typescript', 'sql', 'bash'] as VaultLanguage[]).map(
                        (l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Tags (comma separated)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. utility, async, DOM"
                      className="w-full px-3 py-2.5 bg-white/5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground"
                      value={form.tags}
                      onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of what this snippet does..."
                    className="w-full px-3 py-2.5 bg-white/5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground resize-none"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Code *
                  </label>
                  <CodeEditor
                    value={form.code}
                    onChange={(v) => setForm((f) => ({ ...f, code: v || '' }))}
                    language={RUNNER_LANGUAGES[form.language] || 'javascript'}
                    height={300}
                    title="Code"
                    showHeader={false}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-4 border-t border-border">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-border text-muted-foreground hover:text-foreground text-sm font-bold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.title.trim() || !form.code.trim()}
                  className="ml-auto px-4 py-2 bg-primary hover:bg-primary text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editId ? 'Save Changes' : 'Save Snippet'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Snippet list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="space-y-10 py-10">
            <div className="text-center bg-card border border-border rounded-2xl p-8 max-w-xl mx-auto">
              <ArchiveBoxIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground font-black text-lg mb-1">
                {search ? 'No matching snippets' : 'Your Vault is Empty'}
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {search
                  ? 'Try a different search term.'
                  : 'Your personal code library is ready. Store your custom snippets, APIs, and micro-controllers here.'}
              </p>
            </div>

            {!search && (
              <div className="space-y-6">
                <div className="border-b border-border pb-3">
                  <div className="flex items-center gap-2 text-foreground font-black uppercase tracking-wider text-xs">
                    <SparklesIcon className="w-4 h-4 text-primary animate-pulse" />
                    🚀 Professional Starter Templates
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Click Import to instantly populate your vault with these curated, industry-standard code files.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {STARTER_TEMPLATES.map((tpl, i) => (
                    <div key={i} className="bg-card border border-border hover:border-primary/30 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:shadow-lg transition-all group">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-black text-foreground group-hover:text-primary transition-colors">{tpl.title}</h4>
                          <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary rounded-full">
                            {tpl.language}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{tpl.description}</p>
                        
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {tpl.tags.map((tag, ti) => (
                            <span key={ti} className="text-[8px] font-semibold bg-muted px-2 py-0.5 rounded text-muted-foreground">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => handleImport(tpl)}
                        disabled={importing !== null}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-muted hover:bg-primary hover:text-white border border-border hover:border-primary text-foreground text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                      >
                        {importing === tpl.title ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <PlusIcon className="w-3.5 h-3.5" />
                            Import to Vault
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-card border border-border border-l-4 border-l-brand-red-600 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {/* Card header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-foreground text-sm">{item.title}</h3>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded ${
                            LANGUAGE_COLORS[item.language] || 'bg-muted text-muted-foreground/70'
                          }`}
                        >
                          {item.language}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mb-2">{item.description}</p>
                      )}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-white/5 border border-border text-xs text-muted-foreground"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ClockIcon className="w-3 h-3" />
                        <span>{formatDate(item.created_at || '')}</span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="p-1.5 text-muted-foreground hover:text-primary border border-border hover:border-primary/50 transition-all rounded-lg"
                        title={expandedItems.has(item.id) ? 'Hide code' : 'Show code'}
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAIExplain(item)}
                        disabled={aiExplaining === item.id}
                        className="p-1.5 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 border border-border hover:border-amber-500/50 transition-all disabled:opacity-50 rounded-lg"
                        title="AI Explain"
                      >
                        <SparklesIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 border border-border hover:border-emerald-500/50 transition-all rounded-lg"
                        title="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 border border-border hover:border-rose-500/50 transition-all rounded-lg"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded code */}
                {expandedItems.has(item.id) && (
                  <div className="border-t border-border">
                    <CodeEditor
                      value={item.code}
                      language={RUNNER_LANGUAGES[item.language] || 'javascript'}
                      height={200}
                      readOnly
                      showHeader={false}
                    />
                  </div>
                )}

                {/* AI Explanation */}
                {aiExplanations[item.id] && (
                  <div className="border-t border-border">
                    <button
                      onClick={() => toggleExplanation(item.id)}
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/5 transition-colors"
                    >
                      <SparklesIcon className="w-3.5 h-3.5" />
                      AI Explanation
                      <ChevronRightIcon
                        className={`w-3.5 h-3.5 ml-auto transition-transform ${
                          expandedExplanations.has(item.id) ? 'rotate-90' : ''
                        }`}
                      />
                    </button>
                    {expandedExplanations.has(item.id) && (
                      <div className="px-4 pb-4">
                        <div className="bg-amber-500/5 border border-amber-500/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                          {aiExplaining === item.id ? (
                            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                              <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                              Explaining...
                            </div>
                          ) : (
                            <AIMarkdown content={aiExplanations[item.id] ?? ''} variant="compact" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {aiExplaining === item.id && !aiExplanations[item.id] && (
                  <div className="border-t border-border px-4 py-3">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                      <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      Analyzing code...
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
