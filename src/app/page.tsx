import { Hero, About, NigerianSTEMShowcase, Contact, Footer } from '@/components/landing';

export default function Home() {
  return (
    <div className="bg-[#121212]">
      <Hero />
      <About />
      <NigerianSTEMShowcase />
      <Contact />
      <Footer />
    </div>
  );
}
