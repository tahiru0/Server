import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Config from '../models/Config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lùi về thư mục gốc của dự án
const projectRoot = path.resolve(__dirname, '..');

const logErrorToFile = (error) => {
    try {
        const date = new Date().toISOString().split('T')[0];
        const logDir = path.join(__dirname, '..', 'logs');
        const logFile = path.join(logDir, `${date}.log`);

        // Tạo thư mục logs nếu chưa tồn tại
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        // Thử ghi log
        fs.appendFileSync(logFile, 
            `${new Date().toISOString()} - ${error.stack || error.message}\n`
        );
    } catch (err) {
        // Nếu không ghi được log thì in ra console
        console.error('Error writing to log file:', err);
    }
};

export const handleError = (error) => {
    try {
        logErrorToFile(error);
    } catch (err) {
        console.error('Error handling error:', err);
    }

    console.error('Lỗi:', error);

    if (error.status === 400) {
        return { status: 400, message: error.message };
    }

    if (error.message.includes('Cast to ObjectId failed')) {
        const match = error.message.match(/path "(\w+)"/);
        const field = match ? match[1] : 'Trường';
        return { status: 400, message: `${field} không hợp lệ.` };
    }

    if (error.name === 'CastError' && error.kind === 'ObjectId') {
        return { status: 400, message: 'Id không hợp lệ' };
    }
    
    if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        return { status: 400, message: `${field} đã tồn tại trong hệ thống.` };
    }

    if (error.code === 'ENOENT') {
        return { status: 404, message: 'Tệp hoặc thư mục không tồn tại.' };
    }
  
    if (error.name === 'JsonWebTokenError') {
        return { status: 401, message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' };
    }
  
    if (error.status === 429) {
        return { status: 429, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' };
    }
  
    if (error.message.includes('không được để trống') ||
        error.message.includes('không hợp lệ')) {
        return { status: 400, message: error.message };
    }
  
    if (error.message === 'Thông tin đăng nhập không chính xác.' ||
        error.message === 'Trường không tồn tại.') {
        return { status: 401, message: error.message };
    }
  
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => {
            // Loại bỏ tên trường và dấu hai chấm từ thông báo lỗi
            return err.message.replace(/^[^:]+:\s*/, '');
        });
        return { status: 400, message: messages.join('. ') };
    }
  
    if (error.status === 503) {
        return { status: 503, message: 'Hệ thống đang bảo trì. Vui lòng thử lại sau.' };
    }
  
    // Thay đổi thông báo lỗi 500 để không tiết lộ chi tiết
    return { status: 500, message: 'Đã xảy ra lỗi. Vui lòng thử lại sau.' };
};

export const getErrorStats = () => {
  const logDirectory = path.join(projectRoot, 'logs');
  const today = new Date();
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const errorStats = {
    total: 0,
    byDate: {},
    byType: {}
  };

  fs.readdirSync(logDirectory).forEach(file => {
    const filePath = path.join(logDirectory, file);
    const fileDate = new Date(file.split('.')[0]);

    if (fileDate >= lastWeek && fileDate <= today) {
      const content = fs.readFileSync(filePath, 'utf8');
      const errors = content.split('\n').filter(line => line.trim() !== '');

      errors.forEach(error => {
        errorStats.total++;

        const dateStr = error.match(/\[(.*?)\]/)[1].split('T')[0];
        errorStats.byDate[dateStr] = (errorStats.byDate[dateStr] || 0) + 1;

        const errorType = error.includes('Lỗi:') ? error.split('Lỗi:')[1].trim().split(':')[0] : 'Unknown';
        errorStats.byType[errorType] = (errorStats.byType[errorType] || 0) + 1;
      });
    }
  });

  return errorStats;
};

