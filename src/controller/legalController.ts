import { Request, Response } from "express";
import { termsSections, privacySections, LEGAL_LAST_UPDATED } from "../data/legalContent";

/**
 * GET /api/v1/legal/terms-conditions
 * Returns the Terms & Conditions content as structured JSON.
 */
export const getTerms = (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      type: "terms-conditions",
      title: "Terms & Conditions",
      lastUpdated: LEGAL_LAST_UPDATED,
      sections: termsSections,
    },
  });
};

/**
 * GET /api/v1/legal/privacy-policy
 * Returns the Privacy Policy content as structured JSON.
 */
export const getPrivacy = (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      type: "privacy-policy",
      title: "Privacy Policy",
      lastUpdated: LEGAL_LAST_UPDATED,
      sections: privacySections,
    },
  });
};

/**
 * GET /api/v1/legal
 * Returns both documents in a single response.
 */
export const getLegal = (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      lastUpdated: LEGAL_LAST_UPDATED,
      terms: { title: "Terms & Conditions", sections: termsSections },
      privacy: { title: "Privacy Policy", sections: privacySections },
    },
  });
};
