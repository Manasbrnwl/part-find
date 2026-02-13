/**
 * Mock email notification service for Cloudflare Workers
 */
export const sendEmailNotification = async (
    to: string,
    subject: string,
    text: string,
    html: string
) => {
    console.log(`[Worker Mock] Sending email to ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${text}`);
    // In production, use SendGrid/Resend/Mailchannels via fetch()
    return true;
};
