import express from 'express';
import Student from '../models/Student.js';
import School from '../models/School.js';
import Task from '../models/Task.js'
import Major from '../models/Major.js';
import authenticate from '../middlewares/authenticate.js';
import { handleError } from '../utils/errorHandler.js';
import { useRegistrationImageUpload, useExcelUpload } from '../utils/upload.js';
import { sendEmail } from '../utils/emailService.js';
import { accountActivationTemplate, emailChangeConfirmationTemplate, passwordResetTemplate, newAccountCreatedTemplate } from '../utils/emailTemplates.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { encrypt, decrypt } from '../utils/encryption.js';
import { emailChangeLimiter } from '../utils/rateLimiter.js';
import axios from 'axios';
import mongoose from 'mongoose';
import { handleQuery } from '../utils/queryHelper.js';
import { getSchoolDashboardData } from '../models/dashboard.js';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import * as xlsx from 'xlsx';
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
        const school = await School.findById(user.school);

        if (!school) {
            return res.status(404).json({ message: 'Trường học không tồn tại.' });
        }

        const account = school.accounts.id(user._id);
        if (!account) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
        }

        let facultyInfo = null;
        if (account.role && account.role.faculty) {
            const faculty = school.faculties.id(account.role.faculty);
            if (faculty) {
                facultyInfo = {
                    _id: faculty._id,
                    name: faculty.name
                };
            }
        }

        res.status(200).json({
            school: {
                name: school.name,
                address: school.address,
                logo: school.logo,
                isActive: school.isActive,
                isDeleted: school.isDeleted,
                email: school.email
            },
            account: {
                name: account.name,
                email: account.email,
                role: account.role ? account.role.name : null,
                isActive: account.isActive,
                isDeleted: account.isDeleted,
                avatar: account.avatar,
                faculty: facultyInfo
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
        const schoolId = req.user.school;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const count = req.query.count === 'true';

        const school = await School.findById(schoolId).select('accounts faculties');
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        let filteredAccounts = school.accounts;

        // Lọc tài khoản dựa trên vai trò
        if (req.user.role) {
            const userRole = typeof req.user.role === 'string' ? req.user.role : req.user.role.name;
            const userFaculty = typeof req.user.role === 'object' ? req.user.role.faculty : req.user.faculty;

            if (userRole === 'faculty-head' && userFaculty) {
                filteredAccounts = filteredAccounts.filter(account => {
                    const accountRole = typeof account.role === 'string' ? account.role : account.role.name;
                    const accountFaculty = typeof account.role === 'object' ? account.role.faculty : account.faculty;
                    
                    return accountRole !== 'admin' && 
                           accountRole !== 'sub-admin' && 
                           accountFaculty && 
                           accountFaculty.toString() === userFaculty.toString();
                });
            }
        }

        const totalAccounts = filteredAccounts.length;

        if (count) {
            return res.json({ total: totalAccounts });
        }

        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;

        const paginatedAccounts = filteredAccounts.slice(startIndex, endIndex).map(account => {
            const accountData = {
                _id: account._id,
                avatar: account.avatar,
                name: account.name,
                email: account.email,
                role: typeof account.role === 'string' ? account.role : (account.role.name || 'Không xác định'),
                isActive: account.isActive,
                phoneNumber: account.phoneNumber,
                dateOfBirth: account.dateOfBirth
            };

            if (typeof account.role === 'object' && account.role.faculty) {
                const faculty = school.faculties.find(f => f._id.toString() === account.role.faculty.toString());
                if (faculty) {
                    accountData.faculty = {
                        _id: faculty._id,
                        name: faculty.name
                    };
                }
            }

            return accountData;
        });

        res.status(200).json({
            data: paginatedAccounts,
            total: totalAccounts,
            page,
            limit
        });
    } catch (error) {
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
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
router.post('/accounts', authenticateSchoolAccount, async (req, res) => {
    try {
        const schoolId = req.user.school;
        const { name, email, password, role, phoneNumber, dateOfBirth } = req.body;

        if (req.user.role !== 'admin' && req.user.role !== 'faculty-head') {
            return res.status(403).json({ message: 'Bạn không có quyền tạo tài khoản mới.' });
        }

        if (!['sub-admin', 'faculty-head', 'faculty-staff'].includes(role)) {
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
            phoneNumber,
            dateOfBirth,
            isActive: true
        };

        if (['faculty-head', 'faculty-staff'].includes(role)) {
            if (req.user.role === 'faculty-head') {
                newAccount.faculty = req.user.faculty;
            } else if (!req.body.faculty) {
                return res.status(400).json({ message: 'Vui lòng chọn khoa cho tài khoản này.' });
            } else {
                newAccount.faculty = req.body.faculty;
            }
        }

        school.accounts.push(newAccount);
        await school.save();

        res.status(201).json({ message: 'Tài khoản đã được tạo thành công.', account: newAccount });
    } catch (error) {
        const { status, message } = handleError(error);
        res.status(status).json({ message });
    }
});

// Lấy thông tin một tài khoản
router.get('/accounts/:id', authenticateSchoolAccount, async (req, res) => {
    try {
        const schoolId = req.user.school;
        const accountId = req.params.id;

        const school = await School.findById(schoolId).select('accounts faculties');
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        const account = school.accounts.id(accountId);
        if (!account) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
        }

        // Kiểm tra quyền truy cập
        if (req.user.role.name === 'faculty-head') {
            const userFacultyId = req.user.role.faculty ? req.user.role.faculty.toString() : null;
            const accountFacultyId = account.role.faculty ? account.role.faculty.toString() : null;
            if (!userFacultyId || !accountFacultyId || userFacultyId !== accountFacultyId) {
                return res.status(403).json({ message: 'Bạn không có quyền xem thông tin tài khoản này.' });
            }
        }

        if (req.user.role.name === 'faculty-staff' && account._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Bạn chỉ có thể xem thông tin tài khoản của mình.' });
        }

        const accountDetails = {
            _id: account._id,
            name: account.name,
            email: account.email,
            role: {
                name: account.role.name,
                department: account.role.department
            },
            isActive: account.isActive,
            isDeleted: account.isDeleted,
            phoneNumber: account.phoneNumber,
            dateOfBirth: account.dateOfBirth,
            avatar: account.avatar,
            lastLogin: account.lastLogin,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
            lastNotifiedDevice: account.lastNotifiedDevice
        };

        if (account.role.faculty) {
            const faculty = school.faculties.id(account.role.faculty);
            if (faculty) {
                accountDetails.role.faculty = {
                    _id: faculty._id,
                    name: faculty.name
                };
            }
        }

        if (account.role.majors && account.role.majors.length > 0) {
            accountDetails.role.majors = account.role.majors.map(majorId => {
                const major = school.faculties.flatMap(f => f.majors).find(m => m && m._id && m._id.toString() === majorId.toString());
                return major ? { _id: major._id, name: major.name } : null;
            }).filter(Boolean);
        }

        res.status(200).json(accountDetails);
    } catch (error) {
        console.error('Lỗi khi lấy thông tin tài khoản:', error);
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
    }
});

// Cập nhật thông tin tài khoản
router.put('/accounts/:id', authenticateSchoolAccount, async (req, res) => {
    try {
        const schoolId = req.user.school;
        const accountId = req.params.id;
        const { name, email, role, isActive, phoneNumber, dateOfBirth, faculty } = req.body;

        const school = await School.findById(schoolId);
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        const account = school.accounts.id(accountId);
        if (!account) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
        }

        // Kiểm tra quyền cập nhật
        if (req.user.role === 'admin') {
            // Admin có toàn quyền, trừ việc chỉnh sửa tài khoản admin khác
            if (account.role.name === 'admin' && account._id.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'Không thể chỉnh sửa tài khoản admin khác.' });
            }
        } else if (req.user.role === 'faculty-head') {
            // Trưởng khoa chỉ có thể chỉnh sửa tài khoản trong khoa của mình
            if (!account.role.faculty || account.role.faculty.toString() !== req.user.role.faculty.toString()) {
                return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa tài khoản này.' });
            }
            // Trưởng khoa không thể thay đổi vai trò thành admin hoặc sub-admin
            if (role && ['admin', 'sub-admin'].includes(role)) {
                return res.status(403).json({ message: 'Bạn không có quyền thay đổi vai trò này.' });
            }
        } else if (req.user.role === 'faculty-staff') {
            // Giáo vụ khoa chỉ có thể chỉnh sửa tài khoản của mình
            if (account._id.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'Bạn chỉ có thể chỉnh sửa tài khoản của mình.' });
            }
            // Giáo vụ khoa không thể thay đổi vai trò hoặc trạng thái kích hoạt
            if (role || isActive !== undefined) {
                return res.status(403).json({ message: 'Bạn không có quyền thay đổi vai trò hoặc trạng thái kích hoạt.' });
            }
        }

        // Không cho phép thay đổi vai trò của tài khoản admin
        if (account.role === 'admin') {
            return res.status(403).json({ message: 'Không thể thay đổi vai trò của tài khoản admin.' });
        }

        // Cập nhật thông tin tài khoản
        if (name) account.name = name;
        if (email) account.email = email;
        if (role && typeof role === 'object') {
            if (role.name && role.name !== 'admin') {
                account.role.name = role.name;
            }
            if (role.faculty) {
                account.role.faculty = role.faculty;
            }
        }
        if (isActive !== undefined) {
            account.isActive = isActive;
        }
        if (phoneNumber) account.phoneNumber = phoneNumber;
        if (dateOfBirth) account.dateOfBirth = dateOfBirth;

        await school.save();

        res.status(200).json({ message: 'Cập nhật tài khoản thành công.', account });
    } catch (error) {
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
    }
});

// Xóa tài khoản
router.delete('/accounts/:id', authenticateSchoolAccount, async (req, res) => {
    try {
        const schoolId = req.user.school;
        const accountId = req.params.id;

        const school = await School.findById(schoolId);
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        const accountIndex = school.accounts.findIndex(account => account._id.toString() === accountId);
        if (accountIndex === -1) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
        }

        const accountToDelete = school.accounts[accountIndex];

        // Kiểm tra quyền xóa
        if (req.user.role === 'admin') {
            // Admin có thể xóa mọi tài khoản trừ tài khoản admin khác
            if (accountToDelete.role.name === 'admin' && accountToDelete._id.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'Không thể xóa tài khoản admin khác.' });
            }
        } else if (req.user.role === 'faculty-head') {
            // Trưởng khoa chỉ có thể xóa tài khoản trong khoa của mình
            if (!accountToDelete.role.faculty || accountToDelete.role.faculty.toString() !== req.user.role.faculty.toString()) {
                return res.status(403).json({ message: 'Bạn không có quyền xóa tài khoản này.' });
            }
            // Trưởng khoa không thể xóa tài khoản admin hoặc sub-admin
            if (['admin', 'sub-admin'].includes(accountToDelete.role.name)) {
                return res.status(403).json({ message: 'Bạn không có quyền xóa tài khoản này.' });
            }
        } else {
            return res.status(403).json({ message: 'Bạn không có quyền xóa tài khoản.' });
        }

        school.accounts.splice(accountIndex, 1);
        await school.save();

        res.status(200).json({ message: 'Tài khoản đã được xóa thành công.' });
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

router.post('/review-password-rule', authenticateSchoolAccount, async (req, res) => {
    const { passwordRule, dateOfBirth } = req.body;

    try {
        const School = mongoose.model('School');
        const password = School.generatePasswordFromRule({ template: passwordRule }, dateOfBirth);
        res.status(200).json({ password });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});
// Xem quy tắc mật khẩu hiện tại
router.get('/password-rule', authenticateSchoolAccount, async (req, res) => {
    try {
        const schoolId = req.user.school;
        const school = await School.findById(schoolId).select('studentApiConfig.passwordRule');

        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        if (!school.studentApiConfig || !school.studentApiConfig.passwordRule) {
            return res.status(404).json({ message: 'Chưa cấu hình quy tắc mật khẩu.' });
        }

        res.status(200).json({
            passwordRule: school.studentApiConfig.passwordRule.template
        });
    } catch (error) {
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
    }
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

        // Lấy thông tin về khoa
        const school = await School.findById(schoolId).select('faculties');
        const facultiesMap = new Map(school.faculties.map(f => [f._id.toString(), f.name]));

        const studentsWithFaculty = students.map(student => {
            const facultyName = student.major && student.major._id ?
                facultiesMap.get(student.major._id.toString()) : 'Chưa xác định';
            return {
                ...student.toObject(),
                facultyName
            };
        });

        res.status(200).json({
            students: studentsWithFaculty,
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

        school.studentApiConfig.passwordRule = { template: passwordRule };
        await school.save();

        res.status(200).json({ message: 'Cập nhật quy tắc mật khẩu thành công.', passwordRule: school.studentApiConfig.passwordRule });
    } catch (error) {
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
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
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        let query = {};
        let majors = [];
        let total = 0;

        if (req.query.search) {
            majors = await Major.findByFlexibleName(req.query.search);
            total = majors.length;
            majors = majors.slice((page - 1) * limit, page * limit);
        } else {
            total = await Major.countDocuments(query);
            majors = await Major.find(query)
                .select('_id name description')
                .sort({ name: 1 })
                .skip((page - 1) * limit)
                .limit(limit);
        }

        const formattedMajors = majors.map(major => ({
            _id: major._id,
            name: major.name,
            description: major.description
        }));

        res.status(200).json({
            majors: formattedMajors,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalMajors: total
        });
    } catch (error) {
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
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
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
    }
});
// route tạo khoa mới
router.post('/create-faculty', authenticateSchoolAdmin, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const schoolId = req.user.school;
        const { facultyName, facultyDescription, majors } = req.body;

        const school = await School.findById(schoolId).session(session);
        if (!school) {
            throw new Error('Không tìm thấy trường học.');
        }

        const existingFaculty = school.faculties.find(faculty => faculty.name === facultyName);
        if (existingFaculty) {
            throw new Error('Khoa đã tồn tại.');
        }

        const processedMajors = await Promise.all(majors.map(async (major) => {
            let majorName = typeof major === 'string' ? major : (major.name || '');
            if (!majorName.trim()) {
                throw new Error('Tên ngành học không được để trống');
            }
            majorName = majorName.trim();

            let existingMajor = await Major.findOne({ name: { $regex: new RegExp(`^${majorName}$`, 'i') } }).session(session);
            if (!existingMajor) {
                existingMajor = new Major({ name: majorName });
                await existingMajor.save({ session });
            }
            return existingMajor._id;
        }));

        const uniqueMajors = [...new Set(processedMajors)];

        const newFaculty = {
            _id: new mongoose.Types.ObjectId(),
            name: facultyName,
            description: facultyDescription,
            majors: uniqueMajors
        };

        school.faculties.push(newFaculty);
        await school.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: 'Tạo khoa thành công.',
            faculty: newFaculty
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
    }
});

router.get('/faculties', authenticateSchoolAdmin, async (req, res) => {
    try {
        const schoolId = req.user.school;
        const school = await School.findById(schoolId)
            .populate('faculties.majors', 'name')
            .populate({
                path: 'accounts',
                match: { 'role.name': 'faculty-head' },  // Chỉ lấy tài khoản có vai trò là trưởng khoa
                select: 'name role.faculty'
            })
            .lean();

        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        const formattedFaculties = school.faculties.map(faculty => {
            const facultyHead = school.accounts.find(account =>
                account.role &&
                account.role.name === 'faculty-head' &&  // Đảm bảo chỉ lấy trưởng khoa
                account.role.faculty &&
                account.role.faculty.toString() === faculty._id.toString()
            );

            return {
                _id: faculty._id,
                name: faculty.name,
                description: faculty.description,
                majorsCount: faculty.majors.length,
                headName: facultyHead ? facultyHead.name : 'Chưa có trưởng khoa'
            };
        });

        res.status(200).json(formattedFaculties);
    } catch (error) {
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
    }
});
router.get('/faculties/:id', authenticateSchoolAdmin, async (req, res) => {
    try {
        const schoolId = req.user.school;
        const facultyId = req.params.id;

        const school = await School.findById(schoolId).populate('faculties.majors', 'name');
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        const faculty = school.faculties.id(facultyId);
        if (!faculty) {
            return res.status(404).json({ message: 'Không tìm thấy khoa.' });
        }

        const facultyHead = school.accounts.find(account =>
            account.role.name === 'faculty-head' && account.role.faculty && account.role.faculty.toString() === facultyId
        );

        const facultyStaff = school.accounts.filter(account =>
            account.role.name === 'faculty-staff' && account.role.faculty && account.role.faculty.toString() === facultyId
        ).map(staff => ({
            _id: staff._id,
            name: staff.name,
            avatar: staff.avatar
        }));

        const formattedFaculty = {
            _id: faculty._id,
            name: faculty.name,
            description: faculty.description,
            avatar: faculty.avatar,
            majors: faculty.majors.map(major => ({
                _id: major._id,
                name: major.name
            })),
            head: facultyHead ? {
                _id: facultyHead._id,
                name: facultyHead.name,
                email: facultyHead.email,
                avatar: facultyHead.avatar
            } : null,
            staff: facultyStaff,
            studentsCount: await Student.countDocuments({ major: { $in: faculty.majors } }),
            tasksCount: facultyHead ? await Task.countDocuments({ assignedBy: facultyHead._id }) : 0
        };

        res.status(200).json(formattedFaculty);
    } catch (error) {
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
    }
});

router.put('/faculties/:id', authenticateSchoolAdmin, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const schoolId = req.user.school;
        const facultyId = req.params.id;
        const { name, description, majors, facultyHeadId } = req.body;

        const school = await School.findById(schoolId).session(session);
        if (!school) {
            throw new Error('Không tìm thấy trường học.');
        }

        const faculty = school.faculties.id(facultyId);
        if (!faculty) {
            throw new Error('Không tìm thấy khoa.');
        }

        faculty.name = name || faculty.name;
        faculty.description = description || faculty.description;

        // Xử lý thay đổi trưởng khoa
        if (facultyHeadId !== undefined) {
            await school.updateFacultyHead(facultyId, facultyHeadId, session);
        }

        if (majors && Array.isArray(majors)) {
            const processedMajors = await Promise.all(majors.map(async (major) => {
                if (mongoose.Types.ObjectId.isValid(major)) {
                    const existingMajor = await Major.findById(major).session(session);
                    if (!existingMajor) {
                        throw new Error(`Không tìm thấy ngành học với ID: ${major}`);
                    }
                    return existingMajor._id;
                } else {
                    let majorName = typeof major === 'string' ? major : (major.name || '');
                    if (!majorName.trim()) {
                        throw new Error('Tên ngành học không được để trống');
                    }
                    majorName = majorName.trim();

                    const normalizedName = majorName.toLowerCase().replace(/[^a-z0-9]/g, '');

                    let existingMajor = await Major.findOne({
                        $or: [
                            { name: { $regex: new RegExp(`^${majorName}$`, 'i') } },
                            { name: { $regex: new RegExp(`^${normalizedName}$`, 'i') } },
                            { abbreviation: { $regex: new RegExp(`^${normalizedName}$`, 'i') } }
                        ]
                    }).session(session);

                    if (!existingMajor) {
                        existingMajor = new Major({
                            name: majorName,
                            abbreviation: normalizedName
                        });
                        await existingMajor.save({ session });
                    }
                    return existingMajor._id;
                }
            }));

            faculty.majors = [...new Set(processedMajors)];
        }

        await school.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ message: 'Cập nhật thông tin khoa thành công.', faculty });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
    }
});
router.delete('/faculties/:id', authenticateSchoolAdmin, async (req, res) => {
    try {
        const schoolId = req.user.school;
        const facultyId = req.params.id;

        const school = await School.findById(schoolId);
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học.' });
        }

        const facultyIndex = school.faculties.findIndex(faculty => faculty._id.toString() === facultyId);

        if (facultyIndex === -1) {
            return res.status(404).json({ message: 'Không tìm thấy khoa.' });
        }

        // Kiểm tra xem có tài khoản faculty head nào đang quản lý khoa này không
        const hasFacultyHead = school.accounts.some(account =>
            account.role &&
            account.role.name === 'faculty-head' &&
            account.role.faculty &&
            account.role.faculty.toString() === facultyId
        );

        if (hasFacultyHead) {
            return res.status(400).json({ message: 'Không thể xóa khoa vì vẫn còn tài khoản faculty head đang quản lý.' });
        }

        school.faculties.splice(facultyIndex, 1);
        await school.save();

        res.status(200).json({ message: 'Đã xóa khoa thành công.' });
    } catch (error) {
        const errorResponse = handleError(error);
        res.status(errorResponse.status).json({ message: errorResponse.message });
    }
});

export default router;


