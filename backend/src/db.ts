import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString || connectionString.startsWith("prisma+")) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection string for the Prisma runtime");
}

const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });
