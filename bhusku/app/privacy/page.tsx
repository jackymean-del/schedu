import type { Metadata } from 'next'
import { PolicyShell, Section } from '@/components/Policy'
import { BUSINESS } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How bhusku collects, uses, and protects your personal data.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <PolicyShell
      title="Privacy Policy"
      intro={`This Privacy Policy explains how ${BUSINESS.entityLine} ("bhusku", "we") collects, uses, and protects personal data when you use our websites and products, including schedU.`}
    >
      <Section heading="1. Information we collect">
        <ul>
          <li><strong>Account details</strong> — name and email address when you sign up or contact us.</li>
          <li><strong>Content you create</strong> — the schedules, staff, and organisation details you enter into a product.</li>
          <li><strong>Payment information</strong> — handled directly by our payment processor, Razorpay. We do not store your full card or bank details on our servers.</li>
          <li><strong>Usage &amp; technical data</strong> — basic logs (such as IP address and browser) used to run and secure the service.</li>
        </ul>
      </Section>

      <Section heading="2. How we use it">
        <ul>
          <li>To provide, operate, and improve the products.</li>
          <li>To process payments and manage subscriptions.</li>
          <li>To respond to your messages and provide support.</li>
          <li>To keep our systems secure and comply with legal obligations.</li>
        </ul>
        <p>We do not sell your personal data.</p>
      </Section>

      <Section heading="3. Sharing with service providers">
        <p>
          We share data only with trusted providers who help us run the service, under appropriate confidentiality obligations —
          currently including <strong>Razorpay</strong> (payments), <strong>Clerk</strong> (authentication), and our cloud hosting
          and infrastructure providers. We may also disclose information where required by law.
        </p>
      </Section>

      <Section heading="4. Data retention">
        <p>
          We keep your data for as long as your account is active or as needed to provide the service, then delete or anonymise it
          within a reasonable period, unless we are required to retain it by law (for example, tax and accounting records).
        </p>
      </Section>

      <Section heading="5. Security">
        <p>
          We use industry-standard measures to protect your data, including encryption in transit and access controls. No method of
          transmission or storage is completely secure, but we work to protect your information and notify you of material breaches
          as required by law.
        </p>
      </Section>

      <Section heading="6. Your rights">
        <p>
          You may request access to, correction of, or deletion of your personal data, and you can close your account at any time.
          To make a request, email <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
        </p>
      </Section>

      <Section heading="7. Children">
        <p>
          Our products are intended for institutions and adults administering them, not for direct use by children. We do not
          knowingly collect personal data directly from children.
        </p>
      </Section>

      <Section heading="8. Changes & contact">
        <p>
          We may update this policy; the &ldquo;last updated&rdquo; date above reflects the latest version. For any privacy question
          or request, contact <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
        </p>
      </Section>
    </PolicyShell>
  )
}
