import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { updateDeviceTelemetry } from '../controllers/userController';

const router = Router();
router.put('/device-telemetry', authMiddleware, updateDeviceTelemetry);
export default router;
