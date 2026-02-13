import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

export const getPrisma = (env: any) => {
    const connectionString = env.DATABASE_URL
    const pool = new Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })
    return prisma
}
