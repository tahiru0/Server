import express from 'express';
import Task from '../models/Task.js';
import Project from '../models/Project.js';
import Student from '../models/Student.js';
import { handleError } from '../utils/errorHandler.js';
import { authenticateStudent, authenticateMentor } from '../utils/roleAuthentication.js';

const router = express.Router();

// Tạo task mới
router.post('/', authenticateMentor, async (req, res) => {
  try {
    const { projectId, ...taskData } = req.body;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }
    
    const task = new Task({
      ...taskData,
      project: projectId
    });
    
    await task.save();
    
    project.tasks.push(task._id);
    await project.save();
    
    res.status(201).json(task);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Sinh viên nộp task
router.post('/:taskId/submit', authenticateStudent, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId).populate('project');
    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }
    
    const student = await Student.findById(req.user._id);
    if (!student.currentProjects.includes(task.project._id)) {
      return res.status(403).json({ message: 'Bạn không có quyền nộp task này' });
    }
    
    task.updateStatusIfOverdue();
    if (task.status === 'Overdue') {
      return res.status(400).json({ message: 'Không thể nộp task đã quá hạn' });
    }
    
    if (!task.canSubmit()) {
      return res.status(400).json({ message: 'Không thể nộp task này' });
    }
    
    task.status = 'Submitted';
    task.feedback = req.body.feedback;
    await task.save();
    res.json(task);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Mentor đánh giá task
router.post('/:taskId/evaluate', authenticateMentor, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, comment } = req.body;

    const task = await Task.findById(taskId).populate('project');
    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }

    if (task.project.mentor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Bạn không có quyền đánh giá task này' });
    }

    if (task.status !== 'Submitted') {
      return res.status(400).json({ message: 'Chỉ có thể đánh giá task đã được nộp' });
    }

    task.status = status === 'Completed' ? 'Completed' : 'Submitted';
    task.comment = comment;
    await task.save();

    res.json(task);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Lấy danh sách task của một dự án
router.get('/project/:projectId', authenticateMentor, async (req, res) => {
  try {
    const tasks = await Task.find({ project: req.params.projectId });
    res.json(tasks);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Lấy chi tiết một task
router.get('/:taskId', authenticateStudent, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId).populate('project', 'title');
    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }
    res.json(task);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Lấy danh sách task của sinh viên trong các dự án đang tham gia
router.get('/student-tasks', authenticateStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id).populate('currentProjects');
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên' });
    }

    const tasks = await Task.find({
      assignedTo: student._id,
      project: { $in: student.currentProjects }
    }).populate({
      path: 'project',
      select: 'title company',
      populate: {
        path: 'company',
        select: 'logo'
      }
    });

    const formattedTasks = tasks.map(task => ({
      _id: task._id,
      name: task.name,
      status: task.status,
      deadline: task.deadline,
      projectTitle: task.project.title,
      companyLogo: task.project.company.logo
    }));

    res.json(formattedTasks);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

export default router;
