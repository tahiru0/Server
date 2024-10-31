import jwt from 'jsonwebtoken';
import LoginHistory from '../models/LoginHistory.js';
import crypto from 'crypto';

export const generateTokens = (user, model, ipAddress = 'unknown', additionalInfo = {}) => {
    const accessTokenPayload = {
        _id: user._id,
        model,
        role: user.role,
        ...additionalInfo
    };

    const accessToken = jwt.sign(
        accessTokenPayload,
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    const refreshTokenPayload = {
        _id: user._id,
        model,
        ipHash: hashIpAddress(ipAddress),
        ...additionalInfo
    };

    const refreshToken = jwt.sign(
        refreshTokenPayload,
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
};

const hashIpAddress = (ip) => {
    if (!ip) return 'unknown';
    return crypto.createHash('md5').update(ip).digest('hex');
};

const isFirstLogin = async (userId, userModel) => {
  const loginCount = await LoginHistory.countDocuments({ user: userId, userModel, loginStatus: 'success' });
  return loginCount === 0;
};

export const saveLoginHistory = async (req, user, userModel, isSuccess, failureReason = null) => {
  const ipAddress = req.ip === '::1' ? '127.0.0.1' : req.ip;
  const userAgent = req.headers['user-agent'];
  
  const isFirstLoginAttempt = user ? await isFirstLogin(user._id, userModel) : false;

  const loginHistory = new LoginHistory({
    user: user ? user._id : null,
    userModel,
    ipAddress,
    userAgent,
    loginStatus: isSuccess ? 'success' : 'failed',
    failureReason,
    isFirstLogin: isFirstLoginAttempt
  });

  await loginHistory.save();
  return isFirstLoginAttempt;
};

export const prepareLoginResponse = async (user, userModel, accessToken, refreshToken, req) => {
  const isFirstLoginAttempt = await isFirstLogin(user._id, userModel);
  
  return {
    message: "Đăng nhập thành công",
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    accessToken,
    refreshToken,
    isFirstLogin: isFirstLoginAttempt
  };
};
