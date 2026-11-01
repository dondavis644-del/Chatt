
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let db = null;
  let user = null;
  let currentChat = null;
  let messageChannel = null;
  let loadingMessages = false;
  let pendingMessageLoad = false;
  let authVersion = 0;
  let creatingGroup = false;
  let sendingMessage = false;
  let noticeTimer = null;

  // ==========================================
  // NOTIFICATIONS
  // ==========================================

  function note(message) {
    const box = $('notice');

    if (!box) {
      if (message) alert(message);
      return;
    }

    box.textContent = message || '';
    box.classList.toggle('show', Boolean(message));
    box.hidden = !message;

    if (noticeTimer) clearTimeout(noticeTimer);

    if (message) {
      noticeTimer = setTimeout(() => {
        box.classList.remove('show');
        box.hidden = true;
      }, 5000);
    }
  }

  function clearNote() {
    note('');
  }

  function setButton(id, text, disabled) {
    const button = $(id);
    if (!button) return;

    button.textContent = text;
    button.disabled = disabled;
  }

  function setSendButton(text, disabled) {
    const button = $('sendform')?.querySelector(
      'button[type="submit"]'
    );

    if (!button) return;

    button.textContent = text;
    button.disabled = disabled;
  }

  function errorText(error) {
    return error?.message || String(error || 'Unknown error');
  }

  // ==========================================
  // INITIALIZE SUPABASE
  // ==========================================

  async function init() {
    try {
      if (!window.supabase) {
        throw new Error('Supabase library failed to load.');
      }

      const config = window.CIRCLE_CONFIG;

      if (!config?.SUPABASE_URL ||
          !config?.SUPABASE_PUBLISHABLE_KEY) {
        throw new Error(
          'Check SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in config.js.'
        );
      }

      db = window.supabase.createClient(
        config.SUPABASE_URL,
        config.SUPABASE_PUBLISHABLE_KEY
      );

      const { data, error } = await db.auth.getSession();
      if (error) throw error;

      await updateUser(data.session?.user || null);

      db.auth.onAuthStateChange((_event, session) => {
        void updateUser(session?.user || null);
      });
    } catch (error) {
      console.error('Chatt startup error:', error);
      note('Startup failed: ' + errorText(error));
    }
  }

  // ==========================================
  // GOOGLE SIGN-IN
  // ==========================================

  async function signInWithGoogle() {
    clearNote();

    if (!db) {
      note('Supabase is not initialized. Refresh the page.');
      return;
    }

    setButton('google', 'Connecting to Google...', true);

    try {
      const { data, error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'https://dondavis644-del.github.io/Chatt/'
        }
      });

      if (error) throw error;

      if (data?.url) {
        window.location.assign(data.url);
      } else {
        note('Google did not return a sign-in URL.');
        setButton('google', 'Continue with Google', false);
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      note('Google sign-in failed: ' + errorText(error));
      setButton('google', 'Continue with Google', false);
    }
  }

  // ==========================================
  // EMAIL SIGN-IN
  // ==========================================

  async function signInWithEmail() {
    clearNote();

    if (!db) {
      note('Supabase is not initialized.');
      return;
    }

    const email = $('email')?.value.trim();
    const password = $('password')?.value;

    if (!email || !password) {
      note('Enter your email and password.');
      return;
    }

    setButton('signin', 'Signing in...', true);

    try {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      note('Signed in successfully.');
    } catch (error) {
      console.error('Email sign-in error:', error);
      note('Sign-in failed: ' + errorText(error));
    } finally {
      setButton('signin', 'Sign in', false);
    }
  }

  // ==========================================
  // CREATE ACCOUNT
  // ==========================================

  async function createAccount() {
    clearNote();

    if (!db) {
      note('Supabase is not initialized.');
      return;
    }

    const email = $('email')?.value.trim();
    const password = $('password')?.value;

    if (!email || !password) {
      note('Enter an email and password.');
      return;
    }

    if (password.length < 6) {
      note('Password must contain at least 6 characters.');
      return;
    }

    setButton('signup', 'Creating account...', true);

    try {
      const { data, error } = await db.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      note(data.session
        ? 'Account created successfully.'
        : 'Check your email to confirm your account.');
    } catch (error) {
      console.error('Account creation error:', error);
      note('Account creation failed: ' + errorText(error));
    } finally {
      setButton('signup', 'Create account', false);
    }
  }

  // ==========================================
  // LOGIN STATE
  // ==========================================

  async function updateUser(nextUser) {
    const version = ++authVersion;
    const changed = user?.id !== nextUser?.id;

    user = nextUser;

    if ($('auth')) $('auth').hidden = Boolean(user);
    if ($('workspace')) $('workspace').hidden = !user;
    if ($('user')) $('user').hidden = !user;
    if ($('signout')) $('signout').hidden = !user;

    if ($('who')) {
      $('who').textContent = user?.email || (user ? 'Signed in' : '');
    }

    if (changed) {
      currentChat = null;
      stopMessageChannel();

      $('groups')?.replaceChildren();
      $('messages')?.replaceChildren();

      if ($('title')) $('title').textContent = 'Select a group';
      if ($('sendform')) $('sendform').hidden = true;

      if ($('messages')) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = user
          ? 'Select a group to view messages.'
          : 'Sign in to view your conversations.';
        $('messages').appendChild(empty);
      }
    }

    if (user) {
      await loadGroups();
    }

    if (version !== authVersion) return;
  }

  async function signOut() {
    if (!db) return;

    clearNote();

    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;
      note('Signed out successfully.');
    } catch (error) {
      console.error('Sign-out error:', error);
      note('Sign-out failed: ' + errorText(error));
    }
  }

  // ==========================================
  // LOAD GROUPS
  // ==========================================

  async function loadGroups() {
    if (!db || !user) return;

    const list = $('groups');
    if (!list) return;

    list.textContent = 'Loading groups...';

    try {
      const { data, error } = await db
        .from('chat_members')
        .select('chat_id,chats(id,name)')
        .eq('user_id', user.id);

      if (error) throw error;

      const chats = (data || [])
        .map((item) => item.chats)
        .filter(Boolean);

      list.replaceChildren();

      if (!chats.length) {
        list.textContent = 'No groups yet. Create one!';
        return;
      }

      for (const group of chats) {
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'alt group-button';
        button.textContent = group.name || 'Unnamed group';

        if (currentChat?.id === group.id) {
          button.classList.add('active');
        }

        button.addEventListener('click', () => {
          void selectChat(group);
        });

        list.appendChild(button);
      }
    } catch (error) {
      console.error('Load groups error:', error);
      list.textContent = 'Could not load groups.';
      note('Group loading failed: ' + errorText(error));
    }
  }

  // ==========================================
  // CREATE GROUP
  // ==========================================

  async function createGroup() {
    if (creatingGroup) return;

    clearNote();

    if (!db || !user) {
      note('Please sign in again before creating a group.');
      return;
    }

    const name = window.prompt('Enter a group name:', 'My Group');
    if (name === null) return;

    const cleanName = name.trim().slice(0, 60);

    if (!cleanName) {
      note('Enter a group name before continuing.');
      return;
    }

    creatingGroup = true;
    setButton('create', 'Creating...', true);

    try {
      const { data, error } = await db
        .from('chats')
        .insert({
          name: cleanName,
          created_by: user.id
        })
        .select('id,name')
        .single();

      if (error) throw error;
      if (!data?.id) throw new Error('No group ID returned.');

      // The existing database trigger should create the
      // creator's membership. Do not insert it a second time.
      await loadGroups();
      await selectChat(data);

      note('Group created successfully.');
    } catch (error) {
      console.error('Create group error:', error);
      note('Group creation failed: ' + errorText(error));
    } finally {
      creatingGroup = false;
      setButton('create', '+ Create', false);
    }
  }

  // ==========================================
  // OPEN GROUP
  // ==========================================

  async function selectChat(group) {
    if (!group?.id) return;

    currentChat = group;
    stopMessageChannel();

    if ($('title')) {
      $('title').textContent = group.name || 'Chat';
    }

    // FIX: reveal the composer after selecting a group.
    if ($('sendform')) {
      $('sendform').hidden = false;
    }

    if ($('messages')) {
      $('messages').replaceChildren();
      const loading = document.createElement('p');
      loading.className = 'empty';
      loading.textContent = 'Loading messages...';
      $('messages').appendChild(loading);
    }

    await loadGroups();
    await loadMessages();
  }

  // ==========================================
  // LOAD MESSAGES
  // ==========================================

  async function loadMessages() {
    if (!db || !user || !currentChat) return;

    // If a load is already running, schedule another load.
    if (loadingMessages) {
      pendingMessageLoad = true;
      return;
    }

    loadingMessages = true;
    const selectedChatId = currentChat.id;

    try {
      const { data, error } = await db
        .from('messages')
        .select('id,sender_id,content,created_at,expires_at')
        .eq('chat_id', selectedChatId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Do not display results from a previously selected group.
      if (currentChat?.id !== selectedChatId) return;

      const container = $('messages');
      if (!container) return;

      container.replaceChildren();

      const now = Date.now();
      const visibleMessages = (data || []).filter((message) => {
        if (!message.expires_at) return true;
        const expiry = new Date(message.expires_at).getTime();
        return !Number.isFinite(expiry) || expiry > now;
      });

      if (!visibleMessages.length) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'No messages yet. Start the conversation!';
        container.appendChild(empty);
      }

      for (const message of visibleMessages) {
        const item = document.createElement('article');
        item.className = 'msg';

        if (message.sender_id === user.id) {
          item.classList.add('mine');
        }

        const sender = document.createElement('div');
        sender.className = 'meta';
        sender.textContent =
          message.sender_id === user.id ? 'You' : 'Member';

        const content = document.createElement('div');
        content.className = 'body';
        content.textContent = message.content || '';

        const time = document.createElement('div');
        time.className = 'meta';
        time.textContent = message.created_at
          ? new Date(message.created_at).toLocaleString()
          : '';

        item.append(sender, content, time);
        container.appendChild(item);
      }

      container.scrollTop = container.scrollHeight;
      startMessageChannel(selectedChatId);
    } catch (error) {
      console.error('Load messages error:', error);

      if (currentChat?.id === selectedChatId) {
        note('Could not load messages: ' + errorText(error));
      }
    } finally {
      loadingMessages = false;

      if (pendingMessageLoad) {
        pendingMessageLoad = false;
        void loadMessages();
      }
    }
  }

  // ==========================================
  // SEND MESSAGE
  // ==========================================

  async function sendMessage(event) {
    event.preventDefault();

    if (sendingMessage) return;
    clearNote();

    if (!db || !user || !currentChat) {
      note('Select a group before sending a message.');
      return;
    }

    const input = $('message');
    const content = input?.value.trim();

    if (!content) return;

    // Expiry options in index.html are in SECONDS.
    const expirySeconds = Number($('expiry')?.value ?? 0);

    if (!Number.isFinite(expirySeconds) || expirySeconds < 0) {
      note('Select a valid message expiry.');
      return;
    }

    const selectedChatId = currentChat.id;
    const expiresAt = expirySeconds > 0
      ? new Date(Date.now() + expirySeconds * 1000).toISOString()
      : null;

    sendingMessage = true;
    setSendButton('Sending...', true);

    try {
      const { error } = await db
        .from('messages')
        .insert({
          chat_id: selectedChatId,
          sender_id: user.id,
          content,
          message_type: 'text',
          expires_at: expiresAt
        });

      if (error) throw error;

      if (currentChat?.id === selectedChatId && input) {
        input.value = '';
        await loadMessages();
      }

      note('Message sent.');
    } catch (error) {
      console.error('Send message error:', error);
      note('Could not send message: ' + errorText(error));
    } finally {
      sendingMessage = false;
      setSendButton('Send', false);
    }
  }

  // ==========================================
  // REALTIME MESSAGE UPDATES
  // ==========================================

  function stopMessageChannel() {
    if (db && messageChannel) {
      void db.removeChannel(messageChannel);
    }

    messageChannel = null;
  }

  function startMessageChannel(chatId) {
    if (!db || !chatId || currentChat?.id !== chatId) return;

    if (messageChannel?.chattChatId === chatId) return;

    stopMessageChannel();

    const channel = db
      .channel('chatt-messages-' + chatId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: 'chat_id=eq.' + chatId
        },
        () => {
          if (currentChat?.id === chatId) {
            void loadMessages();
          }
        }
      );

    channel.chattChatId = chatId;
    messageChannel = channel;

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error('Chatt realtime subscription failed.');
      }
    });
  }

  // ==========================================
  // BUTTON HANDLERS
  // ==========================================

  $('google')?.addEventListener('click', () => {
    void signInWithGoogle();
  });

  $('loginform')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void signInWithEmail();
  });

  $('signup')?.addEventListener('click', () => {
    void createAccount();
  });

  $('signout')?.addEventListener('click', () => {
    void signOut();
  });

  $('create')?.addEventListener('click', (event) => {
    event.preventDefault();
    void createGroup();
  });

  $('refresh')?.addEventListener('click', () => {
    void loadMessages();
  });

  $('sendform')?.addEventListener('submit', (event) => {
    void sendMessage(event);
  });

  // Start Chatt.
  void init();
})();
