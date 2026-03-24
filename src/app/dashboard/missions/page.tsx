// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
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
type LangFilter = 'all' | 'javascript' | 'python' | 'html' | 'robotics';

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

  // ── Python Missions ──────────────────────────────────────────────────────

  {
    id: 'p01',
    title: 'Hello Python',
    description: 'Learn Python variables, data types, and f-string print statements.',
    instructions:
      'Create three variables: name (string), age (integer), and gpa (float). Print them using an f-string in the format: "My name is Adaeze, I am 14 years old and my GPA is 3.8". Then print each variable\'s type using type().',
    difficulty: 'Beginner',
    language: 'python',
    xp: 50,
    starterCode: `# Declare your variables\nname = ""\nage = 0\ngpa = 0.0\n\n# Print using an f-string\nprint(f"My name is {name}, I am {age} years old and my GPA is {gpa}")\n\n# Print variable types\nprint(type(name))\nprint(type(age))\nprint(type(gpa))`,
    tags: ['variables', 'print', 'f-strings', 'types'],
  },
  {
    id: 'p02',
    title: 'Loop the Loop',
    description: 'Use for loops with range() to print numbers and compute a sum.',
    instructions:
      'Write a for loop that prints numbers 1 to 10. Then print only odd numbers from 1 to 20 using a condition inside the loop. Finally, use sum() and range() to calculate the total of all numbers from 1 to 100.',
    difficulty: 'Beginner',
    language: 'python',
    xp: 60,
    starterCode: `# Print numbers 1 to 10\nfor i in range(1, 11):\n    print(i)\n\nprint("---")\n\n# Print odd numbers 1 to 20\nfor i in range(1, 21):\n    if i % 2 != 0:\n        print(i)\n\n# Sum of 1 to 100\ntotal = sum(range(1, 101))\nprint(f"Sum 1-100: {total}")`,
    tags: ['loops', 'range', 'for loop', 'sum'],
  },
  {
    id: 'p03',
    title: 'Function Factory',
    description: 'Write Python functions with parameters, default arguments, and return values.',
    instructions:
      'Create a function calculate_grade(score, total=100) that returns the letter grade: A (>=80%), B (>=65%), C (>=50%), D (>=40%), F (<40%). Test it with at least 5 different score/total pairs.',
    difficulty: 'Beginner',
    language: 'python',
    xp: 70,
    starterCode: `def calculate_grade(score, total=100):\n    percentage = (score / total) * 100\n    # Return 'A', 'B', 'C', 'D', or 'F' based on percentage\n    pass\n\ntest_cases = [(85, 100), (60, 100), (45, 100), (72, 80), (30, 100)]\nfor score, total in test_cases:\n    grade = calculate_grade(score, total)\n    print(f"Score {score}/{total} → Grade: {grade}")`,
    tags: ['functions', 'conditionals', 'parameters', 'return'],
  },
  {
    id: 'p04',
    title: 'List Adventures',
    description: 'Work with Python lists — slicing, sorting, and built-in methods.',
    instructions:
      'Given a list of student scores, find the highest, lowest, and average. Sort the list, remove all scores below 50 using a list comprehension, and use slicing [-3:] to get the top 3 scores.',
    difficulty: 'Beginner',
    language: 'python',
    xp: 80,
    starterCode: `scores = [72, 45, 88, 60, 35, 91, 55, 78, 42, 83]\n\n# Highest, lowest, average\nprint(f"Highest: {max(scores)}")\nprint(f"Lowest:  {min(scores)}")\nprint(f"Average: {sum(scores) / len(scores):.1f}")\n\n# Sort ascending\nscores_sorted = sorted(scores)\nprint(f"Sorted:  {scores_sorted}")\n\n# Remove scores below 50 using list comprehension\npassing = [s for s in scores_sorted if s >= 50]\nprint(f"Passing: {passing}")\n\n# Top 3 (last 3 from sorted list)\ntop3 = passing[-3:]\nprint(f"Top 3:   {top3}")`,
    tags: ['lists', 'sorting', 'slicing', 'built-ins'],
  },
  {
    id: 'p05',
    title: 'Dictionary Data',
    description: 'Store and look up student records using Python dictionaries.',
    instructions:
      'Create a dictionary of 4 students where each key is a name and each value is a dict with age, grade, and score. Write a get_report(name) function that prints a formatted report card. Handle the case when the name is not found using .get() or an if check.',
    difficulty: 'Beginner',
    language: 'python',
    xp: 90,
    starterCode: `students = {\n    "Amara":  {"age": 14, "grade": "JSS3", "score": 85},\n    "Chidi":  {"age": 15, "grade": "SS1",  "score": 72},\n    "Fatima": {"age": 13, "grade": "JSS2", "score": 90},\n    "Emeka":  {"age": 16, "grade": "SS2",  "score": 67},\n}\n\ndef get_report(name):\n    if name not in students:\n        print(f"Student '{name}' not found.")\n        return\n    s = students[name]\n    print(f"--- {name}'s Report ---")\n    print(f"  Age:   {s['age']}")\n    print(f"  Grade: {s['grade']}")\n    print(f"  Score: {s['score']}")\n\nget_report("Amara")\nget_report("Bola")\nget_report("Fatima")`,
    tags: ['dictionaries', 'functions', 'key-value'],
  },
  {
    id: 'p06',
    title: 'List Comprehensions',
    description: 'Master Python list and dictionary comprehensions for concise data processing.',
    instructions:
      'Use comprehensions to: (1) generate squares of 1–10, (2) filter even numbers from a list, (3) create (number, square) tuples for 1–5, (4) build a dict mapping each name to its character count.',
    difficulty: 'Intermediate',
    language: 'python',
    xp: 100,
    starterCode: `# 1. Squares of 1 to 10\nsquares = [x**2 for x in range(1, 11)]\nprint("Squares:", squares)\n\n# 2. Even numbers from this list\nnums = [3, 8, 15, 22, 7, 44, 11, 36, 9, 50]\nevens = [n for n in nums if n % 2 == 0]\nprint("Evens:", evens)\n\n# 3. (number, square) tuple pairs for 1-5\npairs = [(x, x**2) for x in range(1, 6)]\nprint("Pairs:", pairs)\n\n# 4. Dict of name -> length\nnames = ["Ngozi", "Tunde", "Amaka", "Ibrahim", "Joy"]\nname_lengths = {name: len(name) for name in names}\nprint("Lengths:", name_lengths)`,
    tags: ['list comprehension', 'dict comprehension', 'filtering'],
  },
  {
    id: 'p07',
    title: 'Exception Handling',
    description: 'Handle errors gracefully with try, except, else, and finally.',
    instructions:
      'Write safe_divide(a, b) that raises ValueError for non-numbers and ZeroDivisionError for b=0. Then write process_list(divisors) that calls safe_divide(100, d) for each item, catching every error individually and printing a clear message.',
    difficulty: 'Intermediate',
    language: 'python',
    xp: 120,
    starterCode: `def safe_divide(a, b):\n    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):\n        raise ValueError(f"Expected numbers, got {type(a).__name__} and {type(b).__name__}")\n    if b == 0:\n        raise ZeroDivisionError("Cannot divide by zero")\n    return a / b\n\n\ndef process_list(divisors):\n    for d in divisors:\n        try:\n            result = safe_divide(100, d)\n            print(f"100 / {d} = {result:.2f}")\n        except ValueError as e:\n            print(f"ValueError: {e}")\n        except ZeroDivisionError as e:\n            print(f"ZeroDivisionError: {e}")\n        finally:\n            pass  # always runs\n\n\nprocess_list([5, 0, 4, "two", 10, 0, 25])`,
    tags: ['exceptions', 'try/except', 'error handling'],
  },
  {
    id: 'p08',
    title: 'OOP — Classes & Objects',
    description: 'Build a class hierarchy for a school system using Python OOP.',
    instructions:
      'Create a Person base class with name and age. Add Student(Person) with a scores list and methods get_average() and is_passing() (average >= 60). Add Teacher(Person) with subject and assign_grade(student, score) that appends to the student\'s scores.',
    difficulty: 'Intermediate',
    language: 'python',
    xp: 140,
    starterCode: `class Person:\n    def __init__(self, name, age):\n        self.name = name\n        self.age = age\n\n    def __str__(self):\n        return f"{self.name} (age {self.age})"\n\n\nclass Student(Person):\n    def __init__(self, name, age, grade):\n        super().__init__(name, age)\n        self.grade = grade\n        self.scores = []\n\n    def get_average(self):\n        if not self.scores:\n            return 0\n        return sum(self.scores) / len(self.scores)\n\n    def is_passing(self):\n        return self.get_average() >= 60\n\n\nclass Teacher(Person):\n    def __init__(self, name, age, subject):\n        super().__init__(name, age)\n        self.subject = subject\n\n    def assign_grade(self, student, score):\n        student.scores.append(score)\n        print(f"{self.name} gave {student.name} a score of {score}")\n\n\n# Test\nteacher = Teacher("Mr Obi", 35, "Python")\nstudent = Student("Adaeze", 14, "JSS3")\n\nteacher.assign_grade(student, 78)\nteacher.assign_grade(student, 85)\nteacher.assign_grade(student, 62)\n\nprint(f"Average: {student.get_average():.1f}")\nprint(f"Passing: {student.is_passing()}")`,
    tags: ['OOP', 'classes', 'inheritance', '__init__'],
  },
  {
    id: 'p09',
    title: 'Sorting Algorithms',
    description: 'Implement bubble sort and selection sort in Python.',
    instructions:
      'Implement bubble_sort(arr) and selection_sort(arr), each returning a sorted copy of the input. Track and print the number of comparisons each makes. Compare with Python\'s built-in sorted().',
    difficulty: 'Intermediate',
    language: 'python',
    xp: 130,
    starterCode: `def bubble_sort(arr):\n    copy = arr[:]\n    comparisons = 0\n    n = len(copy)\n    for i in range(n):\n        for j in range(n - i - 1):\n            comparisons += 1\n            if copy[j] > copy[j + 1]:\n                copy[j], copy[j + 1] = copy[j + 1], copy[j]\n    print(f"Bubble sort:    {comparisons} comparisons")\n    return copy\n\n\ndef selection_sort(arr):\n    copy = arr[:]\n    comparisons = 0\n    n = len(copy)\n    for i in range(n):\n        min_idx = i\n        for j in range(i + 1, n):\n            comparisons += 1\n            if copy[j] < copy[min_idx]:\n                min_idx = j\n        copy[i], copy[min_idx] = copy[min_idx], copy[i]\n    print(f"Selection sort: {comparisons} comparisons")\n    return copy\n\n\nnums = [64, 34, 25, 12, 22, 11, 90]\nprint("Original: ", nums)\nprint("Bubble:   ", bubble_sort(nums))\nprint("Selection:", selection_sort(nums))\nprint("Built-in: ", sorted(nums))`,
    tags: ['algorithms', 'sorting', 'bubble sort'],
  },
  {
    id: 'p10',
    title: 'Recursion & Memoization',
    description: 'Solve classic recursion problems in Python with caching.',
    instructions:
      'Implement: (1) factorial(n) recursively, (2) fibonacci(n) with a dict cache for memoization, (3) flatten(nested) that recursively unpacks a deeply nested list into a flat one.',
    difficulty: 'Intermediate',
    language: 'python',
    xp: 150,
    starterCode: `# 1. Factorial\ndef factorial(n):\n    # base: factorial(0) = 1\n    # recursive: n * factorial(n-1)\n    pass\n\nprint(factorial(6))    # 720\nprint(factorial(10))   # 3628800\n\n\n# 2. Fibonacci with memoization\ncache = {}\ndef fibonacci(n):\n    if n in cache:\n        return cache[n]\n    if n <= 1:\n        return n\n    # recursive: fib(n-1) + fib(n-2), store result in cache\n    pass\n\nprint(fibonacci(10))   # 55\nprint(fibonacci(30))   # 832040\n\n\n# 3. Flatten nested list\ndef flatten(lst):\n    result = []\n    for item in lst:\n        if isinstance(item, list):\n            result.extend(flatten(item))\n        else:\n            result.append(item)\n    return result\n\nprint(flatten([1, [2, [3, 4]], 5, [6, [7, [8]]]]))`,
    tags: ['recursion', 'memoization', 'fibonacci'],
  },
  {
    id: 'p11',
    title: 'Generators & Iterators',
    description: 'Create memory-efficient data pipelines using Python generators.',
    instructions:
      'Write: (1) fibonacci_gen() — a generator that yields Fibonacci numbers indefinitely, (2) count_up(start, step) — yields numbers from start incrementing by step. Use next() in a loop to collect the first 10 values from each.',
    difficulty: 'Advanced',
    language: 'python',
    xp: 160,
    starterCode: `# 1. Infinite Fibonacci generator\ndef fibonacci_gen():\n    a, b = 0, 1\n    while True:\n        yield a\n        a, b = b, a + b\n\ngen = fibonacci_gen()\nfib10 = [next(gen) for _ in range(10)]\nprint("Fibonacci:", fib10)  # [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]\n\n\n# 2. Count-up generator\ndef count_up(start=0, step=1):\n    current = start\n    while True:\n        yield current\n        current += step\n\nevens_gen = count_up(0, 2)\nevens = [next(evens_gen) for _ in range(8)]\nprint("Evens:", evens)  # [0, 2, 4, 6, 8, 10, 12, 14]\n\n\n# 3. Generator expression (lazy list comprehension)\nsquares_gen = (x**2 for x in range(1, 6))\nprint("Squares:", list(squares_gen))  # [1, 4, 9, 16, 25]`,
    tags: ['generators', 'yield', 'iterators', 'lazy evaluation'],
  },
  {
    id: 'p12',
    title: 'Decorators',
    description: 'Write Python decorators to add timing and logging to any function.',
    instructions:
      'Create: (1) a @timer decorator that prints how long the function took in ms, (2) a @logger decorator that prints the function name and arguments before calling it. Stack both decorators on a slow_sort(lst) function using bubble sort.',
    difficulty: 'Advanced',
    language: 'python',
    xp: 170,
    starterCode: `import time\nimport functools\n\n\n# 1. Timer decorator\ndef timer(func):\n    @functools.wraps(func)\n    def wrapper(*args, **kwargs):\n        start = time.time()\n        result = func(*args, **kwargs)\n        elapsed = (time.time() - start) * 1000\n        print(f"[timer] {func.__name__} took {elapsed:.2f}ms")\n        return result\n    return wrapper\n\n\n# 2. Logger decorator\ndef logger(func):\n    @functools.wraps(func)\n    def wrapper(*args, **kwargs):\n        print(f"[logger] Calling {func.__name__} with {args}")\n        return func(*args, **kwargs)\n    return wrapper\n\n\n# 3. Apply both decorators (timer runs outermost)\n@timer\n@logger\ndef slow_sort(lst):\n    copy = lst[:]\n    n = len(copy)\n    for i in range(n):\n        for j in range(n - i - 1):\n            if copy[j] > copy[j + 1]:\n                copy[j], copy[j + 1] = copy[j + 1], copy[j]\n    return copy\n\n\nresult = slow_sort([5, 2, 8, 1, 9, 3])\nprint("Sorted:", result)`,
    tags: ['decorators', 'higher-order functions', 'functools'],
  },
  {
    id: 'p13',
    title: 'Data Processing Pipeline',
    description: 'Process a dataset of student records using core Python.',
    instructions:
      'Given a list of student dicts, write: (1) class_stats() returning avg/highest/lowest/pass_rate, (2) group_by_grade() returning a dict of grade → [names], (3) rank_students() that prints a numbered leaderboard sorted by score.',
    difficulty: 'Advanced',
    language: 'python',
    xp: 180,
    starterCode: `students = [\n    {"name": "Amara",   "grade": "SS1",  "score": 85},\n    {"name": "Chidi",   "grade": "JSS3", "score": 72},\n    {"name": "Fatima",  "grade": "SS1",  "score": 91},\n    {"name": "Emeka",   "grade": "SS2",  "score": 67},\n    {"name": "Ngozi",   "grade": "JSS3", "score": 55},\n    {"name": "Tunde",   "grade": "SS2",  "score": 78},\n    {"name": "Adaeze",  "grade": "SS1",  "score": 88},\n    {"name": "Ibrahim", "grade": "JSS3", "score": 43},\n]\n\n\ndef class_stats(data):\n    scores = [s["score"] for s in data]\n    passing = sum(1 for s in scores if s >= 60)\n    return {\n        "average":   f"{sum(scores) / len(scores):.1f}",\n        "highest":   max(scores),\n        "lowest":    min(scores),\n        "pass_rate": f"{(passing / len(scores)) * 100:.1f}%",\n    }\n\n\ndef group_by_grade(data):\n    groups = {}\n    for s in data:\n        groups.setdefault(s["grade"], []).append(s["name"])\n    return groups\n\n\ndef rank_students(data):\n    ranked = sorted(data, key=lambda s: s["score"], reverse=True)\n    for i, s in enumerate(ranked, 1):\n        bar = "█" * (s["score"] // 10)\n        print(f"#{i:2d} {s['name']:<10} {s['score']:3d}  {bar}")\n\n\nprint("=== Class Statistics ===")\nfor k, v in class_stats(students).items():\n    print(f"  {k}: {v}")\n\nprint("\\n=== Groups by Grade ===")\nfor grade, names in sorted(group_by_grade(students).items()):\n    print(f"  {grade}: {', '.join(names)}")\n\nprint("\\n=== Rankings ===")\nrank_students(students)`,
    tags: ['data processing', 'sorting', 'grouping', 'dict'],
  },

  // ── HTML & CSS Missions ────────────────────────────────────────────────────

  {
    id: 'h01',
    title: 'Your First Web Page',
    description: 'Write a valid HTML5 document from scratch with correct structure and content.',
    instructions:
      'Create a complete HTML5 page with: DOCTYPE declaration, html/head/body tags, a meta charset tag, a title tag, an h1 heading with your name, a paragraph about yourself, and an unordered list of your 3 favourite subjects.',
    difficulty: 'Beginner',
    language: 'html',
    xp: 60,
    starterCode: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title><!-- Page title here --></title>
</head>
<body>
  <!-- h1: Your name -->

  <!-- p: A sentence about yourself -->

  <!-- ul: Three favourite subjects as list items -->

</body>
</html>`,
    tags: ['HTML', 'structure', 'doctype', 'tags'],
  },
  {
    id: 'h02',
    title: 'Style Me Up',
    description: 'Apply CSS rules to style a page with colours, fonts, and spacing.',
    instructions:
      'Given the HTML below, write CSS to: set a dark background (#1a1a2e) with white text, make the h1 orange (#f97316), centre-align the body content, add 40px padding to body, and give list items a line-height of 1.8.',
    difficulty: 'Beginner',
    language: 'html',
    xp: 70,
    starterCode: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Style Me Up</title>
  <style>
    body {
      /* background, color, padding, text-align */
    }
    h1 {
      /* color */
    }
    ul li {
      /* line-height */
    }
  </style>
</head>
<body>
  <h1>Rillcod Academy</h1>
  <p>Learning to build the web, one line at a time.</p>
  <ul>
    <li>JavaScript</li>
    <li>Python</li>
    <li>Robotics</li>
  </ul>
</body>
</html>`,
    tags: ['CSS', 'styling', 'colors', 'fonts', 'spacing'],
  },
  {
    id: 'h03',
    title: 'Flexbox Navigation Bar',
    description: 'Build a responsive navigation bar using CSS Flexbox.',
    instructions:
      'Complete the nav bar so the logo sits on the left and 4 links (Home, Courses, About, Contact) sit on the right, using justify-content: space-between. Links should change colour to #f97316 on hover. Style with a dark background (#0b132b) and 16px 32px padding.',
    difficulty: 'Intermediate',
    language: 'html',
    xp: 100,
    starterCode: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Flexbox Nav</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: sans-serif; background: #0f0f1a; color: white; }

    nav {
      display: flex;
      /* justify-content and align-items here */
      background: #0b132b;
      padding: 16px 32px;
    }

    .logo { font-size: 1.2rem; font-weight: 900; color: #f97316; }

    .nav-links { display: flex; gap: 24px; list-style: none; }

    .nav-links a {
      color: #94a3b8;
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s;
    }

    /* Add :hover rule to change link colour to #f97316 */
  </style>
</head>
<body>
  <nav>
    <div class="logo">Rillcod</div>
    <ul class="nav-links">
      <li><a href="#">Home</a></li>
      <li><a href="#">Courses</a></li>
      <li><a href="#">About</a></li>
      <li><a href="#">Contact</a></li>
    </ul>
  </nav>
</body>
</html>`,
    tags: ['Flexbox', 'nav', 'CSS', 'layout', 'hover'],
  },
  {
    id: 'h04',
    title: 'CSS Grid Photo Gallery',
    description: 'Build a responsive card gallery using CSS Grid with spanning cards.',
    instructions:
      'Use grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) to create a responsive gallery of 6 cards. Make every 3rd card span 2 columns with grid-column: span 2. Add a hover effect that scales cards up by 3% (transform: scale(1.03)).',
    difficulty: 'Intermediate',
    language: 'html',
    xp: 110,
    starterCode: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>CSS Grid Gallery</title>
  <style>
    body { background: #0f0f1a; color: white; font-family: sans-serif; padding: 32px; }
    h1 { margin-bottom: 24px; color: #f97316; }

    .gallery {
      display: grid;
      /* grid-template-columns here */
      gap: 16px;
    }

    .card {
      background: #1e1e3f;
      border: 1px solid #ffffff15;
      padding: 48px 16px;
      text-align: center;
      font-weight: 700;
      transition: transform 0.2s;
      cursor: pointer;
    }

    /* Every 3rd card spans 2 columns */
    .card:nth-child(3n) {
      /* grid-column: span 2; */
    }

    /* Hover: scale up */
    .card:hover {
      /* transform: scale(1.03); */
    }
  </style>
</head>
<body>
  <h1>Student Projects</h1>
  <div class="gallery">
    <div class="card">Project 1</div>
    <div class="card">Project 2</div>
    <div class="card">Project 3 ★</div>
    <div class="card">Project 4</div>
    <div class="card">Project 5</div>
    <div class="card">Project 6 ★</div>
  </div>
</body>
</html>`,
    tags: ['CSS Grid', 'gallery', 'responsive', 'nth-child', 'span'],
  },
  {
    id: 'h05',
    title: 'Responsive Profile Page',
    description: 'Build a mobile-first profile page that switches to a side-by-side layout on wider screens.',
    instructions:
      'Complete the CSS so on mobile everything stacks vertically (flex-direction: column). Add a @media (min-width: 640px) query that switches the .profile to flex-direction: row so the avatar and info appear side by side. Also colour the skill badges violet.',
    difficulty: 'Intermediate',
    language: 'html',
    xp: 130,
    starterCode: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Profile</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f0f1a; color: white; font-family: sans-serif; padding: 24px; }

    .profile {
      max-width: 600px;
      margin: auto;
      display: flex;
      flex-direction: column;  /* mobile: stacked */
      align-items: center;
      gap: 20px;
    }

    /* On wider screens, switch to side-by-side */
    @media (min-width: 640px) {
      .profile {
        /* flex-direction and align-items here */
      }
    }

    .avatar {
      width: 100px; height: 100px; border-radius: 50%;
      background: linear-gradient(135deg, #7c3aed, #f97316);
      flex-shrink: 0;
    }

    .info h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .info p  { color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }

    .badges { display: flex; gap: 8px; flex-wrap: wrap; }
    .badge {
      padding: 4px 12px;
      /* Add violet background, border, border-radius, font-size, color */
    }
  </style>
</head>
<body>
  <div class="profile">
    <div class="avatar"></div>
    <div class="info">
      <h1>Amara Okafor</h1>
      <p>JSS3 student at Rillcod Academy. Loves Python, robotics, and building cool things.</p>
      <div class="badges">
        <span class="badge">Python</span>
        <span class="badge">Robotics</span>
        <span class="badge">HTML & CSS</span>
      </div>
    </div>
  </div>
</body>
</html>`,
    tags: ['responsive', 'media queries', 'Flexbox', 'mobile-first'],
  },
  {
    id: 'h06',
    title: 'Semantic Blog Article',
    description: 'Structure a blog post using HTML5 semantic elements — no div-soup.',
    instructions:
      'Build a blog post page using ONLY semantic tags: header (site title + nav), main, article (h1 title, time element, 3 paragraphs, at least one strong), aside (Related Posts list), and footer. Fill in the article paragraphs about why coding matters for Nigerian students.',
    difficulty: 'Intermediate',
    language: 'html',
    xp: 120,
    starterCode: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>STEM Blog</title>
  <style>
    body { background:#0f0f1a; color:#e2e8f0; font-family:sans-serif; line-height:1.7; }
    a { color:#f97316; }
    header { background:#0b132b; padding:16px 32px; display:flex; justify-content:space-between; align-items:center; }
    nav a { margin-left:16px; text-decoration:none; }
    main { max-width:900px; margin:40px auto; padding:0 24px; display:flex; gap:32px; }
    article { flex:1; }
    aside { width:220px; flex-shrink:0; }
    footer { text-align:center; padding:24px; color:#64748b; border-top:1px solid #ffffff10; margin-top:40px; }
    time { font-size:0.85rem; color:#64748b; display:block; margin-bottom:16px; }
    aside h3 { color:#f97316; margin-bottom:8px; }
    aside ul { list-style:none; padding:0; }
    aside ul li { padding:6px 0; border-bottom:1px solid #ffffff10; }
  </style>
</head>
<body>

  <header>
    <strong>Rillcod Academy</strong>
    <nav>
      <a href="#">Home</a>
      <a href="#">Blog</a>
      <a href="#">Contact</a>
    </nav>
  </header>

  <main>
    <article>
      <h1>Why Every Nigerian Student Should Learn to Code</h1>
      <time datetime="2025-03-21">March 21, 2025</time>

      <p><!-- First paragraph: coding opens career doors in Nigeria --></p>
      <p><!-- Second paragraph: real-world STEM examples in Nigeria --></p>
      <p><!-- Third paragraph: use <strong> for emphasis + call to action --></p>
    </article>

    <aside>
      <h3>Related Posts</h3>
      <ul>
        <li><a href="#">Scratch vs Python: Which First?</a></li>
        <li><a href="#">Building Robots in JSS2</a></li>
        <li><a href="#">AI Tools for Students</a></li>
      </ul>
    </aside>
  </main>

  <footer>
    &copy; 2025 Rillcod Academy. All rights reserved.
  </footer>

</body>
</html>`,
    tags: ['semantic HTML', 'article', 'aside', 'header', 'footer', 'accessibility'],
  },

  // ── Robotics / Arduino Missions ───────────────────────────────────────────

  {
    id: 'r01',
    title: 'Blink an LED',
    description: 'Write your first Arduino sketch to blink the built-in LED on and off.',
    instructions:
      'Complete the Arduino sketch so the built-in LED (pin 13) blinks: ON for 1 second, OFF for 1 second, forever. Then explain: what does setup() do vs loop()? Why do we use delay(1000) and not delay(1)?',
    difficulty: 'Beginner',
    language: 'robotics',
    xp: 60,
    starterCode: `// Arduino Sketch — Blink LED
// The built-in LED is on pin 13

const int LED_PIN = 13;

void setup() {
  // Runs ONCE when the board powers on
  // Set LED_PIN as an OUTPUT
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  // Runs FOREVER after setup()
  digitalWrite(LED_PIN, HIGH);   // Turn LED ON
  delay(1000);                   // Wait 1 second

  // YOUR CODE: turn the LED OFF and wait 1 second
}`,
    tags: ['Arduino', 'LED', 'pinMode', 'digitalWrite', 'delay', 'blink'],
  },
  {
    id: 'r02',
    title: 'Button Controls LED',
    description: 'Use a push button as digital input to toggle an LED.',
    instructions:
      'Wire a button to pin 7 with INPUT_PULLUP mode. When pressed (reads LOW), turn on pin 13 LED. When released, turn it off. Print the button state to Serial Monitor. Explain: why do we use INPUT_PULLUP? What is a "floating pin"?',
    difficulty: 'Beginner',
    language: 'robotics',
    xp: 75,
    starterCode: `// Arduino Sketch — Button-Controlled LED

const int BUTTON_PIN = 7;
const int LED_PIN    = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);  // Pressed = LOW
  Serial.begin(9600);
}

void loop() {
  int buttonState = digitalRead(BUTTON_PIN);
  Serial.println(buttonState);   // Watch in Serial Monitor

  if (buttonState == LOW) {
    // Button pressed — turn LED ON
    digitalWrite(LED_PIN, HIGH);
  } else {
    // YOUR CODE: turn LED OFF
  }
}`,
    tags: ['Arduino', 'button', 'digitalRead', 'INPUT_PULLUP', 'Serial'],
  },
  {
    id: 'r03',
    title: 'Analogue Sensor → LED Brightness',
    description: 'Read a potentiometer and use its value to control LED brightness via PWM.',
    instructions:
      'Connect a potentiometer to A0. Read the raw value (0–1023), use map() to convert it to 0–255, then call analogWrite() on PWM pin 9 to set LED brightness. Print both raw and mapped values to Serial Monitor every 100ms.',
    difficulty: 'Beginner',
    language: 'robotics',
    xp: 80,
    starterCode: `// Arduino Sketch — Potentiometer → LED Brightness (PWM)

const int POT_PIN = A0;   // Potentiometer on analogue pin 0
const int LED_PIN = 9;    // Must be a PWM pin (~)

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int rawValue  = analogRead(POT_PIN);            // 0 to 1023
  int brightness = map(rawValue, 0, 1023, 0, 255); // Scale to PWM range

  analogWrite(LED_PIN, brightness);

  Serial.print("Raw: ");
  Serial.print(rawValue);
  Serial.print("  Brightness: ");
  Serial.println(brightness);

  delay(100);
  // Challenge: add a second LED that gets BRIGHTER as the first gets dimmer
}`,
    tags: ['Arduino', 'analogRead', 'analogWrite', 'PWM', 'map()', 'potentiometer'],
  },
  {
    id: 'r04',
    title: 'Ultrasonic Distance Alert',
    description: 'Use an HC-SR04 sensor to measure distance and trigger zone-based LED alerts.',
    instructions:
      'Wire an HC-SR04 (TRIG pin 9, ECHO pin 10). Complete getDistanceCm() using pulseIn(). In loop(): if distance < 10 cm — blink LED every 100ms (danger). If 10–30 cm — blink every 500ms (caution). If > 30 cm — LED off (safe). Print distance each loop.',
    difficulty: 'Intermediate',
    language: 'robotics',
    xp: 110,
    starterCode: `// Arduino Sketch — HC-SR04 Ultrasonic Distance Alert

const int TRIG_PIN = 9;
const int ECHO_PIN = 10;
const int LED_PIN  = 13;

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN,  OUTPUT);
  Serial.begin(9600);
}

long getDistanceCm() {
  // Send 10-microsecond trigger pulse
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // YOUR CODE: read echo with pulseIn() and convert to cm (÷ 58)
  return 0;
}

void loop() {
  long dist = getDistanceCm();
  Serial.print("Distance: "); Serial.print(dist); Serial.println(" cm");

  if (dist < 10) {
    // Danger: blink fast
    digitalWrite(LED_PIN, HIGH); delay(100);
    digitalWrite(LED_PIN, LOW);  delay(100);
  } else if (dist <= 30) {
    // YOUR CODE: caution — blink every 500ms
  } else {
    // YOUR CODE: safe — LED off
  }
}`,
    tags: ['Arduino', 'HC-SR04', 'ultrasonic', 'pulseIn', 'distance', 'sensors'],
  },
  {
    id: 'r05',
    title: 'Obstacle-Avoiding Robot',
    description: 'Program an autonomous robot to detect and steer around obstacles.',
    instructions:
      'Complete motorStop(), motorReverse(), and motorRight() using the L298N motor driver pins. The robot should: drive forward normally, and when the ultrasonic sensor reads < 15 cm — stop → reverse 500ms → turn right 600ms → continue forward. Test all three zones.',
    difficulty: 'Intermediate',
    language: 'robotics',
    xp: 140,
    starterCode: `// Arduino Sketch — Obstacle-Avoiding Robot
// Motor driver: L298N  |  Ultrasonic: HC-SR04

// Motor A (Left)
const int IN1 = 2, IN2 = 3, ENA = 5;
// Motor B (Right)
const int IN3 = 4, IN4 = 7, ENB = 6;
// Ultrasonic
const int TRIG = 9, ECHO = 10;

const int SPEED    = 200;   // PWM 0-255
const int SAFE_CM  = 15;    // Obstacle threshold

void setup() {
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(ENA, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT); pinMode(ENB, OUTPUT);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  Serial.begin(9600);
}

long getDistance() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  return pulseIn(ECHO, HIGH) / 58;
}

void motorForward() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(ENA, SPEED);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, SPEED);
}

void motorStop() {
  // YOUR CODE: set all IN and EN pins to LOW (or 0)
}

void motorReverse() {
  // YOUR CODE: flip IN1/IN2 and IN3/IN4 relative to motorForward()
}

void motorRight() {
  // YOUR CODE: left motor forward, right motor backward (pivot turn)
}

void loop() {
  long dist = getDistance();
  Serial.print("Dist: "); Serial.println(dist);

  if (dist < SAFE_CM) {
    motorStop();    delay(200);
    motorReverse(); delay(500);
    motorRight();   delay(600);
  } else {
    motorForward();
  }
}`,
    tags: ['Arduino', 'robot', 'motors', 'L298N', 'obstacle avoidance', 'autonomous'],
  },
  {
    id: 'r06',
    title: 'Servo Sweep & Wave',
    description: 'Control a Servo motor to rotate smoothly back and forth.',
    instructions:
      'Attach a servo to pin 9. Use the Servo library to attach it. In the loop, use a for loop to slowly sweep the servo from 0 to 180 degrees, then another for loop to sweep back from 180 to 0 degrees.',
    difficulty: 'Intermediate',
    language: 'robotics',
    xp: 120,
    starterCode: `// Arduino Sketch — Servo Motor Sweep
#include <Servo.h>

Servo myServo;
int pos = 0;    // variable to store the servo position

void setup() {
  myServo.attach(9);  // attaches the servo on pin 9
}

void loop() {
  // YOUR CODE: sweep from 0 to 180 degrees
  for (pos = 0; pos <= 180; pos += 1) {
    // Go to 'pos'
    // Wait ~15ms
  }
  
  // YOUR CODE: sweep back from 180 to 0 degrees
}`,
    tags: ['Arduino', 'Servo', 'motors', 'PWM'],
  },
  {
    id: 'p14',
    title: 'Pandas Data Analysis',
    description: 'Use the famous pandas library (simulated) to clean and transform datasets.',
    instructions:
      'Given a simulated pandas DataFrame, calculate the mean of the "Math" column, fill all NaN values with 0, and create a new column "Total" which is the sum of Math and Physics scores.',
    difficulty: 'Advanced',
    language: 'python',
    xp: 190,
    starterCode: `# Data Science — Pandas Simulation
# In a real environment, you'd use: import pandas as pd

dataset = [
    {"name": "Ada", "Math": 95, "Physics": 88},
    {"name": "Obi", "Math": 76, "Physics": None},
    {"name": "Chi", "Math": None, "Physics": 92},
]

# 1. Fill NaN/None with 0
def fill_na(data, value=0):
    for row in data:
        for k, v in row.items():
            if v is None:
                row[k] = value
    return data

clean_data = fill_na(dataset)

# 2. Add 'Total' column
def add_total(data):
    for row in data:
        row["Total"] = row["Math"] + row["Physics"]
    return data

final_data = add_total(clean_data)

# Print results
for d in final_data:
    print(f"{d['name']} - Math: {d['Math']}, Physics: {d['Physics']}, Total: {d['Total']}")`,
    tags: ['python', 'pandas', 'data science', 'cleaning'],
  },
  {
    id: 'h07',
    title: 'HTML5 Canvas Animations',
    description: 'Draw and animate graphics directly in the browser utilizing HTML5 <canvas>.',
    instructions:
      'Write JavaScript to draw a circle on the HTML5 <canvas>. Then, use requestAnimationFrame() to animate the circle moving across the canvas and bouncing off the walls.',
    difficulty: 'Advanced',
    language: 'html',
    xp: 200,
    starterCode: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #111; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
    canvas { background: #222; border: 2px solid #555; }
  </style>
</head>
<body>
  <canvas id="gameCanvas" width="400" height="300"></canvas>
  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    let x = 50, y = 50, dx = 3, dy = 3, radius = 15;

    function animate() {
      requestAnimationFrame(animate);
      ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear screen
      
      // Draw circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2, false);
      ctx.fillStyle = '#f97316';
      ctx.fill();
      ctx.closePath();

      // Bounce off walls
      if (x + radius > canvas.width || x - radius < 0) {
        dx = -dx;
      }
      if (y + radius > canvas.height || y - radius < 0) {
        dy = -dy;
      }

      x += dx;
      y += dy;
    }

    animate();
  </script>
</body>
</html>`,
    tags: ['HTML5', 'canvas', 'animations', 'game dev'],
  }
];

const XP_PER_LEVEL = 500;

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  Beginner: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
  Intermediate: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.15)]',
  Advanced: 'bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.15)]',
};

export default function MissionsPage() {
  const { profile, loading: authLoading } = useAuth();

  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [activeMission, setActiveMission] = useState<string | null>(null);
  const [missionCode, setMissionCode] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterType>('All');
  const [langFilter, setLangFilter] = useState<LangFilter>('all');
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
    const matchesLang = langFilter === 'all' || m.language === langFilter;
    return matchesSearch && matchesFilter && matchesLang;
  });

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-background to-background text-foreground selection:bg-indigo-500/30">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-5 mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center rounded-2xl shadow-[0_0_30px_rgba(99,102,241,0.3)] border border-white/10">
            <RocketLaunchIcon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight mb-1">Missions</h1>
            <p className="text-sm text-indigo-200/60 font-bold tracking-widest uppercase">Complete coding challenges to level up</p>
          </div>
        </motion.div>

        {/* Stats bar */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:bg-white/[0.04] transition-colors">
            <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <CheckBadgeIcon className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              <span className="text-[10px] text-white/50 uppercase tracking-widest font-black">Completed</span>
            </div>
            <p className="text-2xl font-black text-white relative z-10 drop-shadow-md">{completedIds.size} <span className="text-sm font-medium text-white/30">/ {MISSIONS.length}</span></p>
          </div>
          <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:bg-white/[0.04] transition-colors">
            <div className="absolute inset-0 bg-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <BoltIcon className="w-4 h-4 text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              <span className="text-[10px] text-white/50 uppercase tracking-widest font-black">XP Earned</span>
            </div>
            <p className="text-2xl font-black text-white relative z-10 drop-shadow-md">{totalXP}</p>
          </div>
          <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:bg-white/[0.04] transition-colors">
            <div className="absolute inset-0 bg-violet-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <TrophyIcon className="w-4 h-4 text-violet-400 drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
              <span className="text-[10px] text-white/50 uppercase tracking-widest font-black">Level</span>
            </div>
            <p className="text-2xl font-black text-white relative z-10 drop-shadow-md">{level}</p>
          </div>
          <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:bg-white/[0.04] transition-colors">
            <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <StarIcon className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
              <span className="text-[10px] text-white/50 uppercase tracking-widest font-black">Remaining XP</span>
            </div>
            <p className="text-2xl font-black text-white relative z-10 drop-shadow-md">{XP_PER_LEVEL - (totalXP % XP_PER_LEVEL)}</p>
          </div>
        </motion.div>

        {/* XP Progress bar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white/[0.02] backdrop-blur-xl border border-white/10 p-5 rounded-2xl mb-8 relative overflow-hidden">
          <div className="absolute -right-24 -top-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl" />
          <div className="flex items-center justify-between mb-3 relative z-10">
            <span className="text-xs font-black text-white/60 uppercase tracking-widest">Level {level} Progress</span>
            <span className="text-xs text-indigo-300 font-black tracking-widest uppercase">{totalXP % XP_PER_LEVEL} <span className="text-white/30">/ {XP_PER_LEVEL} XP</span></span>
          </div>
          <div className="h-2.5 bg-black/50 rounded-full overflow-hidden shadow-inner relative z-10">
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500 transition-all duration-700 ease-out shadow-[0_0_15px_rgba(168,85,247,0.5)]"
              style={{ width: `${Math.min(100, ((totalXP % XP_PER_LEVEL) / XP_PER_LEVEL) * 100)}%` }}
            />
          </div>
        </motion.div>

        {/* Language + Search + Filter */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-col gap-4 mb-8">
          {/* Language selector */}
          <div className="flex gap-2 flex-wrap">
            {([
              { value: 'all', label: 'All Languages' },
              { value: 'javascript', label: 'JavaScript' },
              { value: 'python', label: 'Python' },
              { value: 'html', label: 'HTML' },
              { value: 'robotics', label: 'Robotics' },
            ] as { value: LangFilter; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setLangFilter(value)}
                className={`px-4 py-2 text-[11px] uppercase tracking-widest font-black transition-all rounded-xl border ${
                  langFilter === value
                    ? 'bg-gradient-to-r from-rose-500 to-orange-500 border-transparent text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                    : 'bg-white/[0.03] border-white/10 text-white/50 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Search + difficulty filter */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Search missions..."
                className="w-full pl-11 pr-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] text-white placeholder:text-white/30 transition-all font-medium"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['All', 'Beginner', 'Intermediate', 'Advanced', 'Completed'] as FilterType[]).map(
                (f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-2 text-[11px] uppercase tracking-widest font-black transition-all rounded-xl border ${
                      filter === f
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 border-transparent text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                        : 'bg-white/[0.03] border-white/10 text-white/50 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    {f}
                  </button>
                )
              )}
            </div>
          </div>
        </motion.div>

        {/* Mission grid */}
        {filteredMissions.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-24">
            <div className="w-20 h-20 bg-white/[0.02] border border-white/10 rounded-3xl flex items-center justify-center mx-auto mb-6 transform rotate-12">
              <RocketLaunchIcon className="w-10 h-10 text-white/20" />
            </div>
            <p className="text-white font-black text-xl mb-2 tracking-tight">No missions found</p>
            <p className="text-white/50 text-sm font-medium">Try tweaking your search or applying different filters.</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <AnimatePresence>
            {filteredMissions.map((mission, idx) => {
              const isCompleted = completedIds.has(mission.id);
              const isActive = activeMission === mission.id;

              return (
                <motion.div
                  key={mission.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                  className={`bg-white/[0.02] backdrop-blur-xl rounded-3xl overflow-hidden transition-all duration-300 border ${
                    isCompleted ? 'border-emerald-500/30 inset-shadow-[0_0_20px_rgba(16,185,129,0.05)]' : isActive ? 'border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/50' : 'border-white/5 hover:border-white/20 hover:bg-white/[0.04]'
                  } ${isActive ? 'md:col-span-2' : ''}`}
                >
                  {/* Mission card header */}
                  <div className="p-6 lg:p-8 relative overflow-hidden">
                    {/* Background glow if active */}
                    {isActive && <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] -z-10 pointer-events-none translate-x-1/3 -translate-y-1/3" />}
                    
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-3 border-b border-white/5 pb-3">
                          <span
                            className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border ${DIFFICULTY_STYLES[mission.difficulty]}`}
                          >
                            {mission.difficulty}
                          </span>
                          <span className="px-3 py-1 bg-white/[0.05] border border-white/10 rounded-full text-[9px] uppercase font-black tracking-widest text-white/70">
                            {mission.language}
                          </span>
                          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-amber-400 font-black tracking-widest bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                            <BoltIcon className="w-3.5 h-3.5" />
                            {mission.xp} XP
                          </span>
                        </div>
                        <h3 className="font-black text-white text-xl mb-2 tracking-tight drop-shadow-sm">{mission.title}</h3>
                        <p className="text-sm text-white/60 leading-relaxed font-medium">{mission.description}</p>
                      </div>
                      {isCompleted && (
                        <div className="flex-shrink-0 bg-emerald-500/10 p-2.5 rounded-2xl border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] transform rotate-12">
                          <CheckBadgeIcon className="w-8 h-8 text-emerald-400" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-5">
                      {mission.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1 bg-black/40 border border-white/5 rounded-lg text-[10px] text-white/40 font-black font-mono tracking-widest uppercase"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 mt-6 pt-6 border-t border-white/5">
                      <button
                        onClick={() =>
                          setActiveMission(isActive ? null : mission.id)
                        }
                        className={`flex items-center justify-center min-w-[140px] gap-2 px-5 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${
                          isActive
                            ? 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                            : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] hover:-translate-y-0.5'
                        }`}
                      >
                        {isActive ? (
                          <>
                            <XMarkIcon className="w-4 h-4" />
                            Close
                          </>
                        ) : (
                          <>
                            <CodeBracketIcon className="w-4 h-4" />
                            {isCompleted ? 'Review Code' : 'Start Mission'}
                          </>
                        )}
                      </button>
                      {isCompleted && (
                        <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-black ml-auto uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                          <CheckCircleIcon className="w-4 h-4" />
                          Validated
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded mission area */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-white/10 bg-black/50">
                        {/* Instructions */}
                        <div className="px-8 py-6 bg-indigo-500/5 border-b border-indigo-500/10 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <RocketLaunchIcon className="w-4 h-4" /> Mission Briefing
                          </p>
                          <p className="text-[15px] text-white/80 leading-relaxed font-medium">{mission.instructions}</p>
                        </div>

                        {/* Code editor */}
                        <div className="relative border-b border-white/5">
                          <CodeEditor
                            value={missionCode[mission.id] ?? mission.starterCode}
                            onChange={(v) =>
                              setMissionCode((prev) => ({
                                ...prev,
                                [mission.id]: v || '',
                              }))
                            }
                            language={mission.language}
                            height={450}
                            title={mission.title}
                            showHeader={true}
                          />
                        </div>

                        {/* AI Hint + Mark Complete */}
                        <div className="px-8 py-5 flex flex-wrap items-center gap-4 bg-white/[0.02]">
                          <button
                            onClick={() =>
                              hints[mission.id]
                                ? toggleHint(mission.id)
                                : getHint(mission)
                            }
                            disabled={hintLoading === mission.id}
                            className="flex items-center gap-2 px-5 py-3 text-[11px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all rounded-xl disabled:opacity-50 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                          >
                            <LightBulbIcon className="w-4 h-4" />
                            {hintLoading === mission.id
                              ? 'Getting hint...'
                              : hints[mission.id]
                              ? showHints.has(mission.id)
                                ? 'Hide Hint'
                                : 'Request Intel'
                              : 'Request Intel'}
                          </button>

                          {!isCompleted && (
                            <button
                              onClick={() => markComplete(mission.id)}
                              className="flex items-center gap-2 px-6 py-3 text-[11px] font-black uppercase tracking-widest bg-emerald-500/20 border border-emerald-500/50 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] ml-auto"
                            >
                              <CheckBadgeIcon className="w-5 h-5" />
                              Submit Solution (+{mission.xp} XP)
                            </button>
                          )}
                          {isCompleted && (
                            <span className="ml-auto flex items-center gap-2 text-[11px] text-emerald-400 font-black uppercase tracking-widest bg-emerald-500/10 px-5 py-3 border border-emerald-500/30 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                              <CheckBadgeIcon className="w-5 h-5" />
                              Data Validated
                            </span>
                          )}
                        </div>

                        {/* Hint panel */}
                        <AnimatePresence>
                          {hints[mission.id] && showHints.has(mission.id) && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="px-8 pb-6">
                              <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.15)] relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/20 rounded-full blur-[40px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
                                <div className="flex items-center gap-2 mb-3 relative z-10">
                                  <LightBulbIcon className="w-5 h-5 text-amber-400 animate-pulse drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                                    AI Assist Intel
                                  </span>
                                </div>
                                <p className="text-[14px] text-amber-100/90 leading-relaxed font-medium relative z-10">{hints[mission.id]}</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
