const dotenv = require('dotenv');

dotenv.config();

const env = {
  PORT: Number(process.env.PORT || 5000),
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/impact_analysis',
  OPENMETADATA_BASE_URL: process.env.OPENMETADATA_BASE_URL || 'http://localhost:8585',
  OPENMETADATA_TOKEN: process.env.OPENMETADATA_TOKEN || '',
  OPENMETADATA_ADMIN_EMAIL: process.env.OPENMETADATA_ADMIN_EMAIL || 'admin@open-metadata.org',
  OPENMETADATA_ADMIN_PASSWORD: process.env.OPENMETADATA_ADMIN_PASSWORD || 'admin',
  GROQ_API_URL: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1',
  GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  LLM_PROVIDER: process.env.LLM_PROVIDER || 'groq',
  NODE_ENV: process.env.NODE_ENV || 'development'
};

module.exports = env;
