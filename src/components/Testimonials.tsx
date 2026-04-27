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
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-primary/5 blur-[100px] rounded-xl pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center mb-24">
          <h2 className="text-3xl md:text-5xl font-black text-foreground mb-6 uppercase tracking-tight italic">
            Institutional <span className="text-primary">Trust.</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-medium italic border-l-2 border-primary pl-8 inline-block text-left">
            Join the network of premier Nigerian educational institutions that rely on Rillcod Technologies.
          </p>
          <div className="w-24 h-1 bg-primary mx-auto mt-12"></div>
        </div>

        <div className="max-w-5xl mx-auto bg-card border border-border rounded-xl shadow-2xl p-12 mb-24 relative border-t-8 border-t-brand-red-600">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] pointer-events-none"></div>
          <div className="flex justify-center mb-10">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-6 h-6 text-primary fill-current mx-1" />
            ))}
          </div>

          <p className="text-2xl md:text-3xl font-black text-foreground text-center italic mb-10 tracking-tight leading-snug uppercase">
            "Rillcod projects are engineered for <span className="text-brand-red-600">precision</span> and <span className="text-primary">excellence</span>, transforming how students perceive systemic problem solving."
          </p>

          <div className="flex items-center justify-center">
            <div className="w-16 h-16 bg-muted border border-border rounded-xl flex items-center justify-center text-primary mr-6">
              <School className="w-8 h-8" />
            </div>
            <div className="text-left">
              <h4 className="font-black text-foreground uppercase tracking-widest italic">Academic Director</h4>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Partner Institution | Benin City, Nigeria</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {schools.map((school, index) => (
            <div
              key={index}
              className="bg-card border border-border rounded-xl p-10 flex flex-col items-center hover:border-primary transition-all group"
            >
              <div className="w-20 h-20 bg-muted border border-border group-hover:border-primary rounded-xl flex items-center justify-center text-primary font-black text-2xl mb-6 transition-all">
                {school.logo}
              </div>
              <h3 className="text-center font-black text-foreground uppercase tracking-tighter italic text-sm">{school.name}</h3>
              <div className="mt-6 flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-primary fill-current opacity-40 group-hover:opacity-100 transition-opacity" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-24 text-center">
          <p className="text-lg text-muted-foreground font-medium italic mb-10">
            Bring Rillcod STEM programs to your institution.
          </p>
          <Link
            href="/school-registration"
            className="inline-flex items-center justify-center px-16 py-6 bg-primary text-white text-xs font-black uppercase tracking-[0.5em] rounded-xl shadow-xl shadow-primary/20 hover:bg-primary transition-all"
          >
            Partner With Us
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
