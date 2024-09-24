import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';

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
}, { toJSON: { getters: true }, toObject: { getters: true } });

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

const Major = mongoose.model('Major', majorSchema);
export default Major;
