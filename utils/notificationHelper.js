import Notification from '../models/Notification.js';
import School from '../models/School.js';
import notificationMessages from './notificationMessages.js';

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
    latestNotification.content = notificationMessages.account.groupedRegistration(studentName, latestNotification.relatedData.count - 1);
    latestNotification.save().catch(error => console.error('Error updating notification:', error));
  } else {
    // Tạo thông báo mới
    Notification.create({
      recipient: school.admin,
      recipientModel: 'SchoolAdmin',
      type: 'account',
      content: notificationMessages.account.newRegistration(studentName),
      relatedData: {
        schoolId,
        count: 1,
        firstStudentName: studentName,
        latestStudentId: studentId
      }
    }).catch(error => console.error('Error creating notification:', error));
  }
};