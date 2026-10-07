const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

// === Đường dẫn tài nguyên khi đóng gói ===
const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath)
    : __dirname;

// === Bỏ kiểm tra chứng chỉ tự ký — QUAN TRỌNG ===
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost', 'true');

let mainWindow;
let serverProcess;
const PORT = 3000;



function waitForPort(port, host = '127.0.0.1', timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const check = () => {
            const socket = new net.Socket();
            socket.setTimeout(500);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('error', () => socket.destroy());
            socket.on('close', () => {
                if (Date.now() - startTime > timeoutMs) return reject(new Error('Het thoi gian cho port'));
                setTimeout(check, 300);
            });
            socket.connect(port, host);
        };
        check();
    });
}

// === Khởi động server với đường dẫn đúng ===
function startServer() {
    console.log('🚀 Dang khoi dong server...');

    // Truyền đường dẫn gốc vào server qua biến môi trường
    const env = { ...process.env, APP_ROOT: RESOURCES_PATH };

    serverProcess = spawn('node', ['server.js'], {
        cwd: RESOURCES_PATH,
        env: env,
        stdio: 'inherit',
        shell: true
    });
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 540,
        height: 720,
        title: 'Gidu Scan',
        backgroundColor: '#f0f4ff',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        show: false
    });

    try {
        await waitForPort(PORT);
        console.log('✅ Server sẵn sàng! Đang tải giao diện...');

        // Tải bằng IP nội bộ (không dùng 127.0.0.1)
        await mainWindow.loadURL(`https://localhost:${PORT}`, {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });

        mainWindow.show();
        console.log('✅ Giao diện đã hiện!');

    } catch (err) {
        mainWindow.show();
        mainWindow.loadURL(`data:text/html;charset=utf-8,
      <body style="font-family:Arial; padding:30px; text-align:center;">
        <h2 style="color:#ef4444">❌ Không tải được giao diện</h2>
        <p>Đã chờ server nhưng không phản hồi</p>
        <p>Lỗi: ${err.message}</p>
        <button onclick="location.reload()" style="padding:10px 20px; margin-top:20px; cursor:pointer;">Thử lại</button>
      </body>
    `);
    }

    mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
    // Xóa bộ nhớ đệm chứng chỉ cũ
    session.defaultSession.clearCache();
    startServer();
    createWindow();
});

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});