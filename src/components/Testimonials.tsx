import React from 'react';
import { Star, School } from 'lucide-react';
import Link from 'next/link';

interface School {
  name: string;
  logo: string;
}

const Testimonials: React.FC = () => {
  const schools: School[] = [
    { name: "Deeper Life High School", logo: "DLHS" },
    { name: "Quincy Academy", logo: "QA" },
    { name: "Abundant Grace Preparatory", logo: "AGP" },
    { name: "Montessori School", logo: "MS" }
  ];

  return (
    <section className="py-24 bg-[#121212] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-purple-600/5 blur-[120px] rounded-none pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-none pointer-events-none" />
      
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center mb-24">
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6 uppercase tracking-tight italic">
            Institutional <span className="text-orange-500">Trust.</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto font-medium italic border-l-2 border-orange-500 pl-8 inline-block text-left">
            Join the network of premier Nigerian educational institutions that rely on Rillcod Technologies.
          </p>
          <div className="w-24 h-1 bg-orange-500 mx-auto mt-12"></div>
        </div>
        
        <div className="max-w-5xl mx-auto bg-[#1a1a1a] border border-white/10 rounded-none shadow-2xl p-12 mb-24 relative border-t-8 border-t-purple-500">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 blur-[100px] pointer-events-none"></div>
          <div className="flex justify-center mb-10">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-6 h-6 text-orange-500 fill-current mx-1" />
            ))}
          </div>
          
          <p className="text-2xl md:text-3xl font-black text-white text-center italic mb-10 tracking-tight leading-snug uppercase">
            "Rillcod projects are engineered for <span className="text-purple-500">precision</span> and <span className="text-orange-500">excellence</span>, transforming how students perceive systemic problem solving."
          </p>
          
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-none flex items-center justify-center text-orange-500 mr-6">
              <School className="w-8 h-8" />
            </div>
            <div className="text-left">
              <h4 className="font-black text-white uppercase tracking-widest italic">Academic Director</h4>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Partner Institution | Benin City, Nigeria</p>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {schools.map((school, index) => (
            <div 
              key={index}
              className="bg-[#1a1a1a] border border-white/10 rounded-none p-10 flex flex-col items-center hover:border-orange-500 transition-all group"
            >
              <div className="w-20 h-20 bg-[#121212] border border-white/5 group-hover:border-purple-500 rounded-none flex items-center justify-center text-purple-500 font-black text-2xl mb-6 transition-all">
                {school.logo}
              </div>
              <h3 className="text-center font-black text-white uppercase tracking-tighter italic text-sm">{school.name}</h3>
              <div className="mt-6 flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-orange-500 fill-current opacity-40 group-hover:opacity-100 transition-opacity" />
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-24 text-center">
          <p className="text-lg text-slate-400 font-medium italic mb-10">
            Deploy Rillcod STEM Protocol in your institution.
          </p>
          <Link
            href="/school-registration"
            className="inline-flex items-center justify-center px-16 py-6 bg-orange-500 text-white text-xs font-black uppercase tracking-[0.5em] rounded-none shadow-xl shadow-orange-500/20 hover:bg-orange-600 transition-all"
          >
            Initiate Partnership
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;