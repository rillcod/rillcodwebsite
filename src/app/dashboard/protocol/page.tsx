// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/auth-context';
import {
  CommandLineIcon,
  SparklesIcon,
  BookOpenIcon,
  CheckBadgeIcon,
  LockClosedIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  BeakerIcon,
  CpuChipIcon,
  BoltIcon,
  RocketLaunchIcon,
  StarIcon,
  ArrowPathIcon,
  XMarkIcon,
} from '@/lib/icons';

const CodeEditor = dynamic(() => import('@/components/studio/IntegratedCodeRunner'), {
  ssr: false,
  loading: () => <div className="h-[350px] bg-black/20 animate-pulse rounded-none" />,
});

type ModuleStatus = 'locked' | 'available' | 'completed';
type RunnerLanguage = 'javascript' | 'python' | 'html' | 'robotics';

interface ProtocolModule {
  id: string;
  title: string;
  description: string;
  language: RunnerLanguage;
  icon: 'code' | 'beaker' | 'cpu' | 'bolt' | 'rocket' | 'star' | 'book';
  starterCode: string;
  aiPrompt: string;
}

interface ProtocolPhase {
  id: number;
  name: string;
  subtitle: string;
  color: string;
  accentColor: string;
  modules: ProtocolModule[];
}

const PROTOCOL_PHASES: ProtocolPhase[] = [
  {
    id: 1,
    name: 'Foundation',
    subtitle: 'Build your core programming fundamentals',
    color: 'border-emerald-500/40',
    accentColor: 'text-emerald-400',
    modules: [
      {
        id: 'p1m1',
        title: 'Introduction to Programming',
        description: 'Variables, data types, and your first program',
        language: 'javascript',
        icon: 'code',
        starterCode: `// Welcome to Programming!\n// A variable stores data\nlet myName = 'Student';\nlet myAge = 16;\nlet isCoder = true;\n\nconsole.log('Name:', myName);\nconsole.log('Age:', myAge);\nconsole.log('Is a coder:', isCoder);\n\n// Try changing the values above!`,
        aiPrompt: 'Explain the concept of variables and data types in programming in simple terms for a beginner student.',
      },
      {
        id: 'p1m2',
        title: 'Control Flow',
        description: 'If/else statements and conditional logic',
        language: 'javascript',
        icon: 'bolt',
        starterCode: `const score = 75;\n\nif (score >= 90) {\n  console.log('Grade: A — Outstanding!');\n} else if (score >= 80) {\n  console.log('Grade: B — Well done!');\n} else if (score >= 70) {\n  console.log('Grade: C — Good effort!');\n} else if (score >= 60) {\n  console.log('Grade: D — Keep trying!');\n} else {\n  console.log('Grade: F — Needs improvement.');\n}\n\n// Change score and observe the output`,
        aiPrompt: 'Explain if/else conditional statements in programming. How does control flow work? Give a real-world analogy.',
      },
      {
        id: 'p1m3',
        title: 'Loops & Iteration',
        description: 'Repeating actions with for and while loops',
        language: 'javascript',
        icon: 'rocket',
        starterCode: `// for loop — when you know how many times\nfor (let i = 1; i <= 5; i++) {\n  console.log(\`Lap \${i}: running!\`);\n}\n\nconsole.log('---');\n\n// while loop — when condition-based\nlet fuel = 10;\nwhile (fuel > 0) {\n  console.log(\`Fuel remaining: \${fuel}\`);\n  fuel -= 3;\n}\nconsole.log('Tank empty!');`,
        aiPrompt: 'Explain for loops and while loops in programming. When would you use each? Provide examples relevant to a student.',
      },
      {
        id: 'p1m4',
        title: 'Functions',
        description: 'Creating reusable blocks of code',
        language: 'javascript',
        icon: 'beaker',
        starterCode: `// Functions are reusable recipes\nfunction greet(name) {\n  return \`Hello, \${name}! Welcome to STEM.\`;\n}\n\nfunction calculateBMI(weight, height) {\n  return (weight / (height * height)).toFixed(2);\n}\n\nconsole.log(greet('Amara'));\nconsole.log(greet('Chidi'));\nconsole.log('BMI:', calculateBMI(60, 1.7));`,
        aiPrompt: 'Explain functions in programming — what they are, why we use them, parameters vs arguments, and return values. Use simple examples.',
      },
      {
        id: 'p1m5',
        title: 'Python Fundamentals',
        description: 'Python syntax, lists, and basic programs',
        language: 'python',
        icon: 'cpu',
        starterCode: `# Python is clean and readable\nname = "Chioma"\nage = 17\nscores = [85, 92, 78, 95, 88]\n\n# List operations\nprint(f"Student: {name}, Age: {age}")\nprint(f"Scores: {scores}")\nprint(f"Average: {sum(scores)/len(scores):.1f}")\nprint(f"Highest: {max(scores)}")\nprint(f"Lowest: {min(scores)}")\n\n# Loop through scores\nfor i, score in enumerate(scores, 1):\n    status = "Pass" if score >= 60 else "Fail"\n    print(f"  Test {i}: {score} — {status}")`,
        aiPrompt: 'Explain Python fundamentals: syntax differences from other languages, lists, f-strings, and the enumerate function.',
      },
    ],
  },
  {
    id: 2,
    name: 'Application',
    subtitle: 'Apply your knowledge to real problems',
    color: 'border-blue-500/40',
    accentColor: 'text-blue-400',
    modules: [
      {
        id: 'p2m1',
        title: 'Arrays & Data Manipulation',
        description: 'Sorting, filtering, and transforming data',
        language: 'javascript',
        icon: 'code',
        starterCode: `const students = [\n  { name: 'Ada', score: 92, subject: 'Math' },\n  { name: 'Bola', score: 78, subject: 'Science' },\n  { name: 'Chidi', score: 85, subject: 'Math' },\n  { name: 'Dami', score: 61, subject: 'English' },\n  { name: 'Emeka', score: 95, subject: 'Science' },\n];\n\n// Filter passing students\nconst passing = students.filter(s => s.score >= 70);\nconsole.log('Passing:', passing.map(s => s.name));\n\n// Sort by score descending\nconst ranked = [...students].sort((a, b) => b.score - a.score);\nconsole.log('Ranked:', ranked.map(s => \`\${s.name}: \${s.score}\`));\n\n// Average score\nconst avg = students.reduce((sum, s) => sum + s.score, 0) / students.length;\nconsole.log('Class average:', avg.toFixed(1));`,
        aiPrompt: 'Explain array manipulation methods in JavaScript: filter, map, sort, and reduce. How and when do you use each?',
      },
      {
        id: 'p2m2',
        title: 'Objects & JSON',
        description: 'Working with structured data',
        language: 'javascript',
        icon: 'beaker',
        starterCode: `// Objects store related data\nconst school = {\n  name: 'Rillcod Academy',\n  founded: 2020,\n  subjects: ['STEM', 'Coding', 'Robotics'],\n  address: {\n    city: 'Lagos',\n    country: 'Nigeria',\n  },\n  getInfo() {\n    return \`\${this.name} — \${this.address.city}, \${this.address.country}\`;\n  }\n};\n\nconsole.log(school.getInfo());\nconsole.log('Subjects:', school.subjects.join(', '));\n\n// Convert to/from JSON\nconst json = JSON.stringify(school, null, 2);\nconsole.log('JSON:', json.substring(0, 100) + '...');`,
        aiPrompt: 'Explain JavaScript objects and JSON. What is the difference between them? How do you serialize/deserialize data?',
      },
      {
        id: 'p2m3',
        title: 'HTML & CSS Layout',
        description: 'Building and styling web pages',
        language: 'html',
        icon: 'star',
        starterCode: `<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    * { box-sizing: border-box; margin: 0; padding: 0; }\n    body { font-family: 'Segoe UI', sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 20px; }\n    .card { background: #1a1a2e; border: 1px solid #2d2d4e; padding: 24px; max-width: 400px; margin: 20px auto; }\n    h1 { color: #a78bfa; font-size: 1.5rem; margin-bottom: 12px; }\n    p { color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }\n    .tag { display: inline-block; padding: 4px 10px; background: #7c3aed22; color: #a78bfa; font-size: 12px; margin: 2px; }\n    .btn { padding: 10px 20px; background: #7c3aed; color: white; border: none; cursor: pointer; font-size: 14px; }\n    .btn:hover { background: #6d28d9; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h1>STEM Student Card</h1>\n    <p>Welcome to Rillcod Academy. Build the future with code.</p>\n    <div>\n      <span class="tag">JavaScript</span>\n      <span class="tag">Python</span>\n      <span class="tag">Robotics</span>\n    </div>\n    <br/>\n    <button class="btn" onclick="this.textContent='Enrolled!'">Enroll Now</button>\n  </div>\n</body>\n</html>`,
        aiPrompt: 'Explain CSS layout: the box model, flexbox, and how to style cards and buttons. What are best practices for beginners?',
      },
      {
        id: 'p2m4',
        title: 'Python Data Science Basics',
        description: 'Analyzing data with Python',
        language: 'python',
        icon: 'cpu',
        starterCode: `# Analyzing student data with Python\nstudents = [\n    {"name": "Ada", "score": 92, "grade": "A"},\n    {"name": "Bola", "score": 78, "grade": "B"},\n    {"name": "Chidi", "score": 85, "grade": "B"},\n    {"name": "Dami", "score": 61, "grade": "C"},\n    {"name": "Emeka", "score": 95, "grade": "A"},\n]\n\nscores = [s["score"] for s in students]\nprint(f"Total students: {len(students)}")\nprint(f"Average score: {sum(scores)/len(scores):.1f}")\nprint(f"Highest: {max(scores)}")\nprint(f"Lowest: {min(scores)}")\n\n# Grade distribution\nfrom collections import Counter\ngrades = Counter(s["grade"] for s in students)\nprint("Grade distribution:", dict(grades))\n\n# Students above average\navg = sum(scores) / len(scores)\nabove_avg = [s["name"] for s in students if s["score"] > avg]\nprint("Above average:", above_avg)`,
        aiPrompt: 'Explain list comprehensions and the Counter class in Python. How are they used for data analysis?',
      },
    ],
  },
  {
    id: 3,
    name: 'Integration',
    subtitle: 'Connect concepts and build full projects',
    color: 'border-violet-500/40',
    accentColor: 'text-violet-400',
    modules: [
      {
        id: 'p3m1',
        title: 'OOP & Class Design',
        description: 'Object-oriented programming patterns',
        language: 'javascript',
        icon: 'beaker',
        starterCode: `class Vehicle {\n  constructor(make, model, year) {\n    this.make = make;\n    this.model = model;\n    this.year = year;\n    this.speed = 0;\n  }\n\n  accelerate(amount) {\n    this.speed += amount;\n    return this;\n  }\n\n  brake(amount) {\n    this.speed = Math.max(0, this.speed - amount);\n    return this;\n  }\n\n  toString() {\n    return \`\${this.year} \${this.make} \${this.model} @ \${this.speed}km/h\`;\n  }\n}\n\nclass ElectricVehicle extends Vehicle {\n  constructor(make, model, year, batteryCapacity) {\n    super(make, model, year);\n    this.batteryCapacity = batteryCapacity;\n  }\n\n  toString() {\n    return \`\${super.toString()} [EV, \${this.batteryCapacity}kWh]\`;\n  }\n}\n\nconst car = new Vehicle('Toyota', 'Camry', 2022);\ncar.accelerate(60).accelerate(20);\nconsole.log(car.toString());\n\nconst tesla = new ElectricVehicle('Tesla', 'Model 3', 2023, 75);\ntesla.accelerate(100);\nconsole.log(tesla.toString());`,
        aiPrompt: 'Explain Object-Oriented Programming: classes, constructors, inheritance, and method chaining. Why is OOP useful?',
      },
      {
        id: 'p3m2',
        title: 'Async JavaScript & APIs',
        description: 'Promises, async/await, and fetching data',
        language: 'javascript',
        icon: 'bolt',
        starterCode: `// Simulating async operations\nfunction delay(ms) {\n  return new Promise(resolve => setTimeout(resolve, ms));\n}\n\nasync function loadStudentData(id) {\n  console.log(\`Fetching student \${id}...\`);\n  await delay(500); // simulate network request\n  return { id, name: \`Student \${id}\`, score: Math.floor(Math.random() * 40) + 60 };\n}\n\nasync function loadAllStudents() {\n  try {\n    // Load students in parallel\n    const [s1, s2, s3] = await Promise.all([\n      loadStudentData(1),\n      loadStudentData(2),\n      loadStudentData(3),\n    ]);\n\n    console.log('Loaded:', s1.name, s2.name, s3.name);\n    const avg = (s1.score + s2.score + s3.score) / 3;\n    console.log(\`Class average: \${avg.toFixed(1)}\`);\n  } catch (error) {\n    console.error('Error:', error.message);\n  }\n}\n\nloadAllStudents();`,
        aiPrompt: 'Explain asynchronous JavaScript: the event loop, promises, async/await, and Promise.all. Why is async programming important?',
      },
      {
        id: 'p3m3',
        title: 'Robotics & IoT Basics',
        description: 'Introduction to robotics programming concepts',
        language: 'robotics',
        icon: 'cpu',
        starterCode: `// Robotics: Sensor-Actuator Loop\n// This simulates a basic robot navigation loop\n\nconst robot = {\n  x: 0, y: 0,\n  direction: 'NORTH',\n  log: [],\n\n  move(steps = 1) {\n    const moves = { NORTH: [0,1], SOUTH: [0,-1], EAST: [1,0], WEST: [-1,0] };\n    const [dx, dy] = moves[this.direction];\n    this.x += dx * steps;\n    this.y += dy * steps;\n    this.log.push(\`MOVE \${steps} → (\${this.x},\${this.y})\`);\n    return this;\n  },\n\n  turn(dir) {\n    const rights = { NORTH:'EAST', EAST:'SOUTH', SOUTH:'WEST', WEST:'NORTH' };\n    const lefts  = { NORTH:'WEST', WEST:'SOUTH', SOUTH:'EAST', EAST:'NORTH' };\n    this.direction = dir === 'R' ? rights[this.direction] : lefts[this.direction];\n    this.log.push(\`TURN \${dir} → facing \${this.direction}\`);\n    return this;\n  },\n\n  report() {\n    console.log(\`Position: (\${this.x}, \${this.y}) facing \${this.direction}\`);\n  }\n};\n\n// Navigate a square path\nrobot.move(3).turn('R').move(3).turn('R').move(3).turn('R').move(3);\nrobot.report();\nrobot.log.forEach(l => console.log(' ', l));`,
        aiPrompt: 'Explain robotics programming concepts: sensors, actuators, control loops, and how robots navigate using coordinate systems.',
      },
      {
        id: 'p3m4',
        title: 'Algorithm Design',
        description: 'Solving problems with efficient algorithms',
        language: 'javascript',
        icon: 'rocket',
        starterCode: `// Two classic algorithms\n\n// 1. Merge Sort — O(n log n)\nfunction mergeSort(arr) {\n  if (arr.length <= 1) return arr;\n  const mid = Math.floor(arr.length / 2);\n  const left = mergeSort(arr.slice(0, mid));\n  const right = mergeSort(arr.slice(mid));\n  return merge(left, right);\n}\n\nfunction merge(left, right) {\n  const result = [];\n  let i = 0, j = 0;\n  while (i < left.length && j < right.length) {\n    if (left[i] <= right[j]) result.push(left[i++]);\n    else result.push(right[j++]);\n  }\n  return [...result, ...left.slice(i), ...right.slice(j)];\n}\n\n// 2. Binary Search — O(log n)\nfunction binarySearch(arr, target) {\n  let lo = 0, hi = arr.length - 1;\n  while (lo <= hi) {\n    const mid = (lo + hi) >> 1;\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) lo = mid + 1;\n    else hi = mid - 1;\n  }\n  return -1;\n}\n\nconst arr = [64, 34, 25, 12, 22, 11, 90];\nconst sorted = mergeSort(arr);\nconsole.log('Merge sorted:', sorted);\nconsole.log('Index of 34:', binarySearch(sorted, 34));`,
        aiPrompt: 'Explain algorithm complexity (Big O notation) and why merge sort is O(n log n). How does divide-and-conquer work?',
      },
    ],
  },
  {
    id: 4,
    name: 'Mastery',
    subtitle: 'Advanced topics and full-stack thinking',
    color: 'border-amber-500/40',
    accentColor: 'text-amber-400',
    modules: [
      {
        id: 'p4m1',
        title: 'Full-Stack Concepts',
        description: 'Frontend, backend, databases, and APIs',
        language: 'javascript',
        icon: 'book',
        starterCode: `// Full-Stack Architecture Demonstration\n// Client → API → Database layer simulation\n\nconst db = {\n  users: [\n    { id: 1, name: 'Ada', role: 'student' },\n    { id: 2, name: 'Bola', role: 'teacher' },\n  ],\n  find: (id) => db.users.find(u => u.id === id),\n  findAll: () => db.users,\n  insert: (user) => { db.users.push({ id: Date.now(), ...user }); return user; },\n};\n\n// Simulated API Layer\nconst api = {\n  getUsers: () => ({ status: 200, data: db.findAll() }),\n  getUser: (id) => {\n    const user = db.find(id);\n    return user\n      ? { status: 200, data: user }\n      : { status: 404, error: 'User not found' };\n  },\n  createUser: (data) => {\n    const newUser = db.insert(data);\n    return { status: 201, data: newUser };\n  }\n};\n\n// Client requests\nconsole.log('GET /users', api.getUsers());\nconsole.log('GET /users/1', api.getUser(1));\nconsole.log('GET /users/99', api.getUser(99));\nconsole.log('POST /users', api.createUser({ name: 'Chidi', role: 'student' }));`,
        aiPrompt: 'Explain full-stack web development: what is the frontend, backend, and database? How do they communicate through APIs? What is REST?',
      },
      {
        id: 'p4m2',
        title: 'Data Structures Deep Dive',
        description: 'Linked lists, trees, and graphs',
        language: 'javascript',
        icon: 'cpu',
        starterCode: `// Linked List Implementation\nclass Node {\n  constructor(value) {\n    this.value = value;\n    this.next = null;\n  }\n}\n\nclass LinkedList {\n  constructor() { this.head = null; this.size = 0; }\n\n  append(value) {\n    const node = new Node(value);\n    if (!this.head) { this.head = node; }\n    else {\n      let curr = this.head;\n      while (curr.next) curr = curr.next;\n      curr.next = node;\n    }\n    this.size++;\n  }\n\n  toArray() {\n    const arr = [];\n    let curr = this.head;\n    while (curr) { arr.push(curr.value); curr = curr.next; }\n    return arr;\n  }\n\n  contains(value) {\n    let curr = this.head;\n    while (curr) {\n      if (curr.value === value) return true;\n      curr = curr.next;\n    }\n    return false;\n  }\n}\n\nconst list = new LinkedList();\n[10, 20, 30, 40, 50].forEach(v => list.append(v));\nconsole.log('List:', list.toArray());\nconsole.log('Contains 30:', list.contains(30));\nconsole.log('Contains 99:', list.contains(99));\nconsole.log('Size:', list.size);`,
        aiPrompt: 'Explain linked lists: how they differ from arrays, when to use them, and their time complexity for operations.',
      },
      {
        id: 'p4m3',
        title: 'Security & Best Practices',
        description: 'Writing safe, clean, and maintainable code',
        language: 'javascript',
        icon: 'beaker',
        starterCode: `// Security & Best Practices\n\n// 1. Input Validation\nfunction validateEmail(email) {\n  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n  return regex.test(email);\n}\n\n// 2. Sanitization (prevent XSS)\nfunction sanitizeHTML(str) {\n  return str\n    .replace(/&/g, '&amp;')\n    .replace(/</g, '&lt;')\n    .replace(/>/g, '&gt;')\n    .replace(/\"/g, '&quot;');\n}\n\n// 3. Safe Object Access\nconst user = null;\nconst name = user?.profile?.name ?? 'Guest';\nconsole.log('Name:', name);\n\n// 4. Error Boundaries\nfunction safeParseJSON(str) {\n  try {\n    return { ok: true, data: JSON.parse(str) };\n  } catch (e) {\n    return { ok: false, error: e.message };\n  }\n}\n\n// Test them\nconsole.log('Valid email:', validateEmail('student@rillcod.com'));\nconsole.log('Invalid email:', validateEmail('not-an-email'));\nconsole.log('Sanitized:', sanitizeHTML('<script>alert("xss")</script>'));\nconsole.log('Safe JSON:', safeParseJSON('{"name":"Ada"}'));\nconsole.log('Bad JSON:', safeParseJSON('{bad json}'));`,
        aiPrompt: 'Explain web security fundamentals: XSS attacks, input validation, sanitization, and why optional chaining helps prevent errors.',
      },
      {
        id: 'p4m4',
        title: 'AI & Machine Learning Intro',
        description: 'Understand AI concepts with code examples',
        language: 'python',
        icon: 'star',
        starterCode: `# Introduction to Machine Learning Concepts\n# Implementing a simple linear regression from scratch\n\ndef mean(values):\n    return sum(values) / len(values)\n\ndef linear_regression(x_data, y_data):\n    \"\"\"Calculate slope (m) and intercept (b) for y = mx + b\"\"\"\n    n = len(x_data)\n    x_mean = mean(x_data)\n    y_mean = mean(y_data)\n\n    # Calculate slope\n    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_data, y_data))\n    denominator = sum((x - x_mean) ** 2 for x in x_data)\n    slope = numerator / denominator\n\n    # Calculate intercept\n    intercept = y_mean - slope * x_mean\n    return slope, intercept\n\ndef predict(x, slope, intercept):\n    return slope * x + intercept\n\n# Study hours vs exam scores\nhours_studied = [1, 2, 3, 4, 5, 6, 7, 8]\nexam_scores   = [45, 55, 60, 65, 70, 75, 82, 90]\n\nslope, intercept = linear_regression(hours_studied, exam_scores)\nprint(f"Model: score = {slope:.2f} * hours + {intercept:.2f}")\n\n# Predictions\nfor hours in [3.5, 5, 9]:\n    pred = predict(hours, slope, intercept)\n    print(f"Predicted score for {hours}h study: {pred:.1f}")`,
        aiPrompt: 'Explain machine learning in simple terms. What is linear regression? How do computers learn from data? What are real-world STEM applications?',
      },
    ],
  },
];

const MODULE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  code: CodeBracketIcon,
  beaker: BeakerIcon,
  cpu: CpuChipIcon,
  bolt: BoltIcon,
  rocket: RocketLaunchIcon,
  star: StarIcon,
  book: BookOpenIcon,
};

function getModuleStatus(moduleId: string, completed: Set<string>): ModuleStatus {
  if (completed.has(moduleId)) return 'completed';
  return 'available';
}

export default function ProtocolPage() {
  const { profile, loading: authLoading } = useAuth();

  const [completedModules, setCompletedModules] = useState<Set<string>>(new Set());
  const [activeModule, setActiveModule] = useState<{ phaseId: number; moduleId: string } | null>(null);
  const [studyTip, setStudyTip] = useState<string>('');
  const [tipLoading, setTipLoading] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([1]));

  // AI concept explanations
  const [aiExplaining, setAiExplaining] = useState<string | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [showExplanations, setShowExplanations] = useState<Set<string>>(new Set());

  // Code per module
  const [moduleCode, setModuleCode] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load completed modules from localStorage
    try {
      const stored = localStorage.getItem('completed_protocols');
      if (stored) {
        setCompletedModules(new Set(JSON.parse(stored) as string[]));
      }
    } catch {
      // ignore
    }

    // Fetch AI study tip
    fetchStudyTip();
  }, []);

  async function fetchStudyTip() {
    setTipLoading(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          prompt:
            'Give a short (2 sentences max) motivational study tip for a STEM student learning to code. Be encouraging and practical.',
        }),
      });
      const data = await res.json();
      if (data?.content) setStudyTip(data.content);
    } catch {
      setStudyTip('Every line of code you write is progress. Stay curious, keep building!');
    } finally {
      setTipLoading(false);
    }
  }

  function markModuleComplete(moduleId: string) {
    const next = new Set([...completedModules, moduleId]);
    setCompletedModules(next);
    try {
      localStorage.setItem('completed_protocols', JSON.stringify([...next]));
    } catch {
      // ignore
    }
    setActiveModule(null);
  }

  async function explainConcept(module: ProtocolModule) {
    setAiExplaining(module.id);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          prompt: module.aiPrompt,
        }),
      });
      const data = await res.json();
      if (data?.content) {
        setAiExplanations((prev) => ({ ...prev, [module.id]: data.content }));
        setShowExplanations((prev) => new Set([...prev, module.id]));
      }
    } catch {
      // silent
    } finally {
      setAiExplaining(null);
    }
  }

  function toggleExplanation(id: string) {
    setShowExplanations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePhase(phaseId: number) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }

  const allModules = PROTOCOL_PHASES.flatMap((p) => p.modules);
  const totalModules = allModules.length;
  const completedCount = completedModules.size;
  const overallProgress = totalModules > 0 ? (completedCount / totalModules) * 100 : 0;

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-cyan-500/15 flex items-center justify-center rounded-none">
            <CommandLineIcon className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Protocol</h1>
            <p className="text-sm text-muted-foreground">Your structured path to mastery</p>
          </div>
        </div>

        {/* AI Study Tip Banner */}
        <div className="bg-violet-500/5 border border-violet-500/20 px-4 py-3 mb-6 flex items-start gap-3">
          <SparklesIcon className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {tipLoading ? (
              <div className="h-4 bg-white/5 animate-pulse rounded w-3/4" />
            ) : (
              <p className="text-sm text-violet-200 leading-relaxed">{studyTip}</p>
            )}
          </div>
          <button
            onClick={fetchStudyTip}
            className="flex-shrink-0 p-1 text-violet-400 hover:text-violet-300 transition-colors"
            title="New tip"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Overall progress */}
        <div className="bg-card border border-border p-4 mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-black text-foreground">Overall Progress</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {completedCount} / {totalModules} modules
              </span>
            </div>
            <span className="text-sm font-black text-violet-400">
              {overallProgress.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 bg-white/5 rounded-none overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-700"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* Phases */}
        <div className="space-y-4">
          {PROTOCOL_PHASES.map((phase) => {
            const phaseModules = phase.modules;
            const phaseCompleted = phaseModules.filter((m) => completedModules.has(m.id)).length;
            const phaseProgress = (phaseCompleted / phaseModules.length) * 100;
            const isExpanded = expandedPhases.has(phase.id);

            return (
              <div
                key={phase.id}
                className={`bg-card border ${phase.color}`}
              >
                {/* Phase header */}
                <button
                  className="w-full flex items-center gap-4 p-5 text-left"
                  onClick={() => togglePhase(phase.id)}
                >
                  {/* Phase number */}
                  <div
                    className={`w-12 h-12 flex-shrink-0 flex items-center justify-center border ${phase.color} text-2xl font-black ${phase.accentColor}`}
                  >
                    {phase.id}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h2 className={`text-base font-black ${phase.accentColor}`}>
                        Phase {phase.id}: {phase.name}
                      </h2>
                      {phaseCompleted === phaseModules.length && (
                        <CheckBadgeIcon className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{phase.subtitle}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-white/5 rounded-none overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            phase.id === 1
                              ? 'bg-emerald-500'
                              : phase.id === 2
                              ? 'bg-blue-500'
                              : phase.id === 3
                              ? 'bg-violet-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${phaseProgress}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {phaseCompleted}/{phaseModules.length}
                      </span>
                    </div>
                  </div>

                  <ChevronRightIcon
                    className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {/* Phase modules */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {phaseModules.map((module, moduleIndex) => {
                      const status = getModuleStatus(module.id, completedModules);
                      const isActive =
                        activeModule?.phaseId === phase.id &&
                        activeModule?.moduleId === module.id;
                      const IconComponent = MODULE_ICONS[module.icon] || CodeBracketIcon;

                      return (
                        <div key={module.id} className="border-b border-border last:border-b-0">
                          {/* Module row */}
                          <div className="flex items-center gap-3 px-5 py-3">
                            <div
                              className={`w-8 h-8 flex-shrink-0 flex items-center justify-center ${
                                status === 'completed'
                                  ? 'bg-emerald-500/15'
                                  : status === 'locked'
                                  ? 'bg-white/5'
                                  : 'bg-violet-500/10'
                              }`}
                            >
                              {status === 'completed' ? (
                                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                              ) : status === 'locked' ? (
                                <LockClosedIcon className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <IconComponent className={`w-4 h-4 ${phase.accentColor}`} />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-bold ${
                                  status === 'locked' ? 'text-muted-foreground' : 'text-foreground'
                                }`}
                              >
                                {moduleIndex + 1}. {module.title}
                              </p>
                              <p className="text-xs text-muted-foreground">{module.description}</p>
                            </div>

                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {status === 'completed' && (
                                <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-xs font-bold">
                                  Done
                                </span>
                              )}
                              {status !== 'locked' && (
                                <button
                                  onClick={() =>
                                    setActiveModule(
                                      isActive
                                        ? null
                                        : { phaseId: phase.id, moduleId: module.id }
                                    )
                                  }
                                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-none transition-all ${
                                    isActive
                                      ? 'bg-white/5 border border-border text-muted-foreground'
                                      : `bg-violet-600 hover:bg-violet-500 text-white`
                                  }`}
                                >
                                  {isActive ? (
                                    <>
                                      <XMarkIcon className="w-3 h-3" />
                                      Close
                                    </>
                                  ) : (
                                    <>
                                      <CodeBracketIcon className="w-3 h-3" />
                                      Practice
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Expanded practice panel */}
                          {isActive && (
                            <div className="border-t border-border bg-background/50">
                              {/* Code editor */}
                              <CodeEditor
                                value={moduleCode[module.id] ?? module.starterCode}
                                onChange={(v) =>
                                  setModuleCode((prev) => ({
                                    ...prev,
                                    [module.id]: v || '',
                                  }))
                                }
                                language={module.language}
                                height={350}
                                title={module.title}
                                showHeader={true}
                              />

                              {/* Actions */}
                              <div className="px-4 py-3 border-t border-border flex flex-wrap items-center gap-3">
                                <button
                                  onClick={() =>
                                    aiExplanations[module.id]
                                      ? toggleExplanation(module.id)
                                      : explainConcept(module)
                                  }
                                  disabled={aiExplaining === module.id}
                                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-violet-400 border border-violet-500/30 hover:bg-violet-500/5 transition-all rounded-none disabled:opacity-50"
                                >
                                  <SparklesIcon className="w-3.5 h-3.5" />
                                  {aiExplaining === module.id
                                    ? 'Thinking...'
                                    : aiExplanations[module.id]
                                    ? showExplanations.has(module.id)
                                      ? 'Hide Explanation'
                                      : 'Show Explanation'
                                    : 'AI Explain This Concept'}
                                </button>

                                {status !== 'completed' && (
                                  <button
                                    onClick={() => markModuleComplete(module.id)}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition-all ml-auto"
                                  >
                                    <CheckBadgeIcon className="w-3.5 h-3.5" />
                                    Mark Complete
                                  </button>
                                )}
                                {status === 'completed' && (
                                  <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                                    <CheckBadgeIcon className="w-4 h-4" />
                                    Module Complete!
                                  </span>
                                )}
                              </div>

                              {/* AI Explanation */}
                              {aiExplanations[module.id] &&
                                showExplanations.has(module.id) && (
                                  <div className="mx-4 mb-4 bg-violet-500/5 border border-violet-500/20 px-4 py-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <SparklesIcon className="w-4 h-4 text-violet-400" />
                                      <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">
                                        AI Explanation
                                      </span>
                                    </div>
                                    <p className="text-sm text-violet-200 leading-relaxed whitespace-pre-wrap">
                                      {aiExplanations[module.id]}
                                    </p>
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Completion celebration */}
        {completedCount === totalModules && totalModules > 0 && (
          <div className="mt-8 bg-gradient-to-r from-violet-500/10 to-amber-500/10 border border-amber-500/30 p-6 text-center">
            <CheckBadgeIcon className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h2 className="text-xl font-black text-foreground mb-1">Protocol Complete!</h2>
            <p className="text-muted-foreground text-sm">
              You have mastered all {totalModules} modules. You are ready to build the future!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
