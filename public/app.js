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
  const detailRoomId = document.getElementById('detail-room-id');
  const detailInviteCode = document.getElementById('detail-invite-code');
  const detailAdminInfo = document.getElementById('detail-admin-info');
  const btnMessageAdmin = document.getElementById('btn-message-admin');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const btnCopyInviteLink = document.getElementById('btn-copy-invite-link');
  const detailMembersCount = document.getElementById('detail-members-count');
  const detailMembersList = document.getElementById('detail-members-list');
  const detailSharedTopics = document.getElementById('detail-shared-topics');
  const detailPersonalTopics = document.getElementById('detail-personal-topics');
  const btnCloseRoomDetail = document.getElementById('btn-close-room-detail');
  const btnAddSharedTopic = document.getElementById('btn-add-shared-topic');
  const btnAddPersonalTopic = document.getElementById('btn-add-personal-topic');
  const btnLeaveRoom = document.getElementById('btn-leave-room');
  const btnCloseRoom = document.getElementById('btn-close-room');
  const headerMembersToggle = document.getElementById('header-members-toggle');

  if (headerMembersToggle) {
    headerMembersToggle.addEventListener('click', () => {
      detailMembersList.classList.toggle('hidden');
      const iconMembersToggle = document.getElementById('icon-members-toggle');
      if (iconMembersToggle) {
        iconMembersToggle.textContent = detailMembersList.classList.contains('hidden') ? '▼' : '▲';
      }
    });
  }

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

  // API Helper
  async function apiRequest(endpoint, options = {}) {
    const headers = options.headers || {};
    if (initData) {
      headers['Authorization'] = `Bearer ${initData}`;
    }
    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }
    options.headers = headers;

    try {
      const res = await fetch(endpoint, options);
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
      const assignments = await apiRequest('/api/me/today');
      if (assignments.length === 0) {
        todayListEl.innerHTML = '<div class="empty-state">No prayer assignments for today yet. Join a room or check back later!</div>';
        return;
      }
      todayListEl.innerHTML = '';
      assignments.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="card-header">
            <span class="card-title">${escapeHtml(item.roomName)}</span>
            <span class="badge ${item.kind === 'shared' ? 'badge-shared' : 'badge-personal'}">${item.kind === 'shared' ? 'Shared Focus' : 'Personal Request'}</span>
          </div>
          <div class="card-title" style="margin-top: 8px;">${escapeHtml(item.topicText)}</div>
          ${item.prayedToday ? `
            <div style="margin-top: 10px; font-size: 13px; color: var(--success-color); font-weight: 600;">✓ Prayed Today</div>
          ` : `
            <div style="margin-top: 10px;">
              <button class="btn btn-sm btn-primary btn-pray" data-topic-id="${item.topicId}">Mark Prayed Today</button>
            </div>
          `}
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
      todayListEl.innerHTML = '<div class="empty-state">Failed to load today assignments.</div>';
    }
  }

  // Rooms Tab
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
      if (detailRoomId) detailRoomId.textContent = `#${currentRoom.id}`;
      detailInviteCode.textContent = currentRoom.inviteCode;
      detailMembersCount.textContent = currentRoom.members.length;

      if (detailAdminInfo) detailAdminInfo.textContent = currentRoom.adminName || `User ${currentRoom.adminId}`;
      if (btnMessageAdmin) {
        if (!currentRoom.isAdmin && currentRoom.adminUsername) {
          btnMessageAdmin.classList.remove('hidden');
          btnMessageAdmin.onclick = () => {
            const link = `https://t.me/${currentRoom.adminUsername}`;
            if (tg?.openTelegramLink) {
              tg.openTelegramLink(link);
            } else {
              window.open(link, '_blank');
            }
          };
        } else {
          btnMessageAdmin.classList.add('hidden');
        }
      }

      // Render Members List (Collapsed by default)
      if (detailMembersList) {
        detailMembersList.classList.add('hidden');
        const iconMembersToggle = document.getElementById('icon-members-toggle');
        if (iconMembersToggle) iconMembersToggle.textContent = '▼';
        detailMembersList.innerHTML = '';
        if (currentRoom.members && currentRoom.members.length) {
          currentRoom.members.forEach(m => {
            const item = document.createElement('div');
            item.className = 'member-item';
            item.innerHTML = `
              <span style="font-weight: 500;">${escapeHtml(m.displayName || ('User ' + m.telegramId))}</span>
              <span class="badge badge-${m.role === 'admin' ? 'admin' : 'member'}">${m.role === 'admin' ? 'Admin' : 'Member'}</span>
            `;
            detailMembersList.appendChild(item);
          });
        }
      }

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

  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', async () => {
      if (!currentRoom) return;
      try {
        await navigator.clipboard.writeText(currentRoom.inviteCode);
        if (tg?.showAlert) tg.showAlert('Invite code copied!');
        else alert('Invite code copied!');
      } catch (err) {
        prompt('Copy invite code:', currentRoom.inviteCode);
      }
    });
  }

  if (btnCopyInviteLink) {
    btnCopyInviteLink.addEventListener('click', async () => {
      if (!currentRoom) return;
      const botName = currentRoom.botUsername || 'next_tick_care_bot';
      const inviteUrl = `https://t.me/${botName}?start=join_${currentRoom.inviteCode}`;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        if (tg?.showAlert) tg.showAlert('Invite link copied!');
        else alert('Invite link copied!');
      } catch (err) {
        prompt('Copy invite link:', inviteUrl);
      }
    });
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
          ${!isShared ? `<span class="card-meta">By: ${escapeHtml(t.authorName || 'Member')}</span>` : ''}
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
    showTopicModal('Add Personal Topic', async (text, isAnonymous) => {
      await apiRequest(`/api/rooms/${currentRoom.id}/topics`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'personal', text, isAnonymous })
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

  // Modal Helpers
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

  function showTopicModal(title, onSubmit) {
    modalTitle.textContent = title;
    modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <label style="font-size: 13px; color: var(--hint-color);">Enter personal prayer topic:</label>
        <input type="text" id="modal-input" class="input-text" autofocus>
        <label style="font-size: 13px; color: var(--text-color); display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="modal-anon-check"> Add Anonymously
        </label>
        <button class="btn btn-primary btn-block" id="modal-submit">Submit</button>
      </div>
    `;
    modalContainer.classList.remove('hidden');

    const input = document.getElementById('modal-input');
    const check = document.getElementById('modal-anon-check');
    const submit = document.getElementById('modal-submit');

    const handle = async () => {
      const val = input.value.trim();
      if (!val) return;
      modalContainer.classList.add('hidden');
      try {
        await onSubmit(val, check.checked);
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
