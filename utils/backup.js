import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import mongoose from 'mongoose';
import Config from '../models/Config.js';
import cron from 'node-cron';

const backupDir = path.join(process.cwd(), 'backups');

let scheduledBackupTask = null;

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
  else return (bytes / 1073741824).toFixed(2) + ' GB';
};

export const createBackup = async (backupName) => {
  const config = await Config.findOne();
  if (!config || !config.backupConfig) {
    throw new Error('Cấu hình sao lưu không tồn tại');
  }

  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  const fileName = backupName ? `${backupName}_${timestamp}.zip` : `backup_${timestamp}.zip`;
  const backupPath = path.join(backupDir, fileName);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const dbName = process.env.DB_NAME;
    const excludeCollections = ['admins'];
    const tempDir = path.join(process.cwd(), 'temp_backup');
    const tempArchivePath = path.join(tempDir, 'dump.archive');
    const tempMetadataPath = path.join(tempDir, 'metadata.json');

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const command = `"${path.join(process.cwd(), 'tool', 'mongodump')}" --db ${dbName} ${excludeCollections.map(c => `--excludeCollection ${c}`).join(' ')} --archive="${tempArchivePath}" --gzip`;

    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Lỗi khi thực hiện mongodump: ${error.message}`);
        reject(new Error(`Lỗi khi thực hiện mongodump: ${error.message}`));
        return;
      }
      if (stderr) {
        console.error(`mongodump stderr: ${stderr}`);
      }
      console.log(`mongodump stdout: ${stdout}`);

      try {
        // Lấy thông tin số lượng bản ghi của từng model
        const metadata = await getCollectionCounts();

        // Lưu metadata vào file
        fs.writeFileSync(tempMetadataPath, JSON.stringify(metadata, null, 2));

        const zip = new AdmZip();
        zip.addLocalFile(tempArchivePath);
        zip.addLocalFile(tempMetadataPath);
        zip.writeZip(backupPath, { encryptionMethod: 'aes', password: config.backupConfig.password });

        // Xóa file tạm
        fs.unlinkSync(tempArchivePath);
        fs.unlinkSync(tempMetadataPath);
        fs.rmdirSync(tempDir, { recursive: true });

        console.log(`Sao lưu hoàn tất: ${backupPath}`);
        resolve(backupPath);
      } catch (zipError) {
        console.error(`Lỗi khi tạo file zip: ${zipError.message}`);
        reject(new Error(`Lỗi khi tạo file zip: ${zipError.message}`));
      }
    });
  });
};

export const getBackupsList = () => {
  if (!fs.existsSync(backupDir)) {
    return [];
  }

  return fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.zip'))
    .map(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: formatFileSize(stats.size),
        createdAt: stats.birthtime
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
};

export async function scheduleBackup() {
  // Hủy công việc sao lưu hiện tại nếu có
  if (scheduledBackupTask) {
    scheduledBackupTask.stop();
  }

  const config = await Config.findOne();
  if (!config || !config.backupConfig || !config.backupConfig.schedule) {
    console.error('Không tìm thấy cấu hình sao lưu');
    return;
  }

  const { frequency, dayOfWeek, time } = config.backupConfig.schedule;
  const [hour, minute] = time.split(':');

  let cronPattern;
  switch (frequency) {
    case 'daily':
      cronPattern = `${minute} ${hour} * * *`;
      break;
    case 'weekly':
      cronPattern = `${minute} ${hour} * * ${dayOfWeek}`;
      break;
    case 'monthly':
      cronPattern = `${minute} ${hour} 1 * *`;
      break;
    default:
      console.error('Tần suất sao lưu không hợp lệ');
      return;
  }

  scheduledBackupTask = cron.schedule(cronPattern, async () => {
    try {
      await createBackup();
      console.log('Sao lưu tự động đã được tạo');
    } catch (error) {
      console.error('Lỗi khi tạo sao lưu tự động:', error);
    }
  });

  console.log(`Đã lên lịch sao lưu tự động: ${cronPattern}`);
}

const getCollectionCounts = async () => {
  const collections = mongoose.connection.collections;
  const counts = {};

  for (const [name, collection] of Object.entries(collections)) {
    if (name !== 'admins') {
      counts[name] = await collection.countDocuments();
    }
  }

  return counts;
};

const analyzeBackup = async (metadataPath) => {
  let metadata = {};
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } else {
    console.warn('Không tìm thấy file metadata. Sẽ phân tích dựa trên dữ liệu hiện tại.');
  }

  const currentCounts = await getCollectionCounts();

  const analysis = {};
  for (const [collection, count] of Object.entries(currentCounts)) {
    const backupCount = metadata[collection] || 0;
    analysis[collection] = {
      inBackup: backupCount,
      current: count,
      toBeAdded: Math.max(backupCount - count, 0),
      toBeDeleted: Math.max(count - backupCount, 0)
    };
  }

  return {
    message: 'Phân tích sao lưu hoàn tất',
    analysis: analysis
  };
};

export const restoreBackup = async (backupFileName, password) => {
  const backupPath = path.join(backupDir, backupFileName);
  const tempDir = path.join(process.cwd(), 'temp_restore');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    const zip = new AdmZip(backupPath);
    zip.extractAllTo(tempDir, true, false, password);

    const metadataPath = path.join(tempDir, 'metadata.json');
    const backupData = await analyzeBackup(metadataPath);

    // Trả về thông tin phân tích mà không thực hiện khôi phục
    return backupData;
  } catch (error) {
    console.error('Lỗi khi phân tích sao lưu:', error);
    throw error;
  } finally {
    // Đảm bảo xóa thư mục tạm ngay cả khi có lỗi
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
    } catch (cleanupError) {
      console.error('Lỗi khi xóa thư mục tạm:', cleanupError);
    }
  }
};

export const performRestore = async (backupFileName, password) => {
  const backupPath = path.join(backupDir, backupFileName);
  const tempDir = path.join(process.cwd(), 'temp_restore');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const zip = new AdmZip(backupPath);
    zip.extractAllTo(tempDir, true, false, password);

    const dbName = process.env.DB_NAME;
    const archivePath = path.join(tempDir, 'dump.archive');
    const command = `"${path.join(process.cwd(), 'tool', 'mongorestore')}" --db ${dbName} --archive="${archivePath}" --gzip --drop`;

    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Lỗi khi khôi phục: ${error}`);
          reject(error);
        } else {
          console.log(`Khôi phục thành công: ${stdout}`);
          resolve(stdout);
        }
      });
    });

    await session.commitTransaction();
    return { success: true, message: 'Khôi phục sao lưu thành công' };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
    fs.rmdirSync(tempDir, { recursive: true });
  }
};

export const undoRestore = async (previousBackupFileName, password) => {
  return restoreBackup(previousBackupFileName, password);
};

export function cancelScheduledBackup() {
  if (scheduledBackupTask) {
    scheduledBackupTask.stop();
    scheduledBackupTask = null;
    console.log('Đã hủy lịch sao lưu tự động');
    return true;
  }
  return false;
}
