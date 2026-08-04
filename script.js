// ============================================================
// EduMeet — Online Class Platform (single-page, no backend)
// Roles: Teacher = Host, Student = User
// Both have mic & video access via getUserMedia (WebRTC)
// ============================================================

const state = {
  role: 'student', // 'host' | 'student'
  name: '',
  classCode: '',
  stream: null, // local media stream
  micOn: true,
  camOn: true,
  participants: [], // { id, name, role, micOn, camOn }
  timerInterval: null,
  seconds: 0,
  chatUnread: 0,
  ownId: 'me-' + Math.random().toString(36).slice(2, 9),
};

// Cache DOM elements
const $ = (sel) => document.querySelector(sel);
const joinScreen = $('#join-screen');
const classroomScreen = $('#classroom-screen');
const videoGrid = $('#video-grid');
const chatMessages = $('#chat-messages');
const participantList = $('#participant-list');
const chatInput = $('#chat-input');
const chatBadge = $('#chat-badge');
const participantBadge = $('#participant-badge');

// ---------- JOIN SCREEN ----------
const roleButtons = document.querySelectorAll('.role-btn');
roleButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    roleButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.role = btn.dataset.role;
  });
});

$('#join-btn').addEventListener('click', joinClass);
$('#display-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinClass();
});

function joinClass() {
  const name = $('#display-name').value.trim();
  if (!name) {
    showToast('Please enter your name to join.');
    $('#display-name').focus();
    return;
  }
  state.name = name;
  state.classCode = $('#class-code').value.trim().toUpperCase() || 'ABC-123';

  // Host adds a "teacher" participant; students join as themselves
  addParticipant(state.ownId, state.name, state.role, true, true);

  if (state.role === 'host') {
    document.body.classList.add('is-host');
    // Simulate a couple of students already in class
    addParticipant('stu-1', 'Aarav Student', 'student', true, true);
    addParticipant('stu-2', 'Priya Student', 'student', true, false);
  }

  $('#class-title').textContent = state.name + "'s Class";
  $('#class-code-chip').textContent = 'Code: ' + state.classCode;

  enterClassroom();
  startMedia();
  startTimer();
  updateParticipantBadge();
  addSystemChat(`🎉 ${state.name} joined the class as ${state.role === 'host' ? 'Teacher (Host)' : 'Student'}.`);
}

// ---------- MEDIA (Camera + Mic) ----------
async function startMedia() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    addSystemChat('⚠️ Media devices not supported in this browser.');
    renderLocalTile();
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    renderLocalTile();
    updateSelfParticipant();
    showToast('Camera & microphone connected.');
  } catch (err) {
    console.error('Media error:', err);
    addSystemChat('⚠️ Could not access camera/mic. Showing placeholder.');
    renderLocalTile();
  }
}

function renderLocalTile() {
  const existing = document.getElementById('tile-' + state.ownId);
  if (existing) existing.remove();

  const tile = document.createElement('div');
  tile.className = 'video-tile' + (state.role === 'host' ? ' host' : '');
  tile.id = 'tile-' + state.ownId;

  const avatar = document.createElement('div');
  avatar.className = 'placeholder-avatar';
  avatar.textContent = '🧑‍🎓';
  if (state.role === 'host') avatar.textContent = '👨‍🏫';
  tile.appendChild(avatar);

  if (state.stream) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true; // avoid echo of own audio
    video.playsInline = true;
    video.srcObject = state.stream;
    tile.appendChild(video);
    video.addEventListener('loadedmetadata', () => {
      video.play().catch(() => {});
    });
  }

  tile.appendChild(buildTileBar(state.name, state.role === 'host', state.micOn, state.camOn));
  videoGrid.prepend(tile);
}

function buildTileBar(name, isHost, micOn, camOn) {
  const bar = document.createElement('div');
  bar.className = 'tile-bar';
  const nameEl = document.createElement('div');
  nameEl.className = 'tile-name';
  nameEl.textContent = name;
  if (isHost) {
    const tag = document.createElement('span');
    tag.className = 'host-tag';
    tag.textContent = 'HOST';
    nameEl.appendChild(tag);
  }
  const status = document.createElement('div');
  status.className = 'tile-status';
  const mic = document.createElement('span');
  mic.className = micOn ? '' : 'off';
  mic.textContent = micOn ? '🎙️' : '🔇';
  const cam = document.createElement('span');
  cam.className = camOn ? '' : 'off';
  cam.textContent = camOn ? '📹' : '🚫';
  status.appendChild(mic);
  status.appendChild(cam);
  bar.appendChild(nameEl);
  bar.appendChild(status);
  return bar;
}

// ---------- MIC / CAM TOGGLES ----------
function toggleMic() {
  state.micOn = !state.micOn;
  $('#btn-mic').classList.toggle('off', !state.micOn);
  if (state.stream) {
    state.stream.getAudioTracks().forEach((t) => (t.enabled = state.micOn));
  }
  updateSelfParticipant();
  updateSelfTile();
  showToast(state.micOn ? 'Mic unmuted' : 'Mic muted');
}

function toggleCam() {
  state.camOn = !state.camOn;
  $('#btn-cam').classList.toggle('off', !state.camOn);
  if (state.stream) {
    state.stream.getVideoTracks().forEach((t) => (t.enabled = state.camOn));
  }
  updateSelfParticipant();
  updateSelfTile();
  showToast(state.camOn ? 'Camera on' : 'Camera off');
}

function updateSelfTile() {
  const tile = document.getElementById('tile-' + state.ownId);
  if (!tile) return;
  const status = tile.querySelector('.tile-status');
  if (status) status.innerHTML = '';
  const mic = document.createElement('span');
  mic.className = state.micOn ? '' : 'off';
  mic.textContent = state.micOn ? '🎙️' : '🔇';
  const cam = document.createElement('span');
  cam.className = state.camOn ? '' : 'off';
  cam.textContent = state.camOn ? '📹' : '🚫';
  status.appendChild(mic);
  status.appendChild(cam);
}

// ---------- PARTICIPANTS ----------
function addParticipant(id, name, role, micOn, camOn) {
  const p = { id, name, role, micOn, camOn };
  state.participants.push(p);
  renderParticipants();
  updateParticipantBadge();
  if (id !== state.ownId) {
    renderRemoteTile(p);
  }
}

function updateSelfParticipant() {
  const me = state.participants.find((p) => p.id === state.ownId);
  if (me) {
    me.micOn = state.micOn;
    me.camOn = state.camOn;
    renderParticipants();
  }
}

function renderParticipants() {
  participantList.innerHTML = '';
  state.participants.forEach((p) => {
    const li = document.createElement('li');
    const avatar = document.createElement('div');
    avatar.className = 'p-avatar';
    avatar.textContent = p.name.charAt(0).toUpperCase();
    const info = document.createElement('div');
    info.className = 'p-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'p-name';
    nameEl.textContent = p.name + (p.id === state.ownId ? ' (You)' : '');
    const roleEl = document.createElement('div');
    roleEl.className = 'p-role';
    roleEl.textContent = p.role === 'host' ? '👨‍🏫 Teacher (Host)' : '🎒 Student';
    info.appendChild(nameEl);
    info.appendChild(roleEl);
    const status = document.createElement('div');
    status.className = 'p-status';
    status.innerHTML = `<span class="${p.micOn ? '' : 'off'}">🎙️</span><span class="${p.camOn ? '' : 'off'}">📹</span>`;
    li.appendChild(avatar);
    li.appendChild(info);
    li.appendChild(status);
    participantList.appendChild(li);
  });
  updateParticipantBadge();
}

function renderRemoteTile(p) {
  const existing = document.getElementById('tile-' + p.id);
  if (existing) existing.remove();
  const tile = document.createElement('div');
  tile.className = 'video-tile' + (p.role === 'host' ? ' host' : '');
  tile.id = 'tile-' + p.id;
  const avatar = document.createElement('div');
  avatar.className = 'placeholder-avatar';
  avatar.textContent = p.role === 'host' ? '👨‍🏫' : '🧑‍🎓';
  tile.appendChild(avatar);
  tile.appendChild(buildTileBar(p.name, p.role === 'host', p.micOn, p.camOn));
  videoGrid.appendChild(tile);
}

function updateParticipantBadge() {
  participantBadge.textContent = state.participants.length;
}

// ---------- MUTE ALL (host only) ----------
function muteAllStudents() {
  if (state.role !== 'host') return;
  state.participants.forEach((p) => {
    if (p.role === 'student' && p.id !== state.ownId) {
      p.micOn = false;
      const tile = document.getElementById('tile-' + p.id);
      if (tile) {
        const status = tile.querySelector('.tile-status');
        if (status) {
          status.innerHTML = `<span class="off">🔇</span><span class="${p.camOn ? '' : 'off'}">📹</span>`;
        }
      }
    }
  });
  renderParticipants();
  addSystemChat('🔇 The host muted all student microphones.');
  showToast('All students muted.');
}

// ---------- CHAT ----------
function addSystemChat(text) {
  const msg = document.createElement('div');
  msg.className = 'chat-msg system';
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  const msg = document.createElement('div');
  msg.className = 'chat-msg sent';
  const name = document.createElement('span');
  name.className = 'msg-name';
  name.textContent = state.name + (state.role === 'host' ? ' (Teacher)' : '');
  const body = document.createElement('span');
  body.textContent = text;
  msg.appendChild(name);
  msg.appendChild(body);
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  chatInput.value = '';
  openChat();
  // Simulate a reply after a short delay
  scheduleReply();
}

function scheduleReply() {
  const replies = [
    'Great point! Thank you for sharing 👏',
    'Got it, thanks!',
    'Can you explain that a bit more?',
    'I agree 👍',
    'Noted, moving on.',
  ];
  const reply = replies[Math.floor(Math.random() * replies.length)];
  const who = state.role === 'host' ? 'Aarav Student' : 'Prof. Meera (Teacher)';
  setTimeout(() => {
    const msg = document.createElement('div');
    msg.className = 'chat-msg received';
    const name = document.createElement('span');
    name.className = 'msg-name';
    name.textContent = who;
    const body = document.createElement('span');
    body.textContent = reply;
    msg.appendChild(name);
    msg.appendChild(body);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (!$('#panel-chat').classList.contains('active')) {
      state.chatUnread++;
      chatBadge.textContent = state.chatUnread;
      chatBadge.style.display = 'flex';
    }
  }, 1500);
}

function openChat() {
  $('#panel-chat').classList.add('active');
  $('#panel-participants').classList.remove('active');
  document.querySelectorAll('.panel-tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.panel === 'chat')
  );
  state.chatUnread = 0;
  chatBadge.textContent = '0';
  chatBadge.style.display = 'none';
}

// ---------- PANEL SWITCHING ----------
document.querySelectorAll('.panel-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const panel = tab.dataset.panel;
    $('#panel-chat').classList.toggle('active', panel === 'chat');
    $('#panel-participants').classList.toggle('active', panel === 'participants');
    if (panel === 'chat') {
      state.chatUnread = 0;
      chatBadge.textContent = '0';
      chatBadge.style.display = 'none';
    }
  });
});

// ---------- TIMER ----------
function startTimer() {
  state.seconds = 0;
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.seconds++;
    updateTimerDisplay();
  }, 1000);
}
function updateTimerDisplay() {
  const m = String(Math.floor(state.seconds / 60)).padStart(2, '0');
  const s = String(state.seconds % 60).padStart(2, '0');
  $('#timer').textContent = `${m}:${s}`;
}

// ---------- ENTER / LEAVE ----------
function enterClassroom() {
  joinScreen.classList.remove('active');
  classroomScreen.classList.add('active');
}
function leaveClass() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
  }
  clearInterval(state.timerInterval);
  location.reload();
}

// ---------- TOAST ----------
let toastTimer;
function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ---------- EVENT BINDINGS ----------
$('#btn-mic').addEventListener('click', toggleMic);
$('#btn-cam').addEventListener('click', toggleCam);
$('#btn-share').addEventListener('click', () => {
  showToast('Screen sharing works when connected to a real host/server.');
});
$('#btn-mute-all').addEventListener('click', muteAllStudents);
$('#btn-leave').addEventListener('click', leaveClass);
$('#btn-leave2').addEventListener('click', leaveClass);
$('#btn-chat').addEventListener('click', () => {
  openChat();
  const panel = document.querySelector('.side-panel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth' });
  if (window.innerWidth <= 768) {
    // ensure chat panel visible on mobile
    $('#panel-chat').classList.add('active');
    $('#panel-participants').classList.remove('active');
  }
});
$('#btn-participants').addEventListener('click', () => {
  document.querySelectorAll('.panel-tab').forEach((t) => t.classList.remove('active'));
  document.querySelector('.panel-tab[data-panel="participants"]').classList.add('active');
  $('#panel-chat').classList.remove('active');
  $('#panel-participants').classList.add('active');
});
$('#chat-send').addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
