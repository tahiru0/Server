import mongoose from 'mongoose';

const userDeviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'userModel'
  },
  userModel: {
    type: String,
    enum: ['Admin', 'Student', 'SchoolAccount', 'CompanyAccount'],
    required: true
  },
  deviceInfo: {
    os: String,
    browser: String,
    device: String
  },
  ipAddress: String,
  lastUsed: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const UserDevice = mongoose.model('UserDevice', userDeviceSchema);
export default UserDevice;
