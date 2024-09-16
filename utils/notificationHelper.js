import Notification from '../models/Notification.js';
import School from '../models/School.js';

export const createOrUpdateGroupedNotification = async ({ schoolId, studentName, studentId }) => {
  const school = await School.findById(schoolId);
  if (!school || !school.admin) {
    throw new Error('Không tìm thấy trường học hoặc admin của trường');
  }

  const latestNotification = await Notification.findOne({
    recipient: school.admin,
    recipientModel: 'SchoolAdmin',
    type: 'account',
    isRead: false,
    'relatedData.schoolId': schoolId
  }).sort({ createdAt: -1 });

  if (latestNotification) {
    // Cập nhật thông báo hiện có
    latestNotification.relatedData.count += 1;
    latestNotification.relatedData.latestStudentId = studentId;
    latestNotification.content = `Sinh viên ${studentName} và ${latestNotification.relatedData.count - 1} người khác đã đăng ký tài khoản mới cho trường của bạn.`;
    await latestNotification.save();
  } else {
    // Tạo thông báo mới
    await Notification.create({
      recipient: school.admin,
      recipientModel: 'SchoolAdmin',
      type: 'account',
      content: `Sinh viên ${studentName} đã đăng ký tài khoản mới cho trường của bạn.`,
      relatedData: {
        schoolId,
        count: 1,
        firstStudentName: studentName,
        latestStudentId: studentId
      }
    });
  }
};