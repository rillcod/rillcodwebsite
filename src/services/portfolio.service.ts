import { createClient } from '@/lib/supabase/server';

export interface PortfolioProject {
  id: string;
  title: string;
  description: string;
  image_url?: string;
  github_url?: string;
  live_url?: string;
  skills: string[];
  created_at: string;
  updated_at: string;
  is_published: boolean;
  views: number;
  likes: number;
}

export interface StudentPortfolio {
  id: string;
  student_name: string;
  bio: string;
  avatar_url?: string;
  skills: string[];
  projects: PortfolioProject[];
  social_links: Record<string, string>;
  shareableUrl: string;
}

export class PortfolioService {
  async getStudentPortfolio(userId: string): Promise<StudentPortfolio> {
    const supabase = await createClient();

    // Get user profile
    const { data: userData } = await supabase
      .from('portal_users')
      .select('id, full_name, profile_image_url, bio')
      .eq('id', userId)
      .single();

    // Get published projects
    const { data: projects } = await supabase
      .from('portfolio_projects')
      .select('*')
      .eq('user_id', userId)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    // Get skills from lessons
    const { data: skills } = await supabase
      .from('lesson_completions')
      .select('lessons(skill_category)')
      .eq('user_id', userId)
      .distinct();

    const uniqueSkills = Array.from(
      new Set(
        (skills || [])
          .map((s: any) => s.lessons?.skill_category)
          .filter(Boolean)
      )
    ) as string[];

    return {
      id: userId,
      student_name: userData?.full_name || 'Student',
      bio: userData?.bio || 'Passionate learner',
      avatar_url: userData?.profile_image_url,
      skills: uniqueSkills,
      projects: projects || [],
      social_links: {},
      shareableUrl: `portfolio/${userId}`
    };
  }

  async getProjectDetails(projectId: string): Promise<PortfolioProject | null> {
    const supabase = await createClient();

    const { data } = await supabase
      .from('portfolio_projects')
      .select('*')
      .eq('id', projectId)
      .eq('is_published', true)
      .single();

    return data || null;
  }

  async updateProjectVisibility(projectId: string, isPublished: boolean): Promise<void> {
    const supabase = await createClient();

    await supabase
      .from('portfolio_projects')
      .update({ is_published: isPublished })
      .eq('id', projectId);
  }

  async likeProject(projectId: string): Promise<void> {
    const supabase = await createClient();

    const { data: project } = await supabase
      .from('portfolio_projects')
      .select('likes')
      .eq('id', projectId)
      .single();

    if (project) {
      await supabase
        .from('portfolio_projects')
        .update({ likes: (project.likes || 0) + 1 })
        .eq('id', projectId);
    }
  }

  async updatePortfolioSocialLinks(
    userId: string,
    socialLinks: Record<string, string>
  ): Promise<void> {
    const supabase = await createClient();

    await supabase
      .from('portal_users')
      .update({ social_links: socialLinks })
      .eq('id', userId);
  }

  async getPublicPortfolio(userId: string): Promise<StudentPortfolio | null> {
    const supabase = await createClient();

    const { data: userData } = await supabase
      .from('portal_users')
      .select('id, full_name, profile_image_url, bio')
      .eq('id', userId)
      .single();

    if (!userData) return null;

    const { data: projects } = await supabase
      .from('portfolio_projects')
      .select('*')
      .eq('user_id', userId)
      .eq('is_published', true);

    const { data: skills } = await supabase
      .from('lesson_completions')
      .select('lessons(skill_category)')
      .eq('user_id', userId)
      .distinct();

    const uniqueSkills = Array.from(
      new Set(
        (skills || [])
          .map((s: any) => s.lessons?.skill_category)
          .filter(Boolean)
      )
    ) as string[];

    return {
      id: userId,
      student_name: userData.full_name || 'Student',
      bio: userData.bio || 'Passionate learner',
      avatar_url: userData.profile_image_url,
      skills: uniqueSkills,
      projects: projects || [],
      social_links: {},
      shareableUrl: `portfolio/${userId}`
    };
  }
}

export const portfolioService = new PortfolioService();
