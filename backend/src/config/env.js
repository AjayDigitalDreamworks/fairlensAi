import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || process.env.ML_SERVICE_URL || 'http://localhost:8000',
  dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'src', 'data'),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || process.env.FAIRAI_GEMINI_MODEL || 'gemini-2.5-flash',
  mongoUri: process.env.MONGO_URI || '',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 512 * 1024 * 1024),
  analysisRateLimitMax: Number(process.env.ANALYSIS_RATE_LIMIT_MAX || 20),
  authTokenSecret: process.env.AUTH_TOKEN_SECRET || 'dev-only-change-this-secret',
  authTokenTtlHours: Number(process.env.AUTH_TOKEN_TTL_HOURS || 168),
};
