import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
const { Schema } = mongoose;
import LoginHistory from './LoginHistory.js';
import validator from 'validator';
import sanitizeHtml from 'sanitize-html';

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

const StudentSchema = new Schema({
    name: { 
        type: String, 
        required: [true, 'Tên sinh viên không được bỏ trống'],
        maxlength: [100, 'Tên sinh viên không được vượt quá 100 ký tự'],
        set: (value) => sanitizeHtml(value, sanitizeOptions),
        get: (value) => sanitizeHtml.defaults.decoder(value)
    },
    email: { 
        type: String, 
        required: [true, 'Email không được bỏ trống'], 
        unique: [true, 'Email đã tồn tại'],
        maxlength: [255, 'Email không được vượt quá 255 ký tự'],
        set: (value) => validator.normalizeEmail(value)
    },
    password: { 
        type: String, 
        required: [true, 'Mật khẩu không được bỏ trống'],
        maxlength: [128, 'Mật khẩu không được vượt quá 128 ký tự']
    },
    studentId: { 
        type: String, 
        required: [true, 'Mã số sinh viên không được bỏ trống'],
        maxlength: [20, 'Mã số sinh viên không được vượt quá 20 ký tự'],
        set: (value) => sanitizeHtml(value, sanitizeOptions),
        get: (value) => sanitizeHtml.defaults.decoder(value)
    },
    school: { type: Schema.Types.ObjectId, ref: 'School', required: [true, 'Trường không được bỏ trống'] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'SchoolAccount' },
    isApproved: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    refreshToken: { 
        type: String, 
        default: null,
        maxlength: [1024, 'Refresh token không được vượt quá 1024 ký tự']
    },
    lastLogin: { type: Date },
    dateOfBirth: { type: Date },
    gender: { 
        type: String, 
        enum: ['Nam', 'Nữ', 'Khác'],
        maxlength: [10, 'Giới tính không được vượt quá 10 ký tự']
    },
    phoneNumber: {
        type: String,
        maxlength: [15, 'Số điện thoại không được vượt quá 15 ký tự'],
        validate: {
            validator: function(v) {
                return /^[0-9]{10,11}$/.test(v);
            },
            message: props => `${props.value} không phải là số điện thoại hợp lệ!`
        },
    },
    address: {
        type: String,
        trim: true,
        maxlength: [200, 'Địa chỉ không được vượt quá 200 ký tự'],
        set: (value) => sanitizeHtml(value, sanitizeOptions),
        get: (value) => sanitizeHtml.defaults.decoder(value)
    },
    notificationSettings: {
        taskNotifications: { type: Boolean, default: true },
        projectNotifications: { type: Boolean, default: true },
        emailNotifications: { type: Boolean, default: true }
    },
    skills: [{ type: Schema.Types.ObjectId, ref: 'Skill' }],
    major: { type: Schema.Types.ObjectId, ref: 'Major' },
    experience: [{
        title: {
            type: String,
            maxlength: [100, 'Tiêu đề kinh nghiệm không được vượt quá 100 ký tự'],
            set: (value) => sanitizeHtml(value, sanitizeOptions),
            get: (value) => sanitizeHtml.defaults.decoder(value)
        },
        company: {
            type: String,
            maxlength: [100, 'Tên công ty không được vượt quá 100 ký tự'],
            set: (value) => sanitizeHtml(value, sanitizeOptions),
            get: (value) => sanitizeHtml.defaults.decoder(value)
        },
        startDate: Date,
        endDate: Date,
        description: {
            type: String,
            maxlength: [500, 'Mô tả kinh nghiệm không được vượt quá 500 ký tự'],
            set: (value) => sanitizeHtml(value, sanitizeOptions),
            get: (value) => sanitizeHtml.defaults.decoder(value)
        }
    }],
    education: [{
        school: {
            type: String,
            maxlength: [100, 'Tên trường không được vượt quá 100 ký tự'],
            set: (value) => sanitizeHtml(value, sanitizeOptions),
            get: (value) => sanitizeHtml.defaults.decoder(value)
        },
        degree: {
            type: String,
            maxlength: [50, 'Bằng cấp không được vượt quá 50 ký tự'],
            set: (value) => sanitizeHtml(value, sanitizeOptions),
            get: (value) => sanitizeHtml.defaults.decoder(value)
        },
        fieldOfStudy: {
            type: String,
            maxlength: [100, 'Ngành học không được vượt quá 100 ký tự'],
            set: (value) => sanitizeHtml(value, sanitizeOptions),
            get: (value) => sanitizeHtml.defaults.decoder(value)
        },
        startDate: Date,
        endDate: Date
    }],
    projects: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
    cv: { 
        type: String,
        maxlength: [1024, 'URL CV không được vượt quá 1024 ký tự']
    }, // URL đến file CV
    currentProject: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
avatar: {
    type: String,
    default: function() {
        return `/default/${this.name.charAt(0).toUpperCase()}`;
    }
},
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

StudentSchema.pre('save', async function(next) {
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

// Unique index để đảm bảo mã số sinh viên là duy nhất trong mỗi trường
StudentSchema.index({ school: 1, studentId: 1 }, { 
    unique: [true, 'Mã số sinh viên đã tồn tại trong trường này.'], 
    partialFilterExpression: { isDeleted: { $ne: true } } 
});

// Soft delete method
StudentSchema.methods.softDelete = function() {
    this.isDeleted = true;
    return this.save();
};

// Restore method
StudentSchema.methods.restore = function() {
    this.isDeleted = false;
    return this.save();
};

// Login method
StudentSchema.statics.login = async function(schoolId, studentId, password, req) {
    const school = await mongoose.model('School').findById(schoolId).exec();
    if (!school) {
        throw new Error('Không tìm thấy trường học này.');
    }

    const student = await this.findOne({ school: school._id, studentId, isDeleted: false }).exec();
    if (!student) {
        throw new Error('Không tìm thấy sinh viên với mã số này.');
    }

    if (!student.isApproved) {
        throw new Error('Tài khoản sinh viên chưa được phê duyệt.');
    }

    const isMatch = await student.comparePassword(password);
    if (!isMatch) {
        throw new Error('Mật khẩu không chính xác.');
    }

    student.lastLogin = new Date();
    await student.save();

    const loginHistory = new LoginHistory({
        user: student._id,
        userModel: 'Student',
        loginTime: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']      
    });
    await loginHistory.save();

    return student;
};

// Thêm các ràng buộc và xác thực cho các trường

StudentSchema.path('name').validate(function(value) {
    return value.length >= 2 && value.length <= 100;
}, 'Tên sinh viên phải có độ dài từ 2 đến 100 ký tự');

StudentSchema.path('email').validate(function(value) {
    const emailRegex = /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/;
    return emailRegex.test(value);
}, 'Email không hợp lệ');

StudentSchema.path('password').validate(function(value) {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
    return passwordRegex.test(value);
}, 'Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số');

StudentSchema.path('studentId').validate(function(value) {
    return value.length >= 5 && value.length <= 20;
}, 'Mã số sinh viên phải có độ dài từ 5 đến 20 ký tự');

// Thêm phương thức để mã hóa mật khẩu trước khi lưu
StudentSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Thêm phương thức để so sánh mật khẩu
StudentSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Thêm phương thức để tìm kiếm sinh viên sử dụng prepared statement
StudentSchema.statics.findBySchoolAndStudentId = async function(schoolId, studentId) {
    return this.findOne({
        school: schoolId,
        studentId: studentId,
        isDeleted: false
    }).exec();
};

// Thêm middleware để sanitize dữ liệu
StudentSchema.pre('validate', function(next) {
    if (this.name) {
        this.name = sanitizeString(this.name);
    }
    if (this.email) {
        this.email = validator.normalizeEmail(this.email);
    }
    if (this.studentId) {
        this.studentId = sanitizeString(this.studentId);
    }
    if (this.address) {
        this.address = sanitizeHtmlContent(this.address);
    }
    // Không sanitize password vì nó sẽ được mã hóa
    next();
});

// Thêm hàm để lấy danh sách dự án phù hợp
StudentSchema.methods.getMatchingProjects = async function() {
  const projects = await mongoose.model('Project').find({
    $or: [
      { requiredSkills: { $in: this.skills } },
      { relatedMajors: this.major }
    ],
    isRecruiting: true,
    status: 'Open'
  }).populate('requiredSkills relatedMajors');

  return projects.filter(project => {
    const skillMatch = project.requiredSkills.some(skill => 
      this.skills.includes(skill._id.toString())
    );
    const majorMatch = project.relatedMajors.some(major => 
      major._id.toString() === this.major.toString()
    );
    return skillMatch || majorMatch;
  });
};

StudentSchema.statics.searchStudents = async function(query, filters) {
  let searchCriteria = {};
  
  if (query) {
    searchCriteria.$or = [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } },
      { studentId: { $regex: query, $options: 'i' } }
    ];
  }
  
  if (filters.skills) {
    searchCriteria.skills = { $in: filters.skills };
  }
  
  if (filters.major) {
    searchCriteria.major = filters.major;
  }
  
  return this.find(searchCriteria).populate('skills major');
};

// Thêm middleware để xử lý cập nhật
StudentSchema.pre('findOneAndUpdate', function(next) {
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
// Thêm getter cho trường avatar
StudentSchema.path('avatar').get(function (value) {
    if (!value) return null;
    return value.startsWith('http') ? value : `http://localhost:5000${value}`;
});

// Đảm bảo rằng các getter được bao gồm khi chuyển đổi sang JSON
StudentSchema.set('toJSON', { getters: true });
StudentSchema.set('toObject', { getters: true });

export default mongoose.models.Student || mongoose.model('Student', StudentSchema);

/**
 * @swagger
 * components:
 *   schemas:
 *     Student:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *         - studentId
 *         - school
 *       properties:
 *         name:
 *           type: string
 *           description: Tên của sinh viên
 *         email:
 *           type: string
 *           description: Email của sinh viên, phải là duy nhất
 *         password:
 *           type: string
 *           description: Mật khẩu của sinh viên (đã được mã hóa)
 *         studentId:
 *           type: string
 *           description: Mã số sinh viên, phải là duy nhất trong mỗi trường
 *         school:
 *           type: string
 *           description: ID của trường học mà sinh viên thuộc về
 *         createdBy:
 *           type: string
 *           description: ID của tài khoản trường học đã tạo sinh viên này
 *         isApproved:
 *           type: boolean
 *           description: Trạng thái phê duyệt của tài khoản sinh viên
 *         isDeleted:
 *           type: boolean
 *           description: Trạng thái xóa mềm của tài khoản sinh viên
 *         refreshToken:
 *           type: string
 *           description: Token làm mới để cấp lại access token
 */