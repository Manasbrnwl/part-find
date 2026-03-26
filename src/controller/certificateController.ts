import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { asyncHandler, handleNotFoundError, handleForbiddenError } from "../utils/errorHandler";
import { generateCertificateHtml } from "../../utils/notification/emailTemplates";

const prisma = new PrismaClient();

/**
 * GET /certificate/my-certificates
 * Returns all certificates earned by the authenticated user.
 */
export const getUserCertificates = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId as string;

    const certificates = await prisma.certificate.findMany({
        where: { userId },
        include: {
            post: { select: { id: true, title: true, startDate: true, endDate: true } },
            recruiter: { select: { id: true, name: true, recruiter_company_name: true } },
        },
        orderBy: { issuedAt: "desc" },
    });

    res.status(200).json({
        success: true,
        message: "Certificates fetched successfully",
        data: certificates,
    });
});

/**
 * GET /certificate/download/:id
 * Streams a PDF certificate for the given certificate ID.
 */
export const downloadCertificate = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId as string;
    const certId = req.params.id as string;

    const certificate = await prisma.certificate.findUnique({
        where: { id: certId },
        include: {
            post: { select: { title: true } },
            recruiter: { select: { name: true } },
            user: { select: { name: true } },
        },
    });

    if (!certificate) {
        throw handleNotFoundError("Certificate");
    }

    // Users can only download their own certificates
    if (certificate.userId !== userId) {
        throw handleForbiddenError("You do not have access to this certificate");
    }

    const html = generateCertificateHtml(
        certificate.user.name || "User",
        certificate.post.title,
        certificate.rating,
        certificate.recruiter.name || "Recruiter",
        certificate.issuedAt
    );

    const htmlPdfNode = require("html-pdf-node");
    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
        htmlPdfNode.generatePdf(
            { content: html },
            { format: "A4", landscape: true, printBackground: true },
            (err: Error | null, buffer: Buffer) => {
                if (err) reject(err);
                else resolve(buffer);
            }
        );
    });

    const filename = `certificate-${certificate.post.title.slice(0, 30).replace(/\s+/g, "-")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
});
