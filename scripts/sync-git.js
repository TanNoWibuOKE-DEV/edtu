import { execSync } from 'node:child_process';

function run(cmd) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' }).trim();
}

try {
  const status = run('git status --porcelain');
  if (!status) {
    console.log('✅ Không có thay đổi nào cần đồng bộ lên GitHub.');
    process.exit(0);
  }

  console.log('📦 Đang chuẩn bị đồng bộ các thay đổi lên GitHub...');
  run('git add .');
  
  const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const msg = process.argv[2] || `update: tự động cập nhật phiên làm việc [${timestamp}]`;
  
  run(`git commit -m "${msg}"`);
  console.log(`📝 Đã commit: "${msg}"`);

  console.log('🚀 Đang đồng bộ và push lên branch main...');
  try {
    run('git pull --rebase origin main');
  } catch (rebaseErr) {
    console.warn('⚠️ Ghi chú rebase:', rebaseErr.message);
  }
  run('git push origin main');
  console.log('✨ Đồng bộ thành công lên https://github.com/TanNoWibuOKE-DEV/edtu.git!');
} catch (error) {
  console.error('❌ Lỗi đồng bộ git:', error.message);
  process.exit(1);
}
