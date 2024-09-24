import mongoose from 'mongoose';
import './Project.js';
import './Company.js';
import './Task.js';
import './Student.js';
import './School.js';
import './LoginHistory.js';
import { handleError } from '../utils/errorHandler.js';

const Project = mongoose.model('Project');
const Company = mongoose.model('Company');
const Task = mongoose.model('Task');
const Student = mongoose.model('Student');
const School = mongoose.model('School');
const LoginHistory = mongoose.model('LoginHistory');

function getTimeIntervals(startDate, endDate, timeUnit) {
  const intervals = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    let nextDate;
    switch (timeUnit) {
      case 'week':
        nextDate = new Date(currentDate);
        nextDate.setDate(currentDate.getDate() + 7);
        break;
      case 'month':
        nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        break;
      default: // day
        nextDate = new Date(currentDate);
        nextDate.setDate(currentDate.getDate() + 1);
    }
    intervals.push({
      start: new Date(currentDate),
      end: new Date(Math.min(nextDate, end))
    });
    currentDate = nextDate;
  }
  return intervals;
}

async function getCompanyDashboardData(companyId) {
  try {
    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Không tìm thấy công ty');
    }

    const projectStats = await Project.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId) } },
      {
        $group: {
          _id: null,
          totalProjects: { $sum: 1 },
          recruitingProjects: { $sum: { $cond: [{ $eq: ['$isRecruiting', true] }, 1, 0] } },
          ongoingProjects: { $sum: { $cond: [{ $eq: ['$projectStatus', 'Đang thực hiện'] }, 1, 0] } },
          completedProjects: { $sum: { $cond: [{ $eq: ['$projectStatus', 'Hoàn thành'] }, 1, 0] } },
          totalSelectedStudents: { $sum: { $size: '$selectedApplicants' } }
        }
      }
    ]);

    const taskStats = await Task.aggregate([
      { 
        $lookup: {
          from: 'projects',
          localField: 'project',
          foreignField: '_id',
          as: 'projectInfo'
        }
      },
      { $unwind: '$projectInfo' },
      { $match: { 'projectInfo.company': new mongoose.Types.ObjectId(companyId) } },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          pendingTasks: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          inProgressTasks: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          overdueTasks: { $sum: { $cond: [{ $eq: ['$status', 'Overdue'] }, 1, 0] } },
          avgRating: { $avg: '$rating' }
        }
      }
    ]);

    const mentorCount = company.accounts.filter(account => account.role === 'mentor').length;

    return {
      companyInfo: {
        name: company.name,
        logo: company.logo,
        mentorCount: mentorCount
      },
      projectStats: projectStats[0] || {
        totalProjects: 0,
        recruitingProjects: 0,
        ongoingProjects: 0,
        completedProjects: 0,
        totalSelectedStudents: 0
      },
      taskStats: taskStats[0] || {
        totalTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
        avgRating: 0
      }
    };
  } catch (error) {
    return handleError(error);
  }
}

async function getAdminDashboardData(startDate, endDate, timeUnit = 'day') {
  try {
    // Kiểm tra và đảm bảo timeUnit là một giá trị hợp lệ
    const validTimeUnits = ['day', 'week', 'month'];
    if (!validTimeUnits.includes(timeUnit)) {
      timeUnit = 'day'; // Mặc định là 'day' nếu giá trị không hợp lệ
    }

    // Gán giờ cho endDate
    endDate = new Date(new Date(endDate).setHours(23, 59, 59, 999));

    const companyCount = await Company.countDocuments();
    const schoolCount = await School.countDocuments();
    const studentCount = await Student.countDocuments();
    const totalProjects = await Project.countDocuments({
      createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    });


    const intervals = getTimeIntervals(startDate, endDate, timeUnit);
    const projectStats = await Promise.all(intervals.map(interval => 
      Project.aggregate([
        {
          $match: {
            createdAt: { $gte: interval.start, $lt: interval.end }
          }
        },
        {
          $group: {
            _id: null,
            totalProjects: { $sum: 1 },
            recruitingProjects: { $sum: { $cond: [{ $eq: ['$isRecruiting', true] }, 1, 0] } },
            ongoingProjects: { $sum: { $cond: [{ $eq: ['$projectStatus', 'Đang thực hiện'] }, 1, 0] } },
            completedProjects: { $sum: { $cond: [{ $eq: ['$projectStatus', 'Hoàn thành'] }, 1, 0] } },
            totalSelectedStudents: { $sum: { $size: '$selectedApplicants' } }
          }
        }
      ])
    ));

    const topCompaniesByProjects = await Project.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        }
      },
      {
        $group: {
          _id: '$company',
          projectCount: { $sum: 1 },
          recruitingProjectCount: { $sum: { $cond: [{ $eq: ['$isRecruiting', true] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: 'companies',
          localField: '_id',
          foreignField: '_id',
          as: 'companyInfo'
        }
      },
      {
        $unwind: '$companyInfo'
      },
      {
        $project: {
          companyId: '$_id',
          companyName: '$companyInfo.name',
          companyLogo: {
            $cond: {
              if: { $regexMatch: { input: '$companyInfo.logo', regex: /^http/ } },
              then: '$companyInfo.logo',
              else: { $concat: ['http://localhost:5000', '$companyInfo.logo'] }
            }
          },
          projectCount: 1,
          recruitingProjectCount: 1,
          recruitmentRate: { $divide: ['$recruitingProjectCount', '$projectCount'] }
        }
      },
      {
        $sort: { projectCount: -1, recruitmentRate: -1 }
      },
      {
        $limit: 5
      }
    ]);

    const taskStats = await Promise.all(intervals.map(interval => 
      Task.aggregate([
        {
          $match: {
            createdAt: { $gte: interval.start, $lt: interval.end }
          }
        },
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            pendingTasks: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
            inProgressTasks: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
            completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
            overdueTasks: { $sum: { $cond: [{ $eq: ['$status', 'Overdue'] }, 1, 0] } },
            avgRating: { $avg: '$rating' }
          }
        }
      ])
    ));

    const loginStats = await Promise.all(intervals.map(interval => 
      LoginHistory.aggregate([
        {
          $match: {
            loginTime: { $gte: interval.start, $lt: interval.end },
            loginStatus: 'success'
          }
        },
        {
          $group: {
            _id: null,
            totalLogins: { $sum: 1 },
            uniqueUsers: { $addToSet: '$user' }
          }
        }
      ])
    ));

    const newInternshipStats = await Promise.all(intervals.map(interval => 
      Student.aggregate([
        {
          $match: {
            internshipStartDate: { $gte: interval.start, $lt: interval.end }
          }
        },
        {
          $group: {
            _id: null,
            newInternships: { $sum: 1 }
          }
        }
      ])
    ));

    const newAccountStats = await Promise.all([
      Company.countDocuments({ createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } }),
      School.countDocuments({ createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } }),
      Student.countDocuments({ createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } })
    ]);

    const topLoginLocations = await Promise.all(intervals.map(interval => 
      LoginHistory.aggregate([
        {
          $match: {
            loginTime: { $gte: interval.start, $lt: interval.end },
            loginStatus: 'success',
            'location.city': { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: '$location.city',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ));

    return {
      timeUnit,
      timeIntervals: intervals.map((interval, i) => ({
        start: interval.start,
        end: interval.end,
        projectStats: projectStats[i][0] || {
          totalProjects: 0,
          recruitingProjects: 0,
          ongoingProjects: 0,
          completedProjects: 0,
          totalSelectedStudents: 0
        },
        taskStats: taskStats[i][0] || {
          totalTasks: 0,
          pendingTasks: 0,
          inProgressTasks: 0,
          completedTasks: 0,
          overdueTasks: 0,
          avgRating: 0
        },
        loginStats: loginStats[i][0] || { totalLogins: 0, uniqueUsers: [] },
        newInternships: newInternshipStats[i][0]?.newInternships || 0,
        newAccounts: {
          companies: newAccountStats[0],
          schools: newAccountStats[1],
          students: newAccountStats[2]
        },
        topLoginLocations: topLoginLocations[i]
      })),
      totalProjects,
      totalCompanies: companyCount,
      totalSchools: schoolCount,
      totalStudents: studentCount,
      topCompaniesByProjects
    };
  } catch (error) {
    return handleError(error);
  }
}

async function getSchoolDashboardData(schoolId) {
  try {
    const school = await School.findById(schoolId);
    if (!school) {
      throw new Error('Không tìm thấy trường');
    }

    const totalStudents = await Student.countDocuments({ school: schoolId, isDeleted: false });
    const approvedStudents = await Student.countDocuments({ school: schoolId, isApproved: true, isDeleted: false });

    const topMajors = await Student.aggregate([
      { $match: { school: new mongoose.Types.ObjectId(schoolId), isDeleted: false } },
      {
        $group: {
          _id: '$major',
          studentCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'majors',
          localField: '_id',
          foreignField: '_id',
          as: 'majorInfo'
        }
      },
      { $unwind: '$majorInfo' },
      {
        $project: {
          majorId: '$_id',
          majorName: '$majorInfo.name',
          studentCount: 1
        }
      },
      { $match: { studentCount: { $gte: 1 } } },
      { $sort: { studentCount: -1 } },
      { $limit: 3 }
    ]);

    const allMajors = await Student.aggregate([
      { $match: { school: new mongoose.Types.ObjectId(schoolId), isDeleted: false } },
      {
        $group: {
          _id: '$major',
          studentCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'majors',
          localField: '_id',
          foreignField: '_id',
          as: 'majorInfo'
        }
      },
      { $unwind: '$majorInfo' },
      {
        $project: {
          majorId: '$_id',
          majorName: '$majorInfo.name',
          studentCount: 1
        }
      },
      { $match: { studentCount: { $gte: 1 } } },
      { $sort: { studentCount: -1 } }
    ]);

    const projectParticipation = await Project.aggregate([
      { $match: { school: new mongoose.Types.ObjectId(schoolId) } },
      {
        $group: {
          _id: null,
          totalApplications: { $sum: { $size: '$applicants' } },
          totalInterns: { $sum: { $size: '$selectedApplicants' } }
        }
      }
    ]);

    return {
      schoolDetails: {
        name: school.name,
        address: school.address,
        website: school.website,
        establishedDate: school.establishedDate
      },
      studentStatistics: {
        totalStudents: totalStudents,
        approvedStudents: approvedStudents,
        topMajors: topMajors,
        allMajors: allMajors
      },
      projectParticipation: projectParticipation[0] || {
        totalApplications: 0,
        totalInterns: 0
      }
    };
  } catch (error) {
    return handleError(error);
  }
}

export { getAdminDashboardData, getCompanyDashboardData, getSchoolDashboardData };