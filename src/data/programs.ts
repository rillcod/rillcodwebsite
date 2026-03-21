/**
 * Rillcod Technologies — Program Catalog
 *
 * Ten programs arranged across four learning tiers.
 * This mirrors the live seed catalog in scripts/seed-courses.js.
 *
 * LEARNING PATHS
 * ─────────────────────────────────────────────────────────────
 * Kids Path      : Young Innovators → Teen Developers
 * Web Path       : Teen Developers → Web Dev Bootcamp → Full-Stack Dev
 * Data/AI Path   : Teen Developers → Data Analysis → AI & ML → AI Engineering
 * Design Path    : Teen Developers → UI/UX Design Mastery
 * Robotics Path  : Young Innovators → Teen Developers → Robotics & IoT
 * Business Path  : Any intermediate program → Digital Skills & Entrepreneurship
 */

export interface Program {
  id: string;
  title: string;
  tagline: string;
  description: string;
  tier: 1 | 2 | 3 | 4;
  tierLabel: string;
  ageRange: string;
  duration: string;
  durationWeeks: number;
  skillLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  price: number;           // NGN
  currency: 'NGN';
  maxStudents: number;
  isActive: boolean;
  prerequisite: string | null;
  nextPrograms: string[];  // IDs of recommended next programs
  color: string;           // Tailwind colour name for UI accents
  courseTitles: string[];  // Ordered list of course modules
}

const programs: Program[] = [

  // ─── TIER 1 — KIDS (Ages 6–10) ────────────────────────────────────────────

  {
    id: 'young-innovators',
    title: 'Young Innovators',
    tagline: 'The first step into technology — built for curious minds aged 6–10.',
    description:
      'A playful, project-based introduction to technology. Students explore Scratch ' +
      'programming, digital art, basic robotics, internet safety, and cap it all with ' +
      'a Mini-Maker Showcase where they present an original project to classmates and parents.',
    tier: 1,
    tierLabel: 'Kids (Ages 6–10)',
    ageRange: '6–10 years',
    duration: '12 weeks',
    durationWeeks: 12,
    skillLevel: 'Beginner',
    price: 45000,
    currency: 'NGN',
    maxStudents: 20,
    isActive: true,
    prerequisite: null,
    nextPrograms: ['teen-developers'],
    color: 'orange',
    courseTitles: [
      'Hello World: Introduction to Computers',
      'Creative Coding with Scratch',
      'Fun with Robots: Introduction to Robotics',
      'Digital Art & Animation',
      'Internet Safety & Digital Citizenship',
      'Mini-Maker Showcase',
    ],
  },

  // ─── TIER 2 — JUNIORS (Ages 10–14) ────────────────────────────────────────

  {
    id: 'teen-developers',
    title: 'Teen Developers',
    tagline: 'Real code. Real circuits. Real projects — for ages 10–14.',
    description:
      'The bridge from play to professional technology. Students write Python, build web pages ' +
      'with HTML & CSS, master JavaScript basics, understand electronics, and complete a hands-on ' +
      'robotics project. The ideal launchpad into any advanced programme.',
    tier: 2,
    tierLabel: 'Juniors (Ages 10–14)',
    ageRange: '10–14 years',
    duration: '16 weeks',
    durationWeeks: 16,
    skillLevel: 'Beginner',
    price: 65000,
    currency: 'NGN',
    maxStudents: 20,
    isActive: true,
    prerequisite: 'Young Innovators or basic computer literacy',
    nextPrograms: [
      'web-development-bootcamp',
      'robotics-iot-engineering',
      'ai-ml-fundamentals',
      'ui-ux-design-mastery',
    ],
    color: 'blue',
    courseTitles: [
      'Python for Beginners',
      'Introduction to Web Pages (HTML & CSS)',
      'JavaScript Fundamentals',
      'Electronics & Circuits Fundamentals',
      'Building Smart Robots with Arduino',
      'App Ideas & Prototyping',
    ],
  },

  // ─── TIER 3 — INTERMEDIATE / SPECIALIST ────────────────────────────────────

  {
    id: 'web-development-bootcamp',
    title: 'Web Development Bootcamp',
    tagline: 'From HTML basics to React apps — become a front-end developer.',
    description:
      'An intensive hands-on bootcamp covering the full modern front-end stack: ' +
      'advanced HTML5, CSS3 (animations, Grid, Flexbox), deep JavaScript, React.js, ' +
      'REST APIs, Node.js back-end basics, and a professional portfolio project. ' +
      'Graduates are job-ready for junior web-developer roles.',
    tier: 3,
    tierLabel: 'Intermediate',
    ageRange: '15+ years',
    duration: '20 weeks',
    durationWeeks: 20,
    skillLevel: 'Intermediate',
    price: 95000,
    currency: 'NGN',
    maxStudents: 15,
    isActive: true,
    prerequisite: 'Teen Developers or solid HTML/CSS/JS foundation',
    nextPrograms: ['full-stack-development'],
    color: 'purple',
    courseTitles: [
      'Advanced HTML5 & Semantic Web',
      'CSS3 Mastery (Animations, Grid & Flexbox)',
      'JavaScript Deep Dive',
      'React.js & Component Architecture',
      'APIs & Node.js Backend Fundamentals',
      'Portfolio Project & Professional Launch',
    ],
  },

  {
    id: 'data-analysis-python',
    title: 'Data Analysis with Python',
    tagline: 'Turn raw numbers into powerful insights using Python.',
    description:
      'A rigorous, project-driven data programme covering Python for data, Pandas, NumPy, ' +
      'Matplotlib/Seaborn visualisation, statistical analysis, SQL, and a capstone dashboard ' +
      'project. Ideal for students heading into data science, research, or business analytics.',
    tier: 3,
    tierLabel: 'Intermediate',
    ageRange: '16+ years',
    duration: '20 weeks',
    durationWeeks: 20,
    skillLevel: 'Intermediate',
    price: 110000,
    currency: 'NGN',
    maxStudents: 15,
    isActive: true,
    prerequisite: 'Teen Developers or Python programming experience',
    nextPrograms: ['ai-ml-fundamentals'],
    color: 'teal',
    courseTitles: [
      'Python Programming Foundations for Data',
      'Data Manipulation with Pandas & NumPy',
      'Data Visualisation (Matplotlib & Seaborn)',
      'Statistical Analysis & Probability',
      'SQL & Relational Databases',
      'Data Storytelling & Interactive Dashboards',
      'Capstone Data Analysis Project',
    ],
  },

  {
    id: 'ui-ux-design-mastery',
    title: 'UI/UX Design Mastery',
    tagline: 'Design digital products people love — from concept to clickable prototype.',
    description:
      'A comprehensive design programme covering design thinking, Figma, visual principles, ' +
      'user research, wireframing, mobile & web UI patterns, design systems, and a full ' +
      'UX portfolio. Graduates are ready for junior product-design and UI/UX internships.',
    tier: 3,
    tierLabel: 'Intermediate',
    ageRange: '15+ years',
    duration: '18 weeks',
    durationWeeks: 18,
    skillLevel: 'Intermediate',
    price: 90000,
    currency: 'NGN',
    maxStudents: 15,
    isActive: true,
    prerequisite: 'Teen Developers or basic computer literacy',
    nextPrograms: ['full-stack-development'],
    color: 'pink',
    courseTitles: [
      'Design Thinking & Problem Framing',
      'Figma Fundamentals',
      'Visual Design Principles (Colour, Typography, Layout)',
      'User Research & Usability Testing',
      'Wireframing & Interactive Prototyping',
      'Mobile App & Web UI Design Patterns',
      'Design Systems & Developer Handoff',
      'UX Portfolio & Career Launch',
    ],
  },

  {
    id: 'robotics-iot-engineering',
    title: 'Robotics & IoT Engineering',
    tagline: 'Build intelligent machines that interact with the physical world.',
    description:
      'An advanced engineering programme covering circuit design, Arduino, IoT systems, ' +
      'smart agriculture & environmental sensors, autonomous robots with computer vision, ' +
      'and a competition-ready capstone project. Equipment kits are provided.',
    tier: 3,
    tierLabel: 'Intermediate',
    ageRange: '14+ years',
    duration: '18 weeks',
    durationWeeks: 18,
    skillLevel: 'Intermediate',
    price: 120000,
    currency: 'NGN',
    maxStudents: 12,
    isActive: true,
    prerequisite: 'Teen Developers (electronics & Arduino module)',
    nextPrograms: ['ai-ml-fundamentals'],
    color: 'cyan',
    courseTitles: [
      'Advanced Electronics & Circuit Design',
      'Arduino Programming & Sensor Integration',
      'IoT Systems & Wireless Communication',
      'Smart Agriculture & Environmental Monitoring',
      'Autonomous Robots & Introduction to Computer Vision',
      'Competition Robotics & Capstone Project',
    ],
  },

  // ─── TIER 4 — ADVANCED / PROFESSIONAL ─────────────────────────────────────

  {
    id: 'ai-ml-fundamentals',
    title: 'AI & Machine Learning Fundamentals',
    tagline: 'Understand and build the algorithms powering the modern world.',
    description:
      'A thorough programme covering the mathematics, theory, and practice of AI/ML: ' +
      'supervised & unsupervised learning, deep learning, NLP, AI ethics, and an ' +
      'end-to-end ML engineering capstone. The gateway to AI Engineering & Automation.',
    tier: 4,
    tierLabel: 'Advanced',
    ageRange: '17+ years',
    duration: '22 weeks',
    durationWeeks: 22,
    skillLevel: 'Intermediate',
    price: 140000,
    currency: 'NGN',
    maxStudents: 12,
    isActive: true,
    prerequisite: 'Data Analysis with Python or strong Python + maths background',
    nextPrograms: ['ai-engineering-automation'],
    color: 'violet',
    courseTitles: [
      'Mathematics for AI (Linear Algebra, Calculus, Stats)',
      'Supervised Learning (Regression, Classification, Trees)',
      'Unsupervised Learning (Clustering, Dimensionality Reduction)',
      'Deep Learning & Neural Networks',
      'Natural Language Processing (NLP)',
      'AI Ethics & Responsible Development',
      'ML Engineering & Model Deployment',
    ],
  },

  {
    id: 'full-stack-development',
    title: 'Full-Stack Development',
    tagline: 'Build complete web applications — front-end to database to cloud.',
    description:
      'The most comprehensive web engineering programme: advanced JS & TypeScript, React, ' +
      'Next.js, Node.js microservices, PostgreSQL + Redis, authentication & security, ' +
      'cloud/DevOps, and a capstone SaaS product. Produces fully job-ready full-stack engineers.',
    tier: 4,
    tierLabel: 'Advanced',
    ageRange: '17+ years',
    duration: '24 weeks',
    durationWeeks: 24,
    skillLevel: 'Advanced',
    price: 165000,
    currency: 'NGN',
    maxStudents: 12,
    isActive: true,
    prerequisite: 'Web Development Bootcamp or equivalent front-end experience',
    nextPrograms: ['ai-engineering-automation'],
    color: 'indigo',
    courseTitles: [
      'Advanced JavaScript & TypeScript',
      'Advanced React & State Management',
      'Next.js (App Router, SSR & SSG)',
      'Backend Architecture (Node.js & Microservices)',
      'Databases: PostgreSQL & Redis',
      'Authentication, Security & Compliance',
      'Cloud Infrastructure & DevOps (CI/CD)',
      'Capstone SaaS Product Build',
    ],
  },

  {
    id: 'ai-engineering-automation',
    title: 'AI Engineering & Automation',
    tagline: 'Build, deploy, and monetise production AI systems.',
    description:
      'A cutting-edge professional programme for engineers who want to build with LLMs: ' +
      'prompt engineering, RAG systems, AI agents, process automation, fine-tuning, ' +
      'MLOps pipelines, and AI product development with a real commercial brief.',
    tier: 4,
    tierLabel: 'Advanced',
    ageRange: '18+ years',
    duration: '20 weeks',
    durationWeeks: 20,
    skillLevel: 'Advanced',
    price: 180000,
    currency: 'NGN',
    maxStudents: 10,
    isActive: true,
    prerequisite: 'AI & ML Fundamentals or Full-Stack Development',
    nextPrograms: [],
    color: 'amber',
    courseTitles: [
      'Large Language Models & Prompt Engineering',
      'Retrieval-Augmented Generation (RAG) Systems',
      'AI Agents & Tool Use (LangChain / LlamaIndex)',
      'Process Automation with AI',
      'Fine-tuning & Custom Model Training',
      'MLOps & AI Infrastructure',
      'AI Product Development & Monetisation',
    ],
  },

  {
    id: 'digital-skills-entrepreneurship',
    title: 'Digital Skills & Tech Entrepreneurship',
    tagline: 'Turn your tech skills into a sustainable business or freelance career.',
    description:
      'A practical business programme for techies: digital marketing, content creation, ' +
      'freelancing & client management, financial literacy, startup pitching, communication ' +
      'and leadership. Pairs perfectly with any technical programme.',
    tier: 3,
    tierLabel: 'Intermediate',
    ageRange: '16+ years',
    duration: '12 weeks',
    durationWeeks: 12,
    skillLevel: 'Beginner',
    price: 60000,
    currency: 'NGN',
    maxStudents: 20,
    isActive: true,
    prerequisite: 'Any technical programme or professional background',
    nextPrograms: [],
    color: 'emerald',
    courseTitles: [
      'Digital Marketing & Online Presence',
      'Content Creation & Social Media Strategy',
      'Freelancing & Client Management',
      'Financial Literacy for Techpreneurs',
      'Tech Entrepreneurship & Startup Pitching',
      'Communication, Leadership & Personal Branding',
    ],
  },
];

export default programs;

/**
 * Visual Learning Path Map
 *
 *  [Young Innovators]
 *        │
 *  [Teen Developers] ─────────────────────────┐
 *        │                                         │
 *        ├──► [Web Dev Bootcamp] ──► [Full-Stack]  │
 *        │                               │          │
 *        ├──► [Data Analysis w/Python]   │          │
 *        │          │                    │          │
 *        │          └──► [AI & ML] ──────┘          │
 *        │                   │                      │
 *        │                   └──► [AI Engineering]  │
 *        │                                          │
 *        ├──► [UI/UX Design Mastery] ───────────────┘
 *        │
 *        ├──► [Robotics & IoT] ──► [AI & ML]
 *        │
 *        └──► [Digital Skills & Entrepreneurship] (pairs with any)
 */
