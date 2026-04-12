import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { env } from './config/env.js';
import routes from './routes/analysisRoutes.js';
import mongoose from 'mongoose';

const app = express();
fs.mkdirSync(env.dataDir, { recursive: true });

const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function buildCorsOriginConfig(rawOrigins) {
  const configuredOrigins = (rawOrigins || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOrigins.includes('*')) {
    return true;
  }

  if (env.nodeEnv !== 'production') {
    // Let local frontends on any port work during development and Docker runs.
    return [localhostOriginPattern, ...configuredOrigins];
  }

  return configuredOrigins.length > 0 ? configuredOrigins : ['http://localhost:8080'];
}

if (env.mongoUri) {
  mongoose.connect(env.mongoUri)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error:', err));
} else {
  console.warn('MONGO_URI is not set in environment. Running without MongoDB connection.');
}

app.use(cors({ origin: buildCorsOriginConfig(env.corsOrigin) }));
app.use(helmet());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({ message: 'FairAI backend online' });
});

app.use('/api/v1', routes);

app.use((error, req, res, next) => {
  console.error(error);
  const status = error.status || error.response?.status || 500;
  const message = error.response?.data?.detail || error.message || 'Internal server error';
  res.status(status).json({ message });
});

app.listen(env.port, () => {
  console.log(`Backend running on http://localhost:${env.port}`);
});
