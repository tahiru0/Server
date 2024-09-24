import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const allowedImageExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
const allowedExcelExtensions = ['.xlsx', '.xls'];
const allowedPDFExtensions = ['.pdf'];
const maxFileSize = 5 * 1024 * 1024; // 5MB

// Tạo thư mục nếu nó không tồn tại
const createDirectory = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

const generateUniqueFilename = (dir, filename) => {
    let uniqueFilename = filename;
    let counter = 1;
    while (fs.existsSync(path.join(dir, uniqueFilename))) {
        const name = path.parse(filename).name;
        const ext = path.parse(filename).ext;
        uniqueFilename = `${name}-${counter}${ext}`;
        counter++;
    }
    return uniqueFilename;
};

const useImageUpload = (baseDirectory, customDir) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            if (!req.user || !req.user._id) {
                return cb(new Error('Người dùng chưa được xác thực'), null);
            }
            const userId = req.user._id;
            const dir = path.join('public', 'uploads', baseDirectory, customDir, userId.toString());
            createDirectory(dir);
            req.uploadDir = dir; // Lưu đường dẫn thư mục vào req để sử dụng sau
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const fileExtension = path.extname(file.originalname).toLowerCase();
            if (!allowedImageExtensions.includes(fileExtension)) {
                return cb(new Error('Loại tệp không được hỗ trợ.'));
            }
            const uniqueFilename = generateUniqueFilename(req.uploadDir, file.originalname);
            cb(null, uniqueFilename);
        }
    });

    const fileFilter = (req, file, cb) => {
        const fileExtension = path.extname(file.originalname).toLowerCase();
        if (allowedImageExtensions.includes(fileExtension)) {
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

const useExcelUpload = () => {
    const storage = multer.memoryStorage();

    const fileFilter = (req, file, cb) => {
        const fileExtension = path.extname(file.originalname).toLowerCase();
        if (allowedExcelExtensions.includes(fileExtension)) {
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

const usePDFUpload = (baseDirectory, customDir) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const userId = req.user._id;
            const dir = path.join('public', 'uploads', baseDirectory, customDir, userId.toString());
            createDirectory(dir);
            req.uploadDir = dir; // Lưu đường dẫn thư mục vào req để sử dụng sau
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const fileExtension = path.extname(file.originalname).toLowerCase();
            if (!allowedPDFExtensions.includes(fileExtension)) {
                return cb(new Error('Chỉ chấp nhận file PDF.'));
            }
            const uniqueFilename = generateUniqueFilename(req.uploadDir, file.originalname);
            cb(null, uniqueFilename);
        }
    });

    const fileFilter = (req, file, cb) => {
        const fileExtension = path.extname(file.originalname).toLowerCase();
        if (allowedPDFExtensions.includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file PDF.'), false);
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

const useRegistrationImageUpload = (baseDirectory, customDir) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const tempDir = path.join('public', 'uploads', 'temp', baseDirectory, customDir);
            createDirectory(tempDir);
            req.uploadDir = tempDir;
            cb(null, tempDir);
        },
        filename: (req, file, cb) => {
            const fileExtension = path.extname(file.originalname).toLowerCase();
            if (!allowedImageExtensions.includes(fileExtension)) {
                return cb(new Error('Loại tệp không được hỗ trợ.'));
            }
            const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExtension}`;
            cb(null, uniqueFilename);
        }
    });

    const fileFilter = (req, file, cb) => {
        const fileExtension = path.extname(file.originalname).toLowerCase();
        if (allowedImageExtensions.includes(fileExtension)) {
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

const cleanupTempFiles = async () => {
    const tempDir = path.join('public', 'uploads', 'temp');
    const maxAge = 24 * 60 * 60 * 1000; // 24 giờ

    try {
        const files = await fs.readdir(tempDir);
        for (const file of files) {
            const filePath = path.join(tempDir, file);
            const stats = await fs.stat(filePath);
            if (Date.now() - stats.mtime.getTime() > maxAge) {
                await fs.unlink(filePath);
            }
        }
    } catch (error) {
        console.error('Lỗi khi dọn dẹp tệp tạm:', error);
    }
};

// Chạy hàm này định kỳ, ví dụ mỗi 24 giờ
setInterval(cleanupTempFiles, 24 * 60 * 60 * 1000);

export { useImageUpload, useExcelUpload, usePDFUpload, useRegistrationImageUpload };

