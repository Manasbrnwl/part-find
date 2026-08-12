/**
 * Canonical Terms & Conditions and Privacy Policy content for PartFind.
 * Served via the public legal API and intended to mirror the website pages.
 *
 * NOTE: Placeholders in [square brackets] (legal entity, city, grievance
 * officer, address) must be finalized before relying on these documents.
 */

export interface LegalSection {
  id: string;
  title: string;
  content: string;
}

export const LEGAL_LAST_UPDATED = "August 12, 2026";

export const termsSections: LegalSection[] = [
  {
    id: "agreement",
    title: "1. Agreement to Terms",
    content: `These Terms and Conditions ("Terms") form a legally binding agreement between you ("you", "User") and PartFind, operated by [Legal Entity Name] ("PartFind", "we", "us", "our"), governing your access to and use of the PartFind website, mobile applications, and related services (collectively, the "Platform" or "Services").

By creating an account, accessing, or using the Services, you confirm that you have read, understood, and agree to be bound by these Terms, our Privacy Policy, and all applicable laws. If you do not agree, you must not access or use the Services.

These Terms are published in accordance with the Information Technology Act, 2000 and the rules made thereunder, and do not require any physical or digital signature to be binding.`,
  },
  {
    id: "definitions",
    title: "2. Definitions",
    content: `"Worker" / "Candidate" means a User who registers to discover, apply for, and perform gig, event, or part-time work.

"Recruiter" / "Organizer" means a User who registers to post opportunities and engage Workers.

"Gig" means any short-term, event-based, or part-time opportunity listed on the Platform.

"User Content" means any information, text, images, video, ratings, reviews, company details, or other material submitted by a User.

"Engagement" means any arrangement, booking, or transaction between a Worker and a Recruiter facilitated through the Platform.`,
  },
  {
    id: "eligibility",
    title: "3. Eligibility & Your Account",
    content: `Eligibility: You must be at least 18 years of age and competent to contract under applicable law. The Services are not intended for minors, and we do not knowingly permit persons under 18 to register.

Accurate information: You agree to provide true, current, and complete information (including your name, contact details, profile details, skills, and, for Recruiters, company and registration details) and to keep it updated.

One account: You may hold one account per role unless we expressly permit otherwise. You may not impersonate any person or entity or misrepresent your affiliation.

Account security: You are responsible for maintaining the confidentiality of your login credentials and one-time passwords (OTPs), and for all activity under your account. Notify us immediately at official@part-find.org of any unauthorized use.`,
  },
  {
    id: "intermediary",
    title: "4. Nature of the Platform — Intermediary & No Employment",
    content: `PartFind is a neutral technology platform and "intermediary" under the Information Technology Act, 2000 that connects independent Workers with independent Recruiters and Organizers. Please note:

Connection only: We provide the tools to discover, list, apply for, and coordinate Gigs. We do not participate in, supervise, direct, or control the actual work performed.

No employment: PartFind is not an employer, staffing agency, recruitment consultant, or agent of any User. No employment, agency, partnership, or joint-venture relationship is created between you and PartFind by your use of the Services.

No guarantee: We do not guarantee the availability of Gigs, the hiring of any Worker, the attendance, conduct, qualifications, or performance of any User, or the accuracy of any listing. Any Engagement is entered into at the Users' sole risk and discretion.

Verification: While we may offer certain verification features, we do not conduct background checks unless expressly stated, and you are solely responsible for verifying the identity, suitability, credentials, and legal status of any User before entering into an Engagement.`,
  },
  {
    id: "acceptable-use",
    title: "5. Your Responsibilities & Acceptable Use",
    content: `You agree to use the Services lawfully and in good faith. You must NOT:

• Post false, misleading, fraudulent, or discriminatory listings, profiles, or credentials.
• Post any Gig that is unlawful, unsafe, involves illegal work, or violates labour, wage, or anti-trafficking laws.
• Harass, threaten, defame, stalk, or discriminate against any User, or solicit sexual or exploitative services.
• Spam, send unsolicited communications, or circumvent Platform features to avoid fees or safety measures.
• Upload viruses or malicious code, scrape or harvest data, reverse-engineer, or attempt to gain unauthorized access to the Services or other accounts.
• Infringe the intellectual property, privacy, or other rights of any person, or post obscene, hateful, or otherwise objectionable content.

You are solely responsible for your interactions and Engagements with other Users. We encourage you to exercise caution and independent judgment.`,
  },
  {
    id: "gigs-payments",
    title: "6. Gigs, Engagements, Payments & Taxes",
    content: `Listings & applications: Recruiters are responsible for the accuracy and legality of their Gigs, including pay, timing, location, and requirements. Workers are responsible for the accuracy of their profiles and applications.

Payments between Users: Unless expressly stated otherwise on the Platform, all payments, wages, and consideration for a Gig are agreed and settled directly between the Recruiter and the Worker. PartFind is not a party to these payments and is not responsible for, and disclaims all liability for, non-payment, underpayment, delayed payment, or any related dispute.

Platform fees: Where PartFind charges fees for certain features, the applicable fees will be disclosed to you before you incur them. Fees are non-refundable except as required by law or expressly stated.

Taxes: Each User is solely responsible for determining and discharging its own tax obligations arising from any Engagement.`,
  },
  {
    id: "content",
    title: "7. User Content, Ratings & License",
    content: `Ownership: You retain ownership of the User Content you submit. You are solely responsible for it and represent that you own or have all rights necessary to submit it and that it does not violate any law or third-party right.

License to us: You grant PartFind a non-exclusive, worldwide, royalty-free, transferable, and sub-licensable license to host, store, reproduce, display, adapt, and distribute your User Content solely to operate, provide, improve, and promote the Services.

Ratings & reviews: Our two-way ratings and reviews reflect the opinions of Users, not PartFind. You agree to provide honest, non-defamatory feedback. We may, but are not obliged to, moderate, screen, or remove any User Content that violates these Terms, without notice.`,
  },
  {
    id: "ip",
    title: "8. Intellectual Property",
    content: `The Platform, including its software, design, text, graphics, logos, and the "PartFind" name and marks, is owned by or licensed to us and is protected by intellectual property laws. Except as expressly permitted, you may not copy, modify, distribute, sell, or create derivative works from any part of the Services without our prior written consent. We grant you a limited, revocable, non-exclusive, non-transferable license to use the Services for their intended purpose.`,
  },
  {
    id: "third-party",
    title: "9. Third-Party Services & Links",
    content: `The Services rely on and may link to third-party services (for example, sign-in providers, hosting, communications, and notification services). We are not responsible for the content, policies, or practices of any third party. Your use of third-party services is governed by their own terms and privacy policies.`,
  },
  {
    id: "suspension",
    title: "10. Suspension & Termination",
    content: `We may suspend, restrict, or terminate your access to the Services at any time, with or without notice, if we reasonably believe you have violated these Terms or applicable law, created risk or legal exposure, or engaged in fraudulent or harmful conduct. You may stop using the Services and request account deletion at any time. Sections that by their nature should survive termination (including intellectual property, disclaimers, limitation of liability, indemnity, and governing law) will survive.`,
  },
  {
    id: "disclaimers",
    title: "11. Disclaimers",
    content: `The Services are provided on an "as is" and "as available" basis, without warranties of any kind, whether express or implied, including any implied warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, or uninterrupted or error-free operation.

We do not warrant the conduct, identity, or reliability of any User, the accuracy of any listing or profile, or that any Gig, Engagement, or payment will be completed. You use the Services and enter into Engagements at your own risk.`,
  },
  {
    id: "liability",
    title: "12. Limitation of Liability",
    content: `To the maximum extent permitted by law, PartFind and its directors, officers, employees, and agents will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, revenue, data, goodwill, or opportunity, arising out of or relating to your use of the Services or any Engagement, even if advised of the possibility of such damages.

To the maximum extent permitted by law, our total aggregate liability for all claims relating to the Services will not exceed the greater of (a) the total fees you paid to PartFind in the three (3) months preceding the claim, or (b) INR 1,000.`,
  },
  {
    id: "indemnity",
    title: "13. Indemnification",
    content: `You agree to indemnify, defend, and hold harmless PartFind and its affiliates and their respective directors, officers, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or related to: (a) your use of the Services; (b) your User Content; (c) any Engagement you enter into; or (d) your violation of these Terms, applicable law, or the rights of any third party.`,
  },
  {
    id: "governing-law",
    title: "14. Governing Law & Dispute Resolution",
    content: `These Terms are governed by and construed in accordance with the laws of India, without regard to conflict-of-law principles. Subject to any applicable law, the courts at [City], India shall have exclusive jurisdiction over any dispute arising out of or relating to these Terms or the Services.

The parties will first attempt to resolve any dispute amicably through good-faith negotiation. Where permitted, disputes may be referred to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated at [City], India, conducted in English.`,
  },
  {
    id: "grievance",
    title: "15. Grievance Redressal",
    content: `In accordance with the Information Technology Act, 2000 and the rules thereunder, complaints regarding the Services or any content may be directed to our Grievance Officer:

Grievance Officer: [Grievance Officer Name]
Email: official@part-find.org
Address: [Registered Address]

We will acknowledge complaints within 48 hours and endeavour to resolve them within the timelines prescribed under applicable law.`,
  },
  {
    id: "changes",
    title: "16. Changes to These Terms",
    content: `We may modify these Terms from time to time. We will indicate the date of the latest revision in the "Last Updated" notice above and, where changes are material, provide additional notice through the Services. Your continued use of the Services after changes take effect constitutes your acceptance of the revised Terms.`,
  },
  {
    id: "contact",
    title: "17. Contact Us",
    content: `If you have questions about these Terms, please contact us:

PartFind — [Legal Entity Name]
Email: official@part-find.org
Website: https://part-find.org`,
  },
];

export const privacySections: LegalSection[] = [
  {
    id: "introduction",
    title: "1. Introduction & Scope",
    content: `PartFind, operated by [Legal Entity Name] ("PartFind", "we", "us", "our"), respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, store, and safeguard your information when you use the PartFind website, mobile applications, and related services (the "Services").

This Policy is issued in accordance with India's Digital Personal Data Protection Act, 2023 ("DPDP Act"), the Information Technology Act, 2000 and applicable rules. By using the Services, you consent to the practices described here. If you do not agree, please do not use the Services.`,
  },
  {
    id: "controller",
    title: "2. Who We Are (Data Fiduciary)",
    content: `For the purposes of the DPDP Act, PartFind is the "Data Fiduciary" that determines the purpose and means of processing your personal data. Our Grievance Officer's contact details are provided at the end of this Policy. Where we process data on behalf of a Recruiter or other party, we act as a Data Processor for that limited purpose.`,
  },
  {
    id: "information-collection",
    title: "3. Information We Collect",
    content: `We collect the following categories of personal data, depending on how you use the Services:

Identity & profile data: full name, date of birth, gender, profile photographs, and an optional introduction video.

Contact data: email address, phone number, residential address, state, and country.

Physical & suitability data (for eligible event/gig roles): attributes such as height and weight, where you choose to provide them for role matching.

Professional data: skills, education history, work experience, English proficiency level, and completion certificates you earn on the Platform.

Recruiter / business data: company or organization name, organization type, company address, company logo, and business registration identifiers such as GST or PAN.

Account & authentication data: one-time passwords (OTPs), session tokens, and identifiers received when you sign in with third-party providers such as Apple or Google (via Firebase).

Device & technical data: device push-notification tokens, IP address, device and browser information, and activity logs.

Usage data: gigs you post or apply to, applications, ratings and reviews (given and received), saved posts, and attendance/engagement records.

We do not intentionally collect special-category data beyond what you voluntarily provide for role matching. Please do not submit sensitive information that is not required for the Services.`,
  },
  {
    id: "how-collected",
    title: "4. How We Collect Your Data",
    content: `Directly from you: when you register, create or update your profile, post or apply to gigs, submit ratings, or contact us.

Automatically: through your use of the Services, including technical and usage data collected via your device and standard logging.

From third parties: when you choose to sign in using Apple or Google, we receive limited profile information (such as your name, email, and a unique identifier) through Firebase Authentication.`,
  },
  {
    id: "how-we-use",
    title: "5. How We Use Your Information",
    content: `We process your personal data to:

• Create and manage your account and verify your identity (including via OTP and third-party sign-in).
• Provide core marketplace features — matching Workers with Recruiters, listings, applications, ratings, attendance, and certificates.
• Send transactional and service communications (verification codes, application updates, reminders) by email and push notification.
• Maintain safety, prevent fraud and abuse, and enforce our Terms.
• Operate, improve, personalize, and analyze the Services.
• Comply with legal obligations and respond to lawful requests.`,
  },
  {
    id: "legal-basis",
    title: "6. Legal Basis for Processing",
    content: `We process your personal data on the basis of your consent, and for the "legitimate uses" and other lawful bases permitted under the DPDP Act — including where processing is necessary to provide a service you have requested, to comply with law, or to respond to an emergency. You may withdraw your consent at any time (see "Your Rights"), though this may limit your ability to use certain features.`,
  },
  {
    id: "sharing",
    title: "7. How We Share Your Information",
    content: `We do not sell your personal data. We share it only as follows:

With other Users: information necessary to facilitate an Engagement is shared between Workers and Recruiters (for example, a Worker's profile is visible to a Recruiter when the Worker applies). Ratings and reviews are visible to other Users as part of the marketplace.

With service providers (processors): trusted vendors who process data on our behalf under contractual safeguards (see next section).

For legal reasons: to comply with applicable law, court orders, or lawful government requests, or to protect the rights, safety, and property of PartFind, our Users, or the public.

In business transfers: in connection with a merger, acquisition, financing, or sale of assets, subject to appropriate confidentiality protections.`,
  },
  {
    id: "processors",
    title: "8. Third-Party Service Providers",
    content: `We rely on reputable third-party providers to operate the Services, including:

• Amazon Web Services (AWS) — cloud hosting, compute, storage, and email delivery.
• Google Firebase — authentication (including Apple/Google sign-in) and push notifications (Firebase Cloud Messaging).
• Cloudflare — content delivery, performance, and security.
• Managed database and cache providers — for storing application data.

These providers process personal data only as needed to perform services for us and are bound by confidentiality and data-protection obligations.`,
  },
  {
    id: "retention",
    title: "9. Data Retention",
    content: `We retain your personal data for as long as your account is active or as needed to provide the Services, and thereafter only as necessary to comply with legal obligations, resolve disputes, prevent fraud, and enforce our agreements. When data is no longer required, we will delete or anonymize it. Certain records may be retained for longer where required by law.`,
  },
  {
    id: "security",
    title: "10. Data Security",
    content: `We implement reasonable technical and organizational measures to protect your personal data, including encryption in transit, access controls, and secure hosting. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security. If we become aware of a personal data breach, we will notify affected persons and the Data Protection Board of India as required by law.`,
  },
  {
    id: "transfers",
    title: "11. International Data Transfers",
    content: `Your data is primarily processed in India. Some of our service providers may store or process data on servers located outside India. Where such transfers occur, we take steps to ensure your data continues to be protected consistent with this Policy and applicable law.`,
  },
  {
    id: "rights",
    title: "12. Your Rights & Choices",
    content: `Subject to applicable law, you have the right to:

• Access — request a summary of the personal data we hold about you and how it is processed.
• Correction & updating — correct or complete inaccurate or incomplete data.
• Erasure — request deletion of your personal data, subject to legal retention requirements.
• Withdraw consent — withdraw consent for processing at any time.
• Grievance redressal — raise a complaint with our Grievance Officer.
• Nominate — nominate another individual to exercise your rights in the event of death or incapacity.

To exercise any right, contact us at official@part-find.org. You can also update most profile information directly in the app, or request account deletion.`,
  },
  {
    id: "children",
    title: "13. Children's Privacy",
    content: `The Services are intended for users aged 18 and above. We do not knowingly collect personal data from children. If we learn that we have collected personal data from a child without appropriate consent, we will delete it promptly.`,
  },
  {
    id: "cookies",
    title: "14. Cookies & Similar Technologies",
    content: `Our website uses cookies and similar technologies to keep you signed in, remember preferences, and understand how the Services are used. You can control cookies through your browser settings; disabling some cookies may affect functionality.`,
  },
  {
    id: "communications",
    title: "15. Communications & Notifications",
    content: `We send you transactional messages (such as verification codes and application updates) that are necessary to provide the Services. We may also send re-engagement or informational notifications by email or push. You can opt out of non-essential notifications through your device settings or by contacting us; you cannot opt out of essential transactional messages while your account is active.`,
  },
  {
    id: "grievance",
    title: "16. Grievance Officer & Contact",
    content: `If you have questions or complaints about this Policy or your personal data, contact our Grievance Officer:

Grievance Officer: [Grievance Officer Name]
Email: official@part-find.org
Address: [Registered Address]

We will acknowledge your request within 48 hours and resolve it within the timelines required by applicable law.`,
  },
  {
    id: "changes",
    title: "17. Changes to This Policy",
    content: `We may update this Privacy Policy from time to time. The "Last Updated" date above reflects the most recent revision. Where changes are material, we will provide additional notice through the Services. Your continued use after changes take effect constitutes acceptance of the updated Policy.`,
  },
];
