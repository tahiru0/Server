import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
const maxFileSize = 5 * 1024 * 1024; // 5MB

// Tạo thư mục nếu nó không tồn tại
const createDirectory = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

const useUpload = (baseDirectory, customDir) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            // Sử dụng customDir đã được định nghĩa
            const dir = path.join('public/uploads', baseDirectory, customDir);
            
            // Tạo thư mục nếu nó không tồn tại
            createDirectory(dir);
            
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const fileExtension = path.extname(file.originalname).toLowerCase();
            if (!allowedExtensions.includes(fileExtension)) {
                return cb(new Error('Loại tệp không được hỗ trợ.'));
            }
            const uniqueFilename = crypto.randomBytes(16).toString('hex') + fileExtension;
            cb(null, uniqueFilename);
        }
    });

    const fileFilter = (req, file, cb) => {
        const fileExtension = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error('Loại tệp không được hỗ trợ.'), false);
        }
    };

    return multer({
        storage: storage,
        fileFilter: fileFilter,
        limits: {
            fileSize: maxFileSize
        }
    });
};

export default useUpload;
