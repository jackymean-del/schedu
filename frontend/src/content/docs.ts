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
    title: 'How AI scheduling works',
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
    description: 'Model OR/AND elective groups and parallel sections that stay clash-free.',
    readMins: 5,
    intro:
      'Electives are where most timetables fall apart, because students in the same class head in different directions. schedU models this with two building blocks: OR groups and AND groups.',
    sections: [
      {
        heading: 'OR groups',
        blocks: [
          { p: 'An OR group is a set of mutually exclusive options — pick exactly one. A student choosing between Art, Music, and Drama belongs to one OR group.' },
          { p: 'schedU schedules the options in parallel so the choice is always available and never conflicts.' },
        ],
      },
      {
        heading: 'AND groups',
        blocks: [
          { p: 'An AND group is a set of subjects taken together — a required combination, like Physics + Chemistry + Biology for a Science stream. schedU keeps all of them on the timetable without overlapping them.' },
        ],
      },
      {
        heading: 'A quick checklist',
        blocks: [
          {
            ol: [
              'Every elective belongs to exactly one OR or AND group.',
              'Parallel sections have enough rooms and teachers to run simultaneously.',
              'Mutually exclusive options share the same time block.',
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
              'Specific people — only the email addresses you list can open it; viewers confirm their email first.',
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
