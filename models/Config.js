import mongoose from 'mongoose';

const configSchema = new mongoose.Schema({
  emailService: {
    type: String,
    enum: ['gmail', 'outlook', 'custom'],
    required: true
  },
  emailUser: {
    type: String,
    required: true
  },
  emailPass: {
    type: String,
    required: true
  },
  emailHost: {
    type: String,
    required: function() { return this.emailService === 'custom'; }
  },
  emailPort: {
    type: Number,
    required: function() { return this.emailService === 'custom'; }
  },
  senderName: {
    type: String,
    required: true
  },
  backupConfig: {
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
      required: true
    },
    retentionPeriod: {
      type: Number,
      default: 30
    }
  },
  maintenanceMode: {
    isActive: { type: Boolean, default: false },
    message: { type: String, default: 'Hệ thống đang bảo trì. Vui lòng thử lại sau.' }
  },
  lastRestore: {
    backupFileName: String,
    password: String,
    timestamp: Date
  }
}, { timestamps: true });

const Config = mongoose.model('Config', configSchema);

export default Config;
