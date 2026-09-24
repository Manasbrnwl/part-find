import express from "express";
import postRoutesV2 from "./postRoutes";

/**
 * API v2.
 *
 * Only the endpoints that actually changed shape live here; everything else
 * stays on v1, which is frozen for the app builds already in the wild. A v2
 * endpoint is added when a response would otherwise break older clients.
 */
const router = express.Router();

router.use("/post", postRoutesV2);

export default router;
