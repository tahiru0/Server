import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import Notification from './Notification.js';
import notificationMessages from '../utils/notificationMessages.js';
import softDeletePlugin from '../utils/softDelete.js';
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
  evaluatorName: String,
  evaluatorAvatar: String,
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
    trim: true,
  },
  submittedAt: {
    type: Date,
    default: Date.now
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
  },
  evaluator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyAccount',
    required: true
  },
  evaluatedAt: {
    type: Date,
    default: Date.now
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
reportSchema.pre('save', async function(next) {
  for (let taskEval of this.taskEvaluations) {
    for (let evaluation of taskEval.evaluations) {
      if (evaluation.isNew || evaluation.isModified('evaluator')) {
        const evaluator = await mongoose.model('CompanyAccount').findById(evaluation.evaluator);
        if (evaluator) {
          evaluation.evaluatorName = evaluator.name;
          evaluation.evaluatorAvatar = evaluator.avatar;
        }
      }
    }
  }

  for (let evaluation of this.overallEvaluations) {
    if (evaluation.isNew || evaluation.isModified('evaluator')) {
      const evaluator = await mongoose.model('CompanyAccount').findById(evaluation.evaluator);
      if (evaluator) {
        evaluation.evaluatorName = evaluator.name;
        evaluation.evaluatorAvatar = evaluator.avatar;
      }
    }
  }

  next();
});

reportSchema.post('save', function(doc) {
  const updatedTaskEvaluations = this.modifiedPaths().filter(path => path.startsWith('taskEvaluations'));
  
  for (const path of updatedTaskEvaluations) {
    const taskEvalIndex = parseInt(path.split('.')[1]);
    const taskEval = this.taskEvaluations[taskEvalIndex];
    
    if (taskEval && taskEval.rating) {
      // Gửi thông báo bất đồng bộ
      Promise.resolve().then(async () => {
        try {
          const task = await mongoose.model('Task').findById(taskEval.task);
          if (task) {
            await Notification.insert({
              recipient: this.student,
              recipientModel: 'Student',
              type: 'task',
              content: notificationMessages.task.rated(task.name, taskEval.rating),
              relatedId: task._id
            });
          }
        } catch (error) {
          console.error('Lỗi khi gửi thông báo đánh giá task:', error);
        }
      });
    }
  }
});

reportSchema.plugin(softDeletePlugin);

const Report = mongoose.model('Report', reportSchema);

export default Report;
