import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'excused', 'unexcused'],
    required: true
  },
  checkedInBy: {
    type: String,
    enum: ['student', 'mentor'],
    required: true
  },
  checkedInAt: {
    type: Date,
    default: Date.now
  },
  dailyReport: {
    type: String,
    maxlength: 1000
  },
  mentorComment: {
    type: String,
    maxlength: 500
  }
}, { _id: false });

const taskEvaluationSchema = new mongoose.Schema({
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 10
  },
  comment: String
}, { _id: false });

const weeklyReportSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  weekStartDate: {
    type: Date,
    required: true
  },
  weekEndDate: {
    type: Date,
    required: true
  },
  summary: {
    type: String,
    required: true,
    maxlength: 2000
  },
  mentorFeedback: {
    type: String,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'reviewed'],
    default: 'draft'
  },
  submittedAt: Date,
  reviewedAt: Date,
  attendances: [attendanceSchema],
  survey: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Survey'
  },
  surveyResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  surveyStatus: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending'
  },
  taskEvaluations: [taskEvaluationSchema]
}, { timestamps: true });

weeklyReportSchema.index({ student: 1, project: 1, weekStartDate: 1 }, { unique: true });

const WeeklyReport = mongoose.model('WeeklyReport', weeklyReportSchema);

export default WeeklyReport;
