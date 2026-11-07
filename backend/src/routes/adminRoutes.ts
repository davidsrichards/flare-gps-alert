import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { createSecurityOfficer } from '../controllers/adminController';

const router = Router();
router.post('/create-security', authMiddleware, requireRole(['admin']), createSecurityOfficer);
export default router;
