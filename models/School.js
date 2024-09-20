import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import LoginHistory from './LoginHistory.js';
import validator from 'validator';
import sanitizeHtml from 'sanitize-html';
import crypto from 'crypto';
import { sendEmail } from '../utils/emailService.js';
import { accountActivationTemplate } from '../utils/emailTemplates.js';

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
    passwordHash: {
        type: String,
        required: true
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
        _id: false,
        required: true
    },
    isDeleted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    refreshToken: { type: String, default: null },
    lastLogin: { type: Date },
    avatar: {
        type: String,
        default: function() {
            return `/default/${this.name.charAt(0).toUpperCase()}`;
        }
    },
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

SchoolAccountSchema.virtual('password')
    .get(function() {
        return this._password;
    })
    .set(function(value) {
        this._password = value;
        this.passwordHash = bcrypt.hashSync(value, 10);
    });

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
    isActive: { type: Boolean, default: false },
    establishedDate: { type: Date },
    website: { 
        type: String, 
        match: [/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/, 'Vui lòng nhập URL hợp lệ']
    },
    studentApiConfig: {
        uri: { type: String },
        fieldMappings: {
            studentId: { type: String },
            major: { type: String },
            email: { type: String },
            dateOfBirth: { type: String }
        },
        defaultPassword: { type: String },
        passwordRule: {
            template: { type: String, default: '${ngaysinh}' }
        }
    },
    logo: { type: String }
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

// Getter cho trường logo
SchoolSchema.path('logo').get(function (value) {
    if (!value) return null;
    return value.startsWith('http') ? value : `http://localhost:5000/${value.replace(/^\/+/, '')}`;
});

SchoolAccountSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.passwordHash);
};

SchoolAccountSchema.methods.softDelete = function() {
    return this.updateOne({ $set: { isDeleted: true } }).exec();
};

SchoolAccountSchema.methods.restore = function() {
    return this.updateOne({ $set: { isDeleted: false } }).exec();
};

SchoolAccountSchema.pre('validate', function(next) {
    if (this.isNew && !this._password) {
        this.invalidate('password', 'Mật khẩu không được bỏ trống');
    }
    if (this._password && this._password.length < 6) {
        this.invalidate('password', 'Mật khẩu phải có ít nhất 6 ký tự.');
    }
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
    }).select('+passwordHash').exec();

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

SchoolSchema.statics.register = async function(schoolData, accountData) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { name, address, website, establishedDate } = schoolData;
        const { accountName, email, password } = accountData;

        const activationToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiration = Date.now() + 3600000; // 1 hour

        const newSchool = new this({
            name,
            address,
            website,
            establishedDate,
            accounts: [{
                name: accountName,
                email,
                password, // Sử dụng trường ảo password
                role: { name: 'admin' },
                activationToken,
                tokenExpiration
            }]
        });

        await newSchool.save({ session });

        const activationLink = `http://localhost:5000/api/school/activate/${activationToken}`;
        await sendEmail(
            email,
            'Xác nhận tài khoản trường học của bạn',
            accountActivationTemplate({
                accountName,
                companyName: name,
                activationLink
            })
        );

        await session.commitTransaction();
        session.endSession();

        return newSchool;
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};

SchoolSchema.statics.findSchoolAccountById = async function(decoded) {
    const School = mongoose.model('School'); // Thêm dòng này
    const school = await School.findOne({ 'accounts._id': decoded._id });
    if (!school) {
        return null;
    }
    const account = school.accounts.id(decoded._id);
    console.log('findSchoolAccountById - account:', account);
    return account ? {
        ...account.toObject(),
        school: school._id,
        schoolId: school._id,
        role: account.role
    } : null;
};

SchoolSchema.statics.getFilteredAccounts = async function(schoolId, query) {
    const school = await this.findById(schoolId);
    if (!school) {
        throw new Error('Không tìm thấy trường.');
    }

    let accounts = school.accounts.filter(account => !account.isDeleted).map(account => ({
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
        accounts = accounts.filter(account => account.role.name === query.role);
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

    return accounts;
};

SchoolSchema.statics.configureGuestApi = async function(schoolId, apiConfig, passwordRule) {
    const school = await this.findById(schoolId);
    if (!school) {
        throw new Error('Không tìm thấy trường.');
    }

    // Cập nhật cấu hình API khách
    school.guestApiConfig = apiConfig;

    // Cập nhật quy tắc mật khẩu
    school.studentApiConfig.passwordRule = passwordRule;

    // Kiểm tra request để đảm bảo API hoạt động
    try {
        const response = await axios.get(apiConfig.uri);
        if (response.status !== 200) {
            throw new Error('API không hoạt động.');
        }
    } catch (error) {
        if (error.response) {
            // API truy cập được nhưng trả về mã lỗi
            throw new Error('API không hoạt động: ' + error.response.statusText);
        } else if (error.request) {
            // Không thể kết nối đến API
            throw new Error('Không thể kết nối đến API.');
        } else {
            // Lỗi khác
            throw new Error('Lỗi khi kiểm tra API: ' + error.message);
        }
    }
    SchoolSchema.statics.findSchoolAdminById = async function(decoded) {
        const school = await this.findOne({ 'accounts._id': decoded._id });
        if (!school) {
            return null;
        }
        const account = school.accounts.id(decoded._id);
        if (!account || account.role.name !== 'admin') {
            return null;
        }
        return {
            ...account.toObject(),
            school: school._id,
            schoolId: school._id,
            role: account.role
        };
    };
    
    SchoolSchema.statics.findSchoolAccountById = async function(decoded, requiredRole) {
        const school = await this.findOne({ 'accounts._id': decoded._id });
        if (!school) {
            return null;
        }
        const account = school.accounts.id(decoded._id);
        if (!account) {
            return null;
        }
    
        // Kiểm tra vai trò nếu requiredRole được cung cấp
        if (requiredRole && account.role.name !== requiredRole) {
            return null;
        }
    
        return {
            ...account.toObject(),
            school: school._id,
            schoolId: school._id,
            role: account.role
        };
    };

    await school.save();
    return school;
};

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
