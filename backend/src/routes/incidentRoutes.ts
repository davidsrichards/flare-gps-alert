import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { createIncident, getIncidents, updateIncidentStatus } from '../controllers/incidentController';

const router = Router();
router.use(authMiddleware);
router.post('/', createIncident);
router.get('/', getIncidents);
router.patch('/:id/status', requireRole(['security', 'admin']), updateIncidentStatus);
export default router;
