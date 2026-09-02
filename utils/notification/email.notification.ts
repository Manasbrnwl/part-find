import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { logger } from "../logger";
import { logoAttachment } from "./logoAsset";

dotenv.config();

/** Build an SMTP transporter for a given mailbox (host settings come from env). */
function makeTransport(user?: string, pass?: string) {
  return nodemailer.createTransport(
    process.env.EMAIL_HOST
      ? {
          host: process.env.EMAIL_HOST,
          port: parseInt(process.env.EMAIL_PORT || "587"),
          secure: process.env.EMAIL_SECURE === "true",
          requireTLS: true,
          auth: { user, pass },
          logger: true,
          debug: true,
          tls: { minVersion: "TLSv1.2" },
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 15000,
        }
      : {
          service: "gmail",
          auth: { user, pass },
        }
  );
}

// Primary sending account.
const PRIMARY_USER = process.env.EMAIL_USER;
const PRIMARY_PASS = process.env.EMAIL_PASS;
// Optional fallback account — used automatically if the primary send fails
// (e.g. one mailbox's SMTP auth gets rejected or rate-limited). Set
// EMAIL_FALLBACK_USER + EMAIL_FALLBACK_PASS in the env to enable it.
const FALLBACK_USER = process.env.EMAIL_FALLBACK_USER;
const FALLBACK_PASS = process.env.EMAIL_FALLBACK_PASS;

const primary = makeTransport(PRIMARY_USER, PRIMARY_PASS);
const fallback =
  FALLBACK_USER && FALLBACK_PASS ? makeTransport(FALLBACK_USER, FALLBACK_PASS) : null;

if (fallback) {
  logger.info(`Email: primary ${PRIMARY_USER}, fallback ${FALLBACK_USER} (auto-failover on)`);
} else {
  logger.info(`Email: single account ${PRIMARY_USER} (no fallback configured)`);
}

const primarySend = primary.sendMail.bind(primary);
const fallbackSend = fallback ? fallback.sendMail.bind(fallback) : null;

/**
 * Send via one account with a couple of retries. The From header is forced to
 * match the authenticated mailbox — GoDaddy rejects a mismatched sender.
 */
async function sendVia(
  rawSend: (opts: any) => Promise<any>,
  fromUser: string | undefined,
  mailOptions: any,
  maxRetries = 2
): Promise<any> {
  const opts = { ...mailOptions, from: `"Part Find" <${fromUser}>` };
  let attempt = 0;
  let delay = 1000;
  while (true) {
    try {
      return await rawSend(opts);
    } catch (error: any) {
      attempt++;
      logger.warn(`Email via ${fromUser} attempt ${attempt} failed: ${error.message || error}`);
      if (attempt >= maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

// Exported transporter keeps the same interface, but its sendMail now tries the
// primary account and automatically fails over to the fallback account.
const transporter: any = primary;
transporter.sendMail = function (
  mailOptions: any,
  callback?: (err: Error | null, info: any) => void
): Promise<any> | void {
  const run = async (): Promise<any> => {
    try {
      return await sendVia(primarySend, PRIMARY_USER, mailOptions);
    } catch (primaryErr: any) {
      if (fallbackSend) {
        logger.warn(
          `Primary mail account (${PRIMARY_USER}) failed — failing over to ${FALLBACK_USER}: ${primaryErr.message}`
        );
        const info = await sendVia(fallbackSend, FALLBACK_USER, mailOptions);
        logger.info(`Email delivered via fallback account ${FALLBACK_USER}`);
        return info;
      }
      throw primaryErr;
    }
  };

  if (callback) {
    run().then((info) => callback(null, info)).catch((err) => callback(err, null));
    return;
  }
  return run();
};

/**
 * Send an email notification. Returns true on success (via either the primary
 * or the fallback account), false if every account failed.
 */
exports.sendEmailNotification = async (
  email: string,
  subject: string,
  text: string,
  html: string
): Promise<boolean> => {
  try {
    await transporter.sendMail({
      to: email,
      subject,
      text,
      html,
      attachments: [logoAttachment()], // inline brand logo (cid:partfind-logo)
    });
    return true;
  } catch (error: any) {
    logger.error("Email send failed on all configured accounts", {
      error: error.message,
      code: error.code,
      response: error.response,
    });
    return false;
  }
};

exports.transporter = transporter;
