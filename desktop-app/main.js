const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

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
    if (serverProcess) return; // Tránh chạy 2 lần gây crash
    console.log('🚀 Đang khởi động server...');

    const env = { ...process.env, APP_ROOT: RESOURCES_PATH };
    
    // Khi đóng gói dùng process.execPath với electron_run_as_node, khi dev dùng trực tiếp 'node'
    if (app.isPackaged) {
        serverProcess = spawn(process.execPath, [path.join(RESOURCES_PATH, 'server.js')], {
            cwd: RESOURCES_PATH,
            env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
            stdio: 'inherit'
        });
    } else {
        serverProcess = spawn('node', [path.join(RESOURCES_PATH, 'server.js')], {
            cwd: RESOURCES_PATH,
            env: env,
            stdio: 'inherit'
        });
    }

    serverProcess.on('error', (err) => {
        console.error('❌ Lỗi tiến trình server:', err);
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
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
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

autoUpdater.autoDownload = true; // Tự tải ngầm khi có bản mới

function initAutoUpdater() {
  global.triggerCheckUpdate = () => {
    if (app.isPackaged) autoUpdater.checkForUpdates();
  };

  global.triggerInstallUpdate = () => {
    autoUpdater.quitAndInstall();
  };

  autoUpdater.on('checking-for-update', () => {
    global.updateStatus = { status: 'checking', message: 'Đang kiểm tra cập nhật...' };
  });

  autoUpdater.on('update-available', (info) => {
    global.updateStatus = { 
      status: 'downloading', 
      message: `Phát hiện bản mới v${info.version}! Đang tự tải ngầm...`,
      version: info.version 
    };
  });

  autoUpdater.on('update-not-available', () => {
    global.updateStatus = { status: 'latest', message: 'Ứng dụng đang ở bản mới nhất' };
  });

  autoUpdater.on('update-downloaded', (info) => {
    global.updateStatus = { 
      status: 'ready', 
      message: `Bản v${info.version} đã tải xong! Bấm để cập nhật.`,
      version: info.version 
    };
  });

  autoUpdater.on('error', (err) => {
    global.updateStatus = { status: 'error', message: 'Lỗi kiểm tra cập nhật: ' + err.message };
  });

  // MỞ APP TỰ CHECK LUÔN
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  }
}

ipcMain.handle('check-for-update', async () => {
  if (!app.isPackaged) {
    return {
      status: 'dev',
      message: 'Đang ở môi trường dev (chưa đóng gói), không thể kiểm tra cập nhật.'
    };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { status: 'checking', message: 'Đang tìm kiếm bản cập nhật...' };
  } catch (err) {
    return { status: 'error', message: 'Lỗi kiểm tra cập nhật: ' + err.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});