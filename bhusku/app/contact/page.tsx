import type { Metadata } from 'next'
import { BrandChrome } from '@/components/BrandChrome'
import { ContactForm } from './ContactForm'
import { BRAND, BUSINESS } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with bhusku — partnerships, product feedback, or support.',
  alternates: { canonical: '/contact' },
}

export default function ContactPage() {
  return (
    <BrandChrome>
      <section className="mx-auto grid max-w-[980px] gap-12 px-6 py-20 sm:grid-cols-2">
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9A95BC]">Contact</p>
          <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-[1.15] tracking-[-1px] text-[#13111E]">
            Let&rsquo;s talk.
          </h1>
          <p className="mt-4 max-w-[420px] text-[15px] leading-[1.75] text-[#4B5275]">
            Questions about a product, a partnership, or support — send a note and we&rsquo;ll get back to you.
          </p>
          <div className="mt-8 flex flex-col gap-3 text-[14px]">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9A95BC]">Email</div>
              <a href={`mailto:${BRAND.email}`} className="font-semibold text-[#7C6FE0] no-underline">{BRAND.email}</a>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9A95BC]">Phone</div>
              <span className="text-[#4B5275]">{BUSINESS.phone}</span>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9A95BC]">Address</div>
              <span className="text-[#4B5275]">{BUSINESS.address}</span>
            </div>
          </div>
        </div>
        <ContactForm />
      </section>
    </BrandChrome>
  )
}
