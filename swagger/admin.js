/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Quản lý dành cho admin
 */
/**
 * @swagger
 * /api/admin/companies:
 *   get:
 *     summary: Lấy danh sách công ty
 *     tags: [Admin]
 *     description: Trả về danh sách các công ty cùng với các tài khoản liên kết.
 *     parameters:
 *       - name: page
 *         in: query
 *         description: Phân trang
 *         required: false
 *         schema:
 *           type: integer
 *       - name: limit
 *         in: query
 *         description: Số lượng bản ghi mỗi trang
 *         required: false
 *         schema:
 *           type: integer
 *       - name: sort
 *         in: query
 *         description: Sắp xếp theo trường nào đó (e.g. -name để sắp xếp ngược)
 *         required: false
 *         schema:
 *           type: string
 *       - name: filter
 *         in: query
 *         description: Lọc dữ liệu theo điều kiện (e.g. name=XYZ)
 *         required: false
 *         schema:
 *           type: string
 *       - name: search
 *         in: query
 *         description: Tìm kiếm theo từ khóa
 *         required: false
 *         schema:
 *           type: string
 *     security:
 *       - adminBearerAuth: []  
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Company'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /api/admin/companies:
 *   post:
 *     summary: Tạo mới một công ty
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Company'
 *     responses:
 *       201:
 *         description: Tạo công ty thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Company'
 *       500:
 *         description: Lỗi server nội bộ
 */

/**
 * @swagger
 * /api/admin/companies/{id}:
 *   get:
 *     summary: Lấy thông tin công ty theo ID
 *     tags: [Admin]
 *     description: Trả về thông tin chi tiết của một công ty và các tài khoản liên kết theo ID.
 *     parameters:
 *       - name: id
 *         in: path
 *         description: ID của công ty
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - adminBearerAuth: [] 
 *     responses:
 *       200:
 *         description: Phản hồi thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Company'
 *       404:
 *         description: Không tìm thấy công ty
 *       500:
 *         description: Lỗi server nội bộ
 */

/**
 * @swagger
 * /api/admin/companies/{id}:
 *   put:
 *     summary: Cập nhật thông tin công ty
 *     tags: [Admin]
 *     description: Cập nhật thông tin của một công ty dựa trên ID. ID có thể được lấy từ danh sách công ty trong endpoint GET. Bạn có thể sử dụng dữ liệu JSON từ phản hồi của endpoint GET để cập nhật.
 *     parameters:
 *       - name: id
 *         in: path
 *         description: ID của công ty
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Company'
 *     security:
 *       - adminBearerAuth: []  
 *     responses:
 *       200:
 *         description: Cập nhật công ty thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Company'
 *       404:
 *         description: Không tìm thấy công ty
 *       500:
 *         description: Lỗi server nội bộ
 */

/**
 * @swagger
 * /api/admin/companies/{id}:
 *   delete:
 *     summary: Xóa mềm công ty
 *     tags: [Admin]
 *     description: Xóa mềm một công ty dựa trên ID.
 *     parameters:
 *       - name: id
 *         in: path
 *         description: ID của công ty
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - adminBearerAuth: []  
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       404:
 *         description: Không tìm thấy
 *       500:
 *         description: Lỗi server
 */