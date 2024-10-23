import express from 'express';
import Task from '../models/Task.js';
import WeeklyReport from '../models/WeeklyReport.js';
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
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
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
    const { status, comment, weeklyReportId, rating } = req.body;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }

    task.status = status;
    task.comment = comment;
    await task.save();

    if (weeklyReportId && rating) {
      const weeklyReport = await WeeklyReport.findById(weeklyReportId);
      if (!weeklyReport) {
        return res.status(404).json({ message: 'Không tìm thấy báo cáo tuần' });
      }

      const taskEvaluation = weeklyReport.taskEvaluations.find(
        te => te.task.toString() === taskId
      );

      if (taskEvaluation) {
        taskEvaluation.rating = rating;
        taskEvaluation.comment = comment;
      } else {
        weeklyReport.taskEvaluations.push({ task: taskId, rating, comment });
      }

      await weeklyReport.save();
    }

    res.json(task);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Các route khác...

export default router;
