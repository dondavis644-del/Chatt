
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let db = null;
  let user = null;
  let currentChat = null;
  let messageChannel = null;
  let loadingMessages = false;
  let authVersion = 0;
  let creatingGroup = false;

  // ==========================================
  // NOTIFICATIONS
  // ==========================================

  function note(message) {
    const box = $('notice');

    if (box) {
      box.textContent = message;
      box.hidden = !message;
    } else if (message) {
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

  function errorText(error) {
    if (!error) return 'Unknown error';
    return error.message || String(error);
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

      if (!config) {
        throw new Error('config.js did not load.');
      }

      const url = config.SUPABASE_URL;
      const key = config.SUPABASE_PUBLISHABLE_KEY;

      if (
        !url ||
        !key ||
        key === 'PASTE_YOUR_EXISTING_PUBLISHABLE_KEY_HERE'
      ) {
        throw new Error('Check the Supabase URL and publishable key in config.js.');
      }

      db = window.supabase.createClient(url, key);

      const { data, error } = await db.auth.getSession();
      if (error) throw error;

      await updateUser(data.session?.user ?? null);

      db.auth.onAuthStateChange((_event, session) => {
        void updateUser(session?.user ?? null);
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
      note('Supabase is not initialized. Check the startup error.');
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

      note(
        data.session
          ? 'Account created successfully.'
          : 'Check your email to confirm your account.'
      );

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
    if ($('signout')) $('signout').hidden = !user;

    if ($('who')) {
      $('who').textContent = user ? (user.email || 'Signed in') : '';
    }

    if (changed) {
      currentChat = null;
      stopMessageChannel();

      $('groups')?.replaceChildren();
      $('messages')?.replaceChildren();

      if ($('title')) $('title').textContent = 'Select a group';
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
        .map((membership) => membership.chats)
        .filter(Boolean);

      list.replaceChildren();

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
      note('Group loading failed: ' + errorText(error));
    }
  }

  // ==========================================
  // CREATE GROUP
  // ==========================================

  async function createGroup() {
    if (creatingGroup) return;

    clearNote();

    if (!db) {
      note('Supabase is not initialized. Refresh the page and sign in again.');
      return;
    }

    if (!user) {
      note('You are not signed in. Please sign in again.');
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
    setButton('create', 'Creating group...', true);
    note('Creating your group...');

    try {
      // Use the authenticated user's ID as the creator.
      let result;

      try {
        result = await db
          .from('chats')
          .insert({
            name: cleanName,
            created_by: user.id
          })
          .select('id,name')
          .single();
      } catch (err) {
        alert(
          'SUPABASE REQUEST REJECTED\n' +
          (err?.message || String(err))
        );
        console.error(err);
        return;
      }

      const { data, error } = result;

      if (error) {
        alert(
          'GROUP INSERT FAILED\n' +
          'Message: ' + (error.message || 'None') + '\n' +
          'Code: ' + (error.code || 'None') + '\n' +
          'Details: ' + (error.details || 'None') + '\n' +
          'Hint: ' + (error.hint || 'None')
        );

        console.error('Supabase insert error:', error);
        return;
      }

      alert('GROUP INSERT SUCCEEDED\n' + JSON.stringify(data));

      if (!data?.id) {
        note('The database returned no group ID. Check the Supabase response.');
        return;
      }

      // The existing database trigger should add the creator
      // to chat_members. Do not insert the membership a second time.
      currentChat = data;

      await loadGroups();
      await selectChat(data);

      note('Group "' + data.name + '" created successfully.');

    } catch (error) {
      console.error('Unexpected create-group error:', error);
      note('GROUP CREATION ERROR: ' + errorText(error));

    } finally {
      creatingGroup = false;
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
    await loadMessages();
  }

  // ==========================================
  // LOAD MESSAGES
  // ==========================================

  async function loadMessages() {
    if (!db || !user || !currentChat || loadingMessages) return;

    loadingMessages = true;
    const selectedChatId = currentChat.id;

    try {
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
      note('Could not load messages: ' + errorText(error));

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
      note('Could not send message: ' + errorText(error));

    } finally {
      setButton('send', 'Send', false);
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

  $('signin')?.addEventListener('click', (event) => {
    // Prevent a duplicate form submission if this button
    // is also inside a form.
    if ($('loginform')) return;
    event.preventDefault();
    void signInWithEmail();
  });

  $('signup')?.addEventListener('click', () => {
    void createAccount();
  });

  $('signout')?.addEventListener('click', () => {
    void signOut();
  });

  $('create')?.addEventListener('click', async (event) => {
    event.preventDefault();
    await createGroup();
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

  // Start Chatt.
  void init();
})();
