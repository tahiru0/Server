import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { handleError } from '../utils/errorHandler.js';

const authenticate = (Model, findUserById, requiredRole) => async (req, res, next) => {
  console.log('Model:', Model);
  console.log('findUserById:', findUserById);
  console.log('requiredRole:', requiredRole);

  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user;
    if (decoded.model === 'Company' || decoded.model === 'School') {
      const ParentModel = mongoose.model(decoded.model);
      const parent = await ParentModel.findOne({ 'accounts._id': decoded._id });
      if (!parent) {
        return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' });
      }
      user = parent.accounts.id(decoded._id);
      user.parentId = parent._id;
    } else {
      user = await findUserById(decoded);
    }

    if (!user) {
      return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' });
    }

    if (requiredRole && user.role !== requiredRole) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này.' });
    }

    req.token = token;
    req.user = user;

    if (decoded.model === 'Company') {
      req.userModel = 'CompanyAccount';
      req.companyId = user.parentId;
    } else if (decoded.model === 'School') {
      req.userModel = 'SchoolAccount';
      req.schoolId = user.parentId;
    } else if (decoded.role === 'student') {
      req.userModel = 'Student';
    } else if (decoded.role === 'admin' && decoded.model === 'Admin') {
      req.userModel = 'Admin';
    } else {
      req.userModel = decoded.model;
    }

    // Thêm role vào req.user nếu nó không tồn tại
    if (!req.user.role && (req.userModel === 'CompanyAccount' || req.userModel === 'SchoolAccount')) {
      req.user.role = user.role;
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    const { status, message } = handleError(error);
    console.error('Error in authenticate middleware:', error);
    res.status(status).json({ message });
  }
};

export default authenticate;