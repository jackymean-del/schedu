/**
 * Help & Support — FAQ, quick links and a way to reach the team.
 */
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ChevronDown, Mail, BookOpen, PlayCircle } from 'lucide-react'

const FAQ = [
  { q: 'How do I create my first timetable?', a: 'Click "+ New timetable" on the dashboard, give it a name and class range, then follow the wizard: add resources, set timings, allocate periods, and generate.' },
  { q: 'Can I use my own class naming?', a: 'Yes. Type any convention — "Class I", "Grade 1", "Form 1", "Year 7". schedU adapts to your naming and groups levels automatically.' },
  { q: 'Is my data private to my account?', a: 'Yes. Every signed-in user has their own organization and timetables, stored securely on the server.' },
  { q: 'How do I change my organization details?', a: 'Open Settings → Organization to edit your name, type and planning period anytime.' },
]

export function SupportPage() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="🛟" title="Help & Support" description="Guides, answers and a direct line to our team." />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <LinkCard icon={<BookOpen size={18} />} title="Documentation" desc="Step-by-step guides" href="https://schedu.bhusku.com/docs" />
          <LinkCard icon={<PlayCircle size={18} />} title="Watch a demo" desc="See schedU in action" href="/demo" />
          <LinkCard icon={<Mail size={18} />} title="Email us" desc="support@bhusku.com" href="mailto:support@bhusku.com" />
        </div>

        <section style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 8 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#13111E', margin: '12px 14px' }}>Frequently asked</h2>
          {FAQ.map((f, i) => (
            <div key={i} style={{ borderTop: '1px solid #F3F1FB' }}>
              <button onClick={() => setOpen(open === i ? null : i)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#13111E' }}>{f.q}</span>
                <ChevronDown size={16} color="#8B87AD" style={{ transform: open === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
              {open === i && <p style={{ fontSize: 13, color: '#4B5275', lineHeight: 1.6, margin: 0, padding: '0 14px 14px' }}>{f.a}</p>}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

function LinkCard({ icon, title, desc, href }: { icon: React.ReactNode; title: string; desc: string; href: string }) {
  const external = href.startsWith('http')
  return (
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}
      style={{ textDecoration: 'none', background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 18, display: 'block' }}>
      <div style={{ color: '#7C6FE0', marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#13111E' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: '#8B87AD', marginTop: 2 }}>{desc}</div>
    </a>
  )
}
