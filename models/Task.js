import mongoose from 'mongoose';
import Notification from './Notification.js';
import sanitizeHtml from 'sanitize-html';
import notificationMessages from '../utils/notificationMessages.js';

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

const taskSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên công việc không được để trống'],
    trim: true,
    maxlength: [100, 'Tên công việc không được vượt quá 100 ký tự'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
  },
  description: {
    type: String,
    required: [true, 'Mô tả công việc không được để trống'],
    trim: true,
    maxlength: [1000, 'Mô tả không được vượt quá 1000 ký tự'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
  },
  deadline: {
    type: Date,
    required: [true, 'Hạn chót không được để trống'],
    validate: {
      validator: function(v) {
        return v > new Date();
      },
      message: 'Hạn chót phải là một ngày trong tương lai'
    }
  },
  status: {
    type: String,
    enum: {
      values: ['Pending', 'In Progress', 'Completed', 'Overdue'],
      message: '{VALUE} không phải là trạng thái hợp lệ'
    },
    default: 'Pending'
  },
  rating: {
    type: Number,
    min: [1, 'Đánh giá tối thiểu là 1'],
    max: [10, 'Đánh giá tối đa là 10'],
    validate: {
      validator: function(v) {
        return this.status === 'Completed' && this.deadline < new Date() ? v != null : true;
      },
      message: 'Đánh giá không được để trống khi công việc đã hoàn thành và qua hạn chót'
    }
  },
  comment: {
    type: String,
    maxlength: [1000, 'Bình luận không được vượt quá 1000 ký tự'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Người được giao task không được để trống'],
    validate: {
      validator: async function(value) {
        const project = await mongoose.model('Project').findById(this.project);
        return project && project.selectedApplicants.some(applicant => 
          applicant.studentId.toString() === value.toString()
        );
      },
      message: 'Người được giao task phải là một trong những sinh viên đã được chọn cho dự án'
    }
  },
  isDeleted: { type: Boolean, default: false }, // Soft delete
  ratedAt: {
    type: Date
  }
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

// Method to check and update task status if overdue
taskSchema.methods.updateStatusIfOverdue = function () {
  const now = new Date();
  if (this.deadline < now && this.status !== 'Completed') {
    this.status = 'Overdue';
  }
};

// Middleware to check task status before saving
taskSchema.pre('save', async function (next) {
  const wasOverdue = this.status === 'Overdue';
  this.updateStatusIfOverdue();
  
  if (this.isNew) {
    // Tạo thông báo cho task mới
    const project = await mongoose.model('Project').findById(this.project);
    if (project) {
      await Notification.insert({
        recipient: this.assignedTo,
        recipientModel: 'Student',
        type: 'task',
        content: notificationMessages.task.assigned(this.name, project.title),
        relatedId: this._id
      });

      // Tạo thông báo cho mentor
      await Notification.insert({
        recipient: project.mentor,
        recipientModel: 'CompanyAccount',
        recipientRole: 'mentor',
        type: 'task',
        content: notificationMessages.task.newTaskForMentor(this.name, project.title),
        relatedId: this._id
      });
    }
  } else if (this.isModified('status') || this.isModified('deadline')) {
    // Tạo thông báo khi cập nhật trạng thái hoặc deadline
    await Notification.insert({
      recipient: this.assignedTo,
      recipientModel: 'Student',
      type: 'task',
      content: `Task "${this.name}" đã được cập nhật`,
      relatedId: this._id
    });

    // Tạo thông báo cho mentor
    const project = await mongoose.model('Project').findById(this.project);
    if (project) {
      await Notification.insert({
        recipient: project.mentor,
        recipientModel: 'CompanyAccount',
        recipientRole: 'mentor',
        type: 'task',
        content: `Task "${this.name}" trong dự án "${project.title}" đã được cập nhật`,
        relatedId: this._id
      });
    }

    // Tạo thông báo khi task quá hạn
    if (!wasOverdue && this.status === 'Overdue') {
      await Notification.insert({
        recipient: this.assignedTo,
        recipientModel: 'Student',
        type: 'task',
        content: notificationMessages.task.overdue(this.name),
        relatedId: this._id
      });
    }
  }
  
  if (this.isModified('rating') && this.status === 'Completed' && this.deadline < new Date()) {
    await Notification.insert({
      recipient: this.assignedTo,
      recipientModel: 'Student',
      type: 'task',
      content: notificationMessages.task.rated(this.name, this.rating),
      relatedId: this._id
    });
  }

  if (this.isModified('rating') && !this.ratedAt) {
    this.ratedAt = new Date();
  }
  
  next();
});

taskSchema.pre('find', function(next) {
  this.find({ isDeleted: false });
  next();
});

taskSchema.pre('findOne', function(next) {
  this.findOne({ isDeleted: false });
  next();
});

taskSchema.post('find', function(docs) {
  if (Array.isArray(docs)) {
    docs.forEach(doc => doc.updateStatusIfOverdue());
  }
});

taskSchema.post('findOne', function(doc) {
  if (doc) {
    doc.updateStatusIfOverdue();
  }
});

taskSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate();
  if (update.$set) {
    Object.keys(update.$set).forEach(key => {
      if (update.$set[key] === null || update.$set[key] === '') {
        delete update.$set[key];
      }
    });
  }

  const task = await this.model.findOne(this.getQuery());
  if (task) {
    if (task.ratedAt && (update.$set.rating || update.$set.comment)) {
      throw new Error('Không thể sửa đánh giá sau khi đã đánh giá');
    }
    task.updateStatusIfOverdue();
    await task.save();
  }

  if (update.$set.rating || update.$set.comment) {
    update.$set.ratedAt = new Date();
  }

  next();
});

taskSchema.statics.searchTasks = async function (query, filters) {
  let searchCriteria = {};

  if (query) {
    searchCriteria.$or = [
      { name: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } }
    ];
  }

  if (filters.status) {
    searchCriteria.status = filters.status;
  }

  if (filters.deadline) {
    searchCriteria.deadline = { $lte: new Date(filters.deadline) };
  }

  if (filters.project) {
    searchCriteria.project = filters.project;
  }

  const tasks = await this.find(searchCriteria)
    .populate('assignedTo', 'name avatar')
    .select('name description deadline status rating project assignedTo');

  return tasks.map(task => ({
    _id: task._id,
    name: task.name,
    description: task.description,
    deadline: task.deadline,
    status: task.status,
    rating: task.rating,
    project: task.project,
    assignedTo: {
      _id: task.assignedTo._id,
      name: task.assignedTo.name,
      avatar: task.assignedTo.avatar
    }
  }));
};

const Task = mongoose.model('Task', taskSchema);
export default Task;

/**
 * @openapi
 * components:
 *   schemas:
 *     Task:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Tên của công việc.
 *           example: Phát triển tính năng đăng nhập
 *         description:
 *           type: string
 *           description: Mô tả chi tiết của công việc.
 *           example: Tạo giao diện và logic cho tính năng đăng nhập.
 *         deadline:
 *           type: string
 *           format: date
 *           description: Ngày hết hạn để hoàn thành công việc.
 *           example: 2024-12-31
 *         status:
 *           type: string
 *           enum:
 *             - Pending
 *             - In Progress
 *             - Completed
 *             - Overdue
 *           description: Trạng thái hiện tại của công việc.
 *           example: Pending
 *         rating:
 *           type: number
 *           format: float
 *           description: Đánh giá của công việc sau khi hoàn thành.
 *           example: 4
 *         project:
 *           type: string
 *           format: uuid
 *           description: ID của dự án mà công việc thuộc về.
 *           example: 60d5f4f4c72d4b6d1c4f4f5c
 *         assignedTo:
 *           type: string
 *           format: uuid
 *           description: ID của sinh viên được giao công việc.
 *           example: 60d5f4f4c72d4b6d1c4f4f5c
 *         isDeleted:
 *           type: boolean
 *           description: Trạng thái xóa mềm của công việc.
 *           example: false
 *       required:
 *         - name
 *         - description
 *         - deadline
 *         - project
 *         - assignedTo
 */

