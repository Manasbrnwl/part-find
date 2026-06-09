import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { logger } from "../logger";

dotenv.config();

// Define the transporter object with the Gmail SMTP settings

const transporter = nodemailer.createTransport(
  process.env.EMAIL_HOST
    ? {
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: process.env.EMAIL_SECURE === "true",
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      logger: true,
      debug: true,
      tls: {
        minVersion: "TLSv1.2",
      },
    }
    : {
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    }
);

// Save the original sendMail function
const originalSendMail = transporter.sendMail.bind(transporter);

// Wrap sendMail with auto-retry functionality
// @ts-ignore
transporter.sendMail = function (
  mailOptions: any,
  callback?: (err: Error | null, info: any) => void
): Promise<any> | void {
  const maxRetries = 3;
  let attempt = 0;
  let delay = 1000;

  const executeSend = async (): Promise<any> => {
    while (true) {
      try {
        return await originalSendMail(mailOptions);
      } catch (error: any) {
        attempt++;
        logger.warn(`Email send attempt ${attempt} failed: ${error.message || error}.`);
        if (attempt >= maxRetries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
      }
    }
  };

  if (callback) {
    executeSend()
      .then((info) => callback(null, info))
      .catch((err) => callback(err, null));
    return;
  }

  return executeSend();
};

/**
 * Send email notification
 * @param {string} email - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Email text content
 * @param {string} html - Email html content
 * @returns {Promise} - Promise resolved on email sent
 */
exports.sendEmailNotification = async (
  email: string,
  subject: string,
  text: string,
  html: string
) => {
  try {
    const mailOptions = {
      from: `"Part Find" <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      text,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(info);
    return true;
  } catch (error: any) {
    logger.error("Email send error", { error: error.message });
    console.error("ERROR:", error);
    console.error("CODE:", error.code);
    console.error("COMMAND:", error.command);
    console.error("RESPONSE:", error.response);
    console.error("STACK:", error.stack);
    return false;
  }
};

exports.transporter = transporter;

