
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let db = null;
  let user = null;
  let currentChat = null;
  let messageChannel = null;
  let loadingMessages = false;
  let authVersion = 0;

  // ==========================================
  // NOTIFICATIONS
  // ==========================================

  function note(message) {
    const box = $('notice');

    if (box) {
      box.textContent = message;
      box.hidden = !message;
    } else {
      alert(message);
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

  $('create')?.addEventListener('click', () => {
    alert('CREATE BUTTON CLICK DETECTED');
    try {
      createGroup();
    } catch (error) {
      alert('CREATE GROUP ERROR: ' + (error?.message || String(error)));
      console.error(error);
    }
  });

  $('refreshgroups')?.addEventListener('click', () => {
    void loadGroups();
  });

  $('refresh')?.addEventListener('click', () => {
    void loadMessages();
  });

  $('sendform')?.addEventListener('submit', (event) => {
    void sendMessage(event);
  });

  // ==========================================
  // INITIALIZE SUPABASE
  // ==========================================

  async function init() {
    try {
      if (!window.supabase) {
        throw new Error(
          'Supabase library did not load. Check your internet connection.'
        );
      }

      if (!window.CIRCLE_CONFIG) {
        throw new Error(
          'config.js did not load. Check that it is in the same folder.'
        );
      }

      const url = window.CIRCLE_CONFIG.SUPABASE_URL;
      const key = window.CIRCLE_CONFIG.SUPABASE_PUBLISHABLE_KEY;

      if (!url || !key ||
          key === 'PASTE_YOUR_EXISTING_PUBLISHABLE_KEY_HERE') {
        throw new Error('Check your Supabase settings in config.js.');
      }

      db = window.supabase.createClient(url, key);

      const { data, error } = await db.auth.getSession();

      if (error) throw error;

      await updateUser(data.session?.user ?? null);

      db.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => {
          void updateUser(session?.user ?? null);
        }, 0);
      });

    } catch (error) {
      console.error('Chatt initialization error:', error);
      note('Startup error: ' + (error.message || String(error)));
    }
  }

  // ==========================================
  // GOOGLE SIGN-IN
  // ==========================================

  async function signInWithGoogle() {
    clearNote();

    if (!db) {
      note('Chatt is not connected to Supabase. Check the startup error.');
      return;
    }

    setButton('google', 'Connecting to Google...', true);

    try {
      const redirectTo =
        'https://dondavis644-del.github.io/Chatt/';

      const { data, error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
      });

      if (error) throw error;

      if (data?.url) {
        window.location.assign(data.url);
      } else {
        note('No Google redirect URL was returned. Please try again.');
        setButton('google', 'Continue with Google', false);
      }

    } catch (error) {
      console.error('Google sign-in error:', error);
      note('Google sign-in failed: ' + (error.message || String(error)));
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
      note('Sign-in failed: ' + (error.message || String(error)));

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

      note(
        data.session
          ? 'Account created successfully.'
          : 'Check your email to confirm your account.'
      );

    } catch (error) {
      console.error('Account creation error:', error);
      note('Account creation failed: ' + (error.message || String(error)));

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

    const signedIn = Boolean(user);

    if ($('auth')) $('auth').hidden = signedIn;
    if ($('workspace')) $('workspace').hidden = !signedIn;
    if ($('signout')) $('signout').hidden = !signedIn;

    if ($('who')) {
      $('who').textContent = signedIn
        ? (user.email || 'Signed in')
        : '';
    }

    if (changed) {
      currentChat = null;
      stopMessageChannel();

      if ($('groups')) $('groups').replaceChildren();
      if ($('messages')) $('messages').replaceChildren();

      if ($('title')) $('title').textContent = 'Select a group';
    }

    if (signedIn) {
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
      note('Sign-out failed: ' + (error.message || String(error)));
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

      list.replaceChildren();

      const chats = (data || [])
        .map((membership) => membership.chats)
        .filter(Boolean);

      if (!chats.length) {
        list.textContent = 'No groups yet. Create one!';
        return;
      }

      for (const group of chats) {
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'group-button';
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
      note('Group loading failed: ' + (error.message || String(error)));
    }
  }

  // ==========================================
  // CREATE GROUP — UPDATED DIAGNOSTICS
  // ==========================================

  async function createGroup() {
    clearNote();

    if (!db || !user) {
      note('You are not signed in. Please sign in again.');
      return;
    }

    const name = prompt('Enter a group name:', 'Test Group');

    if (name === null) {
      note('Group creation cancelled.');
      return;
    }

    const cleanName = name.trim().slice(0, 60);

    if (!cleanName) {
      note('Please enter a group name.');
      return;
    }

    setButton('create', 'Creating group...', true);
    note('Creating your group. Please wait...');

    try {
      console.log('Creating group for user:', user.id);

      const { data, error } = await db
        .from('chats')
        .insert({
          name: cleanName,
          created_by: user.id
        })
        .select('id,name')
        .single();

      if (error) {
        console.error('Supabase group creation error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });

        note(
          'GROUP CREATION FAILED\n' +
          'Message: ' + error.message +
          '\nCode: ' + (error.code || 'Not provided') +
          '\nDetails: ' + (error.details || 'None')
        );

        return;
      }

      console.log('Group created:', data);

      note('Group created! Refreshing your group list...');

      await loadGroups();
      await selectChat(data);

      note('Group "' + data.name + '" created successfully.');

    } catch (error) {
      console.error('Unexpected group creation error:', error);

      note(
        'UNEXPECTED ERROR\n' +
        (error.message || String(error))
      );

    } finally {
      setButton('create', '+ Create group', false);
    }
  }

  // ==========================================
  // OPEN GROUP
  // ==========================================

  async function selectChat(group) {
    if (!group?.id) return;

    currentChat = group;

    if ($('title')) {
      $('title').textContent = group.name || 'Chat';
    }

    await loadGroups();

    if (currentChat?.id === group.id) {
      await loadMessages();
    }
  }

  // ==========================================
  // LOAD MESSAGES
  // ==========================================

  async function loadMessages() {
    if (!db || !user || !currentChat || loadingMessages) return;

    loadingMessages = true;

    try {
      const selectedChatId = currentChat.id;

      const { data, error } = await db
        .from('messages')
        .select('id,sender_id,content,created_at,expires_at')
        .eq('chat_id', selectedChatId)
        .order('created_at', { ascending: true });

      if (error) throw error;

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
        empty.textContent = 'No messages yet. Start the conversation!';
        container.appendChild(empty);
      }

      for (const message of visibleMessages) {
        const item = document.createElement('article');
        item.className = 'message';

        const sender = document.createElement('strong');
        sender.textContent =
          message.sender_id === user.id ? 'You' : 'Member';

        const content = document.createElement('p');
        content.textContent = message.content || '';

        const time = document.createElement('small');
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
      note('Could not load messages: ' + (error.message || String(error)));

    } finally {
      loadingMessages = false;
    }
  }

  // ==========================================
  // SEND MESSAGE
  // ==========================================

  async function sendMessage(event) {
    event.preventDefault();
    clearNote();

    if (!db || !user || !currentChat) {
      note('Select a group before sending a message.');
      return;
    }

    const input = $('message');
    const content = input?.value.trim();

    if (!content) return;

    setButton('send', 'Sending...', true);

    try {
      const expiryChoice = $('expiry')?.value || 'never';
      let expiresAt = null;

      if (expiryChoice !== 'never') {
        const hours = Number(expiryChoice);

        if (Number.isFinite(hours) && hours > 0) {
          expiresAt = new Date(
            Date.now() + hours * 60 * 60 * 1000
          ).toISOString();
        }
      }

      const { error } = await db
        .from('messages')
        .insert({
          chat_id: currentChat.id,
          sender_id: user.id,
          content,
          message_type: 'text',
          expires_at: expiresAt
        });

      if (error) throw error;

      if (input) input.value = '';

      await loadMessages();

    } catch (error) {
      console.error('Send message error:', error);
      note('Could not send message: ' + (error.message || String(error)));

    } finally {
      setButton('send', 'Send', false);
    }
  }

  // ==========================================
  // LIVE MESSAGE UPDATES
  // ==========================================

  function stopMessageChannel() {
    if (db && messageChannel) {
      void db.removeChannel(messageChannel);
    }

    messageChannel = null;
  }

  function startMessageChannel(chatId) {
    if (!db || !chatId || currentChat?.id !== chatId) return;

    if (messageChannel?._chattChatId === chatId) return;

    stopMessageChannel();

    messageChannel = db
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
          void loadMessages();
        }
      );

    messageChannel._chattChatId = chatId;

    messageChannel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error('Live message updates failed.');
      }
    });
  }

  // ==========================================
  // START CHATT
  // ==========================================

  void init();

})();
