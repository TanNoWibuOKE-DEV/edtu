# eDTU — Multi-role university portal

This workspace was empty when the portal expansion was started, so it contains no legacy Student Portal UI or database to migrate. The new foundation keeps operational records empty until the university provisions real data.

## Run locally

1. Cài đặt các thư viện: `npm install`
2. Chạy môi trường phát triển (Full-stack Frontend + Backend): `npm run dev`
3. Truy cập ứng dụng tại `http://localhost:5173`

## Đồng bộ mã nguồn lên GitHub tự động

Kho lưu trữ GitHub: [https://github.com/TanNoWibuOKE-DEV/edtu.git](https://github.com/TanNoWibuOKE-DEV/edtu.git)

Chạy lệnh sau bất kỳ lúc nào để tự động thêm tất cả thay đổi, tạo commit kèm mốc thời gian và push lên GitHub:
```bash
npm run sync
```
hoặc truyền nội dung commit tùy biến:
```bash
npm run sync "Cập nhật giao diện mới"
```

There are no shared demo credentials, self-service registration endpoint, or seeded user accounts. New accounts are created by an admin, begin in `pending`, receive a one-time temporary password for delivery through an approved secure channel, and require activation and a password change.

## Security and data model

- One shared login accepts an account code and password. The server automatically opens the account's primary assigned role; multi-role users can switch spaces after signing in, with every role checked against active assignments.
- The first active role granted to an account becomes its primary login role. Admins with role-management permission can change the primary role; existing accounts get a safe default from their oldest active role during migration.
- Authorization is enforced on API routes. Assigned class queries bind to `lecturer_course_assignments`; student queries bind to the authenticated user; staff records require explicit data scopes or personal assignment.
- SQLite schema setup uses `CREATE TABLE/INDEX IF NOT EXISTS`, a migration version table, foreign keys, WAL, and transactions. No destructive table replacement or sample operational records are used.
- Grade changes write an actor, old/new value, and timestamp. Approved grades are immutable through the lecturer edit API; submission and approval are tracked.
- The initial admin utility does not create a default account and only runs while no active admin role exists.

## Modules in this foundation

Student, lecturer, staff, and admin have separate dashboards and navigation. Account management, role assignment, data scopes, audit logs, student support requests, lecturer assigned-class views, grade entry/approval, staff tasks, and organization units are connected to the API. Other listed portal areas are represented in navigation and use empty states until actual university data and workflows are provisioned.
