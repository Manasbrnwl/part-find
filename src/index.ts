import {PrismaClient} from '@prisma/client';
import express from 'express';
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (_req, res) => {
  res.send('Hello, TypeScript with Node.js!');
});

app.use("/user", async (req,res)=>{
    const data = await prisma.user.findMany()
    res.json({message: "All data fetched succesfully", data})
})

app.listen(PORT, () => {
  console.log(`Server is running on PORT`);
});
