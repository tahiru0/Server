import express from 'express';
import Project from '../models/Project.js';
import authenticate from '../middlewares/authenticate.js';
import Company from '../models/Company.js';
import Major from '../models/Major.js';
import Task from '../models/Task.js';
import { handleError } from '../utils/errorHandler.js';
import { handleQuery } from '../utils/queryHelper.js';

const router = express.Router();

// Hàm tìm người dùng theo ID
const findUserById = async (decoded) => {
  return await Company.findCompanyAccountById(decoded);
};

// Middleware xác thực cho mentor
const authenticateMentor = authenticate(Company, findUserById, 'mentor');

// Lấy danh sách dự án của mentor
router.get('/projects', authenticateMentor, async (req, res, next) => {
  try {
    const mentorId = req.user._id.toString();
    const companyId = req.user.companyId.toString();

    const additionalFilters = { 
      mentor: mentorId,
      company: companyId
    };
    console.log('Additional Filters:', additionalFilters);

    const query = handleQuery(Project, req, additionalFilters);
    console.log('Query:', query.getFilter());

    const [projects, total] = await Promise.all([
      query.populate({
        path: 'selectedApplicants.studentId',
        select: '_id name avatar'
      }).exec(),
      Project.countDocuments(additionalFilters)
    ]);

    const formattedProjects = projects.map(project => ({
      id: project._id,
      title: project.title,
      members: project.selectedApplicants.map(applicant => ({
        id: applicant.studentId._id,
        name: applicant.studentId.name,
        avatar: applicant.studentId.avatar && !applicant.studentId.avatar.startsWith('http')
          ? `http://localhost:5000${applicant.studentId.avatar}`
          : applicant.studentId.avatar
      }))
    }));

    res.json({
      projects: formattedProjects,
      total,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10
    });
  } catch (error) {
    console.error('Error in /projects route:', error);
    next(error);
  }
});

// Cập nhật route chấp nhận ứng viên
router.post('/projects/:projectId/applicants/:applicantId/accept', authenticateMentor, async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, mentor: req.user._id });
    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }
    await project.acceptApplicant(req.params.applicantId);
    res.json({ message: 'Đã chấp nhận ứng viên' });
  } catch (error) {
    next(error);
  }
});

// Từ chối ứng viên
router.post('/projects/:projectId/applicants/:applicantId/reject', authenticateMentor, async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, mentor: req.user._id });
    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }
    project.rejectApplicant(req.params.applicantId);
    await project.save();
    res.json({ message: 'Đã từ chối ứng viên' });
  } catch (error) {
    next(error);
  }
});

// Giao task cho sinh viên
router.post('/projects/:projectId/tasks', authenticateMentor, async (req, res, next) => {
  try {
    const { name, description, deadline, assignedTo } = req.body;
    const project = await Project.findOne({ _id: req.params.projectId, mentor: req.user._id });
    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }
    const task = new Task({
      name,
      description,
      deadline,
      project: project._id,
      assignedTo
    });
    await task.save();
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

// Đánh giá task
router.put('/tasks/:taskId/rate', authenticateMentor, async (req, res, next) => {
  try {
    const { rating } = req.body;
    const task = await Task.findOne({
      _id: req.params.taskId,
      project: { $in: await Project.find({ mentor: req.user._id }).select('_id') },
      status: 'Completed'
    });

    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task hoặc task chưa hoàn thành' });
    }

    task.rating = rating;
    await task.save();

    res.json(task);
  } catch (error) {
    next(error);
  }
});

// Cập nhật trạng thái task
router.put('/tasks/:taskId/status', authenticateMentor, async (req, res, next) => {
  try {
    const { status } = req.body;
    const task = await Task.findOne({
      _id: req.params.taskId,
      project: { $in: await Project.find({ mentor: req.user._id }).select('_id') }
    });

    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }

    // Kiểm tra xem trạng thái mới có hợp lệ không
    if (!['Pending', 'In Progress', 'Completed', 'Overdue'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    task.status = status;
    await task.save();

    res.json(task);
  } catch (error) {
    next(error);
  }
});

// Tìm kiếm dự án
router.get('/search/projects', authenticateMentor, async (req, res) => {
  try {
    const { query, skills, status, startDate, endDate } = req.query;
    const projects = await Project.searchProjects(query, { skills, status, startDate, endDate });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Tìm kiếm task
router.get('/search/tasks', authenticateMentor, async (req, res) => {
  try {
    const { query, status, deadline, project } = req.query;
    const tasks = await Task.searchTasks(query, { status, deadline, project });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Tìm kiếm sinh viên
router.get('/search/students', authenticateMentor, async (req, res) => {
  try {
    const { query, skills, major } = req.query;
    const students = await Student.searchStudents(query, { skills, major });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Xem chi tiết dự án theo ID
router.get('/projects/:projectId', authenticateMentor, async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const mentorId = req.user._id;

    const project = await Project.findOne({ _id: projectId, mentor: mentorId })
      .populate({
        path: 'selectedApplicants.studentId',
        select: '_id name avatar'
      })
      .populate('relatedMajors')
      .lean();

    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }

    // Định dạng lại dữ liệu dự án
    const formattedProject = {
      id: project._id,
      title: project.title,
      description: project.description,
      status: project.status,
      isRecruiting: project.isRecruiting,
      startDate: project.startDate,
      endDate: project.endDate,
      relatedMajors: project.relatedMajors.map(major => ({
        id: major._id,
        name: major.name
      })),
      members: project.selectedApplicants.map(applicant => ({
        id: applicant.studentId._id,
        name: applicant.studentId.name,
        avatar: applicant.studentId.avatar && !applicant.studentId.avatar.startsWith('http')
          ? `http://localhost:5000${applicant.studentId.avatar}`
          : applicant.studentId.avatar
      }))
    };

    res.json(formattedProject);
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết dự án:', error);
    next(error);
  }
});

const errorHandler = (err, req, res, next) => {
  const { status, message } = handleError(err);
  res.status(status).json({ message });
};

router.use(errorHandler);

export default router;
