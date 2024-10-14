const notificationMessages = {
  account: {
      newRegistration: (studentName) => `**Chào mừng ${studentName}** đã gia nhập đại gia đình của chúng ta! Hãy cùng nhau tạo nên những điều tuyệt vời nhé!`,
      groupedRegistration: (studentName, count) => `**${studentName}** và **${count}** tân binh khác vừa nhập hội. Cộng đồng của chúng ta đang lớn mạnh từng ngày!`,
      passwordChanged: () => `Mật khẩu của bạn đã được thay đổi thành công.`,
      newDeviceLogin: () => `Đăng nhập từ thiết bị mới được phát hiện. Nếu không phải bạn, hãy thay đổi mật khẩu ngay lập tức.`,
      newLogin: (deviceInfo) => `Đăng nhập mới từ thiết bị **${deviceInfo.browser}** trên **${deviceInfo.os}**.`,
  },
  project: {
      openRecruitment: (projectTitle) => `**Dự án "${projectTitle}"** đã được mở tuyển dụng thành công. Hãy chuẩn bị đón nhận những ứng viên tài năng!`,
      closeRecruitment: (projectTitle) => `**Quá trình tuyển dụng cho dự án "${projectTitle}"** đã kết thúc. Hãy xem xét các ứng viên và lựa chọn những người phù hợp nhất.`,
      applicationAccepted: (projectTitle) => `**Chúc mừng!** Bạn đã trở thành một mảnh ghép quan trọng của dự án **"${projectTitle}"**. Hãy cùng nhau tạo nên điều kỳ diệu!`,
      applicationExpired: (projectTitle) => `Rất tiếc! Đơn ứng tuyển của bạn cho dự án **"${projectTitle}"** đã hết hạn. Hãy nhanh chóng tìm kiếm cơ hội khác nhé!`,
      applicationRejected: (projectTitle) => `Ôi không! Đơn ứng tuyển của bạn cho dự án **"${projectTitle}"** đã bị từ chối. Đừng nản lòng, cơ hội khác đang chờ bạn!`,
      applicationRemoved: (projectTitle, reason) => `Đơn ứng tuyển của bạn cho dự án **"${projectTitle}"** đã bị xóa. Lý do: **${reason}**. Hãy tiếp tục cố gắng và không ngừng nỗ lực!`,
      applicationRejectedAfterClose: (projectTitle) => `**Dự án "${projectTitle}"** đã kết thúc tuyển dụng. Mặc dù lần này chưa thành công, nhưng chúng tôi tin rằng bạn sẽ tìm được một dự án phù hợp hơn!`,
      studentRemoved: (projectTitle) => `**Bạn đã rời khỏi dự án "${projectTitle}".** Hãy xem đây là một bài học quý giá cho hành trình sắp tới!`,
      studentRemovedForOtherReason: (projectTitle, reason) => `**Bạn đã phải tạm biệt dự án "${projectTitle}" vì lý do: ${reason}.** Đừng để điều này làm bạn nản lòng, hãy coi đây là cơ hội để học hỏi và phát triển!`,
      mentorReplaced: (projectTitle) => `**Một chương mới đã mở ra!** Bạn vừa được thay thế bởi một mentor khác trong dự án **"${projectTitle}".** Hãy chuyển giao kiến thức và kinh nghiệm của bạn để đảm bảo sự thành công của dự án nhé!`,
      mentorAssigned: (projectTitle) => `**Chúc mừng!** Bạn vừa trở thành người dẫn dắt cho dự án **"${projectTitle}".** Hãy sử dụng kinh nghiệm và tâm huyết của mình để dẫn dắt đội ngũ đến thành công!`,
      newApplicant: (projectTitle) => `**Tin vui!** Một tài năng mới vừa ứng tuyển vào dự án **"${projectTitle}".** Hãy cùng khám phá tiềm năng của họ nào!`,
      applicationSubmitted: (projectTitle) => `**Tuyệt vời!** Bạn vừa đặt một bước chân vào cuộc phiêu lưu mới với dự án **"${projectTitle}".** Hãy giữ vững tinh thần và chờ đợi tin vui nhé!`,
      notRecruiting: (projectTitle) => `**Rất tiếc,** dự án **"${projectTitle}"** hiện đang tạm ngưng tuyển dụng. Đừng lo lắng, hãy theo dõi để không bỏ lỡ cơ hội trong tương lai nhé!`,
      projectUpdated: (projectTitle) => `**Dự án "${projectTitle}"** vừa có cập nhật mới.`,
  },
  task: {
      overdue: (taskName) => `**Task "${taskName}"** đã quá hạn. Hãy hoàn thành nó sớm nhất có thể!`,
      assigned: (taskName, projectTitle) => `**Bạn đã được giao task "${taskName}" trong dự án "${projectTitle}".**`,
      newTaskForMentor: (taskName, projectTitle) => `**Bạn đã tạo thành công task "${taskName}" cho dự án "${projectTitle}".** Hãy theo dõi tiến độ và hỗ trợ nhóm hoàn thành xuất sắc nhiệm vụ này!`,
      rated: (taskName, rating) => {
          if (rating >= 9) {
              return `**Xuất sắc!** Task **"${taskName}"** của bạn đã được đánh giá với số điểm **${rating}/10**. Bạn thực sự là một ngôi sao sáng!`;
          } else if (rating >= 7) {
              return `**Tuyệt vời!** Task **"${taskName}"** của bạn đã nhận được **${rating}/10** điểm. Hãy tiếp tục phát huy nhé!`;
          } else if (rating >= 5) {
              return `**Không tồi!** Task **"${taskName}"** của bạn đã đạt **${rating}/10** điểm. Còn nhiều cơ hội để cải thiện đấy!`;
          } else {
              return `**Task "${taskName}"** của bạn đã được đánh giá **${rating}/10** điểm. Đừng nản lòng, hãy xem đây là cơ hội để học hỏi và tiến bộ!`;
          }
      },
      submitted: (taskName) => `**Tuyệt vời!** Bạn đã nộp task "${taskName}". Hãy chờ đợi phản hồi từ mentor nhé!`,
      evaluated: (taskName) => `**Chú ý!** Task "${taskName}" của bạn đã được đánh giá. Hãy xem ngay để biết kết quả và nhận xét từ mentor!`,
      statusUpdated: (taskName, newStatus) => `Trạng thái của task "${taskName}" đã được cập nhật thành **${newStatus}**.`,
      deadlineApproaching: (taskName, daysLeft) => `**Nhắc nhở:** Chỉ còn ${daysLeft} ngày nữa là đến hạn nộp task "${taskName}". Hãy hoàn thành sớm nhé!`,
      cannotSubmit: (taskName) => `**Rất tiếc!** Bạn không thể nộp task "${taskName}" vì đã quá hạn hoặc task đã được đánh giá.`,
  },
  // Thêm các loại thông báo khác ở đây
};

export default notificationMessages;