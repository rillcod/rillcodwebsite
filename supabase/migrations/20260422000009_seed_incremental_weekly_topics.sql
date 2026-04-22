-- Stage 2h: explicit incremental weekly topics across progression tracks
-- This keeps existing system structure but upgrades project titles/prompts to
-- curriculum-style week-by-week topic progression.
-- Idempotent by project_key.

with target_programs as (
  select p.id
  from public.programs p
  where p.program_scope = 'regular_school'
    and p.school_progression_enabled = true
),
sequence_weeks as (
  select generate_series(1, 120) as seq
),
track_phases as (
  select *
  from (values
    -- Young Innovator (Basic 1-3)
    ('young_innovator'::text, 1, 1, 24, 'Blocks Foundation'::text, array[
      'Getting Started with Blocks','Sequencing Actions','Sprites and Motion','Coordinates Basics',
      'Looks and Costumes','Events and Triggers','Simple Loops','Conditionals Basics',
      'Sound and Voice','Mini Story Build','Interactive Quiz','Debugging Basics'
    ]::text[]),
    ('young_innovator', 2, 25, 48, 'Game Logic Core', array[
      'Score Systems','Timers and Countdown','Collision Detection','Variables in Games',
      'Multi-Level Gameplay','Win/Lose States','Randomness and Chance','Pattern Challenges',
      'Animation Timing','Input Handling','Level Design Basics','Playtesting and Fixing'
    ]::text[]),
    ('young_innovator', 3, 49, 72, 'Creative Computing', array[
      'Digital Storyboarding','Scene Transitions','Character AI Basics','Dialogue Systems',
      'Creative Sound Design','Interactive Art Patterns','Simulation Basics','Project Planning',
      'User Feedback Loops','Accessibility Basics','Peer Review Cycle','Portfolio Capture'
    ]::text[]),
    ('young_innovator', 4, 73, 96, 'Advanced Problem Solving', array[
      'Nested Logic','State Machines Intro','Reusable Blocks','Optimization Basics',
      'Data Tracking','Challenge Mode Design','Adaptive Difficulty','Bug Triage Workflow',
      'Refactoring Blocks','Testing Checklists','Sprint Showcase Prep','Demo Storytelling'
    ]::text[]),
    ('young_innovator', 5, 97, 120, 'Capstone Studio', array[
      'Capstone Ideation','Scope Definition','Prototype Sprint','Feature Iteration',
      'Visual Polish','Audio Polish','User Test Round 1','User Test Round 2',
      'Final Debug Sprint','Presentation Design','Capstone Demo','Reflection and Next Steps'
    ]::text[]),

    -- Python Core (Basic 4-6 / optional)
    ('python', 1, 1, 24, 'Python Fundamentals', array[
      'Python Setup and Syntax','Variables and Types','Input and Output','Conditionals',
      'Loops with for','Loops with while','Functions Basics','Function Parameters',
      'Lists and Tuples','Dictionaries','Error Handling Basics','Mini Console App'
    ]::text[]),
    ('python', 2, 25, 48, 'Problem Solving', array[
      'String Manipulation','List Comprehensions','Nested Data','Algorithm Thinking',
      'Search Basics','Sort Basics','Recursion Intro','Modular Code',
      'File Handling','JSON Data Basics','CLI Utilities','Debugging Techniques'
    ]::text[]),
    ('python', 3, 49, 72, 'Automation and Data', array[
      'Automation Scripts','Batch Processing','CSV Handling','Data Cleaning',
      'API Requests Intro','Response Parsing','Scheduling Tasks','Logging',
      'Validation Rules','Refactor for Reuse','Performance Basics','Automation Mini Project'
    ]::text[]),
    ('python', 4, 73, 96, 'Application Design', array[
      'OOP Basics','Classes and Objects','Inheritance Intro','Project Structure',
      'Testing with pytest','Mocking Basics','Packaging Scripts','Environment Config',
      'Security Basics','Error Strategy','Code Review Practice','Release Checklist'
    ]::text[]),
    ('python', 5, 97, 120, 'Capstone Python', array[
      'Capstone Planning','Architecture Draft','Milestone Build 1','Milestone Build 2',
      'Integration and Validation','UX for CLI/Tools','Data Persistence','Feature Freeze',
      'Final Testing','Demo Prep','Capstone Demo','Retrospective'
    ]::text[]),

    -- HTML + CSS
    ('html_css', 1, 1, 24, 'Web Foundations', array[
      'HTML Document Structure','Semantic Elements','Text and Media','Links and Navigation',
      'Forms Basics','Tables and Layout','CSS Selectors','Box Model',
      'Typography','Colors and Themes','Spacing Systems','Mini Landing Page'
    ]::text[]),
    ('html_css', 2, 25, 48, 'Responsive Design', array[
      'Flexbox Fundamentals','Grid Fundamentals','Breakpoints','Responsive Images',
      'Mobile First Workflow','Component Styling','Utility Patterns','Design Tokens',
      'Accessibility Basics','Transitions and Hover','Form UX','Responsive Project Sprint'
    ]::text[]),
    ('html_css', 3, 49, 72, 'Design Systems', array[
      'Component Libraries','Navigation Patterns','Cards and Lists','Dashboard Layouts',
      'Theme Variants','Dark Mode Basics','Iconography','UI Consistency',
      'Micro-Interactions','Design QA','Refactoring CSS','System Demo'
    ]::text[]),
    ('html_css', 4, 73, 96, 'Production Frontend', array[
      'Performance Basics','Asset Optimization','SEO Essentials','Accessibility Audit',
      'Cross-Browser Checks','Form Validation UX','Reusable Sections','Content Strategy',
      'Testing UI States','Deployment Basics','Iteration Cycle','Stakeholder Feedback'
    ]::text[]),
    ('html_css', 5, 97, 120, 'Capstone Web UI', array[
      'Capstone Briefing','Wireframe to Code','Build Sprint 1','Build Sprint 2',
      'Visual Polish','Accessibility Polish','Performance Polish','User Testing',
      'Final Debugging','Showcase Deck','Capstone Demo','Reflection'
    ]::text[]),

    -- JSS Web App (Teen Developers)
    ('jss_web_app', 1, 1, 24, 'JavaScript Foundation', array[
      'JS Syntax and Variables','Operators and Expressions','Conditionals and Branching','Loops and Iteration',
      'Functions and Scope','Arrays and Methods','Objects and Properties','DOM Basics',
      'DOM Events','Fetch API Intro','Async and Await','JS Mini App'
    ]::text[]),
    ('jss_web_app', 2, 25, 48, 'React Development', array[
      'React Setup','JSX and Components','Props and Composition','State with useState',
      'Effects with useEffect','Forms in React','Conditional Rendering','Lists and Keys',
      'Routing Basics','Reusable UI Components','Error Boundaries Intro','React Project Sprint'
    ]::text[]),
    ('jss_web_app', 3, 49, 72, 'AI and Automation', array[
      'AI Tooling Basics','Prompt Engineering','Workflow Automation','API Integrations',
      'Data Transform Scripts','Task Pipelines','Bot Interaction Design','Safety and Guardrails',
      'Automation QA','Cost and Usage Awareness','AI Assisted Debugging','AI Mini Product'
    ]::text[]),
    ('jss_web_app', 4, 73, 96, 'UI UX for Apps', array[
      'UX Research Basics','Personas and Flows','Wireframing','Design Systems Intro',
      'Tailwind Patterns','Accessibility in UX','Usability Testing','Iteration Workflow',
      'Visual Hierarchy','Design Critique','Prototype to Build','UX Validation Sprint'
    ]::text[]),
    ('jss_web_app', 5, 97, 120, 'Mobile with Capacitor', array[
      'Capacitor Setup','Native Plugins Basics','Navigation for Mobile','Device Storage',
      'Push and Notifications','Camera and Media','Offline Considerations','Performance Tuning',
      'Mobile QA','Release Build Prep','App Demo Day','Post Launch Review'
    ]::text[]),

    -- JSS Python path (Teen Developers alternative)
    ('jss_python', 1, 1, 24, 'Python Foundation', array[
      'Python Syntax and Variables','Branching Logic','Iteration Patterns','Functions and Reuse',
      'Lists and Dictionaries','String Processing','Error Handling','File IO Basics',
      'Modules and Imports','Testing Basics','CLI Utilities','Python Mini App'
    ]::text[]),
    ('jss_python', 2, 25, 48, 'Python Application Build', array[
      'Project Structure','Data Validation','Algorithm Practice','Refactoring',
      'Object Oriented Basics','Packages and Envs','Config Management','Logging',
      'Async Concepts','Simple APIs','Code Review Cycle','Python Project Sprint'
    ]::text[]),
    ('jss_python', 3, 49, 72, 'AI and Automation', array[
      'Automation Scripting','Web Requests','Data Parsing','Prompt to Pipeline',
      'Task Automation','Bot Workflows','Data Cleanup Automation','Report Generation',
      'Safety and Reliability','Monitoring Scripts','Optimization Pass','Automation Product'
    ]::text[]),
    ('jss_python', 4, 73, 96, 'UI UX Collaboration', array[
      'UX for Developers','Flow Mapping','Prototype Feedback','Design to Logic',
      'Accessibility Essentials','Interaction Patterns','User Testing','Iteration Planning',
      'Communication in Teams','Documentation','Handoff Readiness','Collab Sprint'
    ]::text[]),
    ('jss_python', 5, 97, 120, 'Mobile with Capacitor', array[
      'Capacitor Concepts','Mobile Architecture','API Connectivity','Authentication Flow',
      'State on Mobile','Native Capabilities','Offline Handling','QA Matrix',
      'Release Workflow','Store Readiness','Demo and Pitch','Retrospective'
    ]::text[]),

    -- SS UI/UX + Mobile
    ('ss_uiux_mobile', 1, 1, 24, 'Product and UX Strategy', array[
      'Problem Discovery','Market and User Research','Persona Definition','Journey Mapping',
      'Information Architecture','Low Fidelity Wireframes','Interaction Models','Design Critique',
      'Rapid Prototyping','Usability Tests','Iteration Planning','UX Strategy Review'
    ]::text[]),
    ('ss_uiux_mobile', 2, 25, 48, 'Design Systems and UI', array[
      'Design Tokens','Component Standards','Visual Hierarchy','Typography Systems',
      'Color Systems','Accessibility Compliance','Responsive Patterns','Micro Interactions',
      'Prototype Fidelity','Design QA','Handoff Specs','UI System Sprint'
    ]::text[]),
    ('ss_uiux_mobile', 3, 49, 72, 'AI and Automation in Product', array[
      'AI Feature Ideation','Prompt Workflow Design','Automation Journeys','AI Risk Controls',
      'Data and Feedback Loops','AI UX Patterns','Experiment Frameworks','Measurement Plans',
      'Ethical Considerations','AI QA and Testing','Optimization Experiments','AI Feature Demo'
    ]::text[]),
    ('ss_uiux_mobile', 4, 73, 96, 'Mobile Engineering with Capacitor', array[
      'Capacitor Architecture','Native Plugin Patterns','Navigation and State','Offline First Design',
      'Security and Auth','Performance and Battery','Push and Background Tasks','Analytics Events',
      'Testing on Devices','Build Pipelines','Release Candidates','Beta Feedback Loop'
    ]::text[]),
    ('ss_uiux_mobile', 5, 97, 120, 'Capstone Product Studio', array[
      'Capstone Scope','Roadmap and Milestones','MVP Build Sprint','UX Validation Sprint',
      'Feature Hardening','Quality and Stability','Growth Metrics Setup','Launch Simulation',
      'Final QA Cycle','Pitch and Storyline','Capstone Launch Demo','Program Reflection'
    ]::text[])
  ) as t(track, phase_order, start_week, end_week, phase_name, topics)
),
rows_to_seed as (
  select
    p.id as program_id,
    tp.track,
    sw.seq as week_number,
    tp.phase_name,
    tp.topics[
      ((sw.seq - tp.start_week) % cardinality(tp.topics)) + 1
    ] as topic_name,
    least(10, 1 + ((sw.seq - 1) / 12))::int as difficulty_level
  from target_programs p
  cross join sequence_weeks sw
  join track_phases tp
    on sw.seq between tp.start_week and tp.end_week
)
insert into public.curriculum_project_registry (
  school_id,
  program_id,
  course_id,
  project_key,
  title,
  track,
  concept_tags,
  difficulty_level,
  classwork_prompt,
  estimated_minutes,
  metadata,
  is_active
)
select
  null as school_id,
  r.program_id,
  null as course_id,
  concat(
    'platform-',
    substr(r.program_id::text, 1, 8),
    '-',
    r.track,
    '-w',
    lpad(r.week_number::text, 3, '0')
  ) as project_key,
  concat(
    initcap(replace(r.track, '_', ' ')),
    ' - ',
    r.phase_name,
    ' - ',
    r.topic_name,
    ' (Week ',
    r.week_number,
    ')'
  ) as title,
  r.track,
  array[
    r.track,
    lower(replace(r.phase_name, ' ', '_')),
    lower(replace(r.topic_name, ' ', '_'))
  ]::text[] as concept_tags,
  r.difficulty_level,
  concat(
    'Week ',
    r.week_number,
    ': Practical studio on ',
    r.topic_name,
    ' under ',
    r.phase_name,
    '. Build, test, and present a working artifact.'
  ) as classwork_prompt,
  (40 + ((r.week_number - 1) % 6) * 5)::int as estimated_minutes,
  jsonb_build_object(
    'seed_source', 'incremental_topic_map',
    'scope', 'school_progression',
    'week_number', r.week_number,
    'phase_name', r.phase_name,
    'topic_name', r.topic_name,
    'session_hint', ((r.week_number - 1) / 36) + 1,
    'term_hint', (((r.week_number - 1) % 36) / 12) + 1
  ) as metadata,
  true as is_active
from rows_to_seed r
on conflict (project_key) do update
set
  title = excluded.title,
  concept_tags = excluded.concept_tags,
  difficulty_level = excluded.difficulty_level,
  classwork_prompt = excluded.classwork_prompt,
  estimated_minutes = excluded.estimated_minutes,
  metadata = excluded.metadata,
  is_active = excluded.is_active,
  updated_at = now();
