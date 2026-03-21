/**
 * Rillcod Academy — Full Program & Course Catalog Seed
 *
 * Covers ALL learner categories: Kids (6-10) → Teens (11-16) → Young Adults (17-21) → Professionals (22+)
 *
 * Usage:
 *   node scripts/seed-programs.js
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── PROGRAM + COURSE CATALOG ────────────────────────────────────────────────
// Each program has courses ordered by `order_index` that form a complete path.
// Programs link to each other via recommended_next in the description.

const CATALOG = [
  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1 — KIDS (Ages 6–10)  ·  Entry Level
  // ═══════════════════════════════════════════════════════════════════════════
  {
    program: {
      name: 'Young Innovators Club',
      description:
        'A playful, project-based introduction to technology for children aged 6–10. ' +
        'Students explore Scratch programming, digital art, basic robotics, and internet safety. ' +
        'No prior experience required. ' +
        '→ Graduates are ready for Junior Tech Academy.',
      duration_weeks: 12,
      difficulty_level: 'beginner',
      price: 25000,
      max_students: 20,
      is_active: true,
    },
    courses: [
      {
        title: 'Hello World: Introduction to Computers',
        description: 'What is a computer? Exploring hardware, software, input & output devices through games and hands-on activities.',
        content: `# Hello World: Introduction to Computers

## Overview
Students will demystify computers through fun, hands-on exploration. By the end, every child understands how computers receive input, process information, and produce output.

## Learning Objectives
- Identify the main components of a computer (CPU, RAM, storage, I/O)
- Understand the difference between hardware and software
- Practice basic typing and mouse control
- Navigate a desktop operating system safely

## Sessions (4 weeks)
**Week 1:** What is a computer? Parts and purposes
**Week 2:** Input devices — keyboard, mouse, touchscreen
**Week 3:** Software — apps, games, and the operating system
**Week 4:** My first file — creating, saving, and organising documents

## Assessment
Create a digital "All About Me" card using a word processor or presentation tool.`,
        duration_hours: 8,
        order_index: 1,
      },
      {
        title: 'Creative Coding with Scratch',
        description: 'Build animations, games, and stories using Scratch — the visual programming language from MIT designed for young learners.',
        content: `# Creative Coding with Scratch

## Overview
Scratch uses colour-coded blocks to teach programming logic without typing code. Students build real projects every session.

## Learning Objectives
- Understand sequences, loops, and conditionals using blocks
- Create interactive animations and simple games
- Use events, sprites, and backdrops
- Debug simple programs by reading error messages

## Sessions (4 weeks)
**Week 1:** Scratch interface tour — sprites, stage, scripts
**Week 2:** Movement, sounds, and costumes
**Week 3:** Loops and conditionals — making choices
**Week 4:** Finish and showcase your own game!

## Projects
- Dancing animal animation
- "Catch the Star" game
- Interactive birthday card`,
        duration_hours: 10,
        order_index: 2,
      },
      {
        title: 'Fun with Robots: Introduction to Robotics',
        description: 'Students assemble and program simple robots using kits, learning how machines move, sense, and respond.',
        content: `# Fun with Robots: Introduction to Robotics

## Overview
Hands-on robotics sessions where children build, program, and test simple robots. Builds logical thinking, problem-solving, and teamwork.

## Learning Objectives
- Understand what a robot is and how it is used in real life
- Assemble a basic robot kit safely
- Program basic movement sequences
- Work in teams to solve challenges

## Sessions (3 weeks)
**Week 1:** What is a robot? — tour of real robots, safety rules, kit assembly
**Week 2:** Programming movement — forward, backward, turn
**Week 3:** Robot challenge race — navigate a course

## Equipment
LEGO WeDo, Makeblock mBot, or equivalent entry-level kits`,
        duration_hours: 6,
        order_index: 3,
      },
      {
        title: 'Digital Art & Animation',
        description: 'Unleash creativity using digital drawing tools, photo editing basics, and frame-by-frame animation.',
        content: `# Digital Art & Animation

## Overview
Students learn to express creativity digitally — drawing, colouring, layering, and building simple animations.

## Learning Objectives
- Use a digital drawing application confidently
- Understand layers, brushes, and colour mixing
- Create a flipbook-style animation with frames
- Export and share digital artwork safely

## Sessions (3 weeks)
**Week 1:** Digital painting — Canva Kids, Google Drawing, or Krita
**Week 2:** Layers and effects — making it look professional
**Week 3:** Animation — Scratch sprite animation or GIF maker`,
        duration_hours: 6,
        order_index: 4,
      },
      {
        title: 'Internet Safety & Digital Citizenship',
        description: 'Essential online safety skills: protecting personal information, recognising cyberbullying, and being a responsible digital citizen.',
        content: `# Internet Safety & Digital Citizenship

## Overview
Children learn how to use the internet safely and respectfully. This course uses interactive scenarios and games to make safety memorable.

## Learning Objectives
- Identify personal information that should stay private
- Recognise cyberbullying and know how to respond
- Evaluate whether online information is trustworthy
- Practice kind, constructive online communication

## Sessions (2 weeks)
**Week 1:** Personal info, passwords, and stranger danger online
**Week 2:** Cyberbullying, fake news, and being a positive digital citizen`,
        duration_hours: 4,
        order_index: 5,
      },
      {
        title: 'Mini-Maker Showcase',
        description: 'Students combine skills from the term to build and present an original project — the ultimate capstone for Young Innovators.',
        content: `# Mini-Maker Showcase

## Overview
The capstone experience. Each student (or pair) chooses a problem they care about and builds a solution using Scratch, robotics, or digital art. Projects are presented to classmates and parents.

## Learning Objectives
- Apply creative and technical skills to a self-chosen challenge
- Document a project from idea to prototype
- Present confidently in front of an audience
- Give and receive kind constructive feedback

## Timeline (2 weeks)
**Week 1:** Brainstorm → Plan → Build
**Week 2:** Test → Polish → Present

## Award
Certificate of Innovation awarded to every participant`,
        duration_hours: 4,
        order_index: 6,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2 — JUNIORS (Ages 10–14)  ·  Beginner
  // ═══════════════════════════════════════════════════════════════════════════
  {
    program: {
      name: 'Junior Tech Academy',
      description:
        'The bridge from play to real technology. Students aged 10–14 write their first Python, build web pages, understand electronics, and complete a hands-on robotics project. ' +
        'Prerequisite: Young Innovators Club OR basic computer literacy. ' +
        '→ Graduates are ready for Web Development Bootcamp, Robotics & IoT Engineering, or AI & ML Fundamentals.',
      duration_weeks: 16,
      difficulty_level: 'beginner',
      price: 35000,
      max_students: 20,
      is_active: true,
    },
    courses: [
      {
        title: 'Python for Beginners',
        description: 'Write real Python programs from day one — variables, loops, functions, and small games that run in the terminal.',
        content: `# Python for Beginners

## Overview
Python is the world's most beginner-friendly and most professionally used programming language. Students write working programs every session.

## Learning Objectives
- Set up Python and VS Code on a computer
- Use variables, data types, operators, and input/output
- Control program flow with if/elif/else and loops
- Write reusable functions
- Debug basic syntax and logic errors

## Weekly Breakdown
**Week 1:** Hello Python — print, variables, data types
**Week 2:** Making decisions — if, elif, else
**Week 3:** Repetition — for and while loops
**Week 4:** Functions — building blocks of programs
**Week 5:** Lists and dictionaries
**Week 6:** Mini-project: Number guessing game or quiz app`,
        duration_hours: 15,
        order_index: 1,
      },
      {
        title: 'Introduction to Web Pages: HTML & CSS',
        description: 'Build and style your first real web page — understanding the structure of every website on the internet.',
        content: `# Introduction to Web Pages: HTML & CSS

## Overview
HTML structures web content; CSS makes it look great. Students publish a personal profile page on the web by the end.

## Learning Objectives
- Understand the anatomy of an HTML document
- Use headings, paragraphs, images, links, and lists
- Style pages with CSS selectors, colors, fonts, and layout
- Understand responsive design basics
- Host a page using GitHub Pages or Vercel (free)

## Weekly Breakdown
**Week 1:** HTML basics — structure, tags, attributes
**Week 2:** CSS basics — selectors, color, typography
**Week 3:** Layouts — Flexbox and the box model
**Week 4:** Project — My personal profile page (published live)`,
        duration_hours: 10,
        order_index: 2,
      },
      {
        title: 'JavaScript Fundamentals',
        description: 'Make web pages interactive with JavaScript — buttons, forms, animations, and your first dynamic app.',
        content: `# JavaScript Fundamentals

## Overview
JavaScript brings pages to life. Students add interactivity to their HTML/CSS sites and learn the language that powers 98% of the web.

## Learning Objectives
- Understand variables, functions, events in JavaScript
- Manipulate the DOM to change page content dynamically
- Handle user input from buttons and forms
- Debug code using browser developer tools
- Build a mini to-do list or quiz app

## Weekly Breakdown
**Week 1:** Variables, functions, and the browser console
**Week 2:** DOM manipulation — selecting and changing elements
**Week 3:** Events — clicks, hovers, form submissions
**Week 4:** Project — Interactive quiz or to-do list`,
        duration_hours: 10,
        order_index: 3,
      },
      {
        title: 'Electronics & Circuits Fundamentals',
        description: 'Understand how electricity works, build circuits on a breadboard, and learn the components inside every electronic device.',
        content: `# Electronics & Circuits Fundamentals

## Overview
Practical electronics: students build real circuits, understand voltage/current/resistance, and learn to read basic schematics.

## Learning Objectives
- Understand Ohm's Law and basic circuit principles
- Identify components: resistors, capacitors, LEDs, transistors
- Build circuits safely on a breadboard
- Measure voltage and current with a multimeter
- Understand digital vs. analogue signals

## Weekly Breakdown
**Week 1:** Safety, components, and your first LED circuit
**Week 2:** Series and parallel circuits — Ohm's Law in practice
**Week 3:** Sensors and switches — input components
**Week 4:** Transistors as switches — controlling bigger devices`,
        duration_hours: 8,
        order_index: 4,
      },
      {
        title: 'Building Smart Robots with Arduino',
        description: 'Program an Arduino microcontroller to control motors, sensors, and displays — bringing electronics and coding together.',
        content: `# Building Smart Robots with Arduino

## Overview
Arduino is the most popular microcontroller platform in education and industry. Students code in C++ (the Arduino language) and build robots that respond to their environment.

## Learning Objectives
- Set up Arduino IDE and upload programs (sketches)
- Control LEDs, buzzers, and servo motors
- Read from distance, light, and temperature sensors
- Build a line-following or obstacle-avoiding robot
- Combine sensors and actuators for autonomous behaviour

## Weekly Breakdown
**Week 1:** Arduino basics — digital output, blinking LEDs
**Week 2:** Analogue input — reading sensors
**Week 3:** Motors and movement
**Week 4:** Autonomous robot challenge — navigate a course`,
        duration_hours: 10,
        order_index: 5,
      },
      {
        title: 'App Ideas & Prototyping',
        description: 'Design, sketch, and prototype an app idea from scratch — practicing product thinking before writing a single line of code.',
        content: `# App Ideas & Prototyping

## Overview
The best engineers start with problems, not code. Students learn to identify real problems, design solutions, and present them professionally.

## Learning Objectives
- Practice empathy mapping and user interviews
- Create paper and digital wireframes
- Build a clickable prototype in Figma or Canva
- Present ideas with a pitch deck
- Receive and incorporate feedback

## Weekly Breakdown
**Week 1:** Problem → Solution — design thinking workshop
**Week 2:** Wireframing — sketching screens
**Week 3:** Digital prototype in Figma
**Week 4:** Pitch day — present to peers and instructors`,
        duration_hours: 8,
        order_index: 6,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3A — WEB PATH (Ages 13+)  ·  Intermediate
  // ═══════════════════════════════════════════════════════════════════════════
  {
    program: {
      name: 'Web Development Bootcamp',
      description:
        'A focused, project-driven bootcamp that takes students from HTML basics to building and deploying full React web apps. ' +
        'Ideal for ages 13+ and adults looking for a career switch. ' +
        'Prerequisite: Junior Tech Academy HTML/CSS/JS OR equivalent self-taught experience. ' +
        '→ Graduates are ready for Full-Stack Development.',
      duration_weeks: 20,
      difficulty_level: 'intermediate',
      price: 55000,
      max_students: 25,
      is_active: true,
    },
    courses: [
      {
        title: 'Advanced HTML5 & Semantic Web',
        description: 'Master semantic HTML, accessibility (WCAG), forms, multimedia, and the foundations that make professional sites rank and perform well.',
        content: `# Advanced HTML5 & Semantic Web

## Overview
Professional web development starts with solid HTML semantics. This course digs deeper than beginner tags — accessibility, SEO, forms, and media.

## Learning Objectives
- Write fully semantic, accessible HTML5 documents
- Build complex forms with validation attributes
- Embed video, audio, canvas, and SVG
- Understand ARIA roles and WCAG 2.1 basics
- Optimise images and multimedia for the web

## Module Breakdown
**Module 1:** Semantic elements — article, section, nav, header, main, footer
**Module 2:** Forms — input types, labels, fieldsets, validation
**Module 3:** Multimedia — video, audio, responsive images
**Module 4:** Accessibility audit of a real website`,
        duration_hours: 12,
        order_index: 1,
      },
      {
        title: 'CSS3 Mastery: Layouts, Animations & Responsive Design',
        description: 'Flexbox, CSS Grid, custom properties, animations, and mobile-first responsive design — everything needed to pixel-perfect any design.',
        content: `# CSS3 Mastery

## Learning Objectives
- Master Flexbox and CSS Grid for any layout
- Use CSS custom properties (variables) for maintainable code
- Build transitions and keyframe animations
- Implement mobile-first responsive design with media queries
- Use a CSS utility framework (Tailwind CSS) effectively

## Module Breakdown
**Module 1:** Flexbox — one-dimensional layout
**Module 2:** CSS Grid — two-dimensional layout
**Module 3:** Responsive design — breakpoints, clamp(), container queries
**Module 4:** Animations — transitions, keyframes, transform
**Module 5:** Tailwind CSS — utility-first workflow`,
        duration_hours: 14,
        order_index: 2,
      },
      {
        title: 'JavaScript Deep Dive',
        description: 'ES6+, asynchronous programming (promises, async/await), the event loop, closures, and the DOM patterns used in every professional project.',
        content: `# JavaScript Deep Dive

## Learning Objectives
- Master ES6+ syntax: arrow functions, destructuring, spread/rest, modules
- Understand the event loop, call stack, and microtask queue
- Work with Promises, async/await, and fetch API
- Understand closures, higher-order functions, and prototype chain
- Use modern array methods (map, filter, reduce)
- Handle errors gracefully

## Module Breakdown
**Module 1:** ES6+ syntax tour
**Module 2:** Functions — closures, HOFs, scope
**Module 3:** Async JS — promises, fetch, async/await
**Module 4:** DOM patterns — event delegation, MutationObserver
**Module 5:** Error handling and debugging`,
        duration_hours: 16,
        order_index: 3,
      },
      {
        title: 'React.js: Building Modern User Interfaces',
        description: 'Components, hooks, state management, routing, and data fetching with React — the most in-demand frontend framework.',
        content: `# React.js: Building Modern UIs

## Learning Objectives
- Understand the component model and JSX
- Manage state and side effects with hooks (useState, useEffect, useContext, useReducer)
- Route between pages with React Router
- Fetch and display data from APIs
- Build reusable component libraries
- Understand basic performance optimisation

## Module Breakdown
**Module 1:** Components, JSX, props
**Module 2:** State and hooks
**Module 3:** React Router for multi-page apps
**Module 4:** API integration — SWR / React Query basics
**Module 5:** Forms and validation in React
**Module 6:** Capstone — build a real-world React app`,
        duration_hours: 20,
        order_index: 4,
      },
      {
        title: 'APIs, Node.js & Backend Basics',
        description: 'Understand how the internet works, consume REST APIs, and build your own simple Express.js server with a database.',
        content: `# APIs, Node.js & Backend Basics

## Learning Objectives
- Understand HTTP, REST, JSON, and API authentication
- Consume third-party APIs (weather, maps, payments) from React
- Set up a Node.js + Express server
- Connect to a PostgreSQL or MongoDB database
- Protect routes with JWT authentication
- Deploy a backend to Railway or Render (free tier)

## Module Breakdown
**Module 1:** HTTP protocol & REST API concepts
**Module 2:** Consuming APIs with fetch and Axios
**Module 3:** Node.js + Express — your first server
**Module 4:** Databases — SQL basics and Supabase integration
**Module 5:** Authentication — JWT and sessions`,
        duration_hours: 16,
        order_index: 5,
      },
      {
        title: 'Portfolio Project & Professional Launch',
        description: 'Build and launch a production-ready portfolio project, optimise for performance, and prepare for tech job applications or freelancing.',
        content: `# Portfolio Project & Professional Launch

## Overview
The capstone course. Students build a complete, deployed web application and present it professionally.

## Deliverables
1. A live, deployed web application (Next.js or React + API)
2. A personal portfolio website with 3 projects
3. A polished GitHub profile (clean READMEs, contribution graph)
4. A professional LinkedIn profile
5. A 5-minute project demo video

## Topics Covered
- Performance optimisation (Lighthouse score ≥ 90)
- SEO basics for web apps
- Deploying to Vercel / Netlify
- Writing a compelling developer README
- Freelancing rates and client communication basics`,
        duration_hours: 20,
        order_index: 6,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3B — DATA PATH (Ages 14+)  ·  Intermediate
  // ═══════════════════════════════════════════════════════════════════════════
  {
    program: {
      name: 'Data Analysis with Python',
      description:
        'A complete data analyst curriculum: from Python foundations through SQL, statistical analysis, data visualisation, and interactive dashboards. ' +
        'Ideal for ages 14+ and working professionals. ' +
        'Prerequisite: Junior Tech Academy Python OR basic programming knowledge. ' +
        '→ Graduates are ready for AI & Machine Learning Fundamentals or direct entry into the workforce as data analysts.',
      duration_weeks: 20,
      difficulty_level: 'intermediate',
      price: 60000,
      max_students: 20,
      is_active: true,
    },
    courses: [
      {
        title: 'Python Programming Foundations for Data',
        description: 'Strengthen Python skills with a data-science focus — file handling, comprehensions, OOP basics, and working with real datasets.',
        content: `# Python Foundations for Data

## Learning Objectives
- Write clean, readable Python code following PEP 8
- Use list/dict/set comprehensions efficiently
- Work with CSV, JSON, and Excel files
- Understand classes and objects (OOP basics)
- Use virtual environments and pip for package management

## Module Breakdown
**Module 1:** Python review — types, loops, functions
**Module 2:** File I/O — CSV, JSON, Excel
**Module 3:** List/dict comprehensions and generators
**Module 4:** OOP basics — classes, methods, inheritance
**Module 5:** Environment setup — Jupyter, Anaconda, pip`,
        duration_hours: 12,
        order_index: 1,
      },
      {
        title: 'Data Manipulation with Pandas & NumPy',
        description: 'The core toolkit of every data analyst: loading, cleaning, transforming, and aggregating data with Pandas DataFrames and NumPy arrays.',
        content: `# Data Manipulation with Pandas & NumPy

## Learning Objectives
- Create and manipulate Pandas Series and DataFrames
- Clean messy data: nulls, duplicates, data type fixes
- Filter, sort, group, and aggregate data
- Merge and join multiple datasets
- Use NumPy for vectorised numerical operations
- Profile a dataset end-to-end

## Module Breakdown
**Module 1:** NumPy arrays — vectorised math
**Module 2:** Pandas DataFrames — load, inspect, clean
**Module 3:** Filtering, sorting, groupby
**Module 4:** Merging datasets — concat, merge, join
**Module 5:** Real dataset project — clean a messy dataset`,
        duration_hours: 15,
        order_index: 2,
      },
      {
        title: 'Data Visualisation: Matplotlib, Seaborn & Plotly',
        description: 'Create compelling, publication-quality charts and interactive dashboards that tell stories with data.',
        content: `# Data Visualisation

## Learning Objectives
- Choose the right chart type for each data story
- Build static charts with Matplotlib and Seaborn
- Create interactive charts with Plotly Express
- Annotate and customise charts for clarity
- Build a multi-panel dashboard
- Export charts for reports and presentations

## Module Breakdown
**Module 1:** Matplotlib fundamentals — axes, figures, subplots
**Module 2:** Seaborn — statistical visualisation
**Module 3:** Plotly — interactive, web-ready charts
**Module 4:** Dashboard design principles
**Module 5:** Storytelling project — visualise a Nigerian economic dataset`,
        duration_hours: 12,
        order_index: 3,
      },
      {
        title: 'Statistical Analysis & Probability',
        description: 'The mathematics behind data analysis: descriptive stats, probability distributions, hypothesis testing, and correlation.',
        content: `# Statistical Analysis & Probability

## Learning Objectives
- Calculate and interpret descriptive statistics (mean, median, std, quartiles)
- Understand probability distributions (normal, binomial, Poisson)
- Apply hypothesis testing (t-test, chi-square, ANOVA)
- Measure correlation and understand causation vs. correlation
- Perform A/B test analysis
- Use SciPy for statistical computations

## Module Breakdown
**Module 1:** Descriptive statistics and data distributions
**Module 2:** Probability and sampling theory
**Module 3:** Hypothesis testing
**Module 4:** Correlation and regression introduction
**Module 5:** Practical stats project — testing a real business hypothesis`,
        duration_hours: 14,
        order_index: 4,
      },
      {
        title: 'SQL & Databases for Data Analysts',
        description: 'Query, filter, aggregate, and join data from relational databases using SQL — the language of every data job description.',
        content: `# SQL & Databases for Data Analysts

## Learning Objectives
- Write SELECT, WHERE, GROUP BY, ORDER BY, LIMIT queries confidently
- Join multiple tables with INNER, LEFT, RIGHT, and FULL joins
- Use subqueries and CTEs (Common Table Expressions)
- Aggregate with COUNT, SUM, AVG, MIN, MAX, HAVING
- Understand indexes and basic query optimisation
- Connect Python (Pandas) to a PostgreSQL database

## Module Breakdown
**Module 1:** SQL basics — SELECT, FROM, WHERE
**Module 2:** Joins — combining tables
**Module 3:** Aggregation and GROUP BY
**Module 4:** Subqueries and CTEs
**Module 5:** Python ↔ SQL — sqlalchemy and pandas.read_sql`,
        duration_hours: 14,
        order_index: 5,
      },
      {
        title: 'Data Storytelling & Dashboards',
        description: 'Build Streamlit or Power BI dashboards and learn the narrative techniques that turn raw analysis into business decisions.',
        content: `# Data Storytelling & Dashboards

## Learning Objectives
- Structure a data story: hook, insight, recommendation
- Build interactive dashboards with Streamlit (Python)
- Understand when to use Power BI or Tableau
- Design dashboards for different audiences (executive, analyst, operations)
- Present findings to non-technical stakeholders

## Module Breakdown
**Module 1:** Data storytelling framework
**Module 2:** Streamlit dashboards — build and deploy
**Module 3:** Power BI basics — for enterprise settings
**Module 4:** Presentation skills for analysts`,
        duration_hours: 10,
        order_index: 6,
      },
      {
        title: 'Capstone Data Analysis Project',
        description: 'End-to-end analysis of a real Nigerian or African business dataset — from raw data to a full report and interactive dashboard.',
        content: `# Capstone Data Analysis Project

## Overview
Students independently conduct a complete data analysis project over 3 weeks, simulating a real industry engagement.

## Deliverables
1. Problem statement and data sourcing
2. Cleaned, documented dataset (Jupyter Notebook)
3. Statistical analysis with interpretations
4. Visualisation dashboard (Streamlit or Plotly)
5. A business recommendation report (PDF, 5–8 pages)
6. A 10-minute presentation to instructors and peers

## Recommended Datasets
- National Bureau of Statistics (NBS) Nigeria open data
- World Bank Nigeria indicators
- Custom datasets provided by Rillcod (e-commerce, education, healthcare)

## Evaluation Criteria
- Data quality and cleaning approach
- Analytical depth and correctness
- Visualisation clarity
- Business insight quality
- Presentation confidence`,
        duration_hours: 15,
        order_index: 7,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3C — DESIGN PATH (Ages 13+)  ·  Beginner → Intermediate
  // ═══════════════════════════════════════════════════════════════════════════
  {
    program: {
      name: 'UI/UX Design Mastery',
      description:
        'A professional UI/UX design curriculum: design thinking, Figma, user research, prototyping, and building a client-ready portfolio. ' +
        'Suitable for ages 13+ and adults with no prior design experience. ' +
        '→ Graduates can work directly with development teams or enrol in Web Development Bootcamp for a full-stack design+code skill set.',
      duration_weeks: 18,
      difficulty_level: 'beginner',
      price: 50000,
      max_students: 20,
      is_active: true,
    },
    courses: [
      {
        title: 'Design Thinking & Human-Centered Design',
        description: 'The mindset behind great products: empathise, define, ideate, prototype, test — and why user-centered design creates better businesses.',
        content: `# Design Thinking & Human-Centered Design

## Learning Objectives
- Understand and apply the 5-stage Design Thinking framework
- Conduct empathy interviews and build user personas
- Define problem statements (Point of View statements)
- Run ideation workshops (brainwriting, SCAMPER, crazy 8s)
- Rapidly prototype ideas with paper and basic tools
- Conduct a usability test and synthesise findings

## Module Breakdown
**Module 1:** Introduction to design thinking — real-world case studies
**Module 2:** Empathise — interviews, observation, affinity mapping
**Module 3:** Define — personas, journey maps, POV statements
**Module 4:** Ideate → Prototype → Test — rapid iteration cycle`,
        duration_hours: 10,
        order_index: 1,
      },
      {
        title: 'Figma Fundamentals & Interface Design',
        description: 'Master the industry-standard design tool: frames, auto-layout, components, variants, and everything needed to design real apps.',
        content: `# Figma Fundamentals & Interface Design

## Learning Objectives
- Navigate the Figma interface with confidence
- Use frames, groups, and auto-layout for responsive designs
- Create and manage reusable components and variants
- Apply consistent colour styles and text styles
- Work with grids, columns, and spacing systems
- Collaborate with comments and version history

## Module Breakdown
**Module 1:** Figma workspace tour — frames, layers, constraints
**Module 2:** Shapes, images, and text
**Module 3:** Auto-layout — responsive frames
**Module 4:** Components and variants — the building blocks of design systems
**Module 5:** Styles — colours, typography, effects
**Module 6:** Collaboration — sharing, commenting, developer handoff`,
        duration_hours: 14,
        order_index: 2,
      },
      {
        title: 'Visual Design Principles: Typography, Color & Hierarchy',
        description: 'The visual grammar of great design — how to use type, colour, spacing, and contrast to create designs that communicate clearly.',
        content: `# Visual Design Principles

## Learning Objectives
- Choose and pair typefaces appropriately for brand and readability
- Build accessible colour palettes (WCAG contrast ratios)
- Apply visual hierarchy to guide the user's eye
- Use whitespace purposefully
- Understand Gestalt principles in UI design
- Evaluate designs critically using a rubric

## Module Breakdown
**Module 1:** Typography — type anatomy, pairing, sizing scale
**Module 2:** Color theory — hue, value, saturation; building a palette
**Module 3:** Layout and hierarchy — grid, spacing, contrast
**Module 4:** Gestalt principles — proximity, similarity, continuity
**Module 5:** Design critique workshop`,
        duration_hours: 10,
        order_index: 3,
      },
      {
        title: 'User Research & Usability Testing',
        description: 'Research methods, interview techniques, usability test facilitation, and how to turn findings into product improvements.',
        content: `# User Research & Usability Testing

## Learning Objectives
- Plan and conduct user interviews and surveys
- Analyse and synthesise qualitative data (affinity diagrams)
- Plan and facilitate moderated usability tests
- Document findings in a research report
- Prioritise improvements using effort/impact matrices
- Present research insights to stakeholders

## Module Breakdown
**Module 1:** Research planning — goals, questions, participants
**Module 2:** Interview techniques — active listening, neutrality
**Module 3:** Usability testing — script, facilitation, recording
**Module 4:** Analysis — patterns, themes, recommendations
**Module 5:** Research presentation`,
        duration_hours: 10,
        order_index: 4,
      },
      {
        title: 'Wireframing & Interactive Prototyping',
        description: 'From rough sketches to polished, clickable prototypes that developers can build from — bridging design and engineering.',
        content: `# Wireframing & Interactive Prototyping

## Learning Objectives
- Sketch low-fidelity wireframes quickly and accurately
- Build mid-fidelity wireframes in Figma
- Create interactive prototypes with smart animate and transitions
- Map user flows and edge cases
- Hand off designs to developers (inspect mode, tokens)
- Communicate design decisions clearly

## Module Breakdown
**Module 1:** Sketching wireframes — speed and structure
**Module 2:** Mid-fi wireframes in Figma
**Module 3:** Interactions — smart animate, overlays, scrolling
**Module 4:** User flow documentation
**Module 5:** Developer handoff — inspect, tokens, specifications`,
        duration_hours: 12,
        order_index: 5,
      },
      {
        title: 'Mobile App & Web UI Design Patterns',
        description: 'Navigation patterns, form design, micro-interactions, error states, empty states — the UI patterns every designer must know cold.',
        content: `# Mobile App & Web UI Design Patterns

## Learning Objectives
- Apply common navigation patterns (tab bar, hamburger, sidebar, breadcrumb)
- Design forms that reduce friction and errors
- Create micro-interactions that delight without distracting
- Design loading, error, empty, and success states
- Understand iOS Human Interface Guidelines and Material Design
- Adapt designs for both mobile and desktop

## Module Breakdown
**Module 1:** Navigation patterns — mobile vs. desktop
**Module 2:** Form design best practices
**Module 3:** Feedback states — loading, error, success, empty
**Module 4:** Micro-interactions — when and how to use them
**Module 5:** Platform guidelines — iOS vs Android vs Web`,
        duration_hours: 12,
        order_index: 6,
      },
      {
        title: 'Design Systems & Handoff',
        description: 'Build a scalable, documented design system from scratch — the foundation of every professional product team.',
        content: `# Design Systems & Handoff

## Learning Objectives
- Understand what a design system is and why teams need one
- Build a component library in Figma with documented usage
- Define design tokens (colour, typography, spacing, radius, shadow)
- Write design documentation that developers and PMs can follow
- Use Figma Tokens or Storybook basics for design-dev alignment
- Review open-source design systems: Material, Chakra, Ant Design

## Module Breakdown
**Module 1:** Design system anatomy — tokens, components, patterns, guidelines
**Module 2:** Building a component library in Figma
**Module 3:** Design tokens — naming, theming, dark mode
**Module 4:** Documentation — writing for developers
**Module 5:** Working with open-source systems`,
        duration_hours: 10,
        order_index: 7,
      },
      {
        title: 'UX Portfolio & Career Launch',
        description: 'Build a portfolio that gets interviews: case study writing, portfolio site setup, freelancing basics, and UX job market preparation.',
        content: `# UX Portfolio & Career Launch

## Learning Objectives
- Write compelling case studies (problem → process → outcome)
- Build a portfolio site (Framer, Webflow, or custom code)
- Prepare for UX interviews — portfolio walkthrough, design challenges
- Understand freelance rates and client management
- Network effectively in the Nigerian and global tech community
- Know the next steps: UX internships, junior roles, freelance gigs

## Deliverables
- 2 polished case studies
- Live portfolio website
- LinkedIn and Behance profile optimisation
- Mock interview with instructor feedback`,
        duration_hours: 10,
        order_index: 8,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3D — HARDWARE PATH (Ages 12+)  ·  Intermediate
  // ═══════════════════════════════════════════════════════════════════════════
  {
    program: {
      name: 'Robotics & IoT Engineering',
      description:
        'From breadboard circuits to autonomous robots and cloud-connected IoT systems. ' +
        'Combines electronics, Arduino, Python/MicroPython, and real engineering challenges. ' +
        'Prerequisite: Junior Tech Academy OR basic electronics and programming knowledge. ' +
        '→ Graduates are ready for AI & Machine Learning Fundamentals or direct industry placement.',
      duration_weeks: 18,
      difficulty_level: 'intermediate',
      price: 60000,
      max_students: 18,
      is_active: true,
    },
    courses: [
      {
        title: 'Advanced Electronics & Circuit Design',
        description: 'Op-amps, PWM, transistors as switches and amplifiers, PCB design basics, and power supply design for real engineering projects.',
        content: `# Advanced Electronics & Circuit Design

## Learning Objectives
- Design circuits using transistors, MOSFETs, and op-amps
- Understand and calculate PWM signals for motor control
- Read and create circuit schematics with KiCad or EasyEDA
- Design a simple PCB layout
- Understand power supply design — LDO regulators, voltage dividers
- Analyse circuits with simulation tools (Falstad, LTspice)`,
        duration_hours: 14,
        order_index: 1,
      },
      {
        title: 'Arduino Programming for Real Projects',
        description: 'Interrupts, timers, serial communication (UART/I2C/SPI), and building robust embedded firmware for real-world applications.',
        content: `# Arduino Programming for Real Projects

## Learning Objectives
- Use hardware and software interrupts
- Implement timer-based tasks (without delay())
- Communicate with I2C and SPI devices (OLED, gyroscope, SD card)
- Build a state machine for reliable embedded behaviour
- Implement serial communication (UART) with PC and other devices
- Debug embedded systems with serial monitor and logic analyser`,
        duration_hours: 14,
        order_index: 2,
      },
      {
        title: 'IoT Systems: Connecting Devices to the Cloud',
        description: 'ESP32/ESP8266, MQTT, HTTP APIs, and building cloud-connected devices that report data and respond to remote commands.',
        content: `# IoT Systems: Connecting Devices to the Cloud

## Learning Objectives
- Programme ESP32/ESP8266 with Arduino IDE and MicroPython
- Connect to WiFi and send data to cloud platforms (Blynk, ThingSpeak, Firebase)
- Use MQTT for lightweight device communication
- Build a REST API client on a microcontroller
- Secure IoT devices — basic authentication and HTTPS
- Monitor device data with a real-time dashboard`,
        duration_hours: 14,
        order_index: 3,
      },
      {
        title: 'Smart Agriculture & Environmental Monitoring',
        description: "Apply IoT to Nigeria's most critical sector: soil moisture, weather stations, automated irrigation, and SMS/WhatsApp alerts.",
        content: `# Smart Agriculture & Environmental Monitoring

## Overview
A project-based course applying IoT to agriculture and environmental monitoring — highly relevant for Nigeria's tech ecosystem.

## Projects
- Soil moisture sensor + automated irrigation relay
- Weather station (temperature, humidity, rainfall, UV index)
- Air quality monitor (CO₂, particulates)
- SMS/WhatsApp alerts via Twilio when thresholds exceed limits
- Solar-powered field sensor with sleep modes for battery optimisation`,
        duration_hours: 12,
        order_index: 4,
      },
      {
        title: 'Autonomous Robots & Computer Vision',
        description: 'Line-following, obstacle avoidance, PID control, and an introduction to OpenCV computer vision for camera-guided robots.',
        content: `# Autonomous Robots & Computer Vision

## Learning Objectives
- Implement PID control for smooth motor speed regulation
- Build a line-following robot with reliable performance
- Implement ultrasonic and IR-based obstacle avoidance
- Interface a camera module (OV7670 or Pi Camera) with a microcontroller
- Run basic OpenCV operations (thresholding, contour detection) on a Raspberry Pi
- Combine sensor fusion for robust autonomous navigation`,
        duration_hours: 16,
        order_index: 5,
      },
      {
        title: 'Competition Robotics & Capstone',
        description: 'Design, build, and compete in a robotics challenge — applying all course skills in a timed, judged engineering challenge.',
        content: `# Competition Robotics & Capstone

## Overview
The capstone experience simulating a real robotics competition.

## Challenge Format
Teams of 2–3 build a robot to complete a scored obstacle course within 4 weeks.

## Judged Criteria
- Task completion (points per zone)
- Reliability (consistency across 3 runs)
- Innovation (novel solutions)
- Documentation (engineering logbook)
- Presentation (2-minute team pitch)

## Certificate
Rillcod Robotics Engineer Certificate awarded to all finalists`,
        duration_hours: 16,
        order_index: 6,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4A — AI PATH (Ages 14+)  ·  Intermediate
  // ═══════════════════════════════════════════════════════════════════════════
  {
    program: {
      name: 'AI & Machine Learning Fundamentals',
      description:
        'A rigorous but accessible introduction to AI and ML: mathematics, Python, supervised/unsupervised learning, neural networks, and ethical AI. ' +
        'Prerequisite: Data Analysis with Python OR strong Python + math background. ' +
        '→ Graduates are ready for AI Engineering & Automation.',
      duration_weeks: 22,
      difficulty_level: 'intermediate',
      price: 70000,
      max_students: 20,
      is_active: true,
    },
    courses: [
      {
        title: 'Mathematics for AI: Linear Algebra & Calculus',
        description: 'Vectors, matrices, eigenvalues, derivatives, and the chain rule — the mathematical backbone of every ML algorithm.',
        content: `# Mathematics for AI

## Learning Objectives
- Work with vectors and matrices — addition, multiplication, transpose
- Compute dot products and understand their geometric meaning
- Find eigenvalues and eigenvectors (conceptually)
- Understand derivatives and partial derivatives
- Apply the chain rule (foundation of backpropagation)
- Use NumPy to perform all operations in Python

## Tools: NumPy, SymPy (symbolic math)`,
        duration_hours: 14,
        order_index: 1,
      },
      {
        title: 'Supervised Learning: Regression & Classification',
        description: 'Linear regression, logistic regression, decision trees, random forests, SVMs, and model evaluation with scikit-learn.',
        content: `# Supervised Learning

## Learning Objectives
- Understand the supervised learning framework (features, labels, train/test)
- Build and evaluate regression models (linear, polynomial, ridge)
- Build and evaluate classification models (logistic regression, decision trees, random forests, SVM)
- Apply cross-validation, hyperparameter tuning (GridSearchCV)
- Interpret feature importance and model coefficients
- Avoid overfitting — regularisation and validation strategies

## Tools: scikit-learn, Pandas, Matplotlib`,
        duration_hours: 16,
        order_index: 2,
      },
      {
        title: 'Unsupervised Learning & Dimensionality Reduction',
        description: 'K-means, hierarchical clustering, DBSCAN, PCA, and t-SNE — finding patterns in unlabelled data.',
        content: `# Unsupervised Learning

## Learning Objectives
- Cluster data with K-means, hierarchical clustering, and DBSCAN
- Evaluate clusters with silhouette score and elbow method
- Reduce dimensions with PCA and t-SNE for visualisation
- Apply anomaly detection
- Find market segments in real business datasets

## Tools: scikit-learn, Plotly for 3D visualisations`,
        duration_hours: 12,
        order_index: 3,
      },
      {
        title: 'Deep Learning & Neural Networks',
        description: 'Feedforward networks, convolutional neural networks (CNNs), recurrent networks (LSTMs), and training with TensorFlow/Keras.',
        content: `# Deep Learning & Neural Networks

## Learning Objectives
- Understand the neuron model, activation functions, layers
- Build and train feedforward networks with Keras
- Understand and implement CNNs for image classification
- Understand sequence models — LSTMs for time series and text
- Apply transfer learning (pre-trained models — MobileNet, ResNet)
- Monitor training with TensorBoard

## Tools: TensorFlow, Keras, Google Colab (free GPU)`,
        duration_hours: 18,
        order_index: 4,
      },
      {
        title: 'Natural Language Processing (NLP)',
        description: 'Text preprocessing, sentiment analysis, named entity recognition, and using HuggingFace transformers for real NLP tasks.',
        content: `# Natural Language Processing

## Learning Objectives
- Preprocess text: tokenisation, stopwords, stemming, lemmatisation
- Represent text: bag-of-words, TF-IDF, word embeddings (Word2Vec, GloVe)
- Build a sentiment classifier
- Use HuggingFace pipelines for NER, summarisation, translation
- Fine-tune a small transformer model on a custom dataset
- Understand large language models (LLMs) at a conceptual level

## Tools: NLTK, spaCy, HuggingFace Transformers`,
        duration_hours: 14,
        order_index: 5,
      },
      {
        title: 'AI Ethics, Bias & Responsible Development',
        description: 'Who is harmed by biased AI? Fairness metrics, model explainability (SHAP, LIME), and frameworks for responsible AI deployment.',
        content: `# AI Ethics & Responsible Development

## Learning Objectives
- Identify and measure bias in datasets and model outputs
- Apply fairness metrics (demographic parity, equitable opportunity)
- Use SHAP and LIME to explain model decisions
- Understand GDPR and Nigeria's data protection frameworks (NDPR)
- Design AI systems with privacy, safety, and accountability
- Review case studies: facial recognition bias, credit scoring, content moderation

## Assessment: Write an ethical impact assessment for a proposed AI system`,
        duration_hours: 10,
        order_index: 6,
      },
      {
        title: 'ML Engineering: Deploy Your First AI Model',
        description: 'Package a trained model as a REST API with FastAPI, containerise with Docker, and deploy to the cloud — making ML production-ready.',
        content: `# ML Engineering: Deploy Your First AI Model

## Learning Objectives
- Save and load models (pickle, joblib, TensorFlow SavedModel)
- Build a REST API around a model with FastAPI
- Add input validation and error handling
- Containerise with Docker
- Deploy to Render, Railway, or Google Cloud Run
- Monitor model performance in production

## Deliverable: Live, callable ML API with documentation`,
        duration_hours: 12,
        order_index: 7,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4B — FULL-STACK PATH (Ages 16+)  ·  Advanced
  // ═══════════════════════════════════════════════════════════════════════════
  {
    program: {
      name: 'Full-Stack Development',
      description:
        'Professional full-stack engineering: advanced React, Node.js microservices, PostgreSQL, Redis, authentication, cloud infrastructure, and DevOps. ' +
        'Prerequisite: Web Development Bootcamp or equivalent 12 months of self-taught web development. ' +
        '→ Graduates are employment-ready for junior-to-mid software engineer roles.',
      duration_weeks: 24,
      difficulty_level: 'advanced',
      price: 85000,
      max_students: 20,
      is_active: true,
    },
    courses: [
      {
        title: 'Advanced JavaScript & TypeScript',
        description: 'TypeScript, design patterns (factory, singleton, observer), functional programming, and performance profiling.',
        content: `# Advanced JavaScript & TypeScript

## Learning Objectives
- Write and maintain TypeScript with strict mode
- Apply design patterns: factory, singleton, observer, strategy
- Use functional programming techniques: immutability, pure functions, composition
- Profile and optimise JavaScript performance (memory leaks, event loop blocking)
- Understand module systems (ESM, CommonJS) and bundlers (Vite, Webpack)

## Tools: TypeScript, ESLint, Vitest`,
        duration_hours: 14,
        order_index: 1,
      },
      {
        title: 'Advanced React & State Management',
        description: 'Server Components, Suspense, TanStack Query, Zustand, optimistic updates, and scaling React apps to production.',
        content: `# Advanced React & State Management

## Learning Objectives
- Use React Server Components and client/server boundaries
- Implement Suspense and React.lazy for code splitting
- Manage global state with Zustand or Jotai
- Handle server state with TanStack Query (caching, revalidation, optimistic updates)
- Build accessible, keyboard-navigable component libraries
- Profile and fix React performance issues (React DevTools, Profiler)`,
        duration_hours: 16,
        order_index: 2,
      },
      {
        title: 'Next.js: Full-Stack React Framework',
        description: 'App Router, Server Actions, RSC patterns, ISR, middleware, and building production Next.js applications.',
        content: `# Next.js: Full-Stack React Framework

## Learning Objectives
- Navigate the App Router architecture (layouts, pages, loading, error)
- Use Server Actions for form submissions and mutations
- Implement ISR, SSG, and SSR caching strategies
- Write middleware for auth and redirects
- Integrate Next.js with Supabase, Prisma, or Drizzle ORM
- Deploy to Vercel with Edge Functions

## Project: Build the Rillcod-scale LMS clone`,
        duration_hours: 16,
        order_index: 3,
      },
      {
        title: 'Backend Architecture: Node.js, Microservices & APIs',
        description: 'REST and GraphQL API design, microservice patterns, message queues (Bull, Redis), and service-to-service authentication.',
        content: `# Backend Architecture

## Learning Objectives
- Design clean REST APIs following Richardson Maturity Model
- Build a GraphQL API with Apollo Server
- Implement message queues with Bull and Redis for async tasks (emails, notifications)
- Structure a Node.js monorepo with shared packages
- Implement API versioning and backwards compatibility
- Document APIs with OpenAPI/Swagger`,
        duration_hours: 18,
        order_index: 4,
      },
      {
        title: 'Databases: PostgreSQL, Redis & Search',
        description: 'Advanced SQL (CTEs, window functions, indexes, EXPLAIN), PostgreSQL JSON, Redis caching patterns, and full-text search.',
        content: `# Databases: PostgreSQL, Redis & Search

## Learning Objectives
- Write advanced SQL: CTEs, window functions, recursive queries
- Design normalised schemas and use indexes effectively
- Use PostgreSQL JSONB for flexible document storage
- Implement Redis caching strategies (cache-aside, write-through)
- Add full-text search with PostgreSQL pg_search or Meilisearch
- Run database migrations safely with zero downtime

## Tools: PostgreSQL, Supabase, Redis, Drizzle ORM`,
        duration_hours: 16,
        order_index: 5,
      },
      {
        title: 'Authentication, Security & Compliance',
        description: 'JWT, OAuth 2.0, RBAC, CSRF, XSS, SQL injection prevention, HTTPS, CORS, and rate limiting for production apps.',
        content: `# Authentication, Security & Compliance

## Learning Objectives
- Implement authentication with JWT (access + refresh tokens)
- Add OAuth 2.0 (Google, GitHub login) with Auth.js or Supabase Auth
- Design role-based access control (RBAC) at the API layer
- Protect against OWASP Top 10: XSS, SQLi, CSRF, SSRF, IDOR
- Configure CORS, Content Security Policy, and rate limiting
- Understand NDPR (Nigeria) and GDPR data protection requirements`,
        duration_hours: 14,
        order_index: 6,
      },
      {
        title: 'Cloud, DevOps & CI/CD',
        description: 'Docker, GitHub Actions CI/CD, AWS/GCP basics, monitoring with Sentry and Grafana, and infrastructure as code with Terraform basics.',
        content: `# Cloud, DevOps & CI/CD

## Learning Objectives
- Containerise applications with Docker and Docker Compose
- Write GitHub Actions workflows for lint, test, and deploy
- Deploy to AWS EC2, App Runner, or Google Cloud Run
- Set up monitoring and alerts with Sentry (errors) and Grafana (metrics)
- Understand infrastructure as code concepts with Terraform
- Implement blue-green or canary deployments`,
        duration_hours: 16,
        order_index: 7,
      },
      {
        title: 'Capstone: Build & Ship a SaaS Product',
        description: 'Build a complete, production-deployed SaaS application with authentication, payments, and real users — from concept to launch.',
        content: `# Capstone: Build & Ship a SaaS Product

## Overview
Teams of 2–3 build and deploy a real SaaS product. The goal is not a demo — it must be publicly accessible, secure, and functional for real users.

## Requirements
- User authentication and account management
- Core feature set (unique per team)
- Payment integration (Paystack or Flutterwave)
- Admin dashboard
- CI/CD pipeline (auto-deploys on merge)
- Performance budget: LCP < 2.5s, Lighthouse ≥ 90
- Written technical documentation

## Judged On
- Product quality and completeness
- Code quality and architecture
- Security posture
- Pitch (5 minutes + 5 minutes Q&A)`,
        duration_hours: 20,
        order_index: 8,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4C — AI ENGINEERING PATH (Ages 17+)  ·  Advanced
  // ═══════════════════════════════════════════════════════════════════════════
  {
    program: {
      name: 'AI Engineering & Automation',
      description:
        'Cutting-edge AI engineering: LLMs, prompt engineering, AI agents, RAG systems, MLOps, and building commercial AI products. ' +
        'Prerequisite: AI & Machine Learning Fundamentals or equivalent industry experience. ' +
        '→ Graduates are ready for AI engineer or ML engineer roles in industry.',
      duration_weeks: 20,
      difficulty_level: 'advanced',
      price: 90000,
      max_students: 15,
      is_active: true,
    },
    courses: [
      {
        title: 'Large Language Models & Prompt Engineering',
        description: 'How LLMs work, the art and science of prompt engineering, few-shot learning, chain-of-thought, and system prompt design.',
        content: `# LLMs & Prompt Engineering

## Learning Objectives
- Understand transformer architecture at a conceptual level
- Apply prompt engineering techniques: zero-shot, few-shot, chain-of-thought, self-consistency
- Design system prompts for specific personas and constraints
- Use OpenAI, Anthropic Claude, and open-source models (Llama, Mistral) via API
- Evaluate prompt effectiveness with quantitative metrics
- Understand token limits, context windows, and cost management`,
        duration_hours: 14,
        order_index: 1,
      },
      {
        title: 'Retrieval-Augmented Generation (RAG) Systems',
        description: 'Build knowledge-augmented AI systems: vector databases, embeddings, semantic search, and production RAG pipelines.',
        content: `# RAG Systems

## Learning Objectives
- Understand the limitations of LLMs (hallucination, knowledge cutoff)
- Generate and store text embeddings with OpenAI or Sentence Transformers
- Build a vector database with Pinecone, Weaviate, or pgvector
- Implement semantic search and hybrid search
- Build a complete RAG pipeline with LangChain or LlamaIndex
- Evaluate RAG quality (faithfulness, answer relevancy, context precision)

## Project: A document Q&A system over a custom knowledge base`,
        duration_hours: 16,
        order_index: 2,
      },
      {
        title: 'AI Agents & Tool Use',
        description: 'Building autonomous AI agents that plan, use tools, call APIs, browse the web, and complete multi-step tasks.',
        content: `# AI Agents & Tool Use

## Learning Objectives
- Understand the ReAct (Reason + Act) agent pattern
- Build agents with function calling / tool use (OpenAI, Claude API)
- Give agents access to: web search, code execution, database queries, APIs
- Implement multi-agent orchestration with LangGraph or AutoGen
- Handle agent reliability — retry logic, fallback, human-in-the-loop
- Build a production-ready customer support AI agent`,
        duration_hours: 16,
        order_index: 3,
      },
      {
        title: 'Process Automation with Python & AI',
        description: 'Automate repetitive tasks: web scraping, document processing, email handling, and Zapier/Make-style workflow automation.',
        content: `# Process Automation with Python & AI

## Learning Objectives
- Automate web interactions with Playwright (headless browser)
- Extract and process data from PDFs, Excel, Word with Python
- Parse emails and generate smart responses with AI
- Build automation workflows using Python scripts + scheduling (cron, APScheduler)
- Integrate with WhatsApp Business API, Google Workspace, Slack
- Calculate and present ROI of automation to business stakeholders`,
        duration_hours: 14,
        order_index: 4,
      },
      {
        title: 'Fine-tuning & Custom Model Training',
        description: 'When and how to fine-tune LLMs: dataset preparation, LoRA/QLoRA, evaluation, and cost-effective training on free GPU.',
        content: `# Fine-tuning & Custom Model Training

## Learning Objectives
- Decide when fine-tuning is needed vs. prompt engineering or RAG
- Prepare and curate a fine-tuning dataset (instruction format)
- Fine-tune a small LLM using LoRA/QLoRA on Google Colab
- Evaluate fine-tuned models vs. base models
- Push models to HuggingFace Hub
- Understand RLHF and DPO at a conceptual level`,
        duration_hours: 14,
        order_index: 5,
      },
      {
        title: 'MLOps: Deploying & Monitoring AI Systems',
        description: 'Productionising ML and AI: experiment tracking, model registry, deployment pipelines, drift detection, and cost management.',
        content: `# MLOps: Deploying & Monitoring AI Systems

## Learning Objectives
- Track experiments with MLflow or Weights & Biases
- Register and version models for reproducibility
- Build a model serving API with FastAPI + Gunicorn
- Implement A/B testing for model versions
- Detect data drift and model degradation in production
- Monitor API latency, token costs, and error rates with Grafana`,
        duration_hours: 14,
        order_index: 6,
      },
      {
        title: 'AI Product Development & Monetisation',
        description: 'From idea to paying customers: product strategy, building an AI wrapper SaaS, pricing models, and go-to-market in Nigeria.',
        content: `# AI Product Development & Monetisation

## Learning Objectives
- Identify viable AI product opportunities in the Nigerian market
- Build a Minimum Viable AI Product (MVAP) in 2 weeks
- Monetise with subscriptions, usage-based pricing, or enterprise contracts
- Integrate Paystack or Flutterwave for payment processing
- Market an AI product: content strategy, community, partnerships
- Present a product to investors / accelerator panels (pitch practice)

## Capstone: Launch a live AI product with at least 10 real users`,
        duration_hours: 16,
        order_index: 7,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 5 — PROFESSIONAL & CROSS-CUTTING (All Ages 16+)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    program: {
      name: 'Digital Skills & Tech Entrepreneurship',
      description:
        'The business and soft skills every technologist needs: digital marketing, content creation, freelancing, financial literacy, and pitching to investors. ' +
        'Can be taken alongside any technical program. Suitable for ages 16 and above. ' +
        '→ Best combined with any Tier 3–4 program to create a complete professional profile.',
      duration_weeks: 12,
      difficulty_level: 'beginner',
      price: 30000,
      max_students: 30,
      is_active: true,
    },
    courses: [
      {
        title: 'Digital Marketing Fundamentals',
        description: 'SEO, Google Ads, social media marketing, email campaigns, and analytics — how to grow a tech product or brand online.',
        content: `# Digital Marketing Fundamentals

## Learning Objectives
- Understand the digital marketing funnel (awareness → conversion → retention)
- Conduct keyword research and implement on-page SEO
- Set up and run a Google Ads or Meta Ads campaign with a small budget
- Build and segment an email list with Mailchimp or Brevo
- Interpret Google Analytics 4 reports
- Apply growth hacking tactics for early-stage tech products`,
        duration_hours: 10,
        order_index: 1,
      },
      {
        title: 'Content Creation & Social Media Strategy',
        description: 'Build an audience on LinkedIn, X (Twitter), Instagram, and TikTok — create content that converts followers to clients.',
        content: `# Content Creation & Social Media Strategy

## Learning Objectives
- Define a personal or brand content niche and voice
- Plan a 30-day content calendar
- Create text, image, short-form video, and carousel content efficiently
- Understand each platform's algorithm and best practices
- Repurpose long-form content into multiple short pieces
- Measure content performance and iterate`,
        duration_hours: 8,
        order_index: 2,
      },
      {
        title: 'Freelancing & Client Management',
        description: 'How to land your first tech client, write proposals, price your services, deliver projects, and build a sustainable freelance income.',
        content: `# Freelancing & Client Management

## Learning Objectives
- Set up profiles on Upwork, Fiverr, and LinkedIn
- Write winning proposals and project scope documents
- Price services correctly for the Nigerian and international market
- Manage client communication, revisions, and expectations
- Invoice professionally and follow up on payments
- Build a referral system from happy clients`,
        duration_hours: 8,
        order_index: 3,
      },
      {
        title: 'Financial Literacy for Techpreneurs',
        description: 'Manage money like a tech founder: budgeting, pricing products, understanding equity, reading financial statements, and tax basics in Nigeria.',
        content: `# Financial Literacy for Techpreneurs

## Learning Objectives
- Build a personal and business budget
- Understand unit economics: CAC, LTV, gross margin, burn rate
- Read a basic income statement and balance sheet
- Understand equity, dilution, and how startup funding works (pre-seed, seed, Series A)
- Register a business in Nigeria (CAC process, tax obligations)
- Open and use a business bank account`,
        duration_hours: 8,
        order_index: 4,
      },
      {
        title: 'Tech Entrepreneurship & Startup Pitching',
        description: 'Validate ideas, build a lean MVP, and pitch to investors — from the problem statement to a compelling 3-minute demo day pitch.',
        content: `# Tech Entrepreneurship & Startup Pitching

## Learning Objectives
- Validate a startup idea with 10 customer interviews in 1 week
- Build a Business Model Canvas for a tech startup
- Prioritise features for an MVP — what ships vs. what waits
- Write a clear, compelling investor pitch deck (12 slides)
- Practice and refine a 3-minute live pitch
- Understand Nigeria's tech ecosystem: VCs, accelerators, grants (Tony Elumelu, Seedstars)`,
        duration_hours: 10,
        order_index: 5,
      },
      {
        title: 'Communication, Leadership & Team Dynamics',
        description: 'Presentation skills, technical writing, managing remote teams, giving and receiving feedback, and working in agile teams.',
        content: `# Communication, Leadership & Team Dynamics

## Learning Objectives
- Structure and deliver compelling technical presentations
- Write clear technical documentation (README, API docs, design specs)
- Run effective meetings (agendas, decisions, action items)
- Give and receive constructive feedback using structured frameworks
- Understand agile/scrum: sprints, stand-ups, retrospectives
- Manage conflict constructively in team environments`,
        duration_hours: 8,
        order_index: 6,
      },
    ],
  },
];

// ─── SEED FUNCTION ─────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🚀 Rillcod Academy — Program & Course Catalog Seed\n');

  // ── WIPE EXISTING DATA ────────────────────────────────────────────────────
  console.log('🗑️  Removing existing courses and programs...');

  const { error: delCourses } = await supabase.from('courses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delCourses) { console.error('  ❌ Failed to delete courses:', delCourses.message); }
  else { console.log('  ✅ Existing courses removed'); }

  const { error: delPrograms } = await supabase.from('programs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delPrograms) { console.error('  ❌ Failed to delete programs:', delPrograms.message); }
  else { console.log('  ✅ Existing programs removed'); }

  console.log('');
  // ─────────────────────────────────────────────────────────────────────────

  console.log(`📚 Total Programs to seed: ${CATALOG.length}`);
  const totalCourses = CATALOG.reduce((n, p) => n + p.courses.length, 0);
  console.log(`📖 Total Courses to seed: ${totalCourses}\n`);

  let programsInserted = 0;
  let coursesInserted = 0;
  let errors = 0;

  for (const entry of CATALOG) {
    process.stdout.write(`  Program: "${entry.program.name}" ... `);

    // Insert program
    const { data: prog, error: progErr } = await supabase
      .from('programs')
      .insert(entry.program)
      .select('id')
      .single();

    if (progErr) {
      console.error(`\n    ❌ Failed: ${progErr.message}`);
      errors++;
      continue;
    }

    programsInserted++;
    console.log(`✅  (id: ${prog.id})`);

    // Insert courses linked to this program
    for (const course of entry.courses) {
      const { error: courseErr } = await supabase.from('courses').insert({
        ...course,
        program_id: prog.id,
        is_active: true,
      });

      if (courseErr) {
        console.error(`    ❌ Course "${course.title}": ${courseErr.message}`);
        errors++;
      } else {
        coursesInserted++;
        console.log(`      ↳ Course ${course.order_index}: ${course.title} ✓`);
      }
    }
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log(`✅  Programs inserted : ${programsInserted}`);
  console.log(`✅  Courses  inserted : ${coursesInserted}`);
  if (errors > 0) console.log(`❌  Errors            : ${errors}`);
  console.log('─'.repeat(60));
  console.log('\n✨  Done! Programs and courses are live on Rillcod Academy.\n');
  console.log('Next steps:');
  console.log('  • Open /dashboard/programs to review and reorder programs');
  console.log('  • Open /dashboard/courses  to add lessons to each course');
  console.log('  • Enable enrollment for students via /dashboard/students\n');
}

seed().catch(err => {
  console.error('\n💥  Fatal seed error:', err.message);
  process.exit(1);
});
