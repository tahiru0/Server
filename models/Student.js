import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();
import softDeletePlugin from '../utils/softDelete.js';
import moment from 'moment';

const { Schema } = mongoose;
import LoginHistory from './LoginHistory.js';
import validator from 'validator';
import sanitizeHtml from 'sanitize-html';
import { encodeUrl } from '../utils/urlEncoder.js'; // Import encodeUrl

const sanitizeOptions = {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard'
};

// Hàm giải mã HTML entities đơn giản
const decodeHtmlEntities = (str) => {
    if (!str) return '';
    return str.replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
};

const StudentSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Tên sinh viên không được bỏ trống'],
        maxlength: [100, 'Tên sinh viên không được vượt quá 100 ký tự'],
        set: (value) => value ? sanitizeHtml(value, sanitizeOptions) : '',
        get: (value) => value ? decodeHtmlEntities(value) : ''
    },
    email: {
        type: String,
        required: [true, 'Email không được bỏ trống'],
        unique: [true, 'Email đã tồn tại'],
        maxlength: [255, 'Email không được vượt quá 255 ký tự'],
        validate: [validator.isEmail, 'Email không hợp lệ'],
    },
    passwordHash: {
        type: String,
    },
    studentId: {
        type: String,
        required: [true, 'Mã số sinh viên không được bỏ trống'],
        maxlength: [20, 'Mã số sinh viên không được vượt quá 20 ký tự'],
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
    dateOfBirth: {
        type: Date,
        validate: {
            validator: function(v) {
                return v === null || v === undefined || (v instanceof Date && !isNaN(v));
            },
            message: 'Ngày sinh không hp lệ'
        },
        set: function(v) {
            if (v === null || v === undefined || v === '') {
                return undefined;
            }
            if (typeof v === 'string') {
                const formats = ['DD/MM/YYYY', 'D/M/YYYY', 'YYYY-MM-DD', 'YYYY/MM/DD'];
                for (let format of formats) {
                    const parsedDate = moment(v, format, true);
                    if (parsedDate.isValid()) {
                        return parsedDate.toDate();
                    }
                }
            } else if (typeof v === 'number') {
                // Xử lý ngày dạng số (Excel serial date)
                const excelDate = moment('1899-12-30').add(v, 'days');
                if (excelDate.isValid()) {
                    return excelDate.toDate();
                }
            } else if (v instanceof Date) {
                return v;
            }
            throw new Error('Ngày sinh không hợp lệ');
        }
    },
    gender: {
        type: String,
        enum: ['Nam', 'Nữ', 'Khác'],
        maxlength: [10, 'Giới tính không được vượt quá 10 ký tự']
    },
    phoneNumber: {
        type: String,
        trim: true,
        maxlength: [15, 'Số điện thoại không được vượt quá 15 ký tự'],
        validate: {
            validator: function (v) {
                if (!v) return true; // Cho phép số điện thoại trống
                let phoneNumber = v.toString().replace(/\D/g, ''); // Loại bỏ tất cả các ký tự không phải số
                return /^0\d{9,14}$/.test(phoneNumber); // Kiểm tra số điện thoại bắt đầu bằng 0 và có từ 10 đến 15 chữ số
            },
            message: props => `${props.value} không phải là số điện thoại hợp lệ!`
        },
        set: function(v) {
            if (v) {
                let phoneNumber = v.toString().replace(/\D/g, '');
                if (phoneNumber.length === 9) {
                    return '0' + phoneNumber;
                }
                if (phoneNumber.length >= 10 && !phoneNumber.startsWith('0')) {
                    return '0' + phoneNumber;
                }
                return phoneNumber;
            }
            return v;
        }
    },
    address: {
        type: String,
        trim: true,
        maxlength: [200, 'Địa chỉ không được vượt quá 200 ký tự'],
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
        },
        company: {
            type: String,
            maxlength: [100, 'Tên công ty không được vượt quá 100 ký tự'],
        },
        startDate: Date,
        endDate: Date,
        description: {
            type: String,
            maxlength: [500, 'Mô tả kinh nghiệm không được vượt quá 500 ký tự'],
        }
    }],
    education: [{
        school: {
            type: String,
            maxlength: [100, 'Tên trường không được vượt quá 100 ký tự'],
        },
        degree: {
            type: String,
            maxlength: [50, 'Bằng cấp không được vượt quá 50 ký tự'],
        },
        fieldOfStudy: {
            type: String,
            maxlength: [100, 'Ngành học không được vượt quá 100 ký tự'],
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
        default: function () {
            return encodeUrl(this.name.charAt(0).toUpperCase()); // Sử dụng encodeUrl để tạo avatar mặc định
        }
    },
    appliedProjects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    }],
    isApproved: { type: Boolean, default: false },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'SchoolAccount' },
    approvedAt: { type: Date },
    lastNotifiedDevice: {
        type: Date,
        default: null
    },
    socialMedia: {
        facebook: String,
        linkedin: String,
        github: String
    },
    interests: [String],
    achievements: [String],
    faculty: {
        _id: { type: Schema.Types.ObjectId },
        name: { type: String }
    },
    currentProjects: [{
        type: Schema.Types.ObjectId,
        ref: 'Project'
    }],
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

StudentSchema.virtual('password')
    .get(function () {
        return this._password;
    })
    .set(function (value) {
        this._password = value;
        if (value) {
            this.passwordHash = this.constructor.hashPassword(value);
        }
    });

StudentSchema.statics.hashPassword = function (password) {
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
    return bcrypt.hashSync(password, saltRounds);
};

StudentSchema.methods.updateStudentInfo = async function (updateData) {
    const allowedFields = ['name', 'email', 'studentId', 'school', 'major', 'skills', 'experience', 'education', 'cv', 'avatar'];
    for (const key in updateData) {
        if (allowedFields.includes(key)) {
            this[key] = updateData[key];
        }
    }
    await this.updateFaculty();
    await this.save();
    return this;
};

StudentSchema.statics.getImportantStudentInfo = async function (filters = {}) {
    const searchCriteria = { ...filters, isDeleted: false };

    return this.find(searchCriteria)
        .select('_id name avatar school isApproved studentId major faculty')
        .populate('school', 'name')
        .populate('major', 'name');
};

StudentSchema.pre('save', async function (next) {
    if (this.isNew && !this._password) {
        try {
            const defaultPassword = await this.generateDefaultPassword();
            if (!defaultPassword) {
                return next(new Error('Mật khẩu không được để trống'));
            }
            this.password = defaultPassword;
        } catch (error) {
            return next(error);
        }
    }
    next();
});

StudentSchema.pre('save', async function (next) {
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
        if (this.isModified('major') || this.isModified('school')) {
            await this.updateFaculty();
        }
    }

    next();
});

// Unique index để đảm bảo mã số sinh viên là duy nhất trong mỗi trường
StudentSchema.index({ school: 1, studentId: 1, isDeleted: 1 }, { unique: true });
StudentSchema.statics.checkStudentIdExists = async function (schoolId, studentId, currentStudentId) {
    const query = {
        school: schoolId,
        studentId: studentId,
        isDeleted: false
    };
    if (currentStudentId) {
        query._id = { $ne: currentStudentId };
    }
    const existingStudent = await this.findOne(query);
    return !!existingStudent;
};
// Soft delete method
StudentSchema.methods.softDelete = function () {
    this.isDeleted = true;
    return this.save();
};

// Restore method
StudentSchema.methods.restore = function () {
    this.isDeleted = false;
    return this.save();
};

// Login method
StudentSchema.statics.login = async function (schoolId, studentId, password, req) {
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
StudentSchema.path('passwordHash').validate(function () {
    if (this._password) {
        if (this._password.length < 6) {
            this.invalidate('password', 'Mật khẩu phải có ít nhất 6 ký tự');
        }
    } else if (this.isNew) {
        this.invalidate('password', 'Mật khẩu không được bỏ trống');
    }
}, 'Mật khẩu không được bỏ trống');

StudentSchema.path('name').validate(function (value) {
    return value.length >= 2 && value.length <= 100;
}, 'Tên sinh viên phải có độ dài từ 2 đến 100 ký tự');

StudentSchema.path('email').validate(function (value) {
    const emailRegex = /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/;
    return emailRegex.test(value);
}, 'Email không hợp lệ');

StudentSchema.path('studentId').validate(async function (value) {
    if (this.isNew || (this.isModified('studentId') && this.studentId !== value)) {
        const exists = await this.constructor.checkStudentIdExists(this.school, value);
        if (exists) {
            throw new Error('Mã số sinh viên đã tồn tại trong trường này.');
        }
    }
    return value.length >= 5 && value.length <= 20;
}, 'Mã số sinh viên phải có độ dài từ 5 đến 20 ký tự');

// Thêm phương thức để tạo mật khẩu mặc định
StudentSchema.statics.generatePasswordFromRule = function (passwordRule, dateOfBirth) {
    if (!passwordRule || !passwordRule.template) {
        throw new Error('Quy tắc mật khẩu không hợp lệ.');
    }

    let password = passwordRule.template;

    if (dateOfBirth) {
        const date = new Date(dateOfBirth);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const formattedDateOfBirth = `${day}${month}${year}`;

        password = password.replace('${ngaysinh}', formattedDateOfBirth);
    }

    return password;
};

StudentSchema.methods.generateDefaultPassword = async function () {
    const school = await mongoose.model('School').findById(this.school);
    if (!school || !school.studentApiConfig || !school.studentApiConfig.passwordRule) {
        throw new Error('Quy tắc mật khẩu không hợp lệ hoặc chưa được cấu hình.');
    }

    return this.constructor.generatePasswordFromRule(school.studentApiConfig.passwordRule, this.dateOfBirth);
};

// Thêm phương thức để so sánh mật khẩu
StudentSchema.methods.comparePassword = function (candidatePassword) {
    if (!this.passwordHash) {
        throw new Error('Không có mật khẩu để so sánh.');
    }
    return bcrypt.compareSync(candidatePassword, this.passwordHash);
};
// StudentSchema.methods = {
//     encryptPassword: function(password) {
//         if (!password) return '';
//         try {
//             return bcrypt.hashSync(password, 10);
//         } catch (err) {
//             return '';
//         }
//     },
//     authenticate: function(plainText) {
//         return bcrypt.compareSync(plainText, this.hashedPassword);
//     }
// };

// Thêm phương thức để tìm kiếm sinh viên sử dụng prepared statement
StudentSchema.statics.findBySchoolAndStudentId = async function (schoolId, studentId) {
    return this.findOne({
        school: schoolId,
        studentId: studentId,
        isDeleted: false,
    }).exec();
};

StudentSchema.statics.findStudentById = async function (id) {
    const Student = mongoose.model('Student'); // Đảm bảo rằng bạn đang sử dụng mô hình Student
    return Student.findOne({ _id: id, isDeleted: false });
};

// Thêm hàm để lấy danh sách dự án phù hợp
StudentSchema.methods.getMatchingProjects = async function () {
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
StudentSchema.methods.getAppliedAndAcceptedProjects = async function () {
    const appliedProjects = await mongoose.model('Project').find({
        'applicants.applicantId': this._id
    }).select('_id title');

    const acceptedProjects = await mongoose.model('Project').find({
        'selectedApplicants.studentId': this._id
    }).select('_id title');

    return {
        appliedProjects,
        acceptedProjects
    };
};

StudentSchema.statics.searchStudents = async function (query, filters) {
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
StudentSchema.pre('findOneAndUpdate', function (next) {
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
    return value.startsWith('http') ? value : `http://localhost:5000${value.startsWith('/') ? '' : '/'}${value}`;
});

StudentSchema.path('cv').get(function (value) {
    if (!value) return null;
    return value.startsWith('http') ? value : `http://localhost:5000${value}`;
});
// Thêm phương thức mới để xóa ứng tuyển dự án
StudentSchema.methods.removeProjectApplication = async function (projectId) {
    try {
        // Xóa dự án khỏi danh sách appliedProjects của sinh viên
        await this.removeAppliedProject(projectId);

        // Xóa sinh viên khỏi danh sách applicants của dự án
        const Project = mongoose.model('Project');
        const project = await Project.findById(projectId);
        if (project) {
            project.applicants = project.applicants.filter(applicant => applicant.applicantId.toString() !== this._id.toString());
            project.currentApplicants = project.applicants.length;
            await project.save();
        }

        // Tạo thông báo cho sinh viên
        const Notification = mongoose.model('Notification');
        await Notification.create({
            recipient: this._id,
            recipientModel: 'Student',
            type: 'project',
            content: `Bạn đã hủy ứng tuyển dự án "${project.title}"`,
            relatedId: projectId
        });

        return true;
    } catch (error) {
        console.error('Lỗi khi xóa ứng tuyển dự án:', error);
        throw new Error('Không thể xóa ứng tuyển dự án');
    }
};
StudentSchema.methods.getCurrentProjectDetails = async function () {
    if (!this.currentProject) {
        return null;
    }

    const project = await mongoose.model('Project').findById(this.currentProject)
        .populate('company', 'name logo')
        .populate('relatedMajors', 'name')
        .populate('requiredSkills', 'name')
        .lean();

    if (!project) {
        return null;
    }

    return {
        _id: project._id,
        title: project.title,
        description: project.description,
        companyName: project.company.name,
        companyLogo: project.company.logo ? (project.company.logo.startsWith('http') ? project.company.logo : `http://localhost:5000${project.company.logo.startsWith('/') ? '' : '/'}${project.company.logo}`) : null,
        status: project.status,
        isRecruiting: project.isRecruiting,
        maxApplicants: project.maxApplicants,
        applicationStart: project.applicationStart,
        applicationEnd: project.applicationEnd,
        objectives: project.objectives,
        startDate: project.startDate,
        endDate: project.endDate,
        projectStatus: project.projectStatus,
        relatedMajors: project.relatedMajors.map(major => major.name),
        requiredSkills: project.requiredSkills.map(skill => skill.name),
        skillRequirements: project.skillRequirements,
        hasApplied: project.applicants.some(applicant => applicant.applicantId.toString() === this._id.toString()),
        isSelected: project.selectedApplicants.some(selected => selected.studentId.toString() === this._id.toString())
    };
};
StudentSchema.methods.getAssignedTasks = async function () {
    return await mongoose.model('Task').find({
        assignedTo: this._id,
        isStudentActive: true
    }).populate('project', 'title');
};

StudentSchema.methods.updateTaskStatus = async function (taskId, status) {
    const task = await mongoose.model('Task').findOne({
        _id: taskId,
        assignedTo: this._id,
        isStudentActive: true
    });
    if (!task) {
        throw new Error('Không tìm thấy task hoặc task không được giao cho sinh viên này hoặc sinh viên không còn trong dự án');
    }
    task.status = status;
    await task.save();
    return task;
};

StudentSchema.methods.addAppliedProject = async function (projectId) {
    if (this.isApproved) {
        if (!this.appliedProjects.includes(projectId)) {
            this.appliedProjects.push(projectId);
            await this.save();
        }
    }
};

StudentSchema.methods.removeAppliedProject = async function (projectId) {
    this.appliedProjects = this.appliedProjects.filter(id => id.toString() !== projectId.toString());
    await this.save();
};

StudentSchema.methods.setCurrentProject = async function (projectId) {
    if (this.isApproved) {
        this.currentProject = projectId;
        await this.save();
    }
};

StudentSchema.methods.removeCurrentProject = async function () {
    this.currentProject = null;
    await this.save();
};

StudentSchema.methods.checkIn = async function (projectId, date) {
    const Attendance = mongoose.model('Attendance');
    const attendance = new Attendance({
        student: this._id,
        project: projectId,
        date: date,
        status: 'present',
        checkedInBy: 'student'
    });
    await attendance.save();
    return attendance;
};

StudentSchema.methods.submitDailyReport = async function (projectId, date, report) {
    const Attendance = mongoose.model('Attendance');
    const attendance = await Attendance.findOne({
        student: this._id,
        project: projectId,
        date: date
    });
    if (!attendance) {
        throw new Error('Không tìm thấy bản ghi điểm danh cho ngày này');
    }
    attendance.dailyReport = report;
    await attendance.save();
    return attendance;
};

StudentSchema.methods.submitWeeklyReport = async function (projectId, weekStartDate, weekEndDate, summary) {
    const WeeklyReport = mongoose.model('WeeklyReport');
    const weeklyReport = new WeeklyReport({
        student: this._id,
        project: projectId,
        weekStartDate,
        weekEndDate,
        summary,
        status: 'submitted',
        submittedAt: new Date()
    });
    await weeklyReport.save();
    return weeklyReport;
};

// Middleware để đảm bảo chỉ sinh viên đã đưc phê duyệt mới có thể được thêm vào dự án
StudentSchema.pre('save', async function (next) {
    if (this.isModified('isApproved') && this.isApproved) {
        // Nếu sinh viên vừa được phê duyệt, cập nhật tất cả các dự án liên quan
        const Project = mongoose.model('Project');
        await Project.updateMany(
            { 'applicants.applicantId': this._id },
            { $set: { 'applicants.$.isApproved': true } }
        );
        await Project.updateMany(
            { 'selectedApplicants.studentId': this._id },
            { $set: { 'selectedApplicants.$.isApproved': true } }
        );
    }
    next();
});

// Đảm bảo rằng các getter được bao gồm khi chuyển đổi sang JSON
StudentSchema.set('toJSON', { getters: true });
StudentSchema.set('toObject', { getters: true });
StudentSchema.plugin(softDeletePlugin);


StudentSchema.statics.findByFaculty = async function(schoolId, facultyName) {
  const School = mongoose.model('School');
  const school = await School.findById(schoolId);
  
  if (!school) return [];
  
  const faculty = school.faculties.find(f => f.name === facultyName);
  
  if (!faculty) return [];
  
  const majorIds = faculty.majors.map(m => m._id);
  
  return this.find({
    school: schoolId,
    major: { $in: majorIds }
  }).populate('major');
};

StudentSchema.methods.updateFaculty = async function() {
    if (!this.school || !this.major) {
        this.faculty = undefined;
        return;
    }

    const School = mongoose.model('School');
    const school = await School.findById(this.school);

    if (!school) {
        this.faculty = undefined;
        return;
    }

    const faculty = school.faculties.find(f => 
        f.majors.some(m => m._id.toString() === this.major.toString())
    );

    if (faculty) {
        this.faculty = {
            _id: faculty._id,
            name: faculty.name
        };
    } else {
        this.faculty = undefined;
    }
};

StudentSchema.statics.getOneStudent = async function (id) {
    const student = await this.findById(id)
        .select('_id name avatar school isApproved studentId major faculty')
        .populate('school', 'name')
        .populate('major', 'name');

    if (student) {
        await student.updateFaculty();
    }

    return student;
};

StudentSchema.methods.updateCurrentProjects = async function() {
  const Project = mongoose.model('Project');
  const projects = await Project.find({
    'selectedApplicants.studentId': this._id
  });
  this.currentProjects = projects.map(project => project._id);
  await this.save();
};

StudentSchema.methods.removeFromProject = async function(projectId) {
  this.currentProjects = this.currentProjects.filter(id => id.toString() !== projectId.toString());
  await this.save();
};

export default mongoose.model('Student', StudentSchema);

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







