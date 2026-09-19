import { PrismaClient } from "@prisma/client";
import { logger } from "../../utils/logger";

/**
 * Single shared Prisma client for the whole process.
 *
 * Every module used to do `new PrismaClient()`, and each instance opens its
 * own connection pool (default = 2×CPU+1 per instance). With ~20 modules that
 * meant up to ~100 Postgres connections from ONE process, which blew past the
 * server's max_connections and locked out every other client ("too many
 * clients already"). One client → one pool, sized explicitly below.
 *
 * Pool size is taken from DB_POOL_SIZE (default 10) unless the DATABASE_URL
 * already carries its own `connection_limit`.
 */
function buildDatasourceUrl(): string | undefined {
    const raw = process.env.DATABASE_URL;
    if (!raw) return undefined;
    try {
        const url = new URL(raw);
        if (!url.searchParams.has("connection_limit")) {
            url.searchParams.set("connection_limit", process.env.DB_POOL_SIZE || "10");
        }
        if (!url.searchParams.has("pool_timeout")) {
            url.searchParams.set("pool_timeout", process.env.DB_POOL_TIMEOUT || "30");
        }
        return url.toString();
    } catch {
        // Not a parseable URL (e.g. unusual scheme) — let Prisma use it as-is.
        return raw;
    }
}

const datasourceUrl = buildDatasourceUrl();

export const prisma = new PrismaClient(
    datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined
);

if (datasourceUrl) {
    const limit = new URL(datasourceUrl).searchParams.get("connection_limit");
    logger.info(`Prisma client initialised (shared, connection_limit=${limit})`);
}

export default prisma;
