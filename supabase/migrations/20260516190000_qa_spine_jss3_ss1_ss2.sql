-- ============================================================================
-- Extend QA Spine: Add JSS 3, SS1, SS2 lanes (12–14)
-- Lane 12: JSS 3 · Web App (full-stack continuation)
-- Lane 13: SS 1 · UI/UX Design (Figma, Adobe XD, prototyping, design systems)
-- Lane 14: SS 2 · Mobile Development (Capacitor, Dart, Flutter, cross-platform)
-- ============================================================================

-- 1. Widen the lane_index constraint from 11 → 14
ALTER TABLE public.platform_syllabus_week_template
  DROP CONSTRAINT IF EXISTS platform_syllabus_week_template_lane_index_check;
ALTER TABLE public.platform_syllabus_week_template
  ADD CONSTRAINT platform_syllabus_week_template_lane_index_check
  CHECK (lane_index >= 1 AND lane_index <= 14);

-- 2. INSERT skeleton rows for lanes 12-14 (108 weeks each)
INSERT INTO public.platform_syllabus_week_template (
  catalog_version, program_id, lane_index, track, grade_key, grade_label,
  syllabus_phase, year_number, term_number, week_number, week_index, topic, subtopics, metadata
)
WITH
rp AS (
  SELECT p.id AS program_id
  FROM public.programs p
  WHERE coalesce(p.program_scope, 'regular_school') = 'regular_school'
  ORDER BY p.created_at ASC NULLS LAST
  LIMIT 1
),
new_lanes AS (
  SELECT * FROM (VALUES
    (12, 'jss_3',  'JSS 3',  'jss_1_3',   'jss_web_app'),
    (13, 'ss_1',   'SS 1',   'ss_1_3',    'ui_ux_design'),
    (14, 'ss_2',   'SS 2',   'ss_1_3',    'mobile_development')
  ) AS t(lane_index, grade_key, grade_label, syllabus_phase, track)
),
weeks AS (
  SELECT
    l.lane_index, l.grade_key, l.grade_label, l.syllabus_phase, l.track,
    w AS week_index,
    ((w - 1) / 36) + 1 AS year_number,
    (((w - 1) % 36) / 12) + 1 AS term_number,
    (((w - 1) % 12) + 1) AS week_number
  FROM new_lanes l
  CROSS JOIN generate_series(1, 108) AS w
)
SELECT
  'qa_spine_v1', rp.program_id,
  u.lane_index, u.track, u.grade_key, u.grade_label, u.syllabus_phase,
  u.year_number, u.term_number, u.week_number, u.week_index,
  'Placeholder' AS topic,
  '[]'::jsonb AS subtopics,
  jsonb_build_object('catalog_role','qa_spine','lane_index',u.lane_index,'stack_track',u.track) AS metadata
FROM rp CROSS JOIN weeks u
ON CONFLICT (catalog_version, program_id, lane_index, week_index) DO NOTHING;

-- 3. UPDATE all new lanes with real curriculum-aligned topics
WITH real_topics(lane, yr, tm, topics, subs) AS (
  VALUES

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 12 — JSS 3 · Web App  (Ages 14-15, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 T1: Advanced Full-Stack Architecture
  (12, 1, 1, ARRAY[
    'Full-Stack Review: Frontend + Backend Architecture',
    'TypeScript Deep Dive: Interfaces and Type Guards',
    'Advanced React: Compound Components',
    'Advanced React: Render Props and HOCs',
    'State Machines: Modelling Complex UI State',
    'React Query: Server State Management',
    'Next.js App Router: Layouts and Loading UI',
    'Next.js Server Components vs Client Components',
    'Next.js API Routes: Edge and Serverless Functions',
    'Authentication: OAuth2 and Social Login Flows',
    'Project: SaaS Dashboard Starter',
    'Advanced Frontend Assessment'
  ], ARRAY['Build compound React components','Use Next.js App Router patterns','Implement OAuth2 authentication']),

  -- Y1 T2: Backend Architecture
  (12, 1, 2, ARRAY[
    'Database Design: Advanced Normalisation (3NF, BCNF)',
    'PostgreSQL: Indexes, Views, and CTEs',
    'PostgreSQL: Stored Procedures and Triggers',
    'Prisma Advanced: Relations, Middleware, Transactions',
    'GraphQL Introduction: Schema and Queries',
    'GraphQL: Mutations and Subscriptions',
    'Apollo Server: Building a GraphQL API',
    'Real-Time: WebSocket Implementation with Socket.io',
    'Message Queues: Pub/Sub Concepts',
    'Caching Strategies: Redis Concepts',
    'Project: Real-Time Collaborative Board',
    'Backend Architecture Assessment'
  ], ARRAY['Design normalised database schemas','Build GraphQL APIs','Implement real-time features with WebSockets']),

  -- Y1 T3: Testing and DevOps
  (12, 1, 3, ARRAY[
    'Testing Pyramid: Unit, Integration, E2E',
    'Jest: Mocking, Spies, and Snapshot Testing',
    'React Testing Library: Component Testing',
    'Playwright: End-to-End Browser Testing',
    'API Testing: Supertest with Express',
    'CI/CD: GitHub Actions Workflow Design',
    'Docker: Multi-Stage Builds for Node.js',
    'Docker Compose: Multi-Container Applications',
    'Infrastructure as Code Concepts',
    'Monitoring: Application Performance Monitoring',
    'Project: Fully Tested and Deployed App',
    'Testing and DevOps Assessment'
  ], ARRAY['Write unit, integration, and E2E tests','Build Docker multi-container apps','Design CI/CD deployment pipelines']),

  -- Y2 T1: System Design
  (12, 2, 1, ARRAY[
    'System Design Fundamentals: Scalability',
    'Microservices vs Monolith Architecture',
    'API Gateway Patterns',
    'Load Balancing and Horizontal Scaling',
    'Database Replication and Sharding Concepts',
    'Event-Driven Architecture',
    'Serverless Computing: Cloud Functions',
    'Edge Computing and CDN Strategies',
    'Security: Input Validation and Sanitisation',
    'Security: CSRF, XSS, and SQL Injection Prevention',
    'Project: Scalable API with Rate Limiting',
    'System Design Assessment'
  ], ARRAY['Evaluate microservices vs monolith tradeoffs','Design scalable system architectures','Implement security best practices']),

  -- Y2 T2: PWAs and AI-Assisted Development
  (12, 2, 2, ARRAY[
    'Mobile-First Progressive Web Apps (PWA)',
    'Service Workers: Offline Functionality',
    'Web Push Notifications and App Manifest',
    'Cache Strategies: Cache-First, Network-First',
    'IndexedDB: Client-Side Database',
    'AI-Assisted Coding: GitHub Copilot Setup',
    'Prompt Engineering for Code Generation',
    'Using ChatGPT to Debug and Refactor Code',
    'AI-Generated Documentation and READMEs',
    'Building a Portfolio: Showcasing Real Projects',
    'Project: PWA with Offline Support (AI-Assisted)',
    'PWA and AI Tools Assessment'
  ], ARRAY['Build PWAs with offline support','Use AI tools (Copilot, ChatGPT) for development','Build a marketable developer portfolio']),

  -- Y2 T3: E-Commerce and Payment Systems
  (12, 2, 3, ARRAY[
    'Open-Source: Contributing to Projects',
    'Technical Writing: Documentation Standards',
    'Clean Code Principles and Code Architecture',
    'Design Patterns: Repository, Strategy, Adapter',
    'Performance Profiling: Chrome DevTools',
    'Accessibility Audit: WCAG 2.1 Compliance',
    'Internationalisation (i18n) and Localisation',
    'Payment Integration: Paystack API',
    'Payment Integration: Flutterwave API',
    'Shopping Cart and Checkout Flow Design',
    'Project: Nigerian E-Commerce Storefront',
    'E-Commerce and Payments Assessment'
  ], ARRAY['Integrate Paystack and Flutterwave payment APIs','Build production e-commerce flows','Apply clean code and design patterns']),

  -- Y3 T1: AI, Prompt Engineering, and Portfolio
  (12, 3, 1, ARRAY[
    'AI in Web Apps: Integrating OpenAI and Gemini APIs',
    'Prompt Engineering: Crafting Effective AI Prompts',
    'Building a Conversational Chatbot Interface',
    'AI Image Generation: DALL-E and Stable Diffusion APIs',
    'AI Code Review: Automated Quality Checks',
    'Building AI-Powered Features for Real Users',
    'Portfolio Strategy: Choosing Marketable Projects',
    'Portfolio: Writing Case Studies That Get Hired',
    'Portfolio Website: Building Your Personal Brand',
    'GitHub Profile: Starring Repos and Contribution Graph',
    'Project: AI-Powered Study Assistant (Portfolio Piece)',
    'AI and Portfolio Assessment'
  ], ARRAY['Integrate AI APIs (OpenAI, Gemini) into web apps','Master prompt engineering for development','Build a marketable portfolio with real case studies']),

  -- Y3 T2: Career Readiness
  (12, 3, 2, ARRAY[
    'Freelancing: Building a Client Portfolio',
    'Project Estimation: Scoping and Pricing',
    'Client Communication: Requirements Gathering',
    'Agile for Small Teams: Sprints and Standups',
    'Legal Basics: Contracts and Intellectual Property',
    'Building Your Personal Brand Online',
    'Technical Interview Preparation',
    'Coding Challenges: Data Structures Practice',
    'System Design Interview Preparation',
    'Open-Source Portfolio: Showcasing Your Work',
    'Mock Interview Practice Sessions',
    'Career Readiness Assessment'
  ], ARRAY['Scope and price client projects','Prepare for technical interviews','Build a professional online presence']),

  -- Y3 T3: Capstone
  (12, 3, 3, ARRAY[
    'Capstone: Problem Research and Validation',
    'Capstone: Technical Specification Document',
    'Capstone: Architecture and Database Design',
    'Capstone: Sprint 1 — Core API and Auth',
    'Capstone: Sprint 2 — Frontend and UX',
    'Capstone: Sprint 3 — Advanced Features',
    'Capstone: Sprint 4 — Testing Suite',
    'Capstone: Sprint 5 — Performance and Security',
    'Capstone: Deployment to Production Cloud',
    'Capstone: Video Demo and Documentation',
    'Capstone: Final Presentation to Panel',
    'JSS 3 Web App Track Graduation'
  ], ARRAY['Execute a professional-grade capstone','Deploy production apps to cloud','Present to a review panel']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 13 — SS 1 · UI/UX Design  (Ages 15-16, 108 weeks)
  -- Figma, Adobe XD, Prototyping, Design Systems, User Research
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 T1: Design Foundations
  (13, 1, 1, ARRAY[
    'What Is UI/UX Design? Roles and Careers',
    'Design Thinking: Empathise, Define, Ideate, Prototype, Test',
    'Principles of Visual Design: Balance, Contrast, Hierarchy',
    'Colour Theory: Psychology, Palettes, and Harmony',
    'Typography Fundamentals: Choosing and Pairing Fonts',
    'Layout and Composition: Grid Systems',
    'Gestalt Principles in Interface Design',
    'Introduction to Figma: Interface and Tools',
    'Figma: Frames, Layers, and Artboards',
    'Figma: Shapes, Text, and Colour Styles',
    'Project: Redesign a Mobile App Screen in Figma',
    'Design Foundations Assessment'
  ], ARRAY['Apply visual design principles','Navigate and create in Figma','Use colour theory and typography effectively']),

  -- Y1 T2: UI Design in Figma
  (13, 1, 2, ARRAY[
    'Figma Components: Creating Reusable Elements',
    'Figma Auto Layout: Responsive Components',
    'Figma Variants: States and Configurations',
    'Figma Styles: Colours, Text, and Effects',
    'Icon Design: Principles and Creation',
    'Designing Buttons, Inputs, and Form Elements',
    'Designing Cards, Modals, and Navigation Bars',
    'Dark Mode Design: Colour Adaptation',
    'Design Tokens: Bridging Design and Development',
    'Mobile UI Design: iOS vs Android Patterns',
    'Project: Complete Mobile App UI Kit in Figma',
    'UI Design in Figma Assessment'
  ], ARRAY['Build reusable Figma components with variants','Design responsive layouts with Auto Layout','Create mobile UI kits for iOS and Android']),

  -- Y1 T3: Adobe XD and Prototyping
  (13, 1, 3, ARRAY[
    'Introduction to Adobe XD: Interface Tour',
    'Adobe XD: Artboards, Repeat Grid, and Assets',
    'Adobe XD: Components and States',
    'Adobe XD: Responsive Resize',
    'Prototyping in Adobe XD: Interactions and Transitions',
    'Prototyping in Figma: Smart Animate',
    'Micro-Interactions: Feedback and Delight',
    'Prototyping: Drag, Scroll, and Hover Interactions',
    'Prototyping: Multi-Screen User Flows',
    'Comparing Figma vs Adobe XD: Strengths and Workflows',
    'Project: Interactive Prototype for a Food Delivery App',
    'Prototyping Assessment'
  ], ARRAY['Design and prototype in Adobe XD','Create micro-interactions and transitions','Build multi-screen interactive prototypes']),

  -- Y2 T1: User Research and UX Strategy
  (13, 2, 1, ARRAY[
    'What Is UX Research? Methods Overview',
    'User Interviews: Planning and Conducting',
    'Surveys and Questionnaires: Design and Analysis',
    'User Personas: Creating Data-Driven Profiles',
    'Empathy Maps: Understanding User Emotions',
    'Customer Journey Mapping',
    'Competitive Analysis: Benchmarking Designs',
    'Card Sorting: Information Architecture',
    'Site Maps and User Flow Diagrams',
    'Jobs-to-Be-Done Framework',
    'Project: UX Research Report for a Nigerian Fintech App',
    'UX Research Assessment'
  ], ARRAY['Conduct user interviews and surveys','Create personas and journey maps','Apply Jobs-to-Be-Done framework']),

  -- Y2 T2: Wireframing and Information Architecture
  (13, 2, 2, ARRAY[
    'Wireframing Principles: Low-Fidelity Sketching',
    'Digital Wireframes in Figma: Grey-Box Layouts',
    'Wireframing Mobile vs Desktop Experiences',
    'Information Architecture: Organising Content',
    'Navigation Patterns: Tabs, Drawers, Breadcrumbs',
    'Content Strategy: Writing for Interfaces (UX Writing)',
    'Microcopy: Button Labels, Error Messages, Empty States',
    'Wireframe to High-Fidelity: The Design Handoff Pipeline',
    'Collaborative Design: Figma Teams and Branching',
    'Design Critiques: Giving and Receiving Feedback',
    'Project: Wireframe-to-Hi-Fi Flow for an EdTech Platform',
    'Wireframing and IA Assessment'
  ], ARRAY['Create low and high-fidelity wireframes','Design navigation and information architecture','Write effective UX microcopy']),

  -- Y2 T3: Design Systems
  (13, 2, 3, ARRAY[
    'What Is a Design System? Principles and Benefits',
    'Atomic Design: Atoms, Molecules, Organisms, Templates',
    'Building a Colour System: Semantic Tokens',
    'Building a Typography Scale',
    'Building a Spacing and Grid System',
    'Component Library: Buttons, Inputs, Badges',
    'Component Library: Cards, Alerts, Modals, Tooltips',
    'Component Documentation: Usage Guidelines',
    'Design System Governance: Versioning and Updates',
    'Real-World Systems: Material Design and Apple HIG Study',
    'Project: Complete Design System for a School Platform',
    'Design Systems Assessment'
  ], ARRAY['Build atomic design systems','Create documented component libraries','Apply Material Design and Apple HIG principles']),

  -- Y3 T1: AI-Powered Design and Prompt Engineering
  (13, 3, 1, ARRAY[
    'AI in Design: How AI Is Transforming UI/UX',
    'Adobe Firefly: AI Image Generation for Design',
    'Midjourney: Prompt Engineering for Visual Concepts',
    'Figma AI: Generating Layouts and Components',
    'ChatGPT for UX: Research Synthesis and Copy Writing',
    'Prompt Engineering: Writing Effective Design Prompts',
    'AI for Accessibility: Automated Audits and Suggestions',
    'Usability Testing with AI Analytics',
    'Ethics of AI in Design: Bias and Responsibility',
    'Building AI-Enhanced Design Workflows',
    'Project: AI-Assisted Redesign of a Nigerian Service App',
    'AI-Powered Design Assessment'
  ], ARRAY['Use Midjourney and Adobe Firefly for design','Master prompt engineering for design tools','Build AI-enhanced design workflows']),

  -- Y3 T2: Portfolio Building and Professional Practice
  (13, 3, 2, ARRAY[
    'Design Portfolio Strategy: What Employers Look For',
    'Case Study Structure: Problem → Research → Design → Results',
    'Portfolio Piece 1: Mobile App Redesign (Full Case Study)',
    'Portfolio Piece 2: Dashboard or Data Viz Project',
    'Portfolio Piece 3: Design System Documentation',
    'Motion Design: Lottie Animations for Portfolio',
    'Figma: Advanced Prototyping with Variables',
    'Design Handoff: Specs, Assets, Dev Collaboration',
    'Freelancing: Pricing Design Work in Nigeria',
    'LinkedIn and Behance: Showcasing Your Work',
    'Project: Complete Portfolio Website with 3 Case Studies',
    'Portfolio and Professional Practice Assessment'
  ], ARRAY['Build a 3-case-study design portfolio','Create motion design for portfolio pieces','Establish a professional presence on Behance/LinkedIn']),

  -- Y3 T3: Portfolio and Capstone
  (13, 3, 3, ARRAY[
    'UX Portfolio: Structure, Content, and Storytelling',
    'Case Study Writing: Problem, Process, Solution',
    'Portfolio Website: Building Your Showcase (Figma to Web)',
    'Personal Branding: Logo, Style, and Social Media',
    'Capstone: Client Brief and Discovery Phase',
    'Capstone: User Research and Persona Creation',
    'Capstone: Wireframes and User Flows',
    'Capstone: High-Fidelity UI Design',
    'Capstone: Interactive Prototype with Micro-Interactions',
    'Capstone: Usability Testing and Iteration',
    'Capstone: Final Case Study and Presentation',
    'SS 1 UI/UX Design Track Graduation'
  ], ARRAY['Write compelling UX case studies','Build a professional design portfolio','Present design work to a panel']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 14 — SS 2 · Mobile Development  (Ages 16-17, 108 weeks)
  -- Capacitor, Dart, Flutter, Cross-Platform, App Store Publishing
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 T1: Mobile Foundations and Dart
  (14, 1, 1, ARRAY[
    'Mobile Ecosystem: iOS, Android, Cross-Platform',
    'Native vs Hybrid vs Cross-Platform Frameworks',
    'Introduction to Dart: Why Dart for Mobile?',
    'Dart: Variables, Types, and Null Safety',
    'Dart: Control Flow, Loops, and Functions',
    'Dart: Classes, Objects, and Constructors',
    'Dart: Inheritance, Mixins, and Abstract Classes',
    'Dart: Collections — Lists, Maps, and Sets',
    'Dart: Async Programming with Futures and Streams',
    'Dart: Error Handling and Exceptions',
    'Project: Command-Line Dart Application',
    'Dart Programming Assessment'
  ], ARRAY['Write Dart with null safety','Use Dart classes, mixins, and collections','Handle async operations with Futures and Streams']),

  -- Y1 T2: Flutter Foundations
  (14, 1, 2, ARRAY[
    'Introduction to Flutter: Architecture and Widget Tree',
    'Flutter Setup: SDK, Emulators, and IDE',
    'Widgets: Stateless vs Stateful',
    'Layout Widgets: Row, Column, Stack, Container',
    'Styling: Themes, Colours, and Typography',
    'Text, Images, and Icons in Flutter',
    'ListView and GridView: Scrollable Lists',
    'Navigation: Routes, Named Routes, and Arguments',
    'Forms and User Input: TextFields and Validation',
    'Buttons, Dialogs, and SnackBars',
    'Project: Personal Profile App with Navigation',
    'Flutter Foundations Assessment'
  ], ARRAY['Build Flutter widget trees','Create layouts with Row, Column, and Stack','Implement navigation and forms']),

  -- Y1 T3: Flutter State and APIs
  (14, 1, 3, ARRAY[
    'State Management: setState and Lifting State',
    'Provider Package: ChangeNotifier and Consumer',
    'Riverpod: Modern State Management',
    'HTTP Requests: http and dio Packages',
    'Parsing JSON Data in Flutter',
    'FutureBuilder and StreamBuilder Widgets',
    'Local Storage: SharedPreferences and Hive',
    'Splash Screens and Onboarding Flows',
    'Pull-to-Refresh and Infinite Scrolling',
    'Error Handling and Loading States in UI',
    'Project: News Reader App with API Integration',
    'State and API Assessment'
  ], ARRAY['Manage state with Provider and Riverpod','Fetch and parse API data in Flutter','Implement local storage with Hive']),

  -- Y2 T1: Advanced Flutter UI
  (14, 2, 1, ARRAY[
    'Custom Widgets: Composing Complex UI',
    'Animations: Implicit Animations (AnimatedContainer)',
    'Animations: Explicit Animations (AnimationController)',
    'Hero Animations and Page Transitions',
    'Custom Painting: Canvas and CustomPainter',
    'Slivers: CustomScrollView and SliverAppBar',
    'Responsive Flutter: LayoutBuilder and MediaQuery',
    'Platform-Adaptive UI: Material vs Cupertino',
    'Theming: Dark Mode and Dynamic Themes',
    'Internationalisation (i18n) in Flutter',
    'Project: E-Commerce Product Catalogue with Animations',
    'Advanced Flutter UI Assessment'
  ], ARRAY['Create custom animations and transitions','Build responsive, platform-adaptive UIs','Implement dark mode and dynamic theming']),

  -- Y2 T2: Flutter with Firebase
  (14, 2, 2, ARRAY[
    'Firebase Introduction: BaaS for Mobile',
    'Firebase Authentication: Email, Google, Phone OTP',
    'Cloud Firestore: Documents, Collections, Queries',
    'Firestore: Real-Time Listeners and Offline Support',
    'Firebase Storage: Uploading Images and Files',
    'Firebase Cloud Messaging: Push Notifications',
    'Firebase Analytics and Crashlytics',
    'Firebase Remote Config and A/B Testing',
    'Security Rules: Protecting Your Data',
    'Firestore Pagination and Performance',
    'Project: Social Media App with Firebase Backend',
    'Flutter with Firebase Assessment'
  ], ARRAY['Implement Firebase Auth with multiple providers','Build real-time apps with Cloud Firestore','Send push notifications with FCM']),

  -- Y2 T3: Capacitor and Hybrid Apps
  (14, 2, 3, ARRAY[
    'What Is Capacitor? Web to Native Bridge',
    'Capacitor Setup: Adding to an Existing Web App',
    'Capacitor Plugins: Camera, Geolocation, Storage',
    'Capacitor: File System and Push Notifications',
    'Capacitor: Building for Android (APK/AAB)',
    'Capacitor: Building for iOS (Xcode Basics)',
    'Ionic Framework: UI Components for Hybrid Apps',
    'Comparing Capacitor vs Flutter vs React Native',
    'Converting a Web App to Mobile with Capacitor',
    'Testing on Real Devices: Android and iOS',
    'Project: Convert an Existing Web Dashboard to Mobile',
    'Capacitor and Hybrid Apps Assessment'
  ], ARRAY['Bridge web apps to native with Capacitor','Use native device APIs (camera, GPS, storage)','Build and test APK/AAB for Android']),

  -- Y3 T1: AI, Prompt Engineering, and Native Features
  (14, 3, 1, ARRAY[
    'AI-Assisted Mobile Dev: GitHub Copilot for Dart/Flutter',
    'Prompt Engineering: Generating Flutter Widgets with AI',
    'ChatGPT for Debugging: Solving Mobile-Specific Errors',
    'AI Features in Apps: On-Device ML with TensorFlow Lite',
    'Camera and Image Picker with AI Processing',
    'Maps and Geolocation: Google Maps in Flutter',
    'Biometric Authentication: Fingerprint and Face ID',
    'Deep Linking and Dynamic Links',
    'App Performance: Profiling with DevTools',
    'Testing in Flutter: Unit, Widget, and Integration',
    'Project: AI-Powered Image Recognition App',
    'AI and Native Features Assessment'
  ], ARRAY['Use AI tools (Copilot, ChatGPT) for Flutter development','Integrate on-device ML with TensorFlow Lite','Master prompt engineering for mobile code generation']),

  -- Y3 T2: Publishing, Monetisation, and Portfolio
  (14, 3, 2, ARRAY[
    'App Store Publishing: Google Play and Apple App Store',
    'App Signing: Keystores and Certificates',
    'App Store Optimisation: Screenshots, Keywords, Descriptions',
    'Google Play Console: Release Management',
    'In-App Purchases, Subscriptions, and AdMob',
    'Portfolio Strategy: Showcasing Published Apps',
    'Building a Developer Portfolio Website',
    'Writing App Case Studies: Problem → Solution → Impact',
    'GitHub Profile: Pinned Repos and Documentation',
    'Freelancing: Finding Mobile Dev Clients in Nigeria',
    'Project: Publish App + Write Portfolio Case Study',
    'Publishing and Portfolio Assessment'
  ], ARRAY['Publish apps to Google Play Store','Build a marketable mobile developer portfolio','Write app case studies that attract clients']),

  -- Y3 T3: Capstone Mobile App
  (14, 3, 3, ARRAY[
    'Capstone: Mobile App Idea Validation and Research',
    'Capstone: UI/UX Design in Figma (Mobile Screens)',
    'Capstone: App Architecture and State Management Plan',
    'Capstone: Sprint 1 — Core Screens and Navigation',
    'Capstone: Sprint 2 — Backend Integration (Firebase/API)',
    'Capstone: Sprint 3 — Native Features and Polish',
    'Capstone: Sprint 4 — Testing Suite (Unit + Widget)',
    'Capstone: Sprint 5 — Performance Optimisation',
    'Capstone: App Store Listing and Publishing',
    'Capstone: Marketing Page and Demo Video',
    'Capstone: Live Demo and Panel Presentation',
    'SS 2 Mobile Development Track Graduation'
  ], ARRAY['Design, build, and publish a production mobile app','Integrate native features and backend services','Present a published app to a review panel'])

),
expanded AS (
  SELECT
    rt.lane, rt.yr, rt.tm,
    idx AS wk,
    ((rt.yr - 1) * 36 + (rt.tm - 1) * 12 + idx) AS week_idx,
    rt.topics[idx] AS new_topic,
    to_jsonb(rt.subs) AS new_subs
  FROM real_topics rt
  CROSS JOIN generate_series(1, 12) AS idx
  WHERE idx <= array_length(rt.topics, 1)
)
UPDATE public.platform_syllabus_week_template t
SET topic = e.new_topic, subtopics = e.new_subs
FROM expanded e
WHERE t.catalog_version = 'qa_spine_v1'
  AND t.lane_index = e.lane
  AND t.week_index = e.week_idx
  AND EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = t.program_id
      AND coalesce(p.program_scope, 'regular_school') = 'regular_school'
  );
