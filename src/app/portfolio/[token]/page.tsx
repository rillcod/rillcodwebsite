import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RocketLaunchIcon, LinkIcon, CalendarIcon } from '@/lib/icons';

interface Props { params: Promise<{ token: string }> }

const CATEGORIES: Record<string, string> = {
  Coding: 'bg-orange-500/20 text-orange-400',
  Robotics: 'bg-orange-500/20 text-orange-400',
  'Web Design': 'bg-blue-500/20 text-blue-400',
  'AI/ML': 'bg-emerald-500/20 text-emerald-400',
  IoT: 'bg-yellow-500/20 text-yellow-400',
  'Game Dev': 'bg-pink-500/20 text-pink-400',
  Art: 'bg-rose-500/20 text-rose-400',
};

export default async function PublicPortfolioPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from('portal_users')
    .select('id, full_name, school_name, portfolio_share_token, portfolio_share_token_expires_at')
    .eq('portfolio_share_token', token)
    .single();

  if (!student) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <RocketLaunchIcon className="w-16 h-16 text-orange-400/30 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white mb-2">Link Expired or Not Found</h1>
          <p className="text-gray-400 text-sm">This portfolio link has expired or does not exist. Ask the student to generate a new one.</p>
        </div>
      </div>
    );
  }

  const expiry = student.portfolio_share_token_expires_at 
    ? new Date(student.portfolio_share_token_expires_at) 
    : null;
  
  if (!expiry || expiry < new Date()) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <RocketLaunchIcon className="w-16 h-16 text-orange-400/30 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white mb-2">This Link Has Expired</h1>
          <p className="text-gray-400 text-sm">This portfolio share link expired on {expiry?.toLocaleDateString()}. Ask the student to generate a new share link.</p>
        </div>
      </div>
    );
  }

  const { data: projects } = await supabase
    .from('portfolio_projects')
    .select('*')
    .eq('user_id', student.id)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-10">
        {/* Header */}
        <div className="border-b border-white/10 pb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Rillcod Academy</span>
          </div>
          <h1 className="text-4xl font-black mb-1">{student.full_name}'s Portfolio</h1>
          {student.school_name && (
            <p className="text-gray-400 text-sm">{student.school_name}</p>
          )}
          <p className="text-xs text-gray-600 mt-3">
            Shared link · Valid until {expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Projects */}
        {!projects?.length ? (
          <div className="text-center py-16">
            <RocketLaunchIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No projects added yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p: any) => (
              <div key={p.id} className="bg-white/5 border border-white/10 rounded-none overflow-hidden hover:border-orange-500/30 transition-colors">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.title} className="w-full h-40 object-cover" />
                ) : (
                  <div className="h-40 bg-gradient-to-br from-orange-900/20 to-indigo-900/20 flex items-center justify-center">
                    <RocketLaunchIcon className="w-12 h-12 text-white/10" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORIES[p.category] ?? 'bg-gray-700 text-gray-300'}`}>
                      {p.category}
                    </span>
                    {p.is_featured && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">⭐ Featured</span>
                    )}
                  </div>
                  <h3 className="font-bold text-sm mb-1">{p.title}</h3>
                  {p.description && <p className="text-gray-400 text-xs line-clamp-2">{p.description}</p>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                    <span className="flex items-center gap-1 text-gray-500 text-[10px]">
                      <CalendarIcon className="w-3 h-3" />
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                    {p.project_url && (
                      <a href={p.project_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-orange-400 text-xs hover:text-orange-300 transition-colors">
                        <LinkIcon className="w-3.5 h-3.5" /> View
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-700 pt-6 border-t border-white/5">
          Powered by Rillcod Academy · rillcod.com
        </p>
      </div>
    </div>
  );
}
