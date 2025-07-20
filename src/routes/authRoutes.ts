import {PrismaClient} from '@prisma/client';
import express from 'express';
const app = express();
const prisma = new PrismaClient();

app.get("/get_users", async (req,res)=>{
    const data = await prisma.user.findMany()
    res.json({message: "All data fetched succesfully", data})
})