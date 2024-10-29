import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import AdmZip from 'adm-zip';
import Config from '../models/Config.js';
import cron from 'node-cron';
import crypto from 'crypto';
import { BSON } from 'bson';

const backupDir = path.join(process.cwd(), 'backups');

let scheduledBackupTask = null;

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
  else return (bytes / 1073741824).toFixed(2) + ' GB';
};

export const encryptPassword = (password) => {
  if (!password) {
    throw new Error('Mật khẩu không được để trống');
  }
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

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

function encryptFile(inputBuffer, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  return Buffer.concat([salt, iv, encrypted]);
}

function decryptFile(encryptedBuffer, password) {
  const salt = encryptedBuffer.slice(0, 16);
  const iv = encryptedBuffer.slice(16, 32);
  const encrypted = encryptedBuffer.slice(32);
  const key = crypto.scryptSync(password, salt, 32);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export const createBackup = async (backupName, password) => {
  ensureBackupDir();
  let config = await Config.findOne();
  if (!config || !config.backup) {
    // Khởi tạo cấu hình nếu chưa tồn tại
    config = await initializeBackupConfig(config, password);
  }

  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  const fileName = backupName ? `${backupName}_${timestamp}` : `backup_${timestamp}`;
  const backupPath = path.join(backupDir, `${fileName}.bson`);

  const collections = await mongoose.connection.db.listCollections().toArray();
  const backupData = {};

  for (const collection of collections) {
    const documents = await mongoose.connection.db.collection(collection.name).find({}).toArray();
    backupData[collection.name] = documents;
  }

  const bsonData = BSON.serialize(backupData);
  const encryptedData = encryptFile(bsonData, password);

  await fs.promises.writeFile(backupPath, encryptedData);

  console.log('Bản sao lưu đã được tạo thành công');
  return backupPath;
};

async function initializeBackupConfig(config, password) {
  const backupConfig = {
    isAutoBackup: false,
    schedule: {
      frequency: 'weekly',
      dayOfWeek: 0,
      time: '00:00'
    },
    password: encryptPassword(password),
    retentionPeriod: 30
  };

  if (!config) {
    config = new Config({ backup: backupConfig });
  } else {
    config.backup = backupConfig;
  }

  await config.save();
  return config;
}

const validateAndConvertData = (document, schema, paths) => {
  const convertedDoc = {};
  for (const [key, value] of Object.entries(document)) {
    if (paths[key]) {
      const schemaType = paths[key].instance;
      switch (schemaType) {
        case 'ObjectID':
          convertedDoc[key] = new mongoose.Types.ObjectId(value);
          break;
        case 'Date':
          convertedDoc[key] = new Date(value);
          break;
        case 'Number':
          convertedDoc[key] = Number(value);
          break;
        case 'Boolean':
          convertedDoc[key] = Boolean(value);
          break;
        case 'Array':
          if (Array.isArray(value)) {
            convertedDoc[key] = value.map(item => {
              if (paths[key].caster) {
                return validateAndConvertData({ item }, { item: paths[key].caster }, { item: paths[key].caster }).item;
              }
              return item;
            });
          } else {
            console.warn(`Trường ${key} được mong đợi là một mảng nhưng nhận được:`, value);
            convertedDoc[key] = [];
          }
          break;
        default:
          convertedDoc[key] = value;
      }
    } else if (schema.nested[key]) {
      if (Array.isArray(value)) {
        convertedDoc[key] = value.map(item => validateAndConvertData(item, schema.nested[key], paths[key] || {}));
      } else if (typeof value === 'object' && value !== null) {
        convertedDoc[key] = validateAndConvertData(value, schema.nested[key], paths[key] || {});
      } else {
        console.warn(`Trường lồng ${key} được mong đợi là một đối tượng nhưng nhận được:`, value);
        convertedDoc[key] = {};
      }
    } else {
      convertedDoc[key] = value;
    }
  }
  return convertedDoc;
};

export const restoreBackup = async (backupFileName, password) => {
  const backupPath = path.join(backupDir, backupFileName);
  if (!fs.existsSync(backupPath)) {
    throw new Error('Không tìm thấy file sao lưu');
  }

  const encryptedData = fs.readFileSync(backupPath);
  let decryptedData;
  try {
    decryptedData = decryptFile(encryptedData, password);
  } catch (error) {
    throw new Error('Mật khẩu không đúng hoặc file sao lưu bị hỏng');
  }

  const backupData = BSON.deserialize(decryptedData);

  for (const [collectionName, documents] of Object.entries(backupData)) {
    let model;
    try {
      model = mongoose.model(collectionName);
    } catch (error) {
      // Nếu model chưa được đăng ký, tạo một schema tạm thời
      const tempSchema = new mongoose.Schema({}, { strict: false });
      model = mongoose.model(collectionName, tempSchema);
    }
    await model.deleteMany({});
    await model.insertMany(documents);
  }

  // Cập nhật thông tin khôi phục trong Config
  const config = await Config.findOne();
  if (config) {
    config.lastRestore = {
      backupFileName,
      password: encryptPassword(password),
      timestamp: new Date()
    };
    await config.save();
  }

  console.log('Khôi phục dữ liệu thành công');
};

export const getBackupsList = async (page = 1, limit = 10) => {
  ensureBackupDir();
  const backupFiles = fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.zip') || file.endsWith('.bson'))
    .map(fileName => {
      const filePath = path.join(backupDir, fileName);
      const stats = fs.statSync(filePath);
      return {
        fileName,
        createdAt: stats.birthtime,
        size: formatFileSize(stats.size)
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

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
  try {
    const config = await Config.findOne();
    if (!config || !config.backup) {
      console.log('Không tìm thấy cấu hình sao lưu');
      return;
    }

    const { isAutoBackup, schedule, password } = config.backup;
    if (!isAutoBackup) {
      if (scheduledBackupTask) {
        scheduledBackupTask.stop();
        scheduledBackupTask = null;
      }
      console.log('Tự động sao lưu đã bị tắt');
      return;
    }

    const { frequency, dayOfWeek, time } = schedule;
    const [hour, minute] = time.split(':');

    let cronExpression;
    switch (frequency) {
      case 'daily':
        cronExpression = `${minute} ${hour} * * *`;
        break;
      case 'weekly':
        cronExpression = `${minute} ${hour} * * ${dayOfWeek}`;
        break;
      case 'monthly':
        cronExpression = `${minute} ${hour} 1 * *`;
        break;
      default:
        throw new Error('Tần suất sao lưu không hợp lệ');
    }

    if (scheduledBackupTask) {
      scheduledBackupTask.stop();
    }

    scheduledBackupTask = cron.schedule(cronExpression, async () => {
      try {
        const backupName = `scheduled_backup`;
        const backupPath = await createBackup(backupName, password);
        console.log(`Sao lưu tự động hoàn tất: ${backupPath}`);

        // Xóa các bản sao lưu cũ
        await deleteOldBackups(config.backup.retentionPeriod);
      } catch (error) {
        console.error('Lỗi khi thực hiện sao lưu tự động:', error);
      }
    });

    console.log(`Đã lên lịch sao lưu tự động: ${cronExpression}`);
  } catch (error) {
    console.error('Lỗi khi lên lịch sao lưu:', error);
  }
}

async function deleteOldBackups(retentionPeriod) {
  const backupFiles = fs.readdirSync(backupDir).filter(file => file.endsWith('.zip') || file.endsWith('.bson'));
  const now = new Date();

  for (const file of backupFiles) {
    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    const fileAge = (now - stats.mtime) / (1000 * 60 * 60 * 24); // Tuổi file tính bằng ngày

    if (fileAge > retentionPeriod) {
      fs.unlinkSync(filePath);
      console.log(`Đã xóa bản sao lưu cũ: ${file}`);
    }
  }
}

// Thêm hàm này để khởi động lại lịch sao lưu khi server khởi động
export async function initializeBackupSchedule() {
  await scheduleBackup();
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

// Thêm hàm này vào đầu file hoặc trước hàm analyzeBackup

function createSchemaFromData(data) {
  const schema = {};
  for (const [key, value] of Object.entries(data)) {
    schema[key] = getDetailedFieldType(value);
  }
  return schema;
}

function getDetailedFieldType(field) {
  if (field instanceof mongoose.Types.ObjectId) return { type: 'ObjectId' };
  if (field instanceof Date) return { type: 'Date' };
  if (Array.isArray(field)) {
    return { type: 'Array', items: field.length > 0 ? getDetailedFieldType(field[0]) : { type: 'Mixed' } };
  }
  if (typeof field === 'object' && field !== null) {
    return { type: 'Object', properties: createSchemaFromData(field) };
  }
  return { type: typeof field };
}

function compareSchemas(backupSchema, currentSchema) {
  const changes = {};
  const allKeys = new Set([...Object.keys(backupSchema), ...Object.keys(currentSchema)]);

  for (const key of allKeys) {
    if (!currentSchema.hasOwnProperty(key)) {
      changes[key] = { action: 'removed', oldType: getSchemaTypeString(backupSchema[key]) };
    } else if (!backupSchema.hasOwnProperty(key)) {
      changes[key] = { action: 'added', newType: getSchemaTypeString(currentSchema[key]) };
    } else if (!isEqual(backupSchema[key], currentSchema[key])) {
      changes[key] = {
        action: 'modified',
        oldType: getSchemaTypeString(backupSchema[key]),
        newType: getSchemaTypeString(currentSchema[key])
      };
    }
  }

  return changes;
}

function getSchemaTypeString(field) {
  if (!field) return 'undefined';
  if (typeof field === 'string') return field;
  if (field.type) return field.type.name || field.type;
  if (Array.isArray(field)) return 'Array';
  return typeof field;
}

function isEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

export const analyzeBackup = async (backupFileName, password) => {
  const backupPath = path.join(backupDir, backupFileName);

  try {
    const encryptedData = fs.readFileSync(backupPath);

    let decryptedData;
    try {
      decryptedData = decryptFile(encryptedData, password);
    } catch (error) {
      throw new Error('Mật khẩu không đúng hoặc file sao lưu bị hỏng');
    }

    const backupData = BSON.deserialize(decryptedData);

    const analysis = {};
    const collections = mongoose.connection.collections;

    for (const [name, collection] of Object.entries(collections)) {
      if (name === 'admins') continue;

      const backupCollectionData = backupData[name] || [];
      const currentDocuments = await collection.find().toArray();

      const currentIds = new Set(currentDocuments.map(doc => doc._id.toString()));
      const backupIds = new Set(backupCollectionData.map(doc => doc._id.toString()));

      const added = currentDocuments.filter(doc => !backupIds.has(doc._id.toString()));
      const removed = backupCollectionData.filter(doc => !currentIds.has(doc._id.toString()));
      const modified = [];

      for (const currentDoc of currentDocuments) {
        if (backupIds.has(currentDoc._id.toString())) {
          const backupDoc = backupCollectionData.find(doc => doc._id.toString() === currentDoc._id.toString());
          const changes = compareObjects(backupDoc, currentDoc);
          if (Object.keys(changes).length > 0) {
            modified.push({ _id: currentDoc._id, changes });
          }
        }
      }

      // Lấy schema hiện tại
      const model = mongoose.models[name];
      const currentSchema = model ? model.schema.obj : {};

      // Tạo schema từ dữ liệu sao lưu
      const backupSchema = backupCollectionData.length > 0 ? createSchemaFromData(backupCollectionData[0]) : {};

      // So sánh schema
      const schemaChanges = compareSchemas(backupSchema, currentSchema);

      // Chỉ thêm vào phân tích nếu có ít nhất một thay đổi
      if (added.length > 0 || removed.length > 0 || modified.length > 0 || Object.keys(schemaChanges).length > 0) {
        analysis[name] = {
          added: added.length,
          removed: removed.length,
          modified: modified.length,
          schemaChanges,
          details: {
            added: added.map(({ _id, ...rest }) => ({ _id: _id.toString(), ...rest })),
            removed: removed.map(({ _id, ...rest }) => ({ _id: _id.toString(), ...rest })),
            modified
          }
        };
      }
    }

    return analysis;
  } catch (error) {
    console.error('Lỗi khi phân tích sao lưu:', error);
    throw error;
  }
};

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
  if (!config || !config.backup) {
    return null;
  }
  // Tạo một bản sao của backupConfig và loại bỏ trường password
  const { password, ...safeBackupConfig } = config.backup.toObject();
  return safeBackupConfig;
};

export const ensureBackupDir = () => {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
};

