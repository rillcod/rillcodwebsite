'use client';

import { PortfolioProject } from '@/services/portfolio.service';
import { useState } from 'react';

interface ProjectCardProps {
  project: PortfolioProject;
  isOwner?: boolean;
}

export default function ProjectCard({ project, isOwner = false }: ProjectCardProps) {
  const [liked, setLiked] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
      {/* Project Image */}
      {project.image_url && (
        <img
          src={project.image_url}
          alt={project.title}
          className="w-full h-48 object-cover"
        />
      )}

      {/* Content */}
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{project.title}</h3>
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.description}</p>

        {/* Skills */}
        {project.skills.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {project.skills.map(skill => (
              <span
                key={skill}
                className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {/* Links */}
        <div className="flex gap-2 mb-4">
          {project.github_url && (
            <a
              href={project.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              GitHub
            </a>
          )}
          {project.live_url && (
            <a
              href={project.live_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Live Demo
            </a>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex gap-4 text-xs text-gray-500">
            <span>👀 {project.views}</span>
            <span>❤️ {project.likes}</span>
          </div>
          {!isOwner && (
            <button
              onClick={() => setLiked(!liked)}
              className={`px-3 py-1 rounded font-medium text-sm transition-colors ${
                liked
                  ? 'bg-red-100 text-red-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {liked ? '❤️' : '🤍'} Like
            </button>
          )}
        </div>

        {isOwner && (
          <button className="w-full mt-4 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Edit Project
          </button>
        )}
      </div>
    </div>
  );
}
