import { Camera, Award, Users, Newspaper } from "lucide-react";

const news = [
  { date: "2024-05-01", title: "RILLCOD Academy Launches AI-Integrated Curriculum in 10 New Schools", summary: "RILLCOD Academy expands its reach, bringing AI and robotics education to thousands of students across Nigeria.", type: "Press Release" },
  { date: "2024-04-15", title: "Students Win National Robotics Competition", summary: "RILLCOD Academy students take first place at the National Robotics Challenge, showcasing their skills in AI and engineering.", type: "Success Story" },
  { date: "2024-03-20", title: "Tech Fair Attracts 2,000+ Parents and Students", summary: "Annual AI & Robotics Showcase draws record crowds and media attention.", type: "Event" }
];

export default function Media() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center py-16 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Media & News</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">See our latest press releases, event highlights, and student success stories.</p>
        <div className="w-20 h-2 bg-blue-600 mx-auto rounded-full"></div>
      </div>
      <div className="space-y-8 mb-16">
        {news.map((item, idx) => (
          <div key={idx} className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center gap-4 mb-2">
              {item.type === 'Press Release' && <Newspaper className="w-6 h-6 text-blue-600" />}
              {item.type === 'Success Story' && <Award className="w-6 h-6 text-green-600" />}
              {item.type === 'Event' && <Camera className="w-6 h-6 text-purple-600" />}
              <span className="text-sm text-gray-500">{new Date(item.date).toLocaleDateString()}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h2>
            <p className="text-gray-700 mb-2">{item.summary}</p>
            <span className="inline-block bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-medium">{item.type}</span>
          </div>
        ))}
      </div>
      <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-white">
        <h2 className="text-3xl font-bold mb-4">Want to Feature RILLCOD Academy?</h2>
        <p className="text-xl mb-8 opacity-90">Contact us for media inquiries, interviews, or to cover our next event.</p>
        <a href="/contact" className="inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors">Contact Media Team</a>
      </div>
    </div>
  );
} 