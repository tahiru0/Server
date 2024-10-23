import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['text', 'multipleChoice', 'checkbox'],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  options: [String] // Chỉ cho multipleChoice và checkbox
});

const surveySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  questions: [questionSchema],
  targetAudience: {
    type: String,
    enum: ['student', 'mentor'],
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolAccount',
    required: true
  },
  expiryDate: Date
}, { timestamps: true });

const Survey = mongoose.model('Survey', surveySchema);

export default Survey;
