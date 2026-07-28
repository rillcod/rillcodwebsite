import Link from 'next/link';
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ComputerDesktopIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrophyIcon,
  UserGroupIcon,
} from '@/lib/icons';

const FLOW = [
  ['1', 'Academic direction', 'The Academic Office approves what should be taught.'],
  ['2', 'Learning pathway', 'Regular, Online or Special keeps its own academic route.'],
  ['3', 'Teaching plan', 'The teacher receives the correct official curriculum edition.'],
  ['4', 'Lesson delivery', 'Teaching, attendance and curriculum coverage are recorded.'],
  ['5', 'Learning evidence', 'Assignments, CBT, practical work and manual scores are collected.'],
  ['6', 'One grading engine', 'Weights are applied inside the correct pathway and period.'],
  ['7', 'Reports', 'Draft and published reports remain protected and traceable.'],
  ['8', 'Progress and certificate', 'Verified results support advancement and certificate eligibility.'],
];

const PATHWAYS = [
  {
    name: 'Regular School',
    icon: AcademicCapIcon,
    summary: 'Partner schools such as St Peter.',
    curriculum: 'Central direction is assigned automatically for future teaching plans.',
    calendar: 'Academic session, First/Second/Third Term, and the real school or class entry week.',
    delivery: 'Mainly in-school teaching.',
    result: 'School report and regular progression.',
  },
  {
    name: 'Online School',
    icon: ComputerDesktopIcon,
    summary: 'A termly virtual school with its own academic route.',
    curriculum: 'Own curriculum edition. A central edition may start an empty path but cannot later overwrite its chosen edition.',
    calendar: 'Own academic session and terms.',
    delivery: 'Virtual teaching and online attendance.',
    result: 'Online pathway report, progression and certificate.',
  },
  {
    name: 'Special Programme',
    icon: SparklesIcon,
    summary: 'Bootcamp, Holiday Programme or Short Course.',
    curriculum: 'Each programme owns its curriculum edition.',
    calendar: 'Its own fixed start date, end date and learning periods.',
    delivery: 'Onsite, virtual or hybrid.',
    result: 'Standalone programme result and certificate.',
  },
];

const AUTOMATIC = [
  'Assign the central direction to Regular Schools.',
  'Give an empty Online or Special path a starting curriculum edition.',
  'Preserve an existing independent Online or Special curriculum edition.',
  'Attach the correct curriculum edition to a new teaching plan.',
  'Keep assessment, grading and reports inside the correct pathway and period.',
  'Calculate weighted results and check certificate eligibility.',
];

const HUMAN = [
  'Approve the official curriculum source and academic meaning.',
  'Choose whether to create an Online or Special pathway.',
  'Confirm real dates, terms and entry weeks.',
  'Adapt activities and teach the lesson.',
  'Review exceptional academic conflicts.',
  'Decide when a draft report is ready to publish.',
];

export default function AcademicOfficeGuidePage() {
  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-violet-500/5 p-6 sm:p-8">
        <Link href="/dashboard/academic-spine" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
          <ArrowLeftIcon className="h-4 w-4" /> Back to Academic Office
        </Link>
        <div className="mt-6 max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Simple user guide</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">How the Academic Office works</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            The Academic Office is the central control room for curriculum, teaching, attendance, assessment, grading, reports, learner progression and certificates. It keeps everything connected while showing each person only the work they need.
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Academic Office purpose">
        {[
          [BookOpenIcon, 'Direction', 'Decide what learners should learn and protect the official curriculum edition.'],
          [UserGroupIcon, 'Teaching', 'Turn the official direction into practical teaching plans and lessons.'],
          [ChartBarIcon, 'Evidence and results', 'Join attendance, assignments, CBT and manual scores in one grading system.'],
          [ShieldCheckIcon, 'Protection', 'Keep pathways, active plans, manual records and published reports safe.'],
        ].map(([Icon, title, text]) => {
          const FeatureIcon = Icon as typeof BookOpenIcon;
          return <article key={String(title)} className="rounded-2xl border border-border bg-card p-5"><FeatureIcon className="h-6 w-6 text-primary" /><h2 className="mt-3 font-black text-foreground">{String(title)}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{String(text)}</p></article>;
        })}
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 sm:p-7">
        <h2 className="text-2xl font-black text-foreground">The complete academic journey</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Every academic record should be traceable through this simple path.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map(([number, title, detail], index) => (
            <div key={number} className="relative rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">{number}</span>{index < FLOW.length - 1 && <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />}</div>
              <h3 className="mt-3 text-sm font-black text-foreground">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-black text-foreground">Three separate learning pathways</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">All three use one academic engine, but they do not share calendars, teaching records, results or certificate context. This prevents information from bleeding from one pathway into another.</p>
        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          {PATHWAYS.map((pathway) => {
            const Icon = pathway.icon;
            return <article key={pathway.name} className="rounded-3xl border border-border bg-card p-6"><Icon className="h-7 w-7 text-primary" /><h3 className="mt-3 text-xl font-black text-foreground">{pathway.name}</h3><p className="mt-1 text-sm text-muted-foreground">{pathway.summary}</p><dl className="mt-5 space-y-4 text-sm"><div><dt className="font-black text-foreground">Curriculum</dt><dd className="mt-1 leading-6 text-muted-foreground">{pathway.curriculum}</dd></div><div><dt className="font-black text-foreground">Calendar</dt><dd className="mt-1 leading-6 text-muted-foreground">{pathway.calendar}</dd></div><div><dt className="font-black text-foreground">Delivery</dt><dd className="mt-1 leading-6 text-muted-foreground">{pathway.delivery}</dd></div><div><dt className="font-black text-foreground">Outcome</dt><dd className="mt-1 leading-6 text-muted-foreground">{pathway.result}</dd></div></dl></article>;
          })}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-black text-foreground">What the administrator does</h2>
          <ol className="mt-4 space-y-3">
            {['Create or choose the central curriculum.', 'Run the plain-language academic quality review.', 'Protect and publish the official direction.', 'Confirm pathway, school timing and real entry point.', 'Monitor teaching, evidence, reports and exceptions.'].map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-muted-foreground"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-black text-primary">{index + 1}</span><span>{step}</span></li>)}
          </ol>
        </article>
        <article className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-black text-foreground">What the teacher does</h2>
          <ol className="mt-4 space-y-3">
            {['Open the assigned class and course.', 'Create a draft teaching plan.', 'Receive the correct official curriculum edition automatically.', 'Adapt activities, examples, resources and delivery notes.', 'Teach, record attendance, assess learners and publish when ready.'].map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-muted-foreground"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-black text-primary">{index + 1}</span><span>{step}</span></li>)}
          </ol>
        </article>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6 sm:p-7">
        <h2 className="text-2xl font-black text-foreground">How curriculum becomes a real lesson</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Curriculum direction', 'Learners should understand loops.'],
            ['Teaching plan', 'Use a dance repetition activity to explain loops.'],
            ['Lesson delivery', 'The teacher completes the activity and records attendance.'],
            ['Evidence', 'The learner completes a loop task or CBT check.'],
          ].map(([title, detail], index) => <div key={title} className="rounded-2xl bg-muted/40 p-4"><p className="text-xs font-black text-primary">STEP {index + 1}</p><h3 className="mt-2 font-black text-foreground">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p></div>)}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-6"><h2 className="flex items-center gap-2 text-xl font-black text-foreground"><CheckCircleIcon className="h-6 w-6 text-emerald-600" /> What happens automatically</h2><ul className="mt-4 space-y-3">{AUTOMATIC.map((item) => <li key={item} className="flex gap-2 text-sm leading-6 text-muted-foreground"><CheckCircleIcon className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />{item}</li>)}</ul></article>
        <article className="rounded-3xl border border-primary/25 bg-primary/5 p-6"><h2 className="flex items-center gap-2 text-xl font-black text-foreground"><UserGroupIcon className="h-6 w-6 text-primary" /> What remains a human decision</h2><ul className="mt-4 space-y-3">{HUMAN.map((item) => <li key={item} className="flex gap-2 text-sm leading-6 text-muted-foreground"><ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-primary" />{item}</li>)}</ul></article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-3xl border border-border bg-card p-6"><ClipboardDocumentCheckIcon className="h-7 w-7 text-primary" /><h2 className="mt-3 text-xl font-black text-foreground">Grading and manual results</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Assignments, CBT, practical work, attendance and manual scores can feed one grading engine. Manual entries remain valid. Draft reports remain drafts, and published reports stay protected.</p></article>
        <article className="rounded-3xl border border-border bg-card p-6"><ShieldCheckIcon className="h-7 w-7 text-primary" /><h2 className="mt-3 text-xl font-black text-foreground">The quiet quality engine</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Quality checks run behind the Academic Office. Users receive clear messages about what needs attention without seeing technical QA codes or database language.</p></article>
        <article className="rounded-3xl border border-border bg-card p-6"><TrophyIcon className="h-7 w-7 text-primary" /><h2 className="mt-3 text-xl font-black text-foreground">Certificates</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Every pathway can award certificates. Eligibility can use verified results, completion, attendance, pass marks and the pathway's own certificate rules.</p></article>
      </section>

      <section className="rounded-3xl border border-amber-500/25 bg-amber-500/5 p-6">
        <div className="flex gap-3"><CalendarDaysIcon className="mt-1 h-6 w-6 shrink-0 text-amber-700 dark:text-amber-300" /><div><h2 className="text-xl font-black text-foreground">Real timing example</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">A school can begin with <strong className="text-foreground">Third Term 2025/2026 - Programme Year 1 - Entry Week 3</strong>. The system records the real starting point without renaming it First Term or changing the curriculum sequence.</p></div></div>
      </section>

      <footer className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-black text-foreground">Ready to work?</p><p className="mt-1 text-sm text-muted-foreground">Return to the Academic Office or manage independent learning pathways.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row"><Link href="/dashboard/academic-spine" className="rounded-xl border border-border px-4 py-3 text-center text-sm font-bold text-foreground">Academic Office</Link><Link href="/dashboard/academic-spine/pathways" className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground">Learning pathways</Link></div>
      </footer>
    </main>
  );
}