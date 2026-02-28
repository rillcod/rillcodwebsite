import React from 'react';
import { Code, Brain, Globe, Heart } from 'lucide-react';

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
    icon: Globe,
    title: 'Global Impact',
    desc: 'Our students win international competitions and build solutions for local community challenges.',
    accent: 'bg-green-600',
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
    <section id="about" className="py-24 bg-white border-t-4 border-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-16 gap-4">
          <div>
            <span className="inline-block text-xs font-black uppercase tracking-widest text-[#FF914D] border-2 border-[#FF914D] px-3 py-1 mb-3">
              About Us
            </span>
            <h2 className="text-4xl md:text-5xl font-extrabold text-black leading-tight">
              Empowering Nigerian Kids<br />Through STEM
            </h2>
          </div>
          <p className="text-gray-500 max-w-xs text-sm leading-relaxed">
            We&apos;re on a mission to transform Nigeria&apos;s future by equipping young minds with cutting-edge technology skills — inside their own schools.
          </p>
        </div>

        {/* Two-column: story + pillars */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-16">
          {/* Story */}
          <div className="border-2 border-black shadow-[6px_6px_0_0_rgba(0,0,0,1)] p-8 md:p-10 bg-[#fafafa]">
            <h3 className="text-2xl font-extrabold text-black mb-4 uppercase tracking-tight">Our Story</h3>
            <p className="text-gray-700 mb-6 leading-relaxed">
              Rillcod Academy is a subsidiary of Rillcod Technologies, founded by young Nigerian professionals passionate about bridging the digital divide. We believe every Nigerian child deserves access to world-class STEM education that prepares them for the future.
            </p>

            <h3 className="text-2xl font-extrabold text-black mb-4 uppercase tracking-tight">Our Mission</h3>
            <p className="text-gray-700 mb-6 leading-relaxed">
              To transform Nigeria&apos;s educational landscape — moving from traditional memory-based learning to innovative, creativity-stimulating education. We empower children with 21st-century skills through engaging, hands-on STEM experiences that make learning fun and relevant.
            </p>

            <h3 className="text-2xl font-extrabold text-black mb-4 uppercase tracking-tight">Our Vision</h3>
            <p className="text-gray-700 leading-relaxed">
              To create a generation of Nigerian tech leaders, innovators, and problem-solvers who will drive Africa&apos;s digital transformation and compete globally in the technology sector.
            </p>
          </div>

          {/* Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pillars.map(({ icon: Icon, title, desc, accent }) => (
              <div
                key={title}
                className="border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] p-6 bg-white hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all"
              >
                <div className={`w-10 h-10 flex items-center justify-center ${accent} mb-4`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h4 className="text-base font-extrabold text-black mb-2 uppercase tracking-tight">{title}</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Impact Stats Bar */}
        <div className="border-2 border-black shadow-[6px_6px_0_0_rgba(0,0,0,1)] bg-black text-white">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-white/20">
            {stats.map(({ value, label }) => (
              <div key={label} className="p-8 text-center">
                <p className="text-4xl md:text-5xl font-extrabold text-[#FF914D] mb-1">{value}</p>
                <p className="text-xs uppercase tracking-widest font-bold text-white/60">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;