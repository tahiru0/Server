import jwt from 'jsonwebtoken';
import LoginHistory from '../models/LoginHistory.js';
import geoip from 'geoip-lite';
import crypto from 'crypto';

export const generateTokens = (user, model, ipAddress, additionalInfo = {}) => {
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

const hashIpAddress = (ipAddress) => {
    return crypto.createHash('sha256').update(ipAddress).digest('hex');
};

const isFirstLogin = async (userId, userModel) => {
  const loginCount = await LoginHistory.countDocuments({ user: userId, userModel, loginStatus: 'success' });
  return loginCount === 0;
};

export const saveLoginHistory = async (req, user, userModel, isSuccess, failureReason = null) => {
  const ipAddress = req.ip === '::1' ? '127.0.0.1' : req.ip;
  const userAgent = req.headers['user-agent'];
  
  let location = null;
  if (ipAddress !== '127.0.0.1') {
    const geo = geoip.lookup(ipAddress);
    if (geo) {
      location = {
        country: geo.country,
        city: geo.city,
        latitude: geo.ll[0],
        longitude: geo.ll[1]
      };
    }
  }

  const isFirstLoginAttempt = user ? await isFirstLogin(user._id, userModel) : false;

  const loginHistory = new LoginHistory({
    user: user ? user._id : null,
    userModel,
    ipAddress,
    userAgent,
    loginStatus: isSuccess ? 'success' : 'failed',
    failureReason,
    location,
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
