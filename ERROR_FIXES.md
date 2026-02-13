# Error Fixes - MahaTask Backend

## Masalah yang Diperbaiki

### 1. Error 500 - Foreign Key Constraint
**Masalah**: Penggunaan `temp-user-id` yang tidak ada di database menyebabkan foreign key constraint error.

**Solusi**:
- Membuat JWT Auth Guard untuk extract userId dari token JWT
- Semua endpoint sekarang menggunakan userId yang valid dari token
- Menambahkan validasi untuk memastikan user terautentikasi

### 2. Error Handling
**Masalah**: Error handling tidak konsisten dan tidak informatif.

**Solusi**:
- Menambahkan `BadRequestException` untuk semua error yang bisa di-handle
- Error messages yang lebih jelas dan informatif
- Frontend stores sekarang handle error dengan lebih baik

### 3. Task & Schedule UserId
**Masalah**: Task dan Schedule tidak memiliki userId saat dibuat.

**Solusi**:
- Task repository sekarang menerima userId sebagai parameter
- Schedule selalu memerlukan userId yang valid
- Semua create operations sekarang menggunakan userId dari JWT token

## File yang Diperbaiki

### Backend
- `backend/src/common/guards/jwt-auth.guard.ts` - JWT Guard baru
- `backend/src/common/decorators/user.decorator.ts` - Decorator untuk CurrentUser
- `backend/src/modules/task/presentation/task.controller.ts` - Menggunakan JWT Guard
- `backend/src/modules/task/application/use-cases/create-task.use-case.ts` - Menerima userId
- `backend/src/modules/task/infrastructure/persistence/prisma-task.repository.ts` - Save dengan userId
- `backend/src/modules/schedule/presentation/schedule.controller.ts` - Menggunakan JWT Guard
- `backend/src/modules/schedule/infrastructure/persistence/prisma-schedule.repository.ts` - Validasi userId
- `backend/src/modules/social/social.controller.ts` - Menggunakan JWT Guard
- `backend/src/modules/auth/auth.controller.ts` - Error handling yang lebih baik

### Frontend
- `frontend/src/stores/auth.js` - Error handling dan token management
- `frontend/src/stores/taskStore.ts` - Error handling yang lebih baik
- `frontend/src/stores/scheduleStore.ts` - Error handling dan auto-redirect jika unauthorized

## Cara Menggunakan

1. **Setup Database**:
   ```bash
   cd backend
   npx prisma migrate dev
   npx prisma generate
   ```

2. **Setup Environment**:
   Pastikan `.env` file memiliki:
   ```
   DATABASE_URL="postgresql://mahatask_user:Greshenchin888.@localhost:5432/TaskManager?schema=public"
   JWT_SECRET="3806417e9acdbe6b7a8fe3abe13183917faaa2e4e73931b890c4ef18ca3d4ca91f7f5230324eaf2d0fd2099cba71a4f96e07029ec46066d05abd98395fe1d0f6"
   ```

3. **Start Backend**:
   ```bash
   npm run start:dev
   ```

4. **Start Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

## Testing

1. Register user baru di `/login`
2. Login dengan credentials
3. Token akan otomatis disimpan dan digunakan untuk semua request
4. Semua endpoint sekarang memerlukan authentication (kecuali `/auth/register` dan `/auth/login`)

## Catatan Penting

- Semua endpoint kecuali `/auth/*` memerlukan JWT token di header `Authorization: Bearer <token>`
- Token akan otomatis di-set oleh frontend setelah login/register
- Jika token expired atau invalid, user akan di-redirect ke login page
