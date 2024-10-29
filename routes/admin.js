import mongoose from 'mongoose';
import express from 'express';
import dotenv from 'dotenv-safe';
import Company from '../models/Company.js';
import Project from '../models/Project.js';
import { sendEmail, restoreEmail, getEmailConfig } from '../utils/emailService.js';
import Email from '../models/Email.js';
import EmailTemplate from '../models/EmailTemplate.js';
import School from '../models/School.js';
import { getAdminDashboardData } from '../models/dashboard.js';
import { filterSearchSort, applyFilters, applySearch, applySorting } from '../utils/filterSearchSort.js';
import { handleError } from '../utils/errorHandler.js';
import multer from 'multer';
import path from 'path';
import Notification from '../models/Notification.js';
import Student from '../models/Student.js';
import authenticate from '../middlewares/authenticate.js';
import Admin from '../models/Admin.js';
import { useImageUpload, handleUploadError, useExcelUpload, handleExcelUpload } from '../utils/upload.js';
import Config from '../models/Config.js';
import { 
  createBackup, 
  getBackupsList, 
  scheduleBackup, 
  restoreBackup, 
  undoRestore, 
  cancelScheduledBackup, 
  analyzeBackup,
  encryptPassword,
  getBackupConfig,
  ensureBackupDir
} from '../utils/backup.js';
import { generateRandomPassword } from '../utils/passwordGenerator.js';
import nodemailer from 'nodemailer';
import fs from 'fs';
import AdmZip from 'adm-zip';
import crypto from 'crypto';

dotenv.config();

const router = express.Router();

// Hàm tìm admin theo ID
const findAdminById = async (decoded) => {
  return await Admin.findById(decoded._id);
};

// Hàm xác thực admin
const authenticateAdmin = authenticate(Admin, findAdminById, 'admin');

router.get('/companies', authenticateAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, sort, order } = req.query;
    const skip = (page - 1) * limit;

    let query = Company.find();

    if (search) {
      query = query.or([
        { name: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } }
      ]);
    }

    if (sort) {
      const sortOrder = order === 'desc' ? -1 : 1;
      query = query.sort({ [sort]: sortOrder });
    }

    const totalItems = await Company.countDocuments(query);
    const companies = await query.skip(skip).limit(parseInt(limit)).populate('accounts', '-password');

    const companiesWithProjectCount = await Promise.all(companies.map(async (company) => {
      const projectCount = await Project.countDocuments({ company: company._id });
      return { ...company.toObject(), projectCount };
    }));

    res.status(200).json({
      data: companiesWithProjectCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
      limit: parseInt(limit)
    });
  } catch (error) {
    next(error);
  }
});
router.get('/companies/:id', authenticateAdmin, async (req, res, next) => {
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

router.put('/companies/:id', authenticateAdmin, async (req, res, next) => {
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

router.delete('/companies/:id', authenticateAdmin, async (req, res, next) => {
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

const schoolLogoUpload = useImageUpload('schools', 'logos');

router.put('/schools/:id', authenticateAdmin, schoolLogoUpload.single('logo'), handleUploadError, async (req, res, next) => {
  try {
    const schoolId = req.params.id;
    const updateData = req.body;
    
    // Xử lý upload logo nếu có
    if (req.file) {
      updateData.logo = path.join('/uploads', 'schools', 'logos', req.file.filename);
    }

    const allowedFields = ['name', 'address', 'website', 'description', 'logo', 'isActive'];
    const filteredData = Object.keys(updateData)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        if (key === 'isActive') {
          obj[key] = updateData[key] === 'true' || updateData[key] === true;
        } else {
          obj[key] = updateData[key];
        }
        return obj;
      }, {});

    const updatedSchool = await School.findByIdAndUpdate(schoolId, filteredData, { new: true, runValidators: true });

    if (!updatedSchool) {
      return res.status(404).json({ message: 'Không tìm thấy trường học' });
    }

    // Tạo đối tượng chứa các trường đã được cập nhật và giá trị mới của chúng
    const updatedFields = Object.keys(filteredData).reduce((obj, key) => {
      obj[key] = updatedSchool[key];
      return obj;
    }, {});

    res.json({
      message: 'Cập nhật trường học thành công',
      updatedFields: updatedFields
    });
  } catch (error) {
    next(error);
  }
});

router.get('/schools', authenticateAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, sort, order } = req.query;
    const skip = (page - 1) * limit;

    let query = School.find();

    if (search) {
      query = query.or([
        { name: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } }
      ]);
    }

    if (sort) {
      const sortOrder = order === 'desc' ? -1 : 1;
      query = query.sort({ [sort]: sortOrder });
    }

    const totalItems = await School.countDocuments(query);
    const schools = await query.skip(skip).limit(parseInt(limit)).populate('accounts', '-password');

    const schoolIds = schools.map(school => school._id);
    const studentCounts = await Student.aggregate([
      { $match: { school: { $in: schoolIds }, isDeleted: false } },
      { $group: { _id: '$school', count: { $sum: 1 } } }
    ]);

    const schoolsWithStudentCount = schools.map(school => {
      const studentCount = studentCounts.find(count => count._id.toString() === school._id.toString());
      return {
        ...school.toObject(),
        studentCount: studentCount ? studentCount.count : 0
      };
    });

    res.status(200).json({
      data: schoolsWithStudentCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
      limit: parseInt(limit)
    });
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

router.post('/schools', authenticateAdmin, upload.single('logo'), async (req, res, next) => {
  try {
    console.log('Received request body:', req.body);
    console.log('Received file:', req.file);

    const { name, address, website, establishedDate, accounts } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Tên trường không được bỏ trng' });
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

router.get('/schools/:id', authenticateAdmin, async (req, res, next) => {
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

router.put('/schools/:id', authenticateAdmin, async (req, res, next) => {
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

router.delete('/schools/:id', authenticateAdmin, async (req, res, next) => {
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

router.post('/send-email', authenticateAdmin, async (req, res, next) => {
  const { to, subject, htmlContent, type } = req.body;

  try {
    if (!to || !subject || !htmlContent) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc.' });
    }

    const email = await sendEmail(to, subject, htmlContent, type);
    res.status(200).json({ message: 'Email được gửi thành công.' });
  } catch (error) {
    console.error('Error sending email:', error);
    next(error);
  }
});
router.get('/emails', authenticateAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, sort = 'sentAt', order = 'desc', showDeleted, status } = req.query;
    
    let query = {};

    // Xử lý tùy chọn showDeleted
    if (showDeleted === 'true') {
      query.isDeleted = true;
    } else if (showDeleted === 'false') {
      query.isDeleted = false;
    }
    // Nếu showDeleted không được chỉ định, không thêm điều kiện isDeleted vào query

    // Xử lý tùy chọn status
    if (status === 'sent' || status === 'failed') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { to: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sort]: order === 'asc' ? 1 : -1 }
    };

    const result = await Email.paginate(query, options);

    res.json({
      emails: result.docs,
      currentPage: result.page,
      totalPages: result.totalPages,
      totalItems: result.totalDocs,
      limit: result.limit
    });

  } catch (error) {
    console.error('Error in /emails route:', error);
    next(error);
  }
});
router.post('/emails/restore/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const email = await Email.findById(req.params.id);
    if (!email) {
      return res.status(404).json({ message: 'Không tìm thấy email.' });
    }
    email.isDeleted = false;
    await email.save();
    res.status(200).json({ message: 'Email đã được khôi phục.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/emails/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const email = await Email.findById(req.params.id);
    if (!email) {
      return res.status(404).json({ message: 'Không tìm thấy email.' });
    }
    email.isDeleted = true;
    await email.save();
    res.status(200).json({ message: 'Email đã được xóa mềm.' });
  } catch (error) {
    next(error);
  }
});
router.get('/email-templates', authenticateAdmin, async (req, res, next) => {
  try {
    const templates = await EmailTemplate.find().sort({ createdAt: -1 });
    res.status(200).json(templates);
  } catch (error) {
    next(error);
  }
});

router.post('/send-fake-notification', authenticateAdmin, async (req, res, next) => {
  try {
    const { content, type, recipients } = req.body;

    if (!content || !type || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ message: 'Nội dung, loại thông báo và danh sách người nhận là bắt buộc' });
    }

    const notifications = [];

    if (recipients.includes('students')) {
      const students = await Student.find({});
      for (const student of students) {
        notifications.push({
          recipient: student._id,
          recipientModel: 'Student',
          type,
          content,
          relatedId: null
        });
      }
    }

    if (recipients.includes('companies')) {
      const companies = await Company.find({});
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
    }

    if (recipients.includes('schools')) {
      const schools = await School.find({});
      for (const school of schools) {
        for (const account of school.accounts) {
          notifications.push({
            recipient: account._id,
            recipientModel: 'SchoolAccount',
            recipientRole: account.role.name,
            type,
            content,
            relatedId: null
          });
        }
      }
    }

    for (const notificationData of notifications) {
      await Notification.insert(notificationData);
    }

    res.json({ message: 'Đã gửi thông báo giả cho các đối tượng được chọn', notificationsSent: notifications.length });
  } catch (error) {
    next(error);
  }
});
router.get('/dashboard', authenticateAdmin, async (req, res, next) => {
  try {
    const { startDate, endDate, timeUnit } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Vui lòng cung cấp ngày bắt đầu và kết thúc' });
    }
    const dashboardData = await getAdminDashboardData(startDate, endDate, timeUnit);
    res.json(dashboardData);
  } catch (error) {
    next(error);
  }
});

// Lấy cấu hình email hiện tại
router.get('/email-config', authenticateAdmin, async (req, res, next) => {
  try {
    const config = await getEmailConfig();
    res.json(config);
  } catch (error) {
    next(error);
  }
});

// Cập nhật cấu hình email
router.post('/email-config', authenticateAdmin, async (req, res, next) => {
  try {
    const { service, user, pass, host, port, senderName } = req.body;
    let config = await Config.findOne();
    
    if (config) {
      config.email = { service, user, pass, host, port, senderName };
    } else {
      config = new Config({
        email: { service, user, pass, host, port, senderName }
      });
    }
    await config.save();

    const newConfig = config.email;
    const transporter = nodemailer.createTransport({
      service: newConfig.service,
      host: newConfig.host,
      port: newConfig.port,
      secure: newConfig.port === 465,
      auth: {
        user: newConfig.user,
        pass: newConfig.pass
      }
    });

    try {
      await transporter.verify();
      res.json({ message: 'Cấu hình email đã được cập nhật và kiểm tra thành công', config: config.email });
    } catch (error) {
      res.status(400).json({ message: 'Cấu hình email không hợp lệ', error: error.message });
    }
  } catch (error) {
    next(error);
  }
});

// Route gửi email test
router.post('/send-test-email', authenticateAdmin, async (req, res, next) => {
  try {
    const { to, subject, htmlContent } = req.body;
    const config = await Config.findOne();
    if (!config || !config.email) {
      return res.status(400).json({ message: 'Cấu hình email chưa được thiết lập' });
    }
    
    const transporter = nodemailer.createTransport({
      service: config.email.service,
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.pass
      }
    });

    const mailOptions = {
      from: `"${config.email.senderName}" <${config.email.user}>`,
      to,
      subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ message: 'Email test đã được gửi thành công', info });
  } catch (error) {
    console.error('Lỗi khi gửi email test:', error);
    res.status(500).json({ message: 'Không thể gửi email test', error: error.message });
  }
});

const upload1 = useExcelUpload('uploads');

router.post('/upload/students', authenticateAdmin, upload1.single('file'), async (req, res, next) => {
  try {
    const { schoolId } = req.body;
    if (!schoolId) {
      return res.status(400).json({ message: 'ID trường học là bắt buộc' });
    }

    const defaultFieldMapping = {
      'name': 'Tên sinh viên',
      'email': 'Email',
      'studentId': 'Mã số sinh viên',
      'major': 'Ngành học',
      'dateOfBirth': 'Ngày sinh',
      'gender': 'Giới tính',
      'phoneNumber': 'Số điện thoại',
      'address': 'Địa chỉ',
      'socialMedia.facebook': 'Facebook',
      'socialMedia.linkedin': 'LinkedIn',
      'socialMedia.github': 'GitHub',
      'avatar': 'Avatar',
      'interests': 'Sở thích',
      'achievements': 'Thành tích'
    };
    const customMapping = req.body.mapping ? JSON.parse(req.body.mapping) : null;
    const fieldMapping = customMapping || defaultFieldMapping;

    const School = mongoose.model('School');
    const school = await School.findById(schoolId);

    const result = await handleExcelUpload(req.file, Student, fieldMapping, schoolId);
    
    const updatedStudents = await Promise.all(result.data.map(async (student) => {
      const password = await student.generateDefaultPassword();
      student.password = password;
      await student.save();
      return {
        name: student.name,
        email: student.email,
        studentId: student.studentId,
        password: password,
        schoolName: school ? school.name : 'Unknown School'
      };
    }));

    res.json({
      message: `Đã xử lý ${result.totalRecords} bản ghi. ${result.successCount} thành công, ${result.failCount} thất bại.`,
      students: updatedStudents,
      schoolName: school ? school.name : 'Unknown School',
      errors: result.errors
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload/schools', authenticateAdmin, upload1.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không có file được tải lên' });
    }

    const defaultFieldMapping = {
      'name': 'Tên trường',
      'address': 'Địa chỉ',
      'website': 'Website',
      'foundedYear': 'Năm thành lập',
      'socialMedia.facebook': 'Facebook',
      'socialMedia.linkedin': 'LinkedIn',
      'socialMedia.twitter': 'Twitter',
      'logo': 'Logo',
      'accreditations': 'Chứng nhận',
      'campusLocations': 'Địa điểm cơ sở',
      'accounts.0.email': 'Email đăng nhập'
    };
    const customMapping = req.body.mapping ? JSON.parse(req.body.mapping) : null;
    const fieldMapping = customMapping || defaultFieldMapping;
    
    const result = await handleExcelUpload(req.file, School, fieldMapping);
    
    const updatedSchools = await Promise.all(result.data.map(async (school) => {
      try {
        const password = generateRandomPassword();
        if (school.accounts && school.accounts.length > 0) {
          school.accounts[0].password = password;
          school.accounts[0].role = 'admin';
        }
        await school.save();
        return {
          name: school.name,
          email: school.accounts[0].email,
          password: password
        };
      } catch (error) {
        console.error(`Lỗi khi xử lý trường ${school.name}:`, error);
        return null;
      }
    }));

    const successfulSchools = updatedSchools.filter(school => school !== null);

    res.json({
      message: `Đã xử lý ${result.totalRecords} bản ghi. ${result.successCount} thành công, ${result.failCount} thất bại.`,
      schools: successfulSchools,
      errors: result.errors
    });
  } catch (error) {
    console.error('Lỗi khi tải lên danh sách trường học:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi xử lý tệp Excel', error: error.message });
  }
});

router.post('/upload/companies', authenticateAdmin, upload1.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không có file được tải lên' });
    }

    const defaultFieldMapping = {
      'name': 'Tên công ty',
      'address': 'Địa chỉ',
      'email': 'Email',
      'description': 'Mô tả',
      'website': 'Website',
      'industry': 'Ngành công nghiệp',
      'foundedYear': 'Năm thành lập',
      'employeeCount': 'Số lượng nhân viên',
      'socialMedia.facebook': 'Facebook',
      'socialMedia.linkedin': 'LinkedIn',
      'socialMedia.twitter': 'Twitter',
      'logo': 'Logo',
      'accounts.0.email': 'Email đăng nhập'
    };
    const customMapping = req.body.mapping ? JSON.parse(req.body.mapping) : null;
    const fieldMapping = customMapping || defaultFieldMapping;
    
    const result = await handleExcelUpload(req.file, Company, fieldMapping);
    
    const updatedCompanies = await Promise.all(result.data.map(async (company) => {
      try {
        const password = generateRandomPassword();
        if (company.accounts && company.accounts.length > 0) {
          company.accounts[0].password = password;
          company.accounts[0].role = 'admin';
        }
        await company.save();
        return {
          name: company.name,
          email: company.accounts[0].email,
          password: password
        };
      } catch (error) {
        console.error(`Lỗi khi xử lý công ty ${company.name}:`, error);
        return null;
      }
    }));

    const successfulCompanies = updatedCompanies.filter(company => company !== null);

    res.json({
      message: `Đã xử lý ${result.totalRecords} bản ghi. ${result.successCount} thành công, ${result.failCount} thất bại.`,
      companies: successfulCompanies,
      errors: result.errors
    });
  } catch (error) {
    console.error('Lỗi khi tải lên danh sách công ty:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi xử lý tệp Excel', error: error.message });
  }
});

router.post('/upload/projects', authenticateAdmin, upload1.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không có file được tải lên' });
    }

    const defaultFieldMapping = {
      'title': 'Tiêu đề',
      'description': 'Mô tả',
      'company': 'Công ty',
      'status': 'Trạng thái',
      'objectives': 'Mục tiêu',
      'startDate': 'Ngày bắt đầu',
      'endDate': 'Ngày kết thúc'
    };
    const customMapping = req.body.mapping ? JSON.parse(req.body.mapping) : null;
    const fieldMapping = customMapping || defaultFieldMapping;

    const result = await handleExcelUpload(req.file, Project, fieldMapping);

    res.json({
      message: `Đã xử lý ${result.totalRecords} bản ghi. ${result.successCount} thành công, ${result.failCount} thất bại.`,
      projects: result.data,
      errors: result.errors
    });
  } catch (error) {
    console.error('Lỗi khi tải lên danh sách dự án:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi xử lý tệp Excel', error: error.message });
  }
});

// Thiết lập và bật/tắt tự động backup
router.post('/backup-config', authenticateAdmin, async (req, res, next) => {
  try {
    const { isAutoBackup, schedule, password, retentionPeriod } = req.body;
    
    let encryptedPassword;
    if (password) {
      encryptedPassword = encryptPassword(password);
    } else {
      // Nếu không có mật khẩu mới, giữ nguyên mật khẩu cũ
      const currentConfig = await Config.findOne();
      encryptedPassword = currentConfig.backupConfig.password;
    }

    const config = await Config.findOneAndUpdate(
      {},
      { 
        $set: { 
          backup: { 
            isAutoBackup,
            schedule,
            password: encryptedPassword,
            retentionPeriod
          } 
        } 
      },
      { new: true, upsert: true }
    );
    
    // Gọi scheduleBackup để cập nhật hoặc dừng cron job
    await scheduleBackup();
    
    // Loại bỏ mật khẩu khỏi response
    const { password: _, ...safeConfig } = config.backup.toObject();
    
    res.json({ 
      message: 'Cấu hình sao lưu đã được cập nhật', 
      config: safeConfig 
    });
  } catch (error) {
    next(error);
  }
});

// Lấy danh sách backup
router.get('/backups', authenticateAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const backups = await getBackupsList(parseInt(page), parseInt(limit));
    res.json(backups);
  } catch (error) {
    next(error);
  }
});

// Tạo backup thủ công
router.post('/backup', authenticateAdmin, async (req, res, next) => {
  try {
    const { backupName, password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Mật khẩu là bắt buộc' });
    }
    const backupPath = await createBackup(backupName, password);
    res.json({ message: 'Sao lưu thành công', backupPath });
  } catch (error) {
    next(error);
  }
});

// Khôi phục backup
router.post('/restore-backup', authenticateAdmin, async (req, res) => {
  try {
    const { backupFileName, password } = req.body;
    if (!backupFileName || !password) {
      return res.status(400).json({ message: 'Tên file sao lưu và mật khẩu là bắt buộc' });
    }

    // Kiểm tra xem file có phải là .bson hay không
    const isBsonFile = backupFileName.endsWith('.bson');

    if (isBsonFile) {
      // Sử dụng hàm restoreBackup cho file .bson
      const result = await restoreBackup(backupFileName, password);
      res.json(result);
    } else {
      // Giữ nguyên logic cũ cho file .zip
      const result = await restoreBackup(backupFileName, password);
      res.json(result);
    }
  } catch (error) {
    if (error.message === 'Mật khẩu không đúng') {
      res.status(400).json({ message: 'Mật khẩu không đúng' });
    } else {
      res.status(500).json({ message: 'Lỗi khi khôi phục sao lưu', error: error.message });
    }
  }
});

// Phân tích backup
router.post('/analyze-backup', authenticateAdmin, async (req, res) => {
  try {
    const { backupFileName, password } = req.body;
    if (!backupFileName || !password) {
      return res.status(400).json({ message: 'Tên file sao lưu và mật khẩu là bắt buộc' });
    }

    // Kiểm tra xem file có phải là .bson hay không
    const isBsonFile = backupFileName.endsWith('.bson');

    if (isBsonFile) {
      // Thực hiện phân tích cho file .bson
      const analysis = await analyzeBackup(backupFileName, password);
      res.json(analysis);
    } else {
      // Giữ nguyên logic cũ cho file .zip
      const analysis = await analyzeBackup(backupFileName, password);
      res.json(analysis);
    }
  } catch (error) {
    if (error.message === 'Mật khẩu không đúng') {
      res.status(400).json({ message: 'Mật khẩu không đúng' });
    } else {
      res.status(500).json({ message: 'Lỗi khi phân tích sao lưu', error: error.message });
    }
  }
});

// Thêm route mới để gửi lại email
router.post('/resend-email', authenticateAdmin, async (req, res, next) => {
  const { emailId } = req.body;

  try {
    if (!emailId) {
      return res.status(400).json({ message: 'ID email là bắt buộc.' });
    }

    // Tìm email trong cơ sở dữ liệu
    const emailToResend = await Email.findById(emailId);
    if (!emailToResend) {
      return res.status(404).json({ message: 'Không tìm thấy email.' });
    }

    // Gửi lại email
    const result = await sendEmail(emailToResend.to, emailToResend.subject, emailToResend.htmlContent, emailToResend.type);

    if (result.success) {
      res.status(200).json({ message: 'Email đã được gửi lại thành công.' });
    } else {
      res.status(500).json({ message: 'Không thể gửi lại email.', error: result.error });
    }
  } catch (error) {
    console.error('Lỗi khi gửi lại email:', error);
    next(error);
  }
});

// Thêm route mới để lấy cấu hình backup
router.get('/backup-config', authenticateAdmin, async (req, res, next) => {
  try {
    ensureBackupDir(); // Đảm bảo thư mục backup tồn tại
    const config = await getBackupConfig();
    res.json({ config });
  } catch (error) {
    next(error);
  }
});

router.use((err, req, res, next) => {
  const { status, message } = handleError(err);
  res.status(status).json({ error: message });
});

export default router;
