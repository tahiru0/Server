import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import softDeletePlugin from '../utils/softDelete.js';

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

const majorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên ngành học không được để trống'],
    unique: [true, 'Tên ngành học đã tồn tại'],
    trim: true,
    maxlength: [100, 'Tên ngành học không được vượt quá 100 ký tự'],
    minlength: [2, 'Tên ngành học phải có ít nhất 2 ký tự'],
    match: [/^[a-zA-ZÀ-ỹ0-9\s]+$/, 'Tên ngành học chỉ được chứa chữ cái, số và khoảng trắng'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Mô tả ngành học không được vượt quá 500 ký tự'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
  }
}, { toJSON: { getters: true, virtuals: false }, toObject: { getters: true, virtuals: false } });

// Thêm bảo vệ schema
majorSchema.set('validateBeforeSave', true);

// Middleware trước khi lưu để đảm bảo dữ liệu được sanitize
majorSchema.pre('save', function(next) {
  this.name = this.name;
  this.description = this.description;
  next();
});

// Thêm middleware để xử lý cập nhật
majorSchema.pre('findOneAndUpdate', function(next) {
    const update = this.getUpdate();
    if (update.$set) {
        Object.keys(update.$set).forEach(key => {
            if (update.$set[key] === null || update.$set[key] === '') {
                delete update.$set[key];
            }
        });
    }
    next();
});

majorSchema.plugin(softDeletePlugin);

// Thêm phương thức tĩnh để tìm kiếm major
majorSchema.statics.findByFlexibleName = async function(name) {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Tạo regex cho viết tắt
  const abbreviationRegex = name.split(/\s+/).map(word => `(?=.*\\b${word[0]})`).join('');
  
  return this.find({
    $or: [
      { name: { $regex: new RegExp(name, 'i') } },
      { name: { $regex: new RegExp(normalizedName, 'i') } },
      { name: { $regex: new RegExp(abbreviationRegex, 'i') } },
      { 
        $expr: {
          $regexMatch: {
            input: {
              $reduce: {
                input: { $split: ["$name", " "] },
                initialValue: "",
                in: { $concat: ["$$value", { $substrCP: ["$$this", 0, 1] }] }
              }
            },
            regex: new RegExp(normalizedName, 'i')
          }
        }
      }
    ]
  });
};

majorSchema.statics.findMajorWithFaculty = async function(majorId) {
  const School = mongoose.model('School');
  const school = await School.findOne({ 'faculties.majors': majorId });
  if (!school) return null;

  const faculty = school.faculties.find(f => f.majors.includes(majorId));
  if (!faculty) return null;

  return {
    major: await this.findById(majorId),
    faculty: faculty,
    school: school
  };
};

const Major = mongoose.model('Major', majorSchema);
export default Major;
