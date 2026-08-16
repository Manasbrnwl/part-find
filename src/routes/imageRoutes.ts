import { Router, Request, Response } from "express";
import { getImage } from "../lib/storage";
import { asyncHandler } from "../utils/errorHandler";

const router = Router();

/**
 * Public image proxy. Replaces the old express.static mounts — streams the file
 * from S3 (or local disk in fallback mode). Files are compressed JPEGs stored
 * under unguessable generated filenames.
 */
async function serve(category: string, filename: string, res: Response) {
  const img = await getImage(category, filename);
  if (!img) {
    res.status(404).json({ success: false, message: "Image not found" });
    return;
  }
  res.setHeader("Content-Type", img.contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  img.stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  img.stream.pipe(res);
}

router.get(
  "/profile/:filename",
  asyncHandler(async (req: Request, res: Response) => {
    await serve("profile", String(req.params.filename || ""), res);
  })
);

router.get(
  "/recruiter/:filename",
  asyncHandler(async (req: Request, res: Response) => {
    await serve("recruiter", String(req.params.filename || ""), res);
  })
);

export default router;
