import mongoose from 'mongoose';
import Notification from './Notification.js';
import sanitizeHtml from 'sanitize-html';

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
    max: [5, 'Đánh giá tối đa là 5'],
    validate: {
      validator: function(v) {
        return this.status === 'Completed' ? v != null : true;
      },
      message: 'Đánh giá không được để trống khi công việc đã hoàn thành'
    }
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  isDeleted: { type: Boolean, default: false } // Soft delete
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
  this.updateStatusIfOverdue();
  
  if (this.isNew) {
    // Tạo thông báo cho task mới
    await Notification.create({
      recipient: this.assignedTo,
      recipientModel: 'Student',
      type: 'task',
      content: `Bạn đã được giao một task mới: ${this.name}`,
      relatedId: this._id
    });

    // Tạo thông báo cho mentor
    const project = await mongoose.model('Project').findById(this.project);
    if (project) {
      await Notification.create({
        recipient: project.mentor,
        recipientModel: 'CompanyAccount',
        type: 'task',
        content: `Một task mới đã được tạo cho dự án "${project.title}": ${this.name}`,
        relatedId: this._id
      });
    }
  } else if (this.isModified('status') || this.isModified('deadline')) {
    // Tạo thông báo khi cập nhật trạng thái hoặc deadline
    await Notification.create({
      recipient: this.assignedTo,
      recipientModel: 'Student',
      type: 'task',
      content: `Task "${this.name}" đã được cập nhật`,
      relatedId: this._id
    });

    // Tạo thông báo cho mentor
    const project = await mongoose.model('Project').findById(this.project);
    if (project) {
      await Notification.create({
        recipient: project.mentor,
        recipientModel: 'CompanyAccount',
        type: 'task',
        content: `Task "${this.name}" trong dự án "${project.title}" đã được cập nhật`,
        relatedId: this._id
      });
    }
  }
  
  next();
});

// Thay thế các middleware hiện có
taskSchema.pre('find', async function(next) {
    const tasks = await this.find({}).exec();
    tasks.forEach(task => task.updateStatusIfOverdue());
    next();
});

taskSchema.pre('findOne', async function(next) {
    const task = await this.findOne({}).exec();
    if (task) {
        task.updateStatusIfOverdue();
    }
    next();
});

const Task = mongoose.model('Task', taskSchema);

taskSchema.methods.softDelete = function() {
    this.isDeleted = true;
    return this.save();
};

taskSchema.methods.restore = function() {
    this.isDeleted = false;
    return this.save();
};

taskSchema.statics.findByIdAndNotDeleted = async function(id) {
  return this.findOne({ _id: id, isDeleted: false }).exec();
};

taskSchema.statics.findAllActiveByProject = async function(projectId) {
  return this.find({ project: projectId, isDeleted: false }).exec();
};

taskSchema.statics.findAllActiveByStudent = async function(studentId) {
  return this.find({ assignedTo: studentId, isDeleted: false }).exec();
};

taskSchema.statics.findOverdueTasks = async function() {
  const now = new Date();
  return this.find({ deadline: { $lt: now }, status: { $ne: 'Completed' }, isDeleted: false }).exec();
};

// Thêm middleware để xử lý cập nhật
taskSchema.pre('findOneAndUpdate', function(next) {
    const update = this.getUpdate();
    if (update.$set) {
        Object.keys(update.$set).forEach(key => {
            if (update.$set[key] === null || update.$set[key] === '') {
                delete update.$set[key];
            }
        });
    }
    next();
});

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

