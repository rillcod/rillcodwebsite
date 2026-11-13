"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Mail,
  Phone,
  BookOpen,
  Users,
  Code,
  Sparkles,
  Heart,
  Zap,
  Target,
  Star,
  Building2,
  Cpu,
  Shield,
  ArrowRight,
  MapPin,
} from "lucide-react";
import { brandContact } from "@/config/brand";

type DivisionFilter =
  | "All Divisions"
  | "Curriculum & Pedagogy"
  | "Robotics & Hardware"
  | "Software & AI Platform"
  | "School Operations & Success";

interface DivisionCard {
  name: string;
  leadTitle: string;
  division: Exclude<DivisionFilter, "All Divisions">;
  image: string;
  summary: string;
  focusAreas: string[];
  deliverables: string[];
}

const divisions: DivisionCard[] = [
  {
    name: "Academic Curriculum & Instruction",
    leadTitle: "Certified STEM Facilitators & Curriculum Specialists",
    division: "Curriculum & Pedagogy",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.56 PM.jpeg",
    summary:
      "Designs and delivers our 12-year progressive coding, digital literacy, and applied AI pathway directly inside partner-school timetables and onsite Benin City cohorts.",
    focusAreas: ["Scratch & Block Logic", "Python & Data Literacy", "Termly Competency Rubrics"],
    deliverables: [
      "Structured weekly lesson plans aligned to school calendars",
      "Hands-on classroom facilitation for Primary & Secondary grades",
      "End-of-term evaluations and verified portfolio records",
    ],
  },
  {
    name: "Robotics, IoT & Physical Computing Lab",
    leadTitle: "Embedded Systems & Hardware Prototyping Unit",
    division: "Robotics & Hardware",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM.jpeg",
    summary:
      "Equips classrooms with robotics kits, microcontrollers, sensors, and breadboard packs so students test real-world engineering principles physically rather than only reading slides.",
    focusAreas: ["Arduino & C++", "Sensor Electronics", "Autonomous Robotics"],
    deliverables: [
      "Maintainable classroom hardware kits across partner schools",
      "Supervised circuit building and troubleshooting workshops",
      "Inter-school exhibition & capstone judging coordination",
    ],
  },
  {
    name: "Engineering & Learning Platform",
    leadTitle: "Platform Software, Cloud Infrastructure & AI Tooling",
    division: "Software & AI Platform",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.03 PM (1).jpeg",
    summary:
      "Operates the Rillcod Academy web platform powering live classes, CBT assessments, attendance tracking, termly school performance books, and parent visibility.",
    focusAreas: ["Student & Parent Portals", "Automated Termly Reports", "Live Classrooms"],
    deliverables: [
      "Unified student, teacher, parent, and school partner portals",
      "Real-time attendance, project grading, and certificate verification",
      "Automated PDF school performance briefings for proprietors",
    ],
  },
  {
    name: "School Partnerships & Family Support",
    leadTitle: "Admissions, School Onboarding & Operations",
    division: "School Operations & Success",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.27 PM.jpeg",
    summary:
      "Handles school proprietor briefings, partnership MoUs, term billing transparency, and responsive WhatsApp, email, and onsite support from our GRA Benin City centre.",
    focusAreas: ["School Onboarding", "Parent Support", "Quality Assurance"],
    deliverables: [
      "Timetable deployment for partner schools across Edo State",
      "Fast family assistance via phone, email, and WhatsApp",
      "Termly showcase and parent demo day coordination",
    ],
  },
];

const values = [
  {
    title: "Practical Mastery",
    description: "Every learner writes real code and wires real circuits — never theory alone.",
    icon: Cpu,
    color: "from-amber-500 to-primary",
  },
  {
    title: "Instructional Rigour",
    description: "Structured weekly pacing, attendance accountability, and verifiable term assessments.",
    icon: Star,
    color: "from-blue-500 to-cyan-500",
  },
  {
    title: "Transparency & Trust",
    description: "Clear communication with schools and families through live portals and printed reports.",
    icon: Shield,
    color: "from-green-500 to-emerald-500",
  },
  {
    title: "Local Impact",
    description: "Built in Benin City to make world-class STEM instruction practical in every school.",
    icon: Target,
    color: "from-purple-500 to-violet-500",
  },
];

const filterOptions: DivisionFilter[] = [
  "All Divisions",
  "Curriculum & Pedagogy",
  "Robotics & Hardware",
  "Software & AI Platform",
  "School Operations & Success",
];

export default function Team() {
  const [selectedDivision, setSelectedDivision] = useState<DivisionFilter>("All Divisions");

  const visibleDivisions =
    selectedDivision === "All Divisions"
      ? divisions
      : divisions.filter((d) => d.division === selectedDivision);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden public-page-root">
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Hero Section */}
        <div className="text-center mb-14 bg-card border border-border rounded-3xl p-8 sm:p-12 shadow-sm">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" /> {brandContact.contractingParty}
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-foreground mb-4 tracking-tight">
            The Team &amp; Divisions Behind Rillcod
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-6 leading-relaxed">
            Our STEM educators, robotics facilitators, curriculum designers, and software engineers work as an
            embedded technology department for partner schools and families across {brandContact.operatingRegion} and online.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-primary" /> Classroom Facilitators
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-blue-500" /> Hardware &amp; Software Engineers
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-500" /> {brandContact.addressShort}
            </span>
          </div>
        </div>

        {/* Executive Leadership & Institutional Governance */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-10 mb-14 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
                <Building2 className="w-4 h-4" /> Executive Leadership &amp; Governance
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
                Directed by {brandContact.signatory}
              </h2>
              <p className="text-sm font-semibold text-primary">{brandContact.signatoryRole}</p>
              <p className="text-muted-foreground leading-relaxed">
                Operating under <strong>{brandContact.contractingParty}</strong> ({brandContact.rcNumber}),
                Rillcod Technologies oversees onsite facilitator deployment, hardware maintenance, digital
                learning systems, and school partnership quality assurance from our headquarters in GRA, Benin City.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href={`mailto:${brandContact.email}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
                >
                  <Mail className="w-4 h-4" /> {brandContact.email}
                </a>
                <a
                  href={`tel:${brandContact.phoneShort.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-foreground text-xs font-bold uppercase tracking-wider hover:bg-muted transition-colors"
                >
                  <Phone className="w-4 h-4 text-primary" /> {brandContact.phoneShort}
                </a>
              </div>
            </div>
            <div className="lg:col-span-5 relative h-64 sm:h-72 rounded-2xl overflow-hidden border border-border">
              <Image
                src="/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM (1).jpeg"
                alt="Rillcod STEM coaching and lab instruction in Benin City"
                fill
                unoptimized
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>

        {/* Core Values */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">How We Work</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => (
              <div
                key={value.title}
                className="bg-card rounded-2xl shadow-sm border border-border p-6 text-center"
              >
                <div
                  className={`w-14 h-14 bg-gradient-to-r ${value.color} rounded-2xl flex items-center justify-center mx-auto mb-4 text-white`}
                >
                  <value.icon className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{value.title}</h3>
                <p className="text-sm text-muted-foreground">{value.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Division Filter */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {filterOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSelectedDivision(option)}
              className={`px-5 py-2.5 rounded-full border text-sm font-medium transition-colors ${
                selectedDivision === option
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-border text-foreground hover:bg-muted"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Specialist Divisions */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">Specialist Divisions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {visibleDivisions.map((unit) => (
              <div
                key={unit.name}
                className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden flex flex-col"
              >
                <div className="relative h-56 w-full">
                  <Image
                    src={unit.image}
                    alt={unit.name}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                  />
                  <span className="absolute top-4 left-4 bg-background/90 text-foreground px-3 py-1 rounded-full text-xs font-semibold">
                    {unit.division}
                  </span>
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="text-xl font-bold text-foreground mb-1">{unit.name}</h3>
                  <p className="text-sm font-semibold text-primary mb-3">{unit.leadTitle}</p>
                  <p className="text-sm text-muted-foreground mb-4">{unit.summary}</p>

                  <div className="mb-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-2">
                      Core Focus
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {unit.focusAreas.map((area) => (
                        <span
                          key={area}
                          className="bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-medium"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>

                  <ul className="space-y-1.5 text-sm text-muted-foreground mb-6 flex-1">
                    {unit.deliverables.map((d) => (
                      <li key={d}>• {d}</li>
                    ))}
                  </ul>

                  <div className="pt-4 border-t border-border flex items-center justify-between">
                    <Link
                      href={`/contact?subject=${encodeURIComponent(`Inquiry: ${unit.name}`)}`}
                      className="inline-flex items-center text-sm font-semibold text-primary hover:underline"
                    >
                      Contact this Division <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                    <Link
                      href="/careers"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Join Team →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Join Our Team CTA */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 sm:p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Work With Us</h2>
          <p className="text-lg sm:text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Are you a STEM educator, robotics trainer, or software developer in Benin City or remote?
            Explore our open positions or partner your school with Rillcod Technologies.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/careers"
              className="inline-flex items-center justify-center bg-white text-blue-600 px-8 py-3.5 rounded-full font-semibold hover:bg-gray-100 transition-colors"
            >
              View Open Positions
            </Link>
            <Link
              href="/school-registration"
              className="inline-flex items-center justify-center border-2 border-white/70 text-white px-8 py-3.5 rounded-full font-semibold hover:bg-white hover:text-blue-600 transition-colors"
            >
              Partner Your School
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
