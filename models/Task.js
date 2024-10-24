import mongoose from 'mongoose';
import Notification from './Notification.js';
import notificationMessages from '../utils/notificationMessages.js';
import softDeletePlugin from '../utils/softDelete.js';

const taskSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên công việc không được để trống'],
    trim: true,
    maxlength: [100, 'Tên công việc không được vượt quá 100 ký tự'],
  },
  description: {
    type: String,
    required: [true, 'Mô tả công việc không được để trống'],
    trim: true,
    maxlength: [1000, 'Mô tả không được vượt quá 1000 ký tự'],
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
      values: ['Assigned', 'Submitted', 'Completed', 'Overdue'],
      message: '{VALUE} không phải là trạng thái hợp lệ'
    },
    default: 'Assigned'
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
  comment: {
    type: String,
    maxlength: [1000, 'Nhận xét không được vượt quá 1000 ký tự'],
  },
  feedback: {
    type: String,
    maxlength: [1000, 'Phản hồi không được vượt quá 1000 ký tự'],
  },
  submittedAt: Date,
  completedAt: Date,
}, { timestamps: true });

taskSchema.methods.updateStatusIfOverdue = function () {
  const now = new Date();
  if (this.deadline < now && this.status === 'Assigned') {
    this.status = 'Overdue';
  }
};

taskSchema.methods.canSubmit = function () {
  return this.status === 'Assigned' || this.status === 'Overdue';
};

taskSchema.pre('save', async function (next) {
  const wasOverdue = this.status === 'Overdue';
  this.updateStatusIfOverdue();
  
  if (this.isNew) {
    const project = await mongoose.model('Project').findById(this.project);
    if (project) {
      await Notification.insert({
        recipient: this.assignedTo,
        recipientModel: 'Student',
        type: 'task',
        content: notificationMessages.task.assigned(this.name, project.title),
        relatedId: this._id
      });

      await Notification.insert({
        recipient: project.mentor,
        recipientModel: 'CompanyAccount',
        recipientRole: 'mentor',
        type: 'task',
        content: notificationMessages.task.newTaskForMentor(this.name, project.title),
        relatedId: this._id
      });
    }
  } else if (this.isModified('status')) {
    if (this.status === 'Submitted') {
      this.submittedAt = new Date();
      await Notification.insert({
        recipient: this.assignedTo,
        recipientModel: 'Student',
        type: 'task',
        content: notificationMessages.task.submitted(this.name),
        relatedId: this._id
      });

      const project = await mongoose.model('Project').findById(this.project);
      if (project) {
        await Notification.insert({
          recipient: project.mentor,
          recipientModel: 'CompanyAccount',
          recipientRole: 'mentor',
          type: 'task',
          content: notificationMessages.task.statusUpdated(this.name, 'Submitted'),
          relatedId: this._id
        });
      }
    } else if (this.status === 'Completed') {
      this.completedAt = new Date();
      await Notification.insert({
        recipient: this.assignedTo,
        recipientModel: 'Student',
        type: 'task',
        content: notificationMessages.task.statusUpdated(this.name, 'Completed'),
        relatedId: this._id
      });
    }
  }
  
  next();
});

taskSchema.plugin(softDeletePlugin);
const Task = mongoose.model('Task', taskSchema);
export default Task;
