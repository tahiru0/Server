import mongoose from 'mongoose';

const configSchema = new mongoose.Schema({
  email: {
    service: {
      type: String,
      enum: ['gmail', 'outlook', 'custom'],
      required: [function() { return this.email && this.email.user; }, 'Dịch vụ email là bắt buộc khi cấu hình email']
    },
    user: {
      type: String,
      required: [function() { return this.email && this.email.service; }, 'Tên người dùng email là bắt buộc khi cấu hình email']
    },
    pass: {
      type: String,
      required: [function() { return this.email && this.email.user; }, 'Mật khẩu email là bắt buộc khi cấu hình email']
    },
    host: {
      type: String,
      required: [function() { return this.email && this.email.service === 'custom'; }, 'Host là bắt buộc khi sử dụng dịch vụ email tùy chỉnh']
    },
    port: {
      type: Number,
      required: [function() { return this.email && this.email.service === 'custom'; }, 'Port là bắt buộc khi sử dụng dịch vụ email tùy chỉnh']
    },
    senderName: {
      type: String,
      required: [function() { return this.email && this.email.user; }, 'Tên người gửi là bắt buộc khi cấu hình email']
    }
  },
  backup: {
    isAutoBackup: {
      type: Boolean,
      default: false
    },
    schedule: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: 'weekly'
      },
      dayOfWeek: {
        type: Number,
        min: 0,
        max: 6,
        default: 0
      },
      time: {
        type: String,
        default: '00:00'
      }
    },
    password: {
      type: String,
      required: [function() { return this.backup && this.backup.isAutoBackup; }, 'Mật khẩu sao lưu là bắt buộc khi bật tự động sao lưu']
    },
    retentionPeriod: {
      type: Number,
      default: 30
    }
  },
  maintenance: {
    isActive: { 
      type: Boolean, 
      default: false 
    },
    message: { 
      type: String, 
      default: 'Hệ thống đang bảo trì. Vui lòng thử lại sau.' 
    }
  },
  lastRestore: {
    backupFileName: String,
    password: String,
    timestamp: Date
  }
}, { timestamps: true });

const Config = mongoose.model('Config', configSchema);

export default Config;
