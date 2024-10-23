import express from 'express';
import mongoose from 'mongoose';
import authenticate from '../middlewares/authenticate.js';
import Company from '../models/Company.js';
import Project from '../models/Project.js';
import { getCompanyDashboardData } from '../models/dashboard.js';
import { useRegistrationImageUpload } from '../utils/upload.js';
import { sendEmail } from '../utils/emailService.js';
import { accountActivationTemplate, emailChangeConfirmationTemplate, passwordResetTemplate, newAccountCreatedTemplate } from '../utils/emailTemplates.js';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { handleError } from '../utils/errorHandler.js';
import { handleQuery } from '../utils/queryHelper.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { emailChangeLimiter } from '../utils/rateLimiter.js';
import { useImageUpload, handleUploadError } from '../utils/upload.js';
import Major from '../models/Major.js';
import Skill from '../models/Skill.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Rate limiter
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    message: 'Thao tác quá nhiều lần, vui lòng thử lại sau.',
});
const createDirectory = (dir) => {
  if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
  }
};

// Helper functions
const findCompanyAccountById = async (decoded) => {
    return await Company.findCompanyAccountById(decoded);
};

const upload = useRegistrationImageUpload('logos', 'company');

// Middleware xác thực cho admin công ty
const authenticateCompanyAdmin = authenticate(Company, findCompanyAccountById, 'admin');

// Middleware xác thực cho tất cả tài khoản công ty
const authenticateCompanyAccount = authenticate(Company, findCompanyAccountById);

/**
 * @swagger
 * /api/company/companies:
 *   get:
 *     summary: Lấy danh sách các công ty
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
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
 *     description: "Yêu cầu: Tài khoản Company"
 */
router.get('/companies', authenticateCompanyAccount, async (req, res, next) => {
    try {
        const companies = await Company.find({}, 'id name logo');
        const companiesWithProjectCount = await Promise.all(companies.map(async (company) => {
            const projectCount = await Project.countDocuments({ company: company._id });
            return {
                id: company._id,
                name: company.name,
                logo: company.logo,
                projectCount: projectCount
            };
        }));
        res.status(200).json(companiesWithProjectCount);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/company/register:
 *   post:
 *     summary: Đăng ký công ty mới
 *     tags: [Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               address:
 *                 type: string
 *               accountName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               companyName:
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

  try {
    const { address, accountName, email, password, companyName } = req.body;

    const newCompany = new Company({
      name: companyName,
      address: address,
      email: email,
      isActive: false,
      accounts: [{
        name: accountName,
        email: email,
        password: password,
        role: 'admin',
        activationToken: crypto.randomBytes(32).toString('hex'),
        tokenExpiration: Date.now() + 3600000 // 1 giờ
      }]
    });

    await newCompany.save({ session });

    if (req.file) {
      const fileExtension = path.extname(req.file.originalname);
      const newFilename = `${newCompany._id}${fileExtension}`;
      const finalDir = path.join('public', 'uploads', 'logos', 'company', newCompany._id.toString());
      createDirectory(finalDir);
      const finalPath = path.join(finalDir, newFilename);
      fs.renameSync(req.file.path, finalPath);
      newCompany.logo = `uploads/logos/company/${newCompany._id}/${newFilename}`;
      await newCompany.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác nhận tài khoản.',
      companyId: newCompany._id
    });

    // Gửi email xác nhận sau khi đã trả về response
    const activationLink = `http://localhost:5000/api/company/activate/${newCompany.accounts[0].activationToken}`;
    sendEmail(
      email,
      'Xác nhận tài khoản công ty của bạn',
      accountActivationTemplate({
        accountName: accountName,
        companyName: companyName,
        activationLink: activationLink
      })
    ).catch(error => console.error('Lỗi khi gửi email:', error));

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/company/activate/{token}:
 *   get:
 *     summary: Kích hoạt tài khoản công ty
 *     tags: [Companies]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Chuyển hướng đến trang đăng nhập
 */
router.get('/activate/:token', async (req, res, next) => {
    const { token } = req.params;

    try {
        const company = await Company.findOne({ 'accounts.activationToken': token, 'accounts.tokenExpiration': { $gt: Date.now() } });

        if (!company) {
            return res.redirect(`http://localhost:3000/company/login?error=${encodeURIComponent('Token không hợp lệ hoặc đã hết hạn.')}`);
        }

        const account = company.accounts.find(acc => acc.activationToken === token);

        if (!account) {
            return res.redirect(`http://localhost:3000/company/login?error=${encodeURIComponent('Token không hợp lệ hoặc đã hết hạn.')}`);
        }

        account.isActive = true;
        account.activationToken = undefined;
        account.tokenExpiration = undefined;

        await company.save();

        const loginToken = jwt.sign({ companyId: company._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
        res.redirect(`http://localhost:3000/company/login?token=${loginToken}&message=${encodeURIComponent('Xác thực tài khoản thành công, vui lòng đăng nhập để tiếp tục.')}`);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/company/check-email:
 *   post:
 *     summary: Kiểm tra email đã tồn tại
 *     tags: [Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Kết quả kiểm tra
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exists:
 *                   type: boolean
 */
router.post('/check-email', limiter, 
    body('email').isEmail().withMessage('Vui lòng nhập email hợp lệ.'),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email } = req.body;

        try {
            const existingCompany = await Company.exists({ "accounts.email": email });
            return res.status(200).json({ exists: !!existingCompany });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /api/company/me:
 *   get:
 *     summary: Lấy thông tin công ty và tài khoản hiện tại
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin công ty và tài khoản
 *       404:
 *         description: Không tìm thấy công ty
 *     description: "Yêu cầu: Tài khoản Company"
 */
router.get('/me', authenticateCompanyAccount, async (req, res, next) => {
    try {
        const user = req.user;
        const company = await Company.findById(user.company).select('-accounts');

        if (!company) {
            return res.status(404).json({ message: 'Công ty không tồn tại.' });
        }

        res.status(200).json({
            company: {
                name: company.name,
                address: company.address,
                logo: company.logo,
                isActive: company.isActive,
                isDeleted: company.isDeleted,
                email: company.email,
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
        next(error);
    }
});

/**
 * @swagger
 * /api/company/confirm-email-change:
 *   get:
 *     summary: Xác nhận thay đổi email
 *     tags: [Companies]
 *     parameters:
 *       - in: query
 *         name: data
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Chuyển hướng đến trang cá nhân
 *     security:
 *       - companyBearerAuth: []
 */
router.get('/confirm-email-change', async (req, res, next) => {
  const { data } = req.query;

  try {
      const decryptedData = JSON.parse(decrypt(decodeURIComponent(data)));
      const { token, companyId, accountId } = decryptedData;

      const company = await Company.findOne({
          _id: companyId,
          'accounts._id': accountId,
          'accounts.emailChangeToken': token,
          'accounts.emailChangeTokenExpires': { $gt: Date.now() }
      });

      if (!company) {
          return res.redirect(`http://localhost:3000/company/personal?error=${encodeURIComponent('Token không hợp lệ hoặc đã hết hạn.')}`);
      }

      const account = company.accounts.id(accountId);
      if (!account) {
          return res.redirect(`http://localhost:3000/company/personal?error=${encodeURIComponent('Không tìm thấy tài khoản.')}`);
      }

      account.email = account.pendingEmail;
      account.pendingEmail = undefined;
      account.emailChangeToken = undefined;
      account.emailChangeTokenExpires = undefined;

      await company.save();

      // Tạo một token mới nếu cần
      const loginToken = jwt.sign({ companyId: company._id, _id: account._id }, process.env.JWT_SECRET, { expiresIn: '15m' });

      res.redirect(`http://localhost:3000/company/personal?token=${loginToken}&message=${encodeURIComponent('Email đã được xác nhận và cập nhật thành công.')}`);
  } catch (error) {
      next(error);
  }
});


/**
 * @swagger
 * /api/company/accounts:
 *   get:
 *     summary: Lấy danh sách tài khoản trong công ty
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách tài khoản
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   role:
 *                     type: string
 *                   isActive:
 *                     type: boolean
 *                   isDeleted:
 *                     type: boolean
 *     description: "Yêu cầu: Tài khoản Company"
 */
router.get('/accounts', authenticateCompanyAccount, async (req, res, next) => {
  try {
      const accounts = await Company.getFilteredAccounts(req.user.company, req.query);

      // If count is requested, return the total count
      if (req.query.count) {
          return res.json({ total: accounts.length });
      }

      // Pagination
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
      next(error);
  }
});

/**
 * @swagger
 * /api/company/accounts:
 *   post:
 *     summary: Tạo tài khoản mới trong công ty
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
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
 *                 type: string
 *     responses:
 *       201:
 *         description: Tài khoản đã được tạo
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *     description: "Yêu cầu: Tài khoản Admin Company"
 */
router.post('/accounts', authenticateCompanyAdmin, async (req, res, next) => {
    try {
        const companyId = req.user.companyId; // Thông tin công ty từ middleware
        const { name, email, password, role } = req.body;

        // Kiểm tra vai trò hợp lệ
        if (!['sub-admin', 'mentor'].includes(role)) {
            return res.status(400).json({ message: 'Vai trò chỉ có thể là sub-admin hoặc mentor.' });
        }

        // Tìm công ty theo companyId
        const company = await Company.findById(companyId);
        if (!company) {
            return res.status(404).json({ message: 'Không tìm thấy công ty.' });
        }

        // Kiểm tra email đã tồn tại
        const existingAccount = company.accounts.find(account => account.email === email);
        if (existingAccount) {
            return res.status(400).json({ message: 'Email đã được sử dụng.' });
        }

        const newAccount = {
            name,
            email,
            password,
            role,
            isActive: true // Tài khoản được kích hoạt ngay lập tức
        };

        company.accounts.push(newAccount);
        await company.save();

        // Gửi email thông báo tài khoản được tạo thành công
        const emailContent = newAccountCreatedTemplate({
            accountName: name,
            companyName: company.name,
            email: email,
            role: role
        });

        await sendEmail(
            email,
            'Chào mừng bạn đến với ' + company.name,
            emailContent
        );

        res.status(201).json({ message: 'Tài khoản đã được tạo thành công.', account: newAccount });
      } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/company/accounts/{id}:
 *   put:
 *     summary: Cập nhật tài khoản trong công ty
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
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
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               address:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Tài khoản đã được cập nhật
 *       400:
 *         description: Lỗi dữ liệu đầu vào hoặc không thể cập nhật isActive cho tài khoản admin
 *       404:
 *         description: Tài khoản không tồn tại
 *     description: "Yêu cầu: Tài khoản Admin Company"
 */
router.put('/accounts/:id', authenticateCompanyAdmin, async (req, res, next) => {
  try {
      const companyId = req.user.companyId; // Lấy companyId từ request
      if (!companyId) {
          return res.status(400).json({ message: 'Không tìm thấy thông tin công ty.' });
      }

      const company = await Company.findById(companyId);
      if (!company) {
          return res.status(404).json({ message: 'Không tìm thấy công ty.' });
      }

      const { id } = req.params;
      const account = company.accounts.id(id);

      if (!account || account.isDeleted) {
          return res.status(404).json({ message: 'Tài khoản không tồn tại.' });
      }

      const { name, email, address, isActive } = req.body;

      // Kiểm tra email trùng lặp
      if (email && email !== account.email) {
          const existingAccount = company.accounts.find(acc => acc.email === email && acc._id.toString() !== id);
          if (existingAccount) {
              return res.status(400).json({ message: 'Email đã được sử dụng.' });
          }
      }

      // Cập nhật các trường
      if (name !== undefined) account.name = name.trim() || account.name;
      if (email !== undefined) account.email = email.trim() || account.email;
      if (address !== undefined) account.address = address.trim() || account.address;
      if (isActive !== undefined && account.role !== 'admin') account.isActive = isActive;

      // Đánh dấu trường accounts là đã sửa đổi
      company.markModified('accounts');

      await company.save();

      res.status(200).json({ 
          message: 'Tài khoản đã được cập nhật.',
          account: {
              _id: account._id,
              name: account.name,
              email: account.email,
              address: account.address,
              isActive: account.isActive,
              role: account.role
          }
      });
  } catch (error) {
      next(error);
  }
});

/**
 * @swagger
 * /api/company/accounts/{id}/toggle-active:
 *   patch:
 *     summary: Thay đổi trạng thái hoạt động của tài khoản (chỉ áp dụng cho non-admin)
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trạng thái hoạt động của tài khoản đã được thay đổi
 *       400:
 *         description: Không thể thay đổi trạng thái của tài khoản admin
 *       404:
 *         description: Tài khoản không tồn tại
 *     description: "Yêu cầu: Tài khoản Admin Company"
 */
router.patch('/accounts/:id/toggle-active', authenticateCompanyAdmin, async (req, res, next) => {
    try {
      const companyId = req.user.companyId;
      const { id } = req.params;
  
      const company = await Company.findById(companyId);
      if (!company) {
        return res.status(404).json({ message: 'Không tìm thấy công ty.' });
      }
  
      const account = company.accounts.id(id);
      if (!account || account.isDeleted) {
        return res.status(404).json({ message: 'Tài khoản không tồn tại.' });
      }
  
      if (account.role === 'admin') {
        return res.status(400).json({ message: 'Không thể thay đổi trạng thái của tài khoản admin.' });
      }
  
      account.isActive = !account.isActive;
  
      // Đánh dấu trường accounts là đã sửa đổi
      company.markModified('accounts');
  
      await company.save();
  
      res.status(200).json({
        message: `Trạng thái hoạt động của tài khoản đã được ${account.isActive ? 'kích hoạt' : 'vô hiệu hóa'}.`,
        account: {
          _id: account._id,
          name: account.name,
          email: account.email,
          role: account.role,
          isActive: account.isActive
        }
      });
    } catch (error) {
      next(error);
    }
  });

/**
 * @swagger
 * /api/company/accounts/{id}:
 *   delete:
 *     summary: Xóa mềm tài khoản trong công ty
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tài khoản đã bị xóa mềm
 *       404:
 *         description: Tài khoản không tồn tại
 *     description: "Yêu cầu: Tài khoản Company"
 */
router.delete('/accounts/:id', authenticateCompanyAdmin, async (req, res, next) => {
  try {
      const company = await Company.findById(req.user.company); // Thông tin công ty từ middleware
      const { id } = req.params;

      if (!company) {
          return res.status(404).json({ message: 'Không tìm thấy công ty.' });
      }

      try {
          await company.canDeleteAccount(id);
      } catch (error) {
          return res.status(400).json({ message: error.message });
      }

      const account = company.accounts.id(id);
      if (!account) {
          return res.status(404).json({ message: 'Tài khoản không tồn tại.' });
      }

      account.isDeleted = true;
      await company.save();

      res.status(200).json({ message: 'Tài khoản đã bị xóa mềm.', account });
  } catch (error) {
      next(error);
  }
});

/**
 * @swagger
 * /api/company/projects:
 *   post:
 *     summary: Tạo dự án mới
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               mentorId:
 *                 type: string
 *               objectives:
 *                 type: array
 *                 items:
 *                   type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               isRecruiting:
 *                 type: boolean
 *               maxApplicants:
 *                 type: number
 *               applicationStart:
 *                 type: string
 *                 format: date
 *               applicationEnd:
 *                 type: string
 *                 format: date
 *               requiredSkills:
 *                 type: array
 *                 items:
 *                   type: string
 *               relatedMajors:
 *                 type: array
 *                 items:
 *                   type: string
 *               skillRequirements:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     skill:
 *                       type: string
 *                     level:
 *                       type: string
 *     responses:
 *       201:
 *         description: Dự án đã được tạo thành công
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       500:
 *         description: Lỗi server
 *     description: "Yêu cầu: Tài khoản Admin Company"
 */
router.post('/projects', authenticateCompanyAdmin, async (req, res, next) => {
  try {
    const { 
      title, 
      description, 
      mentorId, 
      objectives, 
      isRecruiting, 
      maxApplicants,
      requiredSkills,
      relatedMajors,
      skillRequirements,
      applicationStart,
      applicationEnd
    } = req.body;

    // Kiểm tra mentorId có phải là mentor trong công ty không
    const company = await Company.findById(req.user.company).populate('accounts');
    const mentor = company.accounts.find(account => account._id.toString() === mentorId && account.role === 'mentor');

    if (!mentor) {
      return res.status(400).json({ message: 'Mentor không hợp lệ hoặc không thuộc công ty này.' });
    }

    // Kiểm tra và xác thực các ID của major
    let validatedMajors = [];
    if (relatedMajors && relatedMajors.length > 0) {
      validatedMajors = await Major.find({ _id: { $in: relatedMajors } });
      if (validatedMajors.length !== relatedMajors.length) {
        return res.status(400).json({ message: 'Một hoặc nhiều ID ngành học không hợp lệ.' });
      }
    }

    // Kiểm tra và xác thực các ID của skill
    let validatedSkills = [];
    if (requiredSkills && requiredSkills.length > 0) {
      validatedSkills = await Skill.find({ _id: { $in: requiredSkills } });
      if (validatedSkills.length !== requiredSkills.length) {
        return res.status(400).json({ message: 'Một hoặc nhiều ID kỹ năng không hợp lệ.' });
      }
    }

    const projectData = {
      title,
      description,
      company: req.user.company,
      mentor: mentorId,
      objectives,
      isRecruiting: isRecruiting || false,
      projectStatus: 'Đang thực hiện',
      requiredSkills: validatedSkills.map(skill => skill._id),
      relatedMajors: validatedMajors.map(major => major._id),
      skillRequirements,
    };

    if (isRecruiting) {
      if (!maxApplicants) {
        return res.status(400).json({ message: 'Vui lòng cung cấp số lượng ứng viên tối đa khi bật chế độ tuyển dụng' });
      }
      projectData.maxApplicants = maxApplicants;
      projectData.applicationStart = applicationStart;
      projectData.applicationEnd = applicationEnd;
    }

    const project = new Project(projectData);
    await project.save();
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/company/projects/{id}/start-recruiting:
 *   patch:
 *     summary: Bật trạng thái tuyển dụng
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxApplicants:
 *                 type: number
 *               applicationStart:
 *                 type: string
 *                 format: date
 *               applicationEnd:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Trạng thái tuyển dụng đã được bật
 *       400: 
 *         description: Dữ liệu đầu vào không hợp lệ
 *       404: 
 *         description: Không tìm thấy dự án
 *       403:
 *         description: Bạn không có quyền thay đổi trạng thái tuyển dụng của dự án này
 *       500:
 *         description: Lỗi server
 *     description: "Yêu cầu: Tài khoản Company"
 */
router.patch('/projects/:id/start-recruiting', authenticateCompanyAccount, async (req, res, next) => {
  try {
    const { maxApplicants, applicationEnd } = req.body;
    
    if (maxApplicants == null || !applicationEnd) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin tuyển dụng' });
    }

    const project = await Project.findOne({ _id: req.params.id, company: req.user.company });

    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }

    // Kiểm tra quyền của người dùng
    if (req.user.role !== 'admin' && project.mentor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Bạn không có quyền thay đổi trạng thái tuyển dụng của dự án này.' });
    }

    project.isRecruiting = true;
    project.maxApplicants = maxApplicants;
    project.applicationStart = project.startDate; // Lấy từ ngày bắt đầu dự án
    project.applicationEnd = applicationEnd;

    await project.save();

    res.json({
      message: 'Đã bật trạng thái tuyển dụng của dự án thành công.',
      projectId: project._id,
      isRecruiting: project.isRecruiting
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/company/projects/{id}/stop-recruiting:
 *   patch:
 *     summary: Tắt trạng thái tuyển dụng
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []  
 *     responses:
 *       200:
 *         description: Trạng thái tuyển dụng đã được tắt
 *       404:
 *         description: Không tìm thấy dự án
 *       403:
 *         description: Bạn không có quyền tắt trạng thái tuyển dụng của dự án này
 *       500:
 *         description: Lỗi server
 *     description: "Yêu cầu: Tài khoản Company"
 */
router.patch('/projects/:id/stop-recruiting', authenticateCompanyAccount, async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, company: req.user.company });

    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }

    // Kiểm tra quyền của người dùng
    if (req.user.role !== 'admin' && project.mentor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Bạn không có quyền thay đổi trạng thái tuyển dụng của dự án này.' });
    }

    project.isRecruiting = false;

    await project.save();

    res.json({
      message: 'Đã tắt trạng thái tuyển dụng của dự án thành công.',
      projectId: project._id,
      isRecruiting: project.isRecruiting
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/projects/:id/status', authenticateCompanyAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;

    // Kiểm tra giá trị của status
    if (!['Open', 'Closed'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { status },
      { new: true, runValidators: true }
    );

    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }

    res.json(project);
  } catch (error) {
    next(error);
  }
});


/**
 * @swagger
 * /api/company/student-profile/{studentId}:
 *   get:
 *     summary: Lấy thông tin hồ sơ sinh viên
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của sinh viên
 *     responses:
 *       200:
 *         description: Thông tin hồ sơ sinh viên
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Student'
 *       404:
 *         description: Không tìm thấy sinh viên
 *       500:
 *         description: Lỗi server
 *     description: "Yêu cầu: Tài khoản Company"
 */
router.get('/student-profile/:studentId', authenticateCompanyAccount, async (req, res, next) => {
    try {
      const student = await Student.findById(req.params.studentId)
        .populate('projects')
        .select('-password -refreshToken');
      if (!student) {
        return res.status(404).json({ message: 'Không tìm thấy sinh viên' });
      }
      res.json(student);
    } catch (error) {
      next(error);
    }
  });
  


/**
 * @swagger
 * /api/company/projects:
 *   get:
 *     summary: Tìm kiếm dự án của công ty
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Từ khóa tìm kiếm
 *     responses:
 *       200:
 *         description: Danh sách dự án
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projects:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Project'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       500:
 *         description: Lỗi server
 *     description: "Yêu cầu: Tài khoản Company"
 */
router.get('/projects', authenticateCompanyAccount, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '', status, isRecruiting } = req.query;
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json({ message: "Không tìm thấy thông tin công ty." });
    }

    const filters = {
      company: companyId,
      status: status,
      isRecruiting: isRecruiting === 'true'
    };

    // Loại bỏ các trường không được định nghĩa
    Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

    const projects = await Project.searchProjects(search, filters, page, limit);

    res.json(projects);
  } catch (error) {
    next(error);
  }
});

// Tìm kiếm sinh viên
router.get('/search/students', authenticateCompanyAccount, async (req, res, next) => {
  try {
    const { query, skills, major } = req.query;
    const students = await Student.searchStudents(query, { skills, major });
    res.json(students);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/company/account:
 *   put:
 *     summary: Cập nhật thông tin tài khoản công ty
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Tên mới của tài khoản
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email mới của tài khoản
 *               address:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 500
 *                 description: Địa chỉ mới của tài khoản
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 account:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     address:
 *                       type: string
 *                     role:
 *                       type: string
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy tài khoản hoặc công ty
 *       500:
 *         description: Lỗi server
 *     description: "Yêu cầu: Tài khoản Company"
 */
router.put('/account', authenticateCompanyAccount, 
  body('name').optional({ nullable: true, checkFalsy: true }).isLength({ min: 2, max: 100 }).withMessage('Tên phải có từ 2 đến 100 ký tự'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
  body('address').optional({ nullable: true, checkFalsy: true }).isLength({ min: 5, max: 500 }).withMessage('Địa chỉ phải có từ 5 đến 500 ký tự'),
  emailChangeLimiter, // Thêm limiter vào đây
  async (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
      }

      try {
          const { name, email, address } = req.body;
          const user = req.user;
          const companyId = req.user.companyId;

          if (!companyId) {
              return res.status(400).json({ message: 'Không tìm thấy thông tin công ty.' });
          }

          const updateFields = {};
          if (name !== undefined && name !== null && name.trim() !== '') updateFields['accounts.$.name'] = name;
          if (address !== undefined && address !== null && address.trim() !== '') updateFields['accounts.$.address'] = address;

          if (email !== undefined && email !== null && email.trim() !== '' && email !== user.email) {
              const existingAccount = await Company.findOne({ 
                  _id: companyId, 
                  'accounts.email': email 
              });
              if (existingAccount) {
                  return res.status(400).json({ message: 'Email đã được sử dụng trong công ty này.' });
              }
              
              const emailChangeToken = crypto.randomBytes(32).toString('hex');
              updateFields['accounts.$.pendingEmail'] = email;
              updateFields['accounts.$.emailChangeToken'] = emailChangeToken;
              updateFields['accounts.$.emailChangeTokenExpires'] = Date.now() + 3600000; // 1 giờ

              // Mã hóa thông tin
              const encryptedData = encrypt(JSON.stringify({ token: emailChangeToken, companyId, accountId: user._id }));
              const confirmationLink = `${process.env.REACT_APP_API_URL}/api/company/confirm-email-change?data=${encodeURIComponent(encryptedData)}`;

              // Gửi email xác nhận với template mới
              await sendEmail(
                  email,
                  'Xác nhận thay đổi email - TECH ONE',
                  emailChangeConfirmationTemplate({
                      accountName: user.name,
                      companyName: 'TECH ONE', // Hoặc lấy tên công ty từ database
                      confirmationLink: confirmationLink,
                      newEmail: email
                  })
              );
          }

          if (Object.keys(updateFields).length === 0) {
              return res.status(400).json({ message: 'Không có thông tin nào được cập nhật.' });
          }

          const updatedCompany = await Company.findOneAndUpdate(
              { _id: companyId, 'accounts._id': user._id },
              { $set: updateFields },
              { new: true, runValidators: true }
          );

          if (!updatedCompany) {
              return res.status(404).json({ message: 'Không tìm thấy tài khoản hoặc công ty.' });
          }

          const updatedAccount = updatedCompany.accounts.id(user._id);

          res.json({
              message: email && email !== user.email 
                  ? 'Một email xác nhận đã được gửi đến địa chỉ email mới. Vui lòng kiểm tra và xác nhận để hoàn tất thay đổi.'
                  : 'Cập nhật thông tin tài khoản thành công.',
              account: {
                  name: updatedAccount.name,
                  email: updatedAccount.email,
                  address: updatedAccount.address,
                  role: updatedAccount.role,
                  pendingEmail: updatedAccount.pendingEmail
              }
          });
      } catch (error) {
          let errorMessage = 'Đã xảy ra lỗi.';
          if (error.name === 'ValidationError') {
              errorMessage = Object.values(error.errors).map(err => err.message).join(', ');
          }
          next(error);
      }
  }
);
router.put('/account/avatar', authenticateCompanyAccount, useImageUpload('company', 'avatars').single('avatar'), handleUploadError, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không có file được tải lên' });
    }

    const user = req.user;
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json({ message: 'Không tìm thấy thông tin công ty.' });
    }

    const avatarPath = req.file.path.replace(/\\/g, '/').replace('public/', '');

    const updatedCompany = await Company.findOneAndUpdate(
      { _id: companyId, 'accounts._id': user._id },
      { $set: { 'accounts.$.avatar': avatarPath } },
      { new: true, runValidators: true }
    );

    if (!updatedCompany) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản hoặc công ty.' });
    }

    const updatedAccount = updatedCompany.accounts.id(user._id);

    res.json({
      message: 'Cập nhật avatar thành công',
      avatar: updatedAccount.avatar
    });
  } catch (error) {
    next(error);
  }
});

// Cập nhật thông tin công ty (chỉ dành cho admin)
router.put('/company-info', authenticateCompanyAdmin,
  body('name').optional().isLength({ min: 2, max: 200 }).withMessage('Tên công ty phải có từ 2 đến 200 ký tự'),
  body('email').optional().isEmail().withMessage('Email công ty không hợp lệ'),
  body('address').optional().isLength({ min: 5, max: 500 }).withMessage('Địa chỉ công ty phải có từ 5 đến 500 ký tự'),
  async (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
      }

      try {
          const { name, email, address } = req.body;
          const user = req.user;

          // Kiểm tra xem email mới có bị trùng không
          if (email) {
              const existingCompany = await Company.findOne({ email, _id: { $ne: user.company } });
              if (existingCompany) {
                  return res.status(400).json({ message: 'Email công ty đã được sử dụng.' });
              }
          }

          const updatedCompany = await Company.findByIdAndUpdate(
              user.company,
              { 
                  $set: { 
                      name: name || undefined,
                      email: email || undefined,
                      address: address || undefined
                  }
              },
              { new: true, runValidators: true }
          );

          if (!updatedCompany) {
              return res.status(404).json({ message: 'Không tìm thấy công ty.' });
          }

          res.json({
              message: 'Cập nhật thông tin công ty thành công.',
              company: {
                  name: updatedCompany.name,
                  email: updatedCompany.email,
                  address: updatedCompany.address,
                  logo: updatedCompany.logo
              }
          });
      } catch (error) {
          next(error);
      }
  }
);

/**
 * @swagger
 * /api/company/forgot-password:
 *   post:
 *     summary: Yêu cầu đặt lại mật khẩu
 *     tags: [Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Token đặt lại mật khẩu đã được gửi
 *       404:
 *         description: Không tìm thấy tài khoản
 *       500:
 *         description: Lỗi máy chủ
 */
// Route để yêu cầu reset mật khẩu
router.post('/forgot-password', async (req, res, next) => {
  try {
      const { email } = req.body;
      const company = await Company.findOne({ 'accounts.email': email });
      if (!company) {
          return res.status(404).json({ message: 'Không tìm thấy tài khoản với email này.' });
      }

      const account = company.accounts.find(acc => acc.email === email);
      if (!account) {
          return res.status(404).json({ message: 'Không tìm thấy tài khoản với email này.' });
      }

      const resetToken = account.createPasswordResetToken();
      await company.save();

      const resetURL = `http://localhost:3000/company/forgot-password/step2/${resetToken}`;
      await sendEmail(
          email,
          'Đặt lại mật khẩu của bạn',
          passwordResetTemplate({
              accountName: account.name,
              resetLink: resetURL
          })
      );

      res.status(200).json({ message: 'Token đặt lại mật khẩu đã được gửi đến email của bạn.' });
  } catch (error) {
      console.error('Lỗi khi gửi email đặt lại mật khẩu:', error);
      next(error);
  }
});

/**
 * @swagger
 * /api/company/reset-password/{token}:
 *   post:
 *     summary: Đặt lại mật khẩu
 *     tags: [Companies]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token đặt lại mật khẩu
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Mật khẩu đã được đặt lại thành công
 *       400:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *       500:
 *         description: Lỗi máy chủ
 */

// Route để reset mật khẩu
router.post('/reset-password/:token', async (req, res, next) => {
  try {
      const { token } = req.params;
      const { password } = req.body;

      const hashedToken = crypto
          .createHash('sha256')
          .update(token)
          .digest('hex');

      const company = await Company.findOne({
          'accounts.resetPasswordToken': hashedToken,
          'accounts.resetPasswordExpires': { $gt: Date.now() }
      });

      if (!company) {
          return res.status(400).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
      }

      const account = company.accounts.find(acc => acc.resetPasswordToken === hashedToken);
      if (!account) {
          return res.status(400).json({ message: 'Không tìm thấy tài khoản.' });
      }

      // Đặt lại mật khẩu mà không mã hóa lại
      account.password = password;
      account.resetPasswordToken = undefined;
      account.resetPasswordExpires = undefined;

      await company.save();

      res.status(200).json({ message: 'Mật khẩu đã được đặt lại thành công.' });
  } catch (error) {
      next(error);
  }
});

/**
 * @swagger
 * /api/company/mentors:
 *   get:
 *     summary: Lấy danh sách ID và tên của các mentor trong công ty
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách các mentor
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   name:
 *                     type: string
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 *     description: "Yêu cầu: Tài khoản Admin Company"
 */
router.get('/mentors', authenticateCompanyAccount, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      return res.status(400).json({ message: "Không tìm thấy thông tin công ty." });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Không tìm thấy công ty." });
    }

    const mentors = company.accounts
      .filter(account => account.role === 'mentor')
      .map(mentor => ({
        _id: mentor._id,
        name: mentor.name,
        email: mentor.email
      }));

    res.json(mentors);
  } catch (error) {
    next(error);
  }
});
  /**
 * @swagger
 * /api/company/projects/{id}/change-mentor:
 *   patch:
 *     summary: Thay đổi mentor của dự án
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
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
 *             type: object
 *             properties:
 *               newMentorId:
 *                 type: string
 *                 description: ID của mentor mới
 *               oldMentorId:
 *                 type: string
 *                 description: ID của mentor cũ
 *     responses:
 *       200:
 *         description: Mentor đã được thay đổi thành công
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       404:
 *         description: Không tìm thấy dự án hoặc mentor
 *       500:
 *         description: Lỗi server
 *     description: "Yêu cầu: Tài khoản Admin Company"
 */
router.patch('/projects/:id/change-mentor', authenticateCompanyAdmin, async (req, res, next) => {
  const { newMentorId, oldMentorId } = req.body;

  try {
    const project = await Project.findOne({ _id: req.params.id, company: req.user.companyId });

    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }

    await project.changeMentor(newMentorId, oldMentorId, req.user.companyId);

    res.status(200).json({ message: 'Mentor đã được thay đổi thành công' });
  } catch (error) {
    console.error('Error changing mentor:', error);
    next(error);
  }
});
/**
 * @swagger
 * /api/company/mentors/{mentorId}:
 *   get:
 *     summary: Xem chi tiết mentor
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mentorId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của mentor
 *     responses:
 *       200:
 *         description: Chi tiết mentor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 address:
 *                   type: string
 *                 avatar:
 *                   type: string
 *                 isActive:
 *                   type: boolean
 *                 activeProjectsCount:
 *                   type: number
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy mentor
 *       500:
 *         description: Lỗi server
 *     description: "Yêu cầu: Tài khoản Admin Company"
 */
router.get('/mentors/:id', authenticateCompanyAccount, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      return res.status(400).json({ message: "Không tìm thấy thông tin công ty." });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Không tìm thấy công ty." });
    }

    const mentor = company.accounts.id(req.params.id);
    if (!mentor || mentor.role !== 'mentor') {
      return res.status(404).json({ message: "Không tìm thấy mentor." });
    }

    // Lấy danh sách dự án của mentor
    const projects = await Project.find({ mentor: mentor._id, company: companyId })
      .select('_id title status');

    // Xử lý avatar
    let avatar = mentor.avatar;
    if (avatar && !avatar.startsWith('http')) {
      avatar = `http://localhost:5000/${avatar.replace(/^\/+/, '')}`;
    }

    res.json({
      _id: mentor._id,
      name: mentor.name,
      email: mentor.email,
      role: mentor.role,
      avatar: avatar,
      projects: projects
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/company/dashboard:
 *   get:
 *     summary: Lấy dữ liệu bảng điều khiển của công ty
 *     tags: [Companies]
 *     security:
 *       - companyBearerAuth: []
 *     responses:
 *       200:
 *         description: Dữ liệu bảng điều khiển thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 companyInfo:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     logo:
 *                       type: string
 *                     mentorCount:
 *                       type: number
 *                 projectStats:
 *                   type: object
 *                   properties:
 *                     totalProjects:
 *                       type: number
 *                     recruitingProjects:
 *                       type: number
 *                     ongoingProjects:
 *                       type: number
 *                     completedProjects:
 *                       type: number
 *                     totalSelectedStudents:
 *                       type: number
 *                 taskStats:
 *                   type: object
 *                   properties:
 *                     totalTasks:
 *                       type: number
 *                     pendingTasks:
 *                       type: number
 *                     inProgressTasks:
 *                       type: number
 *                     completedTasks:
 *                       type: number
 *                     overdueTasks:
 *                       type: number
 *                     avgRating:
 *                       type: number
 *       401:
 *         description: Không được ủy quyền
 *       500:
 *         description: Lỗi máy chủ
 *     description: "Yêu cầu: Tài khoản Admin Company"
 */
router.get('/dashboard', authenticateCompanyAdmin, async (req, res, next) => {
  try {
    const dashboardData = await getCompanyDashboardData(req.user.companyId);
    res.json(dashboardData);
  } catch (error) {
    next(error);
  }
});


  router.use((err, req, res, next) => {
  const { status, message } = handleError(err);
  res.status(status).json({ message });
});

export default router;