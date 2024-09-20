import express from 'express';
import adminRoutes from './admin.js';
import companyRoutes from './company.js';
import schoolRoutes from './school.js';
import studentRoutes from './student.js';
import authRoutes from './auth.js';
import mentorRoutes from './mentor.js';
import notificationRoutes from './notification.js';
import { apiLimiter } from '../utils/rateLimiter.js';
import sanitizeMiddleware from '../middlewares/sanitizeMiddleware.js';
import authenticate from '../middlewares/authenticate.js';
import Admin from '../models/Admin.js';
import Notification from '../models/Notification.js';
import fakeDataRoutes from './fakeDataRoutes.js';
// Middleware xác thực cho admin
const authenticateAdmin = authenticate(Admin, async (decoded) => {
  return await Admin.findAdminById({ id: decoded._id || decoded.id });
}, 'admin');

const router = express.Router();

// Áp dụng middleware sanitize cho tất cả các route
router.use(sanitizeMiddleware);

// Áp dụng authRoutes trước apiLimiter
router.use('/auth', authRoutes);

// Áp dụng apiLimiter cho các routes khác
router.use(apiLimiter);

// Áp dụng xác thực admin cho các route admin
router.use('/admin', authenticateAdmin, adminRoutes);

router.use('/company', companyRoutes);
router.use('/school', schoolRoutes);
router.use('/student', studentRoutes);
router.use('/mentor', mentorRoutes);
router.use('/notification', notificationRoutes);
router.use('/fake-data', fakeDataRoutes);
export default router;
