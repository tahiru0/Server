import mongoose from 'mongoose';
import chalk from 'chalk';
import gradient from 'gradient-string';

export default function connectDatabase() {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/InternshipManagement';
  
  return mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 5000
  }).then(() => {
    console.log(gradient.vice('Kết nối thành công đến MongoDB với Mongoose'));
  }).catch(error => {
    console.error(chalk.red('MongoDB connection error:'), error);
    process.exit(1);
  });
}
