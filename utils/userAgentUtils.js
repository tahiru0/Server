import useragent from 'useragent';
import geoip from 'geoip-lite';

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
    const geo = geoip.lookup(ip);
    return geo ? `${geo.city}, ${geo.country}` : 'Unknown';
};
