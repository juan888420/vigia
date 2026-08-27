import { PrismaClient } from "@prisma/client";

// Singleton. `tsx watch` reloads modules on every save; without this guard each
// reload would open a new connection pool against Postgres until it refuses
// connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
