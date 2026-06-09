export default function Terms() {
  return (
    <div className="bg-background">
      <div className="max-w-2xl mx-auto px-6 py-16 md:py-24 space-y-10">
        <div className="space-y-3">
          <h1 className="font-serif text-5xl text-foreground">Terms of Service</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Last updated: June 2026</p>
        </div>

        <Section n="1" title="About Thursday Drop">
          Thursday Drop is an independent wine release notification service operated by an individual based in Toronto, Ontario, Canada. Thursday Drop is not affiliated with, endorsed by, or connected to the Liquor Control Board of Ontario (LCBO), the Vintages program, or any wine producer or importer mentioned on this website.
        </Section>

        <Section n="2" title="Use of the Service">
          Thursday Drop provides wine release information and personalized alerts as a convenience to subscribers. By creating an account you agree to use the service for personal, non-commercial purposes only. You may not resell, redistribute, or commercially exploit any information provided by Thursday Drop.
        </Section>

        <Section n="3" title="Accuracy of Information">
          Thursday Drop sources release information directly from publicly available LCBO Vintages web pages. While we make every effort to ensure accuracy, we cannot guarantee that wine availability, pricing, quantities, or release dates are current or correct at the time you receive an alert. Always verify availability directly on vintagesshoponline.com before making purchasing decisions. Thursday Drop is not responsible for any purchase decisions made based on information provided by this service.
        </Section>

        <Section n="4" title="Subscriptions and Billing">
          Pro subscriptions are billed monthly at $4.99 CAD. Payments are processed securely by Stripe. You may cancel your subscription at any time from your Account page. Upon cancellation you retain Pro access until the end of your current billing period. Refunds are handled on a case by case basis. If you believe you are entitled to a refund please contact thursdaydrop.ca@gmail.com. Thursday Drop reserves the right to change subscription pricing. Active subscribers will be notified of any pricing changes by email with reasonable notice.
        </Section>

        <Section n="5" title="Accounts">
          You are responsible for maintaining the confidentiality of your account credentials. Each account is for individual use only. Thursday Drop reserves the right to suspend or terminate accounts that violate these terms or misuse the service.
        </Section>

        <Section n="6" title="Intellectual Property">
          The Thursday Drop name, logo, website design, written content, and curated wine lists are the intellectual property of Thursday Drop. Wine names, producer names, critic scores, and LCBO product information remain the property of their respective owners.
        </Section>

        <Section n="7" title="Limitation of Liability">
          Thursday Drop is provided as-is without warranty of any kind. To the maximum extent permitted by applicable law, Thursday Drop shall not be liable for any indirect, incidental, or consequential damages arising from your use of or inability to use the service, including missed wine purchases, service interruptions, or scraper errors.
        </Section>

        <Section n="8" title="Changes to These Terms">
          We may update these terms from time to time. Continued use of Thursday Drop after changes are posted constitutes acceptance of the updated terms. Material changes will be communicated to subscribers by email.
        </Section>

        <Section n="9" title="Governing Law">
          These terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable therein.
        </Section>

        <Section n="10" title="Contact">
          Questions about these terms? Email{" "}
          <a href="mailto:thursdaydrop.ca@gmail.com" className="text-primary hover:underline">
            thursdaydrop.ca@gmail.com
          </a>
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
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
