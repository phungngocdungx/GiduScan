const express = require('express');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const qrcode = require('qrcode');
const os = require('os');
const path = require('path');

const app = express();
const PORT = 3000;

// === Lấy IP cục bộ — Giữ nguyên logic của bạn ===
const getLocalIP = () => {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) return alias.address;
    }
  }
  return '127.0.0.1';
};
const localIP = getLocalIP();

// === ✅ Tìm đường dẫn ĐÚNG khi chạy từ NGUỒN hoặc từ EXE ===
const isPackaged = typeof process.pkg !== 'undefined';
const APP_ROOT = isPackaged
  ? path.dirname(process.execPath)  // Thư mục chứa file .exe
  : __dirname;                      // Thư mục chứa server.js khi chạy nguồn

// === Đọc chứng chỉ HTTPS ===
const certPath = (name) => path.join(APP_ROOT, name);

let options;
try {
  options = {
    key: fs.readFileSync(certPath('key.pem')),
    cert: fs.readFileSync(certPath('cert.pem'))
  };
} catch (err) {
  console.error('❌ Không tìm thấy file key.pem hoặc cert.pem!');
  console.error('👉 Đặt 2 file này cùng thư mục với chương trình .exe');
  process.exit(1);
}

// === Tạo server ===
const server = https.createServer(options, app);
const wss = new WebSocket.Server({ server });

// === Phục vụ file — Đúng đường dẫn với EXE ===
app.use(express.static(APP_ROOT));
app.use('/pwa', express.static(path.join(APP_ROOT, 'pwa-phone')));

// === Chuyển tiếp dữ liệu WebSocket — Giữ nguyên 100% logic của bạn ===
wss.on('connection', (ws) => {
  console.log('✅ Điện thoại đã kết nối! Tổng số kết nối:', wss.clients.size);

  ws.on('message', function (data) {
    const text = data.toString('utf8');
    console.log('📩 Nhận được từ điện thoại, độ dài:', text.length, 'ký tự');

    wss.clients.forEach(function (client) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        console.log('📤 Chuyển tiếp đến máy tính...');
        client.send(text);
      }
    });
  });

  ws.on('close', () => console.log('❌ Một thiết bị ngắt kết nối'));
  ws.onerror = (err) => console.error('⚠️ Lỗi WebSocket:', err);
});

// === Tạo QR ===
const pwaUrl = `https://${localIP}:${PORT}/pwa`;
let qrCodeDataUrl = '';

qrcode.toDataURL(pwaUrl).then(qrDataUrl => {
  qrCodeDataUrl = qrDataUrl;
  console.log('========================================');
  console.log(`✅ Server chạy: https://${localIP}:${PORT}`);
  console.log(`📱 PWA: ${pwaUrl}`);
  console.log('========================================');
  console.log('👉 Mở link trên hoặc quét mã QR trên trình duyệt máy tính');
});

app.get('/qrcode-data', (req, res) => {
  res.json({
    qrCode: qrCodeDataUrl,
    url: pwaUrl,
    ip: localIP,
    port: PORT
  });
});

// === Khởi động ===
server.listen(PORT, localIP, () => {
  // Thông báo đã in ở trên khi QR tạo xong
});

// === Bắt lỗi cổng bị chiếm ===
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Cổng ${PORT} đã được sử dụng!`);
    console.error('👉 Đóng chương trình khác đang dùng cổng 3000 rồi thử lại');
  } else {
    console.error('❌ Lỗi khởi động server:', err.message);
  }
  process.exit(1);
});

// Cho phép truy cập từ localhost và ứng dụng
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log(`✅ Server chạy tại: https://10.37.91.225:${PORT}`);
  console.log(`✅ Cũng truy cập: https://127.0.0.1:${PORT}`);
  console.log('========================================');
});