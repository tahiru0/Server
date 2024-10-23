import path from 'path';
import crypto from 'crypto';

// Hàm sinh màu nền ngẫu nhiên nhưng không quá sáng
const randomColor = () => {
  const r = Math.floor(Math.random() * 128).toString(16).padStart(2, '0');
  const g = Math.floor(Math.random() * 128).toString(16).padStart(2, '0');
  const b = Math.floor(Math.random() * 128).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
};

// Function to encode color and character into a URL
const encodeUrl = (character, color = null) => {
  const finalColor = color || randomColor();
  const data = `${finalColor}:${character}`;
  const encodedData = Buffer.from(data).toString('base64');
  return `/default/${encodedData}`;
};

// Function to decode the URL and generate the image
const decodeUrl = (encodedData) => {
  if (!encodedData) {
    throw new TypeError('The encodedData parameter is required');
  }
  try {
    if (encodedData.length === 1) {
      const character = encodedData.toUpperCase();
      return createInitialImage(character, '#808080');
    } else {
      const decodedData = Buffer.from(encodedData, 'base64').toString('ascii');
      const [color, character] = decodedData.split(':');
      return createInitialImage(character, color);
    }
  } catch (error) {
    // Nếu có lỗi xảy ra, trả về một SVG với biểu tượng người dùng mặc định
    return createDefaultAvatarIcon();
  }
};

const createDefaultAvatarIcon = () => {
  // Sử dụng biểu tượng người dùng từ Font Awesome
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="100" height="100">
      <rect width="100%" height="100%" fill="#808080"/>
      <path d="M224 256c70.7 0 128-57.3 128-128S294.7 0 224 0 96 57.3 96 128s57.3 128 128 128zm89.6 32h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16h-16.7C60.2 288 0 348.2 0 422.4V464c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48v-41.6c0-74.2-60.2-134.4-134.4-134.4z" fill="white"/>
    </svg>
  `;
};

// Hàm tạo ra một ảnh từ chữ cái đầu với màu nền và màu chữ nổi bật
const createInitialImage = (name, color = null) => {
  if (!name || typeof name !== 'string') {
    throw new TypeError('The name parameter is required and must be a string');
  }
  const initial = name.charAt(0).toUpperCase();
  const backgroundColor = color || randomColor();
  const textColor = 'white'; // Màu chữ trắng

  // Tạo SVG với chữ cái đầu và màu nền khác với màu chữ
  const svg = `
    <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${backgroundColor}" />
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="60" text-anchor="middle" dominant-baseline="central" fill="${textColor}">
        ${initial}
      </text>
    </svg>
  `;

  return svg;
};

// Export the functions as named exports
export { encodeUrl, decodeUrl };
