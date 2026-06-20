import {
  CalendarCheck,
  AlertTriangle,
  Layers,
  GitBranch,
  Building2,
  FileDown,
  type LucideIcon,
} from "lucide-react";

export interface Feature {
  icon: LucideIcon;
  title: string;
  summary: string;
  description: string;
}

export const features: Feature[] = [
  {
    icon: CalendarCheck,
    title: "AI Auto-Schedule",
    summary: "Generate complete timetables in one click.",
    description:
      "Feed schedU your teachers, subjects, and sections, then let the AI build a complete, balanced timetable in seconds. What used to take weeks of spreadsheet wrangling now happens in a single click — and you can regenerate instantly when requirements change.",
  },
  {
    icon: AlertTriangle,
    title: "Conflict Detection",
    summary: "Real-time alerts for teacher and room double-bookings.",
    description:
      "Every change is validated the moment you make it. schedU flags teacher clashes, room double-bookings, and over-allocated periods in real time, so a finished timetable is always a conflict-free timetable.",
  },
  {
    icon: Layers,
    title: "Elective Grouping",
    summary: "Smart OR/AND group management for optional subjects.",
    description:
      "Model the real choices students make. Define OR groups for mutually exclusive electives and AND groups for required combinations, and schedU schedules every parallel section so no student is ever forced to be in two places at once.",
  },
  {
    icon: GitBranch,
    title: "Multi-Stream Support",
    summary: "Science, Commerce, and Arts streams with split sections.",
    description:
      "Run Science, Commerce, and Arts streams side by side with split and merged sections. schedU keeps shared subjects aligned across streams while respecting the unique requirements of each.",
  },
  {
    icon: Building2,
    title: "Room & Resource Planning",
    summary: "Assign labs, halls, and shared spaces automatically.",
    description:
      "Tag rooms by type and capacity and let schedU place labs, halls, and shared spaces where they fit. Resource constraints are honored automatically, so you never schedule a chemistry practical into a room without a lab.",
  },
  {
    icon: FileDown,
    title: "Export & Share",
    summary: "PDF timetables for staff, students, and parents.",
    description:
      "Publish polished, print-ready PDF timetables for the whole institution in seconds — master grids for administrators, personal schedules for teachers, and clear class views for students.",
  },
];

export interface Step {
  number: number;
  title: string;
  description: string;
}

export const howItWorks: Step[] = [
  {
    number: 1,
    title: "Add your institution's data",
    description:
      "Import or enter your teachers, subjects, rooms, and sections. schedU understands how any institution is structured — schools, colleges, and universities alike.",
  },
  {
    number: 2,
    title: "Configure constraints and electives",
    description:
      "Set teacher availability, room rules, and OR/AND elective groups so the scheduler knows exactly what your institution needs.",
  },
  {
    number: 3,
    title: "Generate and export",
    description:
      "Click generate for a conflict-free timetable, then export polished PDFs for staff, students, and parents.",
  },
];

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "schedU turned a three-week scheduling marathon into an afternoon. The conflict detection alone has saved us from a dozen timetable headaches this term.",
    name: "Priya Nair",
    role: "Vice Principal, Greenwood International School",
  },
  {
    quote:
      "Managing electives across three streams used to be guesswork. Now the OR/AND groups just work, and every student gets a clash-free schedule.",
    name: "Daniel Osei",
    role: "Registrar, Northgate College",
  },
  {
    quote:
      "Rolling schedU out across all our campuses was painless. SSO and the API meant every institution in the group was generating timetables in the same week.",
    name: "Maria Gonzalez",
    role: "Director of Operations, Atlas Education Group",
  },
];

export interface PricingTier {
  name: string;
  price: { monthly: number; annual: number };
  priceLabel?: string;
  description: string;
  cta: string;
  highlighted?: boolean;
  features: string[];
}

export const pricingTiers: PricingTier[] = [
  {
    name: "Starter",
    price: { monthly: 0, annual: 0 },
    priceLabel: "Free",
    description: "Everything a small team needs to try AI scheduling.",
    cta: "Start Free",
    features: [
      "Up to 2 classes",
      "Up to 20 subjects",
      "AI auto-schedule",
      "Real-time conflict detection",
      "PDF export",
      "Community support",
    ],
  },
  {
    name: "Pro",
    price: { monthly: 29, annual: 23 },
    description: "For a single institution running multiple streams and electives.",
    cta: "Start Free Trial",
    highlighted: true,
    features: [
      "Unlimited classes",
      "Unlimited subjects",
      "Elective OR/AND groups",
      "Multi-stream support",
      "Room & resource planning",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: { monthly: 99, annual: 79 },
    description: "For groups managing many campuses or institutions from one place.",
    cta: "Talk to Sales",
    features: [
      "Everything in Pro",
      "Multi-campus management",
      "API access",
      "SSO / SAML",
      "Custom onboarding",
      "Dedicated success manager",
    ],
  },
];
