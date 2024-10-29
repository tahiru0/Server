import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const optionalAuthenticate = (Model) => async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    req.user = null;
    req.userModel = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user;
    // Sửa điều kiện kiểm tra cho CompanyAccount
    if (decoded.model === 'CompanyAccount') {
      const Company = mongoose.model('Company');
      const company = await Company.findById(decoded.companyId);
      if (company) {
        user = company.accounts.id(decoded._id);
        if (user) {
          user.parentId = company._id;
          user.role = decoded.role; // Gán role từ token
        }
      }
    } else if (decoded.model === 'School') {
      const School = mongoose.model('School');
      const school = await School.findOne({ 'accounts._id': decoded._id });
      if (school) {
        user = school.accounts.id(decoded._id);
        user.parentId = school._id;
      }
    } else {
      user = await Model.findById(decoded._id);
    }

    if (user) {
      req.token = token;
      req.user = user;
      req.userModel = decoded.model;
      
      if (decoded.model === 'CompanyAccount') {
        req.companyId = decoded.companyId;
      }
    } else {
      req.user = null;
      req.userModel = null;
    }
  } catch (error) {
    console.error('Auth Error:', error);
    req.user = null;
    req.userModel = null;
  }

  next();
};

export default optionalAuthenticate;
