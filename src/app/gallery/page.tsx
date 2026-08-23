"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Camera,
  Search,
  Eye,
  Play,
  X,
  Share2,
  Sparkles,
  ArrowRight,
  Building2,
  Trophy,
} from "lucide-react";
import { brandContact } from "@/config/brand";
import { SCHOOL_REGISTRATION_PATH } from "@/lib/registration/enrollment-types";

interface GalleryItem {
  id: number;
  title: string;
  description: string;
  category: "coding" | "robotics" | "capstone" | "exhibition" | "video";
  mediaType: "image" | "video";
  src: string;
  views: number;
  likes: number;
  featured: boolean;
  tag: string;
}

const galleryData: GalleryItem[] = [
  {
    id: 1,
    title: "Classroom Robotics Engineering Lab",
    description: "Students collaborating on sensor assembly, motor gearing, and chassis programming.",
    category: "robotics",
    mediaType: "image",
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM.jpeg",
    views: 3120,
    likes: 245,
    featured: true,
    tag: "Robotics",
  },
  {
    id: 2,
    title: "Facilitator Coaching Electronics Bench",
    description: "Certified STEM facilitator guiding young scholars on breadboard circuits and logic gates.",
    category: "capstone",
    mediaType: "image",
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM (1).jpeg",
    views: 2840,
    likes: 198,
    featured: true,
    tag: "Hardware Lab",
  },
  {
    id: 3,
    title: "Young Programmers in Python Lab",
    description: "Learners in school uniform writing software algorithms and debugging syntax on laptops.",
    category: "coding",
    mediaType: "image",
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.56 PM.jpeg",
    views: 3490,
    likes: 310,
    featured: true,
    tag: "Coding & AI",
  },
  {
    id: 4,
    title: "Annual STEM Summit & Trophy Presentation",
    description: "Grand exhibition celebrating student milestone inventions with school proprietors and principals.",
    category: "exhibition",
    mediaType: "image",
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.27 PM.jpeg",
    views: 4200,
    likes: 412,
    featured: true,
    tag: "Summit & Awards",
  },
  {
    id: 5,
    title: "Live Capstone Project Presentation",
    description: "Scholars presenting automated obstacle-avoiding vehicle demos to visiting parents.",
    category: "capstone",
    mediaType: "image",
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.29 PM (1).jpeg",
    views: 2190,
    likes: 165,
    featured: false,
    tag: "Capstone",
  },
  {
    id: 6,
    title: "Computer Laboratory Build Session",
    description: "Dozens of learners actively coding interactive web projects in a partner school ICT suite.",
    category: "coding",
    mediaType: "image",
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.03 PM (1).jpeg",
    views: 2650,
    likes: 180,
    featured: false,
    tag: "Lab Session",
  },
  {
    id: 7,
    title: "Physical Computing & Arduino Prototyping",
    description: "Hands-on microcontroller testing with real LED and ultrasonic sensor integration.",
    category: "robotics",
    mediaType: "image",
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM.jpeg",
    views: 1980,
    likes: 142,
    featured: false,
    tag: "Electronics",
  },
  {
    id: 8,
    title: "Junior Block Coding & Game Logic",
    description: "Primary school scholar building game mechanics in Scratch using structured logic worksheets.",
    category: "coding",
    mediaType: "image",
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.57 PM.jpeg",
    views: 2310,
    likes: 175,
    featured: false,
    tag: "Primary Code",
  },
  {
    id: 9,
    title: "Live Student Robotics Demonstration",
    description: "Watch an autonomous rover built by Rillcod secondary scholars in action.",
    category: "video",
    mediaType: "video",
    src: "/images/EVENTS/WhatsApp Video 2026-08-14 at 7.46.27 PM (1).mp4",
    views: 5120,
    likes: 540,
    featured: true,
    tag: "Live Video Clip",
  },
  {
    id: 10,
    title: "Inter-School Science Fair Demonstration",
    description: "Demonstrating automated electronics at the regional inter-school science summit.",
    category: "video",
    mediaType: "video",
    src: "/images/EVENTS/WhatsApp Video 2026-08-14 at 7.45.04 PM.mp4",
    views: 3890,
    likes: 310,
    featured: false,
    tag: "Live Video Clip",
  },
  {
    id: 11,
    title: "STEM Excellence Award Ceremony",
    description: "Distinguished awards presented to partner school leadership and winning scholars.",
    category: "exhibition",
    mediaType: "image",
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.30 PM (1).jpeg",
    views: 2780,
    likes: 210,
    featured: false,
    tag: "Awards",
  },
  {
    id: 12,
    title: "Exhibition Celebration with Facilitators",
    description: "Faculty facilitators and school leadership celebrating a completed academic term.",
    category: "exhibition",
    mediaType: "image",
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.32 PM.jpeg",
    views: 3150,
    likes: 290,
    featured: false,
    tag: "Celebration",
  },
];

const categories = [
  { id: "all", name: "All Media" },
  { id: "robotics", name: "🤖 Robotics & Hardware" },
  { id: "coding", name: "💻 Coding & Software" },
  { id: "capstone", name: "🔬 Capstone Builds" },
  { id: "exhibition", name: "🏆 Exhibitions & Awards" },
  { id: "video", name: "🎥 Live Video Clips" },
];

export default function GalleryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);

  const filteredItems = galleryData.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.tag.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="min-h-screen bg-background text-foreground public-page-root font-sans">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 -left-64 w-[400px] h-[400px] bg-brand-red-600/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 lg:px-20 py-12 sm:py-20 relative z-10 space-y-12">
        {/* Header Banner */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-card/90 backdrop-blur-md border border-border/80 rounded-full shadow-sm">
            <span className="w-2 h-2 rounded-full bg-brand-red-500 animate-ping" />
            <span className="text-[10px] font-black text-foreground uppercase tracking-widest">
              Authentic Classroom &amp; Summit Media
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-foreground uppercase tracking-tight leading-[1.08]">
            Real Classrooms. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red-600 via-primary to-brand-red-500">
              Real Inventions.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground font-medium leading-relaxed">
            Browse authentic photography and live video clips from Rillcod partner schools — featuring hands-on robotics builds, coding sessions, and termly summit exhibitions.
          </p>
        </div>

        {/* Search & Kinetic Category Filter Strip */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by topic, robotics, coding, exhibition..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-card/90 border border-border/80 rounded-2xl text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-red-500 shadow-sm"
              />
            </div>

            <div className="text-xs font-bold text-muted-foreground self-center sm:self-auto">
              Showing <span className="text-foreground font-black">{filteredItems.length}</span> authentic media items
            </div>
          </div>

          {/* Kinetic Horizontal Category Filter */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar touch-pan-x border-b border-border/60">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all min-h-[40px] ${
                  selectedCategory === cat.id
                    ? "bg-brand-red-600 text-white shadow-lg shadow-brand-red-950/40"
                    : "bg-card text-muted-foreground hover:text-foreground border border-border/80 hover:bg-card/90"
                }`}
              >
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Gallery Media Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setActiveItem(item)}
              className="group cursor-pointer bg-card/90 backdrop-blur-xl border border-border/80 rounded-3xl overflow-hidden shadow-xl hover:bg-card transition-all hover:-translate-y-1.5 flex flex-col justify-between"
            >
              {/* Media Thumbnail Container */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-950">
                {item.mediaType === "video" ? (
                  <div className="relative w-full h-full">
                    <video
                      src={item.src}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center group-hover:bg-slate-950/20 transition-colors">
                      <div className="w-12 h-12 rounded-2xl bg-brand-red-600/90 text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <Image
                    src={item.src}
                    alt={item.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 350px"
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />

                {/* Top Badge */}
                <div className="absolute top-3 right-3 z-10">
                  <span className="rounded-full bg-slate-950/80 border border-white/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-md shadow-md">
                    {item.tag}
                  </span>
                </div>
              </div>

              {/* Media Description */}
              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-foreground uppercase tracking-tight group-hover:text-primary transition-colors leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground text-[11px] font-medium leading-relaxed mt-1 line-clamp-2">
                    {item.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-border/60 flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3 text-brand-red-500" />
                    {item.views.toLocaleString()} views
                  </span>
                  <span className="text-primary font-black uppercase tracking-wider group-hover:underline">
                    View Media ↗
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Lightbox Modal */}
        {activeItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in"
            onClick={() => setActiveItem(null)}
          >
            <div
              className="relative w-full max-w-4xl overflow-hidden rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/80">
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-brand-red-600/20 border border-brand-red-500/40 px-2.5 py-0.5 text-[10px] font-black uppercase text-brand-red-400">
                      {activeItem.tag}
                    </span>
                    <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wide truncate">
                      {activeItem.title}
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    {activeItem.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Media Stage */}
              <div className="relative aspect-[16/10] sm:aspect-video bg-black flex items-center justify-center">
                {activeItem.mediaType === "video" ? (
                  <video
                    src={activeItem.src}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="relative w-full h-full">
                    <Image
                      src={activeItem.src}
                      alt={activeItem.title}
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Lightbox Footer Actions */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                  <span>{activeItem.views} views</span>
                  <span>{activeItem.likes} likes</span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`${brandContact.whatsapp}?text=${encodeURIComponent(
                      `Hello Rillcod — I'm viewing this media "${activeItem.title}" on the Academy gallery and would like to learn more.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-md shadow-emerald-950/40 transition-all"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share on WhatsApp</span>
                  </a>

                  <Link
                    href={SCHOOL_REGISTRATION_PATH}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-red-600 hover:bg-brand-red-500 text-white text-xs font-black shadow-md shadow-brand-red-950/40 transition-all"
                  >
                    <span>Partner Your School</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}