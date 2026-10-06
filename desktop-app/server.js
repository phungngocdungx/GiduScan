const express = require('express');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const qrcode = require('qrcode');
const os = require('os');
const path = require('path');

const app = express();
const PORT = 3000;

// === Lấy đúng IP của mạng Hotspot đang hoạt động ===
const getLocalIP = () => {
  const ifaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, netList] of Object.entries(ifaces)) {
    for (const net of netList) {
      // Chỉ lấy IPv4 thật, không phải loopback và không phải IP tự cấp 169.254
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        candidates.push({ name, address: net.address });
      }
    }
  }

  // 1. Nếu có IP khớp với mạng 10.37.91.x (mạng Hotspot thực tế từ điện thoại của bạn), ưu tiên lấy luôn
  const hotspotIP = candidates.find(c => c.address.startsWith('10.37.91.'));
  if (hotspotIP) return hotspotIP.address;

  // 2. Ưu tiên card Wi-Fi khác dải 10.1.38 cũ
  const wifiIP = candidates.find(c => /wi-fi|wlan|wireless/i.test(c.name) && !c.address.startsWith('10.1.38.'));
  if (wifiIP) return wifiIP.address;

  return candidates[0] ? candidates[0].address : '127.0.0.1';
};

const isPackaged = typeof process.pkg !== 'undefined';
const APP_ROOT = isPackaged ? path.dirname(process.execPath) : __dirname;

const certPath = (name) => path.join(APP_ROOT, name);

let options;
try {
  options = {
    key: fs.readFileSync(certPath('key.pem')),
    cert: fs.readFileSync(certPath('cert.pem'))
  };
} catch (err) {
  console.error('❌ Không tìm thấy file cert/key!');
  process.exit(1);
}

// === Cấu hình CORS ===
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// === Phục vụ file tĩnh ===
app.use(express.static(APP_ROOT));
app.use('/pwa', express.static(path.join(APP_ROOT, 'pwa-phone')));

// === API QR code ĐỘNG: Tạo lại mỗi lần app mở hoặc refresh ===
app.get('/qrcode-data', async (req, res) => {
  const currentIP = getLocalIP();
  const currentUrl = `https://${currentIP}:${PORT}/pwa`;
  try {
    const qrDataUrl = await qrcode.toDataURL(currentUrl);
    console.log(`📡 Client lấy QR thành công: ${currentUrl}`);
    res.json({
      qrCode: qrDataUrl,
      url: currentUrl,
      ip: currentIP,
      port: PORT
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo QR' });
  }
});

// === Tạo server HTTPS & WebSocket ===
const server = https.createServer(options, app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('✅ Thiết bị kết nối WebSocket!');
  ws.on('message', function (data) {
    const text = data.toString('utf8');
    wss.clients.forEach(function (client) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    });
  });
  ws.on('close', () => console.log('❌ Một thiết bị ngắt kết nối'));
  ws.onerror = (err) => console.error('⚠️ Lỗi WebSocket:', err);
});

// Lắng nghe trên mọi card mạng (0.0.0.0)
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('========================================');
  console.log(`✅ Server chạy: https://${ip}:${PORT}`);
  console.log(`📱 Link PWA:    https://${ip}:${PORT}/pwa`);
  console.log('========================================');
});