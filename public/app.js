(function () {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const initData = tg?.initData || '';

  // ── Dialogs ───────────────────────────────────────────────────────────────
  // Telegram's WebView blocks window.confirm on several clients, so the native
  // dialogs are the primary path and the browser ones only a local-dev fallback.
  function notify(message) {
    try {
      if (tg?.showAlert) return tg.showAlert(message);
    } catch (e) {}
    alert(message);
  }

  function confirmAsk(message) {
    return new Promise((resolve) => {
      try {
        if (tg?.showConfirm) return tg.showConfirm(message, (ok) => resolve(!!ok));
      } catch (e) {}
      resolve(window.confirm(message));
    });
  }

  // ── Theme ─────────────────────────────────────────────────────────────────
  // 'auto' follows the Telegram client (then the OS); 'light'/'dark' are the
  // user's explicit choice in Settings. Stored server-side next to the locale,
  // mirrored to localStorage so the pre-paint script in index.html can use it.
  const THEME_BG = { dark: '#0f1229', light: '#f5f4fb' };
  let themeMode = 'auto';

  function resolveTheme(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    if (tg?.colorScheme) return tg.colorScheme;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(mode, persist) {
    themeMode = ['auto', 'light', 'dark'].includes(mode) ? mode : 'auto';
    const resolved = resolveTheme(themeMode);
    document.documentElement.setAttribute('data-theme', resolved);
    try { localStorage.setItem('pr-theme', themeMode); } catch (e) {}

    document.querySelectorAll('#theme-switch button').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-theme-value') === themeMode));
    });

    try {
      tg?.setBackgroundColor?.(THEME_BG[resolved]);
      tg?.setHeaderColor?.(THEME_BG[resolved]);
    } catch (e) {}

    if (persist) {
      apiRequest('/api/me/settings', {
        method: 'PUT',
        body: JSON.stringify({ theme: themeMode }),
      }).catch(() => {});
    }
  }

  document.querySelectorAll('#theme-switch button').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.getAttribute('data-theme-value'), true);
      if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    });
  });

  // Follow the client / OS while the mode is 'auto'.
  try { tg?.onEvent?.('themeChanged', () => { if (themeMode === 'auto') applyTheme('auto'); }); } catch (e) {}
  window.matchMedia?.('(prefers-color-scheme: light)')
    .addEventListener?.('change', () => { if (themeMode === 'auto') applyTheme('auto'); });

  // State
  let me = null;
  let rooms = [];
  let currentRoom = null;
  let currentLocale = (tg?.initDataUnsafe?.user?.language_code || 'uk').slice(0, 2);
  if (!['uk', 'en', 'ru'].includes(currentLocale)) currentLocale = 'uk';
  let locales = {};

  // DOM Elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabPages = document.querySelectorAll('.tab-page');
  const todayDateEl = document.getElementById('today-date');
  const todayListEl = document.getElementById('today-list');
  const roomsListEl = document.getElementById('rooms-list');
  const reminderToggleEl = document.getElementById('reminder-toggle');
  const reminderTimeEl = document.getElementById('reminder-time');
  const languageSelectEl = document.getElementById('language-select');

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

  function t(locale, key, vars = {}) {
    const dict = locales[locale] || locales['uk'] || {};
    let template = dict[key] || key;
    return template.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
  }

  function applyLanguage(lang) {
    if (lang && ['uk', 'en', 'ru'].includes(lang)) {
      currentLocale = lang;
    }
    if (languageSelectEl && languageSelectEl.value !== currentLocale) {
      languageSelectEl.value = currentLocale;
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t(currentLocale, key);
      if (val) el.textContent = val;
    });

    // Re-render active screens to update dynamic text in real time
    const activeTab = document.querySelector('.nav-item.active')?.getAttribute('data-tab');
    if (activeTab === 'today') loadToday();
    if (activeTab === 'rooms') loadRooms();
    if (currentRoom && roomOverlay && !roomOverlay.classList.contains('hidden')) {
      openRoomDetail(currentRoom.id);
    }
  }

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
        throw new Error(data.error || t(currentLocale, 'err_generic'));
      }
      return data;
    } catch (err) {
      if (!options.silent) notify(err.message);
      throw err;
    }
  }

  // Daily streak line (🔥 current streak + last 7 days)
  async function loadStreak() {
    const lineEl = document.getElementById('streak-line');
    if (!lineEl) return;
    try {
      const s = await apiRequest('/api/me/streak', { silent: true });
      const flameEl = document.getElementById('streak-flame');
      const countEl = document.getElementById('streak-count');
      const labelEl = document.getElementById('streak-label');
      const bestEl = document.getElementById('streak-best');
      const weekEl = document.getElementById('streak-week');

      countEl.textContent = s.current;
      labelEl.textContent = s.current > 0
        ? t(currentLocale, 'ui_streak')
        : t(currentLocale, 'ui_streak_none');
      countEl.style.display = s.current > 0 ? '' : 'none';
      flameEl.className = `streak-flame${s.current > 0 ? '' : ' cold'}`;
      bestEl.textContent = s.best > 1 ? t(currentLocale, 'ui_streak_best', { n: s.best }) : '';

      const todayIso = s.week.length ? s.week[s.week.length - 1].date : '';
      weekEl.innerHTML = s.week.map(d => {
        const classes = ['streak-dot'];
        if (d.prayed) classes.push('on');
        if (d.date === todayIso) classes.push('today');
        return `<span class="${classes.join(' ')}">${Number(d.date.slice(8, 10))}</span>`;
      }).join('');
      lineEl.classList.remove('hidden');
    } catch (e) {
      lineEl.classList.add('hidden');
    }
  }

  // Load User & Today
  async function init() {
    if (tg?.initDataUnsafe?.user) {
      me = { id: tg.initDataUnsafe.user.id };
    }
    await loadUser();
    await loadToday();
  }

  async function loadUser() {
    try {
      const data = await apiRequest('/api/me');
      me = data.user;
      if (data.locales) locales = data.locales;
      if (me?.locale && ['uk', 'en', 'ru'].includes(me.locale)) {
        currentLocale = me.locale;
      }
      if (me?.theme) applyTheme(me.theme, false);
      applyLanguage(currentLocale);
    } catch (e) {}
  }

  async function loadToday() {
    todayDateEl.textContent = new Date().toLocaleDateString(currentLocale, {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    todayListEl.innerHTML = `<div class="loading-state">${t(currentLocale, 'ui_loading_today')}</div>`;
    const progressPill = document.getElementById('today-progress-pill');
    const progressFill = document.getElementById('today-progress-fill');
    loadStreak();

    try {
      const assignments = await apiRequest('/api/me/today');
      const total = assignments.length;
      const completed = assignments.filter(a => a.prayedToday).length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      if (progressPill) progressPill.textContent = `${completed}/${total} ${t(currentLocale, 'ui_completed')}`;
      if (progressFill) progressFill.style.width = `${percent}%`;

      if (assignments.length === 0) {
        todayListEl.innerHTML = `<div class="empty-state">${t(currentLocale, 'ui_no_assignments')}</div>`;
        return;
      }
      todayListEl.innerHTML = '';
      assignments.forEach(item => {
        const card = document.createElement('div');
        card.className = 'today-card';
        card.innerHTML = `
          <div class="today-card-header">
            <span class="room-tag">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              ${escapeHtml(item.roomName)}
            </span>
            <span class="badge ${item.kind === 'shared' ? 'badge-shared' : 'badge-personal'}">${item.kind === 'shared' ? t(currentLocale, 'ui_shared_badge') : t(currentLocale, 'ui_personal_badge')}</span>
          </div>
          <div class="today-prayer-text">${escapeHtml(item.topicText)}</div>
          <div class="today-card-footer">
            ${item.prayedToday ? `
              <div class="prayed-done-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ${t(currentLocale, 'ui_prayed_today')}
              </div>
            ` : `
              <button class="btn btn-sm btn-primary btn-block btn-pray" data-topic-id="${item.topicId}">
                ${t(currentLocale, 'ui_mark_prayed')}
              </button>
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
      todayListEl.innerHTML = `<div class="empty-state">${t(currentLocale, 'err_generic')}</div>`;
    }
  }

  // Rooms Tab
  async function loadRooms() {
    roomsListEl.innerHTML = `<div class="loading-state">${t(currentLocale, 'ui_loading_rooms')}</div>`;
    try {
      rooms = await apiRequest('/api/rooms');
      if (rooms.length === 0) {
        roomsListEl.innerHTML = `<div class="empty-state">${t(currentLocale, 'ui_no_rooms')}</div>`;
        return;
      }
      roomsListEl.innerHTML = '';
      rooms.forEach(r => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="card-header">
            <span class="card-title">${escapeHtml(r.name)}</span>
            <span class="badge badge-${r.isAdmin ? 'admin' : 'member'}">${r.isAdmin ? t(currentLocale, 'ui_admin') : t(currentLocale, 'ui_member')}</span>
          </div>
          <div class="card-meta">${t(currentLocale, 'ui_invite_code_label')} <code>${r.inviteCode}</code></div>
          <div style="margin-top: 8px;">
            <button class="btn btn-sm btn-secondary btn-block btn-open-room" data-room-id="${r.id}">${t(currentLocale, 'ui_view_room')}</button>
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
      roomsListEl.innerHTML = `<div class="empty-state">${t(currentLocale, 'err_generic')}</div>`;
    }
  }

  // Room Detail
  async function openRoomDetail(roomId) {
    try {
      if (!me) await loadUser();
      currentRoom = await apiRequest(`/api/rooms/${roomId}`);
      detailRoomName.textContent = currentRoom.name;
      detailRoomRole.textContent = currentRoom.isAdmin ? t(currentLocale, 'ui_admin') : t(currentLocale, 'ui_member');
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

      // Render Members List
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
              <span class="badge badge-${m.role === 'admin' ? 'admin' : 'member'}">${m.role === 'admin' ? t(currentLocale, 'ui_admin') : t(currentLocale, 'ui_member')}</span>
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
        notify(t(currentLocale, 'ui_copied'));
      } catch (err) {
        prompt(t(currentLocale, 'ui_copy_code'), currentRoom.inviteCode);
      }
    });
  }

  if (btnCopyInviteLink) {
    btnCopyInviteLink.addEventListener('click', async () => {
      if (!currentRoom) return;
      const botName = currentRoom.botUsername || 'prayer_me_bot';
      const inviteUrl = `https://t.me/${botName}?start=join_${currentRoom.inviteCode}`;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        notify(t(currentLocale, 'ui_copied'));
      } catch (err) {
        prompt(t(currentLocale, 'ui_copy_link'), inviteUrl);
      }
    });
  }

  function renderTopics(container, topics, isShared) {
    if (!topics || topics.length === 0) {
      container.innerHTML = `<div class="empty-state">${t(currentLocale, 'no_topics')}</div>`;
      return;
    }
    container.innerHTML = '';
    topics.forEach(tItem => {
      const isOwner = tItem.ownerId === me?.id || (isShared && currentRoom?.isAdmin);
      const card = document.createElement('div');
      card.className = 'card';
      const authorName = tItem.authorName === 'Anonymous'
        ? t(currentLocale, 'ui_anonymous')
        : (tItem.authorName || t(currentLocale, 'ui_member'));
      card.innerHTML = `
        <div class="card-header">
          <span class="badge ${tItem.status === 'answered' ? 'badge-answered' : (isShared ? 'badge-shared' : 'badge-personal')}">
            ${tItem.status === 'answered' ? t(currentLocale, 'ui_answered_badge') : (isShared ? t(currentLocale, 'ui_shared_badge') : t(currentLocale, 'ui_personal_badge'))}
          </span>
          ${!isShared ? `<span class="card-meta">${t(currentLocale, 'ui_author')}: ${escapeHtml(authorName)}</span>` : ''}
        </div>
        <div class="card-title">${escapeHtml(tItem.text)}</div>
        ${tItem.updates && tItem.updates.length ? `
          <div class="topic-updates">
            <strong>${t(currentLocale, 'ui_updates')}:</strong>
            ${tItem.updates.map(u => `<div class="update-item">• ${escapeHtml(u.text)}</div>`).join('')}
          </div>
        ` : ''}
        ${tItem.answeredNote ? `
          <div class="topic-updates answered">
            <strong>${t(currentLocale, 'ui_answered_praise')}:</strong> ${escapeHtml(tItem.answeredNote)}
          </div>
        ` : ''}
        ${isOwner && tItem.status !== 'answered' ? `
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button class="btn btn-sm btn-outline btn-post-update" data-topic-id="${tItem.id}">${t(currentLocale, 'btn_update')}</button>
            <button class="btn btn-sm btn-secondary btn-mark-answered" data-topic-id="${tItem.id}">${t(currentLocale, 'btn_answer')}</button>
          </div>
        ` : ''}
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('.btn-post-update').forEach(btn => {
      btn.addEventListener('click', () => {
        showPromptModal(t(currentLocale, 'btn_update'), t(currentLocale, 'update_prompt'), async (text) => {
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
        showPromptModal(t(currentLocale, 'btn_answer'), t(currentLocale, 'answer_prompt'), async (text) => {
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
    showPromptModal(t(currentLocale, 'btn_create_room'), t(currentLocale, 'create_prompt_name'), async (name) => {
      await apiRequest('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      loadRooms();
    });
  });

  document.getElementById('btn-join-room-modal').addEventListener('click', () => {
    showPromptModal(t(currentLocale, 'btn_join_room'), t(currentLocale, 'join_prompt_code'), async (code) => {
      await apiRequest('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      loadRooms();
    });
  });

  btnAddSharedTopic.addEventListener('click', () => {
    showPromptModal(t(currentLocale, 'btn_add_shared'), t(currentLocale, 'shared_prompt'), async (text) => {
      await apiRequest(`/api/rooms/${currentRoom.id}/topics`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'shared', text })
      });
      openRoomDetail(currentRoom.id);
    });
  });

  btnAddPersonalTopic.addEventListener('click', () => {
    showTopicModal(t(currentLocale, 'btn_add_personal'), async (text, isAnonymous) => {
      await apiRequest(`/api/rooms/${currentRoom.id}/topics`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'personal', text, isAnonymous })
      });
      openRoomDetail(currentRoom.id);
    });
  });

  btnLeaveRoom.addEventListener('click', async () => {
    if (await confirmAsk(t(currentLocale, 'ui_confirm_leave'))) {
      await apiRequest(`/api/rooms/${currentRoom.id}/leave`, { method: 'POST' });
      roomOverlay.classList.add('hidden');
      loadRooms();
    }
  });

  btnCloseRoom.addEventListener('click', async () => {
    if (await confirmAsk(t(currentLocale, 'ui_confirm_close'))) {
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
      if (data.locales) locales = data.locales;
      reminderToggleEl.checked = !!me.reminderEnabled;
      if (me.reminderTime) reminderTimeEl.value = me.reminderTime;
      reminderTimeEl.disabled = !reminderToggleEl.checked;
      if (me.locale) {
        currentLocale = me.locale;
      }
      if (me.theme) applyTheme(me.theme, false);
      applyLanguage(currentLocale);
    } catch (e) {}
  }

  reminderToggleEl.addEventListener('change', () => {
    reminderTimeEl.disabled = !reminderToggleEl.checked;
  });

  if (languageSelectEl) {
    languageSelectEl.addEventListener('change', async (e) => {
      const newLang = e.target.value;
      applyLanguage(newLang);
      try {
        await apiRequest('/api/me/settings', {
          method: 'PUT',
          body: JSON.stringify({ locale: newLang })
        });
      } catch (err) {}
    });
  }

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const selectedLocale = languageSelectEl ? languageSelectEl.value : currentLocale;
    await apiRequest('/api/me/settings', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: reminderToggleEl.checked,
        time: reminderTimeEl.value,
        locale: selectedLocale
      })
    });
    applyLanguage(selectedLocale);
    notify(t(currentLocale, 'ui_settings_saved'));
  });

  // Modal Helpers
  function showPromptModal(title, label, onSubmit) {
    modalTitle.textContent = title;
    modalBody.innerHTML = `
      <div class="modal-field">
        <label class="modal-label" for="modal-input">${escapeHtml(label)}</label>
        <input type="text" id="modal-input" class="input-text" autofocus>
        <button class="btn btn-primary btn-block" id="modal-submit">${t(currentLocale, 'ui_submit')}</button>
      </div>
    `;
    openModal();

    const input = document.getElementById('modal-input');
    const submit = document.getElementById('modal-submit');

    const handle = async () => {
      const val = input.value.trim();
      if (!val) return;
      closeModal();
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
      <div class="modal-field">
        <label class="modal-label" for="modal-input">${t(currentLocale, 'personal_prompt')}</label>
        <input type="text" id="modal-input" class="input-text" autofocus>
        <label class="modal-check">
          <input type="checkbox" id="modal-anon-check"> ${t(currentLocale, 'ui_add_anonymously')}
        </label>
        <button class="btn btn-primary btn-block" id="modal-submit">${t(currentLocale, 'ui_submit')}</button>
      </div>
    `;
    openModal();

    const input = document.getElementById('modal-input');
    const check = document.getElementById('modal-anon-check');
    const submit = document.getElementById('modal-submit');

    const handle = async () => {
      const val = input.value.trim();
      if (!val) return;
      closeModal();
      try {
        await onSubmit(val, check.checked);
      } catch (e) {}
    };

    submit.addEventListener('click', handle);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handle();
    });
  }

  function openModal() {
    modalContainer.classList.remove('hidden');
    setTimeout(() => document.getElementById('modal-input')?.focus(), 0);
  }

  function closeModal() {
    modalContainer.classList.add('hidden');
  }

  btnCloseModal.addEventListener('click', closeModal);

  // Tapping the backdrop or pressing Escape dismisses the modal — without
  // these the only way out is the small × in the corner.
  modalContainer.addEventListener('click', (e) => {
    if (e.target === modalContainer) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modalContainer.classList.contains('hidden')) return closeModal();
    if (!roomOverlay.classList.contains('hidden')) roomOverlay.classList.add('hidden');
  });

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  init();
})();
