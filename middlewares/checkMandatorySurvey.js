import WeeklyReport from '../models/WeeklyReport.js';

const checkMandatorySurvey = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const pendingSurvey = await WeeklyReport.findOne({
      student: studentId,
      surveyStatus: 'pending'
    });

    if (pendingSurvey) {
      return res.status(403).json({
        message: 'Bạn có khảo sát bắt buộc chưa hoàn thành. Vui lòng hoàn thành khảo sát trước khi tiếp tục.',
        pendingSurveyId: pendingSurvey._id
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server khi kiểm tra khảo sát bắt buộc' });
  }
};

export default checkMandatorySurvey;
