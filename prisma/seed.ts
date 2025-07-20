import {PrismaClient} from '@prisma/client'

const prisma = new PrismaClient();

async function seed(){
    await prisma.user.createMany({
        data:[{
            name:"Manas",
            email:"manas@mailinator.com",
            phone_number:"7275343674",
            password:"12345"
        },{
            name:"Dhruv",
            email:"dhruv@mailinator.com",
            phone_number:"7275343675",
            password:"12345"
        },{
            name:"Tarun",
            email:"tarun@mailinator.com",
            phone_number:"7275343676",
            password:"12345"
        }]
    })
}

seed().then(()=> prisma.$disconnect())