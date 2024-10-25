import useragent from 'useragent';
// import geoip from 'geoip-lite';

export const parseUserAgent = (userAgentString) => {
    const agent = useragent.parse(userAgentString);
    return {
        browser: agent.family,
        version: agent.major,
        os: agent.os.toString()
    };
};

export const getDeviceType = (userAgentString) => {
    const agent = useragent.parse(userAgentString);
    if (agent.device.family === 'iPhone' || agent.device.family === 'iPad') {
        return 'iOS';
    } else if (agent.device.family === 'Android') {
        return 'Android';
    } else {
        return 'Desktop';
    }
};

export const getLocationFromIP = (ip) => {
    return 'Unknown'; // Hoặc có thể trả về null hoặc một giá trị mặc định khác
};
