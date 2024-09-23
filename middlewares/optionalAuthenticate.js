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
    if (decoded.model === 'Company' || decoded.model === 'School') {
      const ParentModel = mongoose.model(decoded.model);
      const parent = await ParentModel.findOne({ 'accounts._id': decoded._id });
      if (parent) {
        user = parent.accounts.id(decoded._id);
        user.parentId = parent._id;
      }
    } else {
      user = await Model.findById(decoded._id);
    }

    if (user) {
      req.token = token;
      req.user = user;

      if (decoded.model === 'Company') {
        req.userModel = 'CompanyAccount';
        req.companyId = user.parentId;
      } else if (decoded.model === 'School') {
        req.userModel = 'SchoolAccount';
        req.schoolId = user.parentId;
      } else if (decoded.model === 'Student') {
        req.userModel = 'Student';
      } else if (decoded.role === 'admin' && decoded.model === 'Admin') {
        req.userModel = 'Admin';
      } else {
        req.userModel = decoded.model;
      }

      if (!req.user.role && (req.userModel === 'CompanyAccount' || req.userModel === 'SchoolAccount')) {
        req.user.role = user.role;
      }
    } else {
      req.user = null;
      req.userModel = null;
    }
  } catch (error) {
    req.user = null;
    req.userModel = null;
  }

  next();
};

export default optionalAuthenticate;