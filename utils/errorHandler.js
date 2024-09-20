export const handleError = (error) => {
  console.error('Lỗi:', error);
  
  if (error.name === 'ValidationError') {
    const messages = Object.keys(error.errors).map(key => `${key}:${error.errors[key].message}`);
    return { status: 400, message: messages.join(', ') };
  }
  if (error.name === 'CastError' && error.kind === 'ObjectId') {
    return { status: 400, message: 'Id không hợp lệ' };
  }
  
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return { status: 400, message: `${field} đã tồn tại trong hệ thống.` };
  }

  if (error.code === 'ENOENT') {
    return { status: 404, message: 'Tệp hoặc thư mục không tồn tại.' };
  }
  
  if (error.name === 'JsonWebTokenError') {
    return { status: 401, message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' };
  }
  
  if (error.status === 429) {
    return { status: 429, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' };
  }
  
  if (error.message.includes('không được để trống') ||
      error.message.includes('không hợp lệ')) {
    return { status: 400, message: error.message };
  }
  
  if (error.message === 'Thông tin đăng nhập không chính xác.' ||
      error.message === 'Trường không tồn tại.') {
    return { status: 401, message: error.message };
  }
  
  if (error.message.includes('Cast to ObjectId failed')) {
    return { status: 400, message: 'ID không hợp lệ.' };
  }
  
  // Thay đổi thông báo lỗi 500 để không tiết lộ chi tiết
  return { status: 500, message: 'Đã xảy ra lỗi. Vui lòng thử lại sau.' };
};
