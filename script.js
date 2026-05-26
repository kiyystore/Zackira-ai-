// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyDjcJz9Ugb9HH96cHEYq1zCP_0Qe372B24",
  authDomain: "zackira-ai.firebaseapp.com",
  projectId: "zackira-ai",
  storageBucket: "zackira-ai.firebasestorage.app",
  messagingSenderId: "798373261003",
  appId: "1:798373261003:web:7c566d4e351c816efdb54e",
  measurementId: "G-8G40YZT5ND"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;

// FUNGSI LOGIN / LOGOUT
function handleAuth() {
    if (currentUser) {
        auth.signOut().then(() => alert("Berhasil Logout!"));
    } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithRedirect(provider).catch(err => alert("Gagal login: " + err.message));
    }
}

// --- KONFIGURASI ---
const BACKEND_URL = "/api/chat";
let USER_ID =
    localStorage.getItem("zackira_user_id");

if (!USER_ID) {

    USER_ID =
        "user-" +
        Math.random().toString(36).substring(2);

    localStorage.setItem(
        "zackira_user_id",
        USER_ID
    );

}

let MODEL = "";
const SYSTEM_PROMPT = `
Kamu adalah Zackira, sebuah Ai yang di buat oleh zack. Jika ada yang bertanya siapa Zack, maka jawab bahwa dia adalah pencipta mu. Ikuti pedoman di bawah untuk setiap respon

Selalu:
- Jawab dengan rapi dan mudah dipahami
- Gunakan markdown jika diperlukan
- Berikan penjelasan detail jika diminta
- Jangan membuat jawaban terlalu pendek
- Sesuaikan gaya bicara, sifat dan tingkat humor kamu sebagai berikut: `;
const ORIGINAL_ICON = "https://i.ibb.co.com/JWLFkL8R/send-1.png";
const STOP_ICON = "https://i.ibb.co.com/k2DBfzL7/stop.png";
// --- KONFIGURASI LIMIT MODEL ---
// Tentukan model mana saja yang ingin dibatasi. Jika tidak ada di sini, berarti Unlimited.
const MODEL_LIMITS = {
  "openai/gpt-oss-120b": { maxUses: 20, lockHours: 2 },
  "llama-3.3-70b-versatile": { maxUses: 20, lockHours: 2 },
  "qwen/qwen3-32b": { maxUses: 15, lockHours: 2 },
};

let currentSessionId = Date.now();
let chatHistory = [{ role: "system", content: SYSTEM_PROMPT }];
let allSessions = [];
let currentController = null;
let stopTyping = false;
let loadingInterval = null;
let currentBotMessageDiv = null;
let stopNoticeDiv = null;
let realtimeThinkingText = "";
let activePreset = null;
let presetChangedManually = false;

// Element DOM
const chatBox = document.getElementById("chatBox");
const userInput = document.getElementById("userInput");
// --- AUTO SCROLL LOGIC ---
let autoScrollEnabled = true;
let userScrolling = false;
let programmaticScroll = false;
const SCROLL_THRESHOLD = 30;

function isChatAtBottom() {
  return (
    chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight <=
    SCROLL_THRESHOLD
  );
}

// Fungsi pembantu untuk mengambil data penggunaan model dari Local Storage
function getModelUsage(modelId) {
  const usageData =
    JSON.parse(localStorage.getItem("zackira_model_usage")) || {};
  return usageData[modelId] || { count: 0, lockUntil: 0 };
}

function checkInputLock() {
  const currentModelText = document.getElementById(
    "currentModelDisplay",
  ).innerText;
  const sendBtn = document.querySelector(".send-btn");

  // 1. Jika belum pilih model
  if (currentModelText === "Pilih model") {
    userInput.disabled = true;
    userInput.placeholder = "Silakan pilih model AI terlebih dahulu...";
    sendBtn.disabled = true;
    return true;
  }

  // 2. Cek apakah model yang dipilih sedang terkunci
  const usage = getModelUsage(MODEL);
  const now = Date.now();

  if (usage.lockUntil > now) {
    // Hitung sisa waktu mundur
    const remainingMs = usage.lockUntil - now;
    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remainingMins = Math.ceil(
      (remainingMs % (1000 * 60 * 60)) / (1000 * 60),
    );

    userInput.disabled = true;
    userInput.value = "";
    userInput.placeholder = `<img src="https://i.ibb.co.com/pCwLqNv/padlock.png" style="width:14px;height:14px;vertical-align:middle;"> Terkunci! Coba lagi dalam ${remainingHours} jam ${remainingMins} mnt.`;
    sendBtn.disabled = true;
    return true; // Status: Terkunci
  } else {
    // Buka kunci dan berikan info sisa pemakaian (jika ada limitnya)
    userInput.disabled = false;
    sendBtn.disabled = false;

    if (MODEL_LIMITS[MODEL]) {
      const sisa = MODEL_LIMITS[MODEL].maxUses - usage.count;
      userInput.placeholder = `Minta Zackira...`;
    } else {
      userInput.placeholder = "Minta Zackira...";
    }
    return false; // Status: Aman
  }
}

// --- LOGIKA SIDEBAR & SEARCH ---
function hideAllDeleteButtons() {
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.style.display = "none";
  });
}

// --- LOGIKA SIDEBAR & SEARCH ---
function toggleSidebar() {

    const sidebar =
        document.getElementById(
            "sidebar"
        );

    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );

    // cek apakah sidebar sedang aktif
    const isActive =
        sidebar.classList.contains(
            "active"
        );

    // tutup semua panel
    closeAllPanels();

    // jika sebelumnya belum aktif
    // buka lagi sidebar nya
    if (!isActive) {

        sidebar.classList.add(
            "active"
        );

        overlay.classList.add(
            "active"
        );

    }

    if (!sidebar.classList.contains("active")) {

        hideAllDeleteButtons();

    }

}

function toggleSearchBar() {
  const container = document.getElementById("searchContainer");
  const btn = document.getElementById("toggleSearchBtn");
  if (container.style.display === "block") {
    container.style.display = "none";
    btn.style.display = "flex";
    document.getElementById("searchInput").value = "";
    renderHistoryList();
  } else {
    container.style.display = "block";
    btn.style.display = "none";
    document.getElementById("searchInput").focus();
  }
}

function filterHistory() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  renderHistoryList(query);
}

// --- MANAJEMEN RIWAYAT (LOCAL STORAGE) ---
let pressTimer;
let isLongPress = false;

function renderHistoryList(filter = "") {
  const list = document.getElementById("historyList");
  list.innerHTML = "";

  // 1. Cek apakah riwayat chat memang benar-benar kosong sejak awal
  if (allSessions.length === 0) {
    list.innerHTML =
      '<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 20px 0; font-style: italic;">Belum ada riwayat obrolan</div>';
    return;
  }

  // Pastikan filter juga diubah ke huruf kecil agar pencarian tidak sensitif huruf besar/kecil
  const filtered = allSessions.filter((s) =>
    s.title.toLowerCase().includes(filter.toLowerCase()),
  );

  // 2. Cek apakah hasil pencarian tidak menemukan kecocokan (padahal riwayat chat ada)
  if (filtered.length === 0) {
    list.innerHTML =
      '<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 20px 0; font-style: italic;">Tidak menemukan riwayat yang sesuai</div>';
    return;
  }

  filtered.forEach((session) => {
    const wrapper = document.createElement("div");
    wrapper.className = "history-item-wrapper";

    const item = document.createElement("div");
    item.className = "history-item";
    item.innerText = session.title;

    // Long Press Logic untuk memunculkan tombol hapus
    const start = () => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        document
          .querySelectorAll(".delete-btn")
          .forEach((b) => (b.style.display = "none"));
        document.getElementById(`del-${session.id}`).style.display = "block";
      }, 500);
    };
    const end = () => clearTimeout(pressTimer);

    item.onmousedown = start;
    item.onmouseup = end;
    item.ontouchstart = start;
    item.ontouchend = end;

    item.onclick = () => {
      if (!isLongPress) loadSession(session.id);
    };

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.id = `del-${session.id}`;
    delBtn.innerText = "Hapus";
    delBtn.onclick = () => deleteChat(session.id);

    wrapper.append(item, delBtn);
    list.appendChild(wrapper);
  });
}

function saveSession() {
  if (chatHistory.length <= 1) return;
  const firstMsg = chatHistory.find((m) => m.role === "user");
  const title = firstMsg
    ? firstMsg.content.substring(0, 30) + "..."
    : "Percakapan";

  const sessionData = { id: currentSessionId, title, messages: chatHistory };
  const idx = allSessions.findIndex((s) => s.id === currentSessionId);

  if (idx > -1) allSessions[idx] = sessionData;
  else allSessions.unshift(sessionData);

  // Simpan permanen ke Firebase jika login, jika tidak fallback ke local storage
  if (currentUser) {
      db.collection("users").doc(currentUser.uid).set({
          sessions: allSessions
      }).catch(err => console.error("Gagal menyimpan ke Firebase:", err));
  } else {
      localStorage.setItem("zackira_sessions", JSON.stringify(allSessions));
  }
  
  renderHistoryList();
}

let sessionIdToDelete = null;

function deleteChat(id) {
  sessionIdToDelete = id;
  const modal = document.getElementById("confirmModal");
  modal.style.display = "flex";

  // Logika Tombol OK
  document.getElementById("confirmDelete").onclick = () => {
    allSessions = allSessions.filter((s) => s.id !== sessionIdToDelete);
    
    // Hapus dari Firebase atau Local Storage
    if (currentUser) {
        db.collection("users").doc(currentUser.uid).set({
            sessions: allSessions
        }).catch(err => console.error("Gagal menghapus dari Firebase:", err));
    } else {
        localStorage.setItem("zackira_sessions", JSON.stringify(allSessions));
    }

    renderHistoryList();
    if (sessionIdToDelete === currentSessionId) {
      newConversation();
    }

    closeConfirmModal();
  };

  // Logika Tombol Batalkan
  document.getElementById("cancelDelete").onclick = () => {
    closeConfirmModal();
  };
}


function closeConfirmModal() {
  document.getElementById("confirmModal").style.display = "none";
  sessionIdToDelete = null;
  hideAllDeleteButtons(); // Memastikan tombol hapus merah juga hilang
}

function loadSession(id) {
  const session = allSessions.find((s) => s.id === id);
  if (!session) return;

  currentSessionId = session.id;

  // =========================
  // BERSIHKAN CHAT LAMA
  // =========================
  chatBox.innerHTML = "";

  // Kembalikan loading indicator
  chatBox.innerHTML = `
        <div class="loading-container" id="loadingIndicator" style="display: none;">
            <div class="loading-orbit">
                <div class="orbit-ring"></div>

                <img 
                    src="/images/android-chrome-512x512.png" 
                    class="loading-logo"
                    alt="Zackira AI"
                >
            </div>

            <span id="loadingText">Menganalisis...</span>
        </div>
    `;

  // Deep copy
  chatHistory = JSON.parse(JSON.stringify(session.messages));

  // Render ulang pesan
  chatHistory.forEach((msg) => {
    if (msg.role === "system") return;

    appendMessage(msg.role === "assistant" ? "bot" : "user", msg.content);
  });

  toggleSidebar();

  scrollToBottom(true);
}

function newConversation() {
  // =========================
// SISTEM IKLAN ANTI SPAM
// =========================

let adCounter = parseInt(localStorage.getItem("adCounter")) || 0;

adCounter++;

localStorage.setItem("adCounter", adCounter);

// Iklan muncul setiap 3x obrolan baru
if (adCounter % 3 === 1) {
    showInterstitialAd();
}

  currentSessionId = Date.now();

  chatHistory = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
  ];

  // =========================
  // BERSIHKAN CHAT LAMA
  // =========================
  chatBox.innerHTML = "";

  // Tambahkan lagi loading indicator
  chatBox.innerHTML = `
        <div class="loading-container" id="loadingIndicator" style="display: none;">
            <div class="loading-orbit">
                <div class="orbit-ring"></div>

                <img 
                    src="android-chrome-512x512.png" 
                    class="loading-logo"
                    alt="Zackira AI"
                >
            </div>

            <span id="loadingText">Menganalisis...</span>
        </div>
    `;

  // Reset model
  MODEL = "";

  document.getElementById("currentModelDisplay").innerText = "Pilih model";

  const options = document.querySelectorAll(".model-option");

  options.forEach((opt) => opt.classList.remove("active"));

  checkInputLock();

  // Salam awal
  const greeting = appendMessage(
    "bot",
    "Halo! 👋 Namaku Zackira. Ada yang bisa kubantu hari ini?",
  );

  greeting.id = "greetingWrapper";

  if (window.innerWidth < 768) {
    toggleSidebar();
  }

  scrollToBottom(true);
}

function buildPersonaPrompt() {
  const tone = document.getElementById("toneSelected")?.textContent || "Santai";

  const personality =
    document.getElementById("personalitySelected")?.textContent || "Ramah";

  const humor = humorSlider?.value || 50;

  return `
Pedoman kamu saat ini harus:
- Nada bicara: ${tone}
- Sifat: ${personality}
- Tingkat humor: ${humor}%
Ikuti pedoman ini secara konsisten pada seluruh respon. Jangan lupa gunakan emoji sesuaikan dengan pedoman ini.
`;
}

// --- SISTEM CHAT ---
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;
  removeStopNotice();

  const sendBtn = document.querySelector(".send-btn");

  // --- UBAH TOMBOL JADI TOMBOL STOP ---
  sendBtn.onclick = stopResponse;
  sendBtn.innerHTML = `
        <div class="stop-btn-wrapper">
            <img src="${STOP_ICON}" class="stop-square" alt="Stop">
        </div>
    `;

  userInput.disabled = true;

  const greeting = document.getElementById("greetingWrapper");

  if (greeting) {
    greeting.remove();
  }

  appendMessage("user", text);
  userInput.value = "";
  chatHistory.push({ role: "user", content: text });
  saveSession();
  const startTime = performance.now();

  // Tampilkan Indikator Loading
  const loader = document.getElementById("loadingIndicator");
  const loadingTextEl = document.getElementById("loadingText");
  loader.style.display = "flex";
  scrollToBottom();

  // Setup Penghenti Respon
  currentController = new AbortController();
  stopTyping = false;
  currentBotMessageDiv = null;

  try {
    // Panggil Backend (bukan Groq lagi)
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        // HAPUS header 'Authorization' di sini karena sudah diurus Backend!
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `
${SYSTEM_PROMPT}

${buildPersonaPrompt()}
`,
          },

          ...chatHistory.filter((msg) => msg.role !== "system"),
        ],
        temperature: 0.7,
        stream: true, // Tetap gunakan stream
      }),
      signal: currentController.signal,
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let fullReply = "";
    let thinkingBuffer = "";

    loader.style.display = "flex";
    loadingTextEl.innerText = "Memulai proses...";
    let streamBuffer = "";
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      streamBuffer += decoder.decode(value, { stream: true });

      const lines = streamBuffer.split("\n");

      streamBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const data = line.replace(/^data:\s*/, "");

        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);

          const token = parsed.choices?.[0]?.delta?.content || "";

          if (!token) continue;

          fullReply += token;
          // ===== THINKING TEXT REALTIME FINAL FIX =====
          thinkingBuffer += token;

          // Bersihkan markdown
          const cleaned = thinkingBuffer
            .replace(/[#*_`~>|-]/g, "")
            .replace(/\s+/g, " ")
            .trim();

          // Ambil beberapa kata TERAKHIR yang UTUH
          const words = cleaned.split(" ");

          // Hindari kata terpotong di akhir token stream
          const stableWords = words.slice(
            Math.max(words.length - 10, 0),
            words.length - 1,
          );

          const finalText = stableWords.join(" ");

          clearTimeout(window.loadingTextTimeout);

          window.loadingTextTimeout = setTimeout(() => {
            loadingTextEl.innerText = finalText || "Berpikir...";
          }, 25);
        } catch (e) {}
      }
    }
    clearInterval(loadingInterval);

    // Jika tombol stop ditekan tepat sebelum ngetik, batalkan
    if (stopTyping) {
      loader.style.display = "none";
    }
    removeStopNotice();
    const aiImage = localStorage.getItem("aiProfileImage") || "https://i.ibb.co.com/ZRXdPw3h/profile-picture.png";
    const botWrapper = document.createElement("div");
    botWrapper.className = "bot-message-wrapper";
    const botProfile = document.createElement("img");
    botProfile.className = "ai-profile-icon";
    botProfile.src = aiImage;

    currentBotMessageDiv = document.createElement("div");
    currentBotMessageDiv.className = "message bot";

    botWrapper.appendChild(botProfile);
    botWrapper.appendChild(currentBotMessageDiv);

// PERUBAHAN 1: Sisipkan pesan bot SETELAH loading indicator.
// Dengan begini, teks akan memanjang ke bawah dan loading tetap diam di atasnya.
chatBox.insertBefore(botWrapper, loader.nextSibling);
    // Tunggu efek ngetik sampai beres
    const finalReply = await typeWriterEffect(currentBotMessageDiv, fullReply);
    
    // ANALYTICS END
    const endTime = performance.now();

    const responseTime = Math.round(endTime - startTime);

    // KIRIM DATA KE DASHBOARD
    await fetch("http://localhost:3001/analytics", {

    method: "POST",

    headers: {
        "Content-Type": "application/json"
    },

    body: JSON.stringify({
        userId: USER_ID,
        model: MODEL,
        responseTime,
        message: text

    })

});

    // PERUBAHAN 2: Setelah selesai mengetik, pindahkan kembali elemen loading
    // ke posisi paling bawah agar siap digunakan untuk chat berikutnya.
    chatBox.appendChild(loader);
    loader.style.display = "none";

    // HANYA simpan ke riwayat jika TIDAK dihentikan (finalReply tidak null)
    if (finalReply !== null) {
      chatHistory.push({ role: "assistant", content: finalReply });
      saveSession();

      // Update Limit Pemakaian
      if (MODEL_LIMITS[MODEL]) {
        let usageData =
          JSON.parse(localStorage.getItem("zackira_model_usage")) || {};
        let usage = usageData[MODEL] || { count: 0, lockUntil: 0 };

        usage.count++;
        if (usage.count >= MODEL_LIMITS[MODEL].maxUses) {
          const lockTimeMs = MODEL_LIMITS[MODEL].lockHours * 60 * 60 * 1000;
          usage.lockUntil = Date.now() + lockTimeMs;
          usage.count = 0;
        }
        usageData[MODEL] = usage;
        localStorage.setItem("zackira_model_usage", JSON.stringify(usageData));
      }
      checkInputLock();
    }
  } catch (err) {
    loader.style.display = "none";
    clearInterval(loadingInterval);

    // Jika error karena dihentikan user, jangan tampilkan pesan error
    if (err.name !== "AbortError") {
      appendMessage("bot", "Maaf, sistem sedang sibuk.");
    }
  } finally {
    resetSendButton();
  }
}

function stopResponse() {
  stopTyping = true; // Hentikan proses animasi ngetik

  if (currentController) {
    currentController.abort(); // Batalkan permintaan jaringan ke API
  }

  // HAPUS pesan AI yang masih setengah jadi dari layar
  if (currentBotMessageDiv) {
    const botWrapper =
        currentBotMessageDiv.closest(
            '.bot-message-wrapper'
        );
        
    if (botWrapper) {
        botWrapper.remove();
    } else {
        currentBotMessageDiv.remove();
    }
    currentBotMessageDiv = null;
}
  showStopNotice();
  resetSendButton();
}

function resetSendButton() {
  const sendBtn = document.querySelector(".send-btn");
  sendBtn.onclick = sendMessage; // Kembalikan fungsi tombol menjadi kirim
  sendBtn.innerHTML = `<img src="${ORIGINAL_ICON}" alt="Send" class="send-icon">`;
  userInput.disabled = false;
  if (window.innerWidth > 768) userInput.focus();
}

// --- FUNGSI MENGGANTI MODEL AI ---
function selectModel(modelValue, displayTitle, description) {
  const usage = getModelUsage(modelValue);

  // CEK KUNCI
  if (usage.lockUntil > Date.now()) {
    const lockTime = new Date(usage.lockUntil);
    const jam = lockTime.getHours().toString().padStart(2, "0");
    const menit = lockTime.getMinutes().toString().padStart(2, "0");
    closeModelSheet();

    setTimeout(() => {
      showCustomAlert(
        `Model ${displayTitle} sedang terkunci sampai pukul ${jam}:${menit}.`,
      );
    }, 300);

    return;
  }

  // Jika tidak terkunci, jalankan sisa logic pemilihan model
  MODEL = modelValue;
  document.getElementById("currentModelDisplay").innerText = displayTitle;

  const options = document.querySelectorAll(".model-option");
  options.forEach((opt) => opt.classList.remove("active"));

  // Gunakan event.currentTarget jika dipanggil via onclick
  if (event && event.currentTarget) {
    event.currentTarget.classList.add("active");
  }

  checkInputLock();
  closeModelSheet();
}

function appendMessage(sender, text) {
  /* =========================
       USER MESSAGE
    ========================= */

  if (sender !== "bot") {
    const div = document.createElement("div");

    div.className = `message ${sender}`;

    const textSpan = document.createElement("span");

    textSpan.textContent = text;

    div.appendChild(textSpan);

    chatBox.insertBefore(div, document.getElementById("loadingIndicator"));

    scrollToBottom(true);

    return div;
  }

  /* =========================
       BOT MESSAGE + PROFILE
    ========================= */

  const wrapper = document.createElement("div");

  wrapper.className = "bot-message-wrapper";

  const aiImage =
    localStorage.getItem("aiProfileImage") ||
    "https://i.ibb.co.com/ZRXdPw3h/profile-picture.png";

  const hasText = text && text.trim() !== "";

  wrapper.innerHTML = `

    ${
      hasText
        ? `
        <img
            class="ai-profile-icon"
            src="${aiImage}"
        >
        `
        : ""
    }

    ${
      hasText
        ? `
        <div class="message bot">
            ${marked.parse(text)}
        </div>
        `
        : ""
    }

    `;

  chatBox.insertBefore(wrapper, document.getElementById("loadingIndicator"));

  const botBubble = wrapper.querySelector(".message.bot");

  formatCodeBlocks(botBubble);

  scrollToBottom(true);

  return wrapper;
}

function openModelSheet() {
  closeAllPanels();
  if (typeof closePersonaPanel === "function") {
    try {
      closePersonaPanel();
    } catch (e) {}
  }
  document.querySelector(".chevron-up")?.classList.add("rotate");
  const overlay = document.getElementById("modelSheetOverlay");
  const bottomSheet = document.querySelector(".bottom-sheet"); // Ambil elemen sheet
  const options = document.querySelectorAll(".model-option");

  // PENTING: Bersihkan sisa gaya tarikan dari aksi drag sebelumnya
  bottomSheet.style.transform = "";

  options.forEach((opt) => {
    const onclickStr = opt.getAttribute("onclick");
    if (!onclickStr) return;

    const parts = onclickStr.split("'");
    const modelId = parts[1];
    const originalDesc = parts[5];

    if (modelId && MODEL_LIMITS[modelId]) {
      const usage = getModelUsage(modelId);
      const descSpan = opt.querySelector(".option-desc");

      if (usage.lockUntil > Date.now()) {
        const lockTime = new Date(usage.lockUntil);
        const jam = lockTime.getHours().toString().padStart(2, "0");
        const menit = lockTime.getMinutes().toString().padStart(2, "0");

        opt.classList.add("locked");
        descSpan.innerText = `⏳ Terkunci sampai pukul: ${jam}:${menit}`;
      } else {
        opt.classList.remove("locked");
        descSpan.innerText = originalDesc;
      }
    }
  });

  overlay.style.display = "flex";
  setTimeout(() => overlay.classList.add("active"), 10);
}

function closeModelSheet() {
  document.querySelector(".chevron-up")?.classList.remove("rotate");
  const overlay = document.getElementById("modelSheetOverlay");
  const chevron = document.querySelector(".chevron-up");
  const bottomSheet = document.querySelector(".bottom-sheet"); // Ambil elemen sheet

  overlay.classList.remove("active");
  if (chevron) chevron.classList.remove("rotate");

  // PENTING: Bersihkan gaya tarikan agar panel mau tertutup rapat
  bottomSheet.style.transform = "";

  setTimeout(() => {
    overlay.style.display = "none";
  }, 300);
}

function showCustomAlert(message) {
  const alertModal = document.getElementById("alertModal");
  const alertMessage = document.getElementById("alertMessage");

  alertMessage.innerText = message;
  alertModal.style.display = "flex";
  setTimeout(() => {
    alertModal.classList.add("active");
  }, 25);
}

function closeCustomAlert() {
  const alertModal = document.getElementById("alertModal");
  alertModal.classList.remove("active");
  setTimeout(() => {
    alertModal.style.display = "none";
  }, 300);
}

// --- LOGIKA ENTER BARU ---
userInput.addEventListener("keydown", (e) => {
  // Di Desktop: Enter untuk Kirim, Shift+Enter untuk baris baru
  // Di HP: Tombol Enter (panah bawah) akan otomatis membuat baris baru
  if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 768) {
    e.preventDefault();
    sendMessage();
  }
});

// Fungsi baru untuk merapikan blok kode dan menambahkan tombol Copy
function formatCodeBlocks(messageDiv) {
  const preTags = messageDiv.querySelectorAll("pre");
  preTags.forEach((pre) => {
    // Cegah pembuatan wrapper ganda jika sudah ada
    if (pre.parentNode.classList.contains("code-wrapper")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "code-wrapper";

    const header = document.createElement("div");
    header.className = "code-header";

    const codeEl = pre.querySelector("code");
    const langClass = codeEl
      ? Array.from(codeEl.classList).find((c) => c.startsWith("language-"))
      : null;
    const langName = langClass ? langClass.replace("language-", "") : "code";

    const langSpan = document.createElement("span");
    langSpan.innerText = langName;

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.innerHTML =
      '<img src="https://i.ibb.co.com/4gCMSLHy/copy.png" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"> Copy';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(codeEl.innerText);
      copyBtn.innerHTML =
        '<img src="https://i.ibb.co.com/3ytJ4NNL/check-mark.png" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"> Copied!';
      setTimeout(() => {
        copyBtn.innerHTML =
          '<img src="https://i.ibb.co.com/4gCMSLHy/copy.png" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"> Copy';
      }, 2000);
    };

    header.appendChild(langSpan);
    header.appendChild(copyBtn);

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });
}

function typeWriterEffect(element, fullText) {
  return new Promise((resolve) => {
    let currentText = "";
    let i = 0;

    const speed = 25;
    const charsPerTick = 1;

    const typingInterval = setInterval(() => {
      // Stop jika user tekan tombol stop
      if (stopTyping) {
        clearInterval(typingInterval);
        resolve(null);
        return;
      }

      // Tambahkan karakter sedikit demi sedikit
      const nextChunk = fullText.substring(i, i + charsPerTick);

      if (nextChunk) {
        currentText += nextChunk;
      }

      i += charsPerTick;
      // Render markdown dengan aman
      try {
        // Simpan posisi scroll sebelum update
        const wasAtBottom = isChatAtBottom();

        // Gunakan marked parse
        element.innerHTML = marked.parse(currentText + " ");

        // Rapikan code block
        formatCodeBlocks(element);

        // Auto scroll jika sebelumnya di bawah
        if (wasAtBottom) {
          scrollToBottom(true);
        }
      } catch (err) {
        // Fallback jika markdown error
        element.textContent = currentText;
      }

      // Jika selesai
      if (i >= fullText.length) {
        clearInterval(typingInterval);

        // Final render agar tidak ada karakter hilang
        element.innerHTML = marked.parse(fullText);

        formatCodeBlocks(element);

        resolve(fullText);
      }
    }, speed);
  });
}

function cleanThinkingText(text) {
  return text
    .replace(/[#*_`~>-]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.,!?():]/gu, "")
    .trim();
}

function extractThinkingText(text) {
  const clean = text
    .replace(/[#*_`>-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const parts = clean.split(/[.!?]/);

  return parts[parts.length - 1] || "Berpikir...";
}

// --- FITUR DRAG & SWIPE BOTTOM SHEET (SMOOTH VERSION) ---
const bottomSheetElemen = document.querySelector(".bottom-sheet");
const sheetHandleElemen = document.querySelector(".sheet-handle");
// Tambahan: Ambil juga bagian header (judul) agar area yang bisa ditarik lebih luas
const sheetHeaderElemen = document.querySelector(".sheet-header");

let startY = 0;
let currentY = 0;
let deltaY = 0;
let isDraggingSheet = false;
let animationFrameId;

const dragStart = (e) => {
  isDraggingSheet = true;
  bottomSheetElemen.classList.add("dragging");
  startY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
  deltaY = 0;
};

const dragMove = (e) => {
  if (!isDraggingSheet) return;

  // PENTING: Mencegah layar ikut ke-scroll saat menggeser menu di HP
  if (e.cancelable) e.preventDefault();

  currentY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
  deltaY = currentY - startY;

  // Gunakan requestAnimationFrame agar animasi 60fps & anti patah-patah
  cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(() => {
    if (deltaY > 0) {
      bottomSheetElemen.style.transform = `translateY(${deltaY}px)`;
    } else {
      bottomSheetElemen.style.transform = `translateY(${deltaY * 0.1}px)`;
    }
  });
};

const dragEnd = () => {
  if (!isDraggingSheet) return;
  isDraggingSheet = false;
  bottomSheetElemen.classList.remove("dragging");
  cancelAnimationFrame(animationFrameId);

  // Ubah angka ini (default 80) jika ingin menu lebih mudah/susah ditutup
  if (deltaY > 80) {
    closeModelSheet();
  } else {
    bottomSheetElemen.style.transform = "";
  }
};

// Tambahkan { passive: false } agar kita bisa mematikan scroll layar di HP
sheetHandleElemen.addEventListener("touchstart", dragStart, { passive: false });
sheetHeaderElemen.addEventListener("touchstart", dragStart, { passive: false });

document.addEventListener("touchmove", dragMove, { passive: false });
document.addEventListener("touchend", dragEnd);

// Event mouse untuk Desktop/PC
sheetHandleElemen.addEventListener("mousedown", dragStart);
sheetHeaderElemen.addEventListener("mousedown", dragStart);
document.addEventListener("mousemove", dragMove);
document.addEventListener("mouseup", dragEnd);

//event teks stop
function showStopNotice() {
  // Hapus notice lama jika masih ada
  if (stopNoticeDiv) {
    stopNoticeDiv.remove();
  }

  stopNoticeDiv = document.createElement("div");
  stopNoticeDiv.className = "stop-notice";
  stopNoticeDiv.innerText = "kamu menghentikan respon ini";

  chatBox.insertBefore(
    stopNoticeDiv,
    document.getElementById("loadingIndicator"),
  );
  scrollToBottom();
}

function removeStopNotice() {
  if (stopNoticeDiv) {
    stopNoticeDiv.remove();
    stopNoticeDiv = null;
  }
}

function scrollToBottom(force = false) {
  // Jika user sedang baca chat lama → jangan auto scroll
  if (userScrolling && !isChatAtBottom() && !force) {
    return;
  }

  if (autoScrollEnabled) {
    programmaticScroll = true;

    requestAnimationFrame(() => {
      chatBox.scrollTop = chatBox.scrollHeight;

      // Reset setelah browser selesai scroll
      requestAnimationFrame(() => {
        programmaticScroll = false;
      });
    });
  }
}

// =========================
// INFO PANEL NAVBAR
// =========================

function toggleInfoPanel() {
  const panel = document.getElementById("infoPanel");

  // Jika sedang aktif → reset semua FAQ
  if (panel.classList.contains("active")) {
    const allFaq = document.querySelectorAll(".faq-item");

    allFaq.forEach((item) => {
      item.classList.remove("active");
    });
  }

  panel.classList.toggle("active");
}

// =========================
// FAQ ACCORDION
// =========================

function toggleFaq(button) {
  const currentItem = button.parentElement;

  const allItems = document.querySelectorAll(".faq-item");

  // Tutup semua item lain
  allItems.forEach((item) => {
    if (item !== currentItem) {
      item.classList.remove("active");
    }
  });

  // Toggle item sekarang
  currentItem.classList.toggle("active");
}

/* =========================
   DETEKSI KEYBOARD MOBILE
========================= */

(function () {
  let initialHeight = window.innerHeight;

  window.addEventListener("resize", () => {
    const currentHeight = window.innerHeight;

    const keyboardOpen = currentHeight < initialHeight - 150;

    document.body.classList.toggle("keyboard-open", keyboardOpen);
  });
})();

document.addEventListener("DOMContentLoaded", () => {
  // Ganti 'chatContainer' dengan ID div tempat semua pesan AI dan User muncul
  // Misalnya 'chat-box' atau 'messages' (sesuaikan dengan index.html kamu)
  const chatContainer =
    document.getElementById("chatContainer") || document.body;

  // Fungsi untuk memindahkan class selectable
  function setExclusiveSelection(target) {
    // Cari bubble pesan utama
    const chatMessage = target.closest(".message");

    if (chatMessage) {
      // Bersihkan class dari pesan lain
      document.querySelectorAll(".chat-selectable").forEach((el) => {
        el.classList.remove("chat-selectable");
      });

      // Aktifkan hanya pada pesan yang ditekan
      chatMessage.classList.add("chat-selectable");
    }
  }

  // Deteksi saat layar HP disentuh (Touch)
  chatContainer.addEventListener(
    "touchstart",
    (e) => {
      setExclusiveSelection(e.target);
    },
    { passive: true },
  );

  // Deteksi saat mouse diklik (PC)
  chatContainer.addEventListener("mousedown", (e) => {
    setExclusiveSelection(e.target);
  });
});

// =========================
// PERSONA PANEL
// =========================

const personaPanel = document.getElementById("personaPanel");

const humorSlider = document.getElementById("humorSlider");

const humorValue = document.getElementById("humorValue");

const toneSelect = document.getElementById("toneSelect");

const personalitySelect = document.getElementById("personalitySelect");

// OPEN
function openPersonaPanel() {
  closeAllPanels();

  tempPersonaSettings = {
    tone: document.getElementById("toneSelected").textContent,

    personality: document.getElementById("personalitySelected").textContent,

    humor: humorSlider.value,

    preset:
      document.querySelector(".preset-btn.active")?.dataset.preset || null,
  };

  document.getElementById("personaPanel").classList.add("active");
}

// CLOSE
function closePersonaPanel() {
  if (tempPersonaSettings) {
    document.getElementById("toneSelected").textContent =
      tempPersonaSettings.tone;

    document.getElementById("personalitySelected").textContent =
      tempPersonaSettings.personality;

    humorSlider.value = tempPersonaSettings.humor;

    humorValue.textContent = tempPersonaSettings.humor + "%";

    document.querySelectorAll(".preset-btn").forEach((btn) => {
      if (btn.dataset.preset === tempPersonaSettings.preset) {
        btn.classList.add("active");
      }
    });
  }

  document.getElementById("personaPanel").classList.remove("active");
}

// UPDATE SLIDER
humorSlider.addEventListener("input", () => {
  humorValue.textContent = humorSlider.value + "%";

  presetChangedManually = true;

  removeActivePreset();
});

function removeActivePreset() {
  activePreset = null;

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
}

// SAVE
function savePersonaSettings() {
  const settings = {
    tone: document.getElementById("toneSelected").textContent,

    personality: document.getElementById("personalitySelected").textContent,

    humor: humorSlider.value,
  };

  localStorage.setItem("zackira_persona", JSON.stringify(settings));
}

// LOAD
function loadPersonaSettings() {
  const saved = localStorage.getItem("zackira_persona");

  if (!saved) return;

  const data = JSON.parse(saved);

  document.getElementById("toneSelected").textContent = data.tone || "Santai";

  document.getElementById("personalitySelected").textContent =
    data.personality || "Ramah";

  humorSlider.value = data.humor || 50;

  humorValue.textContent = humorSlider.value + "%";
}

// =========================
// PRESET
// =========================

function applyPreset(type, element) {
  const tone = document.getElementById("toneSelected");

  const personality = document.getElementById("personalitySelected");

  // reset semua tombol preset
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  // simpan preset aktif
  activePreset = type;

  presetChangedManually = false;

  // nyalakan tombol
  element.classList.add("active");

  // =====================
  // PACAR
  // =====================

  if (type === "pacar") {
    tone.textContent = "Lembut";

    personality.textContent = "Supportif";

    humorSlider.value = 75;
  }

  // =====================
  // GURU
  // =====================
  else if (type === "guru") {
    tone.textContent = "Formal";

    personality.textContent = "Cerdas";

    humorSlider.value = 20;
  }

  // =====================
  // TEMAN
  // =====================
  else if (type === "teman") {
    tone.textContent = "Santai";

    personality.textContent = "Ekspresif";

    humorSlider.value = 80;
  }

  // =====================
  // PROGRAMMER
  // =====================
  else if (type === "programmer") {
    tone.textContent = "Tegas";

    personality.textContent = "Serius";

    humorSlider.value = 15;
  }

  humorValue.textContent = humorSlider.value + "%";
}

function closeAllPanels() {

    // persona
    const persona =
        document.getElementById(
            "personaPanel"
        );

    if (persona) {

        persona.classList.remove(
            "active"
        );

    }

    // settings menu
    const settingsMenu =
        document.getElementById(
            "settingsMenuPanel"
        );

    if (settingsMenu) {

        settingsMenu.classList.remove(
            "active"
        );

    }

    // profile panel
    const profilePanel =
        document.getElementById(
            "profilePanel"
        );

    if (profilePanel) {

        profilePanel.classList.remove(
            "active"
        );

    }

    // model sheet
    const sheet =
        document.getElementById(
            "modelSheetOverlay"
        );

    if (sheet) {

        sheet.classList.remove(
            "active"
        );

    }

    // sidebar
    const sidebar =
        document.getElementById(
            "sidebar"
        );

    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );

    if (sidebar) {

        sidebar.classList.remove(
            "active"
        );

    }

    if (overlay) {

        overlay.classList.remove(
            "active"
        );

    }

    // reset panah model
    const arrow =
        document.querySelector(
            ".model-arrow"
        );

    if (arrow) {

        arrow.classList.remove(
            "rotate"
        );

    }

}

// =========================
// CUSTOM DROPDOWN
// =========================

function toggleDropdown(id) {
  const dropdown = document.getElementById(id);

  const isActive = dropdown.classList.contains("active");

  // tutup semua
  document.querySelectorAll(".custom-select").forEach((el) => {
    el.classList.remove("active");
  });

  // buka yg dipilih
  if (!isActive) {
    dropdown.classList.add("active");
  }
}

function selectOption(dropdownId, textId, value) {
  presetChangedManually = true;

  removeActivePreset();

  document.getElementById(textId).textContent = value;

  document.getElementById(dropdownId).classList.remove("active");
}

// klik luar
document.addEventListener("click", (e) => {
  if (!e.target.closest(".custom-select")) {
    document.querySelectorAll(".custom-select").forEach((el) => {
      el.classList.remove("active");
    });
  }
});

function confirmPersonaSettings() {
  savePersonaSettings();

  localStorage.setItem("activePreset", activePreset || "");

  closeAllDropdowns?.();

  const panel = document.getElementById("personaPanel");

  panel.classList.remove("active");

  // animasi feedback
  const btn = document.querySelector(".persona-save-btn");

  btn.innerText = "Tersimpan";

  setTimeout(() => {
    btn.innerText = "Simpan Pengaturan";
  }, 1500);
}

function closeAllDropdowns() {
  document.querySelectorAll(".custom-select").forEach((el) => {
    el.classList.remove("active");
  });
}

/* =========================
   SETTINGS MENU
========================= */

function openSettingsMenu() {
  closeModelSheet?.();

  document.getElementById("settingsMenuPanel").classList.add("active");
}

function closeSettingsMenu() {
  document.getElementById("settingsMenuPanel").classList.remove("active");
}

/* =========================
   PROFILE PANEL
========================= */

let selectedProfileImage = null;

function openProfilePanel() {
  closeSettingsMenu();

  document.getElementById("profilePanel").classList.add("active");

  const saved = localStorage.getItem("aiProfileImage");

  if (saved) {
    document.getElementById("profilePreview").src = saved;
  }
}

function closeProfilePanel() {
  document.getElementById("profilePanel").classList.remove("active");
}

function handleProfileUpload(event) {
  const file = event.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (e) {
    selectedProfileImage = e.target.result;

    document.getElementById("profilePreview").src = selectedProfileImage;
  };

  reader.readAsDataURL(file);
}

function saveProfileImage() {
  if (!selectedProfileImage) {
    closeProfilePanel();
    return;
  }

  localStorage.setItem("aiProfileImage", selectedProfileImage);

  document.querySelectorAll(".ai-profile-icon").forEach((img) => {
    img.src = selectedProfileImage;
  });

  document.getElementById("deleteProfileBtn").style.display = "block";
  closeProfilePanel();
}

function deleteProfileImage() {
  localStorage.removeItem("aiProfileImage");

  const defaultImage = "https://i.ibb.co.com/ZRXdPw3h/profile-picture.png";

  document.querySelectorAll(".ai-profile-icon").forEach((img) => {
    img.src = defaultImage;
  });

  const profilePreview = document.getElementById("profilePreview");

  if (profilePreview) {
    profilePreview.src = defaultImage;
  }

  document.getElementById("deleteProfileBtn").style.display = "none";

  closeProfilePanel();
}

// --- INISIALISASI ---
window.onload = () => {
  document.getElementById("currentYear").innerText = new Date().getFullYear();
  
  // Auth Listener Firebase
  auth.onAuthStateChanged(async (user) => {
      const loginText = document.getElementById("loginText");
      if (user) {
          currentUser = user;
          USER_ID = user.uid; // Update USER_ID agar analytics juga terhubung dengan akun
          if(loginText) loginText.innerText = "Logout (" + user.displayName + ")";

          // Ambil riwayat dari Firestore
          const docRef = db.collection("users").doc(user.uid);
          const docSnap = await docRef.get();
          if (docSnap.exists) {
              allSessions = docSnap.data().sessions || [];
          } else {
              allSessions = [];
          }
          renderHistoryList();
      } else {
          currentUser = null;
          if(loginText) loginText.innerText = "Login dengan Google";

          // Jika tidak login, ambil riwayat dari Local Storage
          const localData = localStorage.getItem("zackira_sessions");
          if (localData) {
            allSessions = JSON.parse(localData);
          } else {
            allSessions = [];
          }
          renderHistoryList();
      }
  });

  const savedProfile = localStorage.getItem("aiProfileImage");
  if (savedProfile) {
    document.getElementById("deleteProfileBtn").style.display = "block";
  }

  currentSessionId = Date.now();
  chatHistory = [{ role: "system", content: SYSTEM_PROMPT }];

  if (chatHistory.length === 1) {
    const greeting = appendMessage(
      "bot",
      "Halo! 👋 Namaku Zackira. Ada yang bisa kubantu hari ini?",
    );
    greeting.id = "greetingWrapper";
  }

  checkInputLock();

  chatBox.addEventListener("touchstart", () => { userScrolling = true; });
  chatBox.addEventListener("mousedown", () => { userScrolling = true; });
  chatBox.addEventListener("touchend", () => { userScrolling = false; });
  chatBox.addEventListener("mouseup", () => { userScrolling = false; });

  chatBox.addEventListener("scroll", () => {
    if (programmaticScroll) return;
    if (!isChatAtBottom()) {
      autoScrollEnabled = false;
    }
    if (isChatAtBottom()) {
      autoScrollEnabled = true;
    }
  });
};

// =========================
// TAMPILKAN IKLAN
// =========================

function showInterstitialAd() {

    // Hindari double popup
    if (document.getElementById("customAdModal")) return;

    const adModal = document.createElement("div");

    adModal.id = "customAdModal";

    adModal.innerHTML = `

        <div class="custom-ad-overlay">

            <div class="custom-ad-box">

                <!-- TIMER -->
                <div class="ad-countdown" id="adCountdown">
                    Iklan selesai dalam 5 detik
                </div>

                <!-- CLOSE BUTTON -->
                <button 
                    class="close-ad-btn"
                    id="closeAdBtn"
                    onclick="closeInterstitialAd()"
                >
                    ×
                </button>

                <!-- IKLAN ADSENSE -->
                <ins class="adsbygoogle"
                    style="display:block"
                    data-ad-client="ca-pub-3058831150053327"
                    data-ad-slot="1234567890"
                    data-ad-format="auto"
                    data-full-width-responsive="true">
                </ins>

            </div>

        </div>

    `;

    document.body.appendChild(adModal);

    // LOAD ADS
    try {

        (adsbygoogle = window.adsbygoogle || []).push({});

    } catch (e) {}

    // =========================
    // TIMER IKLAN
    // =========================

    const closeBtn =
        document.getElementById(
            "closeAdBtn"
        );

    const countdownText =
        document.getElementById(
            "adCountdown"
        );

    // SEMBUNYIKAN TOMBOL X
    closeBtn.style.display = "none";

    let timeLeft = 5;

    const timer = setInterval(() => {

        timeLeft--;

        if (timeLeft > 0) {

            countdownText.innerText =
                `Iklan selesai dalam ${timeLeft} detik`;

        } else {

            clearInterval(timer);

            countdownText.innerText =
                "Iklan selesai";

            // TAMPILKAN TOMBOL X
            closeBtn.style.display = "flex";

        }

    }, 1000);

}

// =========================
// TUTUP IKLAN
// =========================

function closeInterstitialAd() {

    const ad = document.getElementById("customAdModal");

    if (ad) {
        ad.remove();
    }
}
