import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { handleError } from '../utils/errorHandler.js';

const authenticate = (Model, findUserById, requiredRole) => async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);

    let user;
    if (decoded.model === 'SchoolAccount') {
      const School = mongoose.model('School');
      user = await School.findSchoolAccountById(decoded, requiredRole);
    } else {
      user = await findUserById(decoded);
    }

    if (!user) {
      console.log('User not found');
      return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' });
    }

    // Kiểm tra vai trò nếu cần
    if (requiredRole && user.role !== requiredRole) {
      console.log(`Role mismatch. Required: ${requiredRole} Actual: ${user.role}`);
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Error in authenticate middleware:', error);
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' });
  }
};

export default authenticate;
