(function () {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const initData = tg?.initData || '';

  // State
  let me = null;
  let rooms = [];
  let currentRoom = null;

  // DOM Elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabPages = document.querySelectorAll('.tab-page');
  const todayDateEl = document.getElementById('today-date');
  const todayListEl = document.getElementById('today-list');
  const roomsListEl = document.getElementById('rooms-list');
  const reminderToggleEl = document.getElementById('reminder-toggle');
  const reminderTimeEl = document.getElementById('reminder-time');

  // Room Overlay
  const roomOverlay = document.getElementById('room-detail-screen');
  const detailRoomName = document.getElementById('detail-room-name');
  const detailRoomRole = document.getElementById('detail-room-role');
  const detailInviteCode = document.getElementById('detail-invite-code');
  const detailMembersCount = document.getElementById('detail-members-count');
  const detailSharedTopics = document.getElementById('detail-shared-topics');
  const detailPersonalTopics = document.getElementById('detail-personal-topics');
  const btnCloseRoomDetail = document.getElementById('btn-close-room-detail');
  const btnAddSharedTopic = document.getElementById('btn-add-shared-topic');
  const btnAddPersonalTopic = document.getElementById('btn-add-personal-topic');
  const btnLeaveRoom = document.getElementById('btn-leave-room');
  const btnCloseRoom = document.getElementById('btn-close-room');

  // Modals
  const modalContainer = document.getElementById('modal-container');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const btnCloseModal = document.getElementById('btn-close-modal');

  // Navigation
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      tabPages.forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');
      if (tab === 'today') loadToday();
      if (tab === 'rooms') loadRooms();
      if (tab === 'settings') loadSettings();
    });
  });

  // API helper
  async function apiRequest(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${initData}`,
      ...(options.headers || {})
    };
    try {
      const res = await fetch(endpoint, { ...options, headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'API Request failed');
      }
      return data;
    } catch (err) {
      if (tg?.showAlert) {
        tg.showAlert(err.message);
      } else {
        alert(err.message);
      }
      throw err;
    }
  }

  // Load User & Today
  async function init() {
    todayDateEl.textContent = new Date().toLocaleDateString();
    await loadToday();
  }

  async function loadToday() {
    todayListEl.innerHTML = '<div class="loading-state">Loading today\'s assignments...</div>';
    try {
      const data = await apiRequest('/api/me');
      me = data.user;
      const assignments = data.todayAssignments || [];
      if (assignments.length === 0) {
        todayListEl.innerHTML = '<div class="empty-state">No prayer assignments for today yet. Join a room or wait for daily rotation!</div>';
        return;
      }
      todayListEl.innerHTML = '';
      assignments.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="card-header">
            <span class="badge badge-${item.kind}">${item.kind} Topic</span>
            <span class="card-meta">Room #${item.roomId}</span>
          </div>
          <div class="card-title">${escapeHtml(item.text)}</div>
          ${item.updates && item.updates.length ? `
            <div class="topic-updates">
              <strong>Latest Update:</strong> ${escapeHtml(item.updates[item.updates.length - 1].text)}
            </div>
          ` : ''}
          <div style="margin-top: 8px;">
            ${item.prayedToday ? `
              <button class="btn btn-sm btn-secondary btn-block" disabled>✓ Prayed Today</button>
            ` : `
              <button class="btn btn-sm btn-primary btn-block btn-pray" data-topic-id="${item.id}">Mark Prayed Today</button>
            `}
          </div>
        `;
        todayListEl.appendChild(card);
      });

      document.querySelectorAll('.btn-pray').forEach(btn => {
        btn.addEventListener('click', async () => {
          const topicId = btn.getAttribute('data-topic-id');
          await apiRequest(`/api/topics/${topicId}/pray`, { method: 'POST' });
          if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
          loadToday();
        });
      });
    } catch (e) {
      todayListEl.innerHTML = '<div class="empty-state">Failed to load assignments.</div>';
    }
  }

  // Load Rooms
  async function loadRooms() {
    roomsListEl.innerHTML = '<div class="loading-state">Loading rooms...</div>';
    try {
      rooms = await apiRequest('/api/rooms');
      if (rooms.length === 0) {
        roomsListEl.innerHTML = '<div class="empty-state">You are not in any prayer rooms yet. Create or join one!</div>';
        return;
      }
      roomsListEl.innerHTML = '';
      rooms.forEach(r => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="card-header">
            <span class="card-title">${escapeHtml(r.name)}</span>
            <span class="badge badge-${r.isAdmin ? 'admin' : 'member'}">${r.isAdmin ? 'Admin' : 'Member'}</span>
          </div>
          <div class="card-meta">Invite Code: <code>${r.inviteCode}</code></div>
          <div style="margin-top: 8px;">
            <button class="btn btn-sm btn-secondary btn-block btn-open-room" data-room-id="${r.id}">View Room Details</button>
          </div>
        `;
        roomsListEl.appendChild(card);
      });

      document.querySelectorAll('.btn-open-room').forEach(btn => {
        btn.addEventListener('click', () => {
          openRoomDetail(Number(btn.getAttribute('data-room-id')));
        });
      });
    } catch (e) {
      roomsListEl.innerHTML = '<div class="empty-state">Failed to load rooms.</div>';
    }
  }

  // Room Detail
  async function openRoomDetail(roomId) {
    try {
      currentRoom = await apiRequest(`/api/rooms/${roomId}`);
      detailRoomName.textContent = currentRoom.name;
      detailRoomRole.textContent = currentRoom.isAdmin ? 'Admin' : 'Member';
      detailRoomRole.className = `badge badge-${currentRoom.isAdmin ? 'admin' : 'member'}`;
      detailInviteCode.textContent = currentRoom.inviteCode;
      detailMembersCount.textContent = currentRoom.members.length;

      // Admin vs member actions
      if (currentRoom.isAdmin) {
        btnAddSharedTopic.classList.remove('hidden');
        btnCloseRoom.classList.remove('hidden');
        btnLeaveRoom.classList.add('hidden');
      } else {
        btnAddSharedTopic.classList.add('hidden');
        btnCloseRoom.classList.add('hidden');
        btnLeaveRoom.classList.remove('hidden');
      }

      renderTopics(detailSharedTopics, currentRoom.sharedTopics, true);
      renderTopics(detailPersonalTopics, currentRoom.personalTopics, false);

      roomOverlay.classList.remove('hidden');
    } catch (e) {
      console.error(e);
    }
  }

  function renderTopics(container, topics, isShared) {
    if (!topics || topics.length === 0) {
      container.innerHTML = '<div class="empty-state">No topics added yet.</div>';
      return;
    }
    container.innerHTML = '';
    topics.forEach(t => {
      const isOwner = t.ownerId === me?.id || (isShared && currentRoom?.isAdmin);
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-header">
          <span class="badge ${t.status === 'answered' ? 'badge-answered' : (isShared ? 'badge-shared' : 'badge-personal')}">
            ${t.status === 'answered' ? 'Answered' : (isShared ? 'Shared' : 'Personal')}
          </span>
          <span class="card-meta">Owner ID: ${t.ownerId}</span>
        </div>
        <div class="card-title">${escapeHtml(t.text)}</div>
        ${t.updates && t.updates.length ? `
          <div class="topic-updates">
            <strong>Updates:</strong>
            ${t.updates.map(u => `<div class="update-item">• ${escapeHtml(u.text)}</div>`).join('')}
          </div>
        ` : ''}
        ${t.answeredNote ? `
          <div class="topic-updates" style="background: rgba(52, 199, 89, 0.1);">
            <strong>Answered Praise:</strong> ${escapeHtml(t.answeredNote)}
          </div>
        ` : ''}
        ${isOwner && t.status !== 'answered' ? `
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button class="btn btn-sm btn-outline btn-post-update" data-topic-id="${t.id}">+ Update</button>
            <button class="btn btn-sm btn-secondary btn-mark-answered" data-topic-id="${t.id}">Mark Answered</button>
          </div>
        ` : ''}
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('.btn-post-update').forEach(btn => {
      btn.addEventListener('click', () => {
        showPromptModal('Add Update', 'Enter update text:', async (text) => {
          await apiRequest(`/api/topics/${btn.getAttribute('data-topic-id')}/update`, {
            method: 'POST',
            body: JSON.stringify({ text })
          });
          openRoomDetail(currentRoom.id);
        });
      });
    });

    container.querySelectorAll('.btn-mark-answered').forEach(btn => {
      btn.addEventListener('click', () => {
        showPromptModal('Mark Answered', 'Optional praise / answer note:', async (text) => {
          await apiRequest(`/api/topics/${btn.getAttribute('data-topic-id')}/answer`, {
            method: 'POST',
            body: JSON.stringify({ text })
          });
          openRoomDetail(currentRoom.id);
        });
      });
    });
  }

  btnCloseRoomDetail.addEventListener('click', () => {
    roomOverlay.classList.add('hidden');
    loadRooms();
  });

  // Modal Triggers
  document.getElementById('btn-create-room-modal').addEventListener('click', () => {
    showPromptModal('Create Prayer Room', 'Enter room name:', async (name) => {
      await apiRequest('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      loadRooms();
    });
  });

  document.getElementById('btn-join-room-modal').addEventListener('click', () => {
    showPromptModal('Join Prayer Room', 'Enter 8-character invite code:', async (code) => {
      await apiRequest('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      loadRooms();
    });
  });

  btnAddSharedTopic.addEventListener('click', () => {
    showPromptModal('Add Shared Topic', 'Enter shared prayer topic for room:', async (text) => {
      await apiRequest(`/api/rooms/${currentRoom.id}/topics`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'shared', text })
      });
      openRoomDetail(currentRoom.id);
    });
  });

  btnAddPersonalTopic.addEventListener('click', () => {
    showPromptModal('Add Personal Topic', 'Enter personal prayer topic:', async (text) => {
      await apiRequest(`/api/rooms/${currentRoom.id}/topics`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'personal', text })
      });
      openRoomDetail(currentRoom.id);
    });
  });

  btnLeaveRoom.addEventListener('click', async () => {
    if (confirm('Are you sure you want to leave this room?')) {
      await apiRequest(`/api/rooms/${currentRoom.id}/leave`, { method: 'POST' });
      roomOverlay.classList.add('hidden');
      loadRooms();
    }
  });

  btnCloseRoom.addEventListener('click', async () => {
    if (confirm('Are you sure you want to close this room for all members?')) {
      await apiRequest(`/api/rooms/${currentRoom.id}/close`, { method: 'POST' });
      roomOverlay.classList.add('hidden');
      loadRooms();
    }
  });

  // Settings
  async function loadSettings() {
    try {
      const data = await apiRequest('/api/me');
      me = data.user;
      reminderToggleEl.checked = !!me.reminderEnabled;
      if (me.reminderTime) reminderTimeEl.value = me.reminderTime;
      reminderTimeEl.disabled = !reminderToggleEl.checked;
    } catch (e) {}
  }

  reminderToggleEl.addEventListener('change', () => {
    reminderTimeEl.disabled = !reminderToggleEl.checked;
  });

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    await apiRequest('/api/me/reminder', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: reminderToggleEl.checked,
        time: reminderTimeEl.value
      })
    });
    if (tg?.showAlert) tg.showAlert('Settings saved!');
    else alert('Settings saved!');
  });

  // Modal Helper
  function showPromptModal(title, label, onSubmit) {
    modalTitle.textContent = title;
    modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <label style="font-size: 13px; color: var(--hint-color);">${escapeHtml(label)}</label>
        <input type="text" id="modal-input" class="input-text" autofocus>
        <button class="btn btn-primary btn-block" id="modal-submit">Submit</button>
      </div>
    `;
    modalContainer.classList.remove('hidden');

    const input = document.getElementById('modal-input');
    const submit = document.getElementById('modal-submit');

    const handle = async () => {
      const val = input.value.trim();
      if (!val) return;
      modalContainer.classList.add('hidden');
      try {
        await onSubmit(val);
      } catch (e) {}
    };

    submit.addEventListener('click', handle);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handle();
    });
  }

  btnCloseModal.addEventListener('click', () => {
    modalContainer.classList.add('hidden');
  });

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  init();
})();
