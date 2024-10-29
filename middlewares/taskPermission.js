import Task from '../models/Task.js';

export const checkTaskPermission = (requiredAction) => {
  return async (req, res, next) => {
    try {
      // Log để debug
      console.log('User info:', {
        userId: req.user?._id,
        userModel: req.userModel,
        role: req.user?.role
      });

      // Kiểm tra user và userModel từ optionalAuthenticate
      if (!req.user?._id) {
        return res.status(401).json({ 
          message: 'Vui lòng đăng nhập để thực hiện hành động này'
        });
      }

      const task = await Task.findById(req.params.taskId);
      if (!task) {
        return res.status(404).json({ message: 'Không tìm thấy task' });
      }

      // Truyền thêm role vào hàm checkPermission
      const permission = await task.checkPermission(
        req.user._id,
        req.userModel || 'CompanyAccount', // Mặc định là CompanyAccount nếu không có userModel
        requiredAction,
        req.user.role
      );

      if (!permission) {
        return res.status(403).json({ 
          message: 'Bạn không có quyền thực hiện hành động này'
        });
      }

      req.taskPermission = permission;
      req.task = task;
      next();
    } catch (error) {
      console.error('Task Permission Error:', error);
      res.status(500).json({ message: error.message });
    }
  };
};
