import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import userRoutes from './routes/userRoutes';
import incidentRoutes from './routes/incidentRoutes';

dotenv.config();

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in the environment');

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'flare-gps-backend', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/incidents', incidentRoutes);

app.listen(PORT, () => {
  console.log(`Flare GPS backend running on port ${PORT}`);
});

export default app;
