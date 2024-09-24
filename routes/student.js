import express from 'express';
import Project from '../models/Project.js'; // Giả định là một ES module
import Task from '../models/Task.js'; // Giả định là một ES module
import Skill from '../models/Skill.js';
import authenticate from '../middlewares/authenticate.js';
import Student from '../models/Student.js';
import { handleError } from '../utils/errorHandler.js';
import Notification from '../models/Notification.js';
import { handleQuery } from '../utils/queryHelper.js';
import School from '../models/School.js';
import { createOrUpdateGroupedNotification } from '../utils/notificationHelper.js';
import { useImageUpload, usePDFUpload } from '../utils/upload.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const deleteFile = (filePath) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const avatarUpload = useImageUpload('students', 'avatars');
const cvUpload = usePDFUpload('students', 'cvs');

const router = express.Router();

// Hàm tìm người dùng theo ID
const findUserById = async (decoded) => {
  return await Student.findById(decoded.id);
};

// Middleware xác thực cho sinh viên
const authenticateStudent = authenticate(Student, Student.findStudentById);

// Đăng ký tài khoản sinh viên
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, studentId, schoolId } = req.body;

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'Không tìm thấy trường học' });
    }

    const student = new Student({
      name,
      email,
      password,
      studentId,
      school: schoolId
    });

    await student.save();

    // Gửi thông báo cho admin của trường
    await createOrUpdateGroupedNotification({
      schoolId,
      studentName: student.name,
      studentId: student._id
    });

    res.status(201).json({ message: 'Đăng ký thành công. Vui lòng chờ nhà trường xác nhận tài khoản.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Lấy danh sách dự án đang tuyển dụng
router.get('/projects', authenticateStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id).populate('skills major');
    const additionalFilters = { isRecruiting: true };

    if (req.query.recommended === 'true') {
      additionalFilters.$or = [
        { requiredSkills: { $in: student.skills } },
        { relatedMajors: student.major }
      ];
    }

    const query = handleQuery(Project, req, additionalFilters);
    const [projects, total] = await Promise.all([
      query.exec(),
      Project.countDocuments(additionalFilters)
    ]);

    res.json({
      projects,
      total,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ứng tuyển dự án
router.post('/projects/:id/apply', authenticateStudent, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Không tìm thấy dự án' });
    }

    // Kiểm tra xem sinh viên đã ứng tuyển chưa
    const alreadyApplied = project.applicants.some(applicant =>
      applicant.applicantId.toString() === req.user._id.toString()
    );
    if (alreadyApplied) {
      return res.status(400).json({ error: 'Bạn đã ứng tuyển dự án này rồi' });
    }

    // Kiểm tra xem dự án có thể nhận ứng viên không
    if (!project.canAcceptApplicants()) {
      return res.status(400).json({ error: 'Dự án hiện không nhận ứng viên' });
    }

    project.applicants.push({ applicantId: req.user._id });
    project.currentApplicants += 1;

    // Kiểm tra và cập nhật trạng thái tuyển dụng nếu cần
    if (project.checkRecruitmentStatus()) {
      await project.save();
      return res.json({ message: 'Ứng tuyển thành công. Dự án đã đóng tuyển dụng.' });
    }

    await project.save();
    res.json({ message: 'Ứng tuyển thành công' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Lấy thông tin hồ sơ sinh viên
router.get('/profile', authenticateStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id)
      .populate('projects')
      .select('-password -refreshToken');
    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cập nhật hồ sơ sinh viên
router.put('/profile', authenticateStudent, async (req, res) => {
  try {
    const { name, skills, experience, education } = req.body;
    const student = await Student.findByIdAndUpdate(
      req.user._id,
      { name, skills, experience, education },
      { new: true, runValidators: true }
    ).select('-password -refreshToken');
    res.json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// // Tạo CV tự động
// router.post('/generate-cv', authenticateStudent, async (req, res) => {
//   try {
//     const student = await Student.findById(req.user._id)
//       .populate('projects')
//       .select('-password -refreshToken');

//     // Ở đây, bạn sẽ cần một service để tạo CV từ thông tin sinh viên
//     // Ví dụ: const cvUrl = await CVGeneratorService.generate(student);

//     // Giả sử chúng ta có một URL cho CV được tạo
//     const cvUrl = 'https://example.com/generated-cv.pdf';

//     student.cv = cvUrl;
//     await student.save();

//     res.json({ cvUrl });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// Cập nhật kỹ năng và ngành học
router.put('/update-skills-major', authenticateStudent, async (req, res) => {
  try {
    const { skills, major } = req.body;
    const student = await Student.findByIdAndUpdate(
      req.user._id,
      { skills, major },
      { new: true, runValidators: true }
    ).populate('skills major');
    res.json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Tìm kiếm dự án
router.get('/search/projects', authenticateStudent, async (req, res) => {
  try {
    const { query, skills, status, startDate, endDate } = req.query;
    const projects = await Project.searchProjects(query, { skills, status, startDate, endDate });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Tìm kiếm task
router.get('/search/tasks', authenticateStudent, async (req, res) => {
  try {
    const { query, status, deadline, project } = req.query;
    const tasks = await Task.searchTasks(query, { status, deadline, project });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Thêm route mới để hủy ứng tuyển
router.delete('/projects/:id/apply', authenticateStudent, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Không tìm thấy dự án' });
    }

    await project.removeApplicant(req.user._id);
    res.json({ message: 'Đã hủy ứng tuyển thành công' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Lấy danh sách dự án đã ứng tuyển và được nhận
router.get('/applied-and-accepted-projects', authenticateStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id);
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên.' });
    }

    const projects = await student.getAppliedAndAcceptedProjects();

    res.status(200).json({
      appliedProjects: projects.appliedProjects.map(project => ({
        _id: project._id,
        title: project.title
      })),
      acceptedProjects: projects.acceptedProjects.map(project => ({
        _id: project._id,
        title: project.title
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Thêm route mới để lấy thông tin sinh viên hiện tại
router.get('/me', authenticateStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id)
      .select('-passwordHash -refreshToken')
      .populate('school', '_id name logo')
      .populate('major', '_id name')
      .populate('skills', '_id name')
      .populate('projects', '_id title')
      .populate('currentProject', '_id title');

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên.' });
    }

    res.status(200).json({
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        studentId: student.studentId,
        isApproved: student.isApproved,
        avatar: student.avatar,
        school: {
          _id: student.school._id,
          name: student.school.name,
          logo: student.school.logo
        },
        major: student.major ? { _id: student.major._id, name: student.major.name } : null,
        skills: student.skills.map(skill => ({ _id: skill._id, name: skill.name })),
        experience: student.experience,
        education: student.education,
        projects: student.projects.map(project => ({
          _id: project._id,
          title: project.title
        })),
        cv: student.cv,
        currentProject: student.currentProject ? {
          _id: student.currentProject._id,
          title: student.currentProject.title
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Ứng tuyển dự án
router.post('/apply/:projectId', authenticateStudent, async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Không tìm thấy dự án' });
    }

    // Kiểm tra xem sinh viên đã ứng tuyển chưa
    const alreadyApplied = project.applicants.some(applicant =>
      applicant.applicantId.toString() === req.user._id.toString()
    );
    if (alreadyApplied) {
      return res.status(400).json({ error: 'Bạn đã ứng tuyển dự án này rồi' });
    }

    // Kiểm tra xem dự án có thể nhận ứng viên không
    if (!project.canAcceptApplicants()) {
      return res.status(400).json({ error: 'Dự án hiện không nhận ứng viên' });
    }

    await project.addApplicant(req.user._id);

    res.json({ message: 'Ứng tuyển thành công' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
// Thêm route mới để hủy ứng tuyển
router.delete('/projects/:id/apply', authenticateStudent, async (req, res) => {
  try {
    const projectId = req.params.id;
    const student = await Student.findById(req.user._id);
    if (!student) {
      return res.status(404).json({ error: 'Không tìm thấy sinh viên' });
    }

    await student.removeProjectApplication(projectId);
    res.json({ message: 'Đã hủy ứng tuyển thành công' });
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Lấy chi tiết dự án đang tham gia
router.get('/current-project', authenticateStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id);
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên.' });
    }

    const projectDetails = await student.getCurrentProjectDetails();
    if (!projectDetails) {
      return res.status(404).json({ message: 'Sinh viên chưa tham gia dự án nào.' });
    }

    res.status(200).json(projectDetails);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Lấy danh sách dự án đang ứng tuyển
router.get('/applied-projects', authenticateStudent, async (req, res) => {
  try {
    const limit = 10; // Số lượng dự án tối đa cần lấy
    const student = await Student.findById(req.user._id)
      .select('appliedProjects')
      .populate({
        path: 'appliedProjects',
        select: '_id title description status isRecruiting applicationEnd',
        options: { limit: limit },
        populate: {
          path: 'company',
          select: 'name logo _id'
        }
      })
      .lean();

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên.' });
    }

    const appliedProjects = student.appliedProjects.map(project => ({
      _id: project._id,
      title: project.title,
      description: project.description,
      company: {
        name: project.company.name,
        logo: project.company.logo ? (project.company.logo.startsWith('http') ? project.company.logo : `http://localhost:5000${project.company.logo}`) : null,
        _id: project.company._id
      },
      status: project.status,
      isRecruiting: project.isRecruiting,
      applicationEnd: project.applicationEnd
    }));

    res.status(200).json(appliedProjects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Lấy danh sách task được giao cho sinh viên
router.get('/tasks', authenticateStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id);
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên.' });
    }

    const tasks = await student.getAssignedTasks();
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Thay đổi trạng thái task
router.put('/tasks/:taskId/status', authenticateStudent, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    const student = await Student.findById(req.user._id);
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên.' });
    }

    const updatedTask = await student.updateTaskStatus(taskId, status);
    res.status(200).json(updatedTask);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Cập nhật CV
router.put('/update-cv', authenticateStudent, (req, res, next) => {
  const upload = cvUpload.single('cv');

  upload(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: 'Lỗi upload file: ' + err.message });
    } else if (err) {
      return res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const userId = req.user._id;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Không có file được upload.' });
    }

    const student = await Student.findById(userId).select('cv');
    const oldCvPath = student.cv ? path.join('public', student.cv) : null;

    const cvPath = `/uploads/students/cvs/${userId}/${req.file.filename}`;

    const updatedStudent = await Student.findByIdAndUpdate(
      userId,
      { $set: { cv: cvPath } },
      { new: true, runValidators: true }
    ).select('-passwordHash -refreshToken');

    if (!updatedStudent) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên.' });
    }

    // Xóa file cũ nếu lưu thành công file mới
    if (oldCvPath) {
      deleteFile(oldCvPath);
    }

    res.status(200).json({ message: 'Cập nhật CV thành công', cv: updatedStudent.cv });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Cập nhật avatar
router.put('/update-avatar', authenticateStudent, (req, res, next) => {
  const upload = avatarUpload.single('avatar');

  upload(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: 'Lỗi upload file: ' + err.message });
    } else if (err) {
      return res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const userId = req.user._id;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Không có file được upload.' });
    }

    const student = await Student.findById(userId).select('avatar');
    const oldAvatarPath = student.avatar ? path.join('public', student.avatar) : null;

    const avatarPath = `/uploads/students/avatars/${userId}/${req.file.filename}`;

    const updatedStudent = await Student.findByIdAndUpdate(
      userId,
      { $set: { avatar: avatarPath } },
      { new: true, runValidators: true }
    ).select('-passwordHash -refreshToken');

    if (!updatedStudent) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên.' });
    }

    // Xóa file cũ nếu lưu thành công file mới
    if (oldAvatarPath) {
      deleteFile(oldAvatarPath);
    }

    res.status(200).json({ message: 'Cập nhật avatar thành công', avatar: updatedStudent.avatar });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
// Lấy CV của sinh viên
router.get('/get-cv', authenticateStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id).select('cv');
    if (!student || !student.cv) {
      return res.status(404).json({ message: 'Không tìm thấy CV của sinh viên.' });
    }

    res.status(200).json({ cv: student.cv });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Lấy thông tin sinh viên để chỉnh sửa
router.get('/update-profile', authenticateStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const student = await Student.findById(userId)
      .select('name email phoneNumber address skills experience education avatar')
      .populate('skills', 'name');

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên.' });
    }

    const formattedStudent = {
      name: student.name,
      email: student.email,
      phoneNumber: student.phoneNumber,
      address: student.address,
      skills: student.skills.map(skill => skill.name).join(', '),
      experience: student.experience.length > 0 ? student.experience[0].description : '',
      education: student.education.length > 0 ? student.education[0].school : '',
      avatar: student.avatar
    };

    res.status(200).json(formattedStudent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Cập nhật thông tin sinh viên (không bao gồm avatar, CV và các trường nhạy cảm)
router.put('/update-profile', authenticateStudent, async (req, res) => {
  try {
    const { name, email, phoneNumber, address, skills, experience, education } = req.body;
    const userId = req.user._id;

    const updateData = {};

    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (address) updateData.address = address;
    if (experience) updateData.experience = [{ description: experience }];
    if (education) updateData.education = [{ school: education }];

    // Xử lý skills
    if (skills) {
      const skillIds = [];
      for (const skillName of skills.split(',').map(s => s.trim())) {
        if (skillName) {
          let skill = await Skill.findOne({ name: { $regex: new RegExp(`^${skillName}$`, 'i') } });
          if (!skill) {
            skill = new Skill({ name: skillName });
            await skill.save();
          }
          skillIds.push(skill._id);
        }
      }
      if (skillIds.length > 0) {
        updateData.skills = skillIds;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Không có thông tin nào được cập nhật.' });
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-passwordHash -refreshToken -major').populate('skills');

    if (!updatedStudent) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên.' });
    }

    res.status(200).json(updatedStudent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

const errorHandler = (err, req, res, next) => {
  const { status, message } = handleError(err);
  res.status(status).json({ message });
};

router.use(errorHandler);

export default router;
