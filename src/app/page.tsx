import { Hero, About, NigerianSTEMShowcase, Contact, Footer } from '@/components/landing';

export default function Home() {
  return (
    <div className="bg-background min-h-screen">
      <Hero />
      <About />
      <NigerianSTEMShowcase />
      <Contact />
      <Footer />
    </div>
  );
}
