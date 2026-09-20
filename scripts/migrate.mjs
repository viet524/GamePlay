import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Load .env.local first, then .env
dotenv.config({ path: path.join(rootDir, ".env.local") });
dotenv.config({ path: path.join(rootDir, ".env") });

function getConnectionString() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iuxaawagdttsixaudrub.supabase.co";
  const projectRefMatch = projectUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  const projectRef = projectRefMatch ? projectRefMatch[1] : "iuxaawagdttsixaudrub";

  if (!password) {
    return null;
  }

  // Supabase connection string with pooled connection
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
}

async function runMigrations() {
  const connectionString = getConnectionString();

  if (!connectionString) {
    console.error("\n❌ LỖI: Chưa có Mật khẩu Database (Database Password)!");
    console.error("\n👉 Vui lòng thêm một trong hai biến sau vào file .env.local:");
    console.error("   SUPABASE_DB_PASSWORD=mật_khẩu_database_của_bạn");
    console.error("   HOẶC:");
    console.error("   DATABASE_URL=postgresql://postgres.iuxaawagdttsixaudrub:[MẬT_KHẨU]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres\n");
    console.error("💡 Lưu ý: Mật khẩu này là mật khẩu bạn đã đặt khi bấm 'Create Project' trên Supabase.");
    console.error("   (Nếu quên, vào Supabase > Project Settings > Database > bấm 'Reset database password')\n");
    process.exit(1);
  }

  const migrationsDir = path.join(rootDir, "supabase", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.error(`❌ Không tìm thấy thư mục migration: ${migrationsDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  console.log(`\n🚀 Bắt đầu kết nối tới Supabase Database...`);
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log("✅ Kết nối Database thành công!");

    // Tạo bảng theo dõi migration nếu chưa có
    await client.query(`
      create table if not exists public."_migrations_applied" (
        id serial primary key,
        name text unique not null,
        applied_at timestamptz not null default now()
      );
    `);

    for (const file of files) {
      const checkRes = await client.query(
        'select id from public."_migrations_applied" where name = $1',
        [file]
      );

      if (checkRes.rows.length > 0) {
        console.log(`⏩ [BỎ QUA] ${file} (Đã chạy trước đó)`);
        continue;
      }

      console.log(`⏳ [ĐANG CHẠY] ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      await client.query(sql);
      await client.query(
        'insert into public."_migrations_applied" (name) values ($1)',
        [file]
      );
      console.log(`✅ [THÀNH CÔNG] ${file}`);
    }

    console.log("\n🎉 Tất cả các bản migration đã được thực thi thành công 100%!\n");
  } catch (err) {
    console.error("\n❌ Lỗi khi thực thi migration:", err.message);
    if (err.message.includes("password authentication failed")) {
      console.error("👉 Mật khẩu Database không chính xác. Vui lòng kiểm tra lại SUPABASE_DB_PASSWORD trong .env.local.");
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
