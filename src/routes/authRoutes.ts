import express from 'express';
import { signup, login, requestOTP, verifyOTP } from '../controller/authController';

const router = express.Router();

// Auth routes
router.post('/signup', signup);
router.post('/login', login);

router.post('/request-otp', requestOTP)
router.post('/verify-otp', verifyOTP);

export default router;