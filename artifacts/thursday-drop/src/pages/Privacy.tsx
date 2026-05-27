export default function Privacy() {
  return (
    <div className="bg-background">
      <div className="max-w-2xl mx-auto px-6 py-16 md:py-24 space-y-10">
        <div className="space-y-3">
          <h1 className="font-serif text-5xl text-foreground">Privacy Policy</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Last updated: June 2026</p>
        </div>

        <Section n="1" title="Who We Are">
          Thursday Drop is an independent service operated by an individual in Toronto, Ontario, Canada. This policy explains what personal information we collect, how we use it, and your rights under Canadian privacy law (PIPEDA — the Personal Information Protection and Electronic Documents Act).
        </Section>

        <Section n="2" title="Information We Collect">
          <span>We collect the following information when you use Thursday Drop:</span>
          <ul className="mt-3 space-y-1.5 list-none">
            {[
              "Email address (required to create an account and receive alerts)",
              "Password (stored as a secure encrypted hash — we never store your plain text password)",
              "Watchlist items (the wines and producers you choose to track)",
              "Subscription status (whether you are on the Free or Pro tier)",
              "Payment information (processed directly by Stripe — we never see or store your credit card details)",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-primary shrink-0">—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section n="3" title="How We Use Your Information">
          <span>We use your information exclusively to:</span>
          <ul className="mt-3 space-y-1.5 list-none">
            {[
              "Send you personalized wine release alerts based on your watchlist",
              "Manage your account and subscription",
              "Send service-related emails such as receipts and account notifications",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-primary shrink-0">—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3">We do not sell, rent, share, or trade your personal information with any third party for marketing purposes. Ever.</p>
        </Section>

        <Section n="4" title="Email Communications">
          By creating an account you consent to receive wine release alert emails from Thursday Drop. You may unsubscribe from alerts at any time by clicking the unsubscribe link in any email or by visiting your Account page. Note that unsubscribing from alerts does not delete your account — you will still receive essential account and billing emails.
        </Section>

        <Section n="5" title="Third Party Services">
          <span>Thursday Drop uses the following third party services to operate:</span>
          <ul className="mt-3 space-y-1.5 list-none">
            {[
              { text: "Supabase (database and account storage)", href: "https://supabase.com/privacy" },
              { text: "Stripe (payment processing)", href: "https://stripe.com/privacy" },
              { text: "Resend (email delivery)", href: "https://resend.com/privacy" },
            ].map((item) => (
              <li key={item.text} className="flex gap-2">
                <span className="text-primary shrink-0">—</span>
                <span>
                  {item.text} —{" "}
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {item.href.replace("https://", "")}
                  </a>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3">These services have their own privacy policies and we encourage you to review them.</p>
        </Section>

        <Section n="6" title="Data Retention and Deletion">
          We retain your account information for as long as your account is active. If you request account deletion via your Account page, we will delete your personal information including your email address, password, and account history as soon as reasonably possible. Watchlist preference data may be retained in anonymized form with no link to your identity for the purpose of improving our wine recommendations. This anonymized data cannot be used to identify you in any way.
        </Section>

        <Section n="7" title="Your Rights">
          <span>Under PIPEDA you have the right to:</span>
          <ul className="mt-3 space-y-1.5 list-none">
            {[
              "Access the personal information we hold about you",
              "Correct inaccurate information",
              "Request deletion of your account and personal data",
              "Withdraw consent to data processing (note this may require account deletion)",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-primary shrink-0">—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            To exercise any of these rights, email{" "}
            <a href="mailto:hello@thursdaydrop.ca" className="text-primary hover:underline">
              hello@thursdaydrop.ca
            </a>
          </p>
        </Section>

        <Section n="8" title="Security">
          We take reasonable technical measures to protect your personal information including encrypted password storage, secure HTTPS connections, and restricted database access. No method of transmission over the internet is 100% secure and we cannot guarantee absolute security.
        </Section>

        <Section n="9" title="Children">
          Thursday Drop is not directed at children under the age of 19 (the legal drinking age in Ontario). We do not knowingly collect information from anyone under 19.
        </Section>

        <Section n="10" title="Changes to This Policy">
          We may update this privacy policy from time to time. We will notify active subscribers of material changes by email. Continued use of Thursday Drop after changes are posted constitutes acceptance of the updated policy.
        </Section>

        <Section n="11" title="Contact">
          Privacy questions or requests? Email{" "}
          <a href="mailto:hello@thursdaydrop.ca" className="text-primary hover:underline">
            hello@thursdaydrop.ca
          </a>{" "}
          — we do our best to respond as soon as possible, typically within a few days.
        </Section>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="font-serif text-xl text-primary">
        {n}. {title}
      </h2>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}
