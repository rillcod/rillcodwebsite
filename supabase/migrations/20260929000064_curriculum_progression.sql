-- The 12-year progression becomes data, not a string inside a Python script.
--
-- Basic 1 through SS 3 — theme, three terms, capstone and portfolio per year —
-- lived only as inline HTML in scripts/build_proposal_with_cover_and_curriculum.py.
-- It is the single largest content asset in this project and it was in no table,
-- so nothing could show it to a school, quote it, or ever teach from it.
--
-- Versioned as an edition rather than free-standing rows, matching how
-- academic_curriculum_releases already treats curriculum: an edition is drafted,
-- published, and thereafter immutable. That matters twice over here, because the
-- same edition is quoted to a prospect in a proposal and — later — will drive
-- real teaching plans. A proposal that promised one syllabus while the platform
-- taught another is exactly the drift partnership_terms was built to end.
--
-- Grades use the canonical labels from src/lib/classes/naming.ts (SINGLE_GRADES),
-- so a progression level and a class band speak the same vocabulary rather than
-- two spellings of "Basic 1".

create table if not exists public.curriculum_progressions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  subtitle text,
  edition integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'retired')),
  summary text,
  change_summary text,
  source text,
  published_at timestamptz,
  published_by uuid references public.portal_users(id),
  retired_at timestamptz,
  retired_by uuid references public.portal_users(id),
  created_by uuid references public.portal_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_curriculum_progressions_slug_edition
  on public.curriculum_progressions (slug, edition);

-- One published edition per progression. Drafts and retired editions are
-- unlimited, so the next version can be prepared while the current one is live.
create unique index if not exists uq_curriculum_progressions_one_published
  on public.curriculum_progressions (slug)
  where status = 'published';

create table if not exists public.curriculum_progression_levels (
  id uuid primary key default gen_random_uuid(),
  progression_id uuid not null
    references public.curriculum_progressions(id) on delete cascade,

  year_number integer not null check (year_number between 1 and 15),
  grade text not null,
  theme text not null,

  -- [{ "term": 1, "focus": "..." }] — three per year on the school calendar.
  terms jsonb not null,

  capstone text,
  portfolio text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The canonical grade vocabulary. Nursery is included because the ladder may
-- extend downward later; the seeded edition starts at Basic 1, as the proposal does.
alter table public.curriculum_progression_levels
  drop constraint if exists curriculum_progression_levels_grade_canonical;
alter table public.curriculum_progression_levels
  add constraint curriculum_progression_levels_grade_canonical check (
    grade in (
      'Nursery 1','Nursery 2','Nursery 3',
      'Basic 1','Basic 2','Basic 3','Basic 4','Basic 5','Basic 6',
      'JSS 1','JSS 2','JSS 3','SS 1','SS 2','SS 3'
    )
  );

-- A school year has three terms. A level carrying two is a half-written year
-- that would print as a gap in the proposal.
alter table public.curriculum_progression_levels
  drop constraint if exists curriculum_progression_levels_three_terms;
alter table public.curriculum_progression_levels
  add constraint curriculum_progression_levels_three_terms check (
    jsonb_typeof(terms) = 'array' and jsonb_array_length(terms) = 3
  );

create unique index if not exists uq_progression_level_grade
  on public.curriculum_progression_levels (progression_id, grade);
create unique index if not exists uq_progression_level_year
  on public.curriculum_progression_levels (progression_id, year_number);

drop trigger if exists update_curriculum_progressions_updated_at on public.curriculum_progressions;
create trigger update_curriculum_progressions_updated_at
  before update on public.curriculum_progressions
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_curriculum_progression_levels_updated_at on public.curriculum_progression_levels;
create trigger update_curriculum_progression_levels_updated_at
  before update on public.curriculum_progression_levels
  for each row execute function public.update_updated_at_column();

-- A published edition is sealed, levels included. A proposal sent last term
-- quoted this syllabus; editing it in place would rewrite what a school was
-- promised. Retiring stays allowed — that is how an edition is taken out of use.
create or replace function public.guard_published_progression_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_status text;
begin
  if tg_table_name = 'curriculum_progressions' then
    if old.status = 'published' and new.status = 'published' then
      if new.title is distinct from old.title
        or new.subtitle is distinct from old.subtitle
        or new.summary is distinct from old.summary
        or new.edition is distinct from old.edition
        or new.slug is distinct from old.slug then
        raise exception
          'This curriculum edition is published and cannot be edited. Draft the next edition instead.'
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  select status into parent_status
    from public.curriculum_progressions
   where id = coalesce(new.progression_id, old.progression_id);

  if parent_status = 'published' then
    raise exception
      'This curriculum edition is published, so its levels are fixed. Draft the next edition instead.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_curriculum_progression_immutable on public.curriculum_progressions;
create trigger guard_curriculum_progression_immutable
  before update on public.curriculum_progressions
  for each row execute function public.guard_published_progression_immutable();

drop trigger if exists guard_progression_levels_immutable on public.curriculum_progression_levels;
create trigger guard_progression_levels_immutable
  before update or delete on public.curriculum_progression_levels
  for each row execute function public.guard_published_progression_immutable();

comment on table public.curriculum_progressions is
  'A versioned multi-year curriculum ladder. Quoted in partnership proposals and intended to drive teaching plans, so a published edition is immutable — both audiences must be reading the same syllabus.';
comment on table public.curriculum_progression_levels is
  'One school year of a progression: theme, three terms, capstone and portfolio. Grades use the canonical SINGLE_GRADES labels from lib/classes/naming.ts.';


-- RLS. The ladder is a selling document and a syllabus, not a secret: any signed-in
-- user may read a published edition, and staff see drafts too. Writes are
-- service-role only, so an edition cannot be altered from a browser session.
alter table public.curriculum_progressions enable row level security;
alter table public.curriculum_progression_levels enable row level security;

drop policy if exists curriculum_progressions_read_published on public.curriculum_progressions;
create policy curriculum_progressions_read_published
  on public.curriculum_progressions
  for select
  using (status = 'published' or exists (
    select 1 from public.portal_users u
     where u.id = auth.uid()
       and u.role in ('admin', 'teacher')
       and coalesce(u.is_deleted, false) = false
  ));

drop policy if exists curriculum_progression_levels_read_published on public.curriculum_progression_levels;
create policy curriculum_progression_levels_read_published
  on public.curriculum_progression_levels
  for select
  using (exists (
    select 1 from public.curriculum_progressions p
     where p.id = curriculum_progression_levels.progression_id
       and (p.status = 'published' or exists (
         select 1 from public.portal_users u
          where u.id = auth.uid()
            and u.role in ('admin', 'teacher')
            and coalesce(u.is_deleted, false) = false
       ))
  ));


-- Seed edition 1, ported verbatim from the proposal generator. Inserted as a
-- draft and published in the same transaction, so the immutability trigger sees
-- a complete edition rather than blocking its own seed.
insert into public.curriculum_progressions (slug, title, subtitle, edition, status, summary, change_summary, source)
select
  'k12-ai-coding',
  'AI-Integrated Coding & Robotics Progression',
  'Basic 1 to SS 3',
  1,
  'draft',
  'Twelve school years from first Scratch sprite to a shipped mobile AI product. Each year carries a theme, three termly focuses, a capstone build and a portfolio target.',
  'Ported from scripts/build_proposal_with_cover_and_curriculum.py, which held it as inline HTML.',
  'partnership_proposal_generator'
where not exists (
  select 1 from public.curriculum_progressions where slug = 'k12-ai-coding' and edition = 1
);

insert into public.curriculum_progression_levels
  (progression_id, year_number, grade, theme, terms, capstone, portfolio)
select p.id, v.year_number, v.grade, v.theme, v.terms, v.capstone, v.portfolio
from public.curriculum_progressions p
cross join (values
    (1, 'Basic 1', 'Digital Discovery + AI Awareness', '[{"term":1,"focus":"Computer hardware basics, Scratch 3.0 UI & smart concepts."},{"term":2,"focus":"Animations, sprite interaction, AI voice & toy control."},{"term":3,"focus":"Storytelling games, intelligent responses & pattern games."}]'::jsonb, 'Voice-Controlled Storytelling Robot.', '3 Scratch Games + 1 AI Story.'),
    (2, 'Basic 2', 'Creative Programming + Smart Toys', '[{"term":1,"focus":"Advanced Scratch animations, touch sensors & score loops."},{"term":2,"focus":"Educational math games with adaptive difficulty logic."},{"term":3,"focus":"Interactive presentations & smart response systems."}]'::jsonb, 'Smart Classroom Helper Robot.', '3 Math Games + 1 Smart Toy.'),
    (3, 'Basic 3', 'Logical Thinking + Robotics Basics', '[{"term":1,"focus":"Scratch logic with micro:bit LED displays & tilt sensors."},{"term":2,"focus":"Math programming, velocity & robotic wheel control."},{"term":3,"focus":"Arcade games with intelligent NPC decision trees."}]'::jsonb, 'Automated Plant Watering System.', '3 Scratch Apps + 1 Agri System.'),
    (4, 'Basic 4', 'Scratch Expertise + Machine Learning', '[{"term":1,"focus":"Game physics, cloning, custom blocks & ML intro."},{"term":2,"focus":"Teachable Machine chatbot & image recognition."},{"term":3,"focus":"Collaborative team projects using cloud AI vision."}]'::jsonb, 'Classroom Facial Recognition Security System.', '3 Projects + 1 AI Security App.'),
    (5, 'Basic 5', 'Python Programming + AI Fundamentals', '[{"term":1,"focus":"Python Thonny IDE, variables, logic & math libraries."},{"term":2,"focus":"Data collection, lists & basic statistical machine learning."},{"term":3,"focus":"Intelligent programs with pattern decision logic."}]'::jsonb, 'Smart Traffic Light Density Controller.', '3 Python Tools + 1 Traffic App.'),
    (6, 'Basic 6', 'Python + Robotics IoT Integration', '[{"term":1,"focus":"Python functions, modules, file IO & robot motor control."},{"term":2,"focus":"Ultrasonic/IR sensors, automated obstacle navigation."},{"term":3,"focus":"Utility software with AI algorithms & database storage."}]'::jsonb, 'Automated Library RFID Tracking System.', '3 Python Apps + 1 Library System.'),
    (7, 'JSS 1', 'HTML5/CSS3 + Smart Voice Interfaces', '[{"term":1,"focus":"HTML5 structure, CSS styling, layout & AI chatbots."},{"term":2,"focus":"Responsive design, Flexbox & hardware monitoring."},{"term":3,"focus":"Interactive web speech API, voice & gesture controls."}]'::jsonb, 'Smart Home Control Web Dashboard.', '3 Web Sites + 1 Dashboard.'),
    (8, 'JSS 2', 'Advanced Web + Data Visualization', '[{"term":1,"focus":"CSS Grid, Tailwind/Bootstrap & sensor data charts."},{"term":2,"focus":"Mobile-first UI for agricultural sensor feedback."},{"term":3,"focus":"Asynchronous JS data fetching & AI predictions."}]'::jsonb, 'Smart Agriculture Crop Prediction System.', '3 Web Apps + 1 Agri Platform.'),
    (9, 'JSS 3', 'JavaScript ES6+ + Cloud AI APIs', '[{"term":1,"focus":"Core JavaScript ES6+, DOM events & ML5.js Machine Learning."},{"term":2,"focus":"REST API integration with OpenAI & Cloud Vision."},{"term":3,"focus":"Dynamic web state management & predictive analytics."}]'::jsonb, 'AI Academic Performance Predictor System.', '3 JS Apps + 1 AI Analytics System.'),
    (10, 'SS 1', 'UI/UX for AI + Robotics Design', '[{"term":1,"focus":"UI design principles, wireframing, Figma for AI systems."},{"term":2,"focus":"UX research, voice/gesture navigation & testing."},{"term":3,"focus":"Interactive prototyping of full AI web/mobile software."}]'::jsonb, 'Smart City Traffic UI Management System.', '3 Figma Designs + 1 Prototype.'),
    (11, 'SS 2', 'Integrated Full-Stack + IoT', '[{"term":1,"focus":"Full-stack web architecture, Node.js backend & SQL/NoSQL."},{"term":2,"focus":"IoT device programming (ESP32/Raspberry Pi) & MQTT."},{"term":3,"focus":"Dart & Flutter cross-platform mobile development intro."}]'::jsonb, 'Smart School Biometric Management System.', '3 Full-Stack Apps + 1 School System.'),
    (12, 'SS 3', 'Mobile AI + Tech Entrepreneurship', '[{"term":1,"focus":"Flutter mobile apps with TensorFlow Lite ML models."},{"term":2,"focus":"Computer Vision, Natural Language Processing & offline AI."},{"term":3,"focus":"Monetization, App Store publishing & pitch decks."}]'::jsonb, 'Commercial African Impact Startup Mobile App.', '3 Mobile Apps + 1 Commercial Product.')
) as v(year_number, grade, theme, terms, capstone, portfolio)
where p.slug = 'k12-ai-coding' and p.edition = 1
  and not exists (
    select 1 from public.curriculum_progression_levels l
     where l.progression_id = p.id and l.grade = v.grade
  );

update public.curriculum_progressions
   set status = 'published', published_at = now()
 where slug = 'k12-ai-coding' and edition = 1 and status = 'draft';
