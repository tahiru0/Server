import express from 'express';
import Student from '../models/Student.js';
import School from '../models/School.js';
import authenticate from '../middlewares/authenticate.js';
import useUpload from '../utils/upload.js';
import { sendEmail } from '../utils/emailService.js';
import { accountActivationTemplate } from '../utils/emailTemplates.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { handleError } from '../utils/errorHandler.js';

const router = express.Router();

// Xác nhận tài khoản sinh viên
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

export default router;
