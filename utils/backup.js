import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import AdmZip from 'adm-zip';
import Config from '../models/Config.js';
import cron from 'node-cron';
import crypto from 'crypto';

const backupDir = path.join(process.cwd(), 'backups');

let scheduledBackupTask = null;

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
  else return (bytes / 1073741824).toFixed(2) + ' GB';
};

export const encryptPassword = (password) => {
  const hash = crypto.createHash('sha256');
  hash.update(password);
  return hash.digest('hex');
};

function getFieldType(field) {
  if (field instanceof mongoose.Schema.Types.ObjectId) return 'ObjectId';
  if (field instanceof Date) return 'Date';
  if (Array.isArray(field)) return 'Array';
  return typeof field;
}

export const createBackup = async (backupName, password) => {
  ensureBackupDir();
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
        fs.writeFileSync(path.join(tempDir, `${name}.json`), JSON.stringify(documents, null, 2));
        
        // Lấy schema từ model Mongoose
        const model = mongoose.models[name];
        const schema = model ? model.schema.obj : {};

        // Tạo một bản đồ kiểu dữ liệu cho mỗi trường
        const fieldTypes = {};
        for (const [fieldName, fieldSchema] of Object.entries(schema)) {
          fieldTypes[fieldName] = getFieldType(fieldSchema.type || fieldSchema);
        }

        metadata[name] = {
          count: documents.length,
          schema: schema,
          fieldTypes: fieldTypes,
          ids: documents.map(doc => doc._id.toString())
        };
      }
    }

    fs.writeFileSync(path.join(tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    const zip = new AdmZip();
    zip.addLocalFolder(tempDir);
    const zipPath = path.join(backupDir, `${fileName}.zip`);
    const encryptedPassword = encryptPassword(password);
    zip.writeZip(zipPath, { encryptionMethod: 'aes', password: encryptedPassword });

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
    const encryptedPassword = encryptPassword(password);
    zip.extractAllTo(tempDir, true, false, encryptedPassword);

    const collections = mongoose.connection.collections;

    for (const [name, collection] of Object.entries(collections)) {
      if (name !== 'admins') {
        const filePath = path.join(tempDir, `${name}.json`);
        if (fs.existsSync(filePath)) {
          const documents = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          await collection.deleteMany({});
          if (documents.length > 0) {
            const convertedDocuments = documents.map(doc => {
              const convertedDoc = { ...doc };
              
              // Chuyển đổi _id
              if (convertedDoc._id) {
                convertedDoc._id = new mongoose.Types.ObjectId(convertedDoc._id);
              }
              
              // Chuyển đổi createdAt và updatedAt
              if (convertedDoc.createdAt) {
                convertedDoc.createdAt = new Date(convertedDoc.createdAt);
              }
              if (convertedDoc.updatedAt) {
                convertedDoc.updatedAt = new Date(convertedDoc.updatedAt);
              }
              
              return convertedDoc;
            });
            
            await collection.insertMany(convertedDocuments);
          }
        }
      }
    }

    return { message: 'Khôi phục dữ liệu thành công' };
  } catch (error) {
    console.error('Lỗi khi khôi phục dữ liệu:', error);
    if (error.message.includes('Invalid password')) {
      throw new Error('Mật khẩu không đúng');
    }
    throw error;
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  }
};

export const getBackupsList = async (page = 1, limit = 10) => {
  ensureBackupDir();
  const backupFiles = fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.zip'))
    .map(fileName => {
      const filePath = path.join(backupDir, fileName);
      const stats = fs.statSync(filePath);
      return {
        fileName,
        createdAt: stats.birthtime,
        size: formatFileSize(stats.size)
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt); // Sắp xếp theo thời gian tạo, mới nhất trước

  const totalItems = backupFiles.length;
  const totalPages = Math.ceil(totalItems / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  const backups = backupFiles.slice(startIndex, endIndex);

  return {
    backups,
    currentPage: page,
    totalPages,
    totalItems
  };
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

  try {
    const zip = new AdmZip(backupPath);
    const encryptedPassword = encryptPassword(password);
    zip.extractAllTo(tempDir, true, false, encryptedPassword);

    const metadataPath = path.join(tempDir, 'metadata.json');
    const backupMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

    const analysis = {};
    const collections = mongoose.connection.collections;

    for (const [name, collection] of Object.entries(collections)) {
      if (name === 'admins') continue;

      const backupCollectionData = backupMetadata[name];
      if (!backupCollectionData) {
        analysis[name] = { added: await collection.countDocuments() };
        continue;
      }

      const currentDocuments = await collection.find().toArray();
      const currentIds = new Set(currentDocuments.map(doc => doc._id.toString()));
      const backupIds = new Set(backupCollectionData.ids);

      const added = currentDocuments.filter(doc => !backupIds.has(doc._id.toString()));
      const removed = backupCollectionData.ids.filter(id => !currentIds.has(id));
      const modified = [];

      for (const currentDoc of currentDocuments) {
        if (backupIds.has(currentDoc._id.toString())) {
          const backupDoc = JSON.parse(fs.readFileSync(path.join(tempDir, `${name}.json`), 'utf8'))
            .find(doc => doc._id.toString() === currentDoc._id.toString());
          
          const changes = compareObjects(backupDoc, currentDoc);
          if (Object.keys(changes).length > 0) {
            modified.push({ _id: currentDoc._id, changes });
          }
        }
      }

      // Lấy schema hiện tại
      const model = mongoose.models[name];
      const currentSchema = model ? model.schema.obj : {};

      if (added.length > 0 || removed.length > 0 || modified.length > 0) {
        analysis[name] = {
          added: added.length,
          removed: removed.length,
          modified: modified.length,
          schemaChanges: compareSchemas(backupCollectionData.schema, currentSchema),
          details: {
            added: added.map(({ _id, ...rest }) => ({ _id: _id.toString(), ...rest })),
            removed,
            modified
          }
        };
      }
    }

    return analysis;
  } catch (error) {
    console.error('Lỗi khi phân tích sao lưu:', error);
    if (error.message.includes('Invalid password')) {
      throw new Error('Mật khẩu không đúng');
    }
    throw error;
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  }
};

function compareSchemas(oldSchema, newSchema) {
  const changes = {};
  for (const [key, value] of Object.entries(oldSchema)) {
    if (!newSchema[key]) {
      changes[key] = { action: 'removed', oldType: value.type ? value.type.name : typeof value };
    } else if (JSON.stringify(value) !== JSON.stringify(newSchema[key])) {
      changes[key] = {
        action: 'modified',
        oldType: value.type ? value.type.name : typeof value,
        newType: newSchema[key].type ? newSchema[key].type.name : typeof newSchema[key]
      };
    }
  }
  for (const [key, value] of Object.entries(newSchema)) {
    if (!oldSchema[key]) {
      changes[key] = { action: 'added', newType: value.type ? value.type.name : typeof value };
    }
  }
  return changes;
}

function compareObjects(obj1, obj2) {
  const changes = {};
  for (const key in obj1) {
    if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
      changes[key] = {
        old: obj1[key],
        new: obj2[key]
      };
    }
  }
  for (const key in obj2) {
    if (!(key in obj1)) {
      changes[key] = {
        old: undefined,
        new: obj2[key]
      };
    }
  }
  return changes;
}

export const getBackupConfig = async () => {
  const config = await Config.findOne();
  if (!config || !config.backupConfig) {
    return null;
  }
  // Tạo một bản sao của backupConfig và loại bỏ trường password
  const { password, ...safeBackupConfig } = config.backupConfig.toObject();
  return safeBackupConfig;
};

export const ensureBackupDir = () => {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
};
