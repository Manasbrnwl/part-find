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
