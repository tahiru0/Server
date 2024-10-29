import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import sanitizeHtml from 'sanitize-html';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '10', 10);

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Tên người dùng không được bỏ trống'],
    unique: [true, 'Tên người dùng đã tồn tại'],
    trim: true,
    minlength: [3, 'Tên người dùng phải dài ít nhất 3 ký tự'],
    maxlength: [30, 'Tên người dùng không thể vượt quá 30 ký tự'],
    validate: {
      validator: function(value) {
        return /^[a-zA-Z0-9_]+$/.test(value);
      },
      message: 'Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới'
    }
  },
  password: {
    type: String,
    required: [true, 'Mật khẩu không được bỏ trống '],
    minlength: [6, 'Mật khẩu phải dài ít nhất 6 ký tự']
  },
  role: {
    type: String,
    enum: {
      values: ['admin', 'super-admin'],
      message: '{VALUE} không phải là vai trò hợp lệ'
    },
    default: 'admin'
  },
  refreshToken: {
    type: String,
    default: null
  },
  lastLogin: {
    type: Date
  },
  lastNotifiedDevice: {
    type: Date,
    default: null
  }
});

// Hàm sanitize chung
const sanitizeString = (str) => {
  return validator.trim(validator.escape(str));
};

// Sanitize HTML
const sanitizeHtmlContent = (html) => {
  return sanitizeHtml(html, {
    allowedTags: [], // Không cho phép bất kỳ thẻ HTML nào
    allowedAttributes: {}, // Không cho phép bất kỳ thuộc tính nào
  });
};

// Áp dụng sanitize cho schema
adminSchema.pre('validate', function(next) {
  if (this.username) {
    this.username = sanitizeString(this.username);
  }
  // Không sanitize password vì nó sẽ được mã hóa
  if (this.role) {
    this.role = sanitizeString(this.role);
  }
  next();
});

// Method để mã hóa mật khẩu
adminSchema.statics.hashPassword = async function(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

// Method để kiểm tra mật khẩu
adminSchema.methods.checkPassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Cập nhật phương thức login
adminSchema.statics.login = async function(username, password) {
  if (!username) {
    const error = new Error('Tên người dùng không được bỏ trống');
    error.status = 400;
    throw error;
  }
  if (!password) {
    const error = new Error('Mật khẩu không được bỏ trống');
    error.status = 400;
    throw error;
  }

  username = sanitizeString(username);

  const admin = await this.findOne({ username: username }).exec();
  if (!admin) {
    const error = new Error('Tên người dùng hoặc mật khẩu không đúng');
    error.status = 400;
    throw error;
  }

  const isMatch = await admin.checkPassword(password);
  if (!isMatch) {
    const error = new Error('Tên người dùng hoặc mật khẩu không đúng');
    error.status = 400;
    throw error;
  }

  return admin;
};

// Middleware để mã hóa mật khẩu trước khi lưu vào database
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    this.password = await this.constructor.hashPassword(this.password);
    next();
  } catch (error) {
    next(error);
  }
});

// Custom validation để kiểm tra tính hợp lệ của tên đăng nhập
adminSchema.path('username').validate(async function(username) {
  const existingUser = await this.constructor.findOne({ username });
  return !existingUser || existingUser.id === this.id;
}, 'Tên người dùng đã tồn tại');

// Thêm middleware để xử lý cập nhật
adminSchema.pre('findOneAndUpdate', function(next) {
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

// Thêm phương thức static để tìm admin
adminSchema.statics.findAdminById = async function(decoded) {
  const admin = await this.findById(decoded.id);
  return admin;
};

// Kiểm tra xem model đã tồn tại chưa trước khi tạo
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

// Method để tạo token xác thực
adminSchema.methods.generateAuthToken = async function() {
  const admin = this;
  const token = jwt.sign({ _id: admin._id.toString(), role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
  return token;
};

export default Admin;

/**
 * @swagger
 * components:
 *   schemas:
 *     Admin:
 *       type: object
 *       required:
 *         - username
 *         - password
 *       properties:
 *         username:
 *           type: string
 *           description: Tên đăng nhập của admin, phải là duy nhất
 *         password:
 *           type: string
 *           description: Mật khẩu của admin (đã được mã hóa)
 *         role:
 *           type: string
 *           description: Vai trò của admin, mặc định là 'admin'
 *         refreshToken:
 *           type: string
 *           description: Token làm mới để cấp lại access token
 */
