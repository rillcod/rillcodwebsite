'use client'

import Image from 'next/image'

const projects = [
  {
    title: 'Smart Home Automation',
    student: 'Chinedu A.',
    description: 'A project using IoT to control lights and fans remotely via a web app.',
    image: 'https://images.pexels.com/photos/4145198/pexels-photo-4145198.jpeg',
  },
  {
    title: 'Math Quiz Game',
    student: 'Aisha B.',
    description: 'A fun Scratch game that helps kids practice math skills.',
    image: 'https://images.pexels.com/photos/1181678/pexels-photo-1181678.jpeg',
  },
  {
    title: 'Weather App',
    student: 'Tunde O.',
    description: 'A Python app that fetches and displays real-time weather data.',
    image: 'https://images.pexels.com/photos/1181676/pexels-photo-1181676.jpeg',
  },
];

export default function ShowcasePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-center text-gray-800 mb-8">Student Projects Showcase</h1>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          Discover outstanding projects created by RILLCOD Academy students.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project, idx) => (
            <div key={idx} className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
              <div className="relative h-40 w-full">
                <Image
                  src={project.image}
                  alt={project.title}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-6 flex flex-col flex-grow">
                <h2 className="text-lg font-bold text-gray-800 mb-1">{project.title}</h2>
                <div className="text-sm text-[#FF914D] font-semibold mb-2">By {project.student}</div>
                <p className="text-gray-600 mb-4 flex-grow">{project.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 