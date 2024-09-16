import mongoose from 'mongoose';
import UAParser from 'ua-parser-js';

const LoginHistorySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, refPath: 'userModel' },
    userModel: { 
        type: String, 
        required: true, 
        enum: ['Admin', 'CompanyAccount', 'SchoolAccount', 'Student'] 
    },
    loginTime: { type: Date, default: Date.now },
    ipAddress: String,
    userAgent: String,
    loginStatus: { type: String, enum: ['success', 'failed'] },
    failureReason: String,
    location: {
        country: String,
        city: String,
        latitude: Number,
        longitude: Number
    }
}, { timestamps: true });

// Phương thức để lấy thông tin user
LoginHistorySchema.methods.getUserInfo = async function() {
    if (!this.user) return null;

    try {
        const UserModel = mongoose.model(this.userModel);
        const user = await UserModel.findById(this.user);
        
        if (user) {
            // Trả về toàn bộ thông tin user, loại bỏ các trường nhạy cảm
            const userObject = user.toObject();
            delete userObject.password;
            delete userObject.refreshToken;
            return userObject;
        }
    } catch (error) {
        console.error('Error fetching user info:', error);
    }

    return null;
};

// Phương thức tĩnh để phân tích user-agent
LoginHistorySchema.statics.parseUserAgent = function(userAgentString) {
    const parser = new UAParser(userAgentString);
    return parser.getResult();
};

// Thêm middleware để xử lý cập nhật
LoginHistorySchema.pre('findOneAndUpdate', function(next) {
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

const LoginHistory = mongoose.model('LoginHistory', LoginHistorySchema);

export default LoginHistory;

/**
 * @openapi
 * components:
 *   schemas:
 *     LoginHistory:
 *       type: object
 *       properties:
 *         user:
 *           type: string
 *           format: uuid
 *           description: ID của người dùng liên quan đến lịch sử đăng nhập.
 *           example: 60d5f4f4c72d4b6d1c4f4f5c
 *         userModel:
 *           type: string
 *           enum: [SchoolAccount, Student, CompanyAccount, Admin]
 *           description: Loại mô hình người dùng liên quan đến lịch sử đăng nhập.
 *           example: CompanyAccount
 *         loginTime:
 *           type: string
 *           format: date-time
 *           description: Thời gian đăng nhập.
 *           example: 2024-08-11T10:00:00Z
 *         ipAddress:
 *           type: string
 *           description: Địa chỉ IP từ đó người dùng đăng nhập.
 *           example: 192.168.1.1
 *         userAgent:
 *           type: string
 *           description: Thông tin về trình duyệt và hệ điều hành của người dùng.
 *           example: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36
 *         deviceType:
 *           type: string
 *           description: Loại thiết bị được sử dụng để đăng nhập.
 *           example: Desktop
 *         browser:
 *           type: string
 *           description: Trình duyệt được sử dụng để đăng nhập.
 *           example: Chrome
 *         operatingSystem:
 *           type: string
 *           description: Hệ điều hành của thiết bị đăng nhập.
 *           example: Windows 10
 *         loginStatus:
 *           type: string
 *           enum: [success, failed]
 *           description: Trạng thái của lần đăng nhập.
 *           example: success
 *         failureReason:
 *           type: string
 *           description: Lý do đăng nhập thất bại (nếu có).
 *           example: Incorrect password
 *         location:
 *           type: object
 *           properties:
 *             country:
 *               type: string
 *               description: Quốc gia của địa chỉ IP.
 *               example: Vietnam
 *             city:
 *               type: string
 *               description: Thành phố của địa chỉ IP.
 *               example: Ho Chi Minh City
 *             latitude:
 *               type: number
 *               description: Vĩ độ của địa chỉ IP.
 *               example: 10.8231
 *             longitude:
 *               type: number
 *               description: Kinh độ của địa chỉ IP.
 *               example: 106.6297
 *       required:
 *         - user
 *         - userModel
 *         - loginTime
 *         - ipAddress
 *         - userAgent
 *         - loginStatus
*/