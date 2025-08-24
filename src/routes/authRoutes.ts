import express from 'express';
import { requestOTP, verifyOTP } from '../controller/authController';

const router = express.Router();

// Auth routes
router.post('/request-otp', requestOTP)
router.post('/verify-otp', verifyOTP);

export default router;