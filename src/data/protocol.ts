import {
  CodeBracketIcon,
  BeakerIcon,
  CpuChipIcon,
  BoltIcon,
  RocketLaunchIcon,
  StarIcon,
  BookOpenIcon
} from '@/lib/icons';

export type RunnerLanguage = 'javascript' | 'python' | 'html' | 'robotics';

export interface ProtocolModule {
  id: string;
  title: string;
  description: string;
  language: RunnerLanguage;
  icon: 'code' | 'beaker' | 'cpu' | 'bolt' | 'rocket' | 'star' | 'book';
  starterCode: string;
  aiPrompt: string;
}

export interface ProtocolPhase {
  id: number;
  name: string;
  subtitle: string;
  color: string;
  accentColor: string;
  modules: ProtocolModule[];
}

// ── TRACK 1: ISOLATED PYTHON MASTERY (Phases 1-12) ──
const PYTHON_TRACK: ProtocolPhase[] = [
  {
    id: 1,
    name: 'Phase 1: Python Foundation',
    subtitle: 'The Journey Begins: Syntax and Variables',
    color: 'border-emerald-500/40',
    accentColor: 'text-emerald-400',
    modules: [
      { id: 'py1m1', title: 'The Print Protocol', description: 'Outputting data to the console', language: 'python', icon: 'code', starterCode: 'print("Hello Python Pioneer!")\nprint(10 + 20)', aiPrompt: 'Explain how the print function works and the basics of strings and integers.' },
      { id: 'py1m2', title: 'Python: Emoji Printer', description: 'Using string multiplication for patterns', language: 'python', icon: 'star', starterCode: 'print("🌟" * 10)\nprint("🚀 MISSION START")', aiPrompt: 'Explain string multiplication and console output.' },
      { id: 'py1m3', title: 'Creative Variables', description: 'Storing data in named containers', language: 'python', icon: 'beaker', starterCode: 'hero_name = "Rillcod"\nlevel = 1\nprint(f"{hero_name} at level {level}")', aiPrompt: 'Explain variables, names, and f-strings for beginners.' },
      {
        id: 'p1m5',
        title: "Python Fundamentals",
        description: "Python syntax, lists, and basic programs",
        language: 'python',
        icon: 'cpu',
        starterCode: `# Python is clean and readable
name = "Chioma"
age = 17
scores = [85, 92, 78, 95, 88]

# List operations
print(f"Student: {name}, Age: {age}")
print(f"Scores: {scores}")
print(f"Average: {sum(scores)/len(scores):.1f}")
print(f"Highest: {max(scores)}")
print(f"Lowest: {min(scores)}")

# Loop through scores
for i, score in enumerate(scores, 1):
    status = "Pass" if score >= 60 else "Fail"
    print(f"  Test {i}: {score} — {status}")`,
        aiPrompt: "Explain Python fundamentals: syntax differences from other languages, lists, f-strings, and the enumerate function."
      }
    ]
  },
  {
    id: 2,
    name: 'Phase 2: Python Decisions',
    subtitle: 'Branching Logic with If-Else',
    color: 'border-blue-500/40',
    accentColor: 'text-blue-400',
    modules: [
      { id: 'py2m1', title: 'Logic Gates', description: 'Making choices in code', language: 'python', icon: 'bolt', starterCode: 'score = 85\nif score >= 90: print("A")\nelse: print("Keep coding!")', aiPrompt: 'Explain if/else statements and comparison operators.' }
    ]
  },
  {
    id: 3,
    name: 'Phase 3: Python Iteration',
    subtitle: 'Mastering Loops and Collections',
    color: 'border-violet-500/40',
    accentColor: 'text-violet-400',
    modules: [
      { id: 'py3m1', title: 'Loop Cycles', description: 'Repeating tasks with For loops', language: 'python', icon: 'rocket', starterCode: 'for i in range(5): print(f"Ship {i} launch!")', aiPrompt: 'Explain the range function and loop mechanics.' }
    ]
  },
  {
    id: 4,
    name: 'Phase 4: Python Functions',
    subtitle: 'Modular and Reusable Logic',
    color: 'border-amber-500/40',
    accentColor: 'text-amber-400',
    modules: [
      { id: 'py4m1', title: 'Logic Recipes', description: 'Defining custom functions', language: 'python', icon: 'code', starterCode: 'def test(): pass', aiPrompt: 'Explain functions.' }
    ]
  },
  {
    id: 5,
    name: 'Phase 5: Python OOP I',
    subtitle: 'Classes and Blueprints',
    color: 'border-orange-500/40',
    accentColor: 'text-orange-400',
    modules: [
      { id: 'py5m1', title: 'Class Factory', description: 'Creating object templates', language: 'python', icon: 'cpu', starterCode: 'class Robot: pass', aiPrompt: 'Explain classes.' },
      {
        id: 'p2m6',
        title: "Python OOP Foundations",
        description: "Model real-world entities with classes and objects",
        language: 'python',
        icon: 'beaker',
        starterCode: `# Object-Oriented Programming in Python
# Real-world modelling: a school system

class Person:
    def __init__(self, name, age):
        self.name = name
        self.age  = age

    def __str__(self):
        return f"{self.name} (age {self.age})"


class Student(Person):
    def __init__(self, name, age, grade):
        super().__init__(name, age)
        self.grade  = grade
        self.scores = []

    def add_score(self, subject, score):
        self.scores.append({"subject": subject, "score": score})

    def average(self):
        if not self.scores:
            return 0
        return sum(s["score"] for s in self.scores) / len(self.scores)

    def report(self):
        print(f"=== {self.name} | {self.grade} ===")
        for s in self.scores:
            print(f"  {s['subject']:<12} {s['score']}")
        print(f"  {'Average':<12} {self.average():.1f}")
        print(f"  {'Status':<12} {'Pass' if self.average() >= 60 else 'Fail'}")


class Teacher(Person):
    def __init__(self, name, age, subject):
        super().__init__(name, age)
        self.subject = subject

    def grade_student(self, student, score):
        student.add_score(self.subject, score)
        print(f"{self.name} graded {student.name}: {score}/100")


# Usage
teacher = Teacher("Mr Obi", 35, "Python & AI")
amara   = Student("Amara",  15, "SS1")
chidi   = Student("Chidi",  14, "JSS3")

teacher.grade_student(amara, 88)
teacher.grade_student(amara, 92)
teacher.grade_student(chidi, 74)
teacher.grade_student(chidi, 68)

amara.report()
chidi.report()`,
        aiPrompt: "Explain Python OOP: classes vs objects, __init__, self, inheritance with super(), and __str__. How does OOP help organise real-world data?"
      }
    ]
  },
  {
    id: 6,
    name: 'Phase 6: Python Data Maps',
    subtitle: 'Dictionaries and Mappings',
    color: 'border-cyan-500/40',
    accentColor: 'text-cyan-400',
    modules: [
      { id: 'py6m1', title: 'Data Mapping', description: 'Storing related items', language: 'python', icon: 'book', starterCode: 'stats = {}', aiPrompt: 'Explain dicts.' },
      {
        id: 'p3m6',
        title: "Python Data Processing",
        description: "Read, transform, and summarise datasets in pure Python",
        language: 'python',
        icon: 'beaker',
        starterCode: `# Data Processing Pipeline — no libraries needed
# Simulates reading a CSV of student results

RAW_CSV = """name,subject,score,term
Amara,Python,88,Term1
Chidi,Python,74,Term1
Fatima,Robotics,91,Term1
Amara,Robotics,85,Term1
Chidi,Robotics,67,Term1
Fatima,Python,95,Term1
Emeka,Python,55,Term2
Emeka,Robotics,72,Term2
Amara,Python,90,Term2
Chidi,Python,81,Term2
"""

def parse_csv(raw):
    lines = raw.strip().split("\\n")
    headers = lines[0].split(",")
    return [dict(zip(headers, row.split(","))) for row in lines[1:]]

def class_stats(records):
    scores = [int(r["score"]) for r in records]
    passing = sum(1 for s in scores if s >= 60)
    return {
        "count":     len(scores),
        "average":   f"{sum(scores)/len(scores):.1f}",
        "highest":   max(scores),
        "lowest":    min(scores),
        "pass_rate": f"{passing/len(scores)*100:.0f}%",
    }

def by_student(records):
    groups = {}
    for r in records:
        groups.setdefault(r["name"], []).append(int(r["score"]))
    return {name: f"{sum(s)/len(s):.1f}" for name, s in groups.items()}

def by_subject(records):
    groups = {}
    for r in records:
        groups.setdefault(r["subject"], []).append(int(r["score"]))
    return {subj: f"{sum(s)/len(s):.1f}" for subj, s in groups.items()}

data = parse_csv(RAW_CSV)

print("=== Class Stats ===")
for k, v in class_stats(data).items():
    print(f"  {k}: {v}")

print("\\n=== Average by Student ===")
for name, avg in sorted(by_student(data).items()):
    print(f"  {name}: {avg}")

print("\\n=== Average by Subject ===")
for subj, avg in by_subject(data).items():
    print(f"  {subj}: {avg}")`,
        aiPrompt: "Explain how to process tabular data in Python without external libraries: parsing CSV manually, grouping with dicts, and computing aggregate statistics."
      }
    ]
  },
  {
    id: 7,
    name: 'Phase 7: Python Shields',
    subtitle: 'Error and Exception Handling',
    color: 'border-rose-500/40',
    accentColor: 'text-rose-400',
    modules: [
      { id: 'py7m1', title: 'Try/Except', description: 'Graceful crash prevention', language: 'python', icon: 'bolt', starterCode: 'try: pass', aiPrompt: 'Explain exceptions.' },
      {
        id: 'p6m1',
        title: "Encryption & Hashing",
        description: "Protecting user data and passwords",
        language: 'python',
        icon: 'code',
        starterCode: `# Simulating basic hashing in Python using hashlib
import hashlib

def secure_password(password: str) -> str:
    # We use SHA-256 for a modern cryptographic hash
    # In real applications, always use a salt (e.g. bcrypt/argon2)
    hasher = hashlib.sha256()
    hasher.update(password.encode('utf-8'))
    return hasher.hexdigest()

print("=== User Database Security ===")
user_password = "super_secret_password_123"
hashed = secure_password(user_password)

print(f"Original Password: {user_password}")
print(f"Stored Hash inside Database: {hashed}")
print("\\nNotice how the hash looks like random gibberish.")
print("Even if a hacker steals the database, they cannot easily reverse this hash!")
`,
        aiPrompt: "Explain cryptography basics, hashing algorithms (like SHA-256), the difference between encryption and hashing, and why storing plain-text passwords is a catastrophic security failure."
      },
      {
        id: 'p6m2',
        title: "Network Traffic & Firewalls",
        description: "Understanding IP packets and blocking threats",
        language: 'python',
        icon: 'beaker',
        starterCode: `# Simulating a basic Software Firewall
class Firewall:
    def __init__(self):
        self.blocked_ips = {"192.168.1.100", "10.0.0.5"}
        
    def allow_traffic(self, ip_address, packet_data):
        if ip_address in self.blocked_ips:
            print(f"[BLOCKED] Packet dropped from {ip_address}")
            return False
        
        if "malware_payload" in packet_data:
            print(f"[BLOCKED] Malicious signature detected from {ip_address}")
            self.blocked_ips.add(ip_address)
            return False
            
        print(f"[ALLOWED] Packet accepted from {ip_address}")
        return True

fw = Firewall()
print("Analyzing Incoming Network Traffic...\\n")

fw.allow_traffic("192.168.1.50", "GET /index.html")
fw.allow_traffic("10.0.0.5", "GET /admin")
fw.allow_traffic("172.16.0.10", "POST /login\\nmalware_payload_execute")
fw.allow_traffic("172.16.0.10", "GET /") # Now it should be blocked
`,
        aiPrompt: "Explain how computer networks communicate via packets, the role of IP addresses, and how firewalls protect servers from DDoS attacks and malware."
      }
    ]
  },
  {
    id: 8,
    name: 'Phase 8: Pythonic Speed',
    subtitle: 'Efficiency and Advanced Syntax',
    color: 'border-fuchsia-500/40',
    accentColor: 'text-fuchsia-400',
    modules: [
      { id: 'py8m1', title: 'Comprehensions', description: 'Compact list logic', language: 'python', icon: 'star', starterCode: 'L = [x for x in [1,2]]', aiPrompt: 'Explain list comps.' },
      {
        id: 'p2m4',
        title: "Python Data Science Basics",
        description: "Analyzing data with Python",
        language: 'python',
        icon: 'cpu',
        starterCode: `# Analyzing student data with Python
students = [
    {"name": "Ada", "score": 92, "grade": "A"},
    {"name": "Bola", "score": 78, "grade": "B"},
    {"name": "Chidi", "score": 85, "grade": "B"},
    {"name": "Dami", "score": 61, "grade": "C"},
    {"name": "Emeka", "score": 95, "grade": "A"}
    ]

scores = [s["score"] for s in students]
print(f"Total students: {len(students)}")
print(f"Average score: {sum(scores)/len(scores):.1f}")
print(f"Highest: {max(scores)}")
print(f"Lowest: {min(scores)}")

# Grade distribution
from collections import Counter
grades = Counter(s["grade"] for s in students)
print("Grade distribution:", dict(grades))

# Students above average
avg = sum(scores) / len(scores)
above_avg = [s["name"] for s in students if s["score"] > avg]
print("Above average:", above_avg)`,
        aiPrompt: "Explain list comprehensions and the Counter class in Python. How are they used for data analysis?"
      }
    ]
  },
  {
    id: 9,
    name: 'Phase 9: Distribution',
    subtitle: 'Modules and Standard Library',
    color: 'border-indigo-500/40',
    accentColor: 'text-indigo-400',
    modules: [
      { id: 'py9m1', title: 'Standard Lib', description: 'Using built-in packages', language: 'python', icon: 'book', starterCode: 'import os', aiPrompt: 'Explain modules.' },
      {
        id: 'p4m6',
        title: "Database & SQL Concepts",
        description: "Query, filter, and join relational data like a backend engineer",
        language: 'python',
        icon: 'book',
        starterCode: `# SQL concepts simulated in Python
# In a real app: use PostgreSQL / Supabase with these exact SQL patterns

# ── Our "tables" (normally rows in a database) ──
students = [
    {"id": 1, "name": "Amara",  "grade": "SS1",  "school_id": 1},
    {"id": 2, "name": "Chidi",  "grade": "JSS3", "school_id": 1},
    {"id": 3, "name": "Fatima", "grade": "SS2",  "school_id": 2},
    {"id": 4, "name": "Emeka",  "grade": "SS1",  "school_id": 2}
    ]

enrollments = [
    {"student_id": 1, "course": "Python",   "score": 88},
    {"student_id": 1, "course": "Robotics", "score": 85},
    {"student_id": 2, "course": "Python",   "score": 74},
    {"student_id": 3, "course": "Python",   "score": 95},
    {"student_id": 3, "course": "Robotics", "score": 91},
    {"student_id": 4, "course": "Robotics", "score": 67}
    ]

schools = [{"id": 1, "name": "Lagos STEM High"}, {"id": 2, "name": "Abuja Tech Academy"}]

# ── SELECT with WHERE ──
# SQL: SELECT * FROM students WHERE grade = 'SS1'
ss1_students = [s for s in students if s["grade"] == "SS1"]
print("SS1 students:", [s["name"] for s in ss1_students])

# ── JOIN: students + enrollments ──
# SQL: SELECT s.name, e.course, e.score FROM students s JOIN enrollments e ON s.id = e.student_id
joined = [
    {**s, "course": e["course"], "score": e["score"]}
    for s in students
    for e in enrollments
    if s["id"] == e["student_id"]
]
print("\\nJoined records:")
for r in joined:
    print(f"  {r['name']:<10} {r['course']:<12} {r['score']}")

# ── GROUP BY + AVG ──
# SQL: SELECT student_id, AVG(score) FROM enrollments GROUP BY student_id
from collections import defaultdict
groups = defaultdict(list)
for e in enrollments:
    groups[e["student_id"]].append(e["score"])

print("\\nAverage scores by student:")
for sid, scores in groups.items():
    name = next(s["name"] for s in students if s["id"] == sid)
    print(f"  {name}: {sum(scores)/len(scores):.1f}")`,
        aiPrompt: "Explain relational databases and SQL: tables, primary keys, foreign keys, SELECT/WHERE/JOIN/GROUP BY. How does Supabase (PostgreSQL) relate to these concepts?"
      }
    ]
  },
  {
    id: 10,
    name: 'Phase 10: Concurrency',
    subtitle: 'Asyncio and Parallel Workflows',
    color: 'border-slate-500/40',
    accentColor: 'text-slate-400',
    modules: [
      { id: 'py10m1', title: 'Async Work', description: 'Non-blocking Python', language: 'python', icon: 'bolt', starterCode: 'import asyncio', aiPrompt: 'Explain async.' }
    ]
  },
  {
    id: 11,
    name: 'Phase 11: Machine Intel',
    subtitle: 'AI Engineering Foundations',
    color: 'border-purple-500/40',
    accentColor: 'text-purple-400',
    modules: [
      { id: 'py11m1', title: 'Neuron Math', description: 'Logic of learning models', language: 'python', icon: 'cpu', starterCode: 'w = 0.5', aiPrompt: 'Explain AI weights.' },
      {
        id: 'p4m4',
        title: "AI & Machine Learning Intro",
        description: "Understand AI concepts with code examples",
        language: 'python',
        icon: 'star',
        starterCode: `# Introduction to Machine Learning Concepts
# Implementing a simple linear regression from scratch

def mean(values):
    return sum(values) / len(values)

def linear_regression(x_data, y_data):
    """Calculate slope (m) and intercept (b) for y = mx + b"""
    n = len(x_data)
    x_mean = mean(x_data)
    y_mean = mean(y_data)

    # Calculate slope
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_data, y_data))
    denominator = sum((x - x_mean) ** 2 for x in x_data)
    slope = numerator / denominator

    # Calculate intercept
    intercept = y_mean - slope * x_mean
    return slope, intercept

def predict(x, slope, intercept):
    return slope * x + intercept

# Study hours vs exam scores
hours_studied = [1, 2, 3, 4, 5, 6, 7, 8]
exam_scores   = [45, 55, 60, 65, 70, 75, 82, 90]

slope, intercept = linear_regression(hours_studied, exam_scores)
print(f"Model: score = {slope:.2f} * hours + {intercept:.2f}")

# Predictions
for hours in [3.5, 5, 9]:
    pred = predict(hours, slope, intercept)
    print(f"Predicted score for {hours}h study: {pred:.1f}")`,
        aiPrompt: "Explain machine learning in simple terms. What is linear regression? How do computers learn from data? What are real-world STEM applications?"
      },
      {
        id: 'p4m7',
        title: "Neural Network Concepts",
        description: "Build a tiny neural network from scratch to understand how AI learns",
        language: 'python',
        icon: 'star',
        starterCode: `# Tiny Neural Network from scratch — no libraries
# 1 hidden layer, sigmoid activation, backpropagation

import math, random

random.seed(42)

def sigmoid(x):     return 1 / (1 + math.exp(-x))
def sigmoid_d(x):   return x * (1 - x)  # derivative (x already activated)

# ── Network: 2 inputs → 2 hidden → 1 output ──
W1 = [[random.uniform(-1,1) for _ in range(2)] for _ in range(2)]  # 2x2
b1 = [random.uniform(-1,1) for _ in range(2)]
W2 = [random.uniform(-1,1) for _ in range(2)]                      # 1x2
b2 = random.uniform(-1,1)

def forward(x):
    # Hidden layer
    h = [sigmoid(sum(W1[j][i]*x[i] for i in range(2)) + b1[j]) for j in range(2)]
    # Output
    out = sigmoid(sum(W2[j]*h[j] for j in range(2)) + b2)
    return h, out

def train(X, y, lr=0.5, epochs=2000):
    global W1, b1, W2, b2
    for epoch in range(epochs):
        total_loss = 0
        for xi, yi in zip(X, y):
            h, out = forward(xi)
            loss = (out - yi) ** 2
            total_loss += loss
            # Backprop output → W2, b2
            d_out = 2 * (out - yi) * sigmoid_d(out)
            for j in range(2): W2[j] -= lr * d_out * h[j]
            b2 -= lr * d_out
            # Backprop hidden → W1, b1
            for j in range(2):
                dh = d_out * W2[j] * sigmoid_d(h[j])
                for i in range(2): W1[j][i] -= lr * dh * xi[i]
                b1[j] -= lr * dh
        if (epoch + 1) % 500 == 0:
            print(f"Epoch {epoch+1:4d} | Loss: {total_loss/len(X):.4f}")

# XOR problem — a classic neural net test
X = [[0,0],[0,1],[1,0],[1,1]]
y = [0, 1, 1, 0]

train(X, y)

print("\\nPredictions after training:")
for xi, yi in zip(X, y):
    _, pred = forward(xi)
    print(f"  Input {xi} → Predicted: {pred:.3f} | Expected: {yi}")`,
        aiPrompt: "Explain how neural networks learn: neurons, weights, biases, activation functions (sigmoid), forward pass, loss function, backpropagation, and gradient descent. Why is the XOR problem a classic test?"
      }
    ]
  },
  {
    id: 12,
    name: 'Phase 12: Python Capstone',
    subtitle: 'Industrial System Architecture',
    color: 'border-white/20',
    accentColor: 'text-white',
    modules: [
      { id: 'py12m1', title: 'The Architect', description: 'Final Synthesis Synthesis', language: 'python', icon: 'book', starterCode: 'pass', aiPrompt: 'Final project review.' },
      {
        id: 'p7m1',
        title: "Building an ML Pipeline",
        description: "Data cleaning, training, and inference",
        language: 'python',
        icon: 'cpu',
        starterCode: `# Pseudocode for an ML Pipeline using scikit-learn
import numpy as np

# 1. Dataset (Hours Studied vs. Exam Score)
X = np.array([[1], [2], [3], [4], [5]]) # Input: Hours
y = np.array([45, 50, 60, 68, 80])      # Output: Score

# 2. Define Mode (Linear Regression)
print("Initializing Linear Regression Model...")
class SimpleLinearRegression:
    def __init__(self): self.weight, self.bias = 0, 0
    def fit(self, X, y):
        self.weight = 8.5 # Simulated calculated weight
        self.bias = 35.0  # Simulated bias
    def predict(self, x):
        return self.weight * x + self.bias

model = SimpleLinearRegression()

# 3. Train Model
print("Training Model on exam data...")
model.fit(X, y)

# 4. Inference (Prediction)
new_student_hours = 6
predicted_score = model.predict(new_student_hours)

print(f"\\nStudent studying {new_student_hours} hours is predicted to score: {predicted_score}%")
`,
        aiPrompt: "Explain the Machine Learning lifecycle: collecting data, feature engineering, model training, evaluation, and inference. How does linear regression work simply?"
      }
    ]
  }
];
// ── TRACK 2: ISOLATED JAVASCRIPT MASTERY (Phases 1-12) ──
const JAVASCRIPT_TRACK: ProtocolPhase[] = [
  { id: 13, name: 'Phase 1: JS Foundation', subtitle: 'Digital Foundations of the Web', color: 'border-emerald-500/40', accentColor: 'text-emerald-400', modules: [
    { id: 'js1m1', title: 'JS Hello', description: 'Console outputs', language: 'javascript', icon: 'code', starterCode: 'console.log("Hi");', aiPrompt: 'Explain console.' },
      {
        id: 'p1m1',
        title: "Introduction to Programming",
        description: "Variables, data types, and your first program",
        language: 'javascript',
        icon: 'code',
        starterCode: `// Welcome to Programming!
// A variable stores data
let myName = 'Student';
let myAge = 16;
let isCoder = true;

console.log('Name:', myName);
console.log('Age:', myAge);
console.log('Is a coder:', isCoder);

// Try changing the values above!`,
        aiPrompt: "Explain the concept of variables and data types in programming in simple terms for a beginner student."
      }
  ]},
  { id: 14, name: 'Phase 2: JS Logic', subtitle: 'Decision Branching', color: 'border-blue-500/40', accentColor: 'text-blue-400', modules: [
    { id: 'js2m1', title: 'JS If/Else', description: 'Boolean choice gates', language: 'javascript', icon: 'bolt', starterCode: 'if(true){}', aiPrompt: 'Explain if.' },
      {
        id: 'p1m2',
        title: "Control Flow",
        description: "If/else statements and conditional logic",
        language: 'javascript',
        icon: 'bolt',
        starterCode: `const score = 75;

if (score >= 90) {
  console.log('Grade: A — Outstanding!');
} else if (score >= 80) {
  console.log('Grade: B — Well done!');
} else if (score >= 70) {
  console.log('Grade: C — Good effort!');
} else if (score >= 60) {
  console.log('Grade: D — Keep trying!');
} else {
  console.log('Grade: F — Needs improvement.');
}

// Change score and observe the output`,
        aiPrompt: "Explain if/else conditional statements in programming. How does control flow work? Give a real-world analogy."
      }
  ]},
  { id: 15, name: 'Phase 3: JS Iteration', subtitle: 'Loops and Arrays', color: 'border-violet-500/40', accentColor: 'text-violet-400', modules: [
    { id: 'js3m1', title: 'JS Loops', description: 'Iterative repeat cycles', language: 'javascript', icon: 'rocket', starterCode: 'for(;;)', aiPrompt: 'Explain for.' },
      {
        id: 'p1m3',
        title: "Loops & Iteration",
        description: "Repeating actions with for and while loops",
        language: 'javascript',
        icon: 'rocket',
        starterCode: `// for loop — when you know how many times
for (let i = 1; i <= 5; i++) {
  console.log(\`Lap \${i}: running!\`);
}

console.log('---');

// while loop — when condition-based
let fuel = 10;
while (fuel > 0) {
  console.log(\`Fuel remaining: \${fuel}\`);
  fuel -= 3;
}
console.log('Tank empty!');`,
        aiPrompt: "Explain for loops and while loops in programming. When would you use each? Provide examples relevant to a student."
      }
  ]},
  { id: 16, name: 'Phase 4: JS Functions', subtitle: 'Reusable Block Modules', color: 'border-amber-500/40', accentColor: 'text-amber-400', modules: [
    { id: 'js4m1', title: 'Arrow Functions', description: 'Modern JS methods', language: 'javascript', icon: 'beaker', starterCode: '() => {}', aiPrompt: 'Explain arrows.' },
      {
        id: 'p1m4',
        title: "Functions",
        description: "Creating reusable blocks of code",
        language: 'javascript',
        icon: 'beaker',
        starterCode: `// Functions are reusable recipes
function greet(name) {
  return \`Hello, \${name}! Welcome to STEM.\`;
}

function calculateBMI(weight, height) {
  return (weight / (height * height)).toFixed(2);
}

console.log(greet('Amara'));
console.log(greet('Chidi'));
console.log('BMI:', calculateBMI(60, 1.7));`,
        aiPrompt: "Explain functions in programming — what they are, why we use them, parameters vs arguments, and return values. Use simple examples."
      }
  ]},
  { id: 17, name: 'Phase 5: JS OOP', subtitle: 'Objects and Data Blueprints', color: 'border-orange-500/40', accentColor: 'text-orange-400', modules: [
    { id: 'js5m1', title: 'JS Classes', description: 'Modeling complex state', language: 'javascript', icon: 'cpu', starterCode: 'class X {}', aiPrompt: 'Explain classes.' },
      {
        id: 'p2m1',
        title: "Arrays & Data Manipulation",
        description: "Sorting, filtering, and transforming data",
        language: 'javascript',
        icon: 'code',
        starterCode: `const students = [
  { name: 'Ada', score: 92, subject: 'Math' },
  { name: 'Bola', score: 78, subject: 'Science' },
  { name: 'Chidi', score: 85, subject: 'Math' },
  { name: 'Dami', score: 61, subject: 'English' },
  { name: 'Emeka', score: 95, subject: 'Science' }
    ];

// Filter passing students
const passing = students.filter(s => s.score >= 70);
console.log('Passing:', passing.map(s => s.name));

// Sort by score descending
const ranked = [...students].sort((a, b) => b.score - a.score);
console.log('Ranked:', ranked.map(s => \`\${s.name}: \${s.score}\`));

// Average score
const avg = students.reduce((sum, s) => sum + s.score, 0) / students.length;
console.log('Class average:', avg.toFixed(1));`,
        aiPrompt: "Explain array manipulation methods in JavaScript: filter, map, sort, and reduce. How and when do you use each?"
      },
      {
        id: 'p2m2',
        title: "Objects & JSON",
        description: "Working with structured data",
        language: 'javascript',
        icon: 'beaker',
        starterCode: `// Objects store related data
const school = {
  name: 'Rillcod Academy',
  founded: 2020,
  subjects: ['STEM', 'Coding', 'Robotics'],
  address: {
    city: 'Lagos',
    country: 'Nigeria',
  },
  getInfo() {
    return \`\${this.name} — \${this.address.city}, \${this.address.country}\`;
  }
};

console.log(school.getInfo());
console.log('Subjects:', school.subjects.join(', '));

// Convert to/from JSON
const json = JSON.stringify(school, null, 2);
console.log('JSON:', json.substring(0, 100) + '...');`,
        aiPrompt: "Explain JavaScript objects and JSON. What is the difference between them? How do you serialize/deserialize data?"
      },
      {
        id: 'p3m1',
        title: "OOP & Class Design",
        description: "Object-oriented programming patterns",
        language: 'javascript',
        icon: 'beaker',
        starterCode: `class Vehicle {
  constructor(make, model, year) {
    this.make = make;
    this.model = model;
    this.year = year;
    this.speed = 0;
  }

  accelerate(amount) {
    this.speed += amount;
    return this;
  }

  brake(amount) {
    this.speed = Math.max(0, this.speed - amount);
    return this;
  }

  toString() {
    return \`\${this.year} \${this.make} \${this.model} @ \${this.speed}km/h\`;
  }
}

class ElectricVehicle extends Vehicle {
  constructor(make, model, year, batteryCapacity) {
    super(make, model, year);
    this.batteryCapacity = batteryCapacity;
  }

  toString() {
    return \`\${super.toString()} [EV, \${this.batteryCapacity}kWh]\`;
  }
}

const car = new Vehicle('Toyota', 'Camry', 2022);
car.accelerate(60).accelerate(20);
console.log(car.toString());

const tesla = new ElectricVehicle('Tesla', 'Model 3', 2023, 75);
tesla.accelerate(100);
console.log(tesla.toString());`,
        aiPrompt: "Explain Object-Oriented Programming: classes, constructors, inheritance, and method chaining. Why is OOP useful?"
      }
  ]},
  { id: 18, name: 'Phase 6: JS Events', subtitle: 'Algorithms and Interactions', color: 'border-cyan-500/40', accentColor: 'text-cyan-400', modules: [
    { id: 'js6m1', title: 'Event Loops', description: 'Listen and React logic', language: 'javascript', icon: 'star', starterCode: 'window.on(...)', aiPrompt: 'Explain events.' },
      {
        id: 'p3m4',
        title: "Algorithm Design",
        description: "Solving problems with efficient algorithms",
        language: 'javascript',
        icon: 'rocket',
        starterCode: `// Two classic algorithms

// 1. Merge Sort — O(n log n)
function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  return merge(left, right);
}

function merge(left, right) {
  const result = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) result.push(left[i++]);
    else result.push(right[j++]);
  }
  return [...result, ...left.slice(i), ...right.slice(j)];
}

// 2. Binary Search — O(log n)
function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

const arr = [64, 34, 25, 12, 22, 11, 90];
const sorted = mergeSort(arr);
console.log('Merge sorted:', sorted);
console.log('Index of 34:', binarySearch(sorted, 34));`,
        aiPrompt: "Explain algorithm complexity (Big O notation) and why merge sort is O(n log n). How does divide-and-conquer work?"
      },
      {
        id: 'p4m2',
        title: "Data Structures Deep Dive",
        description: "Linked lists, trees, and graphs",
        language: 'javascript',
        icon: 'cpu',
        starterCode: `// Linked List Implementation
class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class LinkedList {
  constructor() { this.head = null; this.size = 0; }

  append(value) {
    const node = new Node(value);
    if (!this.head) { this.head = node; }
    else {
      let curr = this.head;
      while (curr.next) curr = curr.next;
      curr.next = node;
    }
    this.size++;
  }

  toArray() {
    const arr = [];
    let curr = this.head;
    while (curr) { arr.push(curr.value); curr = curr.next; }
    return arr;
  }

  contains(value) {
    let curr = this.head;
    while (curr) {
      if (curr.value === value) return true;
      curr = curr.next;
    }
    return false;
  }
}

const list = new LinkedList();
[10, 20, 30, 40, 50].forEach(v => list.append(v));
console.log('List:', list.toArray());
console.log('Contains 30:', list.contains(30));
console.log('Contains 99:', list.contains(99));
console.log('Size:', list.size);`,
        aiPrompt: "Explain linked lists: how they differ from arrays, when to use them, and their time complexity for operations."
      }
  ]},
  { id: 19, name: 'Phase 7: JS Async', subtitle: 'Promises and Future Data', color: 'border-rose-500/40', accentColor: 'text-rose-400', modules: [
    { id: 'js7m1', title: 'Fetch & Promise', description: 'Non-blocking operations', language: 'javascript', icon: 'bolt', starterCode: 'await fetch()', aiPrompt: 'Explain async.' },
      {
        id: 'p3m2',
        title: "Async JavaScript & APIs",
        description: "Promises, async/await, and fetching data",
        language: 'javascript',
        icon: 'bolt',
        starterCode: `// Simulating async operations
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadStudentData(id) {
  console.log(\`Fetching student \${id}...\`);
  await delay(500); // simulate network request
  return { id, name: \`Student \${id}\`, score: Math.floor(Math.random() * 40) + 60 };
}

async function loadAllStudents() {
  try {
    // Load students in parallel
    const [s1, s2, s3] = await Promise.all([
      loadStudentData(1),
      loadStudentData(2),
      loadStudentData(3)
    ]);

    console.log('Loaded:', s1.name, s2.name, s3.name);
    const avg = (s1.score + s2.score + s3.score) / 3;
    console.log(\`Class average: \${avg.toFixed(1)}\`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

loadAllStudents();`,
        aiPrompt: "Explain asynchronous JavaScript: the event loop, promises, async/await, and Promise.all. Why is async programming important?"
      },
      {
        id: 'p3m5',
        title: "Fetch API & REST",
        description: "Call real web APIs and handle async data in the browser",
        language: 'javascript',
        icon: 'bolt',
        starterCode: `// Fetch API — getting data from a server
// REST: Representational State Transfer
// Every URL is a "resource"; HTTP verbs describe the action

// ── GET: read data ──
async function getUser(id) {
  const res  = await fetch(\`https://jsonplaceholder.typicode.com/users/\${id}\`);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return res.json();
}

// ── POST: create data ──
async function createPost(title, body, userId) {
  const res = await fetch('https://jsonplaceholder.typicode.com/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, userId }),
  });
  return res.json();
}

// ── Run both in parallel ──
async function main() {
  try {
    const [user, post] = await Promise.all([
      getUser(1),
      createPost('My First Post', 'Learning APIs at Rillcod!', 1)
    ]);

    console.log('=== User ===');
    console.log('Name:    ', user.name);
    console.log('Email:   ', user.email);
    console.log('Company: ', user.company.name);

    console.log('\\n=== New Post ===');
    console.log('Title:', post.title);
    console.log('ID:   ', post.id);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();`,
        aiPrompt: "Explain REST APIs and the Fetch API: HTTP verbs (GET, POST, PUT, DELETE), status codes, JSON serialization, and why Promise.all is faster than sequential awaits."
      }
  ]},
  { id: 20, name: 'Phase 8: JS Rendering', subtitle: 'UI Engines', color: 'border-fuchsia-500/40', accentColor: 'text-fuchsia-400', modules: [
    { id: 'js8m1', title: 'Canvas API', description: 'Drawing dynamic graphics', language: 'javascript', icon: 'beaker', starterCode: 'ctx.draw()', aiPrompt: 'Explain canvas.' },
      {
        id: 'p4m5',
        title: "React Component Thinking",
        description: "Understand state, props, and UI composition patterns",
        language: 'javascript',
        icon: 'rocket',
        starterCode: `// React Mental Model — simulated in plain JS
// In real React: JSX, useState, useEffect hooks
// Here we simulate the same patterns without the framework

// ── Component = function that returns UI ──
function StudentCard({ name, grade, scores }) {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const status = avg >= 60 ? '✅ Passing' : '❌ Failing';
  return {
    type: 'card',
    props: { name, grade, avg: avg.toFixed(1), status },
  };
}

// ── State: data that changes over time ──
let appState = {
  students: [
    { name: 'Amara',  grade: 'SS1',  scores: [88, 92, 85] },
    { name: 'Chidi',  grade: 'JSS3', scores: [72, 65, 78] },
    { name: 'Fatima', grade: 'SS2',  scores: [95, 91, 88] }
    ],
  filter: 'all',
};

// ── Render = derive UI from state ──
function render(state) {
  const visible = state.filter === 'passing'
    ? state.students.filter(s => s.scores.reduce((a,b)=>a+b,0)/s.scores.length >= 60)
    : state.students;

  console.log(\`=== Dashboard (filter: \${state.filter}) ===\`);
  visible.map(s => StudentCard(s)).forEach(card => {
    const { name, grade, avg, status } = card.props;
    console.log(\`  \${name} | \${grade} | Avg: \${avg} | \${status}\`);
  });
}

// ── Actions mutate state → trigger re-render ──
function setFilter(filter) {
  appState = { ...appState, filter };
  render(appState);
}

render(appState);         // Initial render
console.log('');
setFilter('passing');     // Re-render with filter`,
        aiPrompt: "Explain React component thinking: what is a component, how do props pass data down, what is state and why does it trigger re-renders? How does unidirectional data flow work?"
      }
  ]},
  { id: 21, name: 'Phase 9: JS Servers', subtitle: 'Node.js and Express', color: 'border-indigo-500/40', accentColor: 'text-indigo-400', modules: [
    { id: 'js9m1', title: 'Backend Node', description: 'JavaScript on the server', language: 'javascript', icon: 'cpu', starterCode: 'require("http")', aiPrompt: 'Explain Node.' },
      {
        id: 'p4m1',
        title: "Full-Stack Concepts",
        description: "Frontend, backend, databases, and APIs",
        language: 'javascript',
        icon: 'book',
        starterCode: `// Full-Stack Architecture Demonstration
// Client → API → Database layer simulation

const db = {
  users: [
    { id: 1, name: 'Ada', role: 'student' },
    { id: 2, name: 'Bola', role: 'teacher' }
    ],
  find: (id) => db.users.find(u => u.id === id),
  findAll: () => db.users,
  insert: (user) => { db.users.push({ id: Date.now(), ...user }); return user; },
};

// Simulated API Layer
const api = {
  getUsers: () => ({ status: 200, data: db.findAll() }),
  getUser: (id) => {
    const user = db.find(id);
    return user
      ? { status: 200, data: user }
      : { status: 404, error: 'User not found' };
  },
  createUser: (data) => {
    const newUser = db.insert(data);
    return { status: 201, data: newUser };
  }
};

// Client requests
console.log('GET /users', api.getUsers());
console.log('GET /users/1', api.getUser(1));
console.log('GET /users/99', api.getUser(99));
console.log('POST /users', api.createUser({ name: 'Chidi', role: 'student' }));`,
        aiPrompt: "Explain full-stack web development: what is the frontend, backend, and database? How do they communicate through APIs? What is REST?"
      }
  ]},
  { id: 22, name: 'Phase 10: JS Sockets', subtitle: 'Real-time Connectivity', color: 'border-slate-500/40', accentColor: 'text-slate-400', modules: [
    { id: 'js10m1', title: 'Socket.io', description: 'Live bi-directional sync', language: 'javascript', icon: 'bolt', starterCode: 'io.on()', aiPrompt: 'Explain sockets.' }
  ]},
  { id: 23, name: 'Phase 11: JS Hubs', subtitle: 'Next.js & Security', color: 'border-purple-500/40', accentColor: 'text-purple-400', modules: [
    { id: 'js11m1', title: 'Distributed JS', description: 'Connecting many apps', language: 'javascript', icon: 'star', starterCode: 'fetch(api)', aiPrompt: 'Explain microservices.' },
      {
        id: 'p5m1',
        title: "Introduction to Next.js",
        description: "Server-side rendering, routing, and modern React",
        language: 'javascript',
        icon: 'rocket',
        starterCode: `// Simulated Next.js App Router Page
// In Next.js, files inside the /app directory become routes

// app/page.tsx
export default async function HomePage() {
  // Server Component: fetches data securely on the server
  const res = await fetch('https://api.github.com/users/vercel');
  const user = await res.json();

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '40px' }}>
      <h1>{user.name}</h1>
      <p>{user.bio}</p>
      
      <div style={{ marginTop: '20px' }}>
        <h3>Stats</h3>
        <ul>
          <li>Repos: {user.public_repos}</li>
          <li>Followers: {user.followers}</li>
        </ul>
      </div>
    </main>
  );
}

// Simulated Output Generator
HomePage().then(jsx => {
  console.log('=== Rendered HTML Structure ===\\n');
  console.log('<main>');
  console.log(\`  <h1>\${jsx.props.children[0].props.children}</h1>\`);
  console.log(\`  <p>\${jsx.props.children[1].props.children}</p>\`);
  console.log('</main>');
});`,
        aiPrompt: "Explain Next.js: the App Router, Server Components vs Client Components, fetching data on the server, and why frameworks are used instead of plain React."
      },
      {
        id: 'p4m3',
        title: "Security & Best Practices",
        description: "Writing safe, clean, and maintainable code",
        language: 'javascript',
        icon: 'beaker',
        starterCode: `// Security & Best Practices

// 1. Input Validation
function validateEmail(email) {
  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+\$/;
  return regex.test(email);
}

// 2. Sanitization (prevent XSS)
function sanitizeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 3. Safe Object Access
const user = null;
const name = user?.profile?.name ?? 'Guest';
console.log('Name:', name);

// 4. Error Boundaries
function safeParseJSON(str) {
  try {
    return { ok: true, data: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Test them
console.log('Valid email:', validateEmail('student@rillcod.com'));
console.log('Invalid email:', validateEmail('not-an-email'));
console.log('Sanitized:', sanitizeHTML('<script>alert("xss")</script>'));
console.log('Safe JSON:', safeParseJSON('{"name":"Ada"}'));
console.log('Bad JSON:', safeParseJSON('{bad json}'));`,
        aiPrompt: "Explain web security fundamentals: XSS attacks, input validation, sanitization, and why optional chaining helps prevent errors."
      }
  ]},
  { id: 24, name: 'Phase 12: JS Capstone', subtitle: 'Universal Framework Synthesis', color: 'border-white/20', accentColor: 'text-white', modules: [
    { id: 'js12m1', title: 'The Architect', description: 'Final JS System Design', language: 'javascript', icon: 'book', starterCode: 'console.log("Done")', aiPrompt: 'Final review.' },
      {
        id: 'p5m2',
        title: "Git & Version Control",
        description: "Collaborating and tracing history",
        language: 'javascript',
        icon: 'book',
        starterCode: `// Simulating Git Commands Output

console.log('\$ git init');
console.log('Initialized empty Git repository in /project/.git/\\n');

console.log('\$ git add .');
console.log('Files staged for commit.\\n');

console.log('\$ git commit -m "Initial commit with protocol feature"');
console.log('[main (root-commit) a1b2c3d] Initial commit with protocol feature');
console.log(' 3 files changed, 142 insertions(+)\\n');

console.log('\$ git status');
console.log('On branch main');
console.log('nothing to commit, working tree clean\\n');

console.log('\$ git push origin main');
console.log('Enumerating objects: 5, done.');
console.log('Writing objects: 100% (5/5), 1.2 KiB | ...');
console.log('To https://github.com/user/project.git');
console.log(' * [new branch]      main -> main');`,
        aiPrompt: "Explain Git version control: what is a commit, branch, push, and pull? How does GitHub fit into the workflow? Why do software engineers use version control?"
      },
      {
        id: 'p7m2',
        title: "LLM API Integration",
        description: "Connecting apps to advanced Artificial Intelligence",
        language: 'javascript',
        icon: 'bolt',
        starterCode: `// Simulating an API request to a Large Language Model
async function generateAIStory(prompt) {
    console.log('[System] Formatting request for LLM...');
    
    // Simulate network latency for API call
    console.log('[Network] Sending HTTP POST to https://api.openai.com/v1/chat/completions\\n');
    await new Promise(r => setTimeout(r, 1000));
    
    // Simulated JSON response from the API
    const response = {
        id: "chatcmpl-123",
        object: "chat.completion",
        choices: [{
            message: {
                role: "assistant",
                content: "In a futuristic Lagos, a young coder named Ade discovered an ancient algorithm that could control the smart city's grid..."
            }
        }]
    };
    
    console.log("=== AI Response Received ===");
    console.log(response.choices[0].message.content);
}

const userPrompt = "Write a sci-fi intro set in Lagos about a coder.";
console.log(\`User Prompt: "\${userPrompt}"\\n\`);

generateAIStory(userPrompt).catch(console.error);
`,
        aiPrompt: "Explain what an API is, how JSON responses work, and how developers integrate Large Language Models (like OpenAI or Gemini) into their custom applications."
      }
  ]}
];
// ── TRACK 3: ISOLATED WEB MASTERY (Phases 1-12) ──
const WEB_TRACK: ProtocolPhase[] = [
  { id: 25, name: 'Phase 1: Web Structure', subtitle: 'HTML5 Semantic Core', color: 'border-emerald-500/40', accentColor: 'text-emerald-400', modules: [
    { id: 'web1m1', title: 'HTML Core', description: 'Structuring content', language: 'html', icon: 'code', starterCode: '<h1></h1>', aiPrompt: 'Explain HTML.' },
      {
        id: 'p1m6',
        title: "HTML5 Page Structure",
        description: "The anatomy of a web page — tags, elements, and attributes",
        language: 'html',
        icon: 'code',
        starterCode: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My First Web Page</title>
  <style>
    body { font-family: sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 32px; }
    h1   { color: #f97316; }
    ul   { line-height: 2; }
    a    { color: #a78bfa; }
  </style>
</head>
<body>

  <!-- Headings: h1 is the most important, h6 the least -->
  <h1>Welcome to Rillcod Academy</h1>
  <h2>About This Page</h2>
  <p>This is a <strong>paragraph</strong> with <em>italic</em> and <strong>bold</strong> text.</p>

  <!-- Lists -->
  <h3>What I'm Learning</h3>
  <ul>
    <li>HTML — structure</li>
    <li>CSS  — styling</li>
    <li>JavaScript — interactivity</li>
  </ul>

  <!-- Links and images -->
  <p>Visit <a href="https://rillcod.com" target="_blank">Rillcod Academy</a></p>

  <!-- Semantic landmarks -->
  <footer style="margin-top:32px; color:#64748b; font-size:0.85rem;">
    &copy; 2025 Rillcod Academy
  </footer>

</body>
</html>`,
        aiPrompt: "Explain the structure of an HTML5 document: DOCTYPE, head vs body, semantic tags, inline vs block elements, and why accessibility matters."
      }
  ]},
  { id: 26, name: 'Phase 2: Web Style', subtitle: 'CSS Design and Layout', color: 'border-blue-500/40', accentColor: 'text-blue-400', modules: [
    { id: 'web2m1', title: 'CSS Layout', description: 'Styling the document', language: 'html', icon: 'beaker', starterCode: '<style></style>', aiPrompt: 'Explain CSS.' },
      {
        id: 'p2m3',
        title: "HTML & CSS Layout",
        description: "Building and styling web pages",
        language: 'html',
        icon: 'star',
        starterCode: `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 20px; }
    .card { background: #1a1a2e; border: 1px solid #2d2d4e; padding: 24px; max-width: 400px; margin: 20px auto; }
    h1 { color: #a78bfa; font-size: 1.5rem; margin-bottom: 12px; }
    p { color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }
    .tag { display: inline-block; padding: 4px 10px; background: #7c3aed22; color: #a78bfa; font-size: 12px; margin: 2px; }
    .btn { padding: 10px 20px; background: #7c3aed; color: white; border: none; cursor: pointer; font-size: 14px; }
    .btn:hover { background: #6d28d9; }
  </style>
</head>
<body>
  <div class="card">
    <h1>STEM Student Card</h1>
    <p>Welcome to Rillcod Academy. Build the future with code.</p>
    <div>
      <span class="tag">JavaScript</span>
      <span class="tag">Python</span>
      <span class="tag">Robotics</span>
    </div>
    <br/>
    <button class="btn" onclick="this.textContent='Enrolled!'">Enroll Now</button>
  </div>
</body>
</html>`,
        aiPrompt: "Explain CSS layout: the box model, flexbox, and how to style cards and buttons. What are best practices for beginners?"
      }
  ]},
  { id: 27, name: 'Phase 3: Web Components', subtitle: 'Advanced UI Building Blocks', color: 'border-violet-500/40', accentColor: 'text-violet-400', modules: [
    { id: 'web3m1', title: 'Web Cards', description: 'Reusable UI patterns', language: 'html', icon: 'star', starterCode: '<div class="card"></div>', aiPrompt: 'Explain cards.' }
  ]},
  { id: 28, name: 'Phase 4: Web Flex & Grid', subtitle: 'Modern Dynamic Layouts', color: 'border-amber-500/40', accentColor: 'text-amber-400', modules: [
    { id: 'web4m1', title: 'Flexbox Engine', description: 'Responsive alignment', language: 'html', icon: 'bolt', starterCode: 'display: flex', aiPrompt: 'Explain flex.' },
      {
        id: 'p2m5',
        title: "CSS Flexbox & Grid",
        description: "Master modern CSS layout systems for any screen size",
        language: 'html',
        icon: 'star',
        starterCode: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Flexbox & Grid</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 24px; }

    /* ── FLEXBOX: navigation bar ── */
    .navbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0b132b;
      padding: 12px 24px;
      margin-bottom: 24px;
    }
    .navbar .logo { color: #f97316; font-weight: 900; }
    .navbar nav { display: flex; gap: 16px; }
    .navbar a { color: #94a3b8; text-decoration: none; font-size: 0.9rem; }
    .navbar a:hover { color: #f97316; }

    /* ── FLEXBOX: card row ── */
    .card-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .card {
      flex: 1 1 150px;
      background: #1e1e3f;
      border: 1px solid #ffffff10;
      padding: 20px;
      text-align: center;
    }
    .card h3 { color: #a78bfa; margin-bottom: 8px; }

    /* ── CSS GRID: dashboard layout ── */
    .dashboard {
      display: grid;
      grid-template-columns: 200px 1fr;
      grid-template-rows: auto 1fr;
      gap: 16px;
      height: 200px;
    }
    .sidebar { background: #1a1a2e; padding: 16px; grid-row: span 2; }
    .main    { background: #1e1e3f; padding: 16px; }
    .footer-bar { background: #0b132b; padding: 12px; }
  </style>
</head>
<body>

  <!-- Flexbox nav -->
  <div class="navbar">
    <div class="logo">Rillcod</div>
    <nav>
      <a href="#">Courses</a>
      <a href="#">Programs</a>
      <a href="#">About</a>
    </nav>
  </div>

  <!-- Flexbox cards -->
  <div class="card-row">
    <div class="card"><h3>Python</h3><p>Beginner</p></div>
    <div class="card"><h3>Web Dev</h3><p>Intermediate</p></div>
    <div class="card"><h3>Robotics</h3><p>Advanced</p></div>
    <div class="card"><h3>AI & ML</h3><p>Advanced</p></div>
  </div>

  <!-- CSS Grid dashboard -->
  <div class="dashboard">
    <div class="sidebar">Sidebar</div>
    <div class="main">Main Content</div>
    <div class="footer-bar">Footer</div>
  </div>

</body>
</html>`,
        aiPrompt: "Explain the difference between CSS Flexbox and CSS Grid. When would you use each? Explain justify-content, align-items, grid-template-columns, and gap."
      }
  ]},
  { id: 29, name: 'Phase 5: Web Motion', subtitle: 'Transitions and Keyframes', color: 'border-orange-500/40', accentColor: 'text-orange-400', modules: [{ id: 'web5m1', title: 'CSS Animation', description: 'Fluid user experiences', language: 'html', icon: 'rocket', starterCode: '@keyframes move {}', aiPrompt: 'Explain motion.' }] },
  { id: 30, name: 'Phase 6: Web Interaction', subtitle: 'Forms and Dynamic Content', color: 'border-cyan-500/40', accentColor: 'text-cyan-400', modules: [{ id: 'web6m1', title: 'Form Logic', description: 'Handling user input', language: 'html', icon: 'code', starterCode: '<form></form>', aiPrompt: 'Explain forms.' }] },
  { id: 31, name: 'Phase 7: Web Mobile-First', subtitle: 'Responsive Screens & Queries', color: 'border-rose-500/40', accentColor: 'text-rose-400', modules: [{ id: 'web7m1', title: 'Media Queries', description: 'Adapting to all devices', language: 'html', icon: 'star', starterCode: '@media {}', aiPrompt: 'Explain responsive.' }] },
  { id: 32, name: 'Phase 8: Web Frameworks', subtitle: 'Tailwind and Utility Styling', color: 'border-fuchsia-500/40', accentColor: 'text-fuchsia-400', modules: [{ id: 'web8m1', title: 'Tailwind Syntax', description: 'Utility-first CSS', language: 'html', icon: 'bolt', starterCode: 'class="flex"', aiPrompt: 'Explain Tailwind.' }] },
  { id: 33, name: 'Phase 9: Web Performance', subtitle: 'SEO and Asset Handling', color: 'border-indigo-500/40', accentColor: 'text-indigo-400', modules: [{ id: 'web9m1', title: 'SEO Protocol', description: 'Search engine optimization', language: 'html', icon: 'book', starterCode: '<meta>', aiPrompt: 'Explain SEO.' }] },
  { id: 34, name: 'Phase 10: Web Apps', subtitle: 'Stateful UI with Frameworks', color: 'border-slate-500/40', accentColor: 'text-slate-400', modules: [{ id: 'web10m1', title: 'Component Arts', description: 'Virtual DOM logic', language: 'javascript', icon: 'cpu', starterCode: 'const App = () => {}', aiPrompt: 'Explain frameworks.' }] },
  { id: 35, name: 'Phase 11: Web Security', subtitle: 'Secure Headers and CSP', color: 'border-purple-500/40', accentColor: 'text-purple-400', modules: [{ id: 'web11m1', title: 'Strict CSP', description: 'Protecting the browser', language: 'html', icon: 'beaker', starterCode: 'Content-Security-Policy', aiPrompt: 'Explain CSP.' }] },
  { id: 36, name: 'Phase 12: Web Capstone', subtitle: 'Industrial Site Synthesis', color: 'border-white/20', accentColor: 'text-white', modules: [{ id: 'web12m1', title: 'Final Engine', description: 'Site architecture master', language: 'html', icon: 'star', starterCode: 'const Site = () => {}', aiPrompt: 'Web final review.' }] }
];
// ── TRACK 4: YOUNGER KIDS VISUAL MASTERY (Phases 1-12) ──
const KIDS_TRACK: ProtocolPhase[] = [
  { id: 37, name: 'Phase 1: Motion Protocol', subtitle: 'Sprites and Directions', color: 'border-orange-500/40', accentColor: 'text-orange-400', modules: [
    { id: 'k1m1', title: 'Sprite Move', description: 'Basic blocks', language: 'robotics', icon: 'bolt', starterCode: 'Move(10)', aiPrompt: 'Explain blocks.' },
    { id: 'k1m2', title: 'The Turn Block', description: 'Angular logic', language: 'robotics', icon: 'rocket', starterCode: 'Turn(15)', aiPrompt: 'Explain rotation.' },
    { id: 'k1m3', title: 'Gliding Logic', description: 'Smooth movement', language: 'robotics', icon: 'star', starterCode: 'Glide(x,y)', aiPrompt: 'Explain coordinates.' },
      {
        id: 'p1m7',
        title: "Block Programming Logic",
        description: "How Scratch concepts translate into real code",
        language: 'javascript',
        icon: 'bolt',
        starterCode: `// Scratch blocks → JavaScript equivalents
// Scratch: "say Hello for 2 seconds"  →  console.log + setTimeout
// Scratch: "repeat 10"                →  for loop
// Scratch: "if touching edge, bounce" →  if statement

// ── Scratch: "set score to 0, repeat until score > 50" ──
let score = 0;
while (score <= 50) {
  score += Math.floor(Math.random() * 15) + 1; // random 1–15
  console.log('Score:', score);
}
console.log('Game over! Final score:', score);

// ── Scratch: "when green flag clicked → forever → move 10 steps" ──
// Simulated as a loop that moves a character
const character = { x: 0, y: 0, direction: 90 };

function moveSteps(steps) {
  const rad = (character.direction * Math.PI) / 180;
  character.x += Math.cos(rad) * steps;
  character.y += Math.sin(rad) * steps;
}

function turnDegrees(deg) { character.direction += deg; }

moveSteps(10); turnDegrees(90);
moveSteps(10); turnDegrees(90);
moveSteps(10); turnDegrees(90);
moveSteps(10);

console.log(\`Character position: (\${character.x.toFixed(1)}, \${character.y.toFixed(1)})\`);`,
        aiPrompt: "Explain how visual block programming (like Scratch) relates to text-based coding. How do events, loops, and conditionals in Scratch map to JavaScript?"
      }
  ]},
  { id: 38, name: 'Phase 2: Look and Feel', subtitle: 'Costumes and Speech', color: 'border-blue-500/40', accentColor: 'text-blue-400', modules: [
    { id: 'k2m1', title: 'Say Hello', description: 'Speech bubbles', language: 'robotics', icon: 'code', starterCode: 'Say("Hello")', aiPrompt: 'Explain conversation blocks.' },
      {
        id: 'p2m7',
        title: "Arduino & Electronics Basics",
        description: "Digital I/O, sensors, and the microcontroller mindset",
        language: 'robotics',
        icon: 'cpu',
        starterCode: `// Arduino Fundamentals — Digital I/O + Sensor Reading
// Simulated as JavaScript for the browser runner
// On a real Arduino board, use this exact C++ syntax

// ── DIGITAL OUTPUT: blinking LED ──
// void setup() { pinMode(13, OUTPUT); }
// void loop()  { digitalWrite(13, HIGH); delay(500);
//                digitalWrite(13, LOW);  delay(500); }

// ── DIGITAL INPUT: reading a button ──
// int btn = digitalRead(7);   // HIGH or LOW
// if (btn == LOW) { /* pressed (INPUT_PULLUP) */ }

// ── ANALOGUE INPUT: reading a sensor ──
// int light = analogRead(A0);              // 0–1023
// int brightness = map(light, 0,1023,0,255);
// analogWrite(9, brightness);              // PWM output

// ── BROWSER SIMULATION ──
// Simulating an Arduino control loop in JS:

const pins = { 13: 'LED', A0: 'LDR sensor', 7: 'Button' };

function analogRead(pin) { return Math.floor(Math.random() * 1024); }
function digitalRead(pin) { return Math.random() > 0.5 ? 1 : 0; }
function map(val, inMin, inMax, outMin, outMax) {
  return Math.round(((val - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin);
}

// Simulate 5 loop() cycles
for (let cycle = 1; cycle <= 5; cycle++) {
  const lightRaw  = analogRead('A0');
  const pwm       = map(lightRaw, 0, 1023, 0, 255);
  const btnState  = digitalRead(7) === 0 ? 'PRESSED' : 'released';

  console.log(\`Cycle \${cycle}: LDR=\${lightRaw} → PWM=\${pwm} | Button: \${btnState}\`);
}`,
        aiPrompt: "Explain Arduino microcontrollers: setup() vs loop(), digital vs analogue pins, PWM, and the difference between a sensor (input) and an actuator (output). How is this used in robotics?"
      }
  ]},
  { id: 39, name: 'Phase 3: Sound & Hardware', subtitle: 'Audio Interaction & IoT', color: 'border-emerald-500/40', accentColor: 'text-emerald-400', modules: [
    { id: 'k3m1', title: 'Play Pop', description: 'Sound effects', language: 'robotics', icon: 'bolt', starterCode: 'PlaySound()', aiPrompt: 'Explain audio.' },
      {
        id: 'p3m3',
        title: "Robotics & IoT Basics",
        description: "Introduction to robotics programming concepts",
        language: 'robotics',
        icon: 'cpu',
        starterCode: `// Robotics: Sensor-Actuator Loop
// This simulates a basic robot navigation loop

const robot = {
  x: 0, y: 0,
  direction: 'NORTH',
  log: [],

  move(steps = 1) {
    const moves = { NORTH: [0,1], SOUTH: [0,-1], EAST: [1,0], WEST: [-1,0] };
    const [dx, dy] = moves[this.direction];
    this.x += dx * steps;
    this.y += dy * steps;
    this.log.push(\`MOVE \${steps} → (\${this.x},\${this.y})\`);
    return this;
  },

  turn(dir) {
    const rights = { NORTH:'EAST', EAST:'SOUTH', SOUTH:'WEST', WEST:'NORTH' };
    const lefts  = { NORTH:'WEST', WEST:'SOUTH', SOUTH:'EAST', EAST:'NORTH' };
    this.direction = dir === 'R' ? rights[this.direction] : lefts[this.direction];
    this.log.push(\`TURN \${dir} → facing \${this.direction}\`);
    return this;
  },

  report() {
    console.log(\`Position: (\${this.x}, \${this.y}) facing \${this.direction}\`);
  }
};

// Navigate a square path
robot.move(3).turn('R').move(3).turn('R').move(3).turn('R').move(3);
robot.report();
robot.log.forEach(l => console.log(' ', l));`,
        aiPrompt: "Explain robotics programming concepts: sensors, actuators, control loops, and how robots navigate using coordinate systems."
      }
  ]},
  { id: 40, name: 'Phase 4: Global Events', subtitle: 'Sensors and Flags', color: 'border-amber-500/40', accentColor: 'text-amber-400', modules: [
    { id: 'k4m1', title: 'On Click', description: 'Signal triggers', language: 'robotics', icon: 'star', starterCode: 'OnClick', aiPrompt: 'Explain triggers.' },
      {
        id: 'p3m7',
        title: "IoT Sensor Networks",
        description: "Connect multiple sensors and publish data over a network",
        language: 'robotics',
        icon: 'cpu',
        starterCode: `// IoT — Internet of Things
// Concept: sensors collect data → microcontroller processes it
//          → sends to cloud → dashboard shows live readings

// ── Simulated IoT node (Arduino + WiFi) ──
// On real hardware you'd use WiFiClient or MQTTClient

// Browser simulation of a sensor node publishing readings

const SENSOR_NODE = {
  id: 'node-lagos-01',
  location: 'Classroom A',
  sensors: {
    temperature: () => +(20 + Math.random() * 15).toFixed(1),  // 20–35°C
    humidity:    () => +(40 + Math.random() * 40).toFixed(1),  // 40–80%
    light:       () => Math.floor(Math.random() * 1024),       // 0–1023 lux
    motion:      () => Math.random() > 0.7,                    // boolean
  },
};

function readSensors(node) {
  return {
    nodeId:    node.id,
    location:  node.location,
    timestamp: new Date().toISOString(),
    data: Object.fromEntries(
      Object.entries(node.sensors).map(([key, fn]) => [key, fn()])
    ),
  };
}

function publishReading(reading) {
  // In real IoT: client.publish("school/classroomA/sensors", JSON.stringify(reading))
  console.log('[MQTT PUBLISH]', JSON.stringify(reading, null, 2));
}

function checkAlerts(reading) {
  const { temperature, humidity, motion } = reading.data;
  if (temperature > 32) console.warn('⚠ ALERT: High temperature!', temperature + '°C');
  if (humidity    > 75) console.warn('⚠ ALERT: High humidity!',    humidity    + '%');
  if (motion)           console.log('📡 Motion detected in', reading.location);
}

// Simulate 3 publish cycles
for (let i = 0; i < 3; i++) {
  const reading = readSensors(SENSOR_NODE);
  publishReading(reading);
  checkAlerts(reading);
  console.log('---');
}`,
        aiPrompt: "Explain IoT (Internet of Things): what it is, how sensors connect to microcontrollers, how data is sent over MQTT/WiFi to a cloud platform, and real Nigerian use cases like smart classrooms and agriculture."
      }
  ]},
  { id: 41, name: 'Phase 5: Control Lab', subtitle: 'Loops and Wait', color: 'border-violet-500/40', accentColor: 'text-violet-400', modules: [{ id: 'k5m1', title: 'Forever Repeat', description: 'Infinite cycles', language: 'robotics', icon: 'rocket', starterCode: 'Forever{}', aiPrompt: 'Explain loops.' }] },
  { id: 42, name: 'Phase 6: Visual Sensing', subtitle: 'Touching Logic', color: 'border-cyan-500/40', accentColor: 'text-cyan-400', modules: [{ id: 'k6m1', title: 'Wall Check', description: 'Edge detection', language: 'robotics', icon: 'beaker', starterCode: 'ifTouchingEdge', aiPrompt: 'Explain sensing.' }] },
  { id: 43, name: 'Phase 7: Logic Blocks', subtitle: 'Math Operators', color: 'border-rose-500/40', accentColor: 'text-rose-400', modules: [{ id: 'k7m1', title: 'Math Hub', description: 'Addition blocks', language: 'robotics', icon: 'bolt', starterCode: '1 + 1', aiPrompt: 'Explain math logic.' }] },
  { id: 44, name: 'Phase 8: Data Storage', subtitle: 'Score Variables', color: 'border-fuchsia-500/40', accentColor: 'text-fuchsia-400', modules: [{ id: 'k8m1', title: 'Score Keeper', description: 'Saving points', language: 'robotics', icon: 'book', starterCode: 'Score = 0', aiPrompt: 'Explain variables.' }] },
  { id: 45, name: 'Phase 9: My Blocks', subtitle: 'Custom Procedures', color: 'border-indigo-500/40', accentColor: 'text-indigo-400', modules: [{ id: 'k9m1', title: 'New Logic', description: 'Creating own blocks', language: 'robotics', icon: 'cpu', starterCode: 'Define()', aiPrompt: 'Explain procedures.' }] },
  { id: 46, name: 'Phase 10: Physics Lab', subtitle: 'Gravity Simulation', color: 'border-slate-500/40', accentColor: 'text-slate-400', modules: [{ id: 'k10m1', title: 'Drop Logic', description: 'Simulating gravity', language: 'robotics', icon: 'rocket', starterCode: 'Y -= 1', aiPrompt: 'Explain physics.' }] },
  { id: 47, name: 'Phase 11: Game Loop', subtitle: 'Levels and Lives', color: 'border-purple-500/40', accentColor: 'text-purple-400', modules: [{ id: 'k11m1', title: 'Master Game', description: 'State management', language: 'robotics', icon: 'star', starterCode: 'NextLevel', aiPrompt: 'Explain game state.' }] },
  { id: 48, name: 'Phase 12: Creative Capstone', subtitle: 'Portfolio Launch', color: 'border-white/20', accentColor: 'text-white', modules: [{ id: 'k12m1', title: 'Project Final', description: 'Showcase piece', language: 'robotics', icon: 'book', starterCode: 'Launch()', aiPrompt: 'Review kid-tier.' }] }
];

export const PROTOCOL_PHASES: ProtocolPhase[] = [
  ...PYTHON_TRACK,
  ...JAVASCRIPT_TRACK,
  ...WEB_TRACK,
  ...KIDS_TRACK
];
