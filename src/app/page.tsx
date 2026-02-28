import { Hero, About, NigerianSTEMShowcase, Contact, Footer } from '@/components/landing';

export default function Home() {
  return (
    <div className="bg-[#0a0a0f]">
      <Hero />
      <About />
      <NigerianSTEMShowcase />
      <Contact />
      <Footer />
    </div>
  );
}
