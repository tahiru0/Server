import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import validator from 'validator';
import sanitizeHtml from 'sanitize-html';
import crypto from 'crypto';
import Project from './Project.js';
import { encodeUrl } from '../utils/urlEncoder.js'; // Import encodeUrl

// Thêm các hàm sanitize
const sanitizeString = (str) => {
    return validator.escape(str.trim());
};

const sanitizeHtmlContent = (content) => {
    return sanitizeHtml(content, {
        allowedTags: [], // Không cho phép bất kỳ thẻ HTML nào
        allowedAttributes: {}, // Không cho phép bất kỳ thuộc tính HTML nào
        textFilter: (text) => {
            // Giữ nguyên văn bản mà không chỉnh sửa
            return text;
        },
        disallowedTagsMode: 'discard' // Loại bỏ các thẻ HTML nhưng giữ lại nội dung bên trong
    });
};

const { Schema } = mongoose;

const CompanyAccountSchema = new Schema({
    name: { 
        type: String, 
        required: [true, 'Tên không được bỏ trống'],
        trim: true,
        minlength: [2, 'Tên phải có ít nhất 2 ký tự'],
        maxlength: [100, 'Tên không được vượt quá 100 ký tự'],
        set: (value) => sanitizeHtmlContent(value),
    },
    email: {
        type: String,
        required: [true, 'Vui lòng nhập email.'],
        unique: [true, 'Email đã được sử dụng.'],
        lowercase: true,
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Vui lòng nhập email hợp lệ.']
    },
    address: {
        type: String,
        trim: true,
        minlength: [5, 'Địa chỉ phải có ít nhất 5 ký tự'],
        maxlength: [500, 'Địa chỉ không được vượt quá 500 ký tự'],
        set: (value) => sanitizeHtmlContent(value),
    },
    passwordHash: { 
        type: String,
    },
    role: {
        type: String,
        enum: {
            values: ['admin', 'sub-admin', 'mentor'],
            message: '{VALUE} không phải là vai trò hợp lệ'
        },
        default: 'admin'
    },
    isDeleted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    activationToken: { type: String },
    tokenExpiration: { type: Date },
    projects: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
    refreshToken: { type: String },
    pendingEmail: {
        type: String,
        validate: {
            validator: function(v) {
                return v === null || validator.isEmail(v);
            },
            message: 'Email đang chờ xác nhận không hợp lệ.'
        }
    },
    emailChangeToken: String,
    emailChangeTokenExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    avatar: {
        type: String,
        default: function() {
            return encodeUrl(this.name.charAt(0).toUpperCase()); // Sử dụng encodeUrl để tạo avatar mặc định
        }
    },
}, { timestamps: true });

CompanyAccountSchema.pre('save', async function(next) {
    if (this.isModified('name')) {
        const { encodeUrl } = await import('../utils/urlEncoder.js');
        let initial = this.name.charAt(0);

        // Kiểm tra nếu tên chứa dấu tiếng Việt
        const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
        if (vietnameseRegex.test(this.name)) {
            const parts = this.name.split(' ');
            initial = parts[parts.length - 1].charAt(0);
        }

        const encodedUrl = encodeUrl(initial);
        if (!this.avatar || this.avatar.startsWith('/default/')) {
            this.avatar = encodedUrl;
        }
    }

    next();
});

// Thêm trường ảo 'password'
CompanyAccountSchema.virtual('password')
    .set(function(password) {
        this._password = password;
        this.passwordHash = undefined; // Đánh dấu passwordHash cần được cập nhật
    })
    .get(function() {
        return this._password;
    });

// Thêm validate cho trường ảo password
CompanyAccountSchema.path('passwordHash').validate(function() {
    if (this.isNew && !this._password) {
        this.invalidate('password', 'Mật khẩu không được bỏ trống');
    }
}, null);

// Middleware để mã hóa mật khẩu
CompanyAccountSchema.pre('save', async function(next) {
    if (this._password) {
        try {
            const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
            if (isNaN(saltRounds) || saltRounds < 10) {
                throw new Error('Cấu hình BCRYPT_SALT_ROUNDS không hợp lệ');
            }
            
            this.passwordHash = await bcrypt.hash(this._password, saltRounds);
            delete this._password; // Xóa mật khẩu tạm thời sau khi mã hóa
        } catch (err) {
            console.error('Lỗi khi mã hóa mật khẩu:', err.message);
            return next(new Error('Đã xảy ra lỗi khi xử lý mật khẩu'));
        }
    }
    next();
});

// Phương thức so sánh mật khẩu
CompanyAccountSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.passwordHash);
};

CompanyAccountSchema.methods.softDelete = function () {
    this.isDeleted = true;
    return this.save();
};

CompanyAccountSchema.methods.restore = function () {
    this.isDeleted = false;
    return this.save();
};

// Middleware to update mentorName in related projects
CompanyAccountSchema.pre('save', async function (next) {
    if (this.isModified('name') && this.role === 'mentor') {
        await Project.updateMany(
            { mentorName: this._previousName },
            { $set: { mentorName: this.name } }
        ).exec();
    }
    next();
});

CompanyAccountSchema.pre('validate', function (next) {
    this._previousName = this.name;
    next();
});

CompanyAccountSchema.methods.createEmailChangeToken = function() {
    this.emailChangeToken = crypto.randomBytes(32).toString('hex');
    this.emailChangeTokenExpires = Date.now() + 3600000; // 1 giờ
    return this.emailChangeToken;
};

CompanyAccountSchema.methods.createPasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex');
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    this.resetPasswordExpires = Date.now() + 3600000; // Token hết hạn sau 1 giờ
    return resetToken;
};

CompanyAccountSchema.methods.resetPassword = async function(newPassword) {
    this.password = newPassword;
    this.resetPasswordToken = undefined;
    this.resetPasswordExpires = undefined;
    await this.save();
};

// Đảm bảo rằng passwordHash không được trả về trong JSON
CompanyAccountSchema.set('toJSON', {
    transform: function(doc, ret, options) {
        delete ret.passwordHash;
        return ret;
    }
});

// Thêm getter cho trường avatar
CompanyAccountSchema.path('avatar').get(function (value) {
    if (!value) return null;
    return value.startsWith('http') ? value : `http://localhost:5000${value}`;
});

// Đảm bảo rằng các getter được bao gồm khi chuyển đổi sang JSON
CompanyAccountSchema.set('toJSON', { getters: true });
CompanyAccountSchema.set('toObject', { getters: true });

CompanyAccountSchema.pre('save', async function(next) {
    if (this.isModified('isActive') && !this.isActive) {
        const Project = mongoose.model('Project');
        const activeProjects = await Project.countDocuments({ mentor: this._id, status: 'Open' });
        if (activeProjects > 0) {
            const error = new Error('Không thể deactive tài khoản đang phụ trách dự án.');
            error.status = 400; // Hoặc bất kỳ mã trạng thái nào bạn muốn
            return next(error);
        }
    }
    next();
});

const CompanySchema = new Schema({
    name: { 
        type: String, 
        required: [true, 'Tên công ty không được bỏ trống'],
        trim: true,
        minlength: [2, 'Tên công ty phải có ít nhất 2 ký tự'],
        maxlength: [200, 'Tên công ty không được vượt quá 200 ký tự'],
        set: (value) => sanitizeString(value),
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v);
            },
            message: props => `${props.value} không phải là email hợp lệ!`
        }
    },
    address: { 
        type: String, 
        required: [true, 'Địa chỉ công ty không được bỏ trống'],
        trim: true,
        minlength: [5, 'Địa chỉ công ty phải có ít nhất 5 ký tự'],
        maxlength: [500, 'Địa chỉ công ty không được vượt quá 500 ký tự'],
        set: (value) => sanitizeHtmlContent(value),
    },
    accounts: [CompanyAccountSchema],
    isDeleted: { type: Boolean, default: false },
    logo: { type: String },
    isActive: { type: Boolean, default: false },
    activationToken: { type: String },
    tokenExpiration: { type: Date },
}, { timestamps: true });

CompanySchema.path('logo').get(function (value) {
    if (!value) return null;
    return value.startsWith('http') ? value : `http://localhost:5000/${value.replace(/^\/+/, '')}`;
});

// Thêm middleware để xử lý cập nhật
CompanySchema.pre('findOneAndUpdate', function(next) {
    const update = this.getUpdate();
    if (update.$set) {
        Object.keys(update.$set).forEach(key => {
            if (update.$set[key] === null || update.$set[key] === '') {
                delete update.$set[key];
            } else {
                if (key === 'name' || key === 'address') {
                    update.$set[key] = sanitizeHtmlContent(update.$set[key]);
                }
            }
        });
    }
    next();
});


CompanySchema.methods.softDelete = function () {
    this.isDeleted = true;
    return this.save();
};

CompanySchema.methods.restore = function () {
    this.isDeleted = false;
    return this.save();
};

// Thêm phương thức static này vào schema
CompanySchema.statics.findCompanyAccountById = async function(decoded) {
  const company = await this.findOne({ _id: decoded.companyId, 'accounts._id': decoded._id });
  if (!company) {
    console.log('Company not found for account ID:', decoded._id);
    return null;
  }
  const account = company.accounts.id(decoded._id);
  return account ? {
    ...account.toObject(),
    company: company._id,
    companyId: company._id,
    role: account.role  // Thêm role vào đối tượng trả về
  } : null;
};

CompanySchema.statics.getMentorDetails = async function(companyId, mentorId) {
    const company = await this.findById(companyId);
    if (!company) {
      throw new Error('Không tìm thấy công ty.');
    }
  
    const mentor = company.accounts.id(mentorId);
    if (!mentor || mentor.role !== 'mentor') {
      throw new Error('Không tìm thấy mentor.');
    }
  
    // Lấy số lượng dự án đang hoạt động của mentor
    const Project = mongoose.model('Project');
    const activeProjectsCount = await Project.countDocuments({ mentor: mentorId, status: 'Open' });
  
    return {
      _id: mentor._id,
      name: mentor.name,
      email: mentor.email,
      address: mentor.address,
      avatar: mentor.avatar,
      isActive: mentor.isActive,
      activeProjectsCount
    };
  };

// Thêm phương thức để kiểm tra mentorId
CompanySchema.methods.isMentorInCompany = function(mentorId) {
    return this.accounts.some(account => account._id.toString() === mentorId && account.role === 'mentor');
};

// Thêm phương thức này vào CompanySchema
CompanySchema.methods.canDeleteAccount = async function(accountId) {
    const account = this.accounts.id(accountId);
    
    if (!account) {
        throw new Error('Tài khoản không tồn tại.');
    }
    
    if (account.role === 'admin') {
        const adminCount = this.accounts.filter(acc => acc.role === 'admin' && !acc.isDeleted).length;
        if (adminCount <= 1) {
            throw new Error('Không thể xóa tài khoản admin cuối cùng.');
        }
    }
    
    if (account.role === 'mentor') {
        const Project = mongoose.model('Project');
        const activeProjects = await Project.countDocuments({ mentor: accountId, status: 'Open' });
        if (activeProjects > 0) {
            throw new Error('Không thể xóa mentor đang đảm nhận dự án đang hoạt động.');
        }
    }
    
    return true;
};

// Thêm phương thức static để kiểm tra email trùng lặp
CompanySchema.statics.isEmailTaken = async function(companyId, email) {
    const company = await this.findById(companyId);
    if (!company) {
        throw new Error('Không tìm thấy công ty.');
    }
    return company.accounts.some(account => account.email === email);
};

CompanySchema.statics.getFilteredAccounts = async function(companyId, query) {
    const company = await this.findById(companyId);
    if (!company) {
        throw new Error('Không tìm thấy công ty.');
    }

    let accounts = company.accounts.filter(account => !account.isDeleted).map(account => ({
        _id: account._id,
        name: account.name,
        email: account.email,
        role: account.role,
        isActive: account.isActive,
        address: account.address,
        avatar: account.avatar,
        createdAt: account.createdAt
    }));

    // Lọc
    if (query.role) {
        accounts = accounts.filter(account => account.role === query.role);
    }
    if (query.isActive !== undefined) {
        accounts = accounts.filter(account => account.isActive === (query.isActive === 'true'));
    }

    // Tìm kiếm
    if (query.search) {
        const search = query.search.toLowerCase();
        accounts = accounts.filter(account => 
            account.name.toLowerCase().includes(search) ||
            account.email.toLowerCase().includes(search) ||
            (account.address && account.address.toLowerCase().includes(search))
        );
    }

    // Sắp xếp
    if (query.sortBy) {
        const sortBy = query.sortBy;
        const order = query.order === 'desc' ? -1 : 1;
        accounts.sort((a, b) => {
            if (a[sortBy] < b[sortBy]) return -1 * order;
            if (a[sortBy] > b[sortBy]) return 1 * order;
            // Nếu giá trị sortBy bằng nhau, ưu tiên admin
            if (a[sortBy] === b[sortBy]) {
                if (a.role === 'admin' && b.role !== 'admin') return -1;
                if (a.role !== 'admin' && b.role === 'admin') return 1;
            }
            return 0;
        });
    } else {
        // Mặc định sắp xếp: admin lên đầu, sau đó theo thời gian tạo mới nhất
        accounts.sort((a, b) => {
            if (a.role === 'admin' && b.role !== 'admin') return -1;
            if (a.role !== 'admin' && b.role === 'admin') return 1;
            return b.createdAt - a.createdAt;
        });
    }

    return accounts;
};

// Thêm middleware để sanitize dữ liệu
CompanySchema.pre('validate', function(next) {
    if (this.name) {
        this.name = sanitizeString(this.name);
    }
    if (this.address) {
        this.address = sanitizeHtmlContent(this.address);
    }
    next();
});

// Đảm bảo rằng các thuộc tính ảo được bao gồm khi chuyển đổi sang JSON
CompanySchema.set('toJSON', { getters: true });
CompanySchema.set('toObject', { getters: true });
// Đảm bảo export model ở cuối file
const Company = mongoose.model('Company', CompanySchema);
export default Company;
/**
 * @swagger
 * components:
 *   schemas:
 *     CompanyAccount:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *       properties:
 *         name:
 *           type: string
 *           description: Tên của tài khoản công ty
 *         email:
 *           type: string
 *           description: Email của tài khoản công ty, phải là duy nhất và hợp lệ
 *         password:
 *           type: string
 *           description: Mật khẩu của tài khoản công ty (đã được mã hóa)
 *         role:
 *           type: string
 *           enum: [admin, sub-admin, mentor]
 *           description: Vai trò của tài khoản trong công ty
 *         isDeleted:
 *           type: boolean
 *           description: Trạng thái xóa mềm của tài khoản
 *         isActive:
 *           type: boolean
 *           description: Trạng thái hoạt động của tài khoản
 *         activationToken:
 *           type: string
 *           description: Token kích hoạt tài khoản
 *         tokenExpiration:
 *           type: string
 *           format: date-time
 *           description: Thời gian hết hạn của token kích hoạt
 *         projects:
 *           type: array
 *           items:
 *             type: string
 *           description: Danh sách ID của các dự án liên quan
 *         refreshToken:
 *           type: string
 *           description: Token làm mới để cấp lại access token
 *     Company:
 *       type: object
 *       required:
 *         - name
 *         - email
 *       properties:
 *         name:
 *           type: string
 *           description: Tên công ty
 *         email:
 *           type: string
 *           description: Email chính của công ty
 *         description:
 *           type: string
 *           description: Mô tả về công ty
 *         logo:
 *           type: string
 *           description: Đường dẫn đến logo của công ty
 *         website:
 *           type: string
 *           description: Website của công ty
 *         accounts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CompanyAccount'
 *           description: Danh sách các tài khoản của công ty
 *         isDeleted:
 *           type: boolean
 *           description: Trạng thái xóa mềm của công ty
 */
