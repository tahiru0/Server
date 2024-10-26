import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import LoginHistory from './LoginHistory.js';
import validator from 'validator';
import sanitizeHtml from 'sanitize-html';
import crypto from 'crypto';
import { sendEmail } from '../utils/emailService.js';
import { accountActivationTemplate } from '../utils/emailTemplates.js';
import softDeletePlugin from '../utils/softDelete.js';

const { Schema } = mongoose;

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

const FacultySchema = new Schema({
    name: { 
        type: String, 
        required: [true, 'Tên khoa không được bỏ trống'],
        trim: true,
        minlength: [2, 'Tên khoa phải có ít nhất 2 ký tự'],
        maxlength: [100, 'Tên khoa không được vượt quá 100 ký tự'],
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Mô tả khoa không được vượt quá 500 ký tự'],
    },
    majors: [{
        type: Schema.Types.ObjectId,
        ref: 'Major'
    }],
    facultyHead: {
        type: Schema.Types.ObjectId,
        ref: 'SchoolAccount',
        unique: true
    }
}, { timestamps: true });

const SchoolAccountSchema = new Schema({
    name: { 
        type: String, 
        required: [true, 'Tên không được bỏ trống'],
        trim: true,
        minlength: [2, 'Tên phải có ít nhất 2 ký tự'],
        maxlength: [100, 'Tên không được vượt quá 100 ký tự'],
        set: (value) => sanitizeHtml(value, sanitizeOptions),
        default: 'Tên tài khoản'
    },
    email: { 
        type: String, 
        required: [true, 'Email không được bỏ trống'], 
        unique: [true, 'Email đã tồn tại'],
        lowercase: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: props => `${props.value} không phải là email hợp lệ!`
        }
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
                    values: ['admin', 'sub-admin', 'department-head', 'faculty-head', 'faculty-staff'],
                    message: '{VALUE} không phải là vai trò hợp lệ'
                },
                required: [true, 'Vui lòng chọn vai trò.']
            },
            department: {
                type: String,
                required: function() {
                    return this.role && (this.role.name === 'department-head' || this.role.name === 'faculty-head' || this.role.name === 'faculty-staff');
                },
                trim: true,
                minlength: [2, 'Tên phòng/ban phải có ít nhất 2 ký tự'],
                maxlength: [100, 'Tên phòng/ban không được vượt quá 100 ký tự'],
            },
            faculty: {
                type: Schema.Types.ObjectId,
                ref: 'Faculty',
                required: function() {
                    return this.role && (this.role.name === 'faculty-head' || this.role.name === 'faculty-staff');
                }
            },
            majors: [{
                type: Schema.Types.ObjectId,
                ref: 'Major',
                required: function() {
                    return this.role && this.role.name === 'faculty-head';
                }
            }]
        },
        _id: false,
        required: true,
        validate: {
            validator: function(v) {
                return v && v.name;
            },
            message: 'Vai trò không hợp lệ'
        }
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
    lastNotifiedDevice: {
        type: Date,
        default: null
    }
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
    symbol: {
        type: String,
        trim: true,
        maxlength: [10, 'Ký hiệu trường không được vượt quá 10 ký tự'],
        set: (value) => sanitizeHtml(value, sanitizeOptions)
    },
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
            dateOfBirth: { type: String },
            name: { type: String }
        },
        defaultPassword: { type: String },
        passwordRule: {
            template: { type: String, default: '${ngaysinh}' }
        }
    },
    logo: { type: String },
    faculties: [FacultySchema],
    foundedYear: {
        type: Number,
        min: 1800,
        max: new Date().getFullYear()
    },
    socialMedia: {
        facebook: String,
        linkedin: String,
        twitter: String
    },
    accreditations: [String],
    campusLocations: [String]
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

// Middleware để kiểm tra và đồng bộ facultyHead khi role.faculty thay đổi
SchoolAccountSchema.pre('save', async function(next) {
    if (this.isModified('role.faculty') || this.isModified('role.name')) {
        const school = this.parent();
        const faculty = school.faculties.id(this.role.faculty);
        if (faculty) {
            if (this.role.name === 'faculty-head') {
                if (faculty.facultyHead && faculty.facultyHead.toString() !== this._id.toString()) {
                    throw new Error('Khoa này đã có trưởng khoa khác.');
                }
                faculty.facultyHead = this._id;
            } else if (this.role.name === 'faculty-staff' && faculty.facultyHead && faculty.facultyHead.toString() === this._id.toString()) {
                faculty.facultyHead = null;
            }
        }
    }
    next();
});

// Middleware để kiểm tra và đồng bộ role.faculty khi facultyHead thay đổi
FacultySchema.pre('save', async function(next) {
    if (this.isModified('facultyHead')) {
        const school = this.parent();
        if (this.facultyHead) {
            const account = school.accounts.id(this.facultyHead);
            if (!account) {
                throw new Error('Không tìm thấy tài khoản cho trưởng khoa mới.');
            }
            if (account.role.name !== 'faculty-head' || !account.role.faculty || account.role.faculty.toString() !== this._id.toString()) {
                account.role.name = 'faculty-head';
                account.role.faculty = this._id;
            }
        } else {
            // Nếu facultyHead bị xóa, cập nhật tài khoản cũ (nếu có)
            const oldHead = school.accounts.find(acc => 
                acc.role.name === 'faculty-head' && 
                acc.role.faculty && 
                this._id && 
                acc.role.faculty.toString() === this._id.toString()
            );
            if (oldHead) {
                oldHead.role.name = 'faculty-staff';
                // Giữ nguyên faculty, chỉ thay đổi vai trò
            }
        }
    }
    next();
});

// Phương thức để cập nhật facultyHead
SchoolSchema.methods.updateFacultyHead = async function(facultyId, newHeadId, session) {
  const faculty = this.faculties.id(facultyId);
  if (!faculty) {
    throw new Error('Không tìm thấy khoa.');
  }

  // Xử lý xóa trưởng khoa
  if (newHeadId === null) {
    if (faculty.facultyHead) {
      const oldHead = this.accounts.id(faculty.facultyHead);
      if (oldHead) {
        oldHead.role.name = 'faculty-staff';
        // Giữ nguyên faculty để duy trì liên kết với khoa
      }
    }
    faculty.facultyHead = null;
  } 
  // Xử lý thêm/thay đổi trưởng khoa
  else {
    const newHead = this.accounts.id(newHeadId);
    if (!newHead) {
      throw new Error('Không tìm thấy tài khoản mới cho trưởng khoa.');
    }
    if (newHead.role.faculty && newHead.role.faculty.toString() !== facultyId) {
      throw new Error('Tài khoản không thuộc khoa này.');
    }

    // Xử lý trưởng khoa cũ (nếu có)
    if (faculty.facultyHead && faculty.facultyHead.toString() !== newHeadId) {
      const oldHead = this.accounts.id(faculty.facultyHead);
      if (oldHead) {
        oldHead.role.name = 'faculty-staff';
        // Giữ nguyên faculty để duy trì liên kết với khoa
      }
    }

    // Cập nhật trưởng khoa mới
    newHead.role = { name: 'faculty-head', faculty: facultyId };
    faculty.facultyHead = newHeadId;
  }

  // Đảm bảo tính nhất quán
  this.accounts.forEach(account => {
    if (account._id.toString() !== (newHeadId || '').toString() && 
        account.role.name === 'faculty-head' && 
        account.role.faculty && 
        account.role.faculty.toString() === facultyId) {
      account.role.name = 'faculty-staff';
      // Giữ nguyên faculty để duy trì liên kết với khoa
    }
  });

  await this.save({ session });
  return faculty;
};

// Getter cho trường logo
SchoolSchema.path('logo').get(function (value) {
    if (!value) return null;
    return value.startsWith('http') ? value : `http://localhost:5000${value.startsWith('/') ? '' : '/'}${value}`;
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

SchoolSchema.statics.login = async function(schoolId, email, password) {
  const school = await this.findOne({ _id: schoolId, isDeleted: false }).exec();
  if (!school) {
    throw new Error('Trường không tồn tại hoặc đã bị vô hiệu hóa.');
  }

  const account = school.accounts.find(acc => acc.email === email && !acc.isDeleted);
  if (!account) {
    throw new Error('Thông tin đăng nhập không chính xác.');
  }

  const isMatch = await bcrypt.compare(password, account.passwordHash);
  if (!isMatch) {
    throw new Error('Thông tin đăng nhập không chính xác.');
  }

  if (!account.isActive) {
    throw new Error('Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email để kích hoạt tài khoản.');
  }

  return {
    _id: account._id,
    name: account.name,
    email: account.email,
    role: account.role.name,
    department: account.role.department,
    faculty: account.role.faculty,
    schoolId: school._id,
    schoolName: school.name
  };
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

        const activationLink = `http://localhost:3000/school/activate/${activationToken}`;
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

SchoolSchema.statics.findSchoolAccountById = async function(decoded, requiredRole) {
    const School = mongoose.model('School');
    const school = await School.findOne({ 'accounts._id': decoded._id });
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
        role: account.role.name,
        department: account.role.department
    };
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
    school.studentApiConfig = apiConfig;

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

SchoolSchema.plugin(softDeletePlugin);

SchoolSchema.methods.setFacultyHead = async function(facultyId, accountId) {
    const faculty = this.faculties.id(facultyId);
    if (!faculty) {
        throw new Error('Không tìm thấy khoa.');
    }

    const newHead = this.accounts.id(accountId);
    if (!newHead) {
        throw new Error('Không tìm thấy tài khoản mới cho trưởng khoa.');
    }

    // Kiểm tra xem tài khoản mới có thuộc khoa này không
    if (newHead.role.faculty && newHead.role.faculty.toString() !== facultyId.toString()) {
        throw new Error('Tài khoản không thuộc khoa này.');
    }

    // Xử lý trưởng khoa cũ (nếu có)
    if (faculty.facultyHead && faculty.facultyHead.toString() !== accountId) {
        const oldHead = this.accounts.id(faculty.facultyHead);
        if (oldHead) {
            oldHead.role = { name: 'faculty-staff', faculty: facultyId };
        }
    }

    // Cập nhật tài khoản mới thành trưởng khoa
    newHead.role = { name: 'faculty-head', faculty: facultyId };
    faculty.facultyHead = accountId;

    // Đảm bảo tính nhất quán
    this.accounts.forEach(account => {
        if (account._id.toString() !== accountId && 
            account.role.name === 'faculty-head' && 
            account.role.faculty && 
            account.role.faculty.toString() === facultyId) {
            account.role = { name: 'faculty-staff', faculty: facultyId };
        }
    });

    await this.save();
    return faculty;
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
















