import express from 'express';
import Student from '../models/Student.js';
import School from '../models/School.js';
import authenticate from '../middlewares/authenticate.js';
import { handleError } from '../utils/errorHandler.js';
import { useRegistrationImageUpload, useExcelUpload } from '../utils/upload.js';
import { sendEmail } from '../utils/emailService.js';
import { accountActivationTemplate, emailChangeConfirmationTemplate, passwordResetTemplate, newAccountCreatedTemplate } from '../utils/emailTemplates.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { encrypt, decrypt } from '../utils/encryption.js';
import { emailChangeLimiter } from '../utils/rateLimiter.js';
import Major from '../models/Major.js';
import axios from 'axios';
import mongoose from 'mongoose';
import { handleQuery } from '../utils/queryHelper.js';
import { getSchoolDashboardData } from '../models/dashboard.js';
import multer from 'multer';
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';



const router = express.Router();

const authenticateSchoolAdmin = authenticate(School, (decoded) => School.findSchoolAccountById(decoded, 'admin'));
const authenticateSchoolAccount = authenticate(School, School.findSchoolAccountById);
const createDirectory = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};
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

        res.json({ message: 'Xác nhận tài khoản sinh viên thành công' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

const upload = useRegistrationImageUpload('logos', 'school');

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
router.post('/register', upload.single('logo'), async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    const { name, address, accountName, email, password } = req.body;

    try {
        const activationToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiration = Date.now() + 3600000; // 1 giờ

        const newSchool = new School({
            name: name,
            address: address,
            email: email,
            isActive: false,
            accounts: [{
                name: accountName,
                email: email,
                password: password,
                role: { name: 'admin' },
                activationToken,
                tokenExpiration
            }]
        });

        await newSchool.save({ session });

        if (req.file) {
            const fileExtension = path.extname(req.file.originalname);
            const newFilename = `${newSchool._id}${fileExtension}`;
            const finalDir = path.join('public', 'uploads', 'logos', 'school', newSchool._id.toString());
            createDirectory(finalDir);
            const finalPath = path.join(finalDir, newFilename);
            fs.renameSync(req.file.path, finalPath);
            newSchool.logo = `uploads/logos/school/${newSchool._id}/${newFilename}`;
            await newSchool.save({ session });
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác nhận tài khoản.',
            schoolId: newSchool._id
        });

        // Gửi email xác nhận sau khi đã trả về response
        const activationLink = `http://localhost:5000/api/school/activate/${activationToken}`;
        sendEmail(
            email,
            'Xác nhận tài khoản trường học của bạn',
            accountActivationTemplate({
                accountName: accountName,
                companyName: name,
                activationLink: activationLink
            })
        ).catch(error => console.error('Lỗi khi gửi email:', error));

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
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
        const { status, message } = handleError(error);
        res.status(status).json({ message });
    }
});

/**
 * @swagger
 * /api/school/sync-students:
 *   post:
 *     summary: Đồng bộ thông tin sinh viên từ API bên ngoài
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
 *               studentId:
 *                 type: string
 *                 description: Mã số sinh viên cần đồng bộ
 *     responses:
 *       200:
 *         description: Thông tin sinh viên đã tồn tại
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Student'
 *       201:
 *         description: Sinh viên mới được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Student'
 *       400:
 *         description: Cấu hình API không hợp lệ
 *       500:
 *         description: Lỗi server khi đồng bộ sinh viên
 */
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
        const { status, message } = handleError(error);
        res.status(status).json({ message });
    }
});

/**
 * @swagger
 * /api/school/student-api-config:
 *   get:
 *     summary: Lấy cấu hình API khách và quy tắc mật khẩu
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
 *     responses:
 *       200:
 *         description: Cấu hình API khách và quy tắc mật khẩu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 studentApiConfig:
 *                   type: object
 *                   description: Cấu hình API khách
 *                 passwordRule:
 *                   type: object
 *                   description: Quy tắc mật khẩu
 *       404:
 *         description: Không tìm thấy trường học
 *       500:
 *         description: Lỗi server
 */
router.get('/student-api-config', authenticateSchoolAdmin, async (req, res) => {
    try {
        const school = await School.findById(req.user.school);
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }
        res.status(200).json({
            studentApiConfig: school.studentApiConfig || {},
        });
    } catch (error) {
        const { status, message } = handleError(error);
        res.status(status).json({ message });
    }
});

/**
 * @swagger
 * /api/school/student-api-config:
 *   put:
 *     summary: Tạo mới hoặc cập nhật cấu hình API khách và quy tắc mật khẩu
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
 *                 description: Cấu hình API khách
 *               passwordRule:
 *                 type: object
 *                 description: Quy tắc mật khẩu
 *     responses:
 *       200:
 *         description: Cấu hình đã được tạo mới hoặc cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 studentApiConfig:
 *                   type: object
 *                 passwordRule:
 *                   type: object
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       401:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy trường học
 *       500:
 *         description: Lỗi server
 */
router.put('/student-api-config', authenticateSchoolAdmin, async (req, res) => {
    const { studentApiConfig } = req.body;
    const schoolId = req.user.school;

    try {
        let school = await School.findById(schoolId);
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        // Cập nhật toàn bộ cấu hình API sinh viên
        if (studentApiConfig) {
            school.studentApiConfig = {
                ...school.studentApiConfig,
                ...studentApiConfig
            };

            // Đảm bảo rằng các trường con cũng được cập nhật đúng cách
            if (studentApiConfig.fieldMappings) {
                school.studentApiConfig.fieldMappings = {
                    ...school.studentApiConfig.fieldMappings,
                    ...studentApiConfig.fieldMappings
                };
            }

            if (studentApiConfig.passwordRule) {
                school.studentApiConfig.passwordRule = {
                    ...school.studentApiConfig.passwordRule,
                    ...studentApiConfig.passwordRule
                };
            }
        }

        // Kiểm tra kết nối API nếu URI được cung cấp
        if (school.studentApiConfig && school.studentApiConfig.uri) {
            try {
                const response = await axios.get(`${school.studentApiConfig.uri}1`); // Thêm một ID mẫu
                if (response.status >= 200 && response.status < 300) {
                    console.log('API hoạt động bình thường');
                } else {
                    throw new Error(`API trả về status code không mong đợi: ${response.status}`);
                }
            } catch (error) {
                if (error.response) {
                    throw new Error(`API không hoạt động: ${error.response.statusText} (Status: ${error.response.status})`);
                } else if (error.request) {
                    throw new Error('Không thể kết nối đến API.');
                } else {
                    throw new Error('Lỗi khi kiểm tra API: ' + error.message);
                }
            }
        }

        await school.save();

        res.status(200).json({
            message: 'Cấu hình API sinh viên đã được cập nhật thành công',
            studentApiConfig: school.studentApiConfig
        });
    } catch (error) {
        const { status, message } = handleError(error);
        res.status(status).json({ message });
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
        name: 'Nguyen Van A',
        email: 'nguyenvana@example.com',
        studentId: id,
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
const upload1 = useExcelUpload('excel', 'school');
/**
 * @swagger
 * /api/school/students/upload:
 *   post:
 *     summary: Tải lên và tạo nhiều sinh viên từ file Excel
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Tải lên và tạo sinh viên thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 totalProcessed:
 *                   type: integer
 *                 successCount:
 *                   type: integer
 *                 errorCount:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       row:
 *                         type: integer
 *                       error:
 *                         type: string
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       500:
 *         description: Lỗi server
 */
router.post('/students/upload', authenticateSchoolAdmin, (req, res, next) => {
    upload1.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ message: 'Lỗi khi tải lên file: ' + err.message });
        } else if (err) {
            return res.status(400).json({ message: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'Vui lòng tải lên một file Excel.' });
        }
        next();
    });
}, async (req, res) => {
    const schoolId = req.user.school;
    const results = [];
    const issues = [];

    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: 'Không tìm thấy dữ liệu file.' });
        }

        if (req.file.size === 0) {
            console.log('File rỗng được tải lên');
            return res.status(400).json({ message: 'File tải lên không có dữ liệu.' });
        }
        if (!req.file.buffer || req.file.buffer.length === 0) {
            console.log('Buffer của file rỗng');
            return res.status(400).json({ message: 'Không thể đọc dữ liệu từ file.' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
            return res.status(400).json({ message: 'File Excel không hợp lệ hoặc không có sheet nào.' });
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            return res.status(400).json({ message: 'Không tìm thấy dữ liệu trong sheet.' });
        }

        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        if (!data || data.length === 0 || !data[0]) {
            return res.status(400).json({ message: 'Không có dữ liệu trong file Excel.' });
        }

        const headers = data[0].map(header => header ? header.toLowerCase().trim().replace(/[-\s]/g, '') : '');
        const requiredFields = ['name', 'email', 'studentid', 'dateofbirth', 'major'];
        const missingFields = requiredFields.filter(field => !headers.includes(field));

        if (missingFields.length > 0) {
            return res.status(400).json({ message: `Thiếu các trường bắt buộc: ${missingFields.join(', ')}` });
        }

        const fieldIndexes = requiredFields.reduce((acc, field) => {
            acc[field] = headers.indexOf(field);
            return acc;
        }, {});

        const school = await School.findById(schoolId);
        if (!school.studentApiConfig || !school.studentApiConfig.passwordRule || !school.studentApiConfig.passwordRule.template) {
            return res.status(400).json({ message: 'Vui lòng cập nhật quy tắc mật khẩu trước khi tạo sinh viên.' });
        }

        const passwordRule = school.studentApiConfig.passwordRule.template;
        let uploadedCount = 0;
        let updatedCount = 0;

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            try {
                const studentData = {
                    name: row[fieldIndexes.name],
                    email: row[fieldIndexes.email],
                    studentId: row[fieldIndexes.studentid],
                    dateOfBirth: row[fieldIndexes.dateofbirth],
                    major: row[fieldIndexes.major],
                };

                const requiredFieldsInRow = Object.keys(studentData).filter(key => key !== 'password' && !studentData[key]);
                if (requiredFieldsInRow.length > 0) {
                    return res.status(400).json({ message: `Thiếu các trường bắt buộc: ${requiredFieldsInRow.join(', ')}` });
                }

                let majorDoc = await Major.findOne({ name: { $regex: new RegExp('^' + studentData.major.trim() + '$', 'i') } });
                if (!majorDoc) {
                    majorDoc = new Major({ name: studentData.major.trim() });
                    await majorDoc.save();
                }
                let majorDocs = [majorDoc._id];

                let existingStudent = await Student.findOne({ studentId: studentData.studentId, school: schoolId });
                
                if (existingStudent) {
                    if (!existingStudent.isApproved) {
                        existingStudent.isApproved = true;
                        await existingStudent.save();
                        results.push({
                            ...studentData,
                            _id: existingStudent._id,
                            status: 'Đã cập nhật',
                            password: 'Không thay đổi'
                        });
                        updatedCount++;
                    } else {
                        issues.push({
                            row: i + 1,
                            issue: 'Sinh viên đã tồn tại và đã được duyệt',
                            data: studentData
                        });
                    }
                } else {
                    const newStudent = new Student({
                        ...studentData,
                        major: majorDocs,
                        school: schoolId,
                        isApproved: true
                    });

                    const defaultPassword = await newStudent.generateDefaultPassword();
                    newStudent.password = defaultPassword;

                    await newStudent.save();
                    results.push({
                        ...studentData,
                        _id: newStudent._id,
                        status: 'Đã tạo mới',
                        password: defaultPassword
                    });
                    uploadedCount++;
                }
            } catch (error) {
                const { message } = handleError(error);
                issues.push({
                    row: i + 1,
                    issue: message,
                    data: {
                        name: row[fieldIndexes.name],
                        email: row[fieldIndexes.email],
                        studentId: row[fieldIndexes.studentid],
                        dateOfBirth: row[fieldIndexes.dateofbirth],
                        major: row[fieldIndexes.major],
                    }
                });
            }
        }

        res.status(201).json({
            message: 'Tải lên và xử lý sinh viên thành công',
            totalRows: data.length - 1,
            uploadedCount: uploadedCount,
            updatedCount: updatedCount,
            skippedCount: issues.length,
            successCount: uploadedCount + updatedCount,
            processedData: results,
            issues: issues,
            passwordNote: `Mật khẩu được tạo theo quy tắc: ${passwordRule}. Trong đó, '\${ngaysinh}' sẽ được thay thế bằng ngày sinh của sinh viên theo định dạng DDMMYYYY. Ví dụ: nếu quy tắc là 'School\${ngaysinh}' và ngày sinh là 01/05/2000, mật khẩu sẽ là 'School01052000'.`
        });
    } catch (error) {
        const { status, message } = handleError(error);
        res.status(status).json({ message });
    }
});
// Lấy danh sách sinh viên
router.get('/students', authenticateSchoolAccount, async (req, res) => {
    const schoolId = req.user.school;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    try {
        const additionalFilters = { school: schoolId, isDeleted: false };

        // Xử lý tìm kiếm
        if (req.query.search) {
            additionalFilters.$or = [
                { name: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
                { studentId: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        // Xử lý lọc theo trạng thái xác nhận
        if (req.query.isApproved) {
            additionalFilters.isApproved = req.query.isApproved === 'true';
        }

        // Xử lý lọc theo ngành học
        if (req.query.major) {
            additionalFilters.major = req.query.major;
        }

        const query = handleQuery(Student, req, additionalFilters);

        // Xử lý sắp xếp
        if (req.query.sort) {
            const sortOrder = req.query.order === 'desc' ? -1 : 1;
            query.sort({ [req.query.sort]: sortOrder });
        } else {
            query.sort({ createdAt: -1 }); // Mặc định sắp xếp theo thời gian tạo mới nhất
        }

        const totalStudents = await Student.countDocuments(additionalFilters);

        const students = await query
            .select('_id name avatar school isApproved studentId major')
            .populate('school', 'name')
            .populate('major', 'name')
            .skip((page - 1) * limit)
            .limit(limit);

        res.status(200).json({
            students,
            currentPage: page,
            totalPages: Math.ceil(totalStudents / limit),
            totalStudents
        });
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
    try {
      const { id } = req.params;
      const updateData = req.body;
  
      if (updateData.dateOfBirth === null) {
        delete updateData.dateOfBirth;
      } else if (updateData.dateOfBirth) {
        updateData.dateOfBirth = new Date(updateData.dateOfBirth);
      }
  
      const student = await Student.findById(id);
      if (!student) {
        return res.status(404).json({ message: 'Không tìm thấy sinh viên' });
      }
  
      if (student.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền cập nhật sinh viên này' });
      }
  
      Object.assign(student, updateData);
      await student.save();
  
      res.json(student);
    } catch (error) {
      handleError(error, res);
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
/**
 * @swagger
 * /api/school/check-student-api-connection:
 *   post:
 *     summary: Kiểm tra kết nối API khách và lấy dữ liệu sinh viên
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
 *               uri:
 *                 type: string
 *                 description: URI của API khách
 *               id:
 *                 type: string
 *                 description: ID của sinh viên cần kiểm tra
 *     responses:
 *       200:
 *         description: Kết nối API thành công và trả về dữ liệu sinh viên
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: Dữ liệu sinh viên đã được ánh xạ
 *       400:
 *         description: Cấu hình API không hợp lệ hoặc API không hoạt động
 *       500:
 *         description: Lỗi server khi kiểm tra kết nối API
 */
function trimTrailingSlash(url) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}
router.post('/check-student-api-connection', authenticateSchoolAdmin, async (req, res) => {
    try {
        const { uri, id } = req.body;
        if (!uri) {
            return res.status(400).json({ message: 'URI là bắt buộc.', code: 'MISSING_URI' });
        }
        if (!id) {
            return res.status(400).json({ message: 'ID là bắt buộc.', code: 'MISSING_ID' });
        }

        const trimmedUri = trimTrailingSlash(uri);
        const apiUrl = `${trimmedUri}/${id}`;

        try {
            const response = await axios.get(apiUrl);
            if (response.status === 200 && response.data) {
                res.status(200).json({
                    message: 'Kết nối API thành công.',
                    data: response.data
                });
            } else {
                res.status(400).json({
                    message: 'API không trả về dữ liệu hợp lệ.',
                    code: 'INVALID_RESPONSE'
                });
            }
        } catch (error) {
            if (error.response) {
                res.status(error.response.status).json({
                    message: `API trả về lỗi: ${error.response.statusText}`,
                    code: 'API_ERROR',
                    details: error.response.data
                });
            } else if (error.request) {
                res.status(500).json({
                    message: 'Không thể kết nối đến API.',
                    code: 'CONNECTION_ERROR'
                });
            } else {
                res.status(500).json({
                    message: 'Lỗi khi kiểm tra API: ' + error.message,
                    code: 'UNKNOWN_ERROR'
                });
            }
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            message: 'Lỗi server khi kiểm tra kết nối API.',
            code: 'SERVER_ERROR',
            details: error.message
        });
    }
});
/**
 * @swagger
 * /api/school/unapproved-students:
 *   get:
 *     summary: Lấy danh sách sinh viên chưa được xác nhận
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách sinh viên chưa được xác nhận
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.get('/unapproved-students', authenticateSchoolAdmin, async (req, res) => {
    try {
        const additionalFilters = { school: req.user.school, isApproved: false };
        const query = handleQuery(Student, req, additionalFilters);
        const students = await query.select('_id name avatar school isApproved studentId major')
            .populate('school', 'name')
            .populate('major', 'name');
        res.status(200).json(students);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/**
 * @swagger
 * /api/school/majors:
 *   get:
 *     summary: Lấy danh sách ngành học
 *     tags: [School]
 *     security:
 *       - schoolAccountBearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo tên ngành học
 *     responses:
 *       200:
 *         description: Danh sách ngành học
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.get('/majors', authenticateSchoolAccount, async (req, res) => {
    try {
        let query = {};
        if (req.query.search) {
            query.name = { $regex: new RegExp('^' + req.query.search, 'i') };
        }

        const majors = await Major.find(query)
            .select('_id name description')
            .sort({ name: 1 })
            .limit(10);

        const formattedMajors = majors.map(major => ({
            _id: major._id,
            name: major.name,
            description: major.description
        }));

        res.status(200).json(formattedMajors);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/**
 * @swagger
 * /api/school/dashboard:
 *   get:
 *     summary: Lấy dữ liệu dashboard cho trường học
 *     tags: [School]
 *     security:
 *       - schoolAdminBearerAuth: []
 *     responses:
 *       200:
 *         description: Dữ liệu dashboard
 *       401:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy trường học
 *       500:
 *         description: Lỗi server
 */
router.get('/dashboard', authenticateSchoolAccount, async (req, res) => {
    try {
        const schoolId = req.user.school;
        const dashboardData = await getSchoolDashboardData(schoolId);
        res.status(200).json(dashboardData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
