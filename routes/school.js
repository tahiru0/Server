import express from 'express';
import Student from '../models/Student.js';
import School from '../models/School.js';
import authenticate from '../middlewares/authenticate.js';
import useUpload from '../utils/upload.js';
import { sendEmail } from '../utils/emailService.js';
import { accountActivationTemplate, emailChangeConfirmationTemplate, passwordResetTemplate, newAccountCreatedTemplate } from '../utils/emailTemplates.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { handleError } from '../utils/errorHandler.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { emailChangeLimiter } from '../utils/rateLimiter.js';

const router = express.Router();

/**
 * @swagger
 * /api/school/approve-student/{studentId}:
 *   post:
 *     summary: Xác nhận tài khoản sinh viên
 *     tags: [School]
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của sinh viên
 *     responses:
 *       200:
 *         description: Xác nhận tài khoản sinh viên thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       404:
 *         description: Không tìm thấy sinh viên
 */
router.post('/approve-student/:studentId', authenticate(School, School.findById, 'admin'), async (req, res) => {
    try {
      const student = await Student.findById(req.params.studentId);
      if (!student) {
        return res.status(404).json({ message: 'Không tìm thấy sinh viên' });
      }
  
      if (student.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xác nhận sinh viên này' });
      }
  
      if (student.isApproved) {
        return res.status(400).json({ message: 'Tài khoản sinh viên đã được xác nhận trước đó' });
      }
  
      student.isApproved = true;
      student.approvedBy = req.user._id;
      student.approvedAt = new Date();
      await student.save();
  
      // Gửi email thông báo cho sinh viên
      await sendApprovalEmail(student.email);
  
      res.json({ message: 'Xác nhận tài khoản sinh viên thành công' });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

const upload = useUpload('logos', 'school');

/**
 * @swagger
 * /api/school/register:
 *   post:
 *     summary: Đăng ký trường học mới
 *     tags: [School]
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
 *               accountName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 */
router.post('/register', upload.single('logo'), async (req, res) => {
    const { name, address, accountName, email, password } = req.body;

    try {
        const logoUrl = req.file ? `uploads/logos/school/${req.file.filename}` : null;

        const activationToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiration = Date.now() + 3600000; // 1 giờ

        const newSchool = new School({
            name: name,
            address: address,
            logo: logoUrl,
            isActive: false,
            accounts: [{
                name: accountName,
                email: email,
                password: password,
                role: { name: 'admin' },
                activationToken: activationToken,
                tokenExpiration: tokenExpiration
            }]
        });

        await newSchool.save();

        const activationLink = `http://localhost:5000/api/school/activate/${activationToken}`;
        await sendEmail(
            email,
            'Xác nhận tài khoản trường học của bạn',
            accountActivationTemplate({
                accountName: accountName,
                companyName: name,
                activationLink: activationLink
            })
        );

        res.status(201).json({
            message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác nhận tài khoản.',
        });
    } catch (error) {
        const { status, message } = handleError(error);
        res.status(status).json({ message });
    }
});

/**
 * @swagger
 * /api/school/activate/{token}:
 *   get:
 *     summary: Kích hoạt tài khoản trường học
 *     tags: [School]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token kích hoạt
 *     responses:
 *       200:
 *         description: Kích hoạt tài khoản thành công
 *       400:
 *         description: Token không hợp lệ hoặc đã hết hạn
 */
router.get('/activate/:token', async (req, res) => {
    const { token } = req.params;

    try {
        const school = await School.findOne({ 'accounts.activationToken': token, 'accounts.tokenExpiration': { $gt: Date.now() } });

        if (!school) {
            return res.redirect(`http://localhost:3000/school/login?error=${encodeURIComponent('Token không hợp lệ hoặc đã hết hạn.')}`);
        }

        const account = school.accounts.find(acc => acc.activationToken === token);

        if (!account) {
            return res.redirect(`http://localhost:3000/school/login?error=${encodeURIComponent('Token không hợp lệ hoặc đã hết hạn.')}`);
        }

        account.isActive = true;
        account.activationToken = undefined;
        account.tokenExpiration = undefined;

        await school.save();

        const loginToken = jwt.sign({ schoolId: school._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
        res.redirect(`http://localhost:3000/school/login?token=${loginToken}&message=${encodeURIComponent('Xác thực tài khoản thành công, vui lòng đăng nhập để tiếp tục.')}`);
    } catch (error) {
        res.redirect(`http://localhost:3000/school/login?error=${encodeURIComponent(error.message)}`);
    }
});

// Middleware xác thực cho admin trường học
const authenticateSchoolAdmin = authenticate(School, School.findSchoolAccountById, 'admin');

// Middleware xác thực cho tất cả tài khoản trường học
const authenticateSchoolAccount = authenticate(School, School.findSchoolAccountById);

/**
 * @swagger
 * /api/school/me:
 *   get:
 *     summary: Lấy thông tin tài khoản hiện tại
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin tài khoản hiện tại
 *       401:
 *         description: Không có quyền truy cập
 */
router.get('/me', authenticateSchoolAccount, async (req, res) => {
    try {
        const user = req.user;
        const school = await School.findById(user.school).select('-accounts');

        if (!school) {
            return res.status(404).json({ message: 'Trường học không tồn tại.' });
        }

        res.status(200).json({
            school: {
                name: school.name,
                address: school.address,
                logo: school.logo,
                isActive: school.isActive,
                isDeleted: school.isDeleted,
                email: school.email,
            },
            account: {
                name: user.name,
                email: user.email,
                address: user.address,
                role: user.role,
                isActive: user.isActive,
                isDeleted: user.isDeleted,
                avatar: user.avatar
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /api/school/confirm-email-change:
 *   get:
 *     summary: Xác nhận thay đổi email
 *     tags: [School]
 *     parameters:
 *       - in: query
 *         name: data
 *         required: true
 *         schema:
 *           type: string
 *         description: Dữ liệu mã hóa chứa thông tin xác nhận
 *     responses:
 *       302:
 *         description: Chuyển hướng đến trang personal với thông báo kết quả
 */
router.get('/confirm-email-change', async (req, res) => {
    const { data } = req.query;

    try {
        const decryptedData = JSON.parse(decrypt(decodeURIComponent(data)));
        const { token, schoolId, accountId } = decryptedData;

        const school = await School.findOne({
            _id: schoolId,
            'accounts._id': accountId,
            'accounts.emailChangeToken': token,
            'accounts.emailChangeTokenExpires': { $gt: Date.now() }
        });

        if (!school) {
            return res.redirect(`http://localhost:3000/school/personal?error=${encodeURIComponent('Token không hợp lệ hoặc đã hết hạn.')}`);
        }

        const account = school.accounts.id(accountId);
        if (!account) {
            return res.redirect(`http://localhost:3000/school/personal?error=${encodeURIComponent('Không tìm thấy tài khoản.')}`);
        }

        account.email = account.pendingEmail;
        account.pendingEmail = undefined;
        account.emailChangeToken = undefined;
        account.emailChangeTokenExpires = undefined;

        await school.save();

        const loginToken = jwt.sign({ schoolId: school._id, _id: account._id }, process.env.JWT_SECRET, { expiresIn: '15m' });

        res.redirect(`http://localhost:3000/school/personal?token=${loginToken}&message=${encodeURIComponent('Email đã được xác nhận và cập nhật thành công.')}`);
    } catch (error) {
        res.redirect(`http://localhost:3000/school/personal?error=${encodeURIComponent('Đã xảy ra lỗi khi xác nhận email.')}`);
    }
});

/**
 * @swagger
 * /api/school/accounts:
 *   get:
 *     summary: Lấy danh sách tài khoản trong trường học
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
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
 *         description: Số lượng tài khoản mỗi trang
 *       - in: query
 *         name: count
 *         schema:
 *           type: boolean
 *         description: Chỉ lấy tổng số lượng tài khoản
 *     responses:
 *       200:
 *         description: Danh sách tài khoản
 *       401:
 *         description: Không có quyền truy cập
 */
router.get('/accounts', authenticateSchoolAccount, async (req, res) => {
    try {
        const accounts = await School.getFilteredAccounts(req.user.school, req.query);

        if (req.query.count) {
            return res.json({ total: accounts.length });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;

        const paginatedAccounts = accounts.slice(startIndex, endIndex);

        const response = {
            data: paginatedAccounts,
            total: accounts.length,
            page,
            limit
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('Error in /accounts route:', error);
        res.status(500).json({ message: 'Lỗi máy chủ.', error: error.message });
    }
});

/**
 * @swagger
 * /api/school/accounts:
 *   post:
 *     summary: Tạo tài khoản mới trong trường học
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *     responses:
 *       201:
 *         description: Tài khoản đã được tạo thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       404:
 *         description: Không tìm thấy trường học
 */
router.post('/accounts', authenticateSchoolAdmin, async (req, res) => {
    try {
        const schoolId = req.schoolId;
        const { name, email, password, role } = req.body;

        if (!['sub-admin', 'department-head', 'faculty-head'].includes(role.name)) {
            return res.status(400).json({ message: 'Vai trò không hợp lệ.' });
        }

        const school = await School.findById(schoolId);
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        const existingAccount = school.accounts.find(account => account.email === email);
        if (existingAccount) {
            return res.status(400).json({ message: 'Email đã được sử dụng.' });
        }

        const newAccount = {
            name,
            email,
            password,
            role,
            isActive: true
        };

        school.accounts.push(newAccount);
        await school.save();

        const emailContent = newAccountCreatedTemplate({
            accountName: name,
            schoolName: school.name,
            email: email,
            role: role.name
        });

        await sendEmail(
            email,
            'Chào mừng bạn đến với ' + school.name,
            emailContent
        );

        res.status(201).json({ message: 'Tài khoản đã được tạo thành công.', account: newAccount });
    } catch (error) {
        console.error('Error creating account:', error);
        const { status, message } = handleError(error);
        res.status(status).json({ message });
    }
});

export default router;
