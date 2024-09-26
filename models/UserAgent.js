import mongoose from 'mongoose';

const userAgentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'userModel'
  },
  userModel: {
    type: String,
    required: true,
    enum: ['Admin', 'CompanyAccount', 'SchoolAccount', 'Student']
  },
  userAgentString: {
    type: String,
    required: true
  },
  browser: String,
  browserVersion: String,
  os: String,
  osVersion: String,
  device: String,
  lastUsed: {
    type: Date,
    default: Date.now
  }
});

userAgentSchema.index({ user: 1, userAgentString: 1 }, { unique: true });

const UserAgent = mongoose.model('UserAgent', userAgentSchema);

export default UserAgent;