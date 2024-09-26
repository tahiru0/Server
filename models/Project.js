import mongoose from 'mongoose';
const { Schema } = mongoose;
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
      required: true,
      sparse: true, // Cho phép các giá trị null hoặc không xác định trong trường này, giúp tránh xung đột với các giá trị unique khác
      message: 'Mỗi sinh viên chỉ có thể ứng tuyển một lần cho mỗi dự án'
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
      required: true,
      sparse: true,
      message: 'Mỗi sinh viên chỉ có thể được chọn một lần cho mỗi dự án'
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
  },
  removedStudents: [{
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    removedAt: { type: Date, default: Date.now },
    reason: String
  }],
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

projectSchema.methods.pinProject = async function () {
  this.pinnedProject = true;
  await this.save();
};

// Thêm index unique cho applicants.applicantId
projectSchema.index({ 'applicants.applicantId': 1 }, { unique: true, sparse: true, message: 'Mỗi sinh viên chỉ có thể ứng tuyển một lần cho mỗi dự án' });

// Thêm index unique cho selectedApplicants.studentId
projectSchema.index({ 'selectedApplicants.studentId': 1 }, { unique: true, sparse: true, message: 'Mỗi sinh viên chỉ có thể được chọn một lần cho mỗi dự án' });


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
    const error = new Error('Dự án đã bị tạm dừng, không thể thực hiện hành động này');
    error.status = 400;
    throw error;
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
    const error = new Error('Dự án đã bị tạm dừng, không thể thực hiện hành động này');
    error.status = 400;
    throw error;
  }
  if (!this.isRecruiting) {
    const error = new Error('Dự án không đang tuyển dụng');
    error.status = 400;
    throw error;
  }
  if (this.applicants.length >= this.maxApplicants) {
    const error = new Error('Đã đạt đến số lượng ứng viên tối đa');
    error.status = 400;
    throw error;
  }
  const now = new Date();
  if (now < this.applicationStart || now > this.applicationEnd) {
    const error = new Error('Không nằm trong thời gian tuyển dụng');
    error.status = 400;
    throw error;
  }

  const student = await mongoose.model('Student').findById(applicantId);
  if (!student) {
    const error = new Error('Không tìm thấy sinh viên');
    error.status = 400;
    throw error;
  }
  if (!student.isApproved) {
    throw new Error('Sinh viên chưa được phê duyệt');
  }
  if (this.applicants.some(a => a.applicantId.toString() === applicantId.toString())) {
    throw new Error('Sinh viên đã ứng tuyển dự án này');
  }

  if (student.appliedProjects.length >= 10) {
    const error = new Error('Sinh viên chỉ được nộp đơn vào tối đa 10 dự án');
    error.status = 400;
    throw error;
  }

  if (student.currentProject) {
    const error = new Error('Sinh viên đã được chấp nhận vào một dự án khác');
    error.status = 400;
    throw error;
  }

  this.applicants.push({ applicantId });
  student.appliedProjects.push(this._id);

  await Promise.all([this.save(), student.save()]);

  // Tạo thông báo cho mentor và sinh viên
  await Notification.insert({
    recipient: this.mentor,
    recipientModel: 'CompanyAccount',
    type: 'project',
    content: notificationMessages.project.newApplicant(this.title),
    relatedId: this._id
  });

  await Notification.insert({
    recipient: applicantId,
    recipientModel: 'Student',
    type: 'project',
    content: notificationMessages.project.applicationSubmitted(this.title),
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
    const error = new Error('Ứng viên không tồn tại trong danh sách ứng tuyển');
    error.status = 400;
    throw error;
  }

  const student = await mongoose.model('Student').findById(applicantId).lean();
if (!student) {
  const error = new Error('Không tìm thấy sinh viên');
  error.status = 400;
  throw error;
}

console.log('Student data:', JSON.stringify(student, null, 2));

if (student.currentProject) {
  const error = new Error('Sinh viên đã được chấp nhận vào một dự án khác');
  error.status = 400;
  throw error;
}

  this.selectedApplicants.push({
    studentId: applicant.applicantId,
    appliedDate: applicant.appliedDate
  });
  this.applicants = this.applicants.filter(a => a.applicantId.toString() !== applicantId.toString());

  await student.setCurrentProject(this._id);

  await this.save();

  // Xóa sinh viên khỏi danh sách ứng tuyển của các dự án khác
  await mongoose.model('Project').updateMany(
    { _id: { $ne: this._id } },
    { $pull: { applicants: { applicantId: applicantId } } }
  );
  // Xóa các đơn ứng tuyển khác của sinh viên
  await student.removeAppliedProject(this._id);

  // Tạo thông báo cho sinh viên
  await Notification.insert({
    recipient: applicantId,
    recipientModel: 'Student',
    type: 'project',
    content: notificationMessages.project.applicationAccepted(this.title),
    relatedId: this._id
  });

  return this;
};

projectSchema.methods.checkDuplicateSelectedApplicants = async function(applicantId) {
  const existingProject = await mongoose.model('Project').findOne({
    'selectedApplicants.studentId': applicantId,
    _id: { $ne: this._id }
  });

  if (existingProject) {
    const error = new Error('Sinh viên đã được chọn vào một dự án khác');
    error.status = 400;
    throw error;
  }
};

projectSchema.methods.removeApplicant = async function (applicantId, reason = 'rejected') {
  const applicantIndex = this.applicants.findIndex(a => a.applicantId.toString() === applicantId.toString());
  if (applicantIndex === -1) {
    const error = new Error('Ứng viên không tồn tại trong danh sách ứng tuyển');
    error.status = 400;
    throw error;
  }

  this.applicants.splice(applicantIndex, 1);

  const student = await mongoose.model('Student').findById(applicantId);
  if (student) {
    student.appliedProjects = student.appliedProjects.filter(id => id.toString() !== this._id.toString());
    await student.save();
  }

  await this.save();

  // Tạo thông báo chi tiết cho sinh viên
  let notificationContent;
  const now = new Date();
  if (reason === 'expired' || now > this.applicationEnd) {
    notificationContent = notificationMessages.project.applicationExpired(this.title);
  } else if (reason === 'rejected') {
    notificationContent = notificationMessages.project.applicationRejected(this.title);
  } else {
    notificationContent = notificationMessages.project.applicationRemoved(this.title, reason);
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
  if (!this.isRecruiting) {
    return { canAccept: false, reason: 'Dự án hiện không trong giai đoạn tuyển dụng' };
  }
  if (this.currentApplicants >= this.maxApplicants) {
    return { canAccept: false, reason: 'Dự án đã đạt số lượng ứng viên tối đa' };
  }
  if (now < this.applicationStart) {
    return { canAccept: false, reason: 'Thời gian ứng tuyển chưa bắt đầu' };
  }
  if (now > this.applicationEnd) {
    return { canAccept: false, reason: 'Thời gian ứng tuyển đã kết thúc' };
  }
  return { canAccept: true };
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

projectSchema.statics.getPublicProjects = async function (query, filters = {}, page = 1, limit = 10) {
  let searchCriteria = {};

  if (query && query.trim() !== '') {
    if (mongoose.Types.ObjectId.isValid(query)) {
      searchCriteria._id = new mongoose.Types.ObjectId(query);
    } else {
      searchCriteria.$or = [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ];
    }
  }

  if (filters.status) {
    searchCriteria.status = filters.status;
  } else {
    searchCriteria.isRecruiting = true;
  }

  if (filters.major) {
    searchCriteria.relatedMajors = { $in: [filters.major] };
  }

  if (filters.skills && filters.skills.length > 0) {
    searchCriteria.requiredSkills = { $in: filters.skills };
  }

  const skip = (page - 1) * limit;

  const [projects, totalProjects] = await Promise.all([
    this.find(searchCriteria)
      .select('_id title status isRecruiting maxApplicants pinnedProject applicationStart applicationEnd requiredSkills relatedMajors applicants')
      .populate('company', 'name _id logo')
      .populate('relatedMajors', 'name')
      .populate('requiredSkills', 'name')
      .sort({ pinnedProject: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(searchCriteria)
  ]);

  const formattedProjects = projects.map(project => {
    let score = 0;
    if (filters.skills && filters.skills.length > 0) {
      score += project.requiredSkills.filter(skill => filters.skills.includes(skill._id.toString())).length;
    }
    if (filters.major) {
      score += project.relatedMajors.some(major => major._id.toString() === filters.major) ? 1 : 0;
    }
    const availablePositions = Math.max(0, project.maxApplicants - project.applicants.length);
    return {
      _id: project._id,
      title: project.title,
      companyName: project.company.name,
      companyId: project.company._id,
      companyLogo: project.company.logo ? (project.company.logo.startsWith('http') ? project.company.logo : `http://localhost:5000${project.company.logo}`) : null,
      status: project.status,
      isRecruiting: project.isRecruiting,
      availablePositions: availablePositions,
      pinnedProject: project.pinnedProject,
      relatedMajors: project.relatedMajors.map(major => ({
        _id: major._id,
        name: major.name
      })),
      requiredSkills: project.requiredSkills.map(skill => ({
        _id: skill._id,
        name: skill.name
      })),
      applicationStart: project.applicationStart,
      applicationEnd: project.applicationEnd,
      score: score
    };
  });

  formattedProjects.sort((a, b) => b.score - a.score || b.pinnedProject - a.pinnedProject || b.createdAt - a.createdAt);

  return {
    projects: formattedProjects,
    currentPage: page,
    totalPages: Math.ceil(totalProjects / limit),
    totalProjects
  };
};

projectSchema.statics.getPublicProjectDetails = async function (projectId, studentId = null) {
  const project = await this.findById(projectId)
    .select('_id title description status isRecruiting maxApplicants applicationStart applicationEnd objectives startDate endDate projectStatus requiredSkills relatedMajors skillRequirements applicants selectedApplicants')
    .populate('company', 'name logo')
    .populate('relatedMajors', 'name')
    .populate('requiredSkills', 'name')
    .lean();

  if (!project) return null;

  let hasApplied = false;
  let isSelected = false;

  if (studentId) {
    hasApplied = project.applicants.some(applicant => applicant.applicantId.toString() === studentId.toString());
    isSelected = project.selectedApplicants.some(selected => selected.studentId.toString() === studentId.toString());
  }


  const availablePositions = Math.max(0, project.maxApplicants - project.applicants.length);

  return {
    _id: project._id,
    title: project.title,
    description: project.description,
    companyName: project.company.name,
    companyId: project.company._id,
    companyLogo: project.company.logo ? (project.company.logo.startsWith('http') ? project.company.logo : `http://localhost:5000${project.company.logo}`) : null,
    status: project.status,
    isRecruiting: project.isRecruiting,
    maxApplicants: project.maxApplicants,
    availablePositions: availablePositions,
    applicationStart: project.applicationStart,
    applicationEnd: project.applicationEnd,
    objectives: project.objectives,
    startDate: project.startDate,
    endDate: project.endDate,
    projectStatus: project.projectStatus,
    relatedMajors: project.relatedMajors.map(major => major.name),
    requiredSkills: project.requiredSkills.map(skill => skill.name),
    skillRequirements: project.skillRequirements,
    hasApplied: hasApplied,
    isSelected: isSelected
  };
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

  if (filters.major) {
    searchCriteria.relatedMajors = { $in: filters.major };
  }

  return this.find(searchCriteria)
    .select('_id title mentor status isRecruiting applicants selectedApplicants maxApplicants pinnedProject relatedMajors requiredSkills')
    .populate({
      path: 'company',
      select: 'accounts',
      populate: {
        path: 'accounts',
        select: 'name _id'
      }
    })
    .populate('relatedMajors', 'name _id')
    .populate('requiredSkills', 'name _id')
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
        pinnedProject: project.pinnedProject,
        relatedMajors: project.relatedMajors.map(major => ({
          _id: major._id,
          name: major.name
        })),
        requiredSkills: project.requiredSkills.map(skill => ({
          _id: skill._id,
          name: skill.name
        }))
      };
    }));
};

projectSchema.statics.getProjectDetails = async function (projectId, studentId) {
  try {
    const project = await this.findOne({ _id: projectId })
      .populate({
        path: 'selectedApplicants.studentId',
        select: '_id name avatar'
      })
      .populate('relatedMajors')
      .populate('requiredSkills')
      .populate('company', 'name')
      .lean();

    if (!project) {
      throw new Error('Không tìm thấy dự án');
    }

    const hasApplied = studentId ? project.applicants.some(applicant => applicant.applicantId.toString() === studentId) : false;
    const isSelected = studentId ? project.selectedApplicants.some(selected => selected.studentId && selected.studentId._id.toString() === studentId) : false;

    return {
      id: project._id,
      title: project.title,
      description: project.description,
      status: project.status,
      isRecruiting: project.isRecruiting,
      maxApplicants: project.maxApplicants,
      applicationEnd: project.applicationEnd,
      relatedMajors: project.relatedMajors.map(major => ({
        id: major._id,
        name: major.name
      })),
      requiredSkills: project.requiredSkills.map(skill => ({
        id: skill._id,
        name: skill.name
      })),
      members: project.selectedApplicants
        .filter(applicant => applicant.studentId) // Lọc ra những applicant có studentId
        .map(applicant => ({
          id: applicant.studentId._id,
          name: applicant.studentId.name,
          avatar: applicant.studentId.avatar && !applicant.studentId.avatar.startsWith('http')
            ? `http://localhost:5000${applicant.studentId.avatar}`
            : applicant.studentId.avatar
        })),
      applicantsCount: project.applicants.length,
      updatedAt: project.updatedAt,
      companyName: project.company.name,
      hasApplied: hasApplied,
      isSelected: isSelected
    };
  } catch (error) {
    throw new Error(error.message);
  }
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
    const error = new Error('Không tìm thấy công ty.');
    error.status = 400;
    throw error;
  }

  const newMentor = company.accounts.id(newMentorId);
  const oldMentor = company.accounts.id(oldMentorId);

  if (!newMentor || newMentor.role !== 'mentor') {
    const error = new Error('Mentor mới không hợp lệ.');
    error.status = 400;
    throw error;
  }

  if (!oldMentor || oldMentor.role !== 'mentor') {
    const error = new Error('Mentor cũ không hợp lệ.');
    error.status = 400;
    throw error;
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
    const error = new Error('Sinh viên không tồn tại trong danh sách được chọn');
    error.status = 400;
    throw error;
  }

  // Xóa sinh viên khỏi danh sách selectedApplicants và lưu lý do đuổi
  const removedStudent = this.selectedApplicants.splice(selectedApplicantIndex, 1)[0];
  this.removedStudents = this.removedStudents || [];
  this.removedStudents.push({
    studentId: removedStudent.studentId,
    removedAt: new Date(),
    reason: reason
  });

  await this.save();

  // Cập nhật currentProject của sinh viên
  const student = await mongoose.model('Student').findById(studentId);
  if (student) {
    await student.removeCurrentProject();
  }

  // Xóa mềm các task liên quan đến sinh viên
  const Task = mongoose.model('Task');
  await Task.updateMany(
    { project: this._id, assignedTo: studentId },
    { $set: { isDeleted: true } }
  );

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
