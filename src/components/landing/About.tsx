import React from 'react';
import { Code, Brain, Globe, Heart, TrendingUp } from 'lucide-react';

const pillars = [
  {
    icon: Code,
    title: 'Coding Excellence',
    desc: 'Teaching Nigerian kids Python, JavaScript, and Scratch — preparing them for the digital economy.',
    accent: 'bg-[#FF914D]',
  },
  {
    icon: Brain,
    title: 'Critical Thinking',
    desc: 'Developing problem-solving through robotics, AI, and hands-on STEM projects.',
    accent: 'bg-blue-600',
  },
  {
    icon: TrendingUp,
    title: 'Digital Entrepreneurship',
    desc: 'Equipping students with business thinking, digital skills, and the confidence to build products and start ventures.',
    accent: 'bg-green-600',
  },
  {
    icon: Globe,
    title: 'Global Impact',
    desc: 'Our students win international competitions and build solutions for local community challenges.',
    accent: 'bg-teal-600',
  },
  {
    icon: Heart,
    title: 'Passionate Team',
    desc: 'Nigerian educators and tech professionals dedicated to nurturing the next generation of innovators.',
    accent: 'bg-purple-600',
  },
];

const stats = [
  { value: '500+', label: 'Students Trained' },
  { value: '25+', label: 'Partner Schools' },
  { value: '15+', label: 'STEM Programs' },
  { value: '95%', label: 'Success Rate' },
];

const About: React.FC = () => {
  return (
    <section id="about" className="py-24 bg-[#0a0a0f] relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-64 h-64 bg-violet-600/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-16 gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF914D]/10 border border-[#FF914D]/20 text-[#FF914D] text-[10px] font-black uppercase tracking-widest mb-4">
              <Code className="w-3 h-3" />
              About Us
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight">
              Empowering Nigeria&apos;s<br />Future Through STEM
            </h2>
          </div>
          <p className="text-white/50 max-w-sm text-sm leading-relaxed font-medium">
            From Basic 1 through SS3 — we equip every Nigerian child with cutting-edge technology, coding, and digital entrepreneurship skills, directly inside their schools.
          </p>
        </div>

        {/* Two-column: story + pillars */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {/* Story Card */}
          <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-[2.5rem] p-10 md:p-14 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Brain className="w-24 h-24 text-white" />
            </div>
            <div className="space-y-10 relative z-10">
              <div>
                <h3 className="text-[10px] font-black text-[#FF914D] mb-4 uppercase tracking-[0.2em]">Our Story</h3>
                <p className="text-white/60 leading-relaxed text-sm font-medium">
                  Rillcod Academy is a subsidiary of Rillcod Technologies, founded by young Nigerian professionals passionate about bridging the digital divide. We serve students from Basic 1 through SS3 — primary and secondary — offering coding, robotics, AI, and digital entrepreneurship programmes delivered directly inside partner schools by expert tutors.
                </p>
              </div>

              <div>
                <h3 className="text-[10px] font-black text-blue-400 mb-4 uppercase tracking-[0.2em]">Our Mission</h3>
                <p className="text-white/60 leading-relaxed text-sm font-medium">
                  To transform Nigeria&apos;s educational landscape — moving from traditional memory-based learning to innovative, creativity-stimulating education. We empower children with 21st-century skills through engaging, hands-on STEM experiences.
                </p>
              </div>

              <div>
                <h3 className="text-[10px] font-black text-emerald-400 mb-4 uppercase tracking-[0.2em]">Our Vision</h3>
                <p className="text-white/60 leading-relaxed text-sm font-medium">
                  To create a generation of Nigerian tech leaders, innovators, and problem-solvers who will drive Africa&apos;s digital transformation and lead the global technology sector.
                </p>
              </div>
            </div>
          </div>

          {/* Pillars Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 content-start">
            {pillars.map(({ icon: Icon, title, desc, accent }) => (
              <div
                key={title}
                className="group bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-3xl p-8 hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300 shadow-xl"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${accent} bg-opacity-20 mb-6 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 ${accent.replace('bg-', 'text-')}`} />
                </div>
                <h4 className="text-lg font-bold text-white mb-3 tracking-tight">{title}</h4>
                <p className="text-sm text-white/40 leading-relaxed font-medium">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Impact Stats Bar */}
        <div className="bg-white/[0.02] border-y border-white/5 backdrop-blur-sm -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5">
            {stats.map(({ value, label }) => (
              <div key={label} className="p-12 text-center group">
                <p className="text-4xl md:text-5xl font-black text-[#FF914D] mb-2 tracking-tighter group-hover:scale-110 transition-transform cursor-default">{value}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;