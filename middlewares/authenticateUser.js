const jwt = require('jsonwebtoken');
const User = require('../models/user');
require('dotenv-safe').config();

// Base authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded._id, isDelete: false, isActive: true });

    if (!user) {
      throw new Error();
    }

    req.token = token;
    req.user = user;
    next();
  } catch (error) {
    res.status(401).send({ error: 'Please authenticate as user' });
  }
};

// Role-specific middleware functions
const authenticateStudent = async (req, res, next) => {
  await authenticateUser(req, res, () => {
    if (req.user.role !== 'Student') {
      return res.status(403).send({ error: 'Access denied. Student role required.' });
    }
    next();
  });
};

const authenticateInstructor = async (req, res, next) => {
  await authenticateUser(req, res, () => {
    if (req.user.role !== 'Instructor') {
      return res.status(403).send({ error: 'Access denied. Instructor role required.' });
    }
    next();
  });
};

const authenticateSchool = async (req, res, next) => {
  await authenticateUser(req, res, () => {
    if (req.user.role !== 'School') {
      return res.status(403).send({ error: 'Access denied. School role required.' });
    }
    next();
  });
};

const authenticateCompany = async (req, res, next) => {
  await authenticateUser(req, res, () => {
    if (req.user.role !== 'Company') {
      return res.status(403).send({ error: 'Access denied. Company role required.' });
    }
    next();
  });
};

export default {
  authenticateUser,
  authenticateStudent,
  authenticateInstructor,
  authenticateSchool,
  authenticateCompany
};