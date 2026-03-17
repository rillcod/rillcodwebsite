export const LAB_EXAMPLES = {
  python: [
    {
      name: "Bubble Sort",
      desc: "Classical sorting algorithm",
      code: `def bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n - i - 1):\n            if arr[j] > arr[j + 1]:\n                arr[j], arr[j + 1] = arr[j + 1], arr[j]\n    return arr\n\ndata = [64, 34, 25, 12, 22, 11, 90]\nprint("Original:", data)\nprint("Sorted:", bubble_sort(data))`
    },
    {
      name: "Fibonacci Sequence",
      desc: "Generate numbers in Fibonacci sequence",
      code: `def fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        print(a, end=' ')\n        a, b = b, a + b\n\nprint("First 10 Fibonacci numbers:")\nfibonacci(10)`
    },
    {
      name: "List Comprehensions",
      desc: "Pythonic way to create lists",
      code: `squares = [x**2 for x in range(10)]\nevens = [x for x in range(20) if x % 2 == 0]\n\nprint("Squares:", squares)\nprint("Evens:", evens)`
    },
    {
      name: "Guess the Number",
      desc: "Simple logic for a game",
      code: `import random\n\ntarget = random.randint(1, 10)\nguess = 5 # Simulated guess\n\nprint(f"Target was {target}")\nif guess == target:\n    print("Correct!")\nelse:\n    print("Try again!")`
    }
  ],
  javascript: [
    {
      name: "Array Methods",
      desc: "Map, Filter, and Reduce",
      code: `const numbers = [1, 2, 3, 4, 5];\n\nconst doubles = numbers.map(n => n * 2);\nconst evens = numbers.filter(n => n % 2 === 0);\nconst sum = numbers.reduce((acc, n) => acc + n, 0);\n\nconsole.log("Original:", numbers);\nconsole.log("Doubles:", doubles);\nconsole.log("Evens:", evens);\nconsole.log("Sum:", sum);`
    },
    {
      name: "Async/Await",
      desc: "Handling asynchronous data",
      code: `async function fetchData() {\n  console.log("Fetching...");\n  // Using a timeout to simulate a delay\n  await new Promise(resolve => setTimeout(resolve, 1000));\n  console.log("Data received!");\n}\n\nfetchData();`
    },
    {
      name: "Object Destructuring",
      desc: "Modern JS features",
      code: `const student = {\n  name: "Alex",\n  age: 12,\n  skills: ["HTML", "Python"]\n};\n\nconst { name, skills } = student;\nconsole.log(\`Student $\{name\} knows: $\{skills.join(", ")\}\`);`
    }
  ],
  html: [
    {
      name: "Modern Card UI",
      desc: "Glassmorphism design",
      code: `<!DOCTYPE html>\n<html>\n<head>\n<style>\n  body {\n    background: #0f172a;\n    color: white;\n    font-family: 'Segoe UI', system-ui, sans-serif;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    height: 100vh;\n    margin: 0;\n  }\n  .glass {\n    background: rgba(255, 255, 255, 0.03);\n    backdrop-filter: blur(10px);\n    padding: 3rem;\n    border-radius: 2rem;\n    border: 1px solid rgba(255, 255, 255, 0.1);\n    text-align: center;\n    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);\n    max-width: 400px;\n  }\n  h1 {\n    background: linear-gradient(to right, #8b5cf6, #3b82f6);\n    -webkit-background-clip: text;\n    -webkit-text-fill-color: transparent;\n    font-size: 2.5rem;\n  }\n</style>\n</head>\n<body>\n  <div class="glass">\n    <h1>Rillcod UI</h1>\n    <p>Premium Glassmorphism Design</p>\n    <button style="background: #8b5cf6; color: white; border: none; padding: 0.8rem 2rem; border-radius: 1rem; font-weight: bold; cursor: pointer;">Explore</button>\n  </div>\n</body>\n</html>`
    },
    {
      name: "Animated Button",
      desc: "CSS transitions and hovers",
      code: `<button style="\n  background: #2563eb;\n  color: white;\n  padding: 1rem 2rem;\n  border: none;\n  border-radius: 0.5rem;\n  font-weight: bold;\n  cursor: pointer;\n  transition: all 0.3s ease;\n  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.4);\n" \n  onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 15px -3px rgba(37, 99, 235, 0.5)'" \n  onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px -1px rgba(37, 99, 235, 0.4)'">\n  Hover Me!\n</button>`
    }
  ],
  robotics: [
    {
      name: "Square Pattern",
      desc: "Move robot in a square",
      code: `for i in range(4):\n    robot.forward(100)\n    robot.turnRight(90)`
    },
    {
      name: "Spiral Pattern",
      desc: "Move robot in a spiral",
      code: `distance = 20\nfor i in range(12):\n    robot.forward(distance)\n    robot.turnRight(30)\n    distance += 10`
    },
    {
      name: "Zig-Zag",
      desc: "Alternating turns",
      code: `for i in range(5):\n    robot.forward(50)\n    robot.turnRight(90)\n    robot.forward(50)\n    robot.turnLeft(90)`
    },
    {
      name: "Rainbow Square",
      desc: "Square with changing colors",
      code: `colors = ["red", "orange", "yellow", "green", "blue", "purple"]\nfor c in colors:\n    robot.setColor(c)\n    robot.forward(60)\n    robot.turnRight(60)`
    }
  ]
};
