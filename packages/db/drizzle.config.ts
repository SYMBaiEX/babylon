import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

// Determine if we're in local development mode
const isLocalDev = process.env.DEPLOYMENT_ENV === 'localnet' || 
                   process.env.NODE_ENV === 'development' ||
                   !process.env.DIRECT_DATABASE_URL;

// Local development database URL (matches docker-compose setup)
const LOCAL_DATABASE_URL = 'postgresql://babylon:babylon_dev_password@localhost:5433/babylon';

// Use local URL for development, production URL only when explicitly set
const databaseUrl = isLocalDev 
  ? (process.env.DATABASE_URL ?? LOCAL_DATABASE_URL)
  : (process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? LOCAL_DATABASE_URL);

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});

