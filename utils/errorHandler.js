import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lùi về thư mục gốc của dự án
const projectRoot = path.resolve(__dirname, '..');

const logErrorToFile = (error) => {
    const date = new Date();
    const logDirectory = path.join(projectRoot, 'logs');
    const logFileName = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}.log`;
    const logFilePath = path.join(logDirectory, logFileName);

    if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory);
    }

    const logMessage = `[${date.toISOString()}] Lỗi: ${error.stack || error.message || error}\n`;

    fs.appendFileSync(logFilePath, logMessage, 'utf8');
};

export const handleError = (error) => {
    console.error('Lỗi:', error);
    logErrorToFile(error);

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
  
    // Thay đổi thông báo lỗi 500 để không tiết lộ chi tiết
    return { status: 500, message: 'Đã xảy ra lỗi. Vui lòng thử lại sau.' };
};
