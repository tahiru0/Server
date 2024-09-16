import mongoose from 'mongoose';
import express from 'express';
import dotenv from 'dotenv-safe';
import Company from '../models/Company.js';
import { sendEmail, restoreEmail } from '../utils/emailService.js';
import Email from '../models/Email.js';
import EmailTemplate from '../models/EmailTemplate.js';
import School from '../models/School.js';
import { filterSearchSort, applyFilters, applySearch, applySorting } from '../utils/filterSearchSort.js';
import { handleError } from '../utils/errorHandler.js';
import multer from 'multer';
import path from 'path';

dotenv.config();

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Quản lý các chức năng dành cho admin
 */

/**
 * @swagger
 * /api/admin/companies:
 *   get:
 *     summary: Lấy danh sách công ty
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số lượng kết quả trên mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách công ty
 *       401:
 *         description: Không được phép truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/companies', async (req, res, next) => {
  try {
    const result = await filterSearchSort(Company, req.query, {
      filterFields: ['name', 'address'],
      searchFields: ['name', 'address'],
      populateFields: ['accounts'],
      select: '-accounts.password'
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/companies:
 *   post:
 *     summary: Tạo công ty mới
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Company'
 *     responses:
 *       201:
 *         description: Công ty đã được tạo
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Không được phép truy cập
 *       500:
 *         description: Lỗi server
 */
router.post('/companies', async (req, res, next) => {
  try {
    const newCompany = new Company(req.body);
    const savedCompany = await newCompany.save();
    res.status(201).json(savedCompany);
  } catch (error) {
    next(error);
  }
});

router.get('/companies/:id', async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id).populate('accounts', '-password');
    if (!company) {
      return res.status(404).json({ message: 'Không tìm thấy công ty' });
    }
    res.status(200).json(company);
  } catch (error) {
    next(error);
  }
});

router.put('/companies/:id', async (req, res, next) => {
  try {
    const updatedCompany = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updatedCompany) {
      return res.status(404).json({ message: 'Không tìm thấy công ty' });
    }
    res.status(200).json(updatedCompany);
  } catch (error) {
    next(error);
  }
});

router.delete('/companies/:id', async (req, res, next) => {
  try {
    const deletedCompany = await Company.findByIdAndDelete(req.params.id);
    if (!deletedCompany) {
      return res.status(404).json({ message: 'Không tìm thấy công ty' });
    }
    res.status(200).json({ message: 'Đã xóa công ty thành công' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/schools:
 *   get:
 *     summary: Lấy danh sách trường học
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số lượng kết quả trên mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách trường học
 *       401:
 *         description: Không được phép truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/schools', async (req, res, next) => {
  try {
    const result = await filterSearchSort(School, req.query, {
      filterFields: ['name', 'address'],
      searchFields: ['name', 'address'],
      populateFields: ['accounts'],
      select: '-accounts.password'
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// Cấu hình multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Đảm bảo thư mục 'uploads' đã tồn tại
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
  }
});

const upload = multer({ storage: storage });

/**
 * @swagger
 * /api/admin/schools:
 *   post:
 *     summary: Tạo trường học mới
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               accounts:
 *                 type: string
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Trường học đã được tạo
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Không được phép truy cập
 *       500:
 *         description: Lỗi server
 */
router.post('/schools', upload.single('logo'), async (req, res, next) => {
  try {
    console.log('Received request body:', req.body);
    console.log('Received file:', req.file);

    const { name, address, website, establishedDate, accounts } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Tên trường không được bỏ trống' });
    }
    if (!address) {
      return res.status(400).json({ message: 'Địa chỉ trường không được bỏ trống' });
    }

    let parsedAccounts;
    if (typeof accounts === 'string') {
      try {
        parsedAccounts = JSON.parse(accounts);
      } catch (error) {
        return res.status(400).json({ message: 'Dữ liệu tài khoản không hợp lệ' });
      }
    } else if (Array.isArray(accounts)) {
      parsedAccounts = accounts;
    } else {
      return res.status(400).json({ message: 'Dữ liệu tài khoản không hợp lệ' });
    }

    if (!parsedAccounts || parsedAccounts.length === 0) {
      return res.status(400).json({ message: 'Cần có ít nhất một tài khoản cho trường học' });
    }
    
    parsedAccounts.forEach((account, index) => {
      if (!account.name) {
        throw new Error(`Tên tài khoản thứ ${index + 1} không được bỏ trống`);
      }
      if (!account.email) {
        throw new Error(`Email tài khoản thứ ${index + 1} không được bỏ trống`);
      }
      if (!account.password) {
        throw new Error(`Mật khẩu tài khoản thứ ${index + 1} không được bỏ trống`);
      }
      if (!account.role || !account.role.name) {
        throw new Error(`Vai trò tài khoản thứ ${index + 1} không được bỏ trống`);
      }
    });

    const newSchool = new School({
      name,
      address,
      website,
      establishedDate,
      accounts: parsedAccounts,
      logo: req.file ? req.file.path : undefined
    });

    const savedSchool = await newSchool.save();
    res.status(201).json(savedSchool);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/schools/{id}:
 *   get:
 *     summary: Lấy thông tin trường học theo ID
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thông tin trường học
 *       404:
 *         description: Không tìm thấy trường học
 *       500:
 *         description: Lỗi server
 */
router.get('/schools/:id', async (req, res, next) => {
  try {
    const school = await School.findById(req.params.id).populate('accounts', '-password');
    if (!school) {
      return res.status(404).json({ message: 'Không tìm thấy trường học' });
    }
    res.status(200).json(school);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/schools/{id}:
 *   put:
 *     summary: Cập nhật thông tin trường học
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/School'
 *     responses:
 *       200:
 *         description: Thông tin trường học đã được cập nhật
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy trường học
 *       500:
 *         description: Lỗi server
 */
router.put('/schools/:id', async (req, res, next) => {
  try {
    const updatedSchool = await School.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updatedSchool) {
      return res.status(404).json({ message: 'Không tìm thấy trường học' });
    }
    res.status(200).json(updatedSchool);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/schools/{id}:
 *   delete:
 *     summary: Xóa trường học
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trường học đã được xóa
 *       404:
 *         description: Không tìm thấy trường học
 *       500:
 *         description: Lỗi server
 */
router.delete('/schools/:id', async (req, res, next) => {
  try {
    const deletedSchool = await School.findByIdAndDelete(req.params.id);
    if (!deletedSchool) {
      return res.status(404).json({ message: 'Không tìm thấy trường học' });
    }
    res.status(200).json({ message: 'Đã xóa trường học thành công' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/send-email:
 *   post:
 *     summary: Gửi email
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *               subject:
 *                 type: string  
 *               htmlContent:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [sent, received, replied]
 *                 default: sent
 *     responses:
 *       200:
 *         description: Email đã được gửi thành công
 *       400:
 *         description: Thiếu thông tin bắt buộc
 *       401:
 *         description: Không được phép truy cập
 *       500:
 *         description: Lỗi server
 */
router.post('/send-email', async (req, res, next) => {
  const { to, subject, htmlContent, type } = req.body;

  try {
    if (!to || !subject || !htmlContent) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc.' });
    }

    const email = await sendEmail(to, subject, htmlContent, type);
    res.status(200).json({ message: 'Email được gửi thành công.' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Lỗi server khi gửi email.' });
  }
});

/**
 * @swagger
 * /api/admin/emails:
 *   get:
 *     summary: Lấy danh sách email đã gửi (có phân trang)
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Số lượng email trên mỗi trang
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm kiếm email theo tiêu đề hoặc người nhận
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [to, subject, sentAt]
 *           default: sentAt
 *         description: Sắp xếp email theo trường
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Thứ tự sắp xếp
 *       - in: query
 *         name: showDeleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Hiển thị email đã xóa
 *     responses:
 *       200:
 *         description: Danh sách email đã gửi
 *       500:
 *         description: Lỗi server
 */
router.get('/emails', async (req, res, next) => {
  const { search, sort = 'sentAt', order = 'desc', showDeleted, page = 1, limit = 10 } = req.query;

  try {
    let query = {};
    if (showDeleted === 'true') {
      query.isDeleted = true;
    } else {
      query.isDeleted = { $ne: true };
    }
    if (search) {
      query.$or = [
        { to: new RegExp(search, 'i') },
        { subject: new RegExp(search, 'i') }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order
    };

    const result = await Email.getEmailsPaginated(query, options);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /api/admin/emails/restore/{id}:
 *   post:
 *     summary: Khôi phục email đã xóa mềm
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID của email cần khôi phục
 *     responses:
 *       200:
 *         description: Email đã được khôi phục
 *       404:
 *         description: Không tìm thấy email
 *       500:
 *         description: Lỗi server
 */
router.post('/emails/restore/:id', async (req, res, next) => {
  try {
    const email = await restoreEmail(req.params.id);
    res.status(200).json({ message: 'Email đã được khôi phục.', email });
  } catch (error) {
    if (error.message === 'Không tìm thấy email.') {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/emails/{id}:
 *   delete:
 *     summary: Xóa mềm email
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID của email cần xóa
 *     responses:
 *       200:
 *         description: Email đã được xóa mềm
 *       404:
 *         description: Không tìm thấy email
 *       500:
 *         description: Lỗi server
 */
router.delete('/emails/:id', async (req, res, next) => {
  try {
    const email = await Email.findById(req.params.id);
    if (!email) {
      return res.status(404).json({ message: 'Không tìm thấy email.' });
    }

    await email.softDelete();
    res.status(200).json({ message: 'Email đã được xóa mềm.' });
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /api/admin/email-templates:
 *   get:
 *     summary: Lấy danh sách email template
 *     tags: [Admin]
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách email template
 *       500:
 *         description: Lỗi server
 */
router.get('/email-templates', async (req, res, next) => {
  try {
    const templates = await EmailTemplate.find().sort({ createdAt: -1 });
    res.status(200).json(templates);
  } catch (error) {
    next(error);
  }
});

router.use((err, req, res, next) => {
  console.error('Lỗi trong admin router:', err);
  const { status, message } = handleError(err);
  res.status(status).json({ error: message });
});

export default router;
