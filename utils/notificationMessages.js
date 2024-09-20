const notificationMessages = {
    account: {
      newRegistration: (studentName) => `Sinh viên ${studentName} đã đăng ký tài khoản mới cho trường của bạn.`,
      groupedRegistration: (studentName, count) => `Sinh viên ${studentName} và ${count} người khác đã đăng ký tài khoản mới cho trường của bạn.`,
    },
    project: {
      openRecruitment: (projectTitle) => `Dự án "${projectTitle}" đã mở tuyển dụng`,
      closeRecruitment: (projectTitle) => `Dự án "${projectTitle}" đã đóng tuyển dụng`,
      applicationAccepted: (projectTitle) => `Bạn đã được chấp nhận vào dự án "${projectTitle}"`,
      applicationExpired: (projectTitle) => `Đơn ứng tuyển của bạn cho dự án "${projectTitle}" đã hết hạn.`,
      applicationRejected: (projectTitle) => `Đơn ứng tuyển của bạn cho dự án "${projectTitle}" đã bị từ chối.`,
      applicationRejectedAfterClose: (projectTitle) => `Dự án "${projectTitle}" đã kết thúc tuyển dụng. Rất tiếc, đơn ứng tuyển của bạn không được chọn.`,
      studentRemoved: (projectTitle) => `Bạn đã bị loại khỏi dự án "${projectTitle}".`,
      studentRemovedForOtherReason: (projectTitle, reason) => `Bạn đã bị loại khỏi dự án "${projectTitle}" vì lý do: ${reason}.`,
      mentorReplaced: (projectTitle) => `Bạn đã được thay thế bởi mentor khác trong dự án "${projectTitle}"`,
      mentorAssigned: (projectTitle) => `Bạn đã được chỉ định làm mentor cho dự án "${projectTitle}"`,
    },
    // Thêm các loại thông báo khác ở đây
  };
  
  export default notificationMessages;