const { jsPDF } = window.jspdf;
let ws = null;
let docVideo = null;
let pages = [];

// ==================== Bước 1: Quét QR kết nối ====================
async function startQRScan() {
  const status = document.getElementById('status');

  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = '❌ Trình duyệt không hỗ trợ camera!';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });

    const video = document.getElementById('qr-video');
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    await video.play();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scan = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);

        if (code && code.data.startsWith('http')) {
          stream.getTracks().forEach(t => t.stop());
          connectServer(code.data);
          return;
        }
      }
      requestAnimationFrame(scan);
    };
    scan();

  } catch (err) {
    status.textContent = '❌ ' + (err.name === 'NotAllowedError'
      ? 'Vui lòng cho phép camera'
      : err.message);
  }
}

function connectServer(pwaUrl) {
  const url = new URL(pwaUrl);
  const wsUrl = `wss://${url.host}`;

  document.getElementById('status').textContent = '🔗 Đang kết nối...';
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    document.getElementById('connect-step').style.display = 'none';
    document.getElementById('scan-step').style.display = 'block';
    initDocCamera();
  };

  ws.onclose = () => {
    document.getElementById('scan-status').textContent = '❌ Mất kết nối, quét lại QR';
  };
}

// ==================== Bước 2: Camera quét tài liệu ====================
async function initDocCamera() {
  docVideo = document.getElementById('doc-video');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1600 },
        height: { ideal: 900 }
      }
    });
    docVideo.srcObject = stream;
    docVideo.setAttribute('playsinline', 'true');
    await docVideo.play();
    document.getElementById('scan-status').textContent = '✅ Sẵn sàng — Đặt tài liệu vào khung xanh';

  } catch (err) {
    document.getElementById('scan-status').textContent = '❌ Lỗi camera: ' + err.message;
  }
}

// ==================== Bước 3: Chụp & xử lý ảnh ====================
document.getElementById('capture-btn').addEventListener('click', async () => {
  if (!docVideo || !docVideo.videoWidth) {
    alert('Camera chưa sẵn sàng, chờ chút!');
    return;
  }

  const btn = document.getElementById('capture-btn');
  btn.disabled = true;
  setStatus('⏳ Đang xử lý...');

  // Bước 1: Chụp ảnh gốc
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = docVideo.videoWidth;
  fullCanvas.height = docVideo.videoHeight;
  const fctx = fullCanvas.getContext('2d');
  fctx.drawImage(docVideo, 0, 0);

  // Bước 2: Cắt theo khung an toàn — bỏ viền ngoài
  const w = fullCanvas.width;
  const h = fullCanvas.height;
  const marginX = w * 0.08;  // bỏ 8% hai bên
  const marginY = h * 0.12;  // bỏ 12% trên dưới
  const cropW = w - marginX * 2;
  const cropH = h - marginY * 2;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cctx = cropCanvas.getContext('2d');
  cctx.drawImage(fullCanvas, marginX, marginY, cropW, cropH, 0, 0, cropW, cropH);

  // Bước 3: Tối ưu — nền trắng, chữ rõ
  const imgData = cctx.getImageData(0, 0, cropW, cropH);
  const d = imgData.data;

  // Tính sáng trung bình để cân bằng
  let totalBright = 0;
  for (let i = 0; i < d.length; i += 4) {
    totalBright += (d[i] + d[i+1] + d[i+2]) / 3;
  }
  const avgBright = totalBright / (d.length / 4);
  const brightAdjust = avgBright < 180 ? 180 - avgBright : 0;

  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;

    if (gray > 200) {
      d[i] = d[i+1] = d[i+2] = 255;  // nền trắng
    } else if (gray < 140) {
      d[i] = d[i+1] = d[i+2] = 10;   // chữ đen
    } else {
      const val = Math.min(255, gray + brightAdjust);
      d[i] = d[i+1] = d[i+2] = val;  // vùng trung bình làm sáng
    }
  }
  cctx.putImageData(imgData, 0, 0);

  // Lưu trang
  pages.push(cropCanvas.toDataURL('image/jpeg', 0.95));
  updateUI();
  setStatus(`✅ Đã lưu trang ${pages.length}`);
  btn.disabled = false;
});

function setStatus(text) {
  document.getElementById('scan-status').textContent = text;
}

function updateUI() {
  document.getElementById('page-count').textContent = pages.length;
  document.getElementById('pdf-btn').disabled = pages.length === 0;

  const container = document.getElementById('thumbnails');
  container.innerHTML = '';
  pages.forEach((url, idx) => {
    const div = document.createElement('div');
    div.className = 'thumbnail';
    div.innerHTML = `
      <img src="${url}" alt="Trang ${idx+1}">
      <button class="del-page" data-idx="${idx}">×</button>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll('.del-page').forEach(btn => {
    btn.onclick = () => {
      pages.splice(+btn.dataset.idx, 1);
      updateUI();
    };
  });
}

// ==================== Bước 4: Tạo & gửi PDF ====================
document.getElementById('pdf-btn').addEventListener('click', async () => {
  if (!pages.length) return alert('Chưa có trang nào!');
  if (!ws || ws.readyState !== WebSocket.OPEN) return alert('Mất kết nối, quét lại QR');

  const status = document.getElementById('final-status');
  status.textContent = '📄 Đang tạo PDF...';

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = 210, pageH = 297, margin = 15;

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const img = new Image();
    img.src = pages[i];
    await new Promise(r => { img.onload = r; });

    const scale = Math.min((pageW - margin*2) / img.width, (pageH - margin*2) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    pdf.addImage(pages[i], 'JPEG', (pageW - w)/2, margin, w, h);
  }

  // Chuyển base64 — không dùng spread tránh lỗi
  const buf = pdf.output('arraybuffer');
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // Gửi
  const fileName = `TaiLieu_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.pdf`;
  ws.send(JSON.stringify({
    name: fileName,
    type: 'application/pdf',
    content: base64
  }));

  status.textContent = '✅ Đã gửi! Kiểm tra máy tính để nhận file';
  setTimeout(() => {
    pages = [];
    updateUI();
    status.textContent = '';
  }, 4000);
});

// Đăng ký Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('✅ Service Worker Scope:', reg.scope);
      })
      .catch((err) => {
        console.error('❌ Service Worker thất bại:', err);
      });
  });
}

// ==================== Cấu hình PWA & Nút cài đặt ====================
let deferredPrompt = null;
const installBtn = document.getElementById('pwa-install-btn');

// 1. Lắng nghe sự kiện trình duyệt cho phép cài đặt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) {
    installBtn.style.display = 'inline-flex'; // Hiện nút cài đặt
  }
});

// 2. Bắt sự kiện bấm nút
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('Người dùng chọn:', outcome);
    deferredPrompt = null;
    installBtn.style.display = 'none';
  });
}

// 3. Ẩn nút sau khi đã cài
window.addEventListener('appinstalled', () => {
  console.log('✅ PWA đã được cài đặt thành công!');
  if (installBtn) installBtn.style.display = 'none';
});

// 4. Đăng ký Service Worker với scope toàn trang
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => console.log('✅ Service Worker đã đăng ký:', reg.scope))
      .catch(err => console.error('❌ Lỗi Service Worker:', err));
  });
}

// Bắt đầu
startQRScan();