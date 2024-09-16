import express from 'express';
import Project from '../models/Project.js'; // Giả định là một ES module
import Task from '../models/Task.js'; // Giả định là một ES module
import authenticate from '../middlewares/authenticate.js';
import Student from '../models/Student.js';
import { handleError } from '../utils/errorHandler.js';
import Notification from '../models/Notification.js';
import { handleQuery } from '../utils/queryHelper.js';

const router = express.Router();

// Hàm tìm người dùng theo ID
const findUserById = async (decoded) => {
  return await Student.findById(decoded.id);
};

// Middleware xác thực cho sinh viên
const authenticateStudent = authenticate(Student, findUserById, ['student']);

// Lấy danh sách dự án đang tuyển dụng
router.get('/projects', authenticateStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id).populate('skills major');
    const additionalFilters = { isRecruiting: true };
    
    if (req.query.recommended === 'true') {
      additionalFilters.$or = [
        { requiredSkills: { $in: student.skills } },
        { relatedMajors: student.major }
      ];
    }

    const query = handleQuery(Project, req, additionalFilters);
    const [projects, total] = await Promise.all([
      query.exec(),
      Project.countDocuments(additionalFilters)
    ]);

    res.json({
      projects,
      total,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ứng tuyển dự án
router.post('/projects/:id/apply', authenticateStudent, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Không tìm thấy dự án' });
    }
    
    // Kiểm tra xem sinh viên đã ứng tuyển chưa
    const alreadyApplied = project.applicants.some(applicant => 
      applicant.applicantId.toString() === req.user._id.toString()
    );
    if (alreadyApplied) {
      return res.status(400).json({ error: 'Bạn đã ứng tuyển dự án này rồi' });
    }
    
    // Kiểm tra xem dự án có thể nhận ứng viên không
    if (!project.canAcceptApplicants()) {
      return res.status(400).json({ error: 'Dự án hiện không nhận ứng viên' });
    }
    
    project.applicants.push({ applicantId: req.user._id });
    project.currentApplicants += 1;
    
    // Kiểm tra và cập nhật trạng thái tuyển dụng nếu cần
    if (project.checkRecruitmentStatus()) {
      await project.save();
      return res.json({ message: 'Ứng tuyển thành công. Dự án đã đóng tuyển dụng.' });
    }
    
    await project.save();
    res.json({ message: 'Ứng tuyển thành công' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Xem danh sách dự án đã ứng tuyển
router.get('/applied-projects', authenticateStudent, async (req, res) => {
  try {
    const projects = await Project.find({ 'applicants.applicantId': req.user._id });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lấy danh sách thông báo của sinh viên
router.get('/notifications', authenticateStudent, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id, recipientModel: 'Student' })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Đánh dấu thông báo đã đọc
router.put('/notifications/:id/read', authenticateStudent, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    }
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cập nhật cài đặt thông báo
router.put('/notification-settings', authenticateStudent, async (req, res) => {
  try {
    const { taskNotifications, projectNotifications, emailNotifications } = req.body;
    const student = await Student.findByIdAndUpdate(
      req.user._id,
      { 
        'notificationSettings.taskNotifications': taskNotifications,
        'notificationSettings.projectNotifications': projectNotifications,
        'notificationSettings.emailNotifications': emailNotifications
      },
      { new: true }
    );
    res.json(student.notificationSettings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Lấy thông tin hồ sơ sinh viên
router.get('/profile', authenticateStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id)
      .populate('projects')
      .select('-password -refreshToken');
    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cập nhật hồ sơ sinh viên
router.put('/profile', authenticateStudent, async (req, res) => {
  try {
    const { name, skills, experience, education } = req.body;
    const student = await Student.findByIdAndUpdate(
      req.user._id,
      { name, skills, experience, education },
      { new: true, runValidators: true }
    ).select('-password -refreshToken');
    res.json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// // Tạo CV tự động
// router.post('/generate-cv', authenticateStudent, async (req, res) => {
//   try {
//     const student = await Student.findById(req.user._id)
//       .populate('projects')
//       .select('-password -refreshToken');
    
//     // Ở đây, bạn sẽ cần một service để tạo CV từ thông tin sinh viên
//     // Ví dụ: const cvUrl = await CVGeneratorService.generate(student);
    
//     // Giả sử chúng ta có một URL cho CV được tạo
//     const cvUrl = 'https://example.com/generated-cv.pdf';
    
//     student.cv = cvUrl;
//     await student.save();
    
//     res.json({ cvUrl });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// Cập nhật kỹ năng và ngành học
router.put('/update-skills-major', authenticateStudent, async (req, res) => {
  try {
    const { skills, major } = req.body;
    const student = await Student.findByIdAndUpdate(
      req.user._id,
      { skills, major },
      { new: true, runValidators: true }
    ).populate('skills major');
    res.json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Tìm kiếm dự án
router.get('/search/projects', authenticateStudent, async (req, res) => {
  try {
    const { query, skills, status, startDate, endDate } = req.query;
    const projects = await Project.searchProjects(query, { skills, status, startDate, endDate });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Tìm kiếm task
router.get('/search/tasks', authenticateStudent, async (req, res) => {
  try {
    const { query, status, deadline, project } = req.query;
    const tasks = await Task.searchTasks(query, { status, deadline, project });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Thêm route mới để hủy ứng tuyển
router.delete('/projects/:id/apply', authenticateStudent, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Không tìm thấy dự án' });
    }
    
    await project.removeApplicant(req.user._id);
    res.json({ message: 'Đã hủy ứng tuyển thành công' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const errorHandler = (err, req, res, next) => {
  const { status, message } = handleError(err);
  res.status(status).json({ message });
};

router.use(errorHandler);

export default router;
