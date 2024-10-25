import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import AdmZip from 'adm-zip';
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
  const fileName = backupName ? `${backupName}_${timestamp}` : `backup_${timestamp}`;
  const tempDir = path.join(backupDir, fileName);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    const collections = mongoose.connection.collections;
    const metadata = {};

    for (const [name, collection] of Object.entries(collections)) {
      if (name !== 'admins') {
        const documents = await collection.find().toArray();
        fs.writeFileSync(path.join(tempDir, `${name}.json`), JSON.stringify(documents));
        metadata[name] = documents.length;
      }
    }

    fs.writeFileSync(path.join(tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    const zip = new AdmZip();
    zip.addLocalFolder(tempDir);
    const zipPath = path.join(backupDir, `${fileName}.zip`);
    zip.writeZip(zipPath, { encryptionMethod: 'aes', password: config.backupConfig.password });

    fs.rmdirSync(tempDir, { recursive: true });

    console.log(`Sao lưu hoàn tất: ${zipPath}`);
    return zipPath;
  } catch (error) {
    console.error(`Lỗi khi tạo sao lưu: ${error.message}`);
    throw error;
  }
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

    const collections = mongoose.connection.collections;

    for (const [name, collection] of Object.entries(collections)) {
      if (name !== 'admins') {
        const filePath = path.join(tempDir, `${name}.json`);
        if (fs.existsSync(filePath)) {
          const documents = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          await collection.deleteMany({});
          if (documents.length > 0) {
            await collection.insertMany(documents);
          }
        }
      }
    }

    console.log(`Khôi phục sao lưu hoàn tất: ${backupPath}`);
    return { success: true, message: 'Khôi phục sao lưu thành công' };
  } catch (error) {
    console.error('Lỗi khi khôi phục sao lưu:', error);
    throw error;
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  }
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
  // Giữ nguyên logic lên lịch sao lưu
}

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

export const analyzeBackup = async (backupFileName, password) => {
  const backupPath = path.join(backupDir, backupFileName);
  const tempDir = path.join(process.cwd(), 'temp_analyze');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const zip = new AdmZip(backupPath);
    zip.extractAllTo(tempDir, true, false, password);

    const metadataPath = path.join(tempDir, 'metadata.json');
    let metadata = {};
    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } else {
      console.warn('Không tìm thấy file metadata. Sẽ phân tích dựa trên dữ liệu hiện tại.');
    }

    const currentCounts = {};
    const collections = mongoose.connection.collections;
    for (const [name, collection] of Object.entries(collections)) {
      if (name !== 'admins') {
        currentCounts[name] = await collection.countDocuments({}, { session });
      }
    }

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

    await session.commitTransaction();
    session.endSession();

    return {
      message: 'Phân tích sao lưu hoàn tất',
      analysis: analysis
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Lỗi khi phân tích sao lưu:', error);
    throw error;
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  }
};
