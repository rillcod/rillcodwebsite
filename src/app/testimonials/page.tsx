'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Star,
  Quote,
  Users,
  Award,
  BookOpen,
  Code,
  Sparkles,
  CheckCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Building,
  GraduationCap,
  Heart,
} from 'lucide-react';

type Testimonial = {
  id: number;
  name: string;
  role: string;
  school: string;
  content: string;
  rating: number;
  category: 'Student' | 'Parent' | 'School';
  achievements: string[];
  featured?: boolean;
  location: string;
  program: string;
  duration: string;
  avatarGradient: string;
  verifiedLabel: string;
};

const testimonialsData: Testimonial[] = [
  {
    id: 1,
    name: 'Master Daniel Eze',
    role: 'SS3 Student & Web Developer',
    school: 'St. Maria Goretti College, Benin City',
    content: 'Rillcod Academy completely changed my understanding of software engineering. I started with zero coding experience and now I build responsive web apps and Python scripts. The teachers are supportive, and the hands-on projects helped me build a strong portfolio for university.',
    rating: 5,
    category: 'Student',
    achievements: ['Built 5 Web & Python Projects', 'State STEM Competition Winner', 'Portfolio Certified'],
    featured: true,
    location: 'Benin City, Edo State',
    program: 'Full-Stack Web Engineering',
    duration: '2 Years',
    avatarGradient: 'from-violet-600 to-indigo-600',
    verifiedLabel: '✓ Verified Student',
  },
  {
    id: 2,
    name: 'Mr. Osaro Igbinedion',
    role: 'Parent of JSS2 Student',
    school: 'Edo College, Benin City',
    content: 'As a parent, I wanted my daughter to develop practical technology skills early. Rillcod Academy exceeded all expectations. Her confidence has grown tremendously, and she explains Python and robotics concepts to me at home. The online gradebook keeps me informed every term.',
    rating: 5,
    category: 'Parent',
    achievements: ['Parent Portal Active', 'Term Reports Tracked', 'Robotics Showcase Top 5'],
    featured: true,
    location: 'Benin City, Edo State',
    program: 'Robotics & Applied STEM',
    duration: '1.5 Years',
    avatarGradient: 'from-emerald-600 to-teal-600',
    verifiedLabel: '✓ Verified Parent',
  },
  {
    id: 3,
    name: 'Mrs. Grace Ogbebor',
    role: 'School Principal',
    school: 'St. Maria Goretti College, Benin City',
    content: 'Partnering with Rillcod Academy has elevated our school STEM curriculum. Our students compete in national technology challenges and show remarkable growth in analytical thinking. The digital gradebook and term report generation make continuous assessment seamless for our teachers.',
    rating: 5,
    category: 'School',
    achievements: ['School Curriculum Partner', '500+ Students Enrolled', 'Annual STEM Exhibition Winner'],
    featured: true,
    location: 'Benin City, Edo State',
    program: 'School Partnership Pathway',
    duration: '3 Years',
    avatarGradient: 'from-amber-500 to-orange-600',
    verifiedLabel: '✓ Partner School Principal',
  },
  {
    id: 4,
    name: 'Miss Blessing Aigbe',
    role: 'JSS3 Student',
    school: 'Federal Government College, Benin City',
    content: 'The robotics program is super exciting! I built a smart automated traffic light prototype using Python logic and hardware components. The practical projects make learning natural and enjoyable.',
    rating: 5,
    category: 'Student',
    achievements: ['Hardware Prototype Built', 'Python Fundamentals', 'Class Top Scorer'],
    featured: false,
    location: 'Benin City, Edo State',
    program: 'Robotics & Hardware Logic',
    duration: '1 Year',
    avatarGradient: 'from-sky-500 to-blue-600',
    verifiedLabel: '✓ Verified Student',
  },
  {
    id: 5,
    name: 'Mrs. Chioma Okonkwo',
    role: 'Parent of Primary 5 Pupil',
    school: 'University of Benin Staff School',
    content: 'My son started with Scratch visual block coding and now builds interactive math games. The step-by-step 12-year progression ensures he builds real problem-solving habits at a young age.',
    rating: 5,
    category: 'Parent',
    achievements: ['Visual Block Master', 'Problem Solving Skills', 'Early STEM Foundations'],
    featured: false,
    location: 'Benin City, Edo State',
    program: 'Scratch Coding for Kids',
    duration: '2 Years',
    avatarGradient: 'from-rose-500 to-pink-600',
    verifiedLabel: '✓ Verified Parent',
  },
  {
    id: 6,
    name: 'Mrs. Patience Ehiagwina',
    role: 'Vice Principal Academics',
    school: 'Edo College, Benin City',
    content: 'The LMS dashboard gives our teachers accurate data on student progress. We can monitor class scores, grade assignments online, and export official WAEC-formatted report cards effortlessly.',
    rating: 5,
    category: 'School',
    achievements: ['Integrated Gradebook', 'Term Reports Automated', 'Continuous Assessment'],
    featured: false,
    location: 'Benin City, Edo State',
    program: 'Institutional LMS Integration',
    duration: '2.5 Years',
    avatarGradient: 'from-purple-600 to-indigo-700',
    verifiedLabel: '✓ Partner School Leader',
  },
  {
    id: 7,
    name: 'Master Victor Igbinedion',
    role: 'SS1 Student',
    school: 'Federal Government College, Benin City',
    content: 'Learning full-stack web development at Rillcod showed me how real software applications are built. I can write HTML, CSS, JavaScript, and React code cleanly. It is the best learning decision I have made.',
    rating: 5,
    category: 'Student',
    achievements: ['React & JS Proficient', 'Built School Portal Mockup', 'High Honor Roll'],
    featured: false,
    location: 'Benin City, Edo State',
    program: 'Web Engineering',
    duration: '1 Year',
    avatarGradient: 'from-teal-500 to-emerald-600',
    verifiedLabel: '✓ Verified Student',
  },
  {
    id: 8,
    name: 'Mr. Emmanuel Omoregie',
    role: 'Parent of SS2 Student',
    school: 'Greater Tomorrow Secondary School',
    content: 'The student portfolio feature is excellent. My daughter has a verified record of all her coding projects and continuous assessment results that she can present when applying for university computer science admissions.',
    rating: 5,
    category: 'Parent',
    achievements: ['Verified Project Portfolio', 'University Admissions Ready', 'STEM Scholar'],
    featured: false,
    location: 'Benin City, Edo State',
    program: 'Python & AI Foundations',
    duration: '2 Years',
    avatarGradient: 'from-cyan-500 to-blue-600',
    verifiedLabel: '✓ Verified Parent',
  },
];

const categories = ['All', 'Student', 'Parent', 'School'] as const;

const impactStats = [
  { number: '5,000+', label: 'Active STEM Learners', icon: Users, color: 'text-primary' },
  { number: '50+', label: 'Partner Schools', icon: Building, color: 'text-emerald-500' },
  { number: '12,000+', label: 'Projects Built', icon: Code, color: 'text-sky-500' },
  { number: '98%', label: 'Parent & School Satisfaction', icon: Heart, color: 'text-rose-500' },
];

function getInitials(name: string): string {
  return name
    .replace(/(Master|Miss|Mr\.|Mrs\.)\s+/g, '')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function TestimonialsPage() {
  const [selectedCategory, setSelectedCategory] = useState<(typeof categories)[number]>('All');

  const filteredTestimonials = testimonialsData.filter(
    (item) => selectedCategory === 'All' || item.category === selectedCategory
  );

  const featured = filteredTestimonials.filter((t) => t.featured);
  const regular = filteredTestimonials.filter((t) => !t.featured);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      {/* ── Hero Section ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary/5 via-background to-background py-16 sm:py-24">
        <div className="pointer-events-none absolute -top-32 -left-20 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 -right-20 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-primary mb-6">
            <Sparkles className="h-4 w-4" /> Real Stories &amp; Proven Impact
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-foreground">
            Student &amp; School <span className="text-primary">Success Stories</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Discover how students, parents, and partner school principals are transforming technology education and building real STEM capabilities across Nigeria.
          </p>

          {/* Impact Stats Grid */}
          <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4 sm:gap-6">
            {impactStats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-border bg-card p-5 sm:p-6 text-center shadow-sm">
                <stat.icon className={`mx-auto h-7 w-7 mb-2 ${stat.color}`} />
                <p className="text-2xl sm:text-3xl font-black text-foreground">{stat.number}</p>
                <p className="mt-1 text-xs font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Category Filter Bar ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
                selectedCategory === cat
                  ? 'bg-primary text-white shadow-md'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat === 'All' ? 'All Stories' : `${cat}s`}
            </button>
          ))}
        </div>
      </section>

      {/* ── Featured Testimonials Grid ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-12">
        {featured.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-black uppercase tracking-wider text-foreground">Featured Reviews &amp; Case Studies</h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {featured.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col justify-between rounded-3xl border border-primary/25 bg-gradient-to-b from-primary/5 via-card to-card p-6 sm:p-8 shadow-lg hover:border-primary/50 transition-all hover:-translate-y-1"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {[...Array(t.rating)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                        {t.verifiedLabel}
                      </span>
                    </div>

                    <Quote className="h-8 w-8 text-primary/30" />
                    <p className="text-sm leading-relaxed font-medium text-foreground italic">&ldquo;{t.content}&rdquo;</p>

                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {t.achievements.map((ach) => (
                        <span key={ach} className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
                          {ach}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 border-t border-border/80 pt-4 flex items-center gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${t.avatarGradient} text-white font-black text-sm shadow-md`}>
                      {getInitials(t.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-black text-foreground truncate">{t.name}</h3>
                      <p className="text-xs text-primary font-bold truncate">{t.role}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{t.school}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Regular Testimonials Grid ────────────────────────────────────────── */}
        <div className="space-y-6">
          <h2 className="text-lg font-black uppercase tracking-wider text-foreground">More Verified Experiences</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {regular.map((t) => (
              <div
                key={t.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm hover:border-primary/40 transition-all hover:-translate-y-1"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {[...Array(t.rating)].map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground">{t.program}</span>
                  </div>

                  <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground italic">&ldquo;{t.content}&rdquo;</p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {t.achievements.map((ach) => (
                      <span key={ach} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                        {ach}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 border-t border-border pt-3 flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${t.avatarGradient} text-white font-black text-xs`}>
                    {getInitials(t.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-black text-foreground truncate">{t.name}</h4>
                    <p className="text-[11px] text-muted-foreground truncate">{t.role} · {t.school}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-8 sm:p-12 text-center shadow-xl">
          <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <h2 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            Ready to Start Your Child&apos;s STEM Journey?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Enroll your child in our 12-year progressive STEM pathway or partner your school with Rillcod Academy today.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/student-registration"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-xs sm:text-sm font-bold text-white shadow-lg hover:bg-primary/90 transition-all w-full sm:w-auto"
            >
              Start Student Registration <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/school-registration"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3.5 text-xs sm:text-sm font-bold text-foreground hover:bg-muted transition-all w-full sm:w-auto"
            >
              Partner School Registration ↗
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}