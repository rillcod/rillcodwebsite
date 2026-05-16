-- ============================================================================
-- QA Spine v1: Replace ALL placeholder topics with real curriculum-aligned content
-- Covers all 11 lanes × 108 weeks (lane 11 = 40 weeks) = 1,120 rows
-- Nigerian ICT/CS curriculum aligned — age-appropriate per grade & track
-- ============================================================================

-- Helper: expand (lane, year, term, topic_array[12]) → individual week rows
-- then UPDATE the existing platform_syllabus_week_template rows in-place.

WITH real_topics(lane, yr, tm, topics, subs) AS (
  VALUES

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 1 — Basic 1 · Young Innovator  (Ages 6-7, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: Computer Awareness
  (1, 1, 1, ARRAY[
    'What Is a Computer?',
    'Parts of a Computer: Monitor, Keyboard, Mouse',
    'Input and Output Devices',
    'Switching On and Shutting Down Safely',
    'Using the Mouse: Click, Double-Click, Drag',
    'The Desktop: Icons and Taskbar',
    'Opening and Closing Programs',
    'Using the Keyboard: Letter Keys',
    'Typing My Name and Simple Words',
    'Introduction to Paint: Drawing Lines',
    'Saving My Work to a Folder',
    'Computer Awareness Quiz and Revision'
  ], ARRAY['Identify computer parts','Practise safe start-up/shutdown','Navigate desktop icons']),

  -- Y1 Term 2: Digital Creativity
  (1, 1, 2, ARRAY[
    'Drawing Shapes in Paint',
    'Colouring and Fill Tools',
    'Creating a Picture: My Family',
    'Using the Eraser and Undo',
    'Stamps and Stickers in Paint',
    'Designing a Birthday Card',
    'Creating Patterns with Shapes',
    'Typing Short Sentences',
    'Changing Text Size and Colour',
    'Combining Drawing and Text',
    'Printing My Artwork',
    'Digital Art Gallery Showcase'
  ], ARRAY['Use paint tools creatively','Combine text and images','Print documents']),

  -- Y1 Term 3: Early Problem Solving
  (1, 1, 3, ARRAY[
    'What Is a Sequence? Step-by-Step Instructions',
    'Following Directions: Left, Right, Forward',
    'Maze Puzzles on the Computer',
    'Pattern Recognition Activities',
    'Sorting and Classifying Games',
    'Introduction to ScratchJr',
    'Moving a Character in ScratchJr',
    'Adding Backgrounds in ScratchJr',
    'Making Characters Talk in ScratchJr',
    'Repeating Actions: Simple Loops',
    'My First ScratchJr Story',
    'Year 1 Showcase and Certificate'
  ], ARRAY['Follow step-by-step sequences','Recognise patterns','Animate a ScratchJr character']),

  -- Y2 Term 1: File Management and Typing
  (1, 2, 1, ARRAY[
    'Review: Computer Parts and Their Jobs',
    'Creating and Naming Folders',
    'Saving Files in the Right Folder',
    'Copying, Moving, and Deleting Files',
    'Home Row Keys: Correct Finger Placement',
    'Typing Practice: Left Hand Keys',
    'Typing Practice: Right Hand Keys',
    'Introduction to Word Processing',
    'Typing a Short Paragraph',
    'Changing Font Style and Size',
    'Making Text Bold, Italic, and Underlined',
    'Creating My First Document'
  ], ARRAY['Organise digital files','Position fingers on home row','Format a basic document']),

  -- Y2 Term 2: Digital Stories
  (1, 2, 2, ARRAY[
    'What Is a Digital Story?',
    'Planning a Story: Beginning, Middle, End',
    'Drawing Story Characters on Computer',
    'Adding Text to Pictures',
    'ScratchJr: Animating Story Characters',
    'ScratchJr: Adding Sound Effects',
    'ScratchJr: Creating Multiple Scenes',
    'ScratchJr: Character Conversations',
    'Recording My Voice for a Story',
    'Adding Background Music',
    'Presenting My Digital Story to Class',
    'Digital Story Showcase Day'
  ], ARRAY['Plan a narrative structure','Combine animation and audio','Present a creative project']),

  -- Y2 Term 3: Internet Awareness
  (1, 2, 3, ARRAY[
    'What Is the Internet?',
    'Websites We Use for Learning',
    'How to Open a Web Browser',
    'Typing a Web Address (URL)',
    'Internet Safety: Rules for Young Users',
    'Keeping Passwords Secret',
    'Being Kind Online: Digital Manners',
    'Searching for Information Safely',
    'Watching Educational Videos Online',
    'What Not to Share on the Internet',
    'Creating an Internet Safety Poster',
    'Year 2 Certificate and Reflection'
  ], ARRAY['Navigate a web browser','Follow internet safety rules','Search for information responsibly']),

  -- Y3 Term 1: Scratch Programming Basics
  (1, 3, 1, ARRAY[
    'Welcome to Scratch: Interface Tour',
    'The Stage, Sprites, and Block Palette',
    'Motion Blocks: Moving a Sprite',
    'Looks Blocks: Changing Costumes',
    'Sound Blocks: Playing Audio',
    'Events: When Green Flag Clicked',
    'Control: Repeat Loops',
    'Control: Wait and Timing',
    'Creating a Simple Animation',
    'Designing Custom Sprites',
    'Multi-Sprite Interactions',
    'My First Scratch Animation Project'
  ], ARRAY['Navigate the Scratch interface','Use motion, looks, and sound blocks','Create a multi-sprite animation']),

  -- Y3 Term 2: Scratch Game Design
  (1, 3, 2, ARRAY[
    'What Makes a Good Game?',
    'Designing Game Characters and Rules',
    'Arrow Key Movement Controls',
    'Adding a Score Variable',
    'Creating Obstacles and Boundaries',
    'Catching Game: Clone and Touch Sensing',
    'Adding Sound Effects to Games',
    'Testing and Debugging Your Game',
    'Racing Game Project Sprint',
    'Adding Levels and Difficulty',
    'Game Instructions and Polish',
    'Game Showcase: Play Each Other''s Games'
  ], ARRAY['Design game mechanics','Use variables for scoring','Debug and test a Scratch game']),

  -- Y3 Term 3: Presentations and Capstone
  (1, 3, 3, ARRAY[
    'What Is a Presentation?',
    'Creating Slides in Google Slides',
    'Adding Text and Titles to Slides',
    'Inserting Images into Slides',
    'Slide Transitions and Animations',
    'Presenting: My Favourite Topic',
    'Combining Skills: Drawing, Typing, and Code',
    'Capstone Project: Choosing My Theme',
    'Capstone Project: Building Part 1',
    'Capstone Project: Building Part 2',
    'Capstone Project: Final Polish',
    'Year 3 Graduation Presentation'
  ], ARRAY['Build a slide presentation','Combine digital skills in a project','Present work confidently']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 2 — Basic 2 · Young Innovator  (Ages 7-8, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: Computer Skills Mastery
  (2, 1, 1, ARRAY[
    'Input vs Output Devices Review',
    'Storage Devices: USB, Hard Drive, Cloud',
    'File Types: Documents, Images, Audio, Video',
    'Advanced Folder Organisation',
    'Keyboard Shortcuts: Copy, Paste, Undo',
    'Touch Typing: Top Row Keys',
    'Touch Typing: Bottom Row Keys',
    'Word Processing: Writing a Letter',
    'Formatting Paragraphs and Alignment',
    'Inserting Clip Art and Images',
    'Page Layout and Margins',
    'Computer Skills Assessment'
  ], ARRAY['Classify device types','Use keyboard shortcuts efficiently','Format a multi-paragraph letter']),

  -- Y1 Term 2: Digital Art and Design
  (2, 1, 2, ARRAY[
    'Advanced Paint: Brushes and Effects',
    'Drawing with Layers and Transparency',
    'Designing a School Event Poster',
    'Creating an Invitation Card',
    'Introduction to Canva for Kids',
    'Using Design Templates',
    'Adding Stickers, Icons, and Frames',
    'Designing a Book Cover',
    'Basic Photo Editing: Crop and Resize',
    'Creating a Four-Panel Comic Strip',
    'Preparing a Digital Art Exhibition',
    'Digital Art Showcase Day'
  ], ARRAY['Use advanced drawing tools','Design with templates','Edit and crop images']),

  -- Y1 Term 3: Scratch Adventures
  (2, 1, 3, ARRAY[
    'Scratch Review: Blocks and Sprites',
    'Variables in Scratch: Score and Timer',
    'Broadcasting Messages Between Sprites',
    'Sprite Communication and Coordination',
    'Cloning Sprites for Multiple Objects',
    'Random Numbers in Games',
    'Creating a Quiz Game in Scratch',
    'Adding a Countdown Timer',
    'Pen Extension: Drawing Geometric Patterns',
    'Music Extension: Creating Beats',
    'Interactive Story with Choices',
    'Scratch Portfolio Review'
  ], ARRAY['Use variables and clones','Broadcast messages between sprites','Create interactive narratives']),

  -- Y2 Term 1: Data and Spreadsheets
  (2, 2, 1, ARRAY[
    'What Is Data? Information Around Us',
    'Collecting Data: Surveys and Tallies',
    'Introduction to Spreadsheets',
    'Entering Data into Cells',
    'Using AutoFill for Number Sequences',
    'Basic Formulas: SUM and AVERAGE',
    'Conducting a Class Survey',
    'Creating a Bar Chart from Data',
    'Creating a Pie Chart',
    'Reading and Interpreting Charts',
    'Data Project: Our School in Numbers',
    'Data Skills Assessment'
  ], ARRAY['Collect and enter data','Use SUM and AVERAGE formulas','Create and interpret charts']),

  -- Y2 Term 2: Multimedia Creation
  (2, 2, 2, ARRAY[
    'What Is Multimedia?',
    'Recording Audio with a Microphone',
    'Editing Audio: Trim, Volume, Effects',
    'Photography: Composition and Framing',
    'Editing Photos: Crop, Brightness, Filters',
    'Creating a Photo Slideshow',
    'Adding Transitions and Timing to Slides',
    'What Makes a Good Video?',
    'Stop-Motion Animation Concepts',
    'Creating a Stop-Motion Clip',
    'Combining Media in a Presentation',
    'Multimedia Showcase Day'
  ], ARRAY['Record and edit audio','Create a stop-motion animation','Combine media types in presentations']),

  -- Y2 Term 3: Digital Citizenship
  (2, 2, 3, ARRAY[
    'Review: Internet Safety Essentials',
    'Creating Strong Passwords',
    'Recognising Unsafe Websites and Links',
    'Cyberbullying: What It Is and How to Respond',
    'Your Digital Footprint: What You Leave Online',
    'Research Skills: Choosing Good Keywords',
    'Evaluating Website Reliability',
    'Taking Notes from Online Sources',
    'Giving Credit: Citing Sources',
    'Research Project: Famous Nigerian Innovators',
    'Presenting Research Findings',
    'Digital Citizenship Certificate'
  ], ARRAY['Create strong passwords','Evaluate online sources','Conduct and present research']),

  -- Y3 Term 1: Advanced Scratch Programming
  (2, 3, 1, ARRAY[
    'Custom Blocks: Creating Your Own Functions',
    'Using Lists to Store Collections',
    'String Operations: Join, Length, Letter Of',
    'Building a Vocabulary Quiz App',
    'Nested Loops: Patterns and Grids',
    'Complex Conditionals: And, Or, Not',
    'Advanced Game Mechanics: Health and Lives',
    'Simulating Physics: Gravity and Bounce',
    'Multiplayer Concepts: Two-Player Games',
    'Platformer Game Design Document',
    'Platformer Game: Build Sprint',
    'Game Testing, Feedback, and Refinement'
  ], ARRAY['Define custom blocks (functions)','Use lists for data storage','Build games with complex logic']),

  -- Y3 Term 2: Introduction to Algorithms
  (2, 3, 2, ARRAY[
    'What Is an Algorithm?',
    'Writing Precise Step-by-Step Instructions',
    'Flowcharts: Start, Process, Decision, End',
    'Decision Branching in Flowcharts',
    'Sorting Algorithms: Bubble Sort Visualised',
    'Searching Algorithms: Linear Search',
    'Debugging: Systematic Error Finding',
    'Algorithm Efficiency: Faster vs Slower',
    'Real-World Algorithms: Recipes and Maps',
    'Algorithm Challenge: Plan a School Event',
    'Coding an Algorithm in Scratch',
    'Algorithm Skills Assessment'
  ], ARRAY['Draw and interpret flowcharts','Understand sorting and searching','Debug programs systematically']),

  -- Y3 Term 3: Portfolio and Capstone
  (2, 3, 3, ARRAY[
    'What Is a Digital Portfolio?',
    'Selecting Your Best Work Samples',
    'Writing Project Descriptions and Reflections',
    'Presentation Design: Visual Tips',
    'Public Speaking Skills for Tech Demos',
    'Capstone Project: Writing a Proposal',
    'Capstone: Research and Design Phase',
    'Capstone: Build Phase 1',
    'Capstone: Build Phase 2',
    'Capstone: Testing, Debugging, and Polish',
    'Capstone Presentation Day',
    'Year 3 Graduation and Certificate Ceremony'
  ], ARRAY['Curate a digital portfolio','Plan and execute a capstone project','Deliver a confident tech presentation']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 3 — Basic 3 · Young Innovator  (Ages 8-9, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: Advanced Computing Concepts
  (3, 1, 1, ARRAY[
    'How Computers Process Information (CPU, RAM)',
    'Binary Basics: How Computers Count',
    'Operating Systems: What They Do',
    'Networks: How Computers Talk to Each Other',
    'The Internet vs the World Wide Web',
    'Cloud Storage: Saving Online',
    'Advanced File Management: Zip and Extract',
    'Keyboard Mastery: Speed and Accuracy',
    'Word Processing: Tables and Columns',
    'Document Templates: Reports and Newsletters',
    'Collaborative Documents: Shared Editing',
    'Computing Concepts Assessment'
  ], ARRAY['Explain CPU and RAM roles','Understand binary number basics','Collaborate on shared documents']),

  -- Y1 Term 2: Scratch Game Design Studio
  (3, 1, 2, ARRAY[
    'Game Design Principles: Fun and Challenge',
    'Character Design and Sprite Animation',
    'Scrolling Backgrounds in Scratch',
    'Collision Detection and Response',
    'Power-Ups and Collectibles',
    'Enemy AI: Simple Chase Behaviour',
    'Score Systems: High Score with Cloud Variables',
    'Sound Design: Background Music and Effects',
    'Level Design: Progressive Difficulty',
    'User Interface: Start Screen and Game Over',
    'Playtesting and Iterating on Feedback',
    'Game Design Studio Showcase'
  ], ARRAY['Design game levels with increasing difficulty','Implement collision detection','Create start screens and UI elements']),

  -- Y1 Term 3: Data Visualisation
  (3, 1, 3, ARRAY[
    'Types of Data: Qualitative vs Quantitative',
    'Designing a Good Survey Question',
    'Spreadsheet Formulas: COUNT, MIN, MAX',
    'Conditional Formatting in Spreadsheets',
    'Creating Line Graphs for Trends',
    'Scatter Plots: Finding Relationships',
    'Infographics: Visual Data Storytelling',
    'Data Project: Weather Patterns in Nigeria',
    'Data Project: Class Fitness Tracker',
    'Presenting Data Findings to an Audience',
    'Data Ethics: Privacy and Consent',
    'Data Visualisation Skills Assessment'
  ], ARRAY['Use COUNT, MIN, MAX formulas','Create infographics from data','Consider data privacy and ethics']),

  -- Y2 Term 1: Computational Thinking
  (3, 2, 1, ARRAY[
    'Decomposition: Breaking Problems into Parts',
    'Pattern Recognition: Spotting Similarities',
    'Abstraction: Focusing on What Matters',
    'Algorithm Design: Planning Solutions',
    'Scratch: Decomposing a Complex Animation',
    'Scratch: Reusable Custom Blocks',
    'Scratch: Efficient Code with Functions',
    'Debugging Strategies: Trace and Test',
    'Logical Reasoning: Truth Tables',
    'Computational Thinking in Everyday Life',
    'Challenge: Solve a Real School Problem',
    'Computational Thinking Assessment'
  ], ARRAY['Decompose complex problems','Abstract key features from details','Apply computational thinking daily']),

  -- Y2 Term 2: Advanced Multimedia Production
  (3, 2, 2, ARRAY[
    'Video Planning: Storyboards and Scripts',
    'Recording Video: Framing and Lighting',
    'Video Editing: Cuts, Transitions, Titles',
    'Adding Voiceover and Background Music',
    'Green Screen Basics: Chroma Key',
    'Podcast Creation: Planning and Recording',
    'Podcast Editing: Intro, Segments, Outro',
    'Animation: Frame-by-Frame Technique',
    'Animation: Tweening and Motion Paths',
    'Creating a Short Documentary',
    'Multimedia Project: Nigerian Culture Showcase',
    'Film Festival: Screening and Feedback'
  ], ARRAY['Plan videos with storyboards','Edit video with transitions and titles','Create a short documentary']),

  -- Y2 Term 3: Web Awareness and HTML Preview
  (3, 2, 3, ARRAY[
    'How Websites Work: Browser and Server',
    'Exploring Website Source Code (View Source)',
    'What Is HTML? Tags and Elements',
    'Writing Your First HTML Page',
    'Headings, Paragraphs, and Line Breaks',
    'Adding Images to a Web Page',
    'Creating Hyperlinks',
    'What Is CSS? Styling a Page',
    'Changing Colours and Fonts with CSS',
    'Website Project: My Personal Page',
    'Website Project: Polish and Publish',
    'Web Awareness Certificate'
  ], ARRAY['Explain how websites work','Write basic HTML tags','Style a page with CSS colours and fonts']),

  -- Y3 Term 1: Introduction to Text-Based Coding
  (3, 3, 1, ARRAY[
    'From Blocks to Text: Why Learn to Type Code?',
    'Introduction to Python: Print and Run',
    'Variables: Storing Information',
    'Data Types: Strings, Integers, Floats',
    'User Input: Asking Questions',
    'Simple Calculations with Python',
    'Comparison Operators: Equal, Greater, Less',
    'If Statements: Making Decisions',
    'If-Else: Two Paths',
    'While Loops: Repeating Until Done',
    'For Loops: Counting Repetitions',
    'Text Coding Skills Assessment'
  ], ARRAY['Write and run Python print statements','Use variables and input','Write if/else conditions and loops']),

  -- Y3 Term 2: Problem-Solving Challenges
  (3, 3, 2, ARRAY[
    'Functions: Reusable Code Blocks',
    'Parameters and Return Values',
    'String Methods: Upper, Lower, Replace',
    'Lists: Storing Multiple Items',
    'Looping Through Lists',
    'Challenge: Number Guessing Game',
    'Challenge: Simple Calculator',
    'Challenge: Password Checker',
    'Challenge: Multiplication Table Generator',
    'Challenge: Word Counter',
    'Pair Programming: Collaborative Coding',
    'Problem-Solving Showcase'
  ], ARRAY['Define functions with parameters','Manipulate strings and lists','Solve coding challenges independently']),

  -- Y3 Term 3: Graduation Capstone
  (3, 3, 3, ARRAY[
    'Choosing a Capstone: Scratch, Python, or Web',
    'Project Planning: Requirements Document',
    'Design Phase: Wireframes or Flowcharts',
    'Build Sprint 1: Core Features',
    'Build Sprint 2: Additional Features',
    'Build Sprint 3: User Interface Polish',
    'Testing: Finding and Fixing Bugs',
    'Documentation: Writing a User Guide',
    'Rehearsing Your Presentation',
    'Capstone Showcase: Live Demos',
    'Peer Review and Feedback Session',
    'Graduation Ceremony and Certificates'
  ], ARRAY['Plan and manage a multi-week project','Write user documentation','Present a polished capstone project']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 4 — Basic 4 · Python Track  (Ages 9-10, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: Python Foundations
  (4, 1, 1, ARRAY[
    'Setting Up Python: Install and IDLE',
    'Your First Program: print() and Hello World',
    'Variables: Naming and Assigning Values',
    'Data Types: Strings, Integers, Floats',
    'Arithmetic Operators: Add, Subtract, Multiply, Divide',
    'String Concatenation and Repetition',
    'User Input with input() Function',
    'Type Conversion: int(), float(), str()',
    'Comments: Documenting Your Code',
    'Mini Project: Personal Greeting Program',
    'Mini Project: Simple Calculator',
    'Python Foundations Quiz'
  ], ARRAY['Install Python and use IDLE','Declare variables and use data types','Accept user input and perform calculations']),

  -- Y1 Term 2: Control Flow
  (4, 1, 2, ARRAY[
    'Boolean Values: True and False',
    'Comparison Operators: ==, !=, <, >, <=, >=',
    'if Statements: Single Condition',
    'if-else: Two Branches',
    'if-elif-else: Multiple Conditions',
    'Logical Operators: and, or, not',
    'Nested Conditions',
    'while Loops: Repeat Until a Condition',
    'Avoiding Infinite Loops',
    'for Loops and range() Function',
    'Loop Control: break and continue',
    'Control Flow Project: Adventure Story Game'
  ], ARRAY['Write conditional statements','Use logical operators','Control program flow with loops']),

  -- Y1 Term 3: Functions and Strings
  (4, 1, 3, ARRAY[
    'What Are Functions? Why Use Them?',
    'Defining Functions with def',
    'Parameters and Arguments',
    'Return Values',
    'Scope: Local vs Global Variables',
    'String Indexing and Slicing',
    'String Methods: upper(), lower(), strip(), replace()',
    'String Formatting with f-strings',
    'Searching in Strings: find() and in',
    'Mini Project: Madlibs Word Game',
    'Mini Project: Name Badge Generator',
    'Functions and Strings Assessment'
  ], ARRAY['Define and call functions','Use parameters and return values','Manipulate strings with built-in methods']),

  -- Y2 Term 1: Lists and Dictionaries
  (4, 2, 1, ARRAY[
    'Lists: Creating and Accessing Items',
    'List Methods: append, insert, remove, pop',
    'Looping Through Lists with for',
    'List Comprehensions',
    'Sorting and Reversing Lists',
    'Nested Lists: Tables and Grids',
    'Tuples: Immutable Sequences',
    'Dictionaries: Key-Value Pairs',
    'Accessing and Modifying Dictionary Values',
    'Looping Through Dictionaries',
    'Mini Project: Contact Book Application',
    'Lists and Dictionaries Assessment'
  ], ARRAY['Create and manipulate lists','Use list comprehensions','Store and retrieve data with dictionaries']),

  -- Y2 Term 2: File Handling and Modules
  (4, 2, 2, ARRAY[
    'Reading Text Files: open() and read()',
    'Writing to Text Files: write() and append',
    'The with Statement for Safe File Handling',
    'Reading CSV Files Line by Line',
    'Error Handling: try, except, finally',
    'Common Exceptions: ValueError, FileNotFoundError',
    'Importing Modules: math, random, datetime',
    'The random Module: Choices and Ranges',
    'The datetime Module: Dates and Time',
    'Creating Your Own Module',
    'Mini Project: Daily Journal Program',
    'File Handling and Modules Assessment'
  ], ARRAY['Read and write text files','Handle errors with try/except','Import and use standard library modules']),

  -- Y2 Term 3: Turtle Graphics and Projects
  (4, 2, 3, ARRAY[
    'Introduction to Turtle Graphics',
    'Moving and Turning: forward, right, left',
    'Drawing Shapes: Squares, Triangles, Circles',
    'Pen Colour, Fill Colour, and Pen Size',
    'Loops for Geometric Patterns',
    'Functions for Reusable Drawings',
    'Drawing a Nigerian Flag with Turtle',
    'Spirograph Patterns: Loops and Angles',
    'Interactive Turtle: Keyboard Input',
    'Mini Project: Turtle Art Gallery',
    'Mini Project: Simple Turtle Game',
    'Turtle Graphics Showcase'
  ], ARRAY['Draw shapes with Turtle graphics','Create patterns using loops','Build interactive Turtle programs']),

  -- Y3 Term 1: Object-Oriented Basics
  (4, 3, 1, ARRAY[
    'What Is Object-Oriented Programming?',
    'Classes and Objects: Blueprint Analogy',
    'Defining a Class with __init__',
    'Instance Attributes and Methods',
    'Creating Multiple Objects from a Class',
    'The self Parameter Explained',
    'Class Methods and Static Methods',
    'Inheritance: Parent and Child Classes',
    'Overriding Methods in Child Classes',
    'Encapsulation: Public vs Private',
    'OOP Project: Pet Management System',
    'Object-Oriented Programming Assessment'
  ], ARRAY['Define classes with attributes and methods','Use inheritance to extend classes','Apply encapsulation principles']),

  -- Y3 Term 2: Data Structures and Algorithms
  (4, 3, 2, ARRAY[
    'Algorithm Complexity: Counting Steps',
    'Linear Search Implementation',
    'Binary Search Implementation',
    'Bubble Sort: Step-by-Step',
    'Selection Sort: Finding the Minimum',
    'Comparing Sort Algorithm Efficiency',
    'Stacks: Last-In, First-Out',
    'Queues: First-In, First-Out',
    'Recursion: Functions Calling Themselves',
    'Recursive Factorial and Fibonacci',
    'Challenge: Palindrome Checker',
    'Data Structures and Algorithms Assessment'
  ], ARRAY['Implement search algorithms','Code sorting algorithms','Use stacks, queues, and recursion']),

  -- Y3 Term 3: Final Python Projects
  (4, 3, 3, ARRAY[
    'Project Planning: Requirements and Scope',
    'Designing with Flowcharts and Pseudocode',
    'Project: Quiz Game with Score Tracking',
    'Project: Expense Tracker with File Storage',
    'Project: Student Grade Calculator',
    'Project: Text-Based RPG Adventure',
    'Code Review: Reading Each Other''s Code',
    'Refactoring: Making Code Cleaner',
    'Testing: Writing Test Cases',
    'Documentation: README and Comments',
    'Final Project Polish and Submission',
    'Python Track Graduation Showcase'
  ], ARRAY['Plan a complete software project','Review and refactor code','Write documentation and tests']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 5 — Basic 4 · HTML/CSS Track  (Ages 9-10, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: HTML Foundations
  (5, 1, 1, ARRAY[
    'What Is the Web? Browsers and Servers',
    'HTML: The Language of Web Pages',
    'Your First HTML Page: Doctype, Head, Body',
    'Headings: h1 Through h6',
    'Paragraphs and Line Breaks',
    'Bold, Italic, and Emphasis Tags',
    'Ordered and Unordered Lists',
    'Nested Lists',
    'HTML Comments and Code Organisation',
    'Special Characters and Entities',
    'Mini Project: About Me Page',
    'HTML Foundations Quiz'
  ], ARRAY['Write valid HTML document structure','Use headings, paragraphs, and lists','Organise code with comments']),

  -- Y1 Term 2: Links, Images, and Tables
  (5, 1, 2, ARRAY[
    'Hyperlinks: Linking Pages Together',
    'Linking to External Websites',
    'Opening Links in New Tabs',
    'Adding Images: img Tag and Attributes',
    'Image Sizing: Width and Height',
    'Alt Text for Accessibility',
    'HTML Tables: Rows and Cells',
    'Table Headers and Captions',
    'Spanning Rows and Columns',
    'Building a Class Timetable in HTML',
    'Mini Project: Nigerian States Guide',
    'Links, Images, and Tables Assessment'
  ], ARRAY['Create hyperlinks between pages','Add and size images accessibly','Build data tables with headers']),

  -- Y1 Term 3: CSS Basics
  (5, 1, 3, ARRAY[
    'What Is CSS? Separating Style from Structure',
    'Inline, Internal, and External CSS',
    'CSS Selectors: Element, Class, ID',
    'Colour Properties: color and background-color',
    'Colour Values: Named, HEX, and RGB',
    'Font Properties: Family, Size, Weight',
    'Text Properties: Alignment, Decoration, Transform',
    'Backgrounds: Colour, Image, and Repeat',
    'Borders: Width, Style, Colour, Radius',
    'Margin and Padding Basics',
    'Mini Project: Styled Recipe Page',
    'CSS Basics Assessment'
  ], ARRAY['Link an external CSS stylesheet','Use colour, font, and text properties','Apply margin, padding, and borders']),

  -- Y2 Term 1: CSS Layout and Box Model
  (5, 2, 1, ARRAY[
    'The CSS Box Model: Content, Padding, Border, Margin',
    'Box Sizing: content-box vs border-box',
    'Display Property: Block, Inline, Inline-Block',
    'Width, Height, and Overflow',
    'Centring Elements with margin: auto',
    'CSS Float and Clear',
    'Position Property: Static, Relative, Absolute, Fixed',
    'Z-Index: Layering Elements',
    'Building a Simple Navigation Bar',
    'Multi-Column Layouts with Float',
    'Mini Project: News Article Layout',
    'CSS Layout Assessment'
  ], ARRAY['Explain the CSS box model','Position elements with CSS','Build multi-column page layouts']),

  -- Y2 Term 2: Forms and Semantic HTML
  (5, 2, 2, ARRAY[
    'HTML5 Semantic Elements: header, nav, main, footer',
    'Section, Article, and Aside',
    'HTML Forms: form Tag and action',
    'Input Types: Text, Email, Password, Number',
    'Labels and Placeholder Text',
    'Textarea and Select Dropdowns',
    'Radio Buttons and Checkboxes',
    'Form Validation: required and pattern',
    'Styling Forms with CSS',
    'Accessibility: ARIA Labels and Roles',
    'Mini Project: School Registration Form',
    'Forms and Semantic HTML Assessment'
  ], ARRAY['Use HTML5 semantic elements','Build accessible forms with validation','Style form elements with CSS']),

  -- Y2 Term 3: Mini Website Projects
  (5, 2, 3, ARRAY[
    'Planning a Multi-Page Website',
    'Site Structure: Navigation and Linking',
    'Consistent Styling with Shared CSS',
    'Hero Sections and Call-to-Action Buttons',
    'Image Galleries: Grid of Thumbnails',
    'Contact Page with a Styled Form',
    'Google Fonts: Adding Custom Typography',
    'Favicon and Page Titles',
    'Website Project: My School Website (Design)',
    'Website Project: My School Website (Build)',
    'Website Project: Testing and Polish',
    'Mini Website Showcase'
  ], ARRAY['Plan and build a multi-page website','Use Google Fonts for typography','Create hero sections and image galleries']),

  -- Y3 Term 1: Responsive Design
  (5, 3, 1, ARRAY[
    'What Is Responsive Design?',
    'Viewport Meta Tag',
    'Relative Units: %, em, rem, vw, vh',
    'Media Queries: Breakpoints for Mobile and Desktop',
    'Mobile-First vs Desktop-First Approach',
    'Introduction to Flexbox: Display Flex',
    'Flex Direction, Justify Content, Align Items',
    'Flex Wrap and Flex Grow/Shrink',
    'Building a Responsive Navigation',
    'Responsive Image Techniques',
    'Mini Project: Responsive Landing Page',
    'Responsive Design Assessment'
  ], ARRAY['Use media queries for breakpoints','Build layouts with Flexbox','Create mobile-friendly navigation']),

  -- Y3 Term 2: CSS Animations and Grid
  (5, 3, 2, ARRAY[
    'CSS Transitions: Property, Duration, Timing',
    'Hover Effects and Interactive States',
    'CSS Transforms: Scale, Rotate, Translate',
    'Keyframe Animations: @keyframes',
    'Animation Properties: Duration, Delay, Iteration',
    'Introduction to CSS Grid',
    'Grid Template: Rows, Columns, and Areas',
    'Grid Gap and Alignment',
    'Grid vs Flexbox: When to Use Each',
    'Building a Dashboard Layout with Grid',
    'Mini Project: Animated Portfolio Card',
    'CSS Animations and Grid Assessment'
  ], ARRAY['Create CSS transitions and hover effects','Animate elements with @keyframes','Build complex layouts with CSS Grid']),

  -- Y3 Term 3: Portfolio Website Capstone
  (5, 3, 3, ARRAY[
    'Portfolio Planning: Content and Structure',
    'Designing Wireframes for Your Portfolio',
    'Portfolio Build: Home Page with Hero',
    'Portfolio Build: About Me Section',
    'Portfolio Build: Projects Gallery',
    'Portfolio Build: Skills and Contact Form',
    'Portfolio Build: Responsive Mobile Version',
    'Adding Animations and Micro-Interactions',
    'Cross-Browser Testing',
    'Performance: Optimising Images and Code',
    'Portfolio Review and Peer Feedback',
    'HTML/CSS Track Graduation Showcase'
  ], ARRAY['Design and wireframe a full portfolio','Optimise for performance and compatibility','Showcase web development skills professionally']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 6 — Basic 5 · Python Track  (Ages 10-11, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: Python Review and Advanced Functions
  (6, 1, 1, ARRAY[
    'Python Refresher: Variables, Types, and Operators',
    'Control Flow Review: if/elif/else and Loops',
    'Functions Review: def, Parameters, Return',
    'Default Parameters and Keyword Arguments',
    'Variable-Length Arguments: *args and **kwargs',
    'Lambda Functions: One-Line Functions',
    'Higher-Order Functions: map, filter, sorted',
    'List Comprehensions: Advanced Patterns',
    'Dictionary Comprehensions',
    'Generator Expressions and yield',
    'Decorators: Basics and Use Cases',
    'Advanced Functions Assessment'
  ], ARRAY['Use *args, **kwargs, and lambda','Apply map, filter, and comprehensions','Understand generators and decorators']),

  -- Y1 Term 2: Error Handling and Debugging
  (6, 1, 2, ARRAY[
    'Exception Types: ValueError, TypeError, KeyError',
    'try/except/else/finally Patterns',
    'Raising Custom Exceptions',
    'Assertions for Debugging',
    'The Python Debugger: pdb Basics',
    'Logging: print vs logging Module',
    'Log Levels: DEBUG, INFO, WARNING, ERROR',
    'Unit Testing with unittest',
    'Writing Test Cases: assertEqual, assertTrue',
    'Test-Driven Development Concepts',
    'Code Review Best Practices',
    'Error Handling and Debugging Assessment'
  ], ARRAY['Handle exceptions gracefully','Use the logging module','Write unit tests with unittest']),

  -- Y1 Term 3: Working with APIs
  (6, 1, 3, ARRAY[
    'What Is an API? Real-World Analogy',
    'JSON Format: Reading and Writing',
    'The json Module: loads and dumps',
    'HTTP Basics: GET and POST Requests',
    'The requests Library: Installation and GET',
    'Parsing API Responses',
    'API Keys and Authentication',
    'Building a Weather App with OpenWeather API',
    'Building a Currency Converter',
    'Rate Limiting and Error Handling in APIs',
    'Mini Project: Nigerian News Headlines Fetcher',
    'Working with APIs Assessment'
  ], ARRAY['Parse and create JSON data','Make HTTP requests with the requests library','Build applications using public APIs']),

  -- Y2 Term 1: Data Analysis Basics
  (6, 2, 1, ARRAY[
    'Introduction to Data Analysis with Python',
    'Installing and Importing Pandas',
    'Series and DataFrames: Core Data Structures',
    'Reading CSV Files into DataFrames',
    'Exploring Data: head, tail, describe, info',
    'Selecting Columns and Filtering Rows',
    'Sorting and Ranking Data',
    'Handling Missing Values: dropna, fillna',
    'GroupBy: Aggregating Data by Category',
    'Pivot Tables and Cross-Tabulation',
    'Mini Project: Analysing Nigerian Population Data',
    'Data Analysis Basics Assessment'
  ], ARRAY['Load and explore datasets with Pandas','Filter, sort, and group data','Handle missing values in datasets']),

  -- Y2 Term 2: Data Visualisation with Matplotlib
  (6, 2, 2, ARRAY[
    'Introduction to Matplotlib',
    'Line Charts: Trends Over Time',
    'Bar Charts: Comparing Categories',
    'Horizontal Bar Charts',
    'Pie Charts: Proportions and Percentages',
    'Scatter Plots: Correlations',
    'Histograms: Data Distribution',
    'Customising Charts: Titles, Labels, Colours',
    'Multiple Subplots on One Figure',
    'Saving Charts as Image Files',
    'Mini Project: Nigerian Economic Data Dashboard',
    'Data Visualisation Assessment'
  ], ARRAY['Create various chart types with Matplotlib','Customise chart appearance','Build multi-chart data dashboards']),

  -- Y2 Term 3: Database Basics with SQLite
  (6, 2, 3, ARRAY[
    'What Is a Database? Tables, Rows, Columns',
    'Introduction to SQL: SELECT Queries',
    'WHERE Clause: Filtering Records',
    'INSERT: Adding New Records',
    'UPDATE and DELETE: Modifying Data',
    'Python sqlite3 Module: Connecting to a Database',
    'Creating Tables from Python',
    'CRUD Operations from Python Code',
    'JOIN Queries: Combining Tables',
    'Aggregate Functions: COUNT, SUM, AVG',
    'Mini Project: School Library Database',
    'Database Basics Assessment'
  ], ARRAY['Write SQL queries for CRUD operations','Connect Python to SQLite databases','Use JOINs and aggregate functions']),

  -- Y3 Term 1: Web Scraping and Automation
  (6, 3, 1, ARRAY[
    'What Is Web Scraping? Legal and Ethical Considerations',
    'HTML Structure Review for Scraping',
    'Beautiful Soup: Installation and Setup',
    'Parsing HTML: find and find_all',
    'Extracting Text, Links, and Images',
    'Navigating the DOM Tree',
    'Scraping Tables into DataFrames',
    'Handling Pagination in Scraping',
    'Automating Tasks with Python Scripts',
    'Scheduling Scripts: Basics of Automation',
    'Mini Project: Scraping Nigerian News Headlines',
    'Web Scraping Assessment'
  ], ARRAY['Scrape web data ethically with BeautifulSoup','Extract structured data from HTML','Automate repetitive tasks with scripts']),

  -- Y3 Term 2: Flask Web Basics
  (6, 3, 2, ARRAY[
    'What Is a Web Framework?',
    'Installing Flask and Hello World',
    'Routes and URL Patterns',
    'Templates with Jinja2: Rendering HTML',
    'Template Inheritance: Base Templates',
    'Handling Form Data: GET and POST',
    'Static Files: CSS and Images in Flask',
    'Flask with SQLite: Database Integration',
    'Building a CRUD Web Application',
    'User Feedback: Flash Messages',
    'Mini Project: Class Attendance Web App',
    'Flask Web Basics Assessment'
  ], ARRAY['Set up routes and templates in Flask','Handle form submissions','Build a database-backed web application']),

  -- Y3 Term 3: Final Projects
  (6, 3, 3, ARRAY[
    'Capstone Project: Proposal and Planning',
    'Capstone: System Design and Architecture',
    'Capstone: Database Schema Design',
    'Capstone: Backend Development Sprint 1',
    'Capstone: Backend Development Sprint 2',
    'Capstone: Frontend Integration',
    'Capstone: Testing and Bug Fixing',
    'Capstone: User Interface Polish',
    'Code Documentation and README',
    'Practice Demo Presentation',
    'Final Capstone Showcase',
    'Python Track Graduation Ceremony'
  ], ARRAY['Design and architect a complete application','Integrate frontend and backend','Deliver a professional demo presentation']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 7 — Basic 5 · HTML/CSS Track  (Ages 10-11, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: Advanced HTML5
  (7, 1, 1, ARRAY[
    'HTML5 Review: Semantic Structure',
    'Audio Element: Embedding Sound',
    'Video Element: Embedding Video',
    'Canvas Element: Drawing with HTML',
    'SVG Basics: Scalable Vector Graphics',
    'Data Attributes: Storing Custom Data',
    'Meta Tags: SEO and Social Media',
    'Open Graph Tags for Link Previews',
    'HTML5 APIs: Geolocation Basics',
    'Local Storage: Saving Data in the Browser',
    'Mini Project: Interactive Media Page',
    'Advanced HTML5 Assessment'
  ], ARRAY['Use HTML5 audio, video, and canvas','Implement meta and Open Graph tags','Store data with localStorage']),

  -- Y1 Term 2: CSS Flexbox Mastery
  (7, 1, 2, ARRAY[
    'Flexbox Review: Container and Item Properties',
    'Complex Navigation: Responsive Navbar',
    'Card Layouts with Flexbox',
    'Holy Grail Layout: Header, Sidebar, Content, Footer',
    'Centering Techniques with Flexbox',
    'Order Property: Rearranging Items',
    'Flex Basis, Grow, and Shrink Deep Dive',
    'Building a Pricing Table',
    'Building a Feature Comparison Grid',
    'Building a Timeline Component',
    'Mini Project: Product Landing Page',
    'Flexbox Mastery Assessment'
  ], ARRAY['Build complex layouts with Flexbox','Create card and grid components','Design responsive landing pages']),

  -- Y1 Term 3: CSS Grid Mastery
  (7, 1, 3, ARRAY[
    'CSS Grid Review: Template Rows and Columns',
    'Grid Areas: Named Layout Regions',
    'Implicit vs Explicit Grids',
    'Auto-Fit and Auto-Fill: Dynamic Columns',
    'Minmax Function for Responsive Grids',
    'Grid Alignment: justify-items, align-items',
    'Overlapping Grid Items',
    'Magazine-Style Layouts with Grid',
    'Photo Gallery with CSS Grid',
    'Dashboard Layout: Sidebar and Widgets',
    'Mini Project: News Website Homepage',
    'CSS Grid Mastery Assessment'
  ], ARRAY['Use grid areas and named regions','Create responsive grids with auto-fit','Build complex magazine-style layouts']),

  -- Y2 Term 1: JavaScript Introduction
  (7, 2, 1, ARRAY[
    'What Is JavaScript? Adding Interactivity',
    'Variables: let, const, and var',
    'Data Types: String, Number, Boolean, Array, Object',
    'Operators and Expressions',
    'Conditional Statements: if/else',
    'Functions: Declaration and Arrow Syntax',
    'Arrays: Methods and Iteration',
    'Objects: Properties and Methods',
    'Template Literals and String Methods',
    'Console.log for Debugging',
    'Mini Project: Interactive Quiz Page',
    'JavaScript Introduction Assessment'
  ], ARRAY['Declare variables with let and const','Write functions and conditionals','Work with arrays and objects']),

  -- Y2 Term 2: DOM Manipulation
  (7, 2, 2, ARRAY[
    'The Document Object Model (DOM)',
    'Selecting Elements: getElementById, querySelector',
    'Changing Content: textContent and innerHTML',
    'Modifying Styles with JavaScript',
    'Adding and Removing CSS Classes',
    'Event Listeners: click, submit, keypress',
    'Creating and Removing DOM Elements',
    'Event Delegation and Bubbling',
    'Form Validation with JavaScript',
    'Building a To-Do List App',
    'Building a Dark Mode Toggle',
    'DOM Manipulation Assessment'
  ], ARRAY['Select and modify DOM elements','Attach event listeners','Build interactive UI components']),

  -- Y2 Term 3: Interactive Web Projects
  (7, 2, 3, ARRAY[
    'Project Planning: User Stories and Wireframes',
    'Building a Calculator App',
    'Building a Countdown Timer',
    'Building a Digital Clock',
    'Fetch API: Loading Data from URLs',
    'Displaying API Data on a Web Page',
    'Local Storage: Persisting User Data',
    'Building a Notes App with Local Storage',
    'CSS and JS Combined: Animated Menu',
    'Modal Windows and Popup Dialogs',
    'Project: Interactive Nigerian Quiz Game',
    'Interactive Web Projects Showcase'
  ], ARRAY['Fetch and display API data','Persist data with localStorage','Build complete interactive web apps']),

  -- Y3 Term 1: Responsive Frameworks
  (7, 3, 1, ARRAY[
    'CSS Variables: Custom Properties',
    'Creating a Design System: Colours and Spacing',
    'Typography System: Fluid Font Sizing',
    'Component Library: Buttons and Cards',
    'Component Library: Forms and Alerts',
    'Introduction to CSS Frameworks (Bootstrap Overview)',
    'Grid Systems in Frameworks',
    'Utility-First CSS Concepts',
    'Building a Responsive Dashboard',
    'Advanced Media Queries: Dark Mode',
    'Mini Project: Admin Dashboard Template',
    'Responsive Frameworks Assessment'
  ], ARRAY['Build a CSS design system with variables','Create reusable component libraries','Implement dark mode with media queries']),

  -- Y3 Term 2: Accessibility and Performance
  (7, 3, 2, ARRAY[
    'Web Accessibility: Why It Matters',
    'ARIA Roles, States, and Properties',
    'Keyboard Navigation and Focus Management',
    'Screen Reader Testing',
    'Colour Contrast and Visual Accessibility',
    'Web Performance: Loading Speed',
    'Image Optimisation: Formats and Compression',
    'Lazy Loading Images and Content',
    'Minification: Reducing File Sizes',
    'Lighthouse Audit: Measuring Performance',
    'Mini Project: Accessible Portfolio Upgrade',
    'Accessibility and Performance Assessment'
  ], ARRAY['Implement ARIA for accessibility','Optimise images and loading performance','Run and interpret Lighthouse audits']),

  -- Y3 Term 3: Portfolio and Capstone
  (7, 3, 3, ARRAY[
    'Advanced Portfolio: Project Case Studies',
    'Writing Technical Blog Posts',
    'Version Control: Git Basics (init, add, commit)',
    'GitHub: Pushing Code and Creating Repos',
    'GitHub Pages: Free Website Hosting',
    'Capstone: Planning a Client Website',
    'Capstone: Design and Wireframing',
    'Capstone: Build Sprint 1 — Structure',
    'Capstone: Build Sprint 2 — Styling',
    'Capstone: Build Sprint 3 — Interactivity',
    'Capstone: Testing and Cross-Browser Fixes',
    'HTML/CSS Track Graduation Showcase'
  ], ARRAY['Use Git for version control','Deploy websites with GitHub Pages','Build a professional client-ready website']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 8 — Basic 6 · Python Track  (Ages 11-12, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: Python Mastery Review
  (8, 1, 1, ARRAY[
    'Python Review: Advanced Data Structures',
    'Sets: Unique Collections and Operations',
    'Named Tuples and Data Classes',
    'Advanced Dictionary Patterns',
    'Itertools: Powerful Iteration Tools',
    'Collections Module: Counter, defaultdict, deque',
    'Regular Expressions: Pattern Matching Basics',
    'Regex: Search, Match, Findall, Sub',
    'Context Managers: with Statement Deep Dive',
    'Type Hints and Annotations',
    'Mini Project: Log File Analyser',
    'Python Mastery Assessment'
  ], ARRAY['Use advanced data structures (sets, named tuples)','Apply regular expressions for pattern matching','Write type-annotated Python code']),

  -- Y1 Term 2: Advanced OOP and Design Patterns
  (8, 1, 2, ARRAY[
    'OOP Review: Classes, Inheritance, Polymorphism',
    'Abstract Base Classes: abc Module',
    'Multiple Inheritance and MRO',
    'Composition vs Inheritance',
    'Design Patterns: Singleton',
    'Design Patterns: Factory Method',
    'Design Patterns: Observer Pattern',
    'Magic Methods: __str__, __repr__, __len__',
    'Operator Overloading: __add__, __eq__',
    'Property Decorators: Getters and Setters',
    'Mini Project: Shape Calculator with Polymorphism',
    'Advanced OOP Assessment'
  ], ARRAY['Implement abstract base classes','Apply common design patterns','Use magic methods and operator overloading']),

  -- Y1 Term 3: Testing and Documentation
  (8, 1, 3, ARRAY[
    'Software Quality: Why Testing Matters',
    'unittest Review: TestCase and Assertions',
    'pytest: Modern Python Testing Framework',
    'Test Fixtures: setUp and tearDown',
    'Mocking: unittest.mock for Isolation',
    'Test Coverage: Measuring What Is Tested',
    'Docstrings: Function and Module Documentation',
    'Sphinx: Generating Documentation',
    'README Files: Best Practices',
    'Continuous Integration Concepts',
    'Mini Project: Fully Tested Library Module',
    'Testing and Documentation Assessment'
  ], ARRAY['Write tests with pytest','Use mocking for test isolation','Generate documentation from docstrings']),

  -- Y2 Term 1: Data Science Foundations
  (8, 2, 1, ARRAY[
    'What Is Data Science? The Data Pipeline',
    'NumPy: Creating and Manipulating Arrays',
    'NumPy: Mathematical Operations on Arrays',
    'Pandas Review: DataFrames and Series',
    'Data Cleaning: Handling Duplicates and Outliers',
    'Feature Engineering: Creating New Columns',
    'Statistical Concepts: Mean, Median, Mode, Std Dev',
    'Correlation Analysis: Finding Relationships',
    'Introduction to Scikit-learn',
    'Train/Test Split: Preparing Data for Models',
    'Mini Project: Nigerian Census Data Analysis',
    'Data Science Foundations Assessment'
  ], ARRAY['Clean and prepare datasets for analysis','Calculate statistical measures','Split data for machine learning']),

  -- Y2 Term 2: Machine Learning Concepts
  (8, 2, 2, ARRAY[
    'What Is Machine Learning? Types and Applications',
    'Supervised Learning: Classification vs Regression',
    'Linear Regression: Predicting Continuous Values',
    'Evaluating Regression: MSE, R-Squared',
    'Decision Trees: Classification',
    'Evaluating Classification: Accuracy, Precision, Recall',
    'K-Nearest Neighbours Algorithm',
    'Feature Scaling: Normalisation and Standardisation',
    'Unsupervised Learning: K-Means Clustering',
    'Model Visualisation with Matplotlib',
    'Mini Project: Student Performance Predictor',
    'Machine Learning Concepts Assessment'
  ], ARRAY['Train regression and classification models','Evaluate model performance metrics','Visualise machine learning results']),

  -- Y2 Term 3: Game Development with Pygame
  (8, 2, 3, ARRAY[
    'Introduction to Pygame: Installation and Setup',
    'Game Window: Display, Colours, and Game Loop',
    'Drawing Shapes and Images on Screen',
    'Player Movement: Keyboard Input Handling',
    'Sprite Groups and Collision Detection',
    'Adding Sound Effects and Music',
    'Score Display and Game HUD',
    'Enemy Spawning and AI Movement',
    'Game States: Menu, Playing, Game Over',
    'Animation: Sprite Sheets and Frame Cycling',
    'Mini Project: Space Invaders Clone',
    'Game Development Showcase'
  ], ARRAY['Set up a Pygame game loop','Handle sprites and collision detection','Build a complete game with menus and scoring']),

  -- Y3 Term 1: Network Programming
  (8, 3, 1, ARRAY[
    'Computer Networks Review: IP, TCP, UDP',
    'Socket Programming: Client-Server Model',
    'Building a Simple Chat Client',
    'Building a Simple Chat Server',
    'HTTP Protocol: Request and Response Cycle',
    'Building a Minimal HTTP Server',
    'REST API Design Principles',
    'Building a REST API with Flask',
    'API Authentication: Token-Based Auth',
    'WebSocket Concepts: Real-Time Communication',
    'Mini Project: Multi-User Chat Application',
    'Network Programming Assessment'
  ], ARRAY['Build client-server applications with sockets','Design and build REST APIs','Implement token-based authentication']),

  -- Y3 Term 2: Project Management and Git
  (8, 3, 2, ARRAY[
    'Version Control: Why Git Matters',
    'Git Basics: init, add, commit, status, log',
    'Branching: Creating and Switching Branches',
    'Merging Branches and Resolving Conflicts',
    'GitHub: Remote Repositories and Collaboration',
    'Pull Requests and Code Review Workflow',
    'Git Workflow: Feature Branch Strategy',
    'Project Management: User Stories and Sprints',
    'Agile Concepts: Scrum and Kanban',
    'Issue Tracking and Project Boards',
    'Mini Project: Collaborative Team Repository',
    'Project Management and Git Assessment'
  ], ARRAY['Use Git branching and merging','Collaborate via pull requests','Apply agile project management concepts']),

  -- Y3 Term 3: Capstone Projects
  (8, 3, 3, ARRAY[
    'Capstone: Team Formation and Idea Pitching',
    'Capstone: Requirements Gathering and User Stories',
    'Capstone: Architecture and Technology Stack',
    'Capstone: Database Design and API Planning',
    'Capstone: Development Sprint 1 — Core Backend',
    'Capstone: Development Sprint 2 — Frontend',
    'Capstone: Development Sprint 3 — Integration',
    'Capstone: Testing Suite and Bug Triage',
    'Capstone: Deployment and Documentation',
    'Capstone: Demo Rehearsal and Pitch Deck',
    'Capstone: Final Showcase and Live Demo',
    'Python Track Graduation Ceremony'
  ], ARRAY['Manage a team software project end-to-end','Deploy and document a production-ready app','Present a polished demo to stakeholders']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 9 — Basic 6 · HTML/CSS Track  (Ages 11-12, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: Full-Stack Awareness
  (9, 1, 1, ARRAY[
    'Frontend vs Backend: The Full Picture',
    'How the Web Works: DNS, HTTP, HTTPS',
    'Developer Tools: Inspecting Web Pages',
    'Command Line Basics: Terminal Navigation',
    'Node.js: What It Is and Installation',
    'npm: Package Manager Fundamentals',
    'Creating a Node.js Project with npm init',
    'ES6+ JavaScript: let, const, Arrow Functions',
    'ES6+: Destructuring and Spread Operator',
    'ES6+: Promises and Async/Await',
    'Mini Project: Command-Line To-Do App',
    'Full-Stack Awareness Assessment'
  ], ARRAY['Navigate the command line','Set up Node.js projects with npm','Use ES6+ JavaScript features']),

  -- Y1 Term 2: Advanced JavaScript
  (9, 1, 2, ARRAY[
    'JavaScript Classes and Prototypes',
    'Modules: import and export',
    'Error Handling: try/catch in JavaScript',
    'Array Methods Deep Dive: map, filter, reduce',
    'Object Methods and Computed Properties',
    'JSON: Parse and Stringify',
    'Regular Expressions in JavaScript',
    'Date and Time Manipulation',
    'Local Storage and Session Storage',
    'Web Workers: Background Processing Concepts',
    'Mini Project: Expense Tracker SPA',
    'Advanced JavaScript Assessment'
  ], ARRAY['Use JavaScript classes and modules','Master array methods (map, filter, reduce)','Build single-page applications']),

  -- Y1 Term 3: Server-Side JavaScript
  (9, 1, 3, ARRAY[
    'Introduction to Express.js',
    'Routes and Middleware in Express',
    'Serving Static Files',
    'Template Engines: EJS Basics',
    'Handling POST Data: Body Parser',
    'RESTful API Design with Express',
    'JSON API Endpoints: CRUD Operations',
    'Environment Variables: dotenv',
    'Error Handling Middleware',
    'CORS: Cross-Origin Resource Sharing',
    'Mini Project: Notes API with Express',
    'Server-Side JavaScript Assessment'
  ], ARRAY['Build routes and middleware with Express','Create RESTful API endpoints','Handle environment configuration securely']),

  -- Y2 Term 1: React Fundamentals
  (9, 2, 1, ARRAY[
    'What Is React? Component-Based Architecture',
    'Setting Up a React Project with Vite',
    'JSX: Writing HTML in JavaScript',
    'Components: Functional Components',
    'Props: Passing Data to Components',
    'State: Managing Component Data with useState',
    'Event Handling in React',
    'Conditional Rendering',
    'Rendering Lists with map and Keys',
    'Forms and Controlled Components',
    'Mini Project: React Task Manager',
    'React Fundamentals Assessment'
  ], ARRAY['Create React functional components','Manage state with useState','Handle forms and events in React']),

  -- Y2 Term 2: State Management and Routing
  (9, 2, 2, ARRAY[
    'useEffect: Side Effects and Data Fetching',
    'Custom Hooks: Reusable Logic',
    'React Context: Global State',
    'useReducer for Complex State Logic',
    'React Router: Page Navigation',
    'Route Parameters and Query Strings',
    'Protected Routes and Navigation Guards',
    'Component Lifecycle and Cleanup',
    'Performance: React.memo and useMemo',
    'Loading States and Error Boundaries',
    'Mini Project: Multi-Page Blog Application',
    'State Management and Routing Assessment'
  ], ARRAY['Fetch data with useEffect','Implement client-side routing','Manage global state with Context']),

  -- Y2 Term 3: Full-Stack Project
  (9, 2, 3, ARRAY[
    'Full-Stack Architecture: React + Express',
    'Connecting Frontend to Backend API',
    'Authentication: Login and Registration Flow',
    'JWT Tokens: Stateless Authentication',
    'MongoDB Basics: Documents and Collections',
    'Mongoose: ODM for MongoDB',
    'CRUD API with MongoDB and Express',
    'File Uploads: Handling Images',
    'Deployment Preparation: Build and Serve',
    'Environment Configuration for Production',
    'Full-Stack Project: School Notice Board',
    'Full-Stack Project Showcase'
  ], ARRAY['Connect React frontend to Express backend','Implement JWT authentication','Build a full MERN stack application']),

  -- Y3 Term 1: Database Integration
  (9, 3, 1, ARRAY[
    'Relational vs NoSQL Databases: When to Use Each',
    'PostgreSQL: Installation and Setup',
    'SQL Review: Tables, Queries, Joins',
    'Database Design: Normalisation and Relations',
    'Connecting PostgreSQL to Node.js',
    'ORM Concepts: Sequelize or Prisma Introduction',
    'Migrations: Managing Database Schema Changes',
    'Database Security: SQL Injection Prevention',
    'Transactions and Data Integrity',
    'Seed Data: Populating Development Databases',
    'Mini Project: Student Management System with PostgreSQL',
    'Database Integration Assessment'
  ], ARRAY['Design normalised database schemas','Use an ORM for database operations','Prevent SQL injection vulnerabilities']),

  -- Y3 Term 2: Deployment and Hosting
  (9, 3, 2, ARRAY[
    'Deployment Concepts: Dev, Staging, Production',
    'Version Control Review: Git Branching Strategies',
    'CI/CD: Continuous Integration and Deployment',
    'Cloud Platforms: Vercel, Netlify, Render Overview',
    'Deploying a React App to Vercel',
    'Deploying a Node.js API to Render',
    'Domain Names and DNS Configuration',
    'SSL Certificates and HTTPS',
    'Monitoring and Logging in Production',
    'Performance Optimisation: Caching and CDN',
    'Mini Project: Deploy Full-Stack App to Cloud',
    'Deployment and Hosting Assessment'
  ], ARRAY['Deploy frontend and backend to cloud platforms','Configure domains and SSL','Monitor and optimise production applications']),

  -- Y3 Term 3: Capstone
  (9, 3, 3, ARRAY[
    'Capstone: Client Brief and Requirements Analysis',
    'Capstone: UI/UX Design with Figma',
    'Capstone: Database and API Architecture',
    'Capstone: Sprint 1 — Backend APIs and Database',
    'Capstone: Sprint 2 — Frontend Components',
    'Capstone: Sprint 3 — Authentication and Authorisation',
    'Capstone: Sprint 4 — Integration and Polish',
    'Capstone: Responsive Design and Accessibility Audit',
    'Capstone: Deployment to Production',
    'Capstone: Documentation and Portfolio Write-Up',
    'Capstone: Live Demo and Client Presentation',
    'HTML/CSS Track Graduation Ceremony'
  ], ARRAY['Design, build, and deploy a production web app','Conduct accessibility and performance audits','Present a professional portfolio piece']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 10 — JSS 1 · Web App Track  (Ages 12-13, 108 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: Web Foundations
  (10, 1, 1, ARRAY[
    'The Internet: History and How It Works',
    'Web Browsers, Servers, and Protocols',
    'HTML5: Document Structure Best Practices',
    'Semantic HTML: Accessibility-First Markup',
    'CSS3: Modern Styling Techniques',
    'CSS Variables and Theming',
    'Flexbox: Complete Layout System',
    'CSS Grid: Two-Dimensional Layouts',
    'Responsive Design: Mobile-First Approach',
    'Google Fonts and Icon Libraries',
    'Mini Project: Responsive Portfolio Website',
    'Web Foundations Assessment'
  ], ARRAY['Build semantic, accessible HTML pages','Master Flexbox and CSS Grid','Create mobile-first responsive websites']),

  -- Y1 Term 2: JavaScript Essentials
  (10, 1, 2, ARRAY[
    'JavaScript in the Browser: Script Tag and Console',
    'Variables, Data Types, and Operators',
    'Functions: Declarations, Expressions, Arrows',
    'Control Flow: Conditions and Loops',
    'Arrays: Creation, Methods, and Iteration',
    'Objects: Properties, Methods, and this',
    'DOM Selection and Manipulation',
    'Event Handling: Clicks, Forms, Keyboard',
    'Error Handling: try/catch',
    'Debugging with Browser DevTools',
    'Mini Project: Interactive To-Do Application',
    'JavaScript Essentials Assessment'
  ], ARRAY['Write JavaScript functions and control flow','Manipulate the DOM dynamically','Debug with browser developer tools']),

  -- Y1 Term 3: Interactive Web Apps
  (10, 1, 3, ARRAY[
    'Fetch API: Making HTTP Requests',
    'Promises and Async/Await',
    'Working with JSON Data',
    'Local Storage for Data Persistence',
    'Form Validation: Client-Side Techniques',
    'Dynamic Content: Building SPAs',
    'CSS Animations and JavaScript Triggers',
    'Modal Dialogs and Toast Notifications',
    'Image Carousel and Slider Component',
    'Tab and Accordion Components',
    'Project: Weather Dashboard with API',
    'Interactive Web Apps Assessment'
  ], ARRAY['Fetch data from APIs asynchronously','Build dynamic single-page experiences','Create reusable UI components']),

  -- Y2 Term 1: Backend Development
  (10, 2, 1, ARRAY[
    'Introduction to Server-Side Programming',
    'Node.js: Runtime Environment Setup',
    'npm: Managing Dependencies',
    'Express.js: Your First Server',
    'Routing: GET, POST, PUT, DELETE',
    'Middleware: Logging, CORS, Body Parsing',
    'Template Engines: Server-Side Rendering',
    'REST API Design Principles',
    'JSON API Endpoints',
    'Request Validation and Sanitisation',
    'Mini Project: Book Collection REST API',
    'Backend Development Assessment'
  ], ARRAY['Set up Express.js servers','Design RESTful API endpoints','Validate and sanitise request data']),

  -- Y2 Term 2: Databases and Authentication
  (10, 2, 2, ARRAY[
    'Database Concepts: SQL vs NoSQL',
    'SQLite/PostgreSQL: Schema and Tables',
    'SQL Queries: SELECT, INSERT, UPDATE, DELETE',
    'JOIN Operations and Relationships',
    'Connecting a Database to Express',
    'ORM Basics: Mapping Objects to Tables',
    'User Registration: Password Hashing with bcrypt',
    'User Login: Session vs Token Authentication',
    'JWT: Creating and Verifying Tokens',
    'Protected Routes and Middleware',
    'Mini Project: User Authentication System',
    'Databases and Authentication Assessment'
  ], ARRAY['Design and query relational databases','Hash passwords securely with bcrypt','Implement JWT-based authentication']),

  -- Y2 Term 3: Full-Stack Project
  (10, 2, 3, ARRAY[
    'Full-Stack Architecture Planning',
    'Project Setup: Monorepo or Separate Repos',
    'API Design: Endpoints and Data Models',
    'Frontend Setup: React or Vanilla JS SPA',
    'Connecting Frontend to Backend',
    'State Management for API Data',
    'File Upload Handling',
    'Real-Time Features: Polling and WebSockets',
    'Testing: API Tests and UI Tests',
    'Deployment: Frontend and Backend',
    'Project: School Event Management Platform',
    'Full-Stack Project Showcase'
  ], ARRAY['Architect a full-stack web application','Implement real-time features','Test and deploy full-stack projects']),

  -- Y3 Term 1: Advanced Frontend
  (10, 3, 1, ARRAY[
    'React Introduction: Components and JSX',
    'React State Management: useState and useEffect',
    'React Props and Component Composition',
    'React Router: Multi-Page Navigation',
    'React Forms: Controlled Components',
    'React Context: Sharing State Globally',
    'Custom Hooks: Encapsulating Logic',
    'React Performance: Memoisation',
    'React UI Libraries: Component Ecosystems',
    'TypeScript with React: Type Safety',
    'Mini Project: React Dashboard Application',
    'Advanced Frontend Assessment'
  ], ARRAY['Build React applications with hooks','Implement routing and global state','Use TypeScript for type-safe React code']),

  -- Y3 Term 2: DevOps and Professional Skills
  (10, 3, 2, ARRAY[
    'Git Advanced: Rebase, Stash, Cherry-Pick',
    'GitHub Actions: CI/CD Pipelines',
    'Automated Testing in CI',
    'Docker Concepts: Containers and Images',
    'Docker: Running a Node.js App in a Container',
    'Cloud Deployment: AWS, GCP, or Azure Basics',
    'Domain Configuration and SSL',
    'Monitoring: Health Checks and Alerts',
    'Security: OWASP Top 10 Overview',
    'Code Quality: Linting and Formatting',
    'Mini Project: CI/CD Pipeline for a Web App',
    'DevOps Assessment'
  ], ARRAY['Build CI/CD pipelines with GitHub Actions','Containerise applications with Docker','Apply security best practices (OWASP)']),

  -- Y3 Term 3: Capstone Web Application
  (10, 3, 3, ARRAY[
    'Capstone: Problem Statement and User Research',
    'Capstone: System Architecture and Tech Stack',
    'Capstone: UI/UX Design in Figma',
    'Capstone: Database Schema and API Design',
    'Capstone: Sprint 1 — Backend Implementation',
    'Capstone: Sprint 2 — Frontend Implementation',
    'Capstone: Sprint 3 — Auth, Roles, and Permissions',
    'Capstone: Sprint 4 — Testing and Bug Fixes',
    'Capstone: Deployment and Performance Tuning',
    'Capstone: Documentation and Video Demo',
    'Capstone: Final Presentation and Live Demo',
    'JSS 1 Web App Track Graduation'
  ], ARRAY['Execute a multi-sprint capstone project','Deploy a production-ready web application','Present technical work to a live audience']),

  -- ══════════════════════════════════════════════════════════════════════════
  -- LANE 11 — JSS 2 · Web App Track  (Ages 13-14, 40 weeks only)
  -- Y1 full (36 weeks) + Y2T1 partial (4 weeks)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Y1 Term 1: Advanced JavaScript Patterns
  (11, 1, 1, ARRAY[
    'JavaScript Review: ES6+ Features',
    'Closures and Lexical Scope',
    'Prototypal Inheritance Deep Dive',
    'Design Patterns: Module and Revealing Module',
    'Design Patterns: Observer and Pub/Sub',
    'Functional Programming: Pure Functions',
    'Functional Programming: Immutability and Composition',
    'Async Patterns: Callbacks, Promises, Async/Await',
    'Error Handling Strategies in Async Code',
    'Web APIs: Intersection Observer, Resize Observer',
    'Mini Project: Real-Time Search Filter',
    'Advanced JavaScript Assessment'
  ], ARRAY['Apply closures and advanced scope patterns','Use functional programming principles','Handle complex async workflows']),

  -- Y1 Term 2: React Advanced Patterns
  (11, 1, 2, ARRAY[
    'React Review: Hooks and Component Lifecycle',
    'Advanced Hooks: useCallback, useMemo, useRef',
    'Custom Hooks: Data Fetching, Form Handling',
    'Render Props and Higher-Order Components',
    'React Suspense and Lazy Loading',
    'State Management: Zustand or Redux Basics',
    'Server-Side Rendering Concepts',
    'Next.js Introduction: Pages and Routing',
    'Next.js: API Routes and Data Fetching',
    'Next.js: Static Site Generation',
    'Mini Project: Blog Platform with Next.js',
    'React Advanced Patterns Assessment'
  ], ARRAY['Create custom hooks for reusable logic','Use Next.js for server-rendered React apps','Implement advanced state management']),

  -- Y1 Term 3: Full-Stack TypeScript
  (11, 1, 3, ARRAY[
    'TypeScript Fundamentals: Types, Interfaces, Enums',
    'TypeScript Generics and Utility Types',
    'TypeScript with React: Typed Props and State',
    'TypeScript with Express: Typed Routes',
    'Prisma ORM: Type-Safe Database Access',
    'Database Migrations with Prisma',
    'API Validation: Zod Schema Validation',
    'Authentication: NextAuth.js Integration',
    'Role-Based Access Control Implementation',
    'End-to-End Testing with Playwright',
    'Mini Project: TypeScript Full-Stack Task Manager',
    'Full-Stack TypeScript Assessment'
  ], ARRAY['Write type-safe code with TypeScript','Use Prisma for database operations','Implement end-to-end testing with Playwright']),

  -- Y2 Term 1 PARTIAL (only 4 weeks for lane 11 = 40 total)
  (11, 2, 1, ARRAY[
    'Capstone: Problem Definition and Market Research',
    'Capstone: Technical Architecture and Sprint Planning',
    'Capstone: Full Build Sprint — MVP Development',
    'Capstone: Final Demo, Portfolio, and Graduation',
    'PLACEHOLDER_SKIP','PLACEHOLDER_SKIP','PLACEHOLDER_SKIP','PLACEHOLDER_SKIP',
    'PLACEHOLDER_SKIP','PLACEHOLDER_SKIP','PLACEHOLDER_SKIP','PLACEHOLDER_SKIP'
  ], ARRAY['Plan, build, and present a capstone MVP','Demonstrate full-stack proficiency','Graduate the JSS 2 Web App programme'])

),
expanded AS (
  SELECT
    rt.lane,
    rt.yr,
    rt.tm,
    idx AS wk,
    ((rt.yr - 1) * 36 + (rt.tm - 1) * 12 + idx) AS week_idx,
    rt.topics[idx] AS new_topic,
    to_jsonb(rt.subs) AS new_subs
  FROM real_topics rt
  CROSS JOIN generate_series(1, 12) AS idx
  WHERE idx <= array_length(rt.topics, 1)
    AND rt.topics[idx] != 'PLACEHOLDER_SKIP'
    -- Respect lane bounds: 108 for lanes 1-10, 40 for lane 11
    AND ((rt.yr - 1) * 36 + (rt.tm - 1) * 12 + idx) <=
        CASE WHEN rt.lane = 11 THEN 40 ELSE 108 END
)
UPDATE public.platform_syllabus_week_template t
SET
  topic = e.new_topic,
  subtopics = e.new_subs
FROM expanded e
WHERE t.catalog_version = 'qa_spine_v1'
  AND t.lane_index = e.lane
  AND t.week_index = e.week_idx
  AND EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = t.program_id
      AND coalesce(p.program_scope, 'regular_school') = 'regular_school'
  );

