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
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          ciphers: "SSLv3",
          rejectUnauthorized: false,
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

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error: any) {
    logger.error("Email send error", { error: error.message });
    return false;
  }
};

exports.transporter = transporter;

