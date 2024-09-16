import express from 'express';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import Company from '../models/Company.js';
import Student from '../models/Student.js';
import { handleError } from '../utils/errorHandler.js';
import { publicLimiter, loginLimiter } from '../utils/rateLimiter.js';
import useragent from 'useragent';
import geoip from 'geoip-lite';
import { generateTokens, saveLoginHistory, prepareLoginResponse } from '../utils/authUtils.js';
import bcrypt from 'bcryptjs';
import LoginHistory from '../models/LoginHistory.js';
import Notification from '../models/Notification.js';
import authenticate from '../middlewares/authenticate.js';

const router = express.Router();

const isNewDevice = async (user, userModel, ipAddress, userAgent) => {
  const existingLogin = await LoginHistory.findOne({
    user: user._id,
    userModel: userModel,
    ipAddress: ipAddress,
    userAgent: userAgent
  });
  
  return !existingLogin;
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

    const isNewDev = await isNewDevice(admin, 'Admin', ipAddress, req.headers['user-agent']);
    if (isNewDev) {
      await Notification.insert({
        recipient: admin._id,
        recipientModel: 'Admin',
        type: 'account',
        content: 'Đăng nhập từ thiết bị mới được phát hiện. Nếu không phải bạn, hãy thay đổi mật khẩu ngay lập tức.'
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
  try {
    if (!companyId || companyId.trim() === '') {
      throw new Error('ID công ty không hợp lệ.');
    }

    if (!email || email.trim() === '') {
      throw new Error('Email không được để trống.');
    }

    if (!password || password.trim() === '') {
      throw new Error('Mật khẩu không được để trống.');
    }

    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Thông tin đăng nhập không chính xác.');
    }

    if (company.isDeleted || !company.isActive) {
      throw new Error('Tài khoản công ty đang được xử lý, vui lòng thử lại sau.');
    }

    const account = company.accounts.find(acc => acc.email === email && !acc.isDeleted);
    if (!account) {
      throw new Error('Thông tin đăng nhập không chính xác.');
    }

    if (!account.isActive) {
      throw new Error('Tài khoản đã bị vô hiệu hóa, hãy liên hệ cho bộ phận hỗ trợ.');
    }

    const isPasswordValid = await bcrypt.compare(password, account.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Thông tin đăng nhập không chính xác.');
    }

    const ipAddress = req.ip;
    const { accessToken, refreshToken } = generateTokens(account, 'CompanyAccount', ipAddress, { companyId: company._id });

    account.refreshToken = refreshToken;
    await company.save();

    await saveLoginHistory(req, account, 'CompanyAccount', true);

    const isNewDev = await isNewDevice(account, 'CompanyAccount', ipAddress, req.headers['user-agent']);
    if (isNewDev) {
      await Notification.insert({
        recipient: account._id,
        recipientModel: 'CompanyAccount',
        recipientRole: account.role,
        type: 'account',
        content: 'Đăng nhập từ thiết bị mới được phát hiện. Nếu không phải bạn, hãy thay đổi mật khẩu ngay lập tức.'
      });
    }

    loginSuccess = true;
    return res.status(200).json(prepareLoginResponse(account, accessToken, refreshToken));
  } catch (error) {
    if (!res.headersSent) {
      await saveLoginHistory(req, null, 'CompanyAccount', false, error.message);
      const { status, message } = handleError(error);
      return res.status(status).json({ message });
    }
  } finally {
    if (!loginSuccess && !res.headersSent) {
      await saveLoginHistory(req, null, 'CompanyAccount', false, 'Đăng nhập thất bại');
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
    const { schoolId, email, password } = req.body;
    let loginSuccess = false;
    try {
        if (!schoolId || schoolId.trim() === '') {
            throw new Error('ID trường không hợp lệ.');
        }

        if (!email || email.trim() === '') {
            throw new Error('Email không được để trống.');
        }

        if (!password || password.trim() === '') {
            throw new Error('Mật khẩu không được để trống.');
        }

        const school = await School.findById(schoolId);
        if (!school) {
            throw new Error('Thông tin đăng nhập không chính xác.');
        }

        if (school.isDeleted || !school.isActive) {
            throw new Error('Tài khoản trường học đã bị vô hiệu hóa, hãy liên hệ cho bộ phận hỗ trợ.');
        }

        const account = school.accounts.find(acc => acc.email === email && !acc.isDeleted);
        if (!account) {
            throw new Error('Thông tin đăng nhập không chính xác.');
        }

        if (!account.isActive) {
            throw new Error('Tài khoản đã bị vô hiệu hóa, hãy liên hệ cho bộ phận hỗ trợ.');
        }

        const isPasswordValid = await bcrypt.compare(password, account.passwordHash);
        if (!isPasswordValid) {
            throw new Error('Thông tin đăng nhập không chính xác.');
        }

        const ipAddress = req.ip;
        const { accessToken, refreshToken } = generateTokens(account, 'SchoolAccount', ipAddress);

        account.refreshToken = refreshToken;
        await school.save();

        await saveLoginHistory(req, account, 'SchoolAccount', true);

        loginSuccess = true;
        return res.status(200).json(prepareLoginResponse(account, accessToken, refreshToken));
    } catch (error) {
        if (!res.headersSent) {
            await saveLoginHistory(req, null, 'SchoolAccount', false, error.message);
            const { status, message } = handleError(error);
            return res.status(status).json({ message });
        }
    } finally {
        if (!loginSuccess && !res.headersSent) {
            await saveLoginHistory(req, null, 'SchoolAccount', false, 'Đăng nhập thất bại');
            return res.status(500).json({ message: 'Đã xảy ra lỗi trong quá trình đăng nhập.' });
        }
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
const loginStudent = async (req, res) => {
  let loginSuccess = false;
  try {
    const { schoolId, studentId, password } = req.body;

    if (!schoolId || schoolId.trim() === '') {
      throw new Error('ID trường không hợp lệ.');
    }

    if (!studentId || studentId.trim() === '') {
      throw new Error('ID sinh viên không được để trống.');
    }

    if (!password || password.trim() === '') {
      throw new Error('Mật khẩu không được để trống.');
    }

    const student = await Student.login(schoolId, studentId, password);

    if (!student.isActive) {
      throw new Error('Tài khoản đã bị vô hiệu hóa, hãy liên hệ cho bộ phận hỗ trợ.');
    }
    
    const ipAddress = req.ip;
    const { accessToken, refreshToken } = generateTokens(student, 'Student', ipAddress);

    student.refreshToken = refreshToken;
    await student.save();

    await saveLoginHistory(req, student, 'Student', true);

    const isNewDev = await isNewDevice(student, 'Student', ipAddress, req.headers['user-agent']);
    if (isNewDev) {
      await Notification.insert({
        recipient: student._id,
        recipientModel: 'Student',
        type: 'account',
        content: 'Đăng nhập từ thiết bị mới được phát hiện. Nếu không phải bạn, hãy thay đổi mật khẩu ngay lập tức.'
      });
    }

    loginSuccess = true;
    return res.json(prepareLoginResponse(student, accessToken, refreshToken));
  } catch (error) {
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
router.post('/logout', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ message: 'Refresh token là bắt buộc' });
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        let user;

        switch (decoded.model) {
            case 'Admin':
                user = await Admin.findById(decoded._id);
                if (user) {
                    user.refreshToken = null;
                    await user.save();
                }
                break;
            case 'CompanyAccount':
                const company = await Company.findById(decoded.companyId);
                if (company) {
                    const account = company.accounts.id(decoded._id);
                    if (account) {
                        account.refreshToken = null;
                        await company.save();
                    }
                }
                break;
            case 'SchoolAccount':
                const school = await School.findById(decoded.schoolId);
                if (school) {
                    const account = school.accounts.id(decoded._id);
                    if (account) {
                        account.refreshToken = null;
                        await school.save();
                    }
                }
                break;
            case 'Student':
                user = await Student.findById(decoded._id);
                if (user) {
                    user.refreshToken = null;
                    await user.save();
                }
                break;
            default:
                return res.status(400).json({ message: 'Loại người dùng không hợp lệ' });
        }

        res.json({ message: 'Đăng xuất thành công' });
    } catch (error) {
        res.status(401).json({ message: 'Refresh token không hợp lệ' });
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
      content: 'Mật khẩu của bạn đã được thay đổi thành công.'
    });

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

