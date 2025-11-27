import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './apps/web/src/db/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/babylon',
  },
  verbose: true,
  strict: true,
});
