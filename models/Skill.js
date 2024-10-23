import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import softDeletePlugin from '../utils/softDelete.js';

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

const skillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên kỹ năng không được để trống'],
    unique: [true, 'Tên kỹ năng đã tồn tại'],
    trim: true,
    maxlength: [50, 'Tên kỹ năng không được vượt quá 50 ký tự'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
    validate: {
      validator: function(v) {
        return /^[\p{L}\p{N}\s]+$/u.test(v);
      },
      message: props => `${props.value} chứa ký tự không hợp lệ. Chỉ được phép sử dụng chữ, số và khoảng trắng.`
    }
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Mô tả kỹ năng không được vượt quá 200 ký tự'],
    set: (value) => sanitizeHtml(value, sanitizeOptions),
  }
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

// Thêm index cho trường name để tối ưu hóa tìm kiếm
skillSchema.index({ name: 1 });

// Middleware để đảm bảo dữ liệu được sanitize trước khi lưu
skillSchema.pre('save', function(next) {
  this.name = this.name;
  this.description = this.description;
  next();
});

// Thêm middleware để xử lý cập nhật
skillSchema.pre('findOneAndUpdate', function(next) {
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

skillSchema.plugin(softDeletePlugin);

const Skill = mongoose.model('Skill', skillSchema);

export default Skill;
