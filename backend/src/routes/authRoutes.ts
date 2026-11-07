import { Router } from 'express';
import { login, registerCitizen } from '../controllers/authController';

const router = Router();
router.post('/register', registerCitizen);
router.post('/login', login);
export default router;
