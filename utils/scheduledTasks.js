import cron from 'node-cron';
import Project from '../models/Project.js';

export const scheduleRecruitmentStatusCheck = () => {
  cron.schedule('0 0 * * *', async () => { // Chạy hàng ngày lúc 00:00
    try {
      const projects = await Project.find({ isRecruiting: true });
      for (let project of projects) {
        if (project.checkRecruitmentStatus()) {
          await project.save();
          console.log(`Đã đóng tuyển dụng cho dự án: ${project._id}`);
        }
      }
    } catch (error) {
      console.error('Lỗi khi kiểm tra trạng thái tuyển dụng:', error);
    }
  });
};
