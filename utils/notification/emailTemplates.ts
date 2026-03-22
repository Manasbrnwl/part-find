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
