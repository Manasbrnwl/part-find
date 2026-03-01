/**
 * Send email notification using Resend HTTP API
 * @param {any} env - Cloudflare environment variables
 * @param {string} email - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Email text content
 * @param {string} html - Email html content
 * @returns {Promise} - Promise resolved on email sent
 */
export const sendEmailNotification = async (
  env: any,
  email: string,
  subject: string,
  text: string,
  html: string
) => {
  try {
    const apiKey = env?.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("[Email WARNING] Missing RESEND_API_KEY. Email not sent.");
      return false;
    }

    // Default sender or from env
    const sender = env?.EMAIL_USER || "onboarding@resend.dev";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `Part Find <${sender}>`,
        to: [email],
        subject: subject,
        text: text,
        html: html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Email Error] Resend API responded with ${response.status}:`, errorText);
      return false;
    }

    return true;
  } catch (error: any) {
    console.error(`[Email Exception] Failed to send email to ${email}:`, error.message);
    return false;
  }
};
