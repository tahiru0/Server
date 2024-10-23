import express from 'express';
import adminRoutes from './admin.js';
import companyRoutes from './company.js';
import schoolRoutes from './school.js';
import studentRoutes from './student.js';
import guestRoutes from './guest.js';
import authRoutes from './auth.js';
import mentorRoutes from './mentor.js';
import notificationRoutes from './notification.js';
import { apiLimiter } from '../utils/rateLimiter.js';
import sanitizeMiddleware from '../middlewares/sanitizeMiddleware.js';
import authenticate from '../middlewares/authenticate.js';
import Admin from '../models/Admin.js';
import Notification from '../models/Notification.js';
import fakeDataRoutes from './fakeDataRoutes.js';
import facultyRoutes from './faculty.js';
import weeklyReportRoutes from './weeklyReport.js';
import maintenanceCheck from '../middlewares/maintenanceCheck.js';
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

router.get('/health-check', maintenanceCheck, (req, res) => {
  res.json({ message: 'Kết nối thành công đến API' });
});

// Áp dụng xác thực admin cho các route admin
router.use('/admin', authenticateAdmin, adminRoutes);

// Áp dụng maintenanceCheck cho các routes không phải admin
router.use('/company', maintenanceCheck, companyRoutes);
router.use('/school', maintenanceCheck, schoolRoutes);
router.use('/student', maintenanceCheck, studentRoutes);
router.use('/mentor', maintenanceCheck, mentorRoutes);
router.use('/guest', maintenanceCheck, guestRoutes);
router.use('/notification', maintenanceCheck, notificationRoutes);
router.use('/fake-data', maintenanceCheck, fakeDataRoutes);
router.use('/faculty', maintenanceCheck, facultyRoutes);
router.use('/weekly-report', maintenanceCheck, weeklyReportRoutes);
export default router;
