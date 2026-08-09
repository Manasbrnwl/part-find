/**
 * Branded HTML email templates for Part Find.
 *
 * Design notes:
 *  - Table-based, inline-styled markup for maximum email-client compatibility.
 *  - The brand logo is embedded inline and referenced via its Content-ID
 *    (cid:partfind-logo); the attachment is added by the send layer.
 *  - Palette is derived from the logo: teal primary + orange accent.
 */

import { PARTFIND_LOGO_CID } from "./logoAsset";

const BRAND_NAME = "Part Find";

// Palette sampled from the brand logo
const TEAL = "#1F8F86";        // primary (headings, links, OTP digits)
const TEAL_DARK = "#136F68";   // deeper teal for strong emphasis
const TEAL_TINT = "#EAF6F4";   // soft teal wash for highlight panels
const ORANGE = "#F07400";      // accent (buttons, highlights)
const INK = "#1f2933";         // primary body text
const MUTED = "#6b7280";       // secondary text
const FAINT = "#9ca3af";       // footer / fine print
const HAIRLINE = "#e5e7eb";    // dividers / borders
const PAGE_BG = "#f4f5f7";     // outer canvas

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "official@part-find.org";

/**
 * Shared shell: outer canvas, brand accent bar, logo header, body slot, footer.
 * @param content   inner HTML for the body region
 * @param preheader hidden inbox-preview text (shown by clients before opening)
 */
function baseLayout(content: string, preheader = ""): string {
    return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${BRAND_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};-webkit-font-smoothing:antialiased;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${PAGE_BG};">
        <tr>
            <td align="center" style="padding:32px 16px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${HAIRLINE};box-shadow:0 4px 14px rgba(16,24,40,0.06);">
                    <!-- Brand accent bar (teal + orange) -->
                    <tr>
                        <td style="padding:0;font-size:0;line-height:0;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td width="70%" height="4" style="background-color:${TEAL};font-size:0;line-height:0;">&nbsp;</td>
                                    <td width="30%" height="4" style="background-color:${ORANGE};font-size:0;line-height:0;">&nbsp;</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Logo header -->
                    <tr>
                        <td align="center" style="padding:28px 32px 8px;">
                            <img src="cid:${PARTFIND_LOGO_CID}" alt="${BRAND_NAME}" width="188" style="display:block;width:188px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none;">
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding:16px 40px 8px;">
                            ${content}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding:24px 40px 32px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr><td style="border-top:1px solid ${HAIRLINE};font-size:0;line-height:0;padding-top:20px;">&nbsp;</td></tr>
                            </table>
                            <p style="margin:0 0 6px;color:${MUTED};font-size:13px;line-height:1.6;text-align:center;">
                                Need help? Reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${TEAL};text-decoration:none;font-weight:600;">${SUPPORT_EMAIL}</a>
                            </p>
                            <p style="margin:0;color:${FAINT};font-size:12px;line-height:1.6;text-align:center;">
                                &copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.<br/>
                                This is an automated message — please do not reply to this email.
                            </p>
                        </td>
                    </tr>
                </table>
                <p style="margin:16px 0 0;color:${FAINT};font-size:11px;line-height:1.5;text-align:center;max-width:600px;">
                    You received this email because you have an account with ${BRAND_NAME}.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>`.trim();
}

/** Escape user-supplied values before interpolating into email HTML. */
function esc(value: string): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** Shared heading style for template bodies. */
function heading(text: string, color: string = INK): string {
    return `<h1 style="margin:0 0 14px;color:${color};font-size:20px;font-weight:700;line-height:1.35;text-align:center;">${text}</h1>`;
}

/**
 * OTP verification email template
 */
export function otpEmailTemplate(otp: string, expiryMinutes: number): { subject: string; text: string; html: string } {
    const subject = `Your ${BRAND_NAME} verification code`;

    const text = `Your ${BRAND_NAME} verification code is ${otp}. It expires in ${expiryMinutes} minutes. If you did not request this code, you can safely ignore this email.`;

    const html = baseLayout(`
        ${heading("Verify your email")}
        <p style="margin:0 0 20px;color:${MUTED};font-size:15px;line-height:1.6;text-align:center;">
            Use the verification code below to continue. It keeps your account secure.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
                <td align="center">
                    <div style="display:inline-block;background-color:${TEAL_TINT};border:1px solid ${TEAL};border-radius:12px;padding:20px 32px;">
                        <div style="font-size:38px;font-weight:700;letter-spacing:10px;color:${TEAL_DARK};font-family:'Courier New',Consolas,monospace;">${esc(otp)}</div>
                    </div>
                </td>
            </tr>
        </table>
        <p style="margin:20px 0 0;color:${MUTED};font-size:13px;line-height:1.6;text-align:center;">
            This code expires in <strong style="color:${INK};">${expiryMinutes} minutes</strong>.
        </p>
        <p style="margin:16px 0 0;color:${FAINT};font-size:12px;line-height:1.6;text-align:center;">
            Didn't request this? You can safely ignore this email — someone may have entered your address by mistake.
        </p>
    `, `Your ${BRAND_NAME} code is ${otp} (expires in ${expiryMinutes} min)`);

    return { subject, text, html };
}

/**
 * Low rating warning email template
 */
export function lowRatingWarningTemplate(userName: string): { subject: string; text: string; html: string } {
    const subject = `Important: a note about your recent ratings on ${BRAND_NAME}`;
    const name = esc(userName);

    const text = `Hi ${userName}, we've noticed you've received several 1-star ratings recently. Please review our community guidelines and aim to provide the best service possible to maintain your profile's standing.`;

    const html = baseLayout(`
        ${heading("A note about your ratings", "#b91c1c")}
        <p style="margin:0 0 16px;color:${INK};font-size:15px;line-height:1.6;">Hi ${name},</p>
        <p style="margin:0 0 16px;color:${INK};font-size:15px;line-height:1.6;">
            We've noticed that you've received <strong>more than five 1-star ratings</strong> within the past month.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
            <tr>
                <td style="background-color:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;padding:16px 18px;">
                    <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;">
                        Multiple low ratings can reduce your visibility on the platform and may lead to account review or suspension.
                    </p>
                </td>
            </tr>
        </table>
        <p style="margin:0;color:${INK};font-size:15px;line-height:1.6;">
            We encourage you to review our community guidelines and keep clear communication with recruiters to improve future ratings.
        </p>
    `, `A note about your recent ratings on ${BRAND_NAME}`);

    return { subject, text, html };
}

/**
 * Absent from event warning email template
 */
export function absentWarningTemplate(userName: string, postTitle: string): { subject: string; text: string; html: string } {
    const subject = `Important: your absence from "${postTitle}"`;
    const name = esc(userName);
    const title = esc(postTitle);

    const text = `Hi ${userName}, you were marked as not present for the event "${postTitle}" despite your application being accepted. Reliability is a core value of ${BRAND_NAME}, and being absent without notice can affect your profile's standing.`;

    const html = baseLayout(`
        ${heading("Attendance notice", "#b91c1c")}
        <p style="margin:0 0 16px;color:${INK};font-size:15px;line-height:1.6;">Hi ${name},</p>
        <p style="margin:0 0 16px;color:${INK};font-size:15px;line-height:1.6;">
            You were marked as <strong>Not Present</strong> for the event: <strong>"${title}"</strong>.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
            <tr>
                <td style="background-color:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;padding:16px 18px;">
                    <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;">
                        Not showing up for an event you were accepted for is a violation of our community standards and impacts the recruiter's ability to run their event smoothly.
                    </p>
                </td>
            </tr>
        </table>
        <p style="margin:0;color:${INK};font-size:15px;line-height:1.6;">
            Repeated no-show incidents will lead to account restrictions or permanent suspension from the platform.
        </p>
    `, `You were marked absent from "${postTitle}"`);

    return { subject, text, html };
}

/**
 * Generate the certificate HTML (reused for email body and PDF rendering)
 */
export function generateCertificateHtml(userName: string, postTitle: string, rating: number, recruiterName: string, issuedAt: Date): string {
    const dateStr = issuedAt.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
    const stars = "⭐".repeat(rating);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Certificate of Completion</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f5f0e8; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: 'EB Garamond', Georgia, serif; }
    .certificate { width: 800px; min-height: 560px; background: #fffdf6; border: 12px double #b59a4a; padding: 48px 64px; position: relative; text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,0.18); }
    .corner { position: absolute; width: 48px; height: 48px; border-color: #c9a84c; border-style: solid; }
    .corner.tl { top: 12px; left: 12px; border-width: 3px 0 0 3px; }
    .corner.tr { top: 12px; right: 12px; border-width: 3px 3px 0 0; }
    .corner.bl { bottom: 12px; left: 12px; border-width: 0 0 3px 3px; }
    .corner.br { bottom: 12px; right: 12px; border-width: 0 3px 3px 0; }
    .brand { font-family: 'Cinzel', serif; font-size: 13px; letter-spacing: 4px; color: #b59a4a; text-transform: uppercase; margin-bottom: 20px; }
    h1 { font-family: 'Cinzel', serif; font-size: 36px; color: #2d2200; letter-spacing: 2px; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: #888; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 32px; }
    .divider { width: 120px; height: 2px; background: linear-gradient(90deg, transparent, #b59a4a, transparent); margin: 0 auto 24px; }
    .certify-text { font-size: 16px; color: #555; margin-bottom: 16px; font-style: italic; }
    .recipient { font-family: 'Cinzel', serif; font-size: 32px; color: #1a3a2a; margin-bottom: 24px; border-bottom: 1px solid #c9a84c; display: inline-block; padding-bottom: 4px; }
    .details { font-size: 16px; color: #444; margin-bottom: 8px; line-height: 1.8; }
    .rating { font-size: 22px; margin: 16px 0 24px; }
    .footer-grid { display: flex; justify-content: space-between; margin-top: 40px; align-items: flex-end; }
    .footer-item { text-align: center; }
    .footer-label { font-size: 12px; color: #aaa; letter-spacing: 2px; text-transform: uppercase; border-top: 1px solid #c9a84c; padding-top: 6px; margin-top: 8px; width: 160px; }
    .seal { width: 80px; height: 80px; border: 3px solid #b59a4a; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; font-size: 28px; color: #b59a4a; }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="corner tl"></div><div class="corner tr"></div>
    <div class="corner bl"></div><div class="corner br"></div>
    <div class="brand">Part Find</div>
    <h1>Certificate of Completion</h1>
    <div class="subtitle">Official Recognition</div>
    <div class="divider"></div>
    <div class="certify-text">This is to certify that</div>
    <div class="recipient">${esc(userName)}</div>
    <div class="details">has successfully completed the role for</div>
    <div class="details"><strong>${esc(postTitle)}</strong></div>
    <div class="rating">${stars}</div>
    <div class="details">as rated by <strong>${esc(recruiterName)}</strong></div>
    <div class="footer-grid">
      <div class="footer-item"><div style="font-size:14px;color:#666;">${dateStr}</div><div class="footer-label">Date of Issue</div></div>
      <div class="seal">✦</div>
      <div class="footer-item"><div style="font-size:14px;color:#666;">Part Find</div><div class="footer-label">Authorized By</div></div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Inactive-user re-engagement email template.
 * Copy adapts to the recipient's role (job-seeker vs recruiter).
 */
export function inactiveReminderTemplate(userName: string | null, role: string | null): { subject: string; text: string; html: string } {
    const isRecruiter = String(role).toUpperCase() === "RECRUITER";
    const greetName = userName && userName.trim() ? esc(userName.trim()) : "there";
    const appUrl = process.env.APP_URL || "https://part-find.org";

    const headline = isRecruiter ? "Your next hire is a tap away" : "New gigs are waiting for you";
    const lead = isRecruiter
        ? "It's been a while! Talented people are ready to work — post a gig and start receiving applications today."
        : "It's been a while! Fresh opportunities have gone live since your last visit. Jump back in and find your next gig.";
    const ctaLabel = isRecruiter ? "Post a gig" : "Browse gigs";

    const subject = isRecruiter
        ? `${greetName === "there" ? "" : userName + ", "}your next hire is waiting on ${BRAND_NAME}`
        : `${greetName === "there" ? "" : userName + ", "}new gigs are waiting on ${BRAND_NAME}`;

    const text = `Hi ${userName || "there"}, it's been a while since we saw you on ${BRAND_NAME}. ${isRecruiter ? "Post a gig and start receiving applications" : "New opportunities are live — come find your next gig"}. Open the app: ${appUrl}`;

    const html = baseLayout(`
        ${heading(headline, TEAL_DARK)}
        <p style="margin:0 0 16px;color:${INK};font-size:15px;line-height:1.6;">Hi ${greetName},</p>
        <p style="margin:0 0 24px;color:${INK};font-size:15px;line-height:1.6;">${lead}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
                <td align="center">
                    <a href="${esc(appUrl)}" style="display:inline-block;background-color:${TEAL};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 30px;border-radius:10px;">${ctaLabel}</a>
                </td>
            </tr>
        </table>
        <p style="margin:24px 0 0;color:${MUTED};font-size:13px;line-height:1.6;text-align:center;">
            We're glad to have you in the ${BRAND_NAME} community. See you soon!
        </p>
    `, isRecruiter ? `Talented people are ready to work on ${BRAND_NAME}` : `New gigs are live on ${BRAND_NAME} — come take a look`);

    return { subject, text, html };
}

/**
 * Completion certificate email template
 */
export function completionCertificateTemplate(userName: string, postTitle: string, rating: number, recruiterName: string, issuedAt: Date): { subject: string; text: string; html: string } {
    const subject = `🏆 Your Certificate of Completion for "${postTitle}"`;
    const dateStr = issuedAt.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
    const name = esc(userName);
    const title = esc(postTitle);
    const recruiter = esc(recruiterName);
    const stars = "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));

    const text = `Congratulations ${userName}! You received a ${rating}-star rating from ${recruiterName} for "${postTitle}". Your Certificate of Completion is attached as a PDF.`;

    const html = baseLayout(`
        ${heading(`Congratulations, ${name}! 🎉`, TEAL_DARK)}
        <p style="margin:0 0 16px;color:${INK};font-size:15px;line-height:1.6;text-align:center;">
            You've earned a Certificate of Completion for your work on:
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
            <tr>
                <td align="center" style="background-color:${TEAL_TINT};border-radius:10px;padding:20px 24px;">
                    <div style="color:${TEAL_DARK};font-size:17px;font-weight:700;line-height:1.4;">${title}</div>
                    <div style="color:${ORANGE};font-size:20px;letter-spacing:3px;margin-top:8px;">${stars}</div>
                    <div style="color:${MUTED};font-size:13px;margin-top:6px;">rated by ${recruiter}</div>
                </td>
            </tr>
        </table>
        <p style="margin:20px 0 0;color:${INK};font-size:15px;line-height:1.6;text-align:center;">
            Your certificate is attached as a <strong>PDF</strong>. You can also download it anytime from the ${BRAND_NAME} app.
        </p>
        <p style="margin:14px 0 0;color:${FAINT};font-size:12px;text-align:center;">Issued on ${dateStr}</p>
    `, `Your Certificate of Completion for "${postTitle}" is ready`);

    return { subject, text, html };
}
