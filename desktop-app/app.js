let ws;
// === QUẢN LÝ UPDATE VÀ SETTING ===
const btnSettings = document.getElementById('btn-settings');
const updateBadge = document.getElementById('update-badge');
const updateModal = document.getElementById('update-modal');
const modalStatusText = document.getElementById('modal-status-text');
const btnInstallNow = document.getElementById('btn-install-now');
const btnManualCheck = document.getElementById('btn-manual-check');
const btnCloseModal = document.getElementById('btn-close-modal');

// 1. Lắng nghe cập nhật trạng thái từ Electron gửi về
if (window.electronAPI) {
  window.electronAPI.onUpdateStatus((data) => {
    modalStatusText.textContent = data.message || 'Hệ thống sẵn sàng';

    if (data.status === 'ready') {
      updateBadge.classList.remove('hidden');
      btnInstallNow.classList.remove('hidden');
    } else {
      btnInstallNow.classList.add('hidden');
      if (data.status !== 'downloading') {
        updateBadge.classList.add('hidden');
      }
    }
  });
}

// 2. Mở / Đóng Modal
btnSettings.onclick = () => {
  updateModal.classList.remove('hidden');
};

btnCloseModal.onclick = () => {
  updateModal.classList.add('hidden');
};

// Bấm nút kiểm tra lại
btnManualCheck.onclick = async () => {
  modalStatusText.textContent = 'Đang kiểm tra...';
  if (window.electronAPI) {
    const res = await window.electronAPI.checkUpdate();
    if (res && res.message) {
      modalStatusText.textContent = res.message;
    }
  } else {
    modalStatusText.textContent = 'Không kết nối được với Electron API';
  }
};

// 4. Bấm cài đặt ngay
btnInstallNow.onclick = () => {
  btnInstallNow.textContent = 'Đang khởi động lại...';
  btnInstallNow.disabled = true;
  if (window.electronAPI) window.electronAPI.installUpdate();
};

// 5. Tự động kiểm tra sau 2 giây khi mở app
setTimeout(() => {
  if (window.electronAPI) window.electronAPI.checkUpdate();
}, 2000);

async function init() {
  try {
    const res = await fetch('/qrcode-data');
    const data = await res.json();

    document.getElementById('qr-container').innerHTML = `<img src="${data.qrCode}" width="250">`;
    document.getElementById('link').textContent = data.url;

    ws = new WebSocket(`wss://${data.ip}:${data.port}`);

    ws.onopen = () => {
      console.log('✅ Máy tính đã kết nối, chờ nhận file...');
      const el = document.getElementById('received-files');
      el.innerHTML = '<p style="color:green;">✅ Đã sẵn sàng nhận file từ điện thoại...</p>';
    };

    ws.onmessage = (event) => {
      console.log('📥 Nhận được dữ liệu!');
      try {
        const fileData = JSON.parse(event.data);
        if (typeof fileData.name !== 'string'
          || typeof fileData.type !== 'string'
          || typeof fileData.content !== 'string') {
          throw new Error('Dữ liệu tệp không hợp lệ');
        }
        console.log('📄 Tên file:', fileData.name, 'Kích thước:', fileData.content.length);

        // Giải mã
        const binary = atob(fileData.content);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: fileData.type });
        const url = URL.createObjectURL(blob);

        // === TỰ ĐỘNG TẢI VỀ NGAY ===
        const a = document.createElement('a');
        a.href = url;
        a.download = fileData.name;
        document.body.appendChild(a);
        a.click(); // Tự động bấm
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        // === Hiển thị thông báo ===
        const fileList = document.getElementById('received-files');
        const message = document.createElement('p');
        message.style.cssText = 'padding:10px;background:#f0fdf4;border-radius:6px;margin:8px 0;border-left:4px solid #22c55e;';
        message.textContent = `✅ ${fileData.name} — 📂 Đã tự động lưu vào thư mục Tải xuống của trình duyệt`;
        fileList.appendChild(message);

      } catch (parseErr) {
        console.error('❌ Lỗi phân tích dữ liệu:', parseErr);
        const message = document.createElement('p');
        message.style.color = 'red';
        message.textContent = '❌ Không thể nhận tệp: ' + parseErr.message;
        document.getElementById('received-files').appendChild(message);
      }
    };

    ws.onclose = () => {
      console.log('❌ Mất kết nối');
      const el = document.getElementById('received-files');
      el.innerHTML += '<p style="color:red;">⚠️ Mất kết nối, tải lại trang</p>';
    };

    ws.onerror = (e) => console.error('⚠️ Lỗi kết nối máy tính:', e);

  } catch (err) {
    console.error('❌ Lỗi khởi tạo:', err);
  }
}
init();