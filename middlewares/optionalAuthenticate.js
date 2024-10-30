import jwt from 'jsonwebtoken';
import { handleError } from '../utils/errorHandler.js';

const optionalAuthenticate = () => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);

    // Đảm bảo gán đầy đủ thông tin từ decoded token vào req.user
    req.user = {
      _id: decoded._id,
      model: decoded.model,        // Thêm model
      role: decoded.role,         // Thêm role
      companyId: decoded.companyId // Thêm companyId nếu cần
    };

    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

export default optionalAuthenticate;
