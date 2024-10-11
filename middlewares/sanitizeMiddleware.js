const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
};

const escapeHtml = (unsafe) => {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe.replace(/[&<>"'`=\/]/g, function (s) {
        if (s === '&') {
            const nextFive = unsafe.substr(unsafe.indexOf(s) + 1, 5);
            if (['amp;', 'lt;', 'gt;', 'quot;'].includes(nextFive) || 
                nextFive.startsWith('#39;') || 
                nextFive.startsWith('#x2F') || 
                nextFive.startsWith('#x60') || 
                nextFive.startsWith('#x3D')) {
                return s;
            }
        }
        return entityMap[s];
    });
};

const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    const sanitized = Array.isArray(obj) ? [] : {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = escapeHtml(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
};

const sanitizeMiddleware = (req, res, next) => {
    try {
        req.body = sanitizeObject(req.body);
        req.query = sanitizeObject(req.query);
        req.params = sanitizeObject(req.params);
        next();
    } catch (error) {
        console.error('Lỗi sanitization:', error.message);
        res.status(400).json({ message: 'Dữ liệu đầu vào không hợp lệ' });
    }
};

export default sanitizeMiddleware;
