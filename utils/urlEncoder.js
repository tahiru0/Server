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
  const decodedData = Buffer.from(encodedData, 'base64').toString('ascii');
  const [color, character] = decodedData.split(':');
  const svg = createInitialImage(character, color);
  return svg;
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
