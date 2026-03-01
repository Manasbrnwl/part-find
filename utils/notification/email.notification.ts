/**
 * Send email notification mock
 * @param {string} email - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Email text content
 * @param {string} html - Email html content
 * @returns {Promise} - Promise resolved on email sent
 */
export const sendEmailNotification = async (
  email: string,
  subject: string,
  text: string,
  html: string
) => {
  try {
    console.log(`[Email Mock] Sending email to ${email}`);
    console.log(`[Email Mock] Subject: ${subject}`);
    // Replace this with standard \`fetch\` to Resend/SendGrid/etc on Edge
    return true;
  } catch (error: any) {
    console.error("Email error:", error.message);
    return false;
  }
};
