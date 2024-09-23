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
        { expiresIn: '1h' } // Tăng lên 1 giờ hoặc nhiều hơn
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

    const loginHistory = new LoginHistory({
        user: user ? user._id : null,
        userModel,
        ipAddress,
        userAgent,
        loginStatus: isSuccess ? 'success' : 'failed',
        failureReason,
        location
    });

    await loginHistory.save();
};

export const prepareLoginResponse = (user, accessToken, refreshToken) => {
    return {
        message: "Đăng nhập thành công",
        user: {
            id: user._id,
            email: user.email,
            role: user.role,
            name: user.name,
        },
        accessToken,
        refreshToken
    };
};