# Xây Ngôi Nhà Đảng Vững Mạnh

Ứng dụng web/PWA tương tác dùng cho thuyết trình theo đội. Host cấu hình công trình, lưới, kỹ sư và câu hỏi; người chơi trả lời để điều động nhân vật tới từng ô và dần hoàn thiện bức ảnh công trình.

## Tính năng đã hoàn thành

- Admin Dashboard: tạo session, ảnh công trình, kích thước lưới, thành viên, avatar, quote và ngân hàng câu hỏi 4 giai đoạn.
- Gameplay: chọn kỹ sư, MCQ/điền từ, đoán công trình và khóa/mở giai đoạn.
- Animation: đo vị trí bằng `getBoundingClientRect()`, chạy theo khoảng cách, vung búa, ăn mừng, buồn và nứt vỡ.
- Render ảnh ghép đúng `background-position` theo hàng/cột.
- Climax: xóa giàn giáo, kéo cờ, fanfare Web Audio, `canvas-confetti` và quote toàn màn hình.
- Supabase: schema, Storage, RLS, Realtime và client tích hợp sẵn.
- Demo fallback: `localStorage` + `BroadcastChannel`, chạy được ngay và đồng bộ giữa nhiều tab mà chưa cần database.
- Responsive, hỗ trợ bàn phím và `prefers-reduced-motion`.

## Chạy local

```bash
npm install
npm run dev
```

- Gameplay demo: `http://localhost:5173/`
- Admin: `http://localhost:5173/admin`

## Kết nối Supabase

1. Tạo một Supabase project.
2. Mở SQL Editor và chạy [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql).
3. Sao chép `.env.example` thành `.env.local`.
4. Điền `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Khởi động lại development server.

Khi hai biến môi trường tồn tại, ứng dụng tự chuyển từ demo local sang Supabase. Bảng `GameState` đã được thêm vào Realtime publication và bucket `game-assets` được cấu hình public cho ảnh trình chiếu.

> Các policy trong migration cho phép truy cập công khai để phù hợp mô hình phòng chơi không đăng nhập của PRD. Trước khi triển khai cho dữ liệu nhạy cảm, nên bổ sung mã phòng bí mật hoặc Supabase Auth và thu hẹp RLS.

## Build production

```bash
npm run build
npm run start
```

## Cấu trúc chính

- `app/admin/page.tsx`: màn quản trị.
- `app/play/[sessionId]/page.tsx`: URL phòng chơi.
- `components/game/game-experience.tsx`: gameplay và animation engine.
- `lib/game-service.ts`: Supabase/local persistence và realtime.
- `lib/mock-game.ts`: dữ liệu demo và câu hỏi mẫu.
- `lib/game-types.ts`: kiểu dữ liệu dùng chung.
- `supabase/migrations/001_initial_schema.sql`: database, policies, storage và realtime.
