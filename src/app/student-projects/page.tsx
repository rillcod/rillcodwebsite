"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2 } from "lucide-react";
import {
  CodeBracketIcon,
  CpuChipIcon,
  GlobeAltIcon,
  SparklesIcon,
  TrophyIcon,
  AcademicCapIcon,
  RocketLaunchIcon,
} from "@/lib/icons";

type ProjectCategory =
  | "All Projects"
  | "Robotics & IoT"
  | "Web & Software"
  | "AI & Vision"
  | "Game Dev";

interface ProjectItem {
  id: number;
  title: string;
  level: string;
  category: Exclude<ProjectCategory, "All Projects">;
  cohort: string;
  schoolTrack: string;
  description: string;
  image: string;
  deliverables: string[];
  technologies: string[];
  outcome: string;
}

const projects: ProjectItem[] = [
  {
    id: 1,
    title: "Obstacle-Avoiding Ultrasonic Rover",
    level: "Junior & Senior Secondary",
    category: "Robotics & IoT",
    cohort: "Edo Partner School Robotics Cohort",
    schoolTrack: "GRA & Airport Road Partner Labs",
    description:
      "Learners wire DC motor drivers, chassis frames, and HC-SR04 ultrasonic sensors to steer an autonomous robot clear of classroom obstacles.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM.jpeg",
    deliverables: ["Wired Circuit & Chassis", "Autonomous Navigation Firmware", "Live Demo Run"],
    technologies: ["Arduino C++", "Ultrasonic Sensor", "L298N Motor Driver"],
    outcome: "Presented at Rillcod STEM Expo",
  },
  {
    id: 2,
    title: "Python Classroom & Quiz Assistant",
    level: "JSS 2 – SS 3 Track",
    category: "Web & Software",
    cohort: "Python Programming Cohort",
    schoolTrack: "Partner Secondary School ICT Labs",
    description:
      "Students write modular Python scripts that quiz classmates on science and maths topics, score responses automatically, and summarise weak areas.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.56 PM.jpeg",
    deliverables: ["Python CLI / GUI Logic", "Question Bank Parser", "Automated Score Report"],
    technologies: ["Python 3", "Algorithms", "File Handling"],
    outcome: "Term 2 Capstone Assessment",
  },
  {
    id: 3,
    title: "Smart Classroom Lighting & Safety Monitor",
    level: "Secondary Hardware Track",
    category: "Robotics & IoT",
    cohort: "Hardware & Physical Computing Lab",
    schoolTrack: "Benin City STEM Innovation Centre",
    description:
      "Scholars prototype energy-saving classroom lighting and motion alerts on breadboards using light-dependent resistors, buzzers, and microcontrollers.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM.jpeg",
    deliverables: ["Breadboard Schematic", "Sensor Threshold Calibration", "Safety Prototype"],
    technologies: ["Electronics", "Arduino IDE", "LDR & Buzzer Modules"],
    outcome: "Partner School Engineering Fair",
  },
  {
    id: 4,
    title: "Responsive School House Portal & Blog",
    level: "JSS 3 – SS 3 Track",
    category: "Web & Software",
    cohort: "Web Design & Frontend Builders",
    schoolTrack: "Partner School Computer Suites",
    description:
      "Team builds publishing school sports announcements, timetables, and student essays using clean semantic HTML, CSS Grid, and interactive JavaScript.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.03 PM (1).jpeg",
    deliverables: ["Multi-page Layout", "Mobile Responsive Styles", "Interactive Filtering"],
    technologies: ["HTML5", "CSS3", "JavaScript"],
    outcome: "Student Portfolio Showcase",
  },
  {
    id: 5,
    title: "Interactive Maths & Civic Adventure Game",
    level: "Primary 4 – JSS 1 Track",
    category: "Game Dev",
    cohort: "Junior Block Coding Scholars",
    schoolTrack: "Primary Partner Schools",
    description:
      "Young coders design animated sprite characters, multi-level logic puzzles, and scoreboards in Scratch to reinforce classroom numeracy and road safety.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.57 PM.jpeg",
    deliverables: ["Custom Sprites & Stages", "Variable Scoring System", "Playable Build"],
    technologies: ["Scratch", "Event Logic", "Game Design"],
    outcome: "Junior Innovators Merit Award",
  },
  {
    id: 6,
    title: "Applied AI Prompting & Vision Lab Prototype",
    level: "Senior Secondary / Bootcamps",
    category: "AI & Vision",
    cohort: "Applied AI & Automation Cohort",
    schoolTrack: "Weekend & Holiday STEM Academy",
    description:
      "Senior scholars train image-classification experiments and build Python workflows that classify waste sorting and agricultural leaf health examples.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.29 PM (1).jpeg",
    deliverables: ["Labeled Sample Set", "Classification Workflow", "Capstone Briefing"],
    technologies: ["Python", "Applied AI", "Data Literacy"],
    outcome: "Senior Capstone Distinction",
  },
];

const categories: Array<{
  name: ProjectCategory;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { name: "All Projects", icon: CodeBracketIcon },
  { name: "Robotics & IoT", icon: CpuChipIcon },
  { name: "Web & Software", icon: GlobeAltIcon },
  { name: "AI & Vision", icon: SparklesIcon },
  { name: "Game Dev", icon: RocketLaunchIcon },
];

export default function StudentProjectsPage() {
  const [selectedCategory, setSelectedCategory] = useState<ProjectCategory>("All Projects");

  const visibleProjects =
    selectedCategory === "All Projects"
      ? projects
      : projects.filter((p) => p.category === selectedCategory);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
              Student Projects Showcase
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 max-w-4xl mx-auto leading-relaxed">
              Practical hardware, software, game-logic, and AI capstones built by Rillcod Technologies
              learners across Benin City and partner schools in Edo State.
            </p>
          </div>
        </div>
      </section>

      {/* Curriculum Highlights */}
      <section className="py-12 sm:py-16 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 lg:gap-8 text-center">
            <div className="bg-blue-500/10 border border-blue-500/15 p-5 sm:p-6 rounded-2xl">
              <div className="text-3xl font-bold text-blue-600 mb-2">12 Years</div>
              <div className="text-muted-foreground text-sm">Primary 1 to SS 3 Curriculum</div>
            </div>
            <div className="bg-green-500/10 border border-green-500/15 p-5 sm:p-6 rounded-2xl">
              <div className="text-3xl font-bold text-green-600 mb-2">4 Tracks</div>
              <div className="text-muted-foreground text-sm">Robotics, Web, AI &amp; Game Dev</div>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/15 p-5 sm:p-6 rounded-2xl">
              <div className="text-3xl font-bold text-purple-600 mb-2">Every Term</div>
              <div className="text-muted-foreground text-sm">Hands-On Capstone Projects</div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/15 p-5 sm:p-6 rounded-2xl">
              <div className="text-3xl font-bold text-primary mb-2">Benin City</div>
              <div className="text-muted-foreground text-sm">Onsite &amp; School-Hosted Labs</div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Filter Categories */}
      <section className="py-8 bg-muted/40 border-y border-border">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-wrap justify-center gap-3">
            {categories.map((category) => {
              const count =
                category.name === "All Projects"
                  ? projects.length
                  : projects.filter((p) => p.category === category.name).length;
              const active = selectedCategory === category.name;
              return (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => setSelectedCategory(category.name)}
                  className={`flex min-h-11 items-center space-x-2 border px-5 py-2.5 rounded-full shadow-sm transition-colors ${
                    active
                      ? "bg-primary text-white border-primary"
                      : "bg-card text-foreground border-border hover:bg-muted/60"
                  }`}
                >
                  <category.icon className={`w-5 h-5 ${active ? "text-white" : "text-primary"}`} />
                  <span className="font-medium">{category.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Projects Grid */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {visibleProjects.map((project) => (
              <div
                key={project.id}
                className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="relative h-52 w-full">
                  <Image
                    src={project.image}
                    alt={project.title}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                  <div className="absolute top-4 left-4 bg-primary text-white px-3 py-1 rounded-full text-xs font-semibold">
                    {project.category}
                  </div>
                </div>

                <div className="p-6 flex flex-col flex-1">
                  <h3 className="text-xl font-bold text-foreground mb-2">{project.title}</h3>
                  <p className="text-muted-foreground text-sm mb-4 flex-1">{project.description}</p>

                  <div className="space-y-1.5 mb-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <AcademicCapIcon className="w-4 h-4 text-primary shrink-0" />
                      <span>{project.level}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary shrink-0" />
                      <span>{project.schoolTrack}</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="font-semibold text-foreground text-sm mb-2">Key Deliverables:</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {project.deliverables.map((item) => (
                        <span
                          key={item}
                          className="bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full text-xs"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mb-5">
                    <h4 className="font-semibold text-foreground text-sm mb-2">Stack &amp; Kit:</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {project.technologies.map((tech) => (
                        <span
                          key={tech}
                          className="bg-muted text-muted-foreground px-2.5 py-1 rounded-full text-xs"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      <TrophyIcon className="w-4 h-4 text-amber-500 shrink-0" />
                      {project.outcome}
                    </span>
                    <Link
                      href="/gallery"
                      className="text-xs font-bold text-primary hover:underline whitespace-nowrap"
                    >
                      See Lab Gallery →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Build Real Projects?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Enrol a student or bring Rillcod Technologies&apos; structured project-based STEM lab to your school.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/student-registration"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 text-lg font-bold rounded-full shadow-lg hover:bg-gray-100 transition-colors"
            >
              Enrol a Student
            </Link>
            <Link
              href="/programs"
              className="inline-flex items-center justify-center px-8 py-4 border-2 border-white/70 text-white text-lg font-bold rounded-full hover:bg-white hover:text-blue-600 transition-colors"
            >
              Explore Curriculum Tracks
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
