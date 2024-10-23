import express from 'express';
import WeeklyReport from '../models/WeeklyReport.js';
import Survey from '../models/Survey.js';
import { handleError } from '../utils/errorHandler.js';
import { 
  authenticateStudent, 
  authenticateMentor, 
  authenticateSchoolFaculty 
} from '../utils/roleAuthentication.js';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import notificationMessages from '../utils/notificationMessages.js';
import Task from '../models/Task.js';

const router = express.Router();

// Route cho sinh viên điểm danh và gửi báo cáo hàng ngày
router.post('/attendance', authenticateStudent, async (req, res) => {
  try {
    const { projectId, date, dailyReport } = req.body;
    const studentId = req.user._id;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      let weeklyReport = await WeeklyReport.findOne({
        student: studentId,
        project: projectId,
        weekStartDate: weekStart,
        weekEndDate: weekEnd
      }).session(session);

      if (!weeklyReport) {
        weeklyReport = new WeeklyReport({
          student: studentId,
          project: projectId,
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          attendances: []
        });
      }

      weeklyReport.attendances.push({
        date: new Date(date),
        status: 'present',
        checkedInBy: 'student',
        dailyReport
      });

      await weeklyReport.save({ session });
      await session.commitTransaction();
      res.status(201).json({ message: 'Điểm danh và báo cáo hàng ngày đã được ghi nhận', weeklyReport });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Route cho mentor xác nhận điểm danh và nhận xét báo cáo hàng ngày
router.put('/attendance/:weeklyReportId/:date', authenticateMentor, async (req, res) => {
  try {
    const { weeklyReportId, date } = req.params;
    const { status, mentorComment } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      let weeklyReport = await WeeklyReport.findOne({
        _id: weeklyReportId,
        weekStartDate: weekStart,
        weekEndDate: weekEnd
      }).session(session);

      if (!weeklyReport) {
        // Nếu không tìm thấy báo cáo tuần, tạo mới
        weeklyReport = new WeeklyReport({
          _id: weeklyReportId,
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          attendances: []
        });
      }

      const attendance = weeklyReport.attendances.find(a => a.date.toISOString().split('T')[0] === date);
      if (!attendance) {
        // Nếu không tìm thấy bản ghi điểm danh, tạo mới
        weeklyReport.attendances.push({
          date: new Date(date),
          status: status || 'present',
          checkedInBy: 'mentor',
          mentorComment
        });
      } else {
        // Cập nhật bản ghi điểm danh hiện có
        attendance.status = status || attendance.status;
        attendance.mentorComment = mentorComment;
        attendance.checkedInBy = 'mentor';
      }

      await weeklyReport.save({ session });
      await session.commitTransaction();

      res.json({ message: 'Đã cập nhật điểm danh và nhận xét', attendance: weeklyReport.attendances.find(a => a.date.toISOString().split('T')[0] === date) });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Route cho mentor xem và đánh giá báo cáo tuần
router.get('/mentor/:projectId', authenticateMentor, async (req, res) => {
  try {
    const { projectId } = req.params;
    const weeklyReports = await WeeklyReport.find({ project: projectId })
      .populate('student', 'name')
      .sort({ weekStartDate: -1 });

    res.json(weeklyReports);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Route cho mentor đánh giá báo cáo tuần
router.put('/:reportId/review', authenticateMentor, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { mentorFeedback } = req.body;

    const weeklyReport = await WeeklyReport.findById(reportId);
    if (!weeklyReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo tuần' });
    }

    weeklyReport.mentorFeedback = mentorFeedback;
    weeklyReport.status = 'reviewed';
    weeklyReport.reviewedAt = new Date();
    await weeklyReport.save();

    res.json({ message: 'Đã đánh giá báo cáo tuần', weeklyReport });
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Route cho giảng viên xem báo cáo tuần của sinh viên
router.get('/faculty/:studentId', authenticateSchoolFaculty, async (req, res) => {
  try {
    const { studentId } = req.params;
    const weeklyReports = await WeeklyReport.find({ student: studentId })
      .populate('project', 'title')
      .sort({ weekStartDate: -1 });

    res.json(weeklyReports);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Route cho sinh viên trả lời khảo sát
router.post('/:reportId/survey', authenticateStudent, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { surveyResponse } = req.body;

    const weeklyReport = await WeeklyReport.findById(reportId);
    if (!weeklyReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo tuần' });
    }

    if (!weeklyReport.survey) {
      return res.status(400).json({ message: 'Không có khảo sát cho báo cáo này' });
    }

    weeklyReport.surveyResponse = surveyResponse;
    weeklyReport.surveyStatus = 'completed';
    await weeklyReport.save();

    // Tạo thông báo cho khoa
    await Notification.insert({
      recipient: weeklyReport.project.faculty,
      recipientModel: 'SchoolAccount',
      type: 'survey',
      content: notificationMessages.survey.surveyCompleted(weeklyReport.project.title),
      relatedData: {
        weeklyReportId: weeklyReport._id,
        surveyId: weeklyReport.survey
      }
    });

    res.json({ message: 'Đã gửi phản hồi khảo sát thành công' });
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Route cho việc gửi khảo sát
router.post('/:reportId/send-survey', authenticateSchoolFaculty, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { surveyId } = req.body;

    const weeklyReport = await WeeklyReport.findById(reportId).populate('student', 'name');
    if (!weeklyReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo tuần' });
    }

    weeklyReport.survey = surveyId;
    weeklyReport.surveyStatus = 'pending';
    await weeklyReport.save();

    // Tạo thông báo cho mentor
    await Notification.insert({
      recipient: weeklyReport.project.mentor,
      recipientModel: 'Mentor',
      type: 'survey',
      content: notificationMessages.survey.newMandatorySurveyForMentor(weeklyReport.project.title, weeklyReport.student.name),
      relativeLink: `/weekly-report/${weeklyReport._id}/survey`,
      relatedData: {
        weeklyReportId: weeklyReport._id,
        surveyId: surveyId,
        studentId: weeklyReport.student._id
      }
    });

    res.json({ message: 'Đã gửi khảo sát bắt buộc cho mentor thành công' });
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

router.post('/student/:reportId/survey', authenticateStudent, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { surveyResponse } = req.body;

    const weeklyReport = await WeeklyReport.findById(reportId);
    if (!weeklyReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo tuần' });
    }

    if (!weeklyReport.survey) {
      return res.status(400).json({ message: 'Không có khảo sát cho báo cáo này' });
    }

    weeklyReport.surveyResponse = surveyResponse;
    weeklyReport.surveyStatus = 'completed';
    await weeklyReport.save();

    // Tạo thông báo cho khoa
    await Notification.insert({
      recipient: weeklyReport.project.faculty,
      recipientModel: 'SchoolAccount',
      type: 'survey',
      content: notificationMessages.survey.surveyCompleted(weeklyReport.project.title),
      relatedData: {
        weeklyReportId: weeklyReport._id,
        surveyId: weeklyReport.survey
      }
    });

    res.json({ message: 'Đã gửi phản hồi khảo sát thành công' });
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

router.post('/mentor/:reportId/survey', authenticateMentor, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { surveyResponse } = req.body;

    const weeklyReport = await WeeklyReport.findById(reportId)
      .populate('student', 'name')
      .populate('project', 'title');
    if (!weeklyReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo tuần' });
    }

    if (!weeklyReport.survey) {
      return res.status(400).json({ message: 'Không có khảo sát cho báo cáo này' });
    }

    weeklyReport.mentorSurveyResponse = surveyResponse;
    weeklyReport.mentorSurveyStatus = 'completed';
    await weeklyReport.save();

    // Tạo thông báo cho khoa
    await Notification.insert({
      recipient: weeklyReport.project.faculty,
      recipientModel: 'SchoolAccount',
      type: 'survey',
      content: notificationMessages.survey.mentorSurveyCompleted(weeklyReport.project.title, weeklyReport.student.name),
      relatedData: {
        weeklyReportId: weeklyReport._id,
        surveyId: weeklyReport.survey,
        studentId: weeklyReport.student._id
      }
    });

    res.json({ message: 'Đã gửi phản hồi khảo sát thành công' });
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

router.get('/mentor/:projectId/surveys', authenticateMentor, async (req, res) => {
  try {
    const { projectId } = req.params;
    const weeklyReports = await WeeklyReport.find({ 
      project: projectId,
      survey: { $exists: true },
      mentorSurveyStatus: 'pending'
    })
    .populate('student', 'name _id')
    .populate('survey')
    .select('student survey weekStartDate weekEndDate');

    res.json(weeklyReports);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

router.post('/:reportId/send-student-survey', authenticateSchoolFaculty, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { surveyId } = req.body;

    const weeklyReport = await WeeklyReport.findById(reportId).populate('student', 'name');
    if (!weeklyReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo tuần' });
    }

    weeklyReport.studentSurvey = surveyId;
    weeklyReport.studentSurveyStatus = 'pending';
    await weeklyReport.save();

    // Tạo thông báo cho sinh viên
    await Notification.insert({
      recipient: weeklyReport.student._id,
      recipientModel: 'Student',
      type: 'survey',
      content: notificationMessages.survey.newMandatorySurveyForStudent(weeklyReport.project.title),
      relativeLink: `/weekly-report/${weeklyReport._id}/student-survey`,
      relatedData: {
        weeklyReportId: weeklyReport._id,
        surveyId: surveyId
      }
    });

    res.json({ message: 'Đã gửi khảo sát bắt buộc cho sinh viên thành công' });
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

router.get('/tasks/:reportId', authenticateStudent, async (req, res) => {
  try {
    const { reportId } = req.params;
    
    const weeklyReport = await WeeklyReport.findById(reportId);
    if (!weeklyReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo tuần' });
    }
    
    const tasks = await Task.find({
      project: weeklyReport.project,
      createdAt: { $gte: weeklyReport.weekStartDate, $lte: weeklyReport.weekEndDate }
    });
    
    res.json(tasks);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

export default router;
