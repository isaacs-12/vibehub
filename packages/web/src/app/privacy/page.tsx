import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — VibeHub',
  description: 'How VibeHub collects, uses, and protects your data.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-screen-md px-4 py-16">
      <h1 className="text-3xl font-bold text-fg mb-2">Privacy Policy</h1>
      <p className="text-sm text-fg-muted mb-10">Last updated: March 20, 2026</p>

      <div className="space-y-8 text-sm text-fg-muted leading-relaxed">
        <Section title="1. Introduction">
          <p>
            VibeHub (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates the
            VibeHub platform, including the web application, desktop application (VibeStudio),
            CLI tool, and related services (collectively, the &ldquo;Service&rdquo;). This
            Privacy Policy explains how we collect, use, store, and share your information
            when you use the Service.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <h4 className="font-semibold text-fg mt-4 mb-2">Account Information</h4>
          <p>
            When you sign in with Google, we receive and store the following information from
            your Google account:
          </p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>Your name</li>
            <li>Your email address</li>
            <li>Your profile picture URL</li>
            <li>Your Google account identifier</li>
          </ul>

          <h4 className="font-semibold text-fg mt-4 mb-2">User-Generated Content</h4>
          <p>
            We store the specs, project configurations, and related content you create on the
            platform. This content is stored in our database and, where applicable, in cloud
            storage.
          </p>

          <h4 className="font-semibold text-fg mt-4 mb-2">Usage Data</h4>
          <p>
            We use Google Analytics to collect anonymized usage data such as pages visited,
            features used, and general interaction patterns. This data helps us improve the
            Service.
          </p>
        </Section>

        <Section title="3. How We Use Google User Data">
          <p>
            We use Google user data solely for the following purposes:
          </p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>
              <strong className="text-fg">Authentication:</strong> We use your Google account
              information to create and manage your VibeHub account and to authenticate you
              across the web app, desktop app, and CLI.
            </li>
            <li>
              <strong className="text-fg">Profile display:</strong> Your name and profile
              picture are displayed within the Service to identify you to yourself and, where
              applicable, to other users on public projects.
            </li>
            <li>
              <strong className="text-fg">Communication:</strong> Your email address may be
              used to send you important account-related notifications.
            </li>
          </ul>
          <p className="mt-3">
            We do <strong className="text-fg">not</strong> use Google user data for advertising,
            do not sell or share it with third parties for their own purposes, and do not use
            it for any purpose other than providing and improving the Service.
          </p>
        </Section>

        <Section title="4. Google API Limited Use Disclosure">
          <p>
            VibeHub&rsquo;s use and transfer to any other app of information received from
            Google APIs will adhere to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-emphasis hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="5. Data Storage and Security">
          <p>
            Your data is stored in a PostgreSQL database and, where applicable, in Google
            Cloud Storage. We use industry-standard security measures including:
          </p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>Encrypted connections (HTTPS/TLS) for all data in transit</li>
            <li>Secure session management with JWT-based authentication</li>
            <li>Access controls to limit data access to authorized personnel</li>
          </ul>
        </Section>

        <Section title="6. Data Retention">
          <p>
            We retain your account information for as long as your account is active. If you
            delete your account, we will delete your personal information within 30 days,
            except where we are required to retain it by law. Project content on public
            repositories may persist in forks created by other users.
          </p>
        </Section>

        <Section title="7. Data Sharing">
          <p>We do not sell your personal information. We may share your data only in the following circumstances:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>
              <strong className="text-fg">Service providers:</strong> With third-party services
              that help us operate the platform (e.g., cloud hosting, analytics), under strict
              data processing agreements.
            </li>
            <li>
              <strong className="text-fg">Legal requirements:</strong> When required by law,
              legal process, or government request.
            </li>
            <li>
              <strong className="text-fg">Public projects:</strong> Your name and profile
              picture may be visible on projects you make public.
            </li>
          </ul>
        </Section>

        <Section title="8. Your Rights">
          <p>You have the right to:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and associated data</li>
            <li>Export your project data</li>
            <li>Revoke VibeHub&rsquo;s access to your Google account at any time via your{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-emphasis hover:underline"
              >
                Google Account permissions
              </a>
            </li>
          </ul>
        </Section>

        <Section title="9. Cookies and Tracking">
          <p>
            We use essential cookies for authentication and session management. We also use
            Google Analytics, which sets its own cookies to collect anonymized usage data. You
            can opt out of Google Analytics by installing the{' '}
            <a
              href="https://tools.google.com/dlpage/gaoptout"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-emphasis hover:underline"
            >
              Google Analytics Opt-out Browser Add-on
            </a>
            .
          </p>
        </Section>

        <Section title="10. Children's Privacy">
          <p>
            The Service is not intended for children under 13. We do not knowingly collect
            personal information from children under 13.
          </p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify you of
            material changes by posting a notice on the Service or by email. Your continued
            use of the Service after changes take effect constitutes acceptance of the updated
            policy.
          </p>
        </Section>

        <Section title="12. Contact Us">
          <p>
            If you have questions about this Privacy Policy or how we handle your data,
            please contact us at{' '}
            <a href="mailto:isaacmckeesmith@gmail.com" className="text-accent-emphasis hover:underline">
              isaacmckeesmith@gmail.com
            </a>
            .
          </p>
        </Section>
      </div>

      <div className="mt-12 pt-8 border-t border-border">
        <Link href="/" className="text-sm text-accent-emphasis hover:underline">
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-lg font-semibold text-fg mb-3">{title}</h3>
      {children}
    </section>
  );
}
