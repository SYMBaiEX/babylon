import { config as loadEnv } from 'dotenv';

loadEnv();

const config = {
  schema: './prisma/schema.prisma',
};

export default config;
