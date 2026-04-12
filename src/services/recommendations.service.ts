import { createClient } from '@/lib/supabase/server';

export interface Recommendation {
  id: string;
  type: 'lesson' | 'challenge' | 'course' | 'project';
  title: string;
  description: string;
  reason: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: number; // in minutes
  matchScore: number; // 0-100
}

export class RecommendationsService {
  async getRecommendations(userId: string, limit: number = 5): Promise<Recommendation[]> {
    const supabase = await createClient();

    // Get user's completed lessons and current level
    const [completedLessons, userStats] = await Promise.all([
      supabase
        .from('lesson_completions')
        .select('lesson_id')
        .eq('user_id', userId),
      supabase
        .from('user_learning_stats')
        .select('skill_level, current_streak, lessons_completed')
        .eq('user_id', userId)
        .single()
    ]);

    const completedIds = (completedLessons.data || []).map(l => l.lesson_id);
    const skillLevel = userStats.data?.skill_level || 'beginner';
    const lessonsCompleted = userStats.data?.lessons_completed || 0;

    // Get recommended lessons based on patterns
    const { data: nextLessons } = await supabase
      .from('lessons')
      .select('id, title, description, skill_level, duration_minutes, lesson_order')
      .not('id', 'in', `(${completedIds.join(',')})`)
      .eq('skill_level', this.getNextLevel(skillLevel))
      .order('lesson_order', { ascending: true })
      .limit(limit);

    // Transform to recommendations
    const recommendations: Recommendation[] = (nextLessons || []).map((lesson: any, index: number) => ({
      id: lesson.id,
      type: 'lesson',
      title: lesson.title,
      description: lesson.description,
      reason: index === 0 ? 'Next in your learning path' : 'Recommended for your level',
      difficulty: lesson.skill_level,
      estimatedTime: lesson.duration_minutes,
      matchScore: 85 - index * 5
    }));

    // Add challenge recommendations if streak is maintained
    if (userStats.data?.current_streak && userStats.data.current_streak > 3) {
      const { data: challenges } = await supabase
        .from('assignments')
        .select('id, title, description, assignment_type, duration_minutes')
        .eq('assignment_type', 'challenge')
        .eq('skill_level', skillLevel)
        .limit(2);

      const challengeRecommendations = (challenges || []).map((challenge: any) => ({
        id: challenge.id,
        type: 'challenge' as const,
        title: challenge.title,
        description: challenge.description,
        reason: 'Perfect for your current streak',
        difficulty: challenge.skill_level,
        estimatedTime: challenge.duration_minutes,
        matchScore: 80
      }));

      recommendations.push(...challengeRecommendations);
    }

    // Add trending/popular content
    if (lessonsCompleted > 10) {
      const { data: trending } = await supabase
        .from('lessons')
        .select('id, title, description, skill_level, duration_minutes')
        .eq('skill_level', skillLevel)
        .not('id', 'in', `(${completedIds.join(',')})`)
        .order('engagement_score', { ascending: false })
        .limit(1);

      if (trending && trending.length > 0) {
        recommendations.push({
          id: trending[0].id,
          type: 'lesson',
          title: trending[0].title,
          description: trending[0].description,
          reason: 'Trending with learners like you',
          difficulty: trending[0].skill_level,
          estimatedTime: trending[0].duration_minutes,
          matchScore: 75
        });
      }
    }

    return recommendations.slice(0, limit).sort((a, b) => b.matchScore - a.matchScore);
  }

  private getNextLevel(current: string): string {
    const levels = ['beginner', 'intermediate', 'advanced'];
    const currentIndex = levels.indexOf(current);
    if (currentIndex < levels.length - 1) {
      return levels[currentIndex + 1];
    }
    return current;
  }

  async getPopularContent(schoolId?: string, limit: number = 5) {
    const supabase = await createClient();

    let query = supabase
      .from('lessons')
      .select('id, title, description, skill_level, engagement_score')
      .order('engagement_score', { ascending: false })
      .limit(limit);

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    const { data } = await query;
    return data || [];
  }

  async getCourseRecommendations(userId: string): Promise<any[]> {
    const supabase = await createClient();

    const { data } = await supabase
      .from('courses')
      .select('id, title, description, skill_level, program_id')
      .order('created_at', { ascending: false })
      .limit(5);

    return data || [];
  }
}

export const recommendationsService = new RecommendationsService();
