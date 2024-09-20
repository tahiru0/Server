import mongoose from 'mongoose';
import Notification from './Notification.js';
import sanitizeHtml from 'sanitize-html';
import notificationMessages from '../utils/notificationMessages.js';

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Tiêu đề dự án không được để trống'],
    trim: true,
    minlength: [3, 'Tiêu đề dự án phải có ít nhất 3 ký tự'],
    maxlength: [200, 'Tiêu đề dự án không được vượt quá 200 ký tự'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
  },
  description: {
    type: String,
    required: [true, 'Mô tả dự án không được để trống'],
    trim: true,
    minlength: [10, 'Mô tả dự án phải có ít nhất 10 ký tự'],
    maxlength: [2000, 'Mô tả dự án không được vượt quá 2000 ký tự'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Công ty không được để trống']
  },
  applicants: [{
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    appliedDate: {
      type: Date,
      default: Date.now,
      required: true
    }
  }],
  selectedApplicants: [{
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    appliedDate: {
      type: Date,
      required: true
    },
    acceptedAt: {
      type: Date,
      default: Date.now,
      required: true
    }
  }],
  status: {
    type: String,
    enum: {
      values: ['Open', 'Closed'],
      message: '{VALUE} không phải là trạng thái hợp lệ'
    },
    default: 'Open'
  },
  isRecruiting: {
    type: Boolean,
    default: false
  },
  mentor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyAccount',
    required: [true, 'Mentor không được để trống']
  },
  maxApplicants: {
    type: Number,
    min: [1, 'Số lượng ứng viên tối đa phải lớn hơn 0'],
    max: [100, 'Số lượng ứng viên tối đa không được vượt quá 100'],
    validate: {
      validator: function (v) {
        return this.isRecruiting ? v > 0 : true;
      },
      message: 'Số lượng ứng viên tối đa không được để trống khi đang tuyển dụng'
    }
  },
  applicationStart: {
    type: Date,
    default: function () {
      return this.startDate;
    },
    validate: {
      validator: function (v) {
        return this.isRecruiting ? v != null : true;
      },
      message: 'Thời gian bắt đầu tuyển dụng không được để trống khi đang tuyển dụng'
    }
  },
  applicationEnd: {
    type: Date,
    validate: [
      {
        validator: function (v) {
          return this.isRecruiting ? v != null : true;
        },
        message: 'Thời gian kết thúc tuyển dụng không được để trống khi đang tuyển dụng'
      },
      {
        validator: function (v) {
          if (!this.applicationStart || !v) return true;
          const maxEndDate = new Date(this.applicationStart);
          maxEndDate.setMonth(maxEndDate.getMonth() + 2);
          return v <= maxEndDate;
        },
        message: 'Thời gian mở ứng tuyển không được vượt quá 2 tháng'
      },
      {
        validator: function (v) {
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Đặt thời gian về đầu ngày
          return v > today;
        },
        message: 'Thời gian kết thúc tuyển dụng phải sau ngày hôm nay'
      }
    ]
  },
  applicantHistory: [{
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    appliedDate: {
      type: Date,
      required: true
    },
    recruitmentClosedAt: {
      type: Date,
      required: true
    }
  }],
  objectives: {
    type: String,
    required: [true, 'Mục tiêu dự án không được để trống'],
    trim: true,
    minlength: [10, 'Mục tiêu dự án phải có ít nhất 10 ký tự'],
    maxlength: [1000, 'Mục tiêu dự án không được vượt quá 1000 ký tự'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
  },
  startDate: {
    type: Date,
  },
  endDate: {
    type: Date,
    validate: {
      validator: function (v) {
        return v > this.startDate;
      },
      message: 'Ngày kết thúc phải sau ngày bắt đầu'
    }
  },
  projectStatus: {
    type: String,
    enum: {
      values: ['Đang thực hiện', 'Hoàn thành'],
      message: '{VALUE} không phải là trạng thái hợp lệ'
    },
    default: 'Đang thực hiện'
  },
  currentApplicants: {
    type: Number,
    default: 0,
    min: [0, 'Số lượng ứng viên hiện tại không thể âm']
  },
  requiredSkills: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Skill'
  }],
  relatedMajors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Major'
  }],
  pinnedProject: {
    type: Boolean,
    default: false
  }
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

projectSchema.methods.pinProject = async function () {
  this.pinnedProject = true;
  await this.save();
};

// Middleware để kiểm tra trạng thái trước khi thực hiện các hành động
projectSchema.pre('save', function (next) {
  if (this.status === 'Closed' && this.isModified('status')) {
    return next();
  }
  if (this.status === 'Closed') {
    return next(new Error('Dự án đã bị tạm dừng, không thể thực hiện hành động này'));
  }
  next();
});

projectSchema.pre('updateOne', function (next) {
  const update = this.getUpdate();
  if (update.$set && update.$set.status === 'Closed') {
    return next();
  }
  this.model.findOne(this.getQuery(), (err, project) => {
    if (err) return next(err);
    if (project.status === 'Closed') {
      return next(new Error('Dự án đã bị tạm dừng, không thể thực hiện hành động này'));
    }
    next();
  });
});

projectSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.$set && update.$set.status === 'Closed') {
    return next();
  }
  this.model.findOne(this.getQuery(), (err, project) => {
    if (err) return next(err);
    if (project.status === 'Closed') {
      return next(new Error('Dự án đã bị tạm dừng, không thể thực hiện hành động này'));
    }
    next();
  });
});

// Cập nhật các phương thức để kiểm tra trạng thái
projectSchema.methods.checkAndRemoveApplicants = async function () {
  if (this.status === 'Closed') {
    throw new Error('Dự án đã bị tạm dừng, không thể thực hiện hành động này');
  }
  const sevenDaysAgo = new Date(new Date().setDate(new Date().getDate() - 7));
  const removedApplicants = this.applicants.filter(applicant => applicant.appliedDate <= sevenDaysAgo);

  // Tạo thông báo cho các ứng viên bị loại do hết hạn
  for (const applicant of removedApplicants) {
    await Notification.insert({
      recipient: applicant.applicantId,
      recipientModel: 'Student',
      type: 'project',
      content: notificationMessages.project.applicationExpired(this.title),
      relatedId: this._id
    });
  }

  this.applicants = this.applicants.filter(applicant => applicant.appliedDate > sevenDaysAgo);
  await this.save();
};

projectSchema.methods.addApplicant = async function (applicantId) {
  if (this.status === 'Closed') {
    throw new Error('Dự án đã bị tạm dừng, không thể thực hiện hành động này');
  }
  if (!this.isRecruiting) {
    throw new Error('Dự án không đang tuyển dụng');
  }
  if (this.applicants.length >= this.maxApplicants) {
    throw new Error('Đã đạt đến số lượng ứng viên tối đa');
  }
  const now = new Date();
  if (now < this.applicationStart || now > this.applicationEnd) {
    throw new Error('Không nằm trong thời gian tuyển dụng');
  }

  // Kiểm tra số lượng dự án mà sinh viên đã nộp đơn
  const totalApplications = await mongoose.model('Project').countDocuments({
    'applicants.applicantId': applicantId
  });
  if (totalApplications >= 10) {
    throw new Error('Sinh viên chỉ được nộp đơn vào tối đa 10 dự án');
  }

  this.applicants.push({ applicantId });

  // Tạo thông báo cho mentor
  await Notification.insert({
    recipient: this.mentor,
    recipientModel: 'CompanyAccount',
    type: 'project',
    content: `Có một ứng viên mới cho dự án "${this.title}"`,
    relatedId: this._id
  });
};

projectSchema.pre('save', async function (next) {
  const project = this;

  // Auto close recruiting if applicationEnd is passed
  if (project.isRecruiting && project.applicationEnd < new Date()) {
    project.isRecruiting = false;

    // Di chuyển applicants vào lịch sử và tạo thông báo
    const now = new Date();
    const newHistory = project.applicants.map(applicant => ({
      applicantId: applicant.applicantId,
      appliedDate: applicant.appliedDate,
      recruitmentClosedAt: now
    }));

    // Tạo thông báo cho các ứng viên không được chọn
    for (const applicant of project.applicants) {
      if (!project.selectedApplicants.some(selected => selected.studentId.toString() === applicant.applicantId.toString())) {
        await Notification.insert({
          recipient: applicant.applicantId,
          recipientModel: 'Student',
          type: 'project',
          content: notificationMessages.project.applicationRejectedAfterClose(project.title),
          relatedId: project._id
        });
      }
    }

    project.applicantHistory.push(...newHistory);
    project.applicants = []; // Xóa tất cả applicants sau khi đã lưu vào lịch sử
  }

  // Kiểm tra khi isRecruiting thay đổi thành false
  if (project.isModified('isRecruiting') && !project.isRecruiting) {
    const now = new Date();
    const newHistory = project.applicants.map(applicant => ({
      applicantId: applicant.applicantId,
      appliedDate: applicant.appliedDate,
      recruitmentClosedAt: now
    }));

    project.applicantHistory.push(...newHistory);
    project.applicants = []; // Xóa tất cả applicants sau khi đã lưu vào lịch sử
  }

  // Tạo thông báo khi có cập nhật dự án
  if (this.isModified()) {
    const students = await mongoose.model('Student').find({ _id: { $in: this.selectedApplicants.map(a => a.studentId) } });
    const notifications = students.map(student => ({
      recipient: student._id,
      recipientModel: 'Student',
      type: 'project',
      content: `Dự án "${this.name}" đã được cập nhật`,
      relatedId: this._id
    }));
    await Notification.insertMany(notifications);
  }

  next();
});

projectSchema.pre('save', async function (next) {
  if (this.isModified('isRecruiting')) {
    const notificationContent = this.isRecruiting
      ? notificationMessages.project.openRecruitment(this.title)
      : notificationMessages.project.closeRecruitment(this.title);

    await Notification.insert({
      recipient: this.mentor,
      recipientModel: 'CompanyAccount',
      recipientRole: 'mentor', // Thêm trường này
      type: 'project',
      content: notificationContent,
      relatedId: this._id
    });
  }
  next();
});

// Save applicant's appliedDate into selectedApplicants when they are accepted
projectSchema.methods.acceptApplicant = async function (applicantId) {
  await this.checkDuplicateSelectedApplicants(applicantId); // Kiểm tra trùng lặp

  const applicant = this.applicants.find(a => a.applicantId.toString() === applicantId.toString());
  if (!applicant) {
    throw new Error('Ứng viên không tồn tại trong danh sách ứng tuyển');
  }

  const student = await mongoose.model('Student').findById(applicantId);
  if (!student) {
    throw new Error('Không tìm thấy sinh viên');
  }

  if (student.currentProject) {
    throw new Error('Sinh viên đã được chấp nhận vào một dự án khác');
  }

  this.selectedApplicants.push({
    studentId: applicant.applicantId,
    appliedDate: applicant.appliedDate
  });
  this.applicants = this.applicants.filter(a => a.applicantId.toString() !== applicantId.toString());

  student.currentProject = this._id;
  await student.save();

  await this.save();

  // Xóa sinh viên khỏi danh sách ứng tuyển của các dự án khác
  await mongoose.model('Project').updateMany(
    { _id: { $ne: this._id } },
    { $pull: { applicants: { applicantId: applicantId } } }
  );

  // Tạo thông báo cho sinh viên
  await Notification.insert({
    recipient: applicantId,
    recipientModel: 'Student',
    type: 'project',
    content: notificationMessages.project.applicationAccepted(this.title),
    relatedId: this._id
  });
};

projectSchema.methods.checkDuplicateSelectedApplicants = async function(applicantId) {
  const existingProject = await mongoose.model('Project').findOne({
    'selectedApplicants.studentId': applicantId,
    _id: { $ne: this._id }
  });

  if (existingProject) {
    throw new Error('Sinh viên đã được chọn vào một dự án khác');
  }
};

projectSchema.methods.removeApplicant = async function (applicantId, reason = 'rejected') {
  const applicantIndex = this.applicants.findIndex(a => a.applicantId.toString() === applicantId.toString());
  if (applicantIndex === -1) {
    throw new Error('Ứng viên không tồn tại trong danh sách ứng tuyển');
  }

  this.applicants.splice(applicantIndex, 1);
  await this.save();

  // Tạo thông báo cho sinh viên
  let notificationContent;
  if (reason === 'expired') {
    notificationContent = notificationMessages.project.applicationExpired(this.title);
  } else {
    notificationContent = notificationMessages.project.applicationRejected(this.title);
  }

  await Notification.insert({
    recipient: applicantId,
    recipientModel: 'Student',
    type: 'project',
    content: notificationContent,
    relatedId: this._id
  });
};

// Thêm phương thức để kiểm tra xem dự án có thể nhận ứng viên không
projectSchema.methods.canAcceptApplicants = function () {
  const now = new Date();
  return this.isRecruiting &&
    this.currentApplicants < this.maxApplicants &&
    now >= this.applicationStart &&
    now <= this.applicationEnd;
};

// Thêm phương thức để tự động đóng tuyển dụng nếu đủ người hoặc hết thời gian
projectSchema.methods.checkRecruitmentStatus = function () {
  const now = new Date();
  if (this.isRecruiting && (this.currentApplicants >= this.maxApplicants || now > this.applicationEnd)) {
    this.isRecruiting = false;

    // Di chuyển applicants vào lịch sử
    const newHistory = this.applicants.map(applicant => ({
      applicantId: applicant.applicantId,
      appliedDate: applicant.appliedDate,
      recruitmentClosedAt: now
    }));

    this.applicantHistory.push(...newHistory);
    this.applicants = []; // Xóa tất cả applicants sau khi đã lưu vào lịch sử

    return true; // Trạng thái đã thay đổi
  }
  return false; // Trạng thái không thay đổi
};

projectSchema.statics.searchProjects = async function (query, filters) {
  let searchCriteria = { company: filters.company }; // Thêm company vào bộ lọc

  if (query) {
    searchCriteria.$or = [
      { title: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } }
    ];
  }

  if (filters.skills) {
    searchCriteria.requiredSkills = { $in: filters.skills };
  }

  if (filters.status) {
    searchCriteria.status = filters.status;
  }

  if (filters.startDate) {
    searchCriteria.startDate = { $gte: new Date(filters.startDate) };
  }

  if (filters.endDate) {
    searchCriteria.endDate = { $lte: new Date(filters.endDate) };
  }

  return this.find(searchCriteria)
    .select('_id title mentor status isRecruiting applicants selectedApplicants maxApplicants pinnedProject')
    .populate({
      path: 'company',
      select: 'accounts',
      populate: {
        path: 'accounts',
        select: 'name _id'
      }
    })
    .sort({ pinnedProject: -1 }) // Ưu tiên sắp xếp pinnedProject
    .then(projects => projects.map(project => {
      const mentor = project.company?.accounts?.find(account => account._id.toString() === project.mentor.toString());
      return {
        _id: project._id,
        title: project.title,
        mentor: mentor ? {
          _id: mentor._id,
          name: mentor.name,
          avatar: mentor.avatar
        } : { name: 'Unknown' },
        status: project.status,
        isRecruiting: project.isRecruiting,
        approvedMemberCount: project.selectedApplicants.length,
        applicantCount: project.applicants.length,
        maxApplicants: project.maxApplicants,
        pinnedProject: project.pinnedProject
      };
    }));
};

// Thêm middleware để xử lý cập nhật
projectSchema.pre('findOneAndUpdate', function (next) {
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
projectSchema.methods.changeMentor = async function (newMentorId, oldMentorId, companyId) {
  const Company = mongoose.model('Company');
  const company = await Company.findById(companyId);

  if (!company) {
    throw new Error('Không tìm thấy công ty.');
  }

  const newMentor = company.accounts.id(newMentorId);
  const oldMentor = company.accounts.id(oldMentorId);

  if (!newMentor || newMentor.role !== 'mentor') {
    throw new Error('Mentor mới không hợp lệ.');
  }

  if (!oldMentor || oldMentor.role !== 'mentor') {
    throw new Error('Mentor cũ không hợp lệ.');
  }

  this.mentor = newMentorId;
  await this.save();

  // Tạo thông báo cho mentor mới
  await Notification.insert({
    recipient: newMentorId,
    recipientModel: 'CompanyAccount',
    recipientRole: 'mentor',
    type: 'project',
    content: notificationMessages.project.mentorAssigned(this.title),
    relatedId: this._id
  });

  // Tạo thông báo cho mentor cũ
  await Notification.insert({
    recipient: oldMentorId,
    recipientModel: 'CompanyAccount',
    recipientRole: 'mentor',
    type: 'project',
    content: notificationMessages.project.mentorReplaced(this.title),
    relatedId: this._id
  });
};

projectSchema.methods.removeStudentFromProject = async function (studentId, reason = 'removed') {
  const selectedApplicantIndex = this.selectedApplicants.findIndex(a => a.studentId.toString() === studentId.toString());
  if (selectedApplicantIndex === -1) {
    throw new Error('Sinh viên không tồn tại trong danh sách được chọn');
  }

  // Xóa sinh viên khỏi danh sách selectedApplicants
  this.selectedApplicants.splice(selectedApplicantIndex, 1);
  await this.save();

  // Cập nhật currentProject của sinh viên
  const student = await mongoose.model('Student').findById(studentId);
  if (student) {
    student.currentProject = null;
    await student.save();
  }

  // Tạo thông báo cho sinh viên
  let notificationContent;
  if (reason === 'removed') {
    notificationContent = notificationMessages.project.studentRemoved(this.title);
  } else {
    notificationContent = notificationMessages.project.studentRemovedForOtherReason(this.title, reason);
  }

  await Notification.insert({
    recipient: studentId,
    recipientModel: 'Student',
    type: 'project',
    content: notificationContent,
    relatedId: this._id
  });
};

const Project = mongoose.model('Project', projectSchema);

export default Project;

/**
 * @openapi
 * components:
 *   schemas:
 *     Project:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           description: Tiêu đề của dự án.
 *           example: Dự án Học Bổng
 *         description:
 *           type: string
 *           description: Mô tả chi tiết của dự án.
 *           example: Dự án nhằm hỗ trợ sinh viên trong việc tìm kiếm học bổng.
 *         applicants:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               applicantId:
 *                 type: string
 *                 format: uuid
 *                 description: ID của sinh viên ứng tuyển.
 *                 example: 60d5f4f4c72d4b6d1c4f4f5c
 *               appliedDate:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày ứng tuyển.
 *                 example: 2024-08-01T10:00:00Z
 *         selectedApplicants:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               studentId:
 *                 type: string
 *                 format: uuid
 *                 description: ID của sinh viên được chọn.
 *                 example: 60d5f4f4c72d4b6d1c4f4f5c
 *               appliedDate:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày ứng tuyển của sinh viên được chọn.
 *                 example: 2024-08-01T10:00:00Z
 *               acceptedAt:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày chấp nhận.
 *                 example: 2024-08-02T10:00:00Z
 *         status:
 *           type: string
 *           enum: [Open, Closed]
 *           description: Trạng thái của dự án.
 *           example: Open
 *         isRecruiting:
 *           type: boolean
 *           description: Cho biết dự án có đang tuyển dụng không.
 *           example: true
 *         maxApplicants:
 *           type: integer
 *           description: Số lượng ứng viên tối đa được phép.
 *           example: 10
 *         applicationStart:
 *           type: string
 *           format: date-time
 *           description: Thời gian bắt đầu nhận đơn ứng tuyển.
 *           example: 2024-08-01T00:00:00Z
 *         applicationEnd:
 *           type: string
 *           format: date-time
 *           description: Thời gian kết thúc nhận đơn ứng tuyển.
 *           example: 2024-08-15T23:59:59Z
 *         applicantHistory:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               applicantId:
 *                 type: string
 *                 format: uuid
 *                 description: ID của sinh viên đã ứng tuyển.
 *                 example: 60d5f4f4c72d4b6d1c4f4f5c
 *               appliedDate:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày ứng tuyển.
 *                 example: 2024-08-01T10:00:00Z
 *               recruitmentClosedAt:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày dự án đóng tuyển.
 *                 example: 2024-08-02T00:00:00Z
 *         objectives:
 *           type: string
 *           description: Mục tiêu của dự án.
 *           example: Hỗ trợ sinh viên tìm kiếm học bổng.
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: Ngày bắt đầu dự án.
 *           example: 2024-08-01T00:00:00Z
 *         endDate:
 *           type: string
 *           format: date-time
 *           description: Ngày kết thúc dự án.
 *           example: 2024-08-31T23:59:59Z
 *         projectStatus:
 *           type: string
 *           enum: [Đang thực hiện, Hoàn thành]
 *           description: Trạng thái của dự án.
 *           example: Đang thực hiện
 *         requiredSkills:
 *           type: array
 *           items:
 *             type: string
 *             format: uuid
 *             description: ID của kỹ năng yêu cầu.
 *             example: 60d5f4f4c72d4b6d1c4f4f5c
 *         relatedMajors:
 *           type: array
 *           items:
 *             type: string
 *             format: uuid
 *             description: ID của ngành học liên quan.
 *             example: 60d5f4f4c72d4b6d1c4f4f5c
 *         skillRequirements:
 *           type: string
 *           description: Yêu cầu kỹ năng cho dự án.
 *           example: Có kỹ năng lập trình và kỹ năng giao tiếp.
 *       required:
 *         - title
 *         - description
 *         - status
 *         - isRecruiting
 *         - objectives
 *         - startDate
 *         - endDate
 */