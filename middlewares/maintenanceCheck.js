import Config from '../models/Config.js';

const maintenanceCheck = async (req, res, next) => {
  try {
    const config = await Config.findOne().lean();
    if (config && config.maintenance && config.maintenance.isActive) {
      if (req.originalUrl.startsWith('/api/admin') || req.originalUrl === '/api/auth/login/admin') {
        return next();
      }
      return res.status(503).json({ 
        error: 'Maintenance', 
        message: config.maintenance.message || 'Hệ thống đang bảo trì. Vui lòng thử lại sau.'
      });
    }
    next();
  } catch (error) {
    console.error('Lỗi khi kiểm tra chế độ bảo trì:', error);
    next(error);
  }
};

export default maintenanceCheck;
