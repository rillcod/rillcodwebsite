"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  ArrowRight,
  Tag,
  ExternalLink,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { brandContact } from "@/config/brand";

type EventItem = {
  id: number;
  title: string;
  description: string;
  date: string;
  dateLabel: string;
  time: string;
  location: string;
  type: "Competition" | "Workshop" | "Bootcamp" | "Showcase" | "Open House";
  category:
    | "AI & Robotics"
    | "Web Development"
    | "Python & Data"
    | "IoT & Hardware"
    | "School Partners";
  capacity: string;
  fee: string;
  featured: boolean;
  isPast: boolean;
  image: string;
  ctaHref: string;
  ctaLabel: string;
  highlights: string[];
};

const events: EventItem[] = [
  {
    id: 1,
    title: "Edo State Schools Robotics & AI Exhibition 2026",
    description:
      "End-of-term inter-school robotics, autonomous vehicle, and Python AI demonstration hosted with partner school principals, STEM facilitators, and parents in Benin City.",
    date: "2026-12-12",
    dateLabel: "December 12, 2026",
    time: "10:00 AM – 3:00 PM WAT",
    location: `Rillcod STEM Hub, ${brandContact.addressShort}`,
    type: "Showcase",
    category: "AI & Robotics",
    capacity: "Open to partner schools & families",
    fee: "Free Admission",
    featured: true,
    isPast: false,
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.27 PM.jpeg",
    ctaHref: "/contact?subject=Event%20RSVP%3A%20Robotics%20%26%20AI%20Exhibition%202026",
    ctaLabel: "Reserve School / Family Slot",
    highlights: [
      "Live obstacle-avoidance robotics & sensor builds",
      "Learner certificates & term showcase awards",
      "Direct briefing for school proprietors & ICT coordinators",
      "Hands-on parent walkthrough of the learning portal",
    ],
  },
  {
    id: 2,
    title: "Harmattan Coding & Robotics Holiday Bootcamp",
    description:
      "Two-week intensive holiday track for Primary (Ages 7–11) and Secondary (Ages 12–17) students covering Scratch game mechanics, Python fundamentals, web design, and Arduino electronics.",
    date: "2026-12-21",
    dateLabel: "December 21, 2026 – January 2, 2027",
    time: "9:30 AM – 2:00 PM WAT",
    location: "In-Person (GRA Benin City) & Live Online Track",
    type: "Bootcamp",
    category: "Python & Data",
    capacity: "40 seats per cohort",
    fee: "Term / Bootcamp Enrolment",
    featured: false,
    isPast: false,
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM.jpeg",
    ctaHref: "/student-registration",
    ctaLabel: "Enrol a Student",
    highlights: [
      "Small-group facilitator coaching",
      "Working capstone built in every cohort",
      "Both onsite lab and live online options",
    ],
  },
  {
    id: 3,
    title: "School Proprietors & Principals STEM Lab Open House",
    description:
      "Live demonstration of Rillcod Academy's turnkey school STEM partnership: on-site facilitators, structured term curriculum, hardware kits, and automated termly report books.",
    date: "2027-01-16",
    dateLabel: "January 16, 2027",
    time: "11:00 AM – 2:30 PM WAT",
    location: `Rillcod STEM Innovation Centre, Benin City`,
    type: "Open House",
    category: "School Partners",
    capacity: "Partner & prospective school leadership",
    fee: "Free (By Invitation / RSVP)",
    featured: false,
    isPast: false,
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM (1).jpeg",
    ctaHref: "/school-registration",
    ctaLabel: "Book School Briefing",
    highlights: [
      "Full 12-year STEM curriculum inspection",
      "Live portal, attendance & CBT evaluation walkthrough",
      "Partnership MoU & timetable integration review",
    ],
  },
  {
    id: 4,
    title: "Full-Stack Web & JavaScript Term Build Sprint",
    description:
      "Saturday practical build clinic for secondary learners turning HTML, CSS, Tailwind, and JavaScript exercises into portfolio-ready interactive web applications.",
    date: "2027-02-06",
    dateLabel: "February 6, 2027",
    time: "10:00 AM – 3:00 PM WAT",
    location: "Rillcod Benin Lab & Online",
    type: "Workshop",
    category: "Web Development",
    capacity: "35 learners per track",
    fee: "Included for active students",
    featured: false,
    isPast: false,
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.03 PM (1).jpeg",
    ctaHref: "/programs",
    ctaLabel: "Explore Web Track",
    highlights: [
      "Code reviews with engineering mentors",
      "Responsive layout & API data fetching drills",
      "Portfolio hosting walkthrough",
    ],
  },
  {
    id: 5,
    title: "Arduino & Smart Sensor Engineering Challenge",
    description:
      "Practical competition where student teams wire ultrasonic sensors, microcontrollers, and servo actuators to solve everyday safety and automation problems.",
    date: "2027-03-20",
    dateLabel: "March 20, 2027",
    time: "9:30 AM – 4:00 PM WAT",
    location: `Rillcod Hardware & IoT Lab, Benin City`,
    type: "Competition",
    category: "IoT & Hardware",
    capacity: "Partner school teams",
    fee: "Partner School Entry",
    featured: false,
    isPast: false,
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM.jpeg",
    ctaHref: "/contact?subject=Arduino%20Challenge%20Registration",
    ctaLabel: "Register School Team",
    highlights: [
      "Real breadboards, sensors & C++/Arduino logic",
      "Team debugging & engineering notebook review",
      "Inter-school recognition & trophies",
    ],
  },
  {
    id: 6,
    title: "2026 Summer STEM Expo & Capstone Awards",
    description:
      "Multi-school showcase celebrating primary and secondary learners across Edo State presenting Scratch games, smart home prototypes, and Python utilities.",
    date: "2026-08-14",
    dateLabel: "August 14, 2026",
    time: "10:00 AM – 4:00 PM WAT",
    location: "Benin City, Edo State",
    type: "Showcase",
    category: "AI & Robotics",
    capacity: "Partner schools, parents & guests",
    fee: "Completed",
    featured: false,
    isPast: true,
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.29 PM (1).jpeg",
    ctaHref: "/gallery",
    ctaLabel: "View Event Photos",
    highlights: [
      "Robotics vehicle & Python software demos",
      "Partner school recognition awards",
      "Full photo & video highlights in gallery",
    ],
  },
  {
    id: 7,
    title: "Junior Innovators Coding & Hardware Lab Day",
    description:
      "Cohort showcase uniting primary school coders and electronics builders for live classroom presentations and peer testing.",
    date: "2026-08-14",
    dateLabel: "August 2026",
    time: "11:00 AM – 3:00 PM WAT",
    location: "Rillcod Partner School Network",
    type: "Workshop",
    category: "IoT & Hardware",
    capacity: "Enrolled primary & JSS scholars",
    fee: "Completed",
    featured: false,
    isPast: true,
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.56 PM.jpeg",
    ctaHref: "/gallery",
    ctaLabel: "View Event Photos",
    highlights: [
      "Scratch storytelling & logic games",
      "Supervised circuit & LED lab",
    ],
  },
];

const eventTypes = ["All", "Showcase", "Bootcamp", "Workshop", "Competition", "Open House"];
const categories = [
  "All",
  "AI & Robotics",
  "Web Development",
  "Python & Data",
  "IoT & Hardware",
  "School Partners",
];

export default function Events() {
  const [selectedType, setSelectedType] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [subscriberEmail, setSubscriberEmail] = useState("");
  const [subscribeState, setSubscribeState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [subscribeMessage, setSubscribeMessage] = useState("");

  const filteredEvents = events.filter((event) => {
    const typeMatch = selectedType === "All" || event.type === selectedType;
    const categoryMatch = selectedCategory === "All" || event.category === selectedCategory;
    return typeMatch && categoryMatch;
  });

  const upcomingEvents = filteredEvents.filter((event) => !event.isPast);
  const pastEvents = filteredEvents.filter((event) => event.isPast);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscriberEmail.trim()) return;
    setSubscribeState("loading");
    setSubscribeMessage("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Events Updates Subscriber",
          email: subscriberEmail.trim(),
          subject: "Event Updates Subscription",
          message: "Please add me to Rillcod Academy event, bootcamp, and STEM exhibition notifications.",
        }),
      });
      const payload = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        setSubscribeState("error");
        setSubscribeMessage(payload.error || "Could not subscribe right now. Please try again.");
        return;
      }
      setSubscribeState("success");
      setSubscribeMessage("Subscribed! We will notify you before upcoming workshops and exhibitions.");
      setSubscriberEmail("");
    } catch {
      setSubscribeState("error");
      setSubscribeMessage("Network error. Please try again.");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      {/* Hero Section */}
      <div className="text-center border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 rounded-2xl px-5 py-12 sm:px-8 sm:py-16 mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" /> Benin City &amp; Online Academic Calendar
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          Events &amp; STEM Activities
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
          Join our upcoming robotics exhibitions, holiday coding bootcamps, inter-school challenges,
          and school leadership open houses across Edo State and online.
        </p>
        <div className="w-20 h-2 bg-primary mx-auto rounded-full" />
      </div>

      {/* Featured Event */}
      {events
        .filter((e) => e.featured)
        .map((event) => (
          <div key={event.id} className="mb-16">
            <h2 className="text-2xl font-bold text-foreground mb-6">Featured Event</h2>
            <div className="bg-card rounded-2xl shadow-sm overflow-hidden border border-border">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="relative min-h-[260px] lg:min-h-full">
                  <Image
                    src={event.image}
                    alt={event.title}
                    fill
                    unoptimized
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-8">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="bg-primary text-white px-3 py-1 rounded-full text-xs font-semibold">
                      {event.type}
                    </span>
                    <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">
                      {event.category}
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-4">{event.title}</h3>
                  <p className="text-muted-foreground mb-6">{event.description}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-muted-foreground text-sm">{event.dateLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-muted-foreground text-sm">{event.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-muted-foreground text-sm">{event.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-muted-foreground text-sm">{event.capacity}</span>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="font-semibold text-foreground mb-3">Highlights:</h4>
                    <ul className="space-y-1.5">
                      {event.highlights.map((highlight, index) => (
                        <li key={index} className="text-muted-foreground text-sm">
                          • {highlight}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="text-lg font-bold text-primary">{event.fee}</div>
                    <Link
                      href={event.ctaHref}
                      className="inline-flex items-center px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {event.ctaLabel}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

      {/* Filters */}
      <div className="mb-12">
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <div>
            <label htmlFor="event-type-filter" className="block text-sm font-medium text-foreground mb-2">
              Event Type:
            </label>
            <select
              id="event-type-filter"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="min-h-11 rounded-lg border border-input bg-background px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="event-category-filter" className="block text-sm font-medium text-foreground mb-2">
              Category:
            </label>
            <select
              id="event-category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="min-h-11 rounded-lg border border-input bg-background px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="mb-16">
        <h2 className="text-3xl font-bold text-foreground mb-8">Upcoming Events</h2>
        {upcomingEvents.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <p className="text-muted-foreground mb-4">
              No upcoming events match your current filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedType("All");
                setSelectedCategory("All");
              }}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {upcomingEvents.map((event) => (
              <div
                key={event.id}
                className="bg-card rounded-2xl shadow-sm overflow-hidden border border-border hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="relative h-48 w-full">
                  <Image
                    src={event.image}
                    alt={event.title}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                  <span className="absolute top-3 left-3 bg-primary text-white px-3 py-1 rounded-full text-xs font-semibold">
                    {event.type}
                  </span>
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <span className="bg-muted text-muted-foreground px-2 py-1 rounded text-xs">
                      {event.category}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3 line-clamp-2">{event.title}</h3>
                  <p className="text-muted-foreground text-sm mb-4 line-clamp-3 flex-1">
                    {event.description}
                  </p>

                  <div className="space-y-2 mb-5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>{event.dateLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>{event.time}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span className="line-clamp-1">{event.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4 shrink-0" />
                      <span>{event.capacity}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="text-sm font-bold text-primary">{event.fee}</div>
                    <Link
                      href={event.ctaHref}
                      className="inline-flex items-center px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {event.ctaLabel}
                      <ArrowRight className="w-3 h-3 ml-1.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Events */}
      {pastEvents.length > 0 && (
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8">Past Highlights</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {pastEvents.map((event) => (
              <div
                key={event.id}
                className="bg-muted/40 rounded-2xl shadow-sm overflow-hidden border border-border flex flex-col"
              >
                <div className="relative h-48 w-full">
                  <Image
                    src={event.image}
                    alt={event.title}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                  <span className="absolute top-3 left-3 bg-background/90 text-foreground px-3 py-1 rounded-full text-xs font-semibold">
                    Highlight
                  </span>
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <span className="bg-muted text-muted-foreground px-2 py-1 rounded text-xs">
                      {event.category}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">{event.title}</h3>
                  <p className="text-muted-foreground text-sm mb-4 flex-1">{event.description}</p>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>{event.dateLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      <span>{event.location}</span>
                    </div>
                  </div>

                  <Link
                    href={event.ctaHref}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors"
                  >
                    {event.ctaLabel}
                    <ExternalLink className="w-3 h-3 ml-1.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Call to Action / Subscribe */}
      <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 sm:p-12 text-white">
        <h2 className="text-3xl font-bold mb-4">Stay Updated with Our Events</h2>
        <p className="text-lg sm:text-xl mb-8 opacity-90 max-w-2xl mx-auto">
          Leave your email to get notified about upcoming coding bootcamps, inter-school robotics challenges, and STEM exhibitions.
        </p>
        <form onSubmit={handleSubscribe} className="max-w-md mx-auto">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              required
              value={subscriberEmail}
              onChange={(e) => setSubscriberEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full flex-1 bg-white px-4 py-3 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
            />
            <button
              type="submit"
              disabled={subscribeState === "loading"}
              className="px-6 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60"
            >
              {subscribeState === "loading" ? "Saving..." : "Subscribe"}
            </button>
          </div>
          {subscribeState === "success" && (
            <p className="mt-3 text-sm font-medium text-emerald-100 flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> {subscribeMessage}
            </p>
          )}
          {subscribeState === "error" && (
            <p className="mt-3 text-sm font-medium text-rose-100">{subscribeMessage}</p>
          )}
        </form>
      </div>
    </div>
  );
}
