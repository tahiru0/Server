import Notification from '../models/Notification.js';
import School from '../models/School.js';
import notificationMessages from './notificationMessages.js';

export const createOrUpdateGroupedNotification = async ({ schoolId, facultyHeadId, studentName, studentId, majorName, relativeLink }) => {
  const school = await School.findById(schoolId);
  if (!school) {
    throw new Error('Không tìm thấy trường học');
  }

  let recipient = facultyHeadId || school.admin;
  let recipientModel = facultyHeadId ? 'SchoolAccount' : 'SchoolAdmin';

  const latestNotification = await Notification.findOne({
    recipient: recipient,
    recipientModel: recipientModel,
    type: 'account',
    isRead: false,
    'relatedData.schoolId': schoolId,
    ...(majorName && { 'relatedData.majorName': majorName })
  }).sort({ createdAt: -1 });

  if (latestNotification) {
    // Cập nhật thông báo hiện có
    latestNotification.relatedData.count += 1;
    latestNotification.relatedData.latestStudentId = studentId;
    latestNotification.content = notificationMessages.account.groupedRegistration(studentName, latestNotification.relatedData.count - 1, majorName);
    latestNotification.relativeLink = relativeLink;
    latestNotification.save().catch(error => console.error('Error updating notification:', error));
  } else {
    // Tạo thông báo mới
    Notification.create({
      recipient: recipient,
      recipientModel: recipientModel,
      type: 'account',
      content: notificationMessages.account.newRegistration(studentName, majorName),
      relativeLink: relativeLink,
      relatedData: {
        schoolId,
        ...(majorName && { majorName }),
        count: 1,
        firstStudentName: studentName,
        latestStudentId: studentId
      }
    }).catch(error => console.error('Error creating notification:', error));
  }
};

export const createSurveyNotification = async ({ studentId, projectId, weeklyReportId, surveyId, relativeLink }) => {
  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error('Không tìm thấy dự án');
  }

  await Notification.create({
    recipient: studentId,
    recipientModel: 'Student',
    type: 'survey',
    content: notificationMessages.survey.newSurvey(project.title),
    relativeLink: relativeLink,
    relatedData: {
      weeklyReportId,
      surveyId
    }
  });
};
