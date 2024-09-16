import express from 'express';
import Project from '../models/Project.js'; // Giả định là một ES module
import Task from '../models/Task.js'; // Giả định là một ES module
import authenticate from '../middlewares/authenticate.js';
import Student from '../models/Student.js';
import { handleError } from '../utils/errorHandler.js';
import Notification from '../models/Notification.js';
import { handleQuery } from '../utils/queryHelper.js';
import School from '../models/School.js';
import { createOrUpdateGroupedNotification } from '../utils/notificationHelper.js';

const router = express.Router();

// Hàm tìm người dùng theo ID
const findUserById = async (decoded) => {
  return await Student.findById(decoded.id);
};

// Middleware xác thực cho sinh viên
const authenticateStudent = authenticate(Student, findUserById, ['student']);

// Đăng ký tài khoản sinh viên
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, studentId, schoolId } = req.body;
    
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'Không tìm thấy trường học' });
    }

    const student = new Student({
      name,
      email,
      password,
      studentId,
      school: schoolId
    });

    await student.save();

    // Gửi thông báo cho admin của trường
    await createOrUpdateGroupedNotification({
      schoolId,
      studentName: student.name,
      studentId: student._id
    });

    res.status(201).json({ message: 'Đăng ký thành công. Vui lòng chờ nhà trường xác nhận tài khoản.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

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
