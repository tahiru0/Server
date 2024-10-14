import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

const evaluationSchema = new mongoose.Schema({
  evaluator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyAccount',
    required: true
  },
  rating: {
    type: Number,
    min: 0,
    max: 10,
    required: true
  },
  comment: {
    type: String,
    trim: true,
    set: (value) => sanitizeHtml(value, sanitizeOptions)
  },
  evaluatedAt: {
    type: Date,
    default: Date.now
  }
});

const taskEvaluationSchema = new mongoose.Schema({
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    set: (value) => sanitizeHtml(value, sanitizeOptions)
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  evaluations: [evaluationSchema],
  averageRating: {
    type: Number,
    min: 0,
    max: 10,
    default: 0
  }
});

const reportSchema = new mongoose.Schema({
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
  taskEvaluations: [taskEvaluationSchema],
  overallEvaluations: [evaluationSchema],
  overallAverageRating: {
    type: Number,
    min: 0,
    max: 10,
    default: 0
  }
}, { timestamps: true });

// Middleware để tự động cập nhật điểm đánh giá trung bình
reportSchema.pre('save', function(next) {
  // Cập nhật điểm trung bình cho mỗi task
  this.taskEvaluations.forEach(taskEval => {
    if (taskEval.evaluations.length > 0) {
      const sum = taskEval.evaluations.reduce((acc, evaluation) => acc + evaluation.rating, 0);
      taskEval.averageRating = sum / taskEval.evaluations.length;
    }
  });

  // Cập nhật điểm trung bình tổng thể
  if (this.overallEvaluations.length > 0) {
    const sum = this.overallEvaluations.reduce((acc, evaluation) => acc + evaluation.rating, 0);
    this.overallAverageRating = sum / this.overallEvaluations.length;
  }

  next();
});

const Report = mongoose.model('Report', reportSchema);

export default Report;
