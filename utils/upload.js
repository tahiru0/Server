import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';
import School from '../models/School.js';
import Major from '../models/Major.js';

const allowedImageExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
const allowedExcelExtensions = ['.xlsx', '.xls'];
const allowedPDFExtensions = ['.pdf'];
const maxFileSize = 5 * 1024 * 1024; // 5MB
const allowedCompressedExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz'];
const maxCompressedFileSize = 50 * 1024 * 1024; // 50MB cho file nén

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


const useCompressedFileUpload = (baseDirectory, customDir, maxSize, allowedExtensions) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            if (!req.user || !req.user._id) {
                return cb(new Error('Người dùng chưa được xác thực'), null);
            }
            const dir = path.join('public', 'uploads', baseDirectory);
            createDirectory(dir);
            req.uploadDir = dir;
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const uniqueFilename = generateUniqueFilename(req.uploadDir, file.originalname);
            cb(null, uniqueFilename);
        }
    });

    const fileFilter = (req, file, cb) => {
        const fileExtension = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error('Loại file không được hỗ trợ.'), false);
        }
    };

    return multer({
        storage: storage,
        fileFilter: fileFilter,
        limits: {
            fileSize: maxSize * 1024 * 1024 // Convert MB to bytes
        }
    });
};

// Thêm middleware xử lý lỗi
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'Kích thước tệp vượt quá giới hạn 5MB.' });
        }
        return res.status(400).json({ message: 'Lỗi khi tải lên tệp.' });
    } else if (err) {
        return res.status(400).json({ message: err.message });
    }
    next();
};

export const handleExcelUpload = async (file, Model, fieldMapping, schoolId) => {
  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  // Xử lý tất cả các ngành học trước, không sử dụng transaction
  const uniqueMajors = [...new Set(data.map(row => row[fieldMapping.major]))];
  for (const majorName of uniqueMajors) {
    if (majorName) {
      try {
        await Major.findOneAndUpdate(
          { name: majorName },
          { name: majorName },
          { upsert: true, new: true, runValidators: true }
        );
        console.log(`Đã xử lý ngành học: ${majorName}`);
      } catch (error) {
        console.error('Lỗi khi xử lý ngành học:', error);
      }
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const successfulUploads = [];
    const failedUploads = [];

    for (const row of data) {
      const mappedData = { school: schoolId };
      const errorMessages = {};

      for (const [modelField, excelField] of Object.entries(fieldMapping)) {
        if (row[excelField] !== undefined && row[excelField] !== null) {
            if (modelField === 'major') {
                try {
                  const major = await Major.findOneAndUpdate(
                    { name: row[excelField] },
                    { name: row[excelField] },
                    { upsert: true, new: true, runValidators: true }
                  );
                  mappedData[modelField] = major._id;
                } catch (error) {
                  console.error('Lỗi khi xử lý ngành học cho sinh viên:', error);
                  errorMessages.major = error.message || 'Lỗi không xác định khi xử lý ngành học';
                }
            } else if (modelField === 'dateOfBirth') {
            // Xử lý ngày sinh
            const dateValue = row[excelField];
            if (dateValue) {
              let parsedDate;
              if (typeof dateValue === 'number') {
                parsedDate = new Date((dateValue - 25569) * 86400 * 1000);
              } else if (typeof dateValue === 'string') {
                const parts = dateValue.split('/');
                if (parts.length === 3) {
                  parsedDate = new Date(parts[2], parts[1] - 1, parts[0]);
                } else {
                  parsedDate = new Date(dateValue);
                }
              }
              if (!isNaN(parsedDate.getTime())) {
                mappedData[modelField] = parsedDate;
              } else {
                errorMessages.dateOfBirth = 'Ngày sinh không hợp lệ';
              }
            }
          } else {
            mappedData[modelField] = row[excelField];
          }
        }
      }

      if (Object.keys(errorMessages).length > 0) {
        failedUploads.push({ row: row, mappedData: mappedData, errors: errorMessages });
      } else {
        try {
          mappedData._id = new mongoose.Types.ObjectId();
          const newDoc = new Model(mappedData);
          await newDoc.validate();
          const savedDoc = await newDoc.save({ session });
          
          console.log('Sinh viên đã được lưu thành công:', savedDoc);
          successfulUploads.push(savedDoc);
        } catch (error) {
          const errorDetails = {};
          if (error.name === 'ValidationError') {
            for (let field in error.errors) {
              errorDetails[field] = error.errors[field].message;
            }
          } else if (error.code === 11000) {
            errorDetails.general = 'Dữ liệu bị trùng lặp (có thể là email hoặc mã số sinh viên)';
          } else {
            errorDetails.general = error.message;
          }
          failedUploads.push({ row: row, mappedData: mappedData, errors: errorDetails });
        }
      }
    }

    const totalRecords = data.length;
    const successCount = successfulUploads.length;
    const failCount = failedUploads.length;

    const result = {
      success: successCount > 0,
      message: `Đã xử lý ${totalRecords} bản ghi. ${successCount} thành công, ${failCount} thất bại.`,
      data: successfulUploads,
      errors: failedUploads,
      totalRecords,
      successCount,
      failCount
    };

    if (failCount > 0) {
      console.log('Có lỗi xảy ra với một số bản ghi');
      console.log('Lỗi chi tiết:', failedUploads);
    } else {
      console.log('Tất cả bản ghi đã được xử lý thành công');
    }
    console.log('Số lượng sinh viên đã tạo:', successfulUploads.length);
    await session.commitTransaction();

    return result;
  } catch (error) {
    console.log('Có lỗi xảy ra, hủy bỏ transaction');
    console.log('Lỗi chi tiết:', failedUploads);
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export { useImageUpload, useExcelUpload, usePDFUpload, useRegistrationImageUpload, handleUploadError, useCompressedFileUpload };
