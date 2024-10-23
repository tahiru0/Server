import express from 'express';
import Project from '../models/Project.js';
import authenticate from '../middlewares/authenticate.js';
import Company from '../models/Company.js';
import Major from '../models/Major.js';
import Task from '../models/Task.js';
import Student from '../models/Student.js'; // Import model Student
import { handleError } from '../utils/errorHandler.js';
import { handleQuery } from '../utils/queryHelper.js';
import Report from '../models/Report.js';
import { useCompressedFileUpload } from '../utils/upload.js';
import path from 'path';
import fs from 'fs';

const uploadTaskMaterial = useCompressedFileUpload('tasks', 'materials');

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

    const query = handleQuery(Project, req, additionalFilters);

    const [projects, total] = await Promise.all([
      query.populate({
        path: 'selectedApplicants.studentId',
        select: '_id name avatar'
      })
        .select('_id title selectedApplicants')
        .sort({ updatedAt: -1 })
        .exec(),
      Project.countDocuments(query.getFilter())
    ]);

    const formattedProjects = projects.map(project => ({
      id: project._id,
      title: project.title,
      members: project.selectedApplicants
        .filter(applicant => applicant.studentId) // Lọc ra những applicant có studentId
        .map(applicant => ({
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

// Đánh giá task
router.post('/tasks/:taskId/evaluate', authenticateMentor, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { rating, comment } = req.body;

    const task = await Task.findOne({
      _id: taskId,
      project: { $in: await Project.find({ mentor: req.user._id }).select('_id') }
    });

    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task hoặc bạn không có quyền đánh giá' });
    }

    let report = await Report.findOne({
      student: task.assignedTo,
      project: task.project
    });

    if (!report) {
      report = new Report({
        student: task.assignedTo,
        project: task.project,
        taskEvaluations: []
      });
    }

    let taskEvaluation = report.taskEvaluations.find(te => te.task.toString() === taskId);
    let calculatedRating = rating;

    if (task.taskType === 'multipleChoice') {
      // Tính điểm tự động cho bài trắc nghiệm
      const correctAnswers = task.questions.map(q => q.correctAnswer);
      const studentAnswers = task.studentAnswer;
      const totalQuestions = correctAnswers.length;
      const correctCount = correctAnswers.filter((answer, index) => answer === studentAnswers[index]).length;
      calculatedRating = (correctCount / totalQuestions) * 10;
    }

    if (taskEvaluation) {
      // Cập nhật đánh giá hiện có
      taskEvaluation.rating = calculatedRating;
      taskEvaluation.comment = comment;
      taskEvaluation.evaluator = req.user._id;
      taskEvaluation.evaluatedAt = new Date();
    } else {
      // Tạo đánh giá mới
      taskEvaluation = {
        task: taskId,
        rating: calculatedRating,
        comment,
        evaluator: req.user._id,
        evaluatedAt: new Date()
      };
      report.taskEvaluations.push(taskEvaluation);
    }

    await report.save();

    task.status = 'Evaluated';
    task.rating = calculatedRating;
    task.comment = comment;
    await task.save();

    res.json({ message: 'Đã đánh giá task thành công', rating: calculatedRating });
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

    // Chỉ cho phép cập nhật trạng thái từ "In Progress" sang "Completed"
    if (task.status !== 'In Progress' || status !== 'Completed') {
      return res.status(400).json({ message: 'Chỉ có thể cập nhật trạng thái từ "In Progress" sang "Completed"' });
    }

    task.status = status;
    await task.save();

    res.json(task);
  } catch (error) {
    next(error);
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

    const projectDetails = await Project.getProjectDetails(projectId, mentorId);

    res.json(projectDetails);
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết dự án:', error);
    next(error);
  }
});

// Lấy danh sách task của một dự án
router.get('/projects/:projectId/tasks', authenticateMentor, async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const {
      name,
      assignedTo,
      status,
      deadlineStart,
      deadlineEnd,
      sortBy = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    const project = await Project.findOne({ _id: projectId, mentor: req.user._id });
    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }

    let searchCriteria = { project: projectId };

    if (name) {
      searchCriteria.name = { $regex: name, $options: 'i' };
    }

    if (assignedTo) {
      searchCriteria.assignedTo = assignedTo;
    }

    if (status) {
      searchCriteria.status = status;
    }

    if (deadlineStart || deadlineEnd) {
      searchCriteria.deadline = {};
      if (deadlineStart) {
        searchCriteria.deadline.$gte = new Date(deadlineStart);
      }
      if (deadlineEnd) {
        searchCriteria.deadline.$lte = new Date(deadlineEnd);
      }
    }

    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const sortOption = {};
    sortOption[sortBy] = order === 'desc' ? -1 : 1;

    const total = await Task.countDocuments(searchCriteria);

    let tasks = await Task.find(searchCriteria)
      .populate('assignedTo', 'name avatar _id')
      .select('name assignedTo status deadline rating')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNumber);

    const formattedTasks = tasks.map(task => ({
      _id: task._id,
      name: task.name,
      assignedTo: task.assignedTo ? { name: task.assignedTo.name, avatar: task.assignedTo.avatar, _id: task.assignedTo._id } : { name: 'Chưa giao', avatar: null, id: null },
      status: task.status,
      deadline: task.deadline,
      rating: task.rating
    }));

    const totalPages = Math.ceil(total / limitNumber);

    res.json({
      tasks: formattedTasks,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages,
      hasNextPage: pageNumber < totalPages,
      hasPrevPage: pageNumber > 1
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách task:', error);
    next(error);
  }
});

// Tạo task mới
router.post('/projects/:projectId/tasks', authenticateMentor, (req, res, next) => {
  const { projectId } = req.params;
  const customDir = `company/${req.user.companyId}/${projectId}/materials`;
  const upload = useCompressedFileUpload(customDir, '', 200, ['.pdf', '.doc', '.docx', '.zip']);

  upload.single('file')(req, res, async (err) => {
    if (err) {
      return next(err);
    }
    try {
      const { name, description, deadline, assignedTo, taskType, questions } = req.body;
      let fileRequirements;

      if (req.body.fileRequirements) {
        try {
          fileRequirements = JSON.parse(req.body.fileRequirements);
        } catch (error) {
          return res.status(400).json({ message: 'Định dạng fileRequirements không hợp lệ' });
        }
      }

      const project = await Project.findOne({ _id: projectId, mentor: req.user._id });
      if (!project) {
        return res.status(404).json({ message: 'Không tìm thấy dự án' });
      }

      let parsedQuestions;
      if (questions) {
        try {
          parsedQuestions = JSON.parse(questions);
        } catch (error) {
          return res.status(400).json({ message: 'Định dạng câu hỏi không hợp lệ' });
        }
      }

      const task = new Task({
        name,
        description,
        deadline,
        project: projectId,
        assignedTo,
        taskType,
        questions: parsedQuestions,
        fileRequirements: taskType === 'fileUpload' ? {
          maxSize: fileRequirements && fileRequirements.maxSize ? Math.min(Number(fileRequirements.maxSize), 1024) : 1024,
          allowedExtensions: fileRequirements && fileRequirements.allowedExtensions ? fileRequirements.allowedExtensions : []
        } : undefined,
      });

      if (req.file) {
        const relativePath = path.relative('public', req.file.path).replace(/\\/g, '/');
        task.materialFile = relativePath;
      }

      await task.save();
      res.status(201).json({ message: 'Đã tạo task mới thành công' });
    } catch (error) {
      next(error);
    }
  });
});

// Cập nhật task
router.put('/tasks/:taskId', authenticateMentor, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const updateData = req.body;

    const task = await Task.findOneAndUpdate(
      { _id: taskId, project: { $in: await Project.find({ mentor: req.user._id }).select('_id') } },
      updateData,
      { new: true, runValidators: true }
    );

    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task hoặc bạn không có quyền cập nhật' });
    }

    res.json({ message: 'Đã cập nhật task thành công' });
  } catch (error) {
    next(error);
  }
});

// Lấy chi tiết task
router.get('/tasks/:taskId', authenticateMentor, async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findOne({
      _id: taskId,
      project: { $in: await Project.find({ mentor: req.user._id }).select('_id') }
    })
      .populate('assignedTo', 'name avatar _id')
      .populate('project', 'title _id');

    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }

    const formattedTask = {
      ...task.toObject(),
      project: {
        id: task.project._id,
        title: task.project.title
      },
      assignedTo: task.assignedTo ? {
        id: task.assignedTo._id,
        name: task.assignedTo.name,
        avatar: task.assignedTo.avatar
      } : null
    };

    res.json(formattedTask);
  } catch (error) {
    next(error);
  }
});

// Thêm route lấy thông tin sinh viên
router.get('/students/:studentId', authenticateMentor, async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId)
      .select('_id name email avatar major skills dateOfBirth gender phoneNumber studentId cv')
      .populate('school', '_id name')
      .populate('major', 'name')
      .populate('skills', 'name');

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên' });
    }

    const formattedStudent = {
      id: student._id,
      name: student.name,
      email: student.email,
      avatar: student.avatar,
      school: student.school,
      major: student.major ? student.major.name : null,
      skills: student.skills.map(skill => skill.name),
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      phoneNumber: student.phoneNumber,
      studentId: student.studentId,
      cv: student.cv
    };

    res.json(formattedStudent);
  } catch (error) {
    next(error);
  }
});

// Thêm route xem danh sách applicants
router.get('/projects/:projectId/applicants', authenticateMentor, async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ _id: projectId, mentor: req.user._id })
      .populate({
        path: 'applicants.applicantId',
        select: '_id name avatar',
        populate: [
          { path: 'major', select: 'name' },
          { path: 'school', select: '_id name' }
        ]
      });

    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }

    const applicants = project.applicants.map(applicant => ({
      id: applicant.applicantId._id,
      name: applicant.applicantId.name,
      avatar: applicant.applicantId.avatar && !applicant.applicantId.avatar.startsWith('http')
        ? `http://localhost:5000${applicant.applicantId.avatar}`
        : applicant.applicantId.avatar,
      major: applicant.applicantId.major ? applicant.applicantId.major.name : null,
      school: applicant.applicantId.school ? {
        id: applicant.applicantId.school._id,
        name: applicant.applicantId.school.name
      } : null
    }));

    res.json(applicants);
  } catch (error) {
    next(error);
  }
});
// Xóa sinh viên khỏi dự án
router.post('/projects/:projectId/remove-student/:studentId', authenticateMentor, async (req, res, next) => {
  try {
    const { projectId, studentId } = req.params;
    const { reason } = req.body;

    const project = await Project.findOne({ _id: projectId, mentor: req.user._id });
    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }

    await project.removeStudentFromProject(studentId, reason);

    res.json({ message: 'Đã xóa sinh viên khỏi dự án thành công' });
  } catch (error) {
    next(error);
  }
});

// Đánh giá tổng thể sinh viên
router.post('/students/:studentId/evaluate', authenticateMentor, async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { rating, comment } = req.body;

    const report = await Report.findOne({
      student: studentId,
      project: { $in: await Project.find({ mentor: req.user._id }).select('_id') }
    });

    if (!report) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo cho sinh viên này' });
    }

    report.overallEvaluations.push({
      evaluator: req.user._id,
      rating,
      comment
    });

    await report.save();

    res.json(report);
  } catch (error) {
    next(error);
  }
});

// Xem bài làm của sinh viên
router.get('/tasks/:taskId/submission', authenticateMentor, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findOne({
      _id: taskId,
      project: { $in: await Project.find({ mentor: req.user._id }).select('_id') }
    });

    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }

    res.json({
      taskType: task.taskType,
      studentAnswer: task.studentAnswer,
      studentFile: task.studentFile
    });
  } catch (error) {
    next(error);
  }
});

// Xóa file tài liệu
router.delete('/tasks/:taskId/material', authenticateMentor, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findOne({
      _id: taskId,
      project: { $in: await Project.find({ mentor: req.user._id }).select('_id') }
    });

    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task hoặc bạn không có quyền xóa' });
    }

    if (task.materialFile) {
      fs.unlinkSync(task.materialFile);
      task.materialFile = null;
      await task.save();
    }

    res.json({ message: 'Đã xóa file tài liệu thành công' });
  } catch (error) {
    next(error);
  }
});

// Lấy thống kê dự án
router.get('/projects/:projectId/statistics', authenticateMentor, async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const statistics = await Project.getProjectStatistics(projectId);
    res.json(statistics);
  } catch (error) {
    next(error);
  }
});

router.use((error, req, res, next) => {
  const { status, message } = handleError(error);
  res.status(status).json({ message });
});

export default router;
