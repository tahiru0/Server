import express from 'express';
import School from '../models/School.js';
import authenticate from '../middlewares/authenticate.js';
import { handleError } from '../utils/errorHandler.js';
import Major from '../models/Major.js';
import Student from '../models/Student.js';
import Task from '../models/Task.js';
import Report from '../models/Report.js';

const router = express.Router();

const authenticateSchoolFaculty = authenticate(School, School.findSchoolAccountById, 'faculty-head');

const facultyAuth = async (req, res, next) => {
  try {
    const facultyId = req.user._id;
    const school = await School.findOne({ 'accounts._id': facultyId });
    
    if (!school) {
      return res.status(404).json({ message: 'Không tìm thấy trường học' });
    }

    const account = school.accounts.id(facultyId);
    if (!account || account.role.name !== 'faculty-head') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản trưởng khoa' });
    }

    const faculty = school.faculties.find(f => f._id.toString() === account.role.faculty.toString());
    if (!faculty) {
      return res.status(404).json({ message: 'Không tìm thấy khoa' });
    }

    req.school = school;
    req.faculty = faculty;
    next();
  } catch (error) {
    next(error);
  }
};

// Lấy danh sách ngành học của khoa
router.get('/majors', authenticateSchoolFaculty, facultyAuth, async (req, res) => {
    try {
        const majors = await Major.find({ _id: { $in: req.faculty.majors } });
        res.json(majors);
    } catch (error) {
        handleError(error, res);
    }
});

// Thêm ngành học mới vào khoa
router.post('/majors', authenticateSchoolFaculty, facultyAuth, async (req, res) => {
    try {
        const { name, description } = req.body;

        const newMajor = new Major({ name, description });
        await newMajor.save();

        req.faculty.majors.push(newMajor._id);
        await req.school.save();

        res.status(201).json({ message: 'Đã thêm ngành học mới', major: newMajor });
    } catch (error) {
        handleError(error, res);
    }
});

// Duyệt tài khoản sinh viên
router.put('/approve-student/:studentId', authenticateSchoolFaculty, facultyAuth, async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({ _id: studentId, major: { $in: req.faculty.majors } });

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên hoặc sinh viên không thuộc ngành quản lý của bạn' });
    }

    student.isApproved = true;
    await student.save();

    res.json({ message: 'Đã duyệt tài khoản sinh viên thành công', student });
  } catch (error) {
    handleError(error, res);
  }
});

// Lấy danh sách sinh viên (chỉ lấy thông tin cơ bản)
router.get('/students', authenticateSchoolFaculty, facultyAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const sortField = req.query.sortField || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const isApproved = req.query.isApproved;

    const filter = {
      major: { $in: req.faculty.majors },
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } }
      ]
    };

    if (isApproved !== undefined) {
      filter.isApproved = isApproved === 'true';
    }

    const students = await Student.find(filter)
      .select('name email studentId major isApproved createdAt')
      .populate('major', 'name')
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Student.countDocuments(filter);

    res.json({
      students,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalStudents: total
    });
  } catch (error) {
    handleError(error, res);
  }
});

// Lấy thông tin chi tiết của một sinh viên
router.get('/students/:id', authenticateSchoolFaculty, facultyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, major: { $in: req.faculty.majors } })
      .populate('major', 'name');

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên hoặc sinh viên không thuộc ngành quản lý của bạn' });
    }

    res.json(student);
  } catch (error) {
    handleError(error, res);
  }
});

// Cập nhật thông tin sinh viên
router.put('/students/:id', authenticateSchoolFaculty, facultyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const student = await Student.findOne({ _id: id, major: { $in: req.faculty.majors } });

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên hoặc sinh viên không thuộc ngành quản lý của bạn' });
    }

    Object.assign(student, updateData);
    await student.save();

    res.json({ message: 'Cập nhật thông tin sinh viên thành công', student });
  } catch (error) {
    handleError(error, res);
  }
});

// Xóa sinh viên (soft delete)
router.delete('/students/:id', authenticateSchoolFaculty, facultyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, major: { $in: req.faculty.majors } });

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên hoặc sinh viên không thuộc ngành quản lý của bạn' });
    }

    student.isDeleted = true;
    await student.save();

    res.json({ message: 'Đã xóa sinh viên thành công' });
  } catch (error) {
    handleError(error, res);
  }
});

// Lấy báo cáo thực tập của sinh viên
router.get('/students/:studentId/internship-report', authenticateSchoolFaculty, facultyAuth, async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({ _id: studentId, major: { $in: req.faculty.majors } })
      .populate('major', 'name');

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên hoặc sinh viên không thuộc ngành quản lý của bạn' });
    }

    // Lấy tất cả các task của sinh viên
    const tasks = await Task.find({ assignedTo: studentId, isStudentActive: true })
      .select('name description status deadline submissionDate rating comment')
      .sort({ deadline: 1 });

    // Lấy tất cả các report của sinh viên
    const reports = await Report.find({ student: studentId })
      .select('title content createdAt taskEvaluations')
      .sort({ createdAt: 1 });

    // Tính điểm trung bình
    let totalScore = 0;
    let completedTasks = 0;

    // Tạo báo cáo tổng hợp
    const internshipReport = {
      studentInfo: {
        name: student.name,
        studentId: student.studentId,
        major: student.major.name
      },
      tasks: tasks.map(task => {
        if (task.rating) {
          totalScore += task.rating;
          completedTasks++;
        }
        return {
          name: task.name,
          description: task.description,
          status: task.status,
          deadline: task.deadline,
          submissionDate: task.submissionDate,
          rating: task.rating,
          comment: task.comment
        };
      }),
      reports: reports.map(report => ({
        title: report.title,
        content: report.content,
        createdAt: report.createdAt,
        taskEvaluations: report.taskEvaluations
      })),
      averageScore: completedTasks > 0 ? (totalScore / completedTasks).toFixed(2) : 'N/A'
    };

    res.json(internshipReport);
  } catch (error) {
    handleError(error, res);
  }
});

// Tạo sinh viên mới
router.post('/students', authenticateSchoolFaculty, async (req, res) => {
    const { name, email, password, studentId, dateOfBirth, major } = req.body;
    const facultyId = req.user._id;

    try {
        const school = await School.findOne({ 'accounts._id': facultyId });
        if (!school) {
            return res.status(404).json({ message: 'Không tìm thấy trường học' });
        }

        const account = school.accounts.id(facultyId);
        if (!account || account.role.name !== 'faculty-head') {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản trưởng khoa' });
        }

        const faculty = school.faculties.find(f => f._id.toString() === account.role.faculty.toString());
        if (!faculty) {
            return res.status(404).json({ message: 'Không tìm thấy khoa' });
        }

        if (!password && (!school.studentApiConfig || !school.studentApiConfig.passwordRule || !school.studentApiConfig.passwordRule.template)) {
            return res.status(400).json({
                message: 'Vui lòng cập nhật quy tắc mật khẩu hoặc cung cấp mật khẩu cho sinh viên.',
                code: 'NO_PASSWORD_RULE'
            });
        }

        let majorDoc = await Major.findOne({ _id: major, majors: { $in: faculty.majors } });
        if (!majorDoc) {
            return res.status(400).json({ message: 'Ngành học không hợp lệ hoặc không thuộc khoa này' });
        }

        const newStudent = new Student({
            name,
            email,
            studentId,
            dateOfBirth,
            major: majorDoc._id,
            school: school._id,
            isApproved: true
        });

        if (!password) {
            const defaultPassword = await newStudent.generateDefaultPassword();
            if (!defaultPassword) {
                return res.status(400).json({
                    message: 'Vui lòng cập nhật quy tắc mật khẩu hoặc cung cấp mật khẩu cho sinh viên.',
                    code: 'NO_PASSWORD_RULE'
                });
            }
            newStudent.password = defaultPassword;
        } else {
            newStudent.password = password;
        }

        await newStudent.save();
        res.status(201).json(newStudent);
    } catch (error) {
        const { status, message } = handleError(error);
        res.status(status).json({ message });
    }
});

// Lấy số lượng sinh viên đã duyệt và chưa duyệt
router.get('/student-counts', authenticateSchoolFaculty, async (req, res) => {
  try {
    const facultyId = req.user._id;

    const school = await School.findOne({ 'accounts._id': facultyId });
    if (!school) {
      return res.status(404).json({ message: 'Không tìm thấy trường học' });
    }

    const account = school.accounts.id(facultyId);
    if (!account || account.role.name !== 'faculty-head') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản trưởng khoa' });
    }

    const faculty = school.faculties.find(f => f._id.toString() === account.role.faculty.toString());
    if (!faculty) {
      return res.status(404).json({ message: 'Không tìm thấy khoa' });
    }

    const approvedCount = await Student.countDocuments({
      major: { $in: faculty.majors },
      isApproved: true,
      isDeleted: false
    });

    const unapprovedCount = await Student.countDocuments({
      major: { $in: faculty.majors },
      isApproved: false,
      isDeleted: false
    });

    res.json({
      approvedCount,
      unapprovedCount
    });
  } catch (error) {
    handleError(error, res);
  }
});

export default router;
