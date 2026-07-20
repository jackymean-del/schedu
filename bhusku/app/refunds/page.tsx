import type { Metadata } from 'next'
import { PolicyShell, Section } from '@/components/Policy'
import { BUSINESS } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Cancellation & Refund Policy',
  description: 'How subscriptions, cancellations, and refunds work for bhusku products.',
  alternates: { canonical: '/refunds' },
}

export default function RefundsPage() {
  return (
    <PolicyShell
      title="Cancellation & Refund Policy"
      intro="We want you to be happy with what you pay for. This policy explains how subscriptions, cancellations, and refunds work for paid plans on bhusku products, including schedU Pro."
    >
      <Section heading="1. Free to try">
        <p>
          Every product is free to start, so you can evaluate it fully before paying. Paid plans are optional upgrades.
        </p>
      </Section>

      <Section heading="2. Subscriptions & renewals">
        <p>
          Paid plans (for example, schedU <strong>Pro</strong> at <strong>₹{BUSINESS.proMonthlyINR}/month</strong> or{' '}
          <strong>₹{BUSINESS.proYearlyINR.toLocaleString('en-IN')}/year</strong>) are recurring subscriptions billed in advance
          through Razorpay. They renew automatically at the end of each period until you cancel.
        </p>
      </Section>

      <Section heading="3. Cancelling">
        <p>
          You can cancel anytime from your account&rsquo;s subscription page. Cancellation stops future renewals — you keep Pro
          access until the end of the period you have already paid for, and you are not charged again after that.
        </p>
      </Section>

      <Section heading="4. Refunds">
        <ul>
          <li>
            <strong>Duplicate or failed charges:</strong> if you were charged in error, more than once, or charged despite a failed
            transaction, we will refund the incorrect amount in full.
          </li>
          <li>
            <strong>7-day satisfaction window:</strong> if you upgrade to a paid plan and are not satisfied, contact us within{' '}
            <strong>7 days</strong> of that payment and we will refund it, provided the plan was not substantially used to export or
            operate at scale.
          </li>
          <li>
            <strong>After the window:</strong> beyond 7 days, payments for the current period are generally non-refundable — but you
            can cancel to avoid future charges, and we&rsquo;ll always look at genuine issues case by case.
          </li>
        </ul>
      </Section>

      <Section heading="5. How to request a refund">
        <p>
          Email <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> from your account email with your name and the approximate
          date of the charge. Approved refunds are processed to your original payment method via Razorpay, typically within{' '}
          <strong>5–7 business days</strong> (your bank may take a little longer to reflect it).
        </p>
      </Section>

      <Section heading="6. Contact">
        <p>
          Questions about billing or refunds? We&rsquo;re happy to help — <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
        </p>
      </Section>
    </PolicyShell>
  )
}
