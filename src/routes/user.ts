import { PrismaClient } from "@prisma/client";
import express from "express";
const router = express.Router();
const prisma = new PrismaClient();

router.get("/get_users", async (req, res) => {
  const data = await prisma.user.findMany();
  res.json({ message: "All data fetched succesfully", data });
});

module.exports = router;
