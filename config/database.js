import mongoose from 'mongoose';
import chalk from 'chalk';
import gradient from 'gradient-string';

const maxRetries = 5;
const retryInterval = 5000; // 5 giây

async function tryConnect(uri, attempt = 1) {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
      retryReads: true,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log(gradient.vice(`Kết nối thành công đến MongoDB (lần thử ${attempt})`));
    return true;
  } catch (error) {
    console.error(chalk.red(`Lần ${attempt}: Lỗi kết nối - ${error.message}`));
    return false;
  }
}

export default async function connectDatabase() {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/InternshipManagement';
  const localURI = 'mongodb://localhost:27017/InternshipManagement';
  
  let attempt = 1;
  let connected = false;

  // Thử kết nối với MongoDB URI chính
  while (attempt <= maxRetries && !connected) {
    connected = await tryConnect(mongoURI, attempt);
    
    if (!connected) {
      console.log(chalk.yellow(`Đợi ${retryInterval/1000}s trước khi thử lại...`));
      await new Promise(resolve => setTimeout(resolve, retryInterval));
      attempt++;
    }
  }

  // Nếu không kết nối được, thử kết nối local
  if (!connected) {
    console.warn(chalk.yellow('Không thể kết nối đến MongoDB URI, đang thử kết nối local...'));
    connected = await tryConnect(localURI);
  }

  // Nếu vẫn không kết nối được
  if (!connected) {
    console.error(chalk.red('Không thể kết nối đến cả MongoDB URI và local sau nhiều lần thử'));
    process.exit(1);
  }
}
