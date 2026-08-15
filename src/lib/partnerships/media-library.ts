/**
 * Categorized Media Asset Library for Partnerships & School Reports.
 *
 * Classifies classroom photography, student capstone videos, and event footage
 * into pedagogical disciplines and stages so facilitators and school leaders can
 * browse, filter and reference them effortlessly.
 */

export type MediaCategory =
  | 'all'
  | 'robotics'
  | 'coding'
  | 'classroom'
  | 'videos'
  | 'competitions';

export type MediaAsset = {
  src: string;
  name: string;
  title: string;
  category: Exclude<MediaCategory, 'all'>;
  mediaType: 'image' | 'video';
  tags: string[];
  stage?: 'primary' | 'secondary' | 'all';
  capstoneTopic?: string;
};

export const MEDIA_CATEGORIES: Array<{ key: MediaCategory; label: string; icon: string }> = [
  { key: 'all', label: 'All Media', icon: '📁' },
  { key: 'videos', label: 'Video Demos', icon: '🎥' },
  { key: 'robotics', label: 'Robotics & Hardware', icon: '🤖' },
  { key: 'coding', label: 'Coding & AI', icon: '💻' },
  { key: 'classroom', label: 'Classroom Action', icon: '🎓' },
  { key: 'competitions', label: 'Competitions & Expos', icon: '🏆' },
];

/**
 * Infer human-friendly title and category from filename or known asset paths.
 */
export function categorizeMediaAsset(src: string): MediaAsset {
  const filename = decodeURIComponent(src.split('/').pop() ?? src);
  const isVideo = /\.(mp4|webm|mov)$/i.test(filename);
  
  let category: Exclude<MediaCategory, 'all'> = 'classroom';
  let title = filename.replace(/\.(jpe?g|png|webp|mp4|webm|mov)$/i, '');
  const tags: string[] = [];

  if (isVideo) {
    category = 'videos';
    tags.push('Video Demo', 'Student Showcase');
    if (filename.includes('7.45.04')) {
      title = 'Voice-Controlled Obstacle Robot Demonstration';
      tags.push('Robotics', 'Basic 4–6');
    } else if (filename.includes('7.45.25')) {
      title = 'Smart Solar Irrigation Control Unit';
      tags.push('Hardware & IoT', 'JSS 1–3');
    } else if (filename.includes('7.46.27')) {
      title = 'Line Follower Autonomous Bot Testing';
      tags.push('Robotics', 'Basic 5');
    } else if (filename.includes('7.46.28')) {
      title = 'Interactive Python Game Presentation';
      tags.push('Coding', 'JSS 2');
    } else if (filename.includes('7.46.29')) {
      title = 'Web & AI Model Showcase';
      tags.push('AI & ML', 'SS 1–2');
    } else {
      title = 'Student Capstone Project Presentation';
    }
  } else {
    // Categorize Images
    if (filename.includes('7.29.56') || filename.includes('7.29.57')) {
      category = 'robotics';
      title = 'Hands-On Microcontroller Wiring & Circuitry';
      tags.push('Robotics', 'Physical Computing');
    } else if (filename.includes('7.29.58') || filename.includes('7.29.59')) {
      category = 'coding';
      title = 'Scratch & Algorithm Logic Development';
      tags.push('Coding', 'Primary');
    } else if (filename.includes('7.30.00') || filename.includes('7.30.01')) {
      category = 'classroom';
      title = 'Collaborative Pair Programming in Computer Lab';
      tags.push('Classroom', 'Teamwork');
    } else if (filename.includes('7.46.30') || filename.includes('7.46.31') || filename.includes('7.46.32')) {
      category = 'competitions';
      title = 'Inter-School STEM Exhibition & Award Ceremony';
      tags.push('Exhibition', 'Awards');
    } else {
      category = 'classroom';
      title = 'STEM Classroom Facilitation Session';
      tags.push('Learning');
    }
  }

  return {
    src,
    name: filename,
    title,
    category,
    mediaType: isVideo ? 'video' : 'image',
    tags,
  };
}
