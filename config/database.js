import mongoose from 'mongoose';
import chalk from 'chalk';
import gradient from 'gradient-string';

export default async function connectDatabase() {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/InternshipManagement';
  const localURI = 'mongodb://localhost:27017/InternshipManagement';
  
  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log(gradient.vice('Kết nối thành công đến MongoDB với Mongoose'));
  } catch (error) {
    console.error('Lỗi khi kết nối đến MongoDB URI:', error);
    console.warn(chalk.yellow('Không thể kết nối đến MongoDB URI, đang thử kết nối local...'));
    try {
      await mongoose.connect(localURI, {
        serverSelectionTimeoutMS: 5000
      });
      console.log(gradient.vice('Kết nối thành công đến MongoDB local với Mongoose'));
    } catch (localError) {
      console.error(chalk.red('Lỗi kết nối MongoDB:'), localError);
      process.exit(1);
    }
  }
}
