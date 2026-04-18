import { Request, Response } from "express";
import nodemailer from "nodemailer";
import { logger } from "../../utils/logger";

/**
 * Handle business enquiry submission
 * POST /api/v1/enquiries
 */
export const createEnquiry = async (req: Request, res: Response) => {
  try {
    const { name, email, message } = req.body;

    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide name, email, and message." 
      });
    }

    // Configure transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Part-find Enquiry" <${process.env.EMAIL_USER}>`,
      to: "official@part-find.org",
      replyTo: email,
      subject: `New Business Enquiry from ${name}`,
      text: `
        New enquiry received:
        
        Name: ${name}
        Email: ${email}
        
        Message:
        ${message}
      `,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">New Business Enquiry</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <hr />
          <p><strong>Message:</strong></p>
          <div style="background: #f9f9f9; padding: 15px; border-radius: 4px;">
            ${message.replace(/\n/g, '<br />')}
          </div>
        </div>
      `,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    logger.info(`Enquiry email sent from ${email} to official@part-find.org`);

    return res.status(200).json({
      success: true,
      message: "Enquiry sent successfully. We will get back to you soon.",
    });
  } catch (error: any) {
    logger.error("Failed to send enquiry email", { error: error.message });
    return res.status(500).json({
      success: false,
      message: "Failed to send enquiry. Please try again later.",
    });
  }
};
