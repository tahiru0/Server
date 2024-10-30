import mongoose from 'mongoose';
import Notification from './Notification.js';
import notificationMessages from '../utils/notificationMessages.js';
import softDeletePlugin from '../utils/softDelete.js';
import fs from 'fs';
import path from 'path';

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
  materialFiles: [{
    url: String,
    originalname: String,
    mimetype: String,
    size: Number,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'materialFiles.uploaderModel'
    },
    uploaderModel: {
      type: String,
      enum: ['Student', 'CompanyAccount']
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
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
  shareSettings: {
    isPublic: {
      type: Boolean,
      default: false
    },
    accessType: {
      type: String,
      enum: ['view', 'edit'], // Khi public thì có thể view hoặc edit cho tất cả
      default: null
    },
    sharedWith: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'shareSettings.sharedWith.userModel'
      },
      userModel: {
        type: String,
        enum: ['Student', 'CompanyAccount']
      },
      accessType: {
        type: String,
        enum: ['view', 'edit'],
        default: 'view'
      },
      sharedAt: {
        type: Date,
        default: Date.now
      }
    }]
  }
}, { timestamps: true });

// Virtual field để lấy đường dẫn file
taskSchema.virtual('materialFiles.filePath').get(function() {
  const uploaderModel = this.uploaderModel.toLowerCase(); // student hoặc companyaccount
  return `http://localhost:5000/uploads/${uploaderModel}/${this.uploadedBy}/task/${this._id}/${this.url}`;
});

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

// Thêm các phương thức sau phần schema

taskSchema.methods.addFile = async function(file, uploaderId, uploaderModel, permission) {
  if (!permission.canAddFiles) {
    throw new Error('Không có quyền thêm file');
  }
  try {
    const fileUrl = file.filename;
    this.materialFiles.push({
      url: fileUrl,
      uploadedBy: uploaderId,
      uploaderModel: uploaderModel,
      uploadedAt: new Date()
    });
    await this.save();
    return {
      message: 'Tải file lên thành công',
      file: {
        url: fileUrl,
        uploadedBy: uploaderId,
        uploaderModel: uploaderModel
      }
    };
  } catch (error) {
    throw new Error('Lỗi khi thêm file ');
  }
};

taskSchema.methods.removeFile = async function(fileUrl, userId, userModel, permission) {
  if (!permission.canRemoveFiles && 
      !(permission.canRemoveOwnFiles && this.isFileOwner(fileUrl, userId))) {
    throw new Error('Không có quyền xóa file này');
  }
  try {
    const fileIndex = this.materialFiles.findIndex(
      file => 
        file.url === fileUrl && 
        file.uploadedBy.toString() === userId.toString() &&
        file.uploaderModel === userModel
    );

    if (fileIndex === -1) {
      throw new Error('Không tìm thấy file hoặc bạn không có quyền xóa file này');
    }

    // Xóa file từ storage
    const filePath = `/uploads/${userModel.toLowerCase()}/${userId}/task/${this._id}/${fileUrl}`;
    try {
      fs.unlinkSync(path.join(process.cwd(), 'public', filePath));
    } catch (err) {
      console.error('Lỗi khi xóa file từ storage');
    }

    // Xóa thông tin file từ database
    this.materialFiles.splice(fileIndex, 1);
    await this.save();

    return {
      message: 'Đã xóa file thành công'
    };
  } catch (error) {
    throw new Error('Lỗi khi xóa file ');
  }
};

taskSchema.methods.getFiles = async function() {
  try {
    const files = this.materialFiles.map(file => ({
      url: `http://localhost:5000/uploads/${file.uploaderModel.toLowerCase()}/${file.uploadedBy}/task/${this._id}/${file.url}`,
      uploadedBy: file.uploadedBy,
      uploaderModel: file.uploaderModel,
      uploadedAt: file.uploadedAt
    }));

    return {
      taskId: this._id,
      taskName: this.name,
      files: files
    };
  } catch (error) {
    throw new Error('Lỗi khi lấy danh sách file ' );
  }
};

taskSchema.methods.getTaskWithFiles = async function() {
  try {
    const task = await this.populate([
      {
        path: 'project',
        select: 'title company',
        populate: {
          path: 'company',
          select: 'accounts logo' // Thêm logo của company
        }
      },
      {
        path: 'assignedTo',
        select: 'name email avatar'
      },
      {
        path: 'materialFiles.uploadedBy',
        refPath: 'materialFiles.uploaderModel'
      }
    ]);

    const formattedTask = {
      ...task.toObject(),
      assignedTo: {
        _id: task.assignedTo._id,
        name: task.assignedTo.name,
        email: task.assignedTo.email,
        avatar: task.assignedTo.avatar && !task.assignedTo.avatar.startsWith('http') 
          ? `http://localhost:5000${task.assignedTo.avatar}`
          : task.assignedTo.avatar
      },
      project: {
        _id: task.project._id,
        title: task.project.title,
        company: {
          name: task.project.company.name,
          logo: task.project.company.logo && !task.project.company.logo.startsWith('http')
            ? `http://localhost:5000${task.project.company.logo}`
            : task.project.company.logo
        }
      },
      materialFiles: task.materialFiles.map(file => {
        let uploaderInfo;
        if (file.uploaderModel === 'Student') {
          uploaderInfo = {
            _id: file.uploadedBy._id,
            name: file.uploadedBy.name,
            email: file.uploadedBy.email,
            avatar: file.uploadedBy.avatar && !file.uploadedBy.avatar.startsWith('http')
              ? `http://localhost:5000${file.uploadedBy.avatar}`
              : file.uploadedBy.avatar
          };
        } else {
          // Nếu là CompanyAccount, lấy thông tin từ company.accounts
          const account = task.project.company.accounts.id(file.uploadedBy);
          uploaderInfo = {
            _id: account._id,
            name: account.name,
            email: account.email,
            avatar: account.avatar && !account.avatar.startsWith('http')
              ? `http://localhost:5000${account.avatar}`
              : account.avatar
          };
        }

        return {
          url: `http://localhost:5000/uploads/${file.uploaderModel.toLowerCase()}/${file.uploadedBy._id}/task/${task._id}/${file.url}`,
          uploadedBy: uploaderInfo,
          uploaderModel: file.uploaderModel,
          uploadedAt: file.uploadedAt
        };
      })
    };

    return formattedTask;
  } catch (error) {
    throw new Error('Lỗi khi lấy thông tin task và files: ' + error.message);
  }
};

// Thêm vào sau các phương thức hiện có
taskSchema.methods.updateShareSettings = async function(settings) {
  // Khi chuyển sang private, accessType luôn là null
  if (!settings.isPublic) {
    settings.accessType = null;
  }
  
  // Khi chuyển sang public mà không có accessType, mặc định là view
  if (settings.isPublic && !settings.accessType) {
    settings.accessType = 'view';
  }
  
  this.shareSettings.isPublic = settings.isPublic;
  this.shareSettings.accessType = settings.accessType;
  await this.save();
  return this.shareSettings;
};

taskSchema.methods.shareWithUser = async function(userId, userModel, accessType) {
  const existingShare = this.shareSettings.sharedWith.find(
    share => share.userId.toString() === userId.toString()
  );

  if (existingShare) {
    existingShare.accessType = accessType;
    existingShare.sharedAt = new Date();
  } else {
    this.shareSettings.sharedWith.push({
      userId,
      userModel,
      accessType,
      sharedAt: new Date()
    });
  }

  await this.save();
  return this.shareSettings;
};

taskSchema.methods.removeShare = async function(userId) {
  this.shareSettings.sharedWith = this.shareSettings.sharedWith.filter(
    share => share.userId.toString() !== userId.toString()
  );
  await this.save();
  return this.shareSettings;
};

// Thêm phương thức kiểm tra CompanyAccount
taskSchema.methods.isCompanyAccount = async function(userId) {
  try {
    const project = await mongoose.model('Project').findById(this.project)
      .populate({
        path: 'company',
        select: 'accounts'
      });

    if (!project || !project.company) {
      return false;
    }

    // Kiểm tra xem userId có thuộc company của project không
    const account = project.company.accounts.id(userId);
    return account ? true : false;

  } catch (error) {
    console.error('Lỗi khi kiểm tra CompanyAccount:', error);
    return false;
  }
};

// Cập nhật lại phương thức canAccess
taskSchema.methods.canAccess = async function(userId, userModel) {
  // Kiểm tra mentor - quyền cao nhất
  if (userModel === 'CompanyAccount') {
    const project = await mongoose.model('Project').findById(this.project);
    if (project && project.mentor.toString() === userId.toString()) {
      return 'admin';
    }
    
    const isValidCompanyAccount = await this.isCompanyAccount(userId);
    if (!isValidCompanyAccount) {
      return null;
    }
  }
  
  // Kiểm tra sinh viên được giao task
  if (userModel === 'Student' && this.assignedTo.toString() === userId.toString()) {
    return 'edit';
  }

  // Kiểm tra cài đặt công khai
  if (this.shareSettings.isPublic) {
    return this.shareSettings.accessType;
  }

  // Private - chỉ người được share mới xem được
  const share = this.shareSettings.sharedWith.find(
    s => s.userId.toString() === userId.toString() && 
        s.userModel === userModel
  );
  return share ? share.accessType : null;
};

// Thêm phương thức isMentor vào taskSchema
taskSchema.methods.isMentor = async function(userId) {
  try {
    const project = await mongoose.model('Project').findById(this.project)
      .populate({
        path: 'company',
        select: 'accounts'
      });

    if (!project || !project.company) {
      return false;
    }

    // Kiểm tra xem userId có phải là mentor của dự án không
    return project.mentor.toString() === userId.toString();
  } catch (error) {
    console.error('Lỗi khi kiểm tra quyền mentor:', error);
    return false;
  }
};

taskSchema.methods.checkPermission = async function(userId, userModel, action, role) {
  const permissions = [];

  // Nếu là mentor
  if (userModel === 'CompanyAccount' && role === 'mentor') {
    const isMentor = await this.isMentor(userId);
    if (isMentor) {
      return [
        'view',
        'viewFiles',
        'viewComments',
        'viewStatus',
        'editAll',
        'editStatus',
        'addFiles',
        'removeFiles',
        'addComments',
        'editComments',
        'editFeedback',
        'manageSharing',
        'deleteTask'
      ];
    }
  }

  // Nếu là sinh viên được giao task
  if (userModel === 'Student' && this.assignedTo.toString() === userId.toString()) {
    const studentPermissions = [
      'view',
      'viewFiles',
      'viewComments',
      'viewStatus',
      'addFiles',
      'removeOwnFiles',
      'addComments',
      'editOwnComments'
    ];

    if (['Assigned', 'Overdue'].includes(this.status)) {
      studentPermissions.push('editStatus');
    }
    
    if (this.canSubmit()) {
      studentPermissions.push('submitTask');
    }

    return studentPermissions;
  }

  // Kiểm tra quyền từ share settings
  const sharedPermission = this.shareSettings.sharedWith.find(
    share => share.userId.toString() === userId.toString() && 
            share.userModel === userModel
  );

  if (sharedPermission) {
    const sharedPermissions = [
      'view',
      'viewFiles',
      'viewComments',
      'viewStatus'
    ];

    if (sharedPermission.accessType === 'edit') {
      sharedPermissions.push(
        'addFiles',
        'removeOwnFiles',
        'addComments',
        'editOwnComments'
      );
    }

    return sharedPermissions;
  }

  // Nếu là thành viên công ty
  if (userModel === 'CompanyAccount') {
    const isCompanyMember = await this.isCompanyAccount(userId);
    if (isCompanyMember) {
      return [
        'view',
        'viewFiles',
        'viewComments',
        'viewStatus',
        'viewAll'
      ];
    }
  }

  // Nếu task là public
  if (this.shareSettings.isPublic) {
    const publicPermissions = [
      'view',
      'viewFiles',
      'viewComments',
      'viewStatus'
    ];

    if (this.shareSettings.accessType === 'edit') {
      publicPermissions.push(
        'addFiles',
        'removeOwnFiles',
        'addComments',
        'editOwnComments'
      );
    }

    return publicPermissions;
  }

  // Nếu không có quyền gì thì trả về mảng rỗng
  return [];
};

taskSchema.methods.canShareWith = async function(targetUserId, targetUserModel) {
  try {
    const project = await mongoose.model('Project').findById(this.project);
    
    if (!project) {
      throw new Error('Không tìm thấy dự án');
    }

    // Kiểm tra share cho CompanyAccount
    if (targetUserModel === 'CompanyAccount') {
      const isValidCompanyAccount = await this.isCompanyAccount(targetUserId);
      if (!isValidCompanyAccount) {
        throw new Error('Chỉ có thể share cho tài khoản trong cùng công ty');
      }
    }

    // Kiểm tra share cho Student
    if (targetUserModel === 'Student') {
      const isStudentInProject = project.selectedApplicants.some(
        app => app.studentId.toString() === targetUserId.toString()
      );
      if (!isStudentInProject) {
        throw new Error('Chỉ có thể share cho sinh viên trong cùng project');
      }
    }

    return true;
  } catch (error) {
    throw error;
  }
};

const Task = mongoose.model('Task', taskSchema);
export default Task;
