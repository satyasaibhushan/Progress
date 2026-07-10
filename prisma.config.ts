
import "dotenv/config";
import { defineConfig } from "prisma/config";

const developmentDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/progress_db?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    // Client generation does not connect to the database, so a safe local
    // default keeps clean installs working before .env is configured.
    url: process.env.DATABASE_URL || developmentDatabaseUrl,
  },
});
