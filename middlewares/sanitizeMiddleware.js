const checkForJavaScriptLogic = (input) => {
    if (typeof input === 'string') {
        // Danh sách các mẫu JavaScript nguy hiểm cần kiểm tra
        const dangerousPatterns = [
            /\bif\s*\([^)]*?(?:==|===|!=|!==)/i,
            /\bfor\s*\([^)]*?;[^)]*?;/i,
            /\bwhile\s*\([^)]*?(?:==|===|!=|!==)/i,
            /\bfunction\s*\([^)]*?\)\s*{/i,
            /\breturn\s+(?:true|false|null|undefined)/i,
            /\b(?:var|let|const)\s+\w+\s*=\s*(?:true|false|null|undefined)/i,
            /\balert\s*\(/i,
            /\beval\s*\(/i,
            /\bnew\s+Function\s*\(/i,
            /\bdocument\.write\s*\(/i,
            /\bwindow\.location\s*=/i,
            /\bnavigator\./i,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(input)) {
                console.log('Phát hiện đầu vào có khả năng độc hại:', input);
                console.log('Mẫu khớp:', pattern);
                throw new Error('Yêu cầu bị từ chối: Phát hiện mẫu JavaScript có thể gây hại');
            }
        }
    } else if (typeof input === 'object' && input !== null) {
        for (const key in input) {
            if (Object.prototype.hasOwnProperty.call(input, key)) {
                checkForJavaScriptLogic(input[key]);
            }
        }
    }
};

const sanitizeMongoOperators = (input) => {
    if (typeof input === 'string') {
        // Thêm dấu gạch dưới trước các toán tử MongoDB, nhưng bỏ qua nếu đã có dấu gạch dưới hoặc không có dấu cách trước
        return input.replace(/(?<=\s)(?<!_)\$(?=(?:eq|ne|gt|gte|lt|lte|in|nin|and|or|not|nor|exists|type|mod|regex|where|all|elemMatch|size|text|slice|meta|comment|inc|mul|rename|setOnInsert|set|unset|min|max|currentDate|addToSet|pop|pull|push|pullAll|each|position|isolated|atomicUpdate|bit|addFields|project|match|redact|limit|skip|unwind|group|sample|sort|geoNear|lookup|out|indexStats)\b)/gi, '_$');
    } else if (typeof input === 'object' && input !== null) {
        if (Array.isArray(input)) {
            return input.map(sanitizeMongoOperators);
        } else {
            const sanitizedObj = {};
            for (const [key, value] of Object.entries(input)) {
                const sanitizedKey = key.replace(/(?<=\s)(?<!_)\$(?=(?:eq|ne|gt|gte|lt|lte|in|nin|and|or|not|nor|exists|type|mod|regex|where|all|elemMatch|size|text|slice|meta|comment|inc|mul|rename|setOnInsert|set|unset|min|max|currentDate|addToSet|pop|pull|push|pullAll|each|position|isolated|atomicUpdate|bit|addFields|project|match|redact|limit|skip|unwind|group|sample|sort|geoNear|lookup|out|indexStats)\b)/gi, '_$');
                sanitizedObj[sanitizedKey] = sanitizeMongoOperators(value);
            }
            return sanitizedObj;
        }
    }
    return input;
};

const sanitizeMiddleware = (req, res, next) => {
    try {

        const sanitizeAndValidate = (obj) => {
            if (typeof obj !== 'object' || obj === null) {
                throw new Error('Dữ liệu đầu vào không hợp lệ');
            }

            const sanitized = sanitizeMongoOperators(obj);
            
            for (const [key, value] of Object.entries(sanitized)) {
                if (typeof value === 'object' && value !== null) {
                    sanitizeAndValidate(value);
                } else if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
                    throw new Error(`Giá trị không hợp lệ cho trường "${key}"`);
                }
            }

            return sanitized;
        };

        req.body = sanitizeAndValidate(req.body);
        req.query = sanitizeAndValidate(req.query);
        req.params = sanitizeAndValidate(req.params);

        checkForJavaScriptLogic(req.body);
        checkForJavaScriptLogic(req.query);
        checkForJavaScriptLogic(req.params);

        next();
    } catch (error) {
        console.error('Lỗi sanitization:', error.message);
        res.status(400).json({ message: error.message });
    }
};

export default sanitizeMiddleware;
