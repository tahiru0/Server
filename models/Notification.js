import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import notificationStream from '../utils/notificationStream.js';

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

const notificationSchema = new mongoose.Schema({
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: function() {
      return this.recipientModel === 'CompanyAccount' || this.recipientModel === 'SchoolAccount';
    },
    refPath: function() {
      return this.recipientModel === 'CompanyAccount' ? 'Company' : 'School';
    }
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Người nhận thông báo không được để trống'],
    refPath: 'recipientModel'
  },
  recipientModel: {
    type: String,
    required: [true, 'Loại người nhận không được để trống'],
    enum: ['Admin', 'CompanyAccount', 'Student', 'SchoolAccount']
  },
  type: {
    type: String,
    required: [true, 'Loại thông báo không được để trống'],
    enum: ['task', 'project', 'system', 'account']
  },
  content: {
    type: String,
    required: [true, 'Nội dung thông báo không được để trống'],
    maxlength: [500, 'Nội dung thông báo không được vượt quá 500 ký tự'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  isRead: {
    type: Boolean,
    default: false
  },
  notificationTime: {
    type: Date,
    default: Date.now,
  },
  readAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  recipientRole: {
    type: String,
    enum: ['admin', 'mentor', 'staff', 'schoolAdmin', 'schoolStaff', null],
    default: null
  },
  relatedData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { 
  timestamps: true, 
  toJSON: { getters: true }, 
  toObject: { getters: true } 
});

notificationSchema.index({ recipient: 1, createdAt: -1 });

// Thêm phương thức để đánh dấu thông báo đã đọc
notificationSchema.methods.markAsRead = function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Thêm phương thức xóa mềm
notificationSchema.methods.softDelete = function() {
  if (!this.isDeleted) {
    this.isDeleted = true;
    return this.save();
  }
  return Promise.resolve(this);
};

// Thêm phương thức khôi phục
notificationSchema.methods.restore = function() {
  if (this.isDeleted) {
    this.isDeleted = false;
    return this.save();
  }
  return Promise.resolve(this);
};

// Sửa đổi các truy vấn để chỉ lấy các thông báo chưa bị xóa mềm
notificationSchema.pre('find', function() {
  if (!this.getQuery().hasOwnProperty('isDeleted')) {
    this.where({ isDeleted: false });
  }
  console.log('Pre find hook:', this.getQuery());
});

notificationSchema.pre('findOne', function() {
  if (!this.getQuery().hasOwnProperty('isDeleted')) {
    this.where({ isDeleted: false });
  }
  console.log('Pre findOne hook:', this.getQuery());
});

// Thêm middleware để xử lý cập nhật
notificationSchema.pre('findOneAndUpdate', function(next) {
    const update = this.getUpdate();
    if (update.$set) {
        Object.keys(update.$set).forEach(key => {
            if (update.$set[key] === null || update.$set[key] === '') {
                delete update.$set[key];
            }
        });
    }
    console.log('Pre findOneAndUpdate hook:', update);
    next();
});

// Thay đổi hook post save
notificationSchema.pre('save', function(next) {
  next();
});

notificationSchema.post('save', function(doc, next) {
  if (doc.isNew) {
    console.log('Sending notification to stream:', doc);
    notificationStream.sendNotification(doc)
      .then(() => next())
      .catch(error => {
        console.error('Error sending notification to stream:', error);
        next(error);
      });
  } else {
    next();
  }
});

// Thêm validation cho recipientRole
notificationSchema.pre('validate', function(next) {
  if (this.recipientModel === 'CompanyAccount' && !this.recipientRole) {
    this.invalidate('recipientRole', 'recipientRole là bắt buộc cho CompanyAccount');
  }
  if (this.recipientModel === 'SchoolAccount' && !this.recipientRole) {
    this.invalidate('recipientRole', 'recipientRole là bắt buộc cho SchoolAccount');
  }
  if (this.recipientModel !== 'CompanyAccount' && this.recipientModel !== 'SchoolAccount' && this.recipientRole) {
    this.recipientRole = null;
  }
  next();
});

// Thêm hàm insert
notificationSchema.statics.insert = async function(notificationData) {
  try {
    let recipient;
    let parentId;
    let recipientRole;

    if (notificationData.recipientModel === 'CompanyAccount' || notificationData.recipientModel === 'SchoolAccount') {
      const ParentModel = mongoose.model(notificationData.recipientModel === 'CompanyAccount' ? 'Company' : 'School');
      const parent = await ParentModel.findOne({ 'accounts._id': notificationData.recipient });
      if (!parent) {
        console.error(`Không tìm thấy ${notificationData.recipientModel} với tài khoản ID ${notificationData.recipient}`);
        return null;
      }
      recipient = parent.accounts.id(notificationData.recipient);
      parentId = parent._id;
      recipientRole = recipient.role;
    } else {
      recipient = await mongoose.model(notificationData.recipientModel).findById(notificationData.recipient);
      parentId = null; // Đặt parentId là null cho các trường hợp khác
    }

    if (!recipient) {
      console.error(`Không tìm thấy người nhận với ID ${notificationData.recipient}`);
      return null;
    }

    const notification = new this({
      ...notificationData,
      recipient: notificationData.recipient,
      parentId: parentId,
      recipientRole: recipientRole // Thêm recipientRole vào thông báo
    });

    await notification.save();
    console.log('Notification saved:', notification);
    notificationStream.sendNotification(notification);
    return notification;
  } catch (error) {
    console.error('Lỗi khi tạo thông báo:', error);
    return null;
  }
};

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
