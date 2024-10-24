import express from 'express';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import Company from '../models/Company.js';
import Student from '../models/Student.js';
import { handleError } from '../utils/errorHandler.js';
import { publicLimiter, loginLimiter } from '../utils/rateLimiter.js';
import { sendEmail } from '../utils/emailService.js';
import { passwordResetTemplate } from '../utils/emailTemplates.js';
import useragent from 'useragent';
import geoip from 'geoip-lite';
import { generateTokens, saveLoginHistory, prepareLoginResponse } from '../utils/authUtils.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import LoginHistory from '../models/LoginHistory.js';
import Notification from '../models/Notification.js';
import authenticate from '../middlewares/authenticate.js';
import School from '../models/School.js';
import notificationMessages from '../utils/notificationMessages.js'; // Import notificationMessages
import axios from 'axios';
import UserDevice from '../models/UserDevice.js';
import mongoose from 'mongoose';

const router = express.Router();

const isNewDevice = async (user, userModel, ipAddress, userAgent) => {
  const deviceInfo = parseUserAgent(userAgent);
  
  const existingDevice = await UserDevice.findOne({
    userId: user._id,
    userModel: userModel,
    'deviceInfo.os': deviceInfo.os,
    'deviceInfo.browser': deviceInfo.browser,
    'deviceInfo.device': deviceInfo.device
  });

  if (!existingDevice) {
    const newDevice = new UserDevice({
      userId: user._id,
      userModel: userModel,
      deviceInfo: deviceInfo,
      ipAddress: ipAddress
    });
    await newDevice.save();

    return true;
  }

  // Cập nhật thời gian sử dụng cuối cùng
  existingDevice.lastUsed = new Date();
  await existingDevice.save();

  return false;
};

/**
 * @swagger
 * /api/auth/register/admin:
 *   post:
 *     summary: Đăng ký tài khoản admin
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Đăng ký tài khoản thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 */
const registerAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = new Admin({ username, password });
    await admin.save();
    const token = jwt.sign({ _id: admin._id, model: 'Admin' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    res.status(201).json({
      message: "Đăng ký tài khoản thành công",
      admin: { _id: admin._id, username: admin.username, role: admin.role },
      token
    });
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
};

/**
 * @swagger
 * /api/auth/login/admin:
 *   post:
 *     summary: Đăng nhập admin
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 */
const loginAdmin = async (req, res) => {
  let loginSuccess = false;
  try {
    const { username, password } = req.body;

    if (!username || username.trim() === '') {
      throw new Error('Tên đăng nhập không được để trống.');
    }

    if (!password || password.trim() === '') {
      throw new Error('Mật khẩu không được để trống.');
    }

    const admin = await Admin.login(username, password);

    if (!admin) {
      throw new Error('Thông tin đăng nhập không chính xác.');
    }

    const ipAddress = req.ip;
    const { accessToken, refreshToken } = generateTokens(admin, 'Admin', ipAddress);

    admin.refreshToken = refreshToken;
    await admin.save();

    await saveLoginHistory(req, admin, 'Admin', true);

    if (await isNewDevice(admin, 'Admin', ipAddress, req.headers['user-agent'])) {
      // Gửi thông báo về thiết bị mới
      await Notification.insert({
        recipient: admin._id,
        recipientModel: 'Admin',
        type: 'account',
        content: notificationMessages.account.newDeviceLogin()
      });
    }

    loginSuccess = true;
    return res.json(prepareLoginResponse(admin, accessToken, refreshToken));
  } catch (error) {
    if (!res.headersSent) {
      await saveLoginHistory(req, null, 'Admin', false, error.message);
      const { status, message } = handleError(error);
      return res.status(status).json({ message });
    }
  } finally {
    if (!loginSuccess && !res.headersSent) {
      await saveLoginHistory(req, null, 'Admin', false, 'Đăng nhập thất bại');
      return res.status(500).json({ message: 'Đã xảy ra lỗi trong quá trình đăng nhập.' });
    }
  }
};

/**
 * @swagger
 * /api/auth/login/company:
 *   post:
 *     summary: Đăng nhập công ty
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyId:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 */
const loginCompany = async (req, res) => {
  const { companyId, email, password } = req.body;
  let loginSuccess = false;
  let account = null;
  try {
    if (!companyId || companyId.trim() === '') {
      return res.status(400).json({ message: 'ID công ty không hợp lệ.' });
    }

    if (!email || email.trim() === '') {
      return res.status(400).json({ message: 'Email không được để trống.' });
    }

    if (!password || password.trim() === '') {
      return res.status(400).json({ message: 'Mật khẩu không được để trống.' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(400).json({ message: 'Không tìm thấy công ty với ID này.' });
    }

    if (company.isDeleted || !company.isActive) {
      return res.status(400).json({ message: 'Tài khoản công ty đang được xử lý, vui lòng thử lại sau.' });
    }

    account = company.accounts.find(acc => acc.email === email && !acc.isDeleted);
    if (!account) {
      return res.status(400).json({ message: 'Thông tin đăng nhập không chính xác.' });
    }

    if (!account.isActive) {
      return res.status(400).json({ message: 'Tài khoản đã bị vô hiệu hóa, hãy liên hệ cho bộ phận hỗ trợ.' });
    }

    const isPasswordValid = await bcrypt.compare(password, account.passwordHash);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Thông tin đăng nhập không chính xác.' });
    }

    const ipAddress = req.ip;
    const { accessToken, refreshToken } = generateTokens(account, 'CompanyAccount', ipAddress, { companyId: company._id });

    account.refreshToken = refreshToken;
    await company.save();

    await saveLoginHistory(req, account, 'CompanyAccount', true);

    if (await isNewDevice(account, 'CompanyAccount', ipAddress, req.headers['user-agent'])) {
      await Notification.insert({
        recipient: account._id,
        recipientModel: 'CompanyAccount',
        recipientRole: account.role,
        type: 'account',
        content: notificationMessages.account.newDeviceLogin()
      });
    }

    loginSuccess = true;
    return res.json({
      message: 'Đăng nhập thành công',
      user: {
        _id: account._id,
        email: account.email,
        role: account.role,
        companyId: company._id,
        companyName: company.name
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Lỗi trong quá trình đăng nhập công ty:', error);
    if (!res.headersSent) {
      await saveLoginHistory(req, account, 'CompanyAccount', false, error.message);
      const { status, message } = handleError(error);
      return res.status(status).json({ message });
    }
  } finally {
    if (!loginSuccess && !res.headersSent) {
      await saveLoginHistory(req, account, 'CompanyAccount', false, 'Đăng nhập thất bại');
      return res.status(500).json({ message: 'Đã xảy ra lỗi trong quá trình đăng nhập.' });
    }
  }
};

/**
 * @swagger
 * /api/auth/login/school:
 *   post:
 *     summary: Đăng nhập trường học
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               schoolId:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 */
const loginSchool = async (req, res) => {
  let loginSuccess = false;
  let user = null;
  try {
    const { schoolId, email, password } = req.body;

    if (!schoolId || !email || !password) {
      throw new Error('Vui lòng cung cấp đầy đủ thông tin đăng nhập.');
    }

    user = await School.login(schoolId, email, password);
    loginSuccess = true;

    const { accessToken, refreshToken } = generateTokens(user, 'SchoolAccount', req.ip, { schoolId: user.schoolId });

    const loginResponse = await prepareLoginResponse(user, 'SchoolAccount', accessToken, refreshToken, req);

    res.status(200).json(loginResponse);
  } catch (error) {
    console.error('Lỗi trong quá trình đăng nhập trường học:', error);
    const errorResponse = handleError(error);
    res.status(errorResponse.status).json({ message: errorResponse.message });
  } finally {
    await saveLoginHistory(req, user, 'SchoolAccount', loginSuccess, loginSuccess ? null : 'Thông tin đăng nhập không chính xác');
  }
};

/**
 * @swagger
 * /api/auth/login/student:
 *   post:
 *     summary: Đăng nhập sinh viên
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               schoolId:
 *                 type: string
 *               studentId:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       404:
 *         description: Không tìm thấy thông tin trường học
 *       500:
 *         description: Lỗi máy chủ
 */
const loginStudent = async (req, res) => {
  let loginSuccess = false;
  try {
    const { schoolId, studentId, password } = req.body;

    if (!schoolId || schoolId.trim() === '') {
      return res.status(400).json({ message: 'ID trường không hợp lệ.' });
    }

    if (!studentId || studentId.trim() === '') {
      return res.status(400).json({ message: 'ID sinh viên không được để trống.' });
    }

    if (!password || password.trim() === '') {
      return res.status(400).json({ message: 'Mật khẩu không được để trống.' });
    }

    const student = await Student.findBySchoolAndStudentId(schoolId, studentId);
    console.log(`Result of finding student: ${JSON.stringify(student)}`);

    if (!student) {
      return res.status(400).json({ message: 'Thông tin đăng nhập không chính xác.' });
    }

    if (!student.isApproved) {
      return res.status(400).json({ message: 'Tài khoản chưa được phê duyệt, hãy liên hệ trường của bạn.' });
    }

    const isPasswordValid = await bcrypt.compare(password, student.passwordHash);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Thông tin đăng nhập không chính xác.' });
    }

    const ipAddress = req.ip;
    const { accessToken, refreshToken } = generateTokens(student, 'Student', ipAddress);

    student.refreshToken = refreshToken;
    await student.save();

    await saveLoginHistory(req, student, 'Student', true);

    if (await isNewDevice(student, 'Student', ipAddress, req.headers['user-agent'])) {
      await Notification.insert({
        recipient: student._id,
        recipientModel: 'Student',
        type: 'account',
        content: notificationMessages.account.newDeviceLogin()
      });
    }

    loginSuccess = true;
    return res.json(await prepareLoginResponse(student, 'Student', accessToken, refreshToken, req));
  } catch (error) {
    console.error('Lỗi trong quá trình đăng nhập:', error);
    if (!res.headersSent) {
      await saveLoginHistory(req, null, 'Student', false, error.message);
      const { status, message } = handleError(error);
      return res.status(status).json({ message });
    }
  } finally {
    if (!loginSuccess && !res.headersSent) {
      await saveLoginHistory(req, null, 'Student', false, 'Đăng nhập thất bại');
      return res.status(500).json({ message: 'Đã xảy ra lỗi trong quá trình đăng nhập.' });
    }
  }
};

// Áp dụng riêng cho các routes đăng nhập
router.post('/login/admin', loginLimiter, loginAdmin);
router.post('/login/company', loginLimiter, loginCompany);
router.post('/login/school', loginLimiter, loginSchool);
router.post('/login/student', loginLimiter, loginStudent);

router.post('/register/admin', registerAdmin);

/**
 * @swagger
 * /api/auth/companies:
 *   get:
 *     summary: Lấy danh sách các công ty
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Danh sách các công ty
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   logo:
 *                     type: string
 */
const getCompanies = async (req, res) => {
  try {
    const { query } = req.query;
    let companies;

    if (!query || query.length < 2) {
      return res.status(400).json({ message: 'Vui lòng nhập ít nhất 2 ký tự để tìm kiếm.' });
    }

    if (query.length === 24 && /^[0-9a-fA-F]{24}$/.test(query)) {
      // Nếu query là một ID hợp lệ
      companies = await Company.find({ _id: query }, 'id name logo');
    } else {
      // Tìm kiếm theo tên công ty
      companies = await Company.find(
        { name: { $regex: query, $options: 'i' } },
        'id name logo'
      ).limit(10);
    }

    res.status(200).json(companies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

router.get('/companies', publicLimiter, getCompanies);

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: Làm mới token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token mới được tạo thành công
 *       401:
 *         description: Refresh token không hợp lệ
 */
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh token là bắt buộc' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    let user;

    switch (decoded.model) {
      case 'Admin':
        user = await Admin.findById(decoded._id);
        break;
      case 'CompanyAccount':
        const company = await Company.findById(decoded.companyId);
        if (!company) {
          return res.status(403).json({ message: 'Công ty không tồn tại' });
        }
        user = company.accounts.id(decoded._id);
        if (!user) {
          return res.status(403).json({ message: 'Tài khoản không tồn tại' });
        }
        break;
      case 'SchoolAccount':
        const school = await School.findById(decoded.schoolId);
        if (school) {
          user = school.accounts.id(decoded._id);
        }
        break;
      case 'Student':
        user = await Student.findById(decoded._id);
        break;
      default:
        return res.status(403).json({ message: 'Loại người dùng không hợp lệ' });
    }

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: 'Refresh token không hợp lệ' });
    }

    const ipAddress = req.ip;
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user, decoded.model, ipAddress, { companyId: decoded.companyId });

    user.refreshToken = newRefreshToken;
    await (decoded.model === 'CompanyAccount' ? Company.findOneAndUpdate(
      { _id: decoded.companyId, 'accounts._id': user._id },
      { $set: { 'accounts.$.refreshToken': newRefreshToken } }
    ) : user.save());

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    res.status(403).json({ message: 'Refresh token không hợp lệ' });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Đăng xuất
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 *       400:
 *         description: Refresh token không hợp lệ
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const userModel = req.userModel;

    // Xóa refresh token khỏi cơ sở dữ liệu
    user.refreshToken = undefined;
    await user.save();

    // Ghi lại lịch sử đăng xuất
    await saveLoginHistory(req, user, userModel, true, 'Đăng xuất thành công');

    res.status(200).json({ message: 'Đăng xuất thành công' });
  } catch (error) {
    console.error('Lỗi khi đăng xuất:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi đăng xuất' });
  }
});

function parseUserAgent(ua) {
  const agent = useragent.parse(ua);
  return {
    browser: agent.family,
    version: agent.major,
    os: agent.os.family
  };
}

function getDeviceType(ua) {
  if (/mobile/i.test(ua)) return 'Mobile';
  if (/tablet/i.test(ua)) return 'Tablet';
  return 'Desktop';
}

async function getLocationFromIP(ip) {
  const geo = geoip.lookup(ip);
  return geo ? {
    country: geo.country,
    city: geo.city,
    latitude: geo.ll[0],
    longitude: geo.ll[1]
  } : null;
}

router.post('/change-password', authenticate(), async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = req.user;
    let userType;

    if (user.constructor.modelName === 'Admin') {
      userType = 'Admin';
    } else if (user.constructor.modelName === 'Student') {
      userType = 'Student';
    } else if (user.role) {
      userType = 'CompanyAccount';
    } else {
      return res.status(400).json({ message: 'Loại người dùng không hợp lệ' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Tạo thông báo đổi mật khẩu thành công
    await Notification.insert({
      recipient: user._id,
      recipientModel: userType,
      recipientRole: user.role,
      type: 'account',
      content: notificationMessages.account.passwordChanged // Sử dụng key từ notificationMessages
    });

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Thêm route này vào cuối file, trước export default router
router.get('/schools', async (req, res) => {
  try {
    const query = req.query.query;

    if (!query || query.length < 2) {
      return res.status(400).json({ message: 'Vui lòng nhập ít nhất 2 ký tự để tìm kiếm.' });
    }

    let searchCriteria = { isDeleted: false };

    if (query.length === 24 && /^[0-9a-fA-F]{24}$/.test(query)) {
      // Nếu query là một ID hợp lệ
      searchCriteria._id = query;
    } else {
      // Tìm kiếm theo tên trường
      searchCriteria.name = { $regex: query, $options: 'i' };
    }

    const schools = await School.find(searchCriteria, '_id name logo').limit(10);

    res.status(200).json(schools);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách trường học', error: error.message });
  }
});

const createAndSendResetToken = async (model, email, entityType) => {
  const entity = await model.findOne({ 'accounts.email': email });
  if (!entity) {
    const error = new Error('Không tìm thấy tài khoản với email này.');
    error.status = 400;
    throw error;
  }

  const account = entity.accounts.find(acc => acc.email === email);
  if (!account) {
    const error = new Error('Không tìm thấy tài khoản với email này.');
    error.status = 400;
    throw error;
  }

  const resetToken = account.createPasswordResetToken();
  await entity.save();

  const resetURL = `${process.env.FRONTEND_URL}/${entityType}/reset-password/${resetToken}`;
  await sendEmail(
    email,
    'Đặt lại mật khẩu của bạn',
    passwordResetTemplate({
      accountName: account.name,
      resetLink: resetURL
    })
  );

  return { message: 'Token đặt lại mật khẩu đã được gửi đến email của bạn.' };
};
const resetPassword = async (model, token, newPassword) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const entity = await model.findOne({
    'accounts.resetPasswordToken': hashedToken,
    'accounts.resetPasswordExpires': { $gt: Date.now() }
  });

  if (!entity) {
    throw new Error('Token không hợp lệ hoặc đã hết hạn.');
  }

  const account = entity.accounts.find(acc => acc.resetPasswordToken === hashedToken);
  if (!account) {
    throw new Error('Không tìm thấy tài khoản.');
  }

  account.password = newPassword;
  account.resetPasswordToken = undefined;
  account.resetPasswordExpires = undefined;

  await entity.save();

  return { message: 'Mật khẩu đã được đặt lại thành công.' };
};

router.post('/forgot-password/:entityType', async (req, res, next) => {
  try {
    const { email } = req.body;
    const { entityType } = req.params;
    let model;

    switch (entityType) {
      case 'company':
        model = Company;
        break;
      case 'school':
        model = School;
        break;
      case 'student':
        model = Student;
        break;
      default:
        return res.status(400).json({ message: 'Loại tài khoản không hợp lệ.' });
    }

    const result = await createAndSendResetToken(model, email, entityType);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password/:entityType/:token', async (req, res, next) => {
  try {
    const { password } = req.body;
    const { token, entityType } = req.params;
    let model;

    switch (entityType) {
      case 'company':
        model = Company;
        break;
      case 'school':
        model = School;
        break;
      case 'student':
        model = Student;
        break;
      default:
        return res.status(400).json({ message: 'Loại tài khoản không hợp lệ.' });
    }

    const result = await resetPassword(model, token, password);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.use((err, req, res, next) => {
  const { status, message } = handleError(err);
  res.status(status).json({ message });
});

export default router;
