import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString || connectionString.startsWith("prisma+")) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection string for the Prisma runtime");
}

const databaseUrl = new URL(connectionString);
const sslMode = databaseUrl.searchParams.get("sslmode")?.toLowerCase();
if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
  databaseUrl.searchParams.set("sslmode", "verify-full");
}

const adapter = new PrismaPg({ connectionString: databaseUrl.toString() });
export const prisma = new PrismaClient({ adapter });
