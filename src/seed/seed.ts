// import { PrismaClient } from "@prisma/client";

// const prisma = new PrismaClient();

// async function seed() {
//   try {
//     await prisma.user.createMany({
//       data: [
//         {
//           name: "Manas",
//           email: "manas@mailinator.com",
//           phone_number: "7275343674",
//           password: "12345"
//         },
//         {
//           name: "Dhruv",
//           email: "dhruv@mailinator.com",
//           phone_number: "7275343675",
//           password: "12345"
//         },
//         {
//           name: "Tarun",
//           email: "tarun@mailinator.com",
//           phone_number: "7275343676",
//           password: "12345"
//         }
//       ]
//     });
//     await prisma.role.createMany({
//       data: [
//         {
//           id: 1,
//           role_name: "admin"
//         },
//         {
//           id: 2,
//           role_name: "candidate"
//         },
//         {
//           id: 3,
//           role_name: "recruiter"
//         }
//       ]
//     });
//   } catch (e) {
//     console.log(e);
//   }
// }

// seed().then(() => prisma.$disconnect());
