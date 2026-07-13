-- Special program marketing/registration pages (e.g. AI Summer School).
-- Many can be published; at most one is featured for the homepage CTA.

create table if not exists public.special_program_pages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid null references public.programs (id) on delete set null,
  slug text not null,
  title text not null,
  button_label text not null default 'Special Program',
  is_published boolean not null default false,
  is_featured boolean not null default false,
  starts_on date null,
  ends_on date null,
  registration_deadline date null,
  online_fee numeric(12, 2) not null default 50000,
  onsite_fee numeric(12, 2) not null default 100000,
  deposit_percent numeric(5, 2) not null default 50,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint special_program_pages_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint special_program_pages_deposit_pct check (deposit_percent > 0 and deposit_percent <= 100)
);

create unique index if not exists special_program_pages_slug_uidx
  on public.special_program_pages (slug);

-- At most one featured page
create unique index if not exists special_program_pages_one_featured_uidx
  on public.special_program_pages (is_featured)
  where is_featured = true;

create index if not exists special_program_pages_published_idx
  on public.special_program_pages (is_published, is_featured);

alter table public.special_program_pages enable row level security;

-- Public read of published pages (anon + authenticated)
drop policy if exists special_program_pages_public_read on public.special_program_pages;
create policy special_program_pages_public_read
  on public.special_program_pages
  for select
  to anon, authenticated
  using (is_published = true);

-- Service role / admin writes go through service role (bypass RLS)

comment on table public.special_program_pages is
  'Public marketing + registration landings for special cohorts (summer school, bootcamps).';

-- Seed current AI Summer School 2026 as featured
insert into public.special_program_pages (
  slug,
  title,
  button_label,
  is_published,
  is_featured,
  starts_on,
  ends_on,
  registration_deadline,
  online_fee,
  onsite_fee,
  deposit_percent,
  content
)
values (
  'ai-summer-school-2026',
  'AI Summer School 2026',
  '☀️ AI Summer School',
  true,
  true,
  '2026-06-28',
  '2026-09-07',
  '2026-07-01',
  50000,
  100000,
  50,
  '{
    "hero_blurb": "An intensive hands-on programme teaching kids and teens (ages 8-18) to create, code, and innovate using modern Artificial Intelligence tools.",
    "season_badge": "Active Season: Summer 2026",
    "title_line1": "Rillcod AI",
    "title_line2": "Summer School",
    "ages_label": "Ages 8 – 18",
    "age_min": 8,
    "age_max": 18,
    "duration_label": "7 Weeks Cohort",
    "curriculum_heading": "Unified All-In-One Curriculum",
    "curriculum_intro": "Our 7-week cohort is fully integrated. Students do not choose a single track — they go through all 4 modules sequentially to build complete AI engineering proficiency.",
    "tracks": [
      {
        "id": "generative_art",
        "icon": "🎨",
        "week": "Module 1 · Weeks 1–2",
        "title": "Generative Art & Visual Storytelling",
        "desc": "Create stunning visuals, digital art, and narrative storyboards using advanced text-to-image AI tools.",
        "topics": [
          "Introduction to generative AI & prompting",
          "Prompt engineering for art & illustration",
          "Style consistency and creative direction",
          "AI-assisted graphic design & branding",
          "Project: Personal AI Art Portfolio"
        ]
      },
      {
        "id": "ai_foundations",
        "icon": "🧠",
        "week": "Module 2 · Weeks 1–3",
        "title": "AI Foundations",
        "desc": "Understand what Artificial Intelligence is, how machine learning models learn, and the ethics of AI.",
        "topics": [
          "AI vs. Machine Learning basics",
          "How neural networks train on data",
          "Ethics: bias, fairness, and safety in AI",
          "Python programming fundamentals",
          "Project: Interactive AI-powered script"
        ]
      },
      {
        "id": "web_app",
        "icon": "🌐",
        "week": "Module 3 · Weeks 4–5",
        "title": "Web & App Creation with AI",
        "desc": "Code and deploy real web applications integrated with live AI intelligence APIs like Gemini.",
        "topics": [
          "HTML, CSS, and JavaScript basics",
          "Connecting web frontends to AI APIs",
          "Flask backend framework in Python",
          "Building a custom AI chatbot helper",
          "Project: Launch your own AI web tool"
        ]
      },
      {
        "id": "game_design",
        "icon": "🎮",
        "week": "Module 4 · Weeks 5–6",
        "title": "AI Game Design",
        "desc": "Design and program video games containing intelligent AI opponents and procedural levels.",
        "topics": [
          "Core game design & mechanics",
          "Procedural world generation",
          "Decision trees and basic game pathfinding",
          "Coding games using Python & Pygame",
          "Project: Build and publish an AI game"
        ]
      }
    ],
    "weeks": [
      { "num": "Week 1", "tag": "Foundations", "title": "AI Basics & Prompts Kickoff", "desc": "Understanding how models think, prompt mechanics, and starting image generation." },
      { "num": "Week 2", "tag": "Creative AI", "title": "Storytelling & Digital Art", "desc": "Creating consistent characters, layout planning, and assembling the art portfolio." },
      { "num": "Week 3", "tag": "Python Basics", "title": "Python Programming Fundamentals", "desc": "Variables, conditions, and loops. Setting up Python coding environments." },
      { "num": "Week 4", "tag": "AI Coding", "title": "Gemini AI Integrations", "desc": "Learning to write Python scripts that connect to Google Gemini APIs." },
      { "num": "Week 5", "tag": "Build Apps", "title": "AI Web Apps & Game Logic", "desc": "Setting up web servers and designing Pygame environments with pathfinding." },
      { "num": "Week 6", "tag": "Media Module", "title": "Bonus Module: Video Ads & Marketing", "desc": "Scriptwriting, generating AI voiceovers, producing video ads, and packaging products." },
      { "num": "Week 7", "tag": "Graduation", "title": "Final Projects & Graduation", "desc": "Polishing code, presenting products, game showcases, and receiving Rillcod certificates." }
    ]
  }'::jsonb
)
on conflict (slug) do update set
  title = excluded.title,
  button_label = excluded.button_label,
  is_published = excluded.is_published,
  is_featured = excluded.is_featured,
  starts_on = excluded.starts_on,
  ends_on = excluded.ends_on,
  registration_deadline = excluded.registration_deadline,
  online_fee = excluded.online_fee,
  onsite_fee = excluded.onsite_fee,
  deposit_percent = excluded.deposit_percent,
  content = excluded.content,
  updated_at = now();
