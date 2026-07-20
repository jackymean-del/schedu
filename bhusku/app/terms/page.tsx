import type { Metadata } from 'next'
import { PolicyShell, Section } from '@/components/Policy'
import { BUSINESS, BRAND, SCHEDU_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'The terms governing use of bhusku products and services.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <PolicyShell
      title="Terms & Conditions"
      intro={`These Terms & Conditions ("Terms") govern your use of the websites and software products operated by ${BUSINESS.entityLine} ("bhusku", "we", "us"), including schedU. By creating an account or using our products, you agree to these Terms.`}
    >
      <Section heading="1. Who we are">
        <p>
          bhusku is operated by <strong>{BUSINESS.entityLine}</strong>. You can reach us at{' '}
          <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
          {BUSINESS.phone && <> or {BUSINESS.phone}</>}.
        </p>
      </Section>

      <Section heading="2. Your account">
        <p>
          You are responsible for the accuracy of the information you provide and for keeping your login credentials secure.
          You must be authorised to act for any institution or organisation you add to a product. You are responsible for all
          activity under your account.
        </p>
      </Section>

      <Section heading="3. Acceptable use">
        <ul>
          <li>Do not use the products for any unlawful purpose or to infringe others&rsquo; rights.</li>
          <li>Do not attempt to disrupt, reverse-engineer, or gain unauthorised access to our systems.</li>
          <li>Do not upload content you do not have the right to use, or that is unlawful or harmful.</li>
        </ul>
        <p>We may suspend or terminate accounts that breach these Terms.</p>
      </Section>

      <Section heading="4. Plans, billing & taxes">
        <p>
          Our products are free to start. Optional paid plans (for example, schedU <strong>Pro</strong> at{' '}
          <strong>₹{BUSINESS.proMonthlyINR}/month</strong> or <strong>₹{BUSINESS.proYearlyINR.toLocaleString('en-IN')}/year</strong>)
          are billed in Indian Rupees through our payment processor, <strong>Razorpay</strong>. Prices are shown at checkout and on the
          product&rsquo;s <a href={`${SCHEDU_URL}/pricing`}>pricing page</a>. Subscriptions renew automatically until cancelled.
          You can cancel anytime; cancellation takes effect at the end of the current billing period. Refunds are governed by our{' '}
          <a href="/refunds">Cancellation &amp; Refund Policy</a>. Applicable taxes may be added as required by law.
        </p>
      </Section>

      <Section heading="5. Your content & data">
        <p>
          You retain ownership of the data and content you put into our products. You grant us a limited licence to store and
          process it solely to provide and improve the service. How we handle personal data is described in our{' '}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </Section>

      <Section heading="6. Intellectual property">
        <p>
          The products, including their software, design, and the bhusku and schedU names and marks, are owned by us and
          protected by law. These Terms do not grant you any rights in them beyond the right to use the products as intended.
        </p>
      </Section>

      <Section heading="7. Availability & changes">
        <p>
          We work hard to keep the products available and reliable, but we provide them on an &ldquo;as is&rdquo; and
          &ldquo;as available&rdquo; basis without warranties of any kind. We may add, change, or discontinue features, and we
          may update these Terms; material changes will be reflected by the &ldquo;last updated&rdquo; date above.
        </p>
      </Section>

      <Section heading="8. Limitation of liability">
        <p>
          To the maximum extent permitted by law, {BRAND.name} will not be liable for any indirect, incidental, or consequential
          damages, or for loss of data or profits. Our total liability for any claim relating to the products will not exceed the
          amount you paid us for the product in the twelve months before the claim.
        </p>
      </Section>

      <Section heading="9. Governing law">
        <p>
          These Terms are governed by the laws of India. Any disputes are subject to the exclusive jurisdiction of the courts at{' '}
          <strong>{BUSINESS.jurisdiction}</strong>.
        </p>
      </Section>

      <Section heading="10. Contact">
        <p>
          Questions about these Terms? Email <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
        </p>
      </Section>
    </PolicyShell>
  )
}
