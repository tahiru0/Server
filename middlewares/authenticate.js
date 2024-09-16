import jwt from 'jsonwebtoken';
import { handleError } from '../utils/errorHandler.js';

const authenticate = (Model, findUserById, requiredRole) => async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await findUserById(decoded);

    if (!user) {
      return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' });
    }

    // Kiểm tra role nếu được yêu cầu
    if (requiredRole && user.role !== requiredRole) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này.' });
    }

    // Kiểm tra trạng thái xác nhận chỉ cho model Student
    if (Model.modelName === 'Student' && !user.isApproved) {
      return res.status(403).json({ message: 'Tài khoản chưa được xác nhận. Vui lòng chờ nhà trường xác nhận.' });
    }

    req.token = token;
    req.user = user;
    
    // Chỉ thêm companyId vào req nếu nó tồn tại trong user
    if (user.companyId) {
      req.companyId = user.companyId;
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    const { status, message } = handleError(error);
    res.status(status).json({ message });
  }
};

export default authenticate;