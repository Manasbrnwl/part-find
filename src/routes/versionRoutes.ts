import express from "express";
import { getAppVersion } from "../controller/versionController";

const router = express.Router();

router.get("/", getAppVersion);

export default router;
