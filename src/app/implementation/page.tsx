import { Calendar, CheckCircle, Users, BookOpen, Award } from "lucide-react";

const roadmap = [
  { phase: 1, title: "Showcase & Assessment (Week 1)", desc: "Live coding and robotics showcases, PTA presentations, technology review, partnership agreement." },
  { phase: 2, title: "Preparation (Week 2)", desc: "Equipment setup, staff training, marketing launch, quality assurance." },
  { phase: 3, title: "Program Launch (Second Week of Term)", desc: "Coordinated start, media coverage, student engagement, parent updates." },
  { phase: 4, title: "Continuous Improvement (Ongoing)", desc: "Monthly reviews, termly showcases, curriculum updates, partnership expansion." }
];

export default function Implementation() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center py-16 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Implementation Roadmap</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">See how RILLCOD Academy launches and sustains your AI-integrated technology program, step by step.</p>
        <div className="w-20 h-2 bg-blue-600 mx-auto rounded-full"></div>
      </div>
      <div className="relative border-l-4 border-blue-200 pl-8">
        {roadmap.map((step, idx) => (
          <div key={idx} className="mb-16 flex items-start">
            <div className="absolute -left-6 flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 text-white">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div className="ml-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{step.title}</h2>
              <p className="text-gray-600 mb-4">{step.desc}</p>
              {idx < roadmap.length - 1 && <div className="h-12 border-l-2 border-blue-200 ml-2"></div>}
            </div>
          </div>
        ))}
      </div>
      <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-white mt-16">
        <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
        <p className="text-xl mb-8 opacity-90">Contact us to schedule a showcase and begin your school's transformation.</p>
        <a href="/contact" className="inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors">Book a Showcase</a>
      </div>
    </div>
  );
} 