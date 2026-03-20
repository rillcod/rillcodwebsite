// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/auth-context';
import {
  RocketLaunchIcon,
  CheckBadgeIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  TrophyIcon,
  StarIcon,
  BoltIcon,
  CodeBracketIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  LockClosedIcon,
} from '@/lib/icons';

const CodeEditor = dynamic(() => import('@/components/studio/IntegratedCodeRunner'), {
  ssr: false,
  loading: () => <div className="h-[350px] bg-black/20 animate-pulse rounded-none" />,
});

type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';
type MissionLanguage = 'javascript' | 'python' | 'html' | 'robotics';
type FilterType = 'All' | Difficulty | 'Completed';

interface Mission {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  language: MissionLanguage;
  xp: number;
  starterCode: string;
  instructions: string;
  tags: string[];
}

const MISSIONS: Mission[] = [
  {
    id: 'm01',
    title: 'Hello, Variables!',
    description: 'Declare variables and print your name, age, and favourite subject.',
    instructions:
      'Create three variables: name (string), age (number), and subject (string). Then print all three using console.log or print, formatted as a sentence.',
    difficulty: 'Beginner',
    language: 'javascript',
    xp: 50,
    starterCode: `// Declare your variables here\nconst name = '';\nconst age = 0;\nconst subject = '';\n\n// Print them\nconsole.log(\`My name is \${name}, I am \${age} years old and I love \${subject}\`);`,
    tags: ['variables', 'strings', 'console'],
  },
  {
    id: 'm02',
    title: 'Loop the Loop',
    description: 'Use a for loop to print numbers from 1 to 10.',
    instructions:
      'Write a for loop that iterates from 1 to 10 (inclusive) and prints each number. Then modify it to print only even numbers.',
    difficulty: 'Beginner',
    language: 'javascript',
    xp: 60,
    starterCode: `// Print numbers 1 to 10\nfor (let i = 1; i <= 10; i++) {\n  console.log(i);\n}\n\n// Now print only even numbers\n`,
    tags: ['loops', 'for loop', 'iteration'],
  },
  {
    id: 'm03',
    title: 'Function Factory',
    description: 'Write a function that calculates the area of a rectangle.',
    instructions:
      'Create a function called calculateArea that accepts width and height as parameters and returns their product. Test it with at least 3 different inputs.',
    difficulty: 'Beginner',
    language: 'javascript',
    xp: 70,
    starterCode: `function calculateArea(width, height) {\n  // your code here\n}\n\nconsole.log(calculateArea(5, 3));   // 15\nconsole.log(calculateArea(10, 7));  // 70\nconsole.log(calculateArea(2, 9));   // 18`,
    tags: ['functions', 'parameters', 'return values'],
  },
  {
    id: 'm04',
    title: 'Array Adventures',
    description: 'Filter, map, and reduce an array of student scores.',
    instructions:
      'Given the scores array, use .filter() to get scores above 60, .map() to add 5 bonus points to all scores, and .reduce() to find the total sum.',
    difficulty: 'Beginner',
    language: 'javascript',
    xp: 80,
    starterCode: `const scores = [45, 78, 62, 90, 55, 83, 71, 40, 95, 68];\n\n// Filter scores above 60\nconst passing = scores.filter(s => s > 60);\n\n// Add 5 bonus points to all\nconst boosted = scores.map(s => s + 5);\n\n// Total sum\nconst total = scores.reduce((acc, s) => acc + s, 0);\n\nconsole.log('Passing:', passing);\nconsole.log('Boosted:', boosted);\nconsole.log('Total:', total);`,
    tags: ['arrays', 'filter', 'map', 'reduce'],
  },
  {
    id: 'm05',
    title: 'Object Oriented Thinking',
    description: 'Model a Student using a JavaScript object with methods.',
    instructions:
      'Create a student object with properties: name, grade, scores (array). Add a method getAverage() that returns the average of their scores, and a method isPassing() that returns true if average >= 60.',
    difficulty: 'Beginner',
    language: 'javascript',
    xp: 90,
    starterCode: `const student = {\n  name: 'Chidi',\n  grade: 'JSS3',\n  scores: [72, 85, 60, 91, 78],\n\n  getAverage() {\n    // return the average of this.scores\n  },\n\n  isPassing() {\n    // return true if average >= 60\n  }\n};\n\nconsole.log(student.getAverage());\nconsole.log(student.isPassing());`,
    tags: ['objects', 'methods', 'this'],
  },
  {
    id: 'm06',
    title: 'DOM Detective',
    description: 'Manipulate HTML elements using JavaScript DOM methods.',
    instructions:
      'Create an HTML page with a heading, a paragraph, and a button. When the button is clicked, change the heading text to "Hello STEM!" and change the paragraph color to violet.',
    difficulty: 'Intermediate',
    language: 'html',
    xp: 100,
    starterCode: `<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; padding: 20px; background: #1a1a2e; color: white; }\n    button { padding: 10px 20px; background: #7c3aed; color: white; border: none; cursor: pointer; }\n  </style>\n</head>\n<body>\n  <h1 id="heading">Welcome to STEM</h1>\n  <p id="paragraph">Click the button to transform this text.</p>\n  <button onclick="transform()">Transform!</button>\n\n  <script>\n    function transform() {\n      // Change heading text to "Hello STEM!"\n      // Change paragraph color to violet\n    }\n  </script>\n</body>\n</html>`,
    tags: ['DOM', 'events', 'HTML', 'onclick'],
  },
  {
    id: 'm07',
    title: 'Python Basics',
    description: 'Write a Python program that classifies numbers as positive, negative, or zero.',
    instructions:
      'Write a Python function classify_number(n) that returns "positive", "negative", or "zero". Test it with a list of numbers using a for loop.',
    difficulty: 'Beginner',
    language: 'python',
    xp: 70,
    starterCode: `def classify_number(n):\n    # return "positive", "negative", or "zero"\n    pass\n\nnumbers = [10, -3, 0, 42, -7, 0, 5]\n\nfor num in numbers:\n    print(f"{num} is {classify_number(num)}")`,
    tags: ['python', 'conditionals', 'functions'],
  },
  {
    id: 'm08',
    title: 'HTML Form Builder',
    description: 'Build a styled registration form with validation.',
    instructions:
      'Create an HTML form with fields for name, email, and password. Add CSS styling. Use JavaScript to validate that all fields are filled before submission and show an alert with the submitted name.',
    difficulty: 'Intermediate',
    language: 'html',
    xp: 110,
    starterCode: `<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; background: #111; color: #eee; padding: 30px; }\n    form { max-width: 400px; display: flex; flex-direction: column; gap: 12px; }\n    input { padding: 10px; background: #222; border: 1px solid #444; color: white; }\n    button { padding: 12px; background: #7c3aed; color: white; border: none; cursor: pointer; }\n    .error { color: #f87171; font-size: 12px; }\n  </style>\n</head>\n<body>\n  <h2>Register</h2>\n  <form id="regForm">\n    <input type="text" id="name" placeholder="Full Name" />\n    <input type="email" id="email" placeholder="Email" />\n    <input type="password" id="password" placeholder="Password" />\n    <div class="error" id="errorMsg"></div>\n    <button type="button" onclick="submitForm()">Register</button>\n  </form>\n  <script>\n    function submitForm() {\n      // Validate all fields are filled\n      // Show error if not\n      // Alert with name if valid\n    }\n  </script>\n</body>\n</html>`,
    tags: ['HTML', 'forms', 'validation', 'CSS'],
  },
  {
    id: 'm09',
    title: 'Sorting Algorithms',
    description: 'Implement bubble sort from scratch.',
    instructions:
      'Implement bubble sort in JavaScript. The function bubbleSort(arr) should return a sorted copy of the array without modifying the original. Then compare its performance with the built-in .sort().',
    difficulty: 'Intermediate',
    language: 'javascript',
    xp: 130,
    starterCode: `function bubbleSort(arr) {\n  const copy = [...arr];\n  // Implement bubble sort here\n  // Hint: two nested loops, swap adjacent elements if out of order\n  return copy;\n}\n\nconst numbers = [64, 34, 25, 12, 22, 11, 90];\nconsole.log('Unsorted:', numbers);\nconsole.log('Bubble sorted:', bubbleSort(numbers));\nconsole.log('Built-in sorted:', [...numbers].sort((a, b) => a - b));`,
    tags: ['algorithms', 'sorting', 'bubble sort'],
  },
  {
    id: 'm10',
    title: 'Binary Search',
    description: 'Implement binary search on a sorted array.',
    instructions:
      'Write a function binarySearch(arr, target) that returns the index of target in a sorted array, or -1 if not found. It must run in O(log n) time — no using .indexOf()!',
    difficulty: 'Intermediate',
    language: 'javascript',
    xp: 140,
    starterCode: `function binarySearch(arr, target) {\n  let left = 0;\n  let right = arr.length - 1;\n\n  while (left <= right) {\n    const mid = Math.floor((left + right) / 2);\n    // Check if target is at mid\n    // If target > arr[mid], search right half\n    // If target < arr[mid], search left half\n  }\n\n  return -1;\n}\n\nconst sorted = [2, 5, 8, 12, 16, 23, 38, 45, 72, 91];\nconsole.log(binarySearch(sorted, 23));  // 5\nconsole.log(binarySearch(sorted, 7));   // -1`,
    tags: ['algorithms', 'binary search', 'O(log n)'],
  },
  {
    id: 'm11',
    title: 'Recursive Power',
    description: 'Solve problems using recursion.',
    instructions:
      'Write a recursive function factorial(n) that returns n!. Then write a recursive fibonacci(n) that returns the nth Fibonacci number. Add memoization to fibonacci to avoid redundant calculations.',
    difficulty: 'Intermediate',
    language: 'javascript',
    xp: 150,
    starterCode: `function factorial(n) {\n  // base case: factorial(0) = 1\n  // recursive case: n * factorial(n-1)\n}\n\nconst memo = {};\nfunction fibonacci(n) {\n  if (n in memo) return memo[n];\n  // base cases: fib(0)=0, fib(1)=1\n  // recursive: fib(n-1) + fib(n-2), store in memo\n}\n\nconsole.log(factorial(6));    // 720\nconsole.log(fibonacci(10));   // 55\nconsole.log(fibonacci(20));   // 6765`,
    tags: ['recursion', 'memoization', 'fibonacci'],
  },
  {
    id: 'm12',
    title: 'Async & Promises',
    description: 'Fetch data from a public API using async/await.',
    instructions:
      'Write an async function fetchJoke() that fetches a random joke from https://official-joke-api.appspot.com/random_joke and logs the setup and punchline. Handle errors with try/catch.',
    difficulty: 'Advanced',
    language: 'javascript',
    xp: 160,
    starterCode: `async function fetchJoke() {\n  try {\n    const response = await fetch('https://official-joke-api.appspot.com/random_joke');\n    const joke = await response.json();\n    console.log('Setup:', joke.setup);\n    console.log('Punchline:', joke.punchline);\n  } catch (error) {\n    console.error('Failed to fetch joke:', error.message);\n  }\n}\n\nfetchJoke();`,
    tags: ['async', 'promises', 'fetch', 'API'],
  },
  {
    id: 'm13',
    title: 'OOP Class System',
    description: 'Build a class hierarchy for geometric shapes.',
    instructions:
      'Create a base class Shape with a method area(). Create subclasses Circle and Rectangle that extend Shape and implement area(). Add a toString() method to each that returns a description with the calculated area.',
    difficulty: 'Advanced',
    language: 'javascript',
    xp: 170,
    starterCode: `class Shape {\n  area() {\n    return 0;\n  }\n\n  toString() {\n    return \`Shape with area \${this.area()}\`;\n  }\n}\n\nclass Circle extends Shape {\n  constructor(radius) {\n    super();\n    this.radius = radius;\n  }\n  // Override area()\n  // Override toString()\n}\n\nclass Rectangle extends Shape {\n  constructor(width, height) {\n    super();\n    this.width = width;\n    this.height = height;\n  }\n  // Override area()\n  // Override toString()\n}\n\nconsole.log(new Circle(5).toString());\nconsole.log(new Rectangle(4, 6).toString());`,
    tags: ['OOP', 'classes', 'inheritance', 'extends'],
  },
  {
    id: 'm14',
    title: 'Data Structures: Stack',
    description: 'Implement a Stack data structure class.',
    instructions:
      'Build a Stack class with methods: push(item), pop(), peek(), isEmpty(), size(). Use an array internally. Then use your Stack to check if a string of brackets "([]{})" is balanced.',
    difficulty: 'Advanced',
    language: 'javascript',
    xp: 180,
    starterCode: `class Stack {\n  constructor() {\n    this.items = [];\n  }\n\n  push(item) { /* add to top */ }\n  pop() { /* remove from top */ }\n  peek() { /* view top without removing */ }\n  isEmpty() { /* return true if empty */ }\n  size() { /* return number of items */ }\n}\n\nfunction isBalanced(str) {\n  const stack = new Stack();\n  const pairs = { ')': '(', ']': '[', '}': '{' };\n  // Iterate through str\n  // Push opening brackets, pop and check closing brackets\n  // Return true if stack is empty at end\n}\n\nconsole.log(isBalanced('([{}])'));   // true\nconsole.log(isBalanced('([{})'));    // false\nconsole.log(isBalanced('((())'));    // false`,
    tags: ['data structures', 'stack', 'brackets'],
  },
  {
    id: 'm15',
    title: 'Error Handling Mastery',
    description: 'Build a robust function with proper error handling.',
    instructions:
      'Write a function safeDivide(a, b) that throws a TypeError if inputs are not numbers, throws a RangeError if b is zero, and returns the division result otherwise. Create a custom DivisionError class. Handle all cases gracefully.',
    difficulty: 'Advanced',
    language: 'javascript',
    xp: 190,
    starterCode: `class DivisionError extends Error {\n  constructor(message) {\n    super(message);\n    this.name = 'DivisionError';\n  }\n}\n\nfunction safeDivide(a, b) {\n  if (typeof a !== 'number' || typeof b !== 'number') {\n    throw new TypeError('Both arguments must be numbers');\n  }\n  if (b === 0) {\n    throw new DivisionError('Cannot divide by zero');\n  }\n  return a / b;\n}\n\nconst tests = [\n  [10, 2],\n  [5, 0],\n  ['5', 2],\n  [100, 4],\n];\n\ntests.forEach(([a, b]) => {\n  try {\n    console.log(\`\${a} / \${b} = \${safeDivide(a, b)}\`);\n  } catch (err) {\n    console.error(\`\${err.name}: \${err.message}\`);\n  }\n});`,
    tags: ['error handling', 'try/catch', 'custom errors'],
  },
];

const XP_PER_LEVEL = 500;

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  Beginner: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Intermediate: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  Advanced: 'bg-red-500/15 text-red-400 border-red-500/20',
};

export default function MissionsPage() {
  const { profile, loading: authLoading } = useAuth();

  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [activeMission, setActiveMission] = useState<string | null>(null);
  const [missionCode, setMissionCode] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterType>('All');
  const [search, setSearch] = useState('');

  // AI hints
  const [hintLoading, setHintLoading] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [showHints, setShowHints] = useState<Set<string>>(new Set());

  // Load completed missions from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('completed_missions');
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        setCompletedIds(new Set(parsed));
      }
    } catch {
      // ignore
    }
  }, []);

  function markComplete(missionId: string) {
    const next = new Set([...completedIds, missionId]);
    setCompletedIds(next);
    try {
      localStorage.setItem('completed_missions', JSON.stringify([...next]));
    } catch {
      // ignore
    }
  }

  async function getHint(mission: Mission) {
    setHintLoading(mission.id);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          prompt: `Give a helpful hint (NOT the full solution) for this coding challenge:\n\nTitle: ${mission.title}\nDescription: ${mission.description}\n${mission.instructions}\n\nKeep it to 2-3 sentences. Guide their thinking, don't give the answer.`,
        }),
      });
      const data = await res.json();
      if (data?.content) {
        setHints((prev) => ({ ...prev, [mission.id]: data.content }));
        setShowHints((prev) => new Set([...prev, mission.id]));
      }
    } catch {
      // silent fail
    } finally {
      setHintLoading(null);
    }
  }

  function toggleHint(id: string) {
    setShowHints((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalXP = [...completedIds].reduce((sum, id) => {
    const m = MISSIONS.find((m) => m.id === id);
    return sum + (m?.xp || 0);
  }, 0);

  const level = Math.floor(totalXP / XP_PER_LEVEL) + 1;

  const filteredMissions = MISSIONS.filter((m) => {
    const matchesSearch =
      !search ||
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesFilter =
      filter === 'All' ||
      (filter === 'Completed' && completedIds.has(m.id)) ||
      m.difficulty === filter;
    return matchesSearch && matchesFilter;
  });

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/15 flex items-center justify-center rounded-none">
            <RocketLaunchIcon className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Missions</h1>
            <p className="text-sm text-muted-foreground">Complete coding challenges to level up</p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckBadgeIcon className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Completed</span>
            </div>
            <p className="text-xl font-black text-foreground">{completedIds.size} / {MISSIONS.length}</p>
          </div>
          <div className="bg-card border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <BoltIcon className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">XP Earned</span>
            </div>
            <p className="text-xl font-black text-foreground">{totalXP}</p>
          </div>
          <div className="bg-card border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrophyIcon className="w-4 h-4 text-violet-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Level</span>
            </div>
            <p className="text-xl font-black text-foreground">{level}</p>
          </div>
          <div className="bg-card border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <StarIcon className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Remaining XP</span>
            </div>
            <p className="text-xl font-black text-foreground">{XP_PER_LEVEL - (totalXP % XP_PER_LEVEL)}</p>
          </div>
        </div>

        {/* XP Progress bar */}
        <div className="bg-card border border-border p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Level {level} Progress</span>
            <span className="text-xs text-violet-400 font-bold">{totalXP % XP_PER_LEVEL} / {XP_PER_LEVEL} XP</span>
          </div>
          <div className="h-2 bg-white/5 rounded-none overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-500"
              style={{ width: `${Math.min(100, ((totalXP % XP_PER_LEVEL) / XP_PER_LEVEL) * 100)}%` }}
            />
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search missions..."
              className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-border rounded-none text-sm focus:outline-none focus:border-violet-500 text-foreground placeholder:text-muted-foreground"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(['All', 'Beginner', 'Intermediate', 'Advanced', 'Completed'] as FilterType[]).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 text-xs font-bold transition-colors rounded-none border ${
                    filter === f
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f}
                </button>
              )
            )}
          </div>
        </div>

        {/* Mission grid */}
        {filteredMissions.length === 0 ? (
          <div className="text-center py-16">
            <RocketLaunchIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-bold">No missions found</p>
            <p className="text-muted-foreground text-sm">Try a different filter or search term.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMissions.map((mission) => {
              const isCompleted = completedIds.has(mission.id);
              const isActive = activeMission === mission.id;

              return (
                <div
                  key={mission.id}
                  className={`bg-card border transition-colors ${
                    isCompleted ? 'border-emerald-500/30' : isActive ? 'border-violet-500/50' : 'border-border'
                  } ${isActive ? 'md:col-span-2' : ''}`}
                >
                  {/* Mission card header */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className={`px-2 py-0.5 text-xs font-bold border ${DIFFICULTY_STYLES[mission.difficulty]}`}
                          >
                            {mission.difficulty}
                          </span>
                          <span className="px-2 py-0.5 bg-white/5 border border-border text-xs text-muted-foreground">
                            {mission.language}
                          </span>
                          <span className="ml-auto flex items-center gap-1 text-xs text-amber-400 font-bold">
                            <BoltIcon className="w-3 h-3" />
                            {mission.xp} XP
                          </span>
                        </div>
                        <h3 className="font-black text-foreground text-sm mb-1">{mission.title}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">{mission.description}</p>
                      </div>
                      {isCompleted && (
                        <div className="flex-shrink-0">
                          <CheckBadgeIcon className="w-6 h-6 text-emerald-400" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {mission.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-white/5 text-xs text-muted-foreground"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                      <button
                        onClick={() =>
                          setActiveMission(isActive ? null : mission.id)
                        }
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-none transition-all ${
                          isActive
                            ? 'bg-white/5 border border-border text-muted-foreground'
                            : 'bg-violet-600 hover:bg-violet-500 text-white'
                        }`}
                      >
                        {isActive ? (
                          <>
                            <XMarkIcon className="w-3.5 h-3.5" />
                            Close
                          </>
                        ) : (
                          <>
                            <CodeBracketIcon className="w-3.5 h-3.5" />
                            {isCompleted ? 'Review' : 'Start Mission'}
                          </>
                        )}
                      </button>
                      {isCompleted && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold ml-auto">
                          <CheckCircleIcon className="w-4 h-4" />
                          Completed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded mission area */}
                  {isActive && (
                    <div className="border-t border-border">
                      {/* Instructions */}
                      <div className="px-4 py-3 bg-violet-500/5 border-b border-border">
                        <p className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-1.5">
                          Instructions
                        </p>
                        <p className="text-sm text-foreground leading-relaxed">{mission.instructions}</p>
                      </div>

                      {/* Code editor */}
                      <CodeEditor
                        value={missionCode[mission.id] ?? mission.starterCode}
                        onChange={(v) =>
                          setMissionCode((prev) => ({
                            ...prev,
                            [mission.id]: v || '',
                          }))
                        }
                        language={mission.language}
                        height={350}
                        title={mission.title}
                        showHeader={true}
                      />

                      {/* AI Hint + Mark Complete */}
                      <div className="px-4 py-3 border-t border-border flex flex-wrap items-start gap-3">
                        <button
                          onClick={() =>
                            hints[mission.id]
                              ? toggleHint(mission.id)
                              : getHint(mission)
                          }
                          disabled={hintLoading === mission.id}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-400 border border-amber-500/30 hover:bg-amber-500/5 transition-all rounded-none disabled:opacity-50"
                        >
                          <LightBulbIcon className="w-4 h-4" />
                          {hintLoading === mission.id
                            ? 'Getting hint...'
                            : hints[mission.id]
                            ? showHints.has(mission.id)
                              ? 'Hide Hint'
                              : 'Show Hint'
                            : 'AI Hint'}
                        </button>

                        {!isCompleted && (
                          <button
                            onClick={() => markComplete(mission.id)}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition-all ml-auto"
                          >
                            <CheckBadgeIcon className="w-4 h-4" />
                            Mark Complete (+{mission.xp} XP)
                          </button>
                        )}
                        {isCompleted && (
                          <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                            <CheckBadgeIcon className="w-4 h-4" />
                            Mission Complete!
                          </span>
                        )}
                      </div>

                      {/* Hint panel */}
                      {hints[mission.id] && showHints.has(mission.id) && (
                        <div className="mx-4 mb-4 bg-amber-500/5 border border-amber-500/20 px-4 py-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <LightBulbIcon className="w-4 h-4 text-amber-400" />
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                              AI Hint
                            </span>
                          </div>
                          <p className="text-sm text-amber-200 leading-relaxed">{hints[mission.id]}</p>
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
    </div>
  );
}
