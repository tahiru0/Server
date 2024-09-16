import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import notificationStream from '../utils/notificationStream.js';

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Người nhận thông báo không được để trống'],
    refPath: 'recipientModel'
  },
  recipientModel: {
    type: String,
    required: [true, 'Loại người nhận không được để trống'],
    enum: ['Student', 'CompanyAccount', 'Admin']
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
    enum: ['admin', 'mentor', 'staff', null],
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
  this.where({ isDeleted: false });
});

notificationSchema.pre('findOne', function() {
  this.where({ isDeleted: false });
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
    next();
});

// Thay đổi hook post save
notificationSchema.pre('save', function(next) {
  console.log('Pre-save hook triggered. isNew:', this.isNew);
  next();
});

notificationSchema.post('save', async function(doc, next) {
  console.log('Post-save hook triggered. isNew:', doc.isNew);
  if (doc.isNew) {
    console.log('Sending notification to stream:', doc);
    notificationStream.sendNotification(doc); // Sửa lại để không dùng await
  }
  next();
});

// Thêm validation cho recipientRole
notificationSchema.pre('validate', function(next) {
  if (this.recipientModel === 'CompanyAccount' && !this.recipientRole) {
    this.invalidate('recipientRole', 'recipientRole là bắt buộc cho CompanyAccount');
  }
  if (this.recipientModel !== 'CompanyAccount' && this.recipientRole) {
    this.recipientRole = null;
  }
  next();
});

// Thêm hàm insert
notificationSchema.statics.insert = async function(notificationData) {
  const notification = new this(notificationData);
  await notification.save();
  notificationStream.sendNotification(notification);
  return notification;
};

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
