import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const baseUrl = 'https://www.rillcod.com'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getPrograms() {
  try {
    const { data } = await db()
      .from('programs')
      .select('id, name, updated_at, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    return data ?? []
  } catch {
    return []
  }
}

async function getCourses() {
  try {
    const { data } = await db()
      .from('courses')
      .select('id, program_id, updated_at, is_published')
      .eq('is_published', true)
      .order('created_at', { ascending: true })
    return data ?? []
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Fetch programs and courses in parallel
  const [programs, courses] = await Promise.all([getPrograms(), getCourses()])

  // ── Static pages ────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    // Core
    { url: baseUrl,                           lastModified: now, changeFrequency: 'weekly',  priority: 1   },
    { url: `${baseUrl}/about`,                lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/programs`,             lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${baseUrl}/curriculum`,           lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/contact`,              lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/testimonials`,         lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${baseUrl}/faq`,                  lastModified: now, changeFrequency: 'monthly', priority: 0.6 },

    // Registration (high priority — these are your conversion pages)
    { url: `${baseUrl}/school-registration`,  lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/student-registration`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/online-registration`,  lastModified: now, changeFrequency: 'monthly', priority: 0.8 },

    // Information
    { url: `${baseUrl}/services`,             lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/partnership`,          lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/implementation`,       lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/student-journey`,      lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/portal`,               lastModified: now, changeFrequency: 'monthly', priority: 0.6 },

    // Showcase & Media
    { url: `${baseUrl}/showcase`,             lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${baseUrl}/student-projects`,     lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${baseUrl}/gallery`,              lastModified: now, changeFrequency: 'weekly',  priority: 0.6 },
    { url: `${baseUrl}/media`,                lastModified: now, changeFrequency: 'weekly',  priority: 0.6 },
    { url: `${baseUrl}/events`,               lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },

    // Company
    { url: `${baseUrl}/team`,                 lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/careers`,              lastModified: now, changeFrequency: 'weekly',  priority: 0.6 },

    // Auth
    { url: `${baseUrl}/login`,                lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/student/login`,        lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/signup`,               lastModified: now, changeFrequency: 'monthly', priority: 0.5 },

    // Legal
    { url: `${baseUrl}/privacy-policy`,       lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${baseUrl}/terms-of-service`,     lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ]

  // ── Program pages — real IDs from database ──────────────────
  // Groups courses by program so we use the most recently updated
  // course date as the program page's lastModified
  const coursesByProgram: Record<string, string[]> = {}
  for (const c of courses) {
    if (!c.program_id) continue
    if (!coursesByProgram[c.program_id]) coursesByProgram[c.program_id] = []
    if (c.updated_at) coursesByProgram[c.program_id].push(c.updated_at)
  }

  const programPages: MetadataRoute.Sitemap = programs.map(p => {
    const courseDates = coursesByProgram[p.id] ?? []
    const latestCourse = courseDates.sort().at(-1)
    const lastMod = latestCourse
      ? new Date(Math.max(new Date(p.updated_at ?? now).getTime(), new Date(latestCourse).getTime()))
      : p.updated_at ? new Date(p.updated_at) : now

    return {
      url: `${baseUrl}/programs/${p.id}`,
      lastModified: lastMod,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    }
  })

  return [...staticPages, ...programPages]
}
