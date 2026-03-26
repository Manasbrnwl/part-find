/**
 * Branded HTML email templates for Part Find
 */

const BRAND_COLOR = "#4F46E5";
const BRAND_NAME = "Part Find";

function baseLayout(content: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${BRAND_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f7;padding:40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,${BRAND_COLOR},#7C3AED);padding:28px 32px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${BRAND_NAME}</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding:32px;">
                            ${content}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
                            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                                &copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.<br/>
                                This is an automated message. Please do not reply.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`.trim();
}

/**
 * OTP verification email template
 */
export function otpEmailTemplate(otp: string, expiryMinutes: number): { subject: string; text: string; html: string } {
    const subject = `${BRAND_NAME} - Your Verification Code`;

    const text = `Your ${BRAND_NAME} verification code is: ${otp}. It will expire in ${expiryMinutes} minutes. If you did not request this code, please ignore this email.`;

    const html = baseLayout(`
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Hi there! Use the code below to verify your identity.
        </p>
        <div style="background-color:#f3f4f6;border-radius:10px;padding:24px;text-align:center;margin:20px 0;">
            <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:${BRAND_COLOR};font-family:'Courier New',monospace;">
                ${otp}
            </span>
        </div>
        <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.6;text-align:center;">
            This code expires in <strong>${expiryMinutes} minutes</strong>.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
        <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
            If you didn't request this code, you can safely ignore this email. Someone may have entered your email by mistake.
        </p>
    `);

    return { subject, text, html };
}

/**
 * Low rating warning email template
 */
export function lowRatingWarningTemplate(userName: string): { subject: string; text: string; html: string } {
    const subject = `⚠️ Important: Warning Regarding Your Recent Ratings on ${BRAND_NAME}`;

    const text = `Hi ${userName}, we've noticed you've received several 1-star ratings recently. Please ensure you follow our community guidelines and provide the best service possible to maintain your profile's standing.`;

    const html = baseLayout(`
        <h2 style="margin:0 0 16px;color:#dc2626;font-size:18px;font-weight:700;">Account Warning</h2>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Hi ${userName},
        </p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            We have noticed that you have received <strong>more than five 1-star ratings</strong> within the past month.
        </p>
        <div style="background-color:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:20px 0;">
            <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.5;">
                Multiple low ratings can affect your visibility on the platform and may lead to account review or suspension.
            </p>
        </div>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            We encourage you to review our community guidelines and ensure clear communication with recruiters to improve your future ratings.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
        <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;text-align:center;">
            If you have questions about these ratings, please contact our support team.
        </p>
    `);

    return { subject, text, html };
}

/**
 * Absent from event warning email template
 */
export function absentWarningTemplate(userName: string, postTitle: string): { subject: string; text: string; html: string } {
    const subject = `⚠️ Important: Warning Regarding Your Absence from "${postTitle}"`;

    const text = `Hi ${userName}, you were marked as not present for the event "${postTitle}" despite your application being accepted. Reliability is a core value of ${BRAND_NAME}, and being absent without notice can affect your profile's standing.`;

    const html = baseLayout(`
        <h2 style="margin:0 0 16px;color:#dc2626;font-size:18px;font-weight:700;">Attendance Warning</h2>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Hi ${userName},
        </p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            You were marked as <strong>Not Present</strong> for the event: <strong>"${postTitle}"</strong>.
        </p>
        <div style="background-color:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:20px 0;">
            <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.5;">
                Failing to show up for an event you were accepted for is a violation of our community standards and impacts the recruiter's ability to run their event smoothly.
            </p>
        </div>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Multiple no-show incidents will lead to account restrictions or permanent suspension from the platform.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
        <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;text-align:center;">
            If there was a mistake or an emergency, please contact the recruiter or our support team immediately.
        </p>
    `);

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
    <div class="brand">Part Find Platform</div>
    <h1>Certificate of Completion</h1>
    <div class="subtitle">Official Recognition</div>
    <div class="divider"></div>
    <div class="certify-text">This is to certify that</div>
    <div class="recipient">${userName}</div>
    <div class="details">has successfully completed the role for</div>
    <div class="details"><strong>${postTitle}</strong></div>
    <div class="rating">${stars}</div>
    <div class="details">as rated by <strong>${recruiterName}</strong></div>
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
 * Completion certificate email template
 */
export function completionCertificateTemplate(userName: string, postTitle: string, rating: number, recruiterName: string, issuedAt: Date): { subject: string; text: string; html: string } {
    const subject = `🏆 Your Certificate of Completion for "${postTitle}"`;
    const dateStr = issuedAt.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

    const text = `Congratulations ${userName}! You received a ${rating}-star rating from ${recruiterName} for "${postTitle}". Your certificate is attached.`;

    const html = baseLayout(`
        <h2 style="margin:0 0 16px;color:#059669;font-size:18px;font-weight:700;">🏆 Congratulations, ${userName}!</h2>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            You've received a <strong>${rating}-star rating</strong> from <strong>${recruiterName}</strong> for:
        </p>
        <div style="background:#f0fdf4;border-left:4px solid #059669;padding:16px;margin:20px 0;">
            <p style="margin:0;color:#065f46;font-size:16px;font-weight:600;">${postTitle}</p>
        </div>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Your <strong>Certificate of Completion</strong> is attached as a PDF. You can also download it anytime from the Part Find app.
        </p>
        <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Issued on ${dateStr}</p>
    `);

    return { subject, text, html };
}
