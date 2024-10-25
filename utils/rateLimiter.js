import rateLimit from 'express-rate-limit';

const createMultiLevelLimiter = (options) => {
  const limiters = options.map(option => rateLimit({
    windowMs: option.windowMs,
    max: option.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const baseUrl = req.originalUrl.split('?')[0];
      return req.ip + '_' + baseUrl + '_' + option.name;
    },
    handler: (req, res) => {
      res.status(429).json({
        message: `Quá nhiều yêu cầu. Vui lòng thử lại sau.`
      });
    }
  }));

  const requestCounts = new Map();

  return (req, res, next) => {
    const baseUrl = req.originalUrl.split('?')[0];
    const key = req.ip + '_' + baseUrl;

    if (!requestCounts.has(key)) {
      requestCounts.set(key, 0);
    }

    const count = requestCounts.get(key);

    if (count > 5) { // Giới hạn số lần lặp lại
      return res.status(429).json({
        message: 'Quá nhiều yêu cầu lặp lại. Vui lòng thử lại sau 1 giây.'
      });
    }

    requestCounts.set(key, count + 1);

    setTimeout(() => {
      requestCounts.set(key, Math.max(0, requestCounts.get(key) - 1));
    }, 1000);

    let index = 0;
    const processNextLimiter = (err) => {
      if (err) return next(err);
      if (res.headersSent) return;

      const limiter = limiters[index++];
      if (limiter) {
        limiter(req, res, processNextLimiter);
      } else {
        next();
      }
    };

    processNextLimiter();
  };
};

// Limiter với giới hạn tốc độ cao nhất
export const highRateLimiter = createMultiLevelLimiter([
  { name: 'perSecond', windowMs: 1000, max: 15 },       // 15 yêu cầu mỗi giây
  { name: 'perMinute', windowMs: 60 * 1000, max: 250 }, // 250 yêu cầu mỗi phút
]);

// Limiter với giới hạn tốc độ trung bình
export const mediumRateLimiter = createMultiLevelLimiter([
  { name: 'perSecond', windowMs: 1000, max: 12 },       // 12 yêu cầu mỗi giây
  { name: 'perMinute', windowMs: 60 * 1000, max: 150 }, // 150 yêu cầu mỗi phút
]);

// Limiter với giới hạn tốc độ thấp
export const lowRateLimiter = createMultiLevelLimiter([
  { name: 'perSecond', windowMs: 1000, max: 8 },       // 8 yêu cầu mỗi giây
  { name: 'perMinute', windowMs: 60 * 1000, max: 80 }, // 80 yêu cầu mỗi phút
]);

export const apiLimiter = createMultiLevelLimiter([
  { name: 'perSecond', windowMs: 1000, max: 10 },       // 10 yêu cầu mỗi giây
  { name: 'perMinute', windowMs: 60 * 1000, max: 100 }, // 100 yêu cầu mỗi phút
  // { name: 'perHour', windowMs: 60 * 60 * 1000, max: 1000 }, // 1000 yêu cầu mỗi giờ
  // { name: 'perDay', windowMs: 24 * 60 * 60 * 1000, max: 10000 } // 10000 yêu cầu mỗi ngày
]);

export const loginLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 phút
  max: 10, // Giới hạn 10 lần đăng nhập trong 2 phút
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false, // Đếm cả các yêu cầu bị từ chối
  keyGenerator: (req) => {
    console.log('IP address:', req.ip); // Log IP để kiểm tra
    return req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      message: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau 2 phút.'
    });
  },
});

export const publicLimiter = createMultiLevelLimiter([
  { name: 'perSecond', windowMs: 1000, max: 5 },       // 5 yêu cầu mỗi giây
  // { name: 'perMinute', windowMs: 60 * 1000, max: 50 }, // 50 yêu cầu mỗi phút
  // { name: 'perHour', windowMs: 60 * 60 * 1000, max: 500 }, // 500 yêu cầu mỗi giờ
  // { name: 'perDay', windowMs: 24 * 60 * 60 * 1000, max: 5000 } // 5000 yêu cầu mỗi ngày
]);

// Limiter cho thay đổi email
export const emailChangeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 1 ngày
  max: 2, // Giới hạn 2 lần thay đổi email mỗi ngày
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id, // Sử dụng ID người dùng để giới hạn
  handler: (req, res) => {
    res.status(429).json({
      message: 'Bạn chỉ có thể thay đổi email 2 lần mỗi ngày. Vui lòng thử lại sau 24 giờ.'
    });
  },
});
