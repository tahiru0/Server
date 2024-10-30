import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Task from '../models/Task.js';
import Project from '../models/Project.js';
import Student from '../models/Student.js';
import { handleError } from '../utils/errorHandler.js';
import { authenticateStudent, authenticateMentor } from '../utils/roleAuthentication.js';
import optionalAuthenticate from '../middlewares/optionalAuthenticate.js';
import { checkTaskPermission } from '../middlewares/taskPermission.js';
import { usePDFUpload } from '../utils/upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Khởi tạo router
const router = express.Router();

// Cấu hình multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userModel = req.user.role === 'student' ? 'student' : 'companyaccount';
    const uploadPath = path.join(process.cwd(), 'public', 'uploads', userModel, req.user._id.toString(), 'task', req.params.taskId || 'new');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Tạo task mới 
router.post('/', authenticateMentor, upload.array('files'), async (req, res) => {
  try {
    const { projectId, ...taskData } = req.body;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }
    
    const task = new Task({
      ...taskData,
      project: projectId
    });
    
    await task.save();
    
    // Upload files sau khi đã có task._id
    if (req.files && req.files.length > 0) {
      // Di chuyển files từ thư mục tạm sang thư mục chính thức
      const finalPath = path.join(process.cwd(), 'public', 'uploads', 'companyaccount', req.user._id.toString(), 'task', task._id.toString());
      fs.mkdirSync(finalPath, { recursive: true });
      
      for (const file of req.files) {
        const newPath = path.join(finalPath, file.filename);
        fs.renameSync(file.path, newPath);
        await task.addFile(file, req.user._id, 'CompanyAccount');
      }
    }
    
    project.tasks.push(task._id);
    await project.save();
    
    res.status(201).json(task);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Sinh viên nộp task
router.post('/:taskId/submit', authenticateStudent, upload.array('files'), async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId).populate('project');
    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }
    
    const student = await Student.findById(req.user._id);
    if (!student.currentProjects.includes(task.project._id)) {
      return res.status(403).json({ message: 'Bạn không có quyền nộp task này' });
    }
    
    task.updateStatusIfOverdue();
    if (task.status === 'Overdue') {
      return res.status(400).json({ message: 'Không thể nộp task đã quá hạn' });
    }
    
    if (!task.canSubmit()) {
      return res.status(400).json({ message: 'Không thể nộp task này' });
    }

    // Upload files
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await task.addFile(file, req.user._id, 'Student');
      }
    }
    
    task.status = 'Submitted';
    task.feedback = req.body.feedback;
    task.submittedAt = new Date();
    await task.save();
    
    res.status(200).json(task);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Xóa file của task
router.delete('/:taskId/files/:fileUrl', authenticateStudent, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }

    const result = await task.removeFile(
      req.params.fileUrl,
      req.user._id,
      req.user.role === 'student' ? 'Student' : 'CompanyAccount'
    );

    res.json(result);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Lấy danh sách file của task
router.get('/:taskId/files', authenticateStudent, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }

    const files = await task.getFiles();
    res.json(files);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Lấy danh sách task của sinh viên có phân trang
router.get('/student-tasks', authenticateStudent, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    
    const student = await Student.findById(req.user._id)
      .populate({
        path: 'currentProjects',
        select: '_id title company mentor',
        populate: {
          path: 'company',
          select: 'name logo accounts',
          populate: {
            path: 'accounts',
            match: { role: 'mentor' },
            select: 'name avatar'
          }
        }
      });

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên' });
    }

    // Format currentProjects để lấy thông tin mentor từ company.accounts
    const formattedProjects = student.currentProjects.map(project => ({
      _id: project._id,
      title: project.title,
      companyLogo: project.company?.logo,
      mentor: project.company?.accounts?.length > 0 ? {
        name: project.company.accounts[0].name,
        avatar: project.company.accounts[0].avatar
      } : null
    }));

    const query = {
      assignedTo: student._id,
      project: { $in: student.currentProjects.map(p => p._id) },
      isDeleted: false
    };
    
    if (status) {
      query.status = status;
    }

    const totalTasks = await Task.countDocuments(query);
    const totalPages = Math.ceil(totalTasks / limit);

    const tasks = await Task.find(query)
      .select('name description deadline status project materialFiles createdAt updatedAt')
      .populate({
        path: 'project',
        select: 'title company',
        populate: {
          path: 'company',
          select: 'logo accounts',
          populate: {
            path: 'accounts',
            match: { role: 'mentor' },
            select: 'name avatar'
          }
        }
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const formattedTasks = tasks.map(task => ({
      _id: task._id,
      name: task.name,
      description: task.description,
      deadline: task.deadline,
      status: task.status,
      project: {
        _id: task.project._id,
        title: task.project.title,
        companyLogo: task.project.company?.logo,
        mentor: task.project.company?.accounts?.length > 0 ? {
          name: task.project.company.accounts[0].name,
          avatar: task.project.company.accounts[0].avatar
        } : null
      },
      materialFiles: task.materialFiles,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }));

    res.json({
      currentProjects: formattedProjects,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalTasks
      },
      tasks: formattedTasks
    });

  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Xem task
router.get('/:taskId', optionalAuthenticate(), async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId)
      .populate({
        path: 'project',
        select: 'title company mentor',
        populate: {
          path: 'company',
          select: 'name logo accounts'
        }
      })
      .populate('assignedTo', 'name email avatar')
      .populate({
        path: 'materialFiles.uploadedBy',
        refPath: 'materialFiles.uploaderModel',
        select: 'name email avatar'
      });

    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }

    // Debug để xem thông tin user
    console.log('User info:', {
      id: req.user?._id,
      model: req.user?.model,
      role: req.user?.role
    });

    // Kiểm tra xem user hiện tại có phải là mentor của project không
    let isMentor = false;
    if (req.user?.model === 'CompanyAccount' && req.user?.role === 'mentor') {
      isMentor = task.project.mentor.toString() === req.user._id.toString();
      console.log('Is Mentor check:', isMentor); // Debug mentor check
    }

    // Lấy permissions dựa trên vai trò
    const permissions = await task.checkPermission(
      req.user?._id,
      req.user?.model,
      'edit',
      isMentor ? 'mentor' : req.user?.role
    );

    console.log('Final permissions:', permissions); // Debug permissions

    // Format response
    const response = {
      _id: task._id,
      name: task.name,
      description: task.description,
      deadline: task.deadline,
      status: task.status,
      project: {
        _id: task.project._id,
        title: task.project.title,
        companyName: task.project.company?.name,
        companyLogo: task.project.company?.logo && !task.project.company.logo.startsWith('http')
          ? `http://localhost:5000${task.project.company.logo}`
          : task.project.company.logo
      },
      assignedTo: {
        _id: task.assignedTo._id,
        name: task.assignedTo.name,
        email: task.assignedTo.email,
        avatar: task.assignedTo.avatar && !task.assignedTo.avatar.startsWith('http')
          ? `http://localhost:5000${task.assignedTo.avatar}`
          : task.assignedTo.avatar
      },
      materialFiles: task.materialFiles.map(file => ({
        url: `http://localhost:5000/uploads/${file.uploaderModel.toLowerCase()}/${file.uploadedBy._id}/task/${task._id}/${file.url}`,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        uploadedBy: {
          _id: file.uploadedBy._id,
          name: file.uploadedBy.name,
          email: file.uploadedBy.email,
          avatar: file.uploadedBy.avatar && !file.uploadedBy.avatar.startsWith('http')
            ? `http://localhost:5000${file.uploadedBy.avatar}`
            : file.uploadedBy.avatar
        },
        uploaderModel: file.uploaderModel,
        uploadedAt: file.uploadedAt
      })),
      comment: task.comment,
      feedback: task.feedback,
      submittedAt: task.submittedAt,
      completedAt: task.completedAt,
      shareSettings: task.shareSettings,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      permissions: permissions
    };

    res.json(response);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Thêm file
router.post('/:taskId/files', optionalAuthenticate(), checkTaskPermission('edit'), async (req, res) => {
  const upload = usePDFUpload('task', req.params.taskId);
  
  upload(req, res, async function(err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          message: 'File quá lớn. Kích thước tối đa là 5MB'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          message: 'Chỉ được upload tối đa 5 file'
        });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
          message: err.message || 'Loại file không được hỗ trợ'
        });
      }
      return res.status(400).json({
        message: 'Lỗi khi upload file: ' + err.message
      });
    }

    try {
      // Xử lý file đã upload thành công
      const files = req.files;
      // ... phần code xử lý tiếp theo
    } catch (error) {
      return res.status(500).json({
        message: 'Lỗi server khi xử lý file'
      });
    }
  });
});

// Xóa file 
router.delete('/:taskId/files/:fileUrl', checkTaskPermission('edit'), async (req, res) => {
  if (!req.taskPermission.canRemoveFiles && 
      !req.taskPermission.canRemoveOwnFiles) {
    return res.status(403).json({ message: 'Không có quyền xóa file' });
  }
  // Xử lý xóa file
});

// Share settings - chỉ mentor mới được phép
router.put('/:taskId/share-settings', optionalAuthenticate(), checkTaskPermission('admin'), async (req, res) => {
  try {
    const { isPublic, accessType } = req.body;

    // Validate input
    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({ 
        message: 'isPublic phải là kiểu boolean' 
      });
    }

    if (!isPublic && !['view', 'edit'].includes(accessType)) {
      return res.status(400).json({ 
        message: 'accessType không hợp lệ khi private. Chỉ chấp nhận: view, edit' 
      });
    }

    // Kiểm tra quyền quản lý share
    if (!req.taskPermission.canManageSharing) {
      return res.status(403).json({ 
        message: 'Chỉ mentor mới có quyền quản lý chia sẻ' 
      });
    }

    // Cập nhật share settings
    const updatedSettings = await req.task.updateShareSettings({
      isPublic,
      accessType
    });

    // Nếu chuyển từ public sang private, giữ nguyên danh sách share
    if (!isPublic) {
      // Không xóa sharedWith array nữa
      await req.task.save();
    }

    // Gửi thông báo nếu chuyển sang public
    if (isPublic) {
      const project = await Project.findById(req.task.project)
        .populate('selectedApplicants.studentId');
      
      const notifications = project.selectedApplicants.map(applicant => ({
        recipient: applicant.studentId._id,
        recipientModel: 'Student',
        type: 'task',
        content: notificationMessages.task.madePublic(req.task.name, accessType),
        relatedId: req.task._id
      }));

      await Notification.insertMany(notifications);
    }

    res.json(updatedSettings);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

// Share task
router.post('/:taskId/share', optionalAuthenticate(), checkTaskPermission('admin'), async (req, res) => {
  try {
    const { userId, userModel, accessType } = req.body;

    // Validate input
    if (!userId || !userModel || !accessType) {
      return res.status(400).json({
        message: 'Thiếu thông tin bắt buộc: userId, userModel, accessType'
      });
    }

    if (!['Student', 'CompanyAccount'].includes(userModel)) {
      return res.status(400).json({
        message: 'userModel không hợp lệ. Chỉ chấp nhận: Student, CompanyAccount'
      });
    }

    if (!['view', 'edit'].includes(accessType)) {
      return res.status(400).json({
        message: 'accessType không hợp lệ. Chỉ chấp nhận: view, edit'
      });
    }

    // Kiểm tra quyền share
    try {
      await req.task.canShareWith(userId, userModel);
    } catch (error) {
      return res.status(403).json({ message: error.message });
    }

    const updatedShare = await req.task.shareWithUser(userId, userModel, accessType);
    
    // Gửi thông báo
    await Notification.insert({
      recipient: userId,
      recipientModel: userModel,
      recipientRole: userModel === 'CompanyAccount' ? 'mentor' : undefined,
      type: 'task',
      content: notificationMessages.task.shared(req.task.name, accessType),
      relatedId: req.task._id
    });

    res.json({
      message: 'Chia sẻ task thành công',
      shareSettings: updatedShare
    });
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

router.delete('/:taskId/share/:userId', optionalAuthenticate(), checkTaskPermission('admin'), async (req, res) => {
  try {
    // Kiểm tra quyền quản lý share
    if (!req.taskPermission.canManageSharing) {
      return res.status(403).json({ 
        message: 'Chỉ mentor mới có quyền quản lý chia sẻ' 
      });
    }

    const updatedShare = await req.task.removeShare(req.params.userId);

    // Gửi thông báo cho người bị xóa share
    await Notification.insert({
      recipient: req.params.userId,
      recipientModel: req.body.userModel, // Cần thêm userModel vào body request
      recipientRole: req.body.userModel === 'CompanyAccount' ? 'mentor' : undefined,
      type: 'task',
      content: notificationMessages.task.shareRemoved(req.task.name),
      relatedId: req.task._id
    });

    res.json(updatedShare);
  } catch (error) {
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
});

export default router;
