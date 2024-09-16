import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import LoginHistory from './LoginHistory.js';
import validator from 'validator';
import sanitizeHtml from 'sanitize-html';

const { Schema } = mongoose;

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

const SchoolAccountSchema = new Schema({
    name: { 
        type: String, 
        required: [true, 'Tên không được bỏ trống'],
        trim: true,
        minlength: [2, 'Tên phải có ít nhất 2 ký tự'],
        maxlength: [100, 'Tên không được vượt quá 100 ký tự'],
        set: (value) => sanitizeHtml(value, sanitizeOptions)
    },
    email: { 
        type: String, 
        required: [true, 'Email không được bỏ trống'], 
        unique: [true, 'Email đã tồn tại'],
        lowercase: true,
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Vui lòng nhập email hợp lệ']
    },
    password: { 
        type: String, 
        required: [true, 'Mật khẩu không được bỏ trống'],
        minlength: [6, 'Mật khẩu phải có ít nhất 6 ký tự']
    },
    role: { 
        type: {
            name: {
                type: String,
                enum: {
                    values: ['admin', 'sub-admin', 'department-head', 'faculty-head'],
                    message: '{VALUE} không phải là vai trò hợp lệ'
                },
                required: [true, 'Vui lòng chọn vai trò.']
            },
            department: {
                type: String,
                required: function() { 
                    return this.role && this.role.name && 
                        (this.role.name === 'department-head' || this.role.name === 'faculty-head'); 
                },
                trim: true,
                minlength: [2, 'Tên phòng/ban phải có ít nhất 2 ký tự'],
                maxlength: [100, 'Tên phòng/ban không được vượt quá 100 ký tự'],
                set: (value) => sanitizeHtml(value, sanitizeOptions)
            }
        },
        required: true
    },
    isDeleted: { type: Boolean, default: false },
    refreshToken: { type: String, default: null },
    lastLogin: { type: Date },
avatar: {
    type: String,
    default: function() {
        return `/default/${this.name.charAt(0).toUpperCase()}`;
    }
},
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

SchoolAccountSchema.pre('save', async function(next) {
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

const SchoolSchema = new Schema({
    name: { 
        type: String, 
        required: [true, 'Tên trường không được bỏ trống'],
        trim: true,
        minlength: [2, 'Tên trường phải có ít nhất 2 ký tự'],
        maxlength: [200, 'Tên trường không được vượt quá 200 ký tự'],
        set: (value) => sanitizeHtml(value, sanitizeOptions)
    },
    address: { 
        type: String, 
        required: [true, 'Địa chỉ trường không được bỏ trống'],
        trim: true,
        minlength: [5, 'Địa chỉ trường phải có ít nhất 5 ký tự'],
        maxlength: [500, 'Địa chỉ trường không được vượt quá 500 ký tự'],
        set: (value) => sanitizeHtml(value, sanitizeOptions)
    },
    accounts: [SchoolAccountSchema],
    isDeleted: { type: Boolean, default: false },
    establishedDate: { type: Date },
    website: { 
        type: String, 
        match: [/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/, 'Vui lòng nhập URL hợp lệ']
    }
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

SchoolAccountSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
        const salt = await bcrypt.genSalt(saltRounds);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

SchoolAccountSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

SchoolAccountSchema.methods.softDelete = function() {
    return this.updateOne({ $set: { isDeleted: true } }).exec();
};

SchoolAccountSchema.methods.restore = function() {
    return this.updateOne({ $set: { isDeleted: false } }).exec();
};

SchoolAccountSchema.pre('validate', function(next) {
    if (this.name) {
        this.name = sanitizeHtml(this.name, sanitizeOptions);
    }
    if (this.email) {
        this.email = validator.normalizeEmail(this.email);
    }
    if (this.role.department) {
        this.role.department = sanitizeHtml(this.role.department, sanitizeOptions);
    }
    next();
});

SchoolAccountSchema.statics.login = async function(schoolId, email, password, req) {
    const school = await School.findOne({ _id: schoolId }).exec();
    if (!school) {
        throw new Error('Trường không tồn tại.');
    }

    const account = await this.findOne({ 
        school: schoolId, 
        email: email, 
        isDeleted: false 
    }).exec();

    if (!account) {
        throw new Error('Email hoặc mật khẩu không đúng.');
    }

    const isMatch = await account.comparePassword(password);
    if (!isMatch) {
        throw new Error('Email hoặc mật khẩu không đúng.');
    }

    const token = jwt.sign(
        { 
            _id: account._id, 
            model: 'SchoolAccount', 
            role: account.role.name,
            department: account.role.department 
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    const loginHistory = new LoginHistory({
        user: account._id,
        userModel: 'SchoolAccount',
        loginTime: new Date(),
        ipAddress: req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
    });
    await loginHistory.save();

    const { password: _, ...accountWithoutPassword } = account.toObject();
    return { account: accountWithoutPassword, token };
};


SchoolSchema.methods.softDelete = function() {
    return this.updateOne({ $set: { isDeleted: true } }).exec();
};

SchoolSchema.methods.restore = function() {
    return this.updateOne({ $set: { isDeleted: false } }).exec();
};

SchoolSchema.statics.findByIdAndNotDeleted = async function(id) {
    return this.findOne({ _id: id, isDeleted: false }).exec();
};

SchoolAccountSchema.statics.findByEmailAndSchool = async function(email, schoolId) {
    return this.findOne({ email: email, school: schoolId, isDeleted: false }).exec();
};

SchoolSchema.statics.findAllActive = async function() {
    return this.find({ isDeleted: false }).exec();
};

SchoolAccountSchema.statics.findAllActiveBySchool = async function(schoolId) {
    return this.find({ school: schoolId, isDeleted: false }).exec();
};

// Thêm middleware để xử lý cập nhật
SchoolSchema.pre('findOneAndUpdate', function(next) {
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

SchoolAccountSchema.path('avatar').get(function (value) {
    if (!value) return null;
    return value.startsWith('http') ? value : `http://localhost:5000${value}`;
});

// Đảm bảo rằng các getter được bao gồm khi chuyển đổi sang JSON
SchoolAccountSchema.set('toJSON', { getters: true });
SchoolAccountSchema.set('toObject', { getters: true });

const School = mongoose.model('School', SchoolSchema);
export default School;


/**
 * @swagger
 * components:
 *   schemas:
 *     SchoolAccount:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *         - role
 *       properties:
 *         name:
 *           type: string
 *           description: Tên tài khoản trường học
 *         email:
 *           type: string
 *           description: Email của tài khoản, phải là duy nhất
 *         password:
 *           type: string
 *           description: Mật khẩu của tài khoản (đã được mã hóa)
 *         role:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               enum: [admin, sub-admin, department-head, faculty-head]
 *               description: Vai trò của tài khoản trong trường học
 *             department:
 *               type: string
 *               description: Tên phòng/ban (chỉ áp dụng cho department-head và faculty-head)
 *         isDeleted:
 *           type: boolean
 *           description: Trạng thái xóa mềm của tài khoản
 *         refreshToken:
 *           type: string
 *           description: Token làm mới để cấp lại access token
 *     School:
 *       type: object
 *       required:
 *         - name
 *         - address
 *       properties:
 *         name:
 *           type: string
 *           description: Tên trường học
 *         address:
 *           type: string
 *           description: Địa chỉ của trường học
 *         accounts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SchoolAccount'
 *           description: Danh sách các tài khoản của trường
 *         isDeleted:
 *           type: boolean
 *           description: Trạng thái xóa mềm của trường học
 */
