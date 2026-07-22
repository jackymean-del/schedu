/**
 * Documentation content. Each article renders at /docs/<slug> via
 * src/pages/doc-article.tsx. Keep blocks plain so the renderer stays simple.
 */
export type DocBlock =
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { note: string }

export interface DocSection {
  heading: string
  blocks: DocBlock[]
}

export interface DocArticle {
  slug: string
  icon: string
  title: string
  description: string
  readMins: number
  intro: string
  sections: DocSection[]
}

export const DOC_ARTICLES: DocArticle[] = [
  {
    slug: 'getting-started',
    icon: '🚀',
    title: 'Getting started',
    description: 'Create your first conflict-free timetable with schedU in under five minutes.',
    readMins: 4,
    intro:
      'schedU turns your institution’s teachers, subjects, and rooms into a complete, conflict-free timetable. This guide walks you from a blank slate to a published schedule.',
    sections: [
      {
        heading: '1. Enter the basics',
        blocks: [
          { p: 'Open the wizard and tell schedU about your institution: its name, the board or curriculum you follow (or define your own), and the range of classes or year groups you run.' },
          { p: 'You do not need everything up front — you can add teachers, subjects, and rooms as you go.' },
        ],
      },
      {
        heading: '2. Add teachers, subjects, and rooms',
        blocks: [
          { p: 'Enter the people, subjects, and spaces schedU will allocate:' },
          {
            ul: [
              'Teachers — names and the subjects each can teach.',
              'Subjects — with the number of periods per week you want for each class.',
              'Rooms — tagged by type (lab, hall, standard) and capacity.',
            ],
          },
          { note: 'Tip: import from a spreadsheet to save time on larger institutions.' },
        ],
      },
      {
        heading: '3. Generate',
        blocks: [
          { p: 'Click generate. schedU’s engine places every period while respecting teacher availability, room constraints, and elective groups — then validates the result so there are no clashes.' },
          { p: 'Generation typically takes seconds. If your requirements change, just regenerate.' },
        ],
      },
      {
        heading: '4. Review, refine, and publish',
        blocks: [
          { p: 'Edit the timetable inline like a spreadsheet. Every change is re-validated instantly, and schedU explains why each slot was chosen.' },
          { p: 'When you’re happy, export class-wise, teacher-wise, and room-wise timetables as PDF or Excel, or print them directly.' },
        ],
      },
    ],
  },
  {
    slug: 'ai-scheduling',
    icon: '🧠',
    title: 'How Human-Intelligence scheduling works',
    description: 'Understand how schedU allocates periods and balances workloads automatically.',
    readMins: 5,
    intro:
      'schedU treats your timetable as a constraint-satisfaction problem: you describe the rules, and the engine searches for an arrangement that satisfies every hard constraint while optimizing the soft ones.',
    sections: [
      {
        heading: 'Hard vs. soft constraints',
        blocks: [
          { p: 'Hard constraints must never be violated; soft constraints are preferences the engine optimizes toward.' },
          {
            ul: [
              'Hard: no teacher or room double-booked, period counts met, electives run in parallel.',
              'Soft: balanced teacher workloads, minimal gaps, subject spread across the week.',
            ],
          },
        ],
      },
      {
        heading: 'Period allocation',
        blocks: [
          { p: 'For each class, schedU distributes the required periods per subject across the week, avoiding back-to-back repetition where possible and respecting any timing rules you set (e.g. no PE in the first period).' },
        ],
      },
      {
        heading: 'Teacher allocation',
        blocks: [
          { p: 'Teachers are matched to subjects by expertise and assigned with workload balancing, so no one is overloaded and continuity rules (the same teacher across a year group) are honored.' },
          { note: 'Regenerating is cheap — change a constraint and rebuild the whole timetable in seconds.' },
        ],
      },
    ],
  },
  {
    slug: 'electives',
    icon: '🔀',
    title: 'Electives & cross-class groups',
    description: 'Model flexible OR slots and cross-class AND groups so electives stay clash-free.',
    readMins: 5,
    intro:
      'Electives are where most timetables fall apart, because students in the same class head in different directions. schedU handles this with two ideas: OR slots and AND (cross-class) groups.',
    sections: [
      {
        heading: 'OR — a flexible period slot',
        blocks: [
          { p: 'An OR slot is a single period that runs one of several subjects — not all at once. The section stays together, and your institution decides which subject (and teacher) takes the slot on a given day, based on what the syllabus needs.' },
          { p: 'Example: a period set as “Physics OR Chemistry”. One day the Chemistry teacher takes it; another day the Physics teacher does — whatever you need that day. Never both at the same time.' },
          { note: 'schedU only reserves the slot and keeps every listed teacher free for it — it does not pick the subject for you. It can’t know which part of the syllabus is pending, so that choice stays with your institution.' },
        ],
      },
      {
        heading: 'AND — cross-class groups',
        blocks: [
          { p: 'When sections share subject combinations, students taking the same subject can be pooled into one group across sections — a cross-class group — when they follow the same textbook.' },
          { p: 'Example: sections offer combinations like PCM (Physics, Chemistry, Maths) and PCB (Physics, Chemistry, Biology). In each section some students take Maths and the rest Biology. Across sections, all the Maths students form one group and all the Biology students another.' },
          { p: 'schedU schedules those cross-class groups in the same block, so the right students from different sections are taught together by one teacher in one room — instead of running tiny duplicate classes per section.' },
        ],
      },
      {
        heading: 'A quick checklist',
        blocks: [
          {
            ol: [
              'For an OR slot, reserve one period and list the subjects that may run in it — schedU assigns the teacher as needed.',
              'For cross-class (AND) groups, mark which subjects can pool across sections (same textbook / grade), so students are grouped rather than duplicated.',
              'Make sure each pooled group has a room large enough for the combined students.',
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'rooms-resources',
    icon: '🏛️',
    title: 'Rooms & resource planning',
    description: 'Tag labs, halls, and shared spaces so schedU places them automatically.',
    readMins: 3,
    intro:
      'schedU honors physical constraints automatically, so you never schedule a chemistry practical into a room without a lab.',
    sections: [
      {
        heading: 'Tag your rooms',
        blocks: [
          { p: 'Give each room a type and a capacity:' },
          {
            ul: [
              'Type — lab, hall, computer room, standard classroom, etc.',
              'Capacity — the maximum number of students it holds.',
            ],
          },
        ],
      },
      {
        heading: 'Match subjects to room types',
        blocks: [
          { p: 'Flag which subjects need which room type. schedU then places those periods only in matching rooms, and never double-books a shared space.' },
          { note: 'Shared spaces like halls and labs are treated as scarce resources and allocated across all classes that need them.' },
        ],
      },
    ],
  },
  {
    slug: 'publishing-sharing',
    icon: '📤',
    title: 'Publishing & Sharing',
    description: 'Publish your timetable, share it as a public or private link, or export to PDF and Excel.',
    readMins: 4,
    intro:
      'Once your timetable is conflict-free, schedU gets it in front of everyone — published views for the whole institution, shareable links, and downloadable files.',
    sections: [
      {
        heading: 'Publishing your timetable',
        blocks: [
          { p: 'Publish polished, ready-to-read views for every audience:' },
          {
            ul: [
              'Master grid — the whole institution at a glance, for administrators.',
              'Teacher-wise — a personal schedule for each member of staff.',
              'Class-wise — a clear view for each section of students.',
              'Room-wise — utilization for every space.',
            ],
          },
        ],
      },
      {
        heading: 'Sharing by link',
        blocks: [
          { p: 'Instead of sending a file, publish a read-only link to the timetable — like sharing a calendar. Open the Export menu, choose “Share via link”, then pick who can see it.' },
          {
            ul: [
              'Anyone with the link — a public, read-only view, no account needed.',
              'Specific people — only the email addresses you list can open it; viewers verify their email with a one-time code first.',
            ],
          },
          { p: 'The shared link is a frozen snapshot, so later edits don’t change what others see.' },
          { note: 'Need to share updated content, or revoke an old link? Just share again to get a new one.' },
        ],
      },
      {
        heading: 'Exporting to PDF & Excel',
        blocks: [
          { p: 'Download the timetable to share or archive offline:' },
          {
            ul: [
              'PDF — print-ready, class-wise / teacher-wise / room-wise, combined or individual.',
              'Excel — editable workbooks with days or classes in tabs.',
            ],
          },
          { p: 'You can also print directly from the browser.' },
        ],
      },
    ],
  },
]

export function getDoc(slug: string): DocArticle | undefined {
  return DOC_ARTICLES.find((d) => d.slug === slug)
}
