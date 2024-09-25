import express from 'express';
import jwt from 'jsonwebtoken';
import { generateTokens } from '../utils/authUtils.js';
import Notification from '../models/Notification.js';
import Company from '../models/Company.js';
import Student from '../models/Student.js';
import School from '../models/School.js';
import notificationStream from '../utils/notificationStream.js';

const router = express.Router();

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

const authenticateUser = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }

  req.user = decoded;
  req.userModel = decoded.model;

  next();
};

router.get('/', authenticateUser, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const recipientModel = req.userModel;
    const parentId = req.user.companyId || req.user.schoolId;

    const query = {
      recipient: req.user._id,
      recipientModel: recipientModel,
      isDeleted: false
    };
    
    if (parentId) {
      query.parentId = parentId;
    }
    
    if (recipientModel === 'CompanyAccount' && req.user.role) {
      query.recipientRole = req.user.role;
    } else if (recipientModel === 'SchoolAccount' && req.user.role) {
      query.recipientRole = req.user.role.name;
    }

    // Xóa điều kiện parentId cho Student
    if (recipientModel === 'Student') {
      delete query.parentId;
    }

    console.log('Query:', query);
    console.log('User:', req.user);
    console.log('UserModel:', req.userModel);

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    console.log('Notifications:', notifications);

    const total = await Notification.countDocuments(query);

    res.json({
      notifications,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    console.error('Error in GET /notifications:', error);
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/read', authenticateUser, async (req, res) => {
  try {
    const query = {
      _id: req.params.id,
      recipient: req.user._id,
      recipientModel: req.userModel
    };

    console.log('Patch query:', query);

    const notification = await Notification.findOne(query);
    if (!notification) {
      return res.status(404).json({ message: 'Thông báo không tồn tại' });
    }

    await notification.markAsRead();

    // Tính toán số lượng thông báo chưa đọc
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      recipientModel: req.userModel,
      isRead: false,
      isDeleted: false
    });

    res.json({ 
      message: 'Thông báo đã được đánh dấu là đã đọc',
      unreadCount: unreadCount > 99 ? '99+' : unreadCount.toString()
    });
  } catch (error) {
    console.error('Error in PATCH /notifications/:id/read:', error);
    res.status(500).json({ message: error.message });
  }
});

router.patch('/read-all', authenticateUser, async (req, res) => {
  try {
    const query = {
      recipient: req.user._id,
      recipientModel: req.userModel,
      isRead: false
    };

    if (req.user.companyId || req.user.schoolId) {
      query.parentId = req.user.companyId || req.user.schoolId;
    }

    await Notification.updateMany(
      query,
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.json({ message: 'Đã đánh dấu tất cả thông báo là đã đọc' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const query = {
      _id: req.params.id,
      recipient: req.user._id,
      recipientModel: req.userModel
    };

    if (req.user.companyId || req.user.schoolId) {
      query.parentId = req.user.companyId || req.user.schoolId;
    }

    const notification = await Notification.findOne(query);

    if (!notification) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    }

    await notification.softDelete();

    res.json({ message: 'Đã xóa thông báo' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/unread-count', authenticateUser, async (req, res) => {
  try {
    const recipientModel = req.userModel;
    const query = {
      recipient: req.user._id,
      recipientModel: recipientModel,
      isRead: false,
      isDeleted: false
    };

    if (req.user.companyId || req.user.schoolId) {
      query.parentId = req.user.companyId || req.user.schoolId;
    }

    if (recipientModel === 'CompanyAccount' && req.user.role) {
      query.recipientRole = req.user.role;
    } else if (recipientModel === 'SchoolAccount' && req.user.role) {
      query.recipientRole = req.user.role.name;
    }


    const count = await Notification.countDocuments(query);


    const unreadCount = count > 99 ? '99+' : count.toString();

    res.json({ unreadCount: unreadCount });
  } catch (error) {
    console.error('Error in GET /notifications/unread-count:', error);
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/restore', authenticateUser, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user._id,
      recipientModel: req.userModel,
      isDeleted: true
    });

    if (!notification) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo đã xóa' });
    }

    await notification.restore();

    res.json({ message: 'Đã khôi phục thông báo' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/stream', authenticateUser, async (req, res) => {
  notificationStream.subscribe(req, res);
});

/**
 * @swagger
 * /api/notification/send-fake-notification:
 *   post:
 *     summary: Gửi thông báo giả cho tất cả người dùng
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *               - type
 *             properties:
 *               content:
 *                 type: string
 *                 description: Nội dung của thông báo
 *               type:
 *                 type: string
 *                 description: Loại thông báo
 *     responses:
 *       200:
 *         description: Thông báo đã được gửi thành công
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       500:
 *         description: Lỗi server
 */
router.post('/send-fake-notification', async (req, res) => {
  try {
    const { content, type } = req.body;

    if (!content || !type) {
      return res.status(400).json({ message: 'Nội dung và loại thông báo là bắt buộc' });
    }

    const students = await Student.find({});
    const companies = await Company.find({});

    const notifications = [];

    for (const student of students) {
      notifications.push({
        recipient: student._id,
        recipientModel: 'Student',
        type,
        content,
        relatedId: null
      });
    }

    for (const company of companies) {
      for (const account of company.accounts) {
        notifications.push({
          recipient: account._id,
          recipientModel: 'CompanyAccount',
          recipientRole: account.role,
          type,
          content,
          relatedId: null
        });
      }
    }

    for (const notificationData of notifications) {
      await Notification.insert(notificationData);
    }

    res.json({ message: 'Đã gửi thông báo giả cho tất cả người dùng' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/unread', authenticateUser, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const recipientModel = req.userModel;
    const query = {
      recipient: req.user._id,
      recipientModel: recipientModel,
      isRead: false
    };

    if (req.user.companyId || req.user.schoolId) {
      query.parentId = req.user.companyId || req.user.schoolId;
    }


    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments(query);

    res.json({
      notifications,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    console.error('Error in GET /notifications/unread:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
