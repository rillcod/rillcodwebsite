import { Monitor, Cat, Globe, Palette, Bot } from 'lucide-react';

export interface Program {
  id: string;
  title: string;
  description: string;
  icon: any;
  color: string;
  ageRange: string;
  duration: string;
  skillLevel: string;
  curriculum: {
    title: string;
    topics: string[];
  }[];
  projects: {
    title: string;
    description: string;
  }[];
  learningOutcomes: string[];
  prerequisites: string[];
}

export const programs: Program[] = [
  {
    id: 'ict-fundamentals',
    title: 'ICT Fundamentals',
    description: 'Master the basics of computers and technology through hands-on learning and exciting projects.',
    icon: Monitor,
    color: 'blue',
    ageRange: '5-8 years',
    duration: '8 weeks',
    skillLevel: 'Beginner',
    curriculum: [
      {
        title: 'Computer Basics',
        topics: [
          'Understanding computer parts and their functions',
          'Using mouse and keyboard effectively',
          'Basic computer operations and navigation',
          'File management and organization',
          'Introduction to computer safety'
        ]
      },
      {
        title: 'Digital Literacy',
        topics: [
          'Introduction to word processing',
          'Basic digital art and drawing',
          'Simple presentation creation',
          'Internet safety and responsible use',
          'Educational software exploration'
        ]
      },
      {
        title: 'Creative Computing',
        topics: [
          'Introduction to educational games',
          'Basic typing skills',
          'Simple multimedia projects',
          'Digital storytelling basics',
          'Introduction to coding concepts'
        ]
      }
    ],
    projects: [
      {
        title: 'Digital Art Gallery',
        description: 'Create a collection of digital artwork using basic drawing tools and save them in an organized folder structure.'
      },
      {
        title: 'My First Presentation',
        description: 'Design a simple presentation about favorite animals or hobbies using kid-friendly presentation software.'
      },
      {
        title: 'Digital Story Book',
        description: 'Combine text and images to create an interactive digital storybook about an exciting adventure.'
      }
    ],
    learningOutcomes: [
      'Confident use of basic computer functions',
      'Understanding of digital safety and responsibility',
      'Basic file management and organization skills',
      'Introduction to digital creativity and expression',
      'Foundation in computational thinking'
    ],
    prerequisites: [
      'No prior computer experience required',
      'Basic reading ability',
      'Interest in technology and learning',
      'Ability to follow simple instructions'
    ]
  },
  {
    id: 'scratch-programming',
    title: 'Scratch Programming',
    description: 'Learn to code through fun, visual programming using Scratch to create games and animations.',
    icon: Cat,
    color: 'orange',
    ageRange: '8-12 years',
    duration: '10 weeks',
    skillLevel: 'Beginner to Intermediate',
    curriculum: [
      {
        title: 'Scratch Basics',
        topics: [
          'Introduction to the Scratch interface',
          'Understanding sprites and backgrounds',
          'Basic motion and control blocks',
          'Events and triggers',
          'Sound and music integration'
        ]
      },
      {
        title: 'Animation & Stories',
        topics: [
          'Character animation techniques',
          'Creating interactive dialogues',
          'Scene transitions and effects',
          'Broadcast and message handling',
          'Storytelling through code'
        ]
      },
      {
        title: 'Game Development',
        topics: [
          'Game mechanics and rules',
          'Score tracking and variables',
          'Collision detection',
          'User interaction and controls',
          'Game levels and difficulty'
        ]
      }
    ],
    projects: [
      {
        title: 'Interactive Story Adventure',
        description: 'Create an animated story with multiple characters, scenes, and interactive elements where choices matter.'
      },
      {
        title: 'Arcade Game',
        description: 'Design and build a classic arcade-style game with scoring, multiple levels, and increasing difficulty.'
      },
      {
        title: 'Musical Animation',
        description: 'Develop an interactive music visualization with animated characters that respond to sound.'
      }
    ],
    learningOutcomes: [
      'Understanding of basic programming concepts',
      'Problem-solving and logical thinking skills',
      'Creative expression through code',
      'Project planning and organization',
      'Debugging and troubleshooting abilities'
    ],
    prerequisites: [
      'Basic computer skills',
      'Reading and writing ability',
      'Basic math knowledge',
      'Ability to follow multi-step instructions'
    ]
  },
  {
    id: 'web-development',
    title: 'HTML/CSS Programming',
    description: 'Build your own websites and learn the fundamentals of web development.',
    icon: Globe,
    color: 'purple',
    ageRange: '10-15 years',
    duration: '12 weeks',
    skillLevel: 'Intermediate',
    curriculum: [
      {
        title: 'HTML Fundamentals',
        topics: [
          'HTML document structure',
          'Text formatting and paragraphs',
          'Links and navigation',
          'Images and multimedia',
          'Lists, tables, and forms'
        ]
      },
      {
        title: 'CSS Styling',
        topics: [
          'CSS selectors and properties',
          'Colors and backgrounds',
          'Typography and text effects',
          'Box model and layouts',
          'Responsive design basics'
        ]
      },
      {
        title: 'Web Projects',
        topics: [
          'Building navigation menus',
          'Creating responsive layouts',
          'Styling forms and buttons',
          'Adding animations and effects',
          'Website optimization'
        ]
      }
    ],
    projects: [
      {
        title: 'Personal Portfolio',
        description: 'Create a multi-page personal website showcasing your interests, achievements, and creative work.'
      },
      {
        title: 'Blog Design',
        description: 'Design and build a responsive blog layout with articles, images, and interactive elements.'
      },
      {
        title: 'Business Landing Page',
        description: 'Develop a professional landing page for a business with contact forms and responsive design.'
      }
    ],
    learningOutcomes: [
      'Understanding of web development fundamentals',
      'Proficiency in HTML and CSS',
      'Responsive design principles',
      'Web accessibility awareness',
      'Project deployment skills'
    ],
    prerequisites: [
      'Basic computer skills',
      'Typing ability',
      'Understanding of file management',
      'Interest in web design'
    ]
  },
  {
    id: 'python-programming',
    title: 'Python Programming',
    description: 'Learn Python programming through practical projects and fun exercises.',
    icon: 'PythonIcon',
    color: 'green',
    ageRange: '12-15 years',
    duration: '14 weeks',
    skillLevel: 'Intermediate to Advanced',
    curriculum: [
      {
        title: 'Python Basics',
        topics: [
          'Variables and data types',
          'Control structures and loops',
          'Functions and modules',
          'Lists and dictionaries',
          'Error handling'
        ]
      },
      {
        title: 'Advanced Concepts',
        topics: [
          'Object-oriented programming',
          'File handling and I/O',
          'GUI development basics',
          'Working with libraries',
          'Basic algorithms'
        ]
      },
      {
        title: 'Project Development',
        topics: [
          'Project planning and structure',
          'Code organization',
          'Testing and debugging',
          'Documentation',
          'Best practices'
        ]
      }
    ],
    projects: [
      {
        title: 'Adventure Game',
        description: 'Create an interactive text-based adventure game with multiple paths and outcomes.'
      },
      {
        title: 'Data Analysis Tool',
        description: 'Build a program that analyzes and visualizes data from files or user input.'
      },
      {
        title: 'GUI Calculator',
        description: 'Develop a calculator application with a graphical user interface and advanced functions.'
      }
    ],
    learningOutcomes: [
      'Strong foundation in Python programming',
      'Problem-solving and algorithmic thinking',
      'Software design principles',
      'Testing and debugging skills',
      'Project management abilities'
    ],
    prerequisites: [
      'Basic programming concepts',
      'Good mathematical skills',
      'Logical thinking ability',
      'Commitment to practice'
    ]
  },
  {
    id: 'web-design',
    title: 'Web Design',
    description: 'Learn to create beautiful and responsive websites using modern design principles and tools.',
    icon: Palette,
    color: 'pink',
    ageRange: '12-15 years',
    duration: '12 weeks',
    skillLevel: 'Intermediate',
    curriculum: [
      {
        title: 'Design Fundamentals',
        topics: [
          'Color theory and typography',
          'Layout principles',
          'User interface design',
          'Visual hierarchy',
          'Design tools and software'
        ]
      },
      {
        title: 'Modern Web Design',
        topics: [
          'Responsive design techniques',
          'CSS frameworks and tools',
          'Modern layouts with Flexbox/Grid',
          'Animations and transitions',
          'Design systems'
        ]
      },
      {
        title: 'User Experience',
        topics: [
          'User-centered design',
          'Navigation and information architecture',
          'Accessibility principles',
          'Mobile-first design',
          'Testing and optimization'
        ]
      }
    ],
    projects: [
      {
        title: 'Portfolio Website',
        description: 'Design and build a professional portfolio website with modern design principles and animations.'
      },
      {
        title: 'E-commerce Design',
        description: 'Create a responsive e-commerce website design with product listings and shopping cart layout.'
      },
      {
        title: 'Mobile App Interface',
        description: 'Design a mobile application interface with focus on user experience and modern design trends.'
      }
    ],
    learningOutcomes: [
      'Understanding of design principles',
      'Proficiency in modern web design',
      'User experience best practices',
      'Responsive design skills',
      'Portfolio development'
    ],
    prerequisites: [
      'Basic HTML/CSS knowledge',
      'Creativity and attention to detail',
      'Interest in visual design',
      'Basic computer skills'
    ]
  },
  {
    id: 'robotics',
    title: 'Robotics Programming',
    description: 'Learn to build and program robots using modern robotics platforms.',
    icon: Bot,
    color: 'cyan',
    ageRange: '10-15 years',
    duration: '12 weeks',
    skillLevel: 'Intermediate',
    curriculum: [
      {
        title: 'Robotics Fundamentals',
        topics: [
          'Introduction to robotics',
          'Robot components and sensors',
          'Basic electronics concepts',
          'Motor control and movement',
          'Sensor integration'
        ]
      },
      {
        title: 'Programming Robots',
        topics: [
          'Basic movement and control',
          'Sensor-based behaviors',
          'Autonomous navigation',
          'Remote control systems',
          'Robot communication'
        ]
      },
      {
        title: 'Advanced Projects',
        topics: [
          'Line following algorithms',
          'Obstacle avoidance',
          'Robot arm control',
          'Project integration',
          'Testing and optimization'
        ]
      }
    ],
    projects: [
      {
        title: 'Line Follower Robot',
        description: 'Build and program a robot that can autonomously follow a line path using sensors.'
      },
      {
        title: 'Obstacle Course Navigator',
        description: 'Create a robot that can navigate through an obstacle course using various sensors.'
      },
      {
        title: 'Remote Controlled Robot',
        description: 'Develop a robot that can be controlled remotely through a custom interface.'
      }
    ],
    learningOutcomes: [
      'Understanding of robotics principles',
      'Programming and control skills',
      'Problem-solving abilities',
      'Electronics knowledge',
      'Project development experience'
    ],
    prerequisites: [
      'Basic programming knowledge',
      'Interest in robotics and electronics',
      'Basic math skills',
      'Patience and attention to detail'
    ]
  }
];