import mongoose from 'mongoose';

const emailSchema = new mongoose.Schema({
  to: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  htmlContent: {
    type: String,
    required: true,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
  type: {
    type: String,
    enum: ['sent', 'received', 'replied'],
    required: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  }
});

// Thêm index cho trường isDeleted để tối ưu truy vấn
emailSchema.index({ isDeleted: 1 });

// Bỏ middleware pre 'find' và 'findOne'

// Phương thức xóa mềm
emailSchema.methods.softDelete = function() {
  this.isDeleted = true;
  return this.save();
};

// Phương thức khôi phục
emailSchema.methods.restore = function() {
  this.isDeleted = false;
  return this.save();
};

// Thêm phương thức static để lấy email có phân trang
emailSchema.statics.getEmailsPaginated = async function(query, options) {
  const { page = 1, limit = 10, sort = 'sentAt', order = 'desc' } = options;
  const skip = (page - 1) * limit;
  const sortOrder = order === 'asc' ? 1 : -1;

  const emails = await this.find(query)
    .sort({ [sort]: sortOrder })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments(query);

  return {
    emails,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    totalEmails: total
  };
};

const Email = mongoose.model('Email', emailSchema);

export default Email;