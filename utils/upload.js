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

export { useImageUpload, useExcelUpload, usePDFUpload };

