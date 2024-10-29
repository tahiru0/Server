import authenticate from '../middlewares/authenticate.js';
import School from '../models/School.js';
import Company from '../models/Company.js';
import Student from '../models/Student.js';
import Admin from '../models/Admin.js';

export const authenticateAdmin = authenticate(Admin, Admin.findById, 'admin');

export const authenticateCompanyAdmin = authenticate(Company, Company.findCompanyAccountById, 'admin');

export const authenticateSchoolAdmin = authenticate(School, School.findSchoolAccountById, 'admin');

export const authenticateStudent = authenticate(Student, Student.findStudentById);

export const authenticateMentor = authenticate(Company, Company.findCompanyAccountById, 'mentor');

export const authenticateSchoolFaculty = authenticate(School, School.findSchoolAccountById, 'faculty-head');

export const authenticateCompanySubAdmin = authenticate(Company, Company.findCompanyAccountById, 'sub-admin');

export const authenticateSchoolSubAdmin = authenticate(School, School.findSchoolAccountById, 'sub-admin');

export const authenticateDepartmentHead = authenticate(School, School.findSchoolAccountById, 'department-head');

export const authenticateAnyCompanyRole = authenticate(Company, Company.findCompanyAccountById);

export const authenticateAnySchoolRole = authenticate(School, School.findSchoolAccountById);

export const authenticateAnyRole = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  authenticate()(req, res, next);
};

export const authenticateSchoolFacultyHead = authenticate(School, (decoded) => School.findSchoolAccountById(decoded, 'faculty-head'));
