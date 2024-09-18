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
import Major from '../models/Major.js';
import axios from 'axios';
import mongoose from 'mongoose';

const router = express.Router();

// Đảm bảo rằng School.findSchoolAccountById tồn tại và là một hàm
console.log('School.findSchoolAccountById:', School.findSchoolAccountById);

const authenticateSchoolAdmin = authenticate(School, (decoded) => School.findSchoolAccountById(decoded, 'admin'));
const authenticateSchoolAccount = authenticate(School, School.findSchoolAccountById);

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
router.post('/approve-student/:studentId', authenticateSchoolAdmin, async (req, res) => {
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

router.post('/sync-students', authenticateSchoolAdmin, async (req, res) => {
    const { studentId } = req.body;
    const school = await School.findById(req.user.school);

    if (!school || !school.studentApiConfig || !school.studentApiConfig.uri) {
        return res.status(400).json({ message: 'Cấu hình API không hợp lệ.' });
    }

    try {
        const response = await axios.get(`${school.studentApiConfig.uri}/${studentId}`);
        const studentData = response.data;

        const student = await Student.findOne({ studentId, school: school._id });
        if (!student) {
            const newStudent = new Student({
                name: studentData[school.studentApiConfig.fieldMappings.name],
                email: studentData[school.studentApiConfig.fieldMappings.email],
                studentId: studentData[school.studentApiConfig.fieldMappings.studentId],
                major: studentData[school.studentApiConfig.fieldMappings.major],
                dateOfBirth: studentData[school.studentApiConfig.fieldMappings.dateOfBirth],
                school: school._id,
                password: studentData[school.studentApiConfig.fieldMappings.defaultPassword] || student.generateDefaultPassword()
            });
            await newStudent.save();
            return res.status(201).json(newStudent);
        }

        res.status(200).json(student);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi đồng bộ sinh viên.', error: error.message });
    }
});

/**
 * @swagger
 * /api/school/configure-guest-api:
 *   post:
 *     summary: Cấu hình API khách và quy tắc mật khẩu
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
 *               apiConfig:
 *                 type: object
 *                 properties:
 *                   uri:
 *                     type: string
 *                     description: URL của API khách
 *                   fieldMappings:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         description: Tên trường dữ liệu cho tên sinh viên
 *                       email:
 *                         type: string
 *                         description: Tên trường dữ liệu cho email sinh viên
 *                       studentId:
 *                         type: string
 *                         description: Tên trường dữ liệu cho mã số sinh viên
 *                       major:
 *                         type: string
 *                         description: Tên trường dữ liệu cho ngành học
 *                       dateOfBirth:
 *                         type: string
 *                         description: Tên trường dữ liệu cho ngày sinh
 *               passwordRule:
 *                 type: object
 *                 properties:
 *                   template:
 *                     type: string
 *                     description: Mẫu mật khẩu, ví dụ "School${ngaysinh}2023"
 *     responses:
 *       200:
 *         description: Cấu hình API khách và quy tắc mật khẩu thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/School'
 *       400:
 *         description: Lỗi dữ liệu đầu vào hoặc API không hoạt động
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */

router.post('/configure-guest-api', authenticateSchoolAdmin, async (req, res) => {
    const { apiConfig, passwordRule } = req.body;

    try {
        const school = await School.configureGuestApi(req.user.school, apiConfig, passwordRule);
        res.status(200).json({ message: 'Cấu hình API khách và quy tắc mật khẩu thành công', school });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

/**
 * @swagger
 * /api/school/review-password-rule:
 *   post:
 *     summary: Review quy tắc mật khẩu
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
 *               passwordRule:
 *                 type: object
 *                 properties:
 *                   template:
 *                     type: string
 *                     description: |
 *                       Mẫu mật khẩu, ví dụ: "School${ngaysinh}2023"
 *                     example: "School${ngaysinh}2023"
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 description: Ngày sinh của sinh viên
 *                 example: "1995-01-01"
 *     responses:
 *       200:
 *         description: Mật khẩu được tạo dựa trên quy tắc
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 password:
 *                   type: string
 *                   description: Mật khẩu được tạo
 *                   example: "School010119952023"
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 */

router.post('/review-password-rule', async (req, res) => {
    const { passwordRule, dateOfBirth } = req.body;

    try {
        const Student = mongoose.model('Student');
        const password = await Student.generatePasswordFromRule(passwordRule, dateOfBirth);
        res.status(200).json({ password });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

/**
 * @swagger
 * /api/school/test-data/{id}:
 *   get:
 *     summary: Lấy dữ liệu giả theo ID
 *     tags: [School]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID của dữ liệu giả
 *     responses:
 *       200:
 *         description: Dữ liệu giả được lấy thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 studentId:
 *                   type: string
 *                 dateOfBirth:
 *                   type: string
 *                   format: date
 *                 major:
 *                   type: string
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 */
router.get('/test-data/:id', async (req, res) => {
    const { id } = req.params;

    // Dữ liệu giả
    const fakeData = {
        id,
        name: 'Nguyen Van A',
        email: 'nguyenvana@example.com',
        studentId: '123456',
        dateOfBirth: '2000-01-01',
        major: 'Computer Science'
    };

    res.status(200).json(fakeData);
});

// Tạo sinh viên mới
router.post('/students', authenticateSchoolAdmin, async (req, res) => {
    const { name, email, password, studentId, dateOfBirth, major } = req.body;
    const schoolId = req.user.school;

    try {
        const school = await School.findById(schoolId);
        if (!password && (!school.studentApiConfig || !school.studentApiConfig.passwordRule || !school.studentApiConfig.passwordRule.template)) {
            return res.status(400).json({ 
                message: 'Vui lòng cập nhật quy tắc mật khẩu hoặc cung cấp mật khẩu cho sinh viên.',
                code: 'NO_PASSWORD_RULE'
            });
        }

        let majorDoc = await Major.findOne({ name: major });
        if (!majorDoc) {
            majorDoc = new Major({ name: major });
            await majorDoc.save();
        }

        const newStudent = new Student({
            name,
            email,
            studentId,
            dateOfBirth,
            major: majorDoc._id,
            school: schoolId
        });

        if (!password) {
            const defaultPassword = await newStudent.generateDefaultPassword();
            if (!defaultPassword) {
                return res.status(400).json({ 
                    message: 'Vui lòng cập nhật quy tắc mật khẩu hoặc cung cấp mật khẩu cho sinh viên.',
                    code: 'NO_PASSWORD_RULE'
                });
            }
            newStudent.password = defaultPassword;
        } else {
            newStudent.password = password;
        }

        await newStudent.save();
        res.status(201).json(newStudent);
    } catch (error) {
        const { status, message } = handleError(error);
        res.status(status).json({ message });
    }
});

// Lấy danh sách sinh viên
router.get('/students', authenticateSchoolAccount, async (req, res) => {
    const schoolId = req.user.school;

    try {
        const students = await Student.find({ school: schoolId, isDeleted: false });
        res.status(200).json(students);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Lấy sinh viên theo ID
router.get('/students/:id', authenticateSchoolAccount, async (req, res) => {
    const { id } = req.params;
    const schoolId = req.user.school;

    try {
        const student = await Student.findOne({ _id: id, school: schoolId, isDeleted: false });

        if (!student) {
            return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
        }

        res.status(200).json(student);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Cập nhật sinh viên
router.put('/students/:id', authenticateSchoolAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, email, password, studentId, dateOfBirth, major } = req.body;
    const schoolId = req.user.school;

    try {
        const student = await Student.findOneAndUpdate(
            { _id: id, school: schoolId, isDeleted: false },
            { name, email, password, studentId, dateOfBirth, major },
            { new: true }
        );

        if (!student) {
            return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
        }

        res.status(200).json(student);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Xóa sinh viên
router.delete('/students/:id', authenticateSchoolAdmin, async (req, res) => {
    const { id } = req.params;
    const schoolId = req.user.school;

    try {
        const student = await Student.findOneAndUpdate(
            { _id: id, school: schoolId, isDeleted: false },
            { isDeleted: true },
            { new: true }
        );

        if (!student) {
            return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
        }

        res.status(200).json({ message: 'Sinh viên đã được xóa thành công.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

/**
 * @swagger
 * /api/school/students:
 *   post:
 *     summary: Tạo sinh viên mới
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
 *               studentId:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               major:
 *                 type: string
 *     responses:
 *       201:
 *         description: Sinh viên đã được tạo thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *   get:
 *     summary: Lấy danh sách sinh viên
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách sinh viên
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Student'
 *       500:
 *         description: Lỗi máy chủ
 * 
 * /api/school/students/{id}:
 *   get:
 *     summary: Lấy sinh viên theo ID
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID của sinh viên
 *     responses:
 *       200:
 *         description: Thông tin sinh viên
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Student'
 *       404:
 *         description: Không tìm thấy sinh viên
 *       500:
 *         description: Lỗi máy chủ
 *   put:
 *     summary: Cập nhật sinh viên
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID của sinh viên
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
 *               studentId:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               major:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sinh viên đã được cập nhật thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       404:
 *         description: Không tìm thấy sinh viên
 *   delete:
 *     summary: Xóa sinh viên
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID của sinh viên
 *     responses:
 *       200:
 *         description: Sinh viên đã được xóa thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       404:
 *         description: Không tìm thấy sinh viên
 */
/**
 * @swagger
 * /api/school/update-password-rule:
 *   put:
 *     summary: Cập nhật quy tắc mật khẩu cho sinh viên
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
 *               passwordRule:
 *                 type: object
 *                 properties:
 *                   template:
 *                     type: string
 *                     description: Mẫu mật khẩu, ví dụ "School${ngaysinh}2023"
 *     responses:
 *       200:
 *         description: Cập nhật quy tắc mật khẩu thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       401:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy trường học
 *       500:
 *         description: Lỗi server
 */
router.put('/update-password-rule', authenticateSchoolAdmin, async (req, res) => {
    const { passwordRule } = req.body;
    const schoolId = req.user.school;

    try {
        const school = await School.findById(schoolId);
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        school.studentApiConfig = school.studentApiConfig || {};
        school.studentApiConfig.passwordRule = passwordRule;

        await school.save();

        res.status(200).json({ message: 'Cập nhật quy tắc mật khẩu thành công.', passwordRule: school.studentApiConfig.passwordRule });
    } catch (error) {
        res.status(400).json({ message: 'Lỗi khi cập nhật quy tắc mật khẩu.', error: error.message });
    }
});

export default router;
