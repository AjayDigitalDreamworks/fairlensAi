import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { env } from './config/env.js';
import routes from './routes/analysisRoutes.js';

const app = express();
fs.mkdirSync(env.dataDir, { recursive: true });

app.use(cors({ origin: env.corsOrigin.split(',').map((value) => value.trim()) }));
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
