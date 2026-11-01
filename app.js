
(() => {
  'use strict';

  // ==========================================
  // CHATT - APP.JS
  // ==========================================

  const $ = (id) => document.getElementById(id);

  let db = null;
  let user = null;
  let chat = null;
  let messageSubscription = null;
  let loadingMessages = false;

  // ==========================================
  // NOTIFICATIONS
  // ==========================================

  function note(message) {
    const element = $('notice');

    if (element) {
      element.textContent = message;
      element.hidden = false;
    } else {
      alert(message);
    }
  }

  function clearNote() {
    const element = $('notice');

    if (element) {
      element.textContent = '';
      element.hidden = true;
    }
  }

  // ==========================================
  // INITIALIZE SUPABASE
  // ==========================================

  async function init() {
    try {
      if (!window.supabase) {
        note('Supabase library failed to load. Refresh the page.');
        return;
      }

      if (!window.CIRCLE_CONFIG) {
        note('config.js was not loaded.');
        return;
      }

      const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } =
        window.CIRCLE_CONFIG;

      if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        note('Check the Supabase settings in config.js.');
        return;
      }

      db = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
      );

      // Connect button handlers.
      if ($('google')) {
        $('google').addEventListener('click', signInWithGoogle);
      }

      if ($('signin')) {
        $('signin').addEventListener('click', signInWithEmail);
      }

      if ($('signup')) {
        $('signup').addEventListener('click', createAccount);
      }

      if ($('signout')) {
        $('signout').addEventListener('click', signOut);
      }

      if ($('create')) {
        $('create').addEventListener('click', createGroup);
      }

      if ($('refresh')) {
        $('refresh').addEventListener('click', loadMessages);
      }

      if ($('sendform')) {
        $('sendform').addEventListener('submit', sendMessage);
      }

      if ($('loginform')) {
        $('loginform').addEventListener('submit', (event) => {
          event.preventDefault();
          void signInWithEmail();
        });
      }

      // Check the existing login session.
      const { data, error } = await db.auth.getSession();

      if (error) {
        console.error('Session error:', error);
        note(error.message);
        return;
      }

      await loggedIn(data.session?.user ?? null);

      // Listen for login/logout changes.
      db.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => {
          void loggedIn(session?.user ?? null);
        }, 0);
      });

    } catch (error) {
      console.error('Chatt initialization failed:', error);
      note('Chatt could not start: ' + error.message);
    }
  }

  // ==========================================
  // GOOGLE SIGN-IN
  // ==========================================

  async function signInWithGoogle() {
    clearNote();

    if (!db) {
      note('Chatt is still loading. Refresh and try again.');
      return;
    }

    const button = $('google');

    if (button) {
      button.disabled = true;
      button.textContent = 'Opening Google...';
    }

    try {
      const redirectTo =
        window.location.origin + window.location.pathname;

      const { error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo
        }
      });

      if (error) {
        console.error('Google sign-in error:', error);
        note('Google sign-in failed: ' + error.message);

        if (button) {
          button.disabled = false;
          button.textContent = 'Continue with Google';
        }
      }

      // On success, Supabase redirects the browser to Google.
    } catch (error) {
      console.error('Google sign-in exception:', error);
      note('Could not open Google: ' + error.message);

      if (button) {
        button.disabled = false;
        button.textContent = 'Continue with Google';
      }
    }
  }

  // ==========================================
  // EMAIL SIGN-IN
  // ==========================================

  async function signInWithEmail(event) {
    if (event?.preventDefault) {
      event.preventDefault();
    }

    clearNote();

    if (!db) {
      note('Chatt is still loading. Refresh the page.');
      return;
    }

    const email = $('email')?.value.trim();
    const password = $('password')?.value;

    if (!email || !password) {
      note('Enter your email and password.');
      return;
    }

    try {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('Email sign-in error:', error);
        note(error.message);
        return;
      }

      note('Signed in successfully.');

    } catch (error) {
      console.error(error);
      note('Sign-in failed: ' + error.message);
    }
  }

  // ==========================================
  // CREATE ACCOUNT
  // ==========================================

  async function createAccount(event) {
    if (event?.preventDefault) {
      event.preventDefault();
    }

    clearNote();

    if (!db) {
      note('Chatt is still loading. Refresh the page.');
      return;
    }

    const email = $('email')?.value.trim();
    const password = $('password')?.value;

    if (!email || !password) {
      note('Enter an email and password.');
      return;
    }

    if (password.length < 6) {
      note('Your password must contain at least 6 characters.');
      return;
    }

    try {
      const { data, error } = await db.auth.signUp({
        email,
        password
      });

      if (error) {
        console.error('Account creation error:', error);
        note(error.message);
        return;
      }

      if (data.session) {
        note('Your account has been created.');
      } else {
        note('Check your email to confirm your account.');
      }

    } catch (error) {
      console.error(error);
      note('Account creation failed: ' + error.message);
    }
  }

  // ==========================================
  // LOGIN / LOGOUT UI
  // ==========================================

  async function loggedIn(nextUser) {
    const previousUserId = user?.id;
    user = nextUser;

    const isLoggedIn = Boolean(user);

    if ($('auth')) {
      $('auth').hidden = isLoggedIn;
    }

    if ($('user')) {
      $('user').hidden = !isLoggedIn;
    }

    if ($('workspace')) {
      $('workspace').hidden = !isLoggedIn;
    }

    if ($('who')) {
      $('who').textContent = isLoggedIn
        ? (user.email || 'Signed in')
        : '';
    }

    if (!isLoggedIn) {
      chat = null;
      stopMessageSubscription();

      if ($('groups')) $('groups').replaceChildren();
      if ($('messages')) $('messages').replaceChildren();
      if ($('title')) $('title').textContent = 'Select a group';

      return;
    }

    if (previousUserId !== user.id) {
      chat = null;
      stopMessageSubscription();

      if ($('messages')) $('messages').replaceChildren();
      if ($('title')) $('title').textContent = 'Select a group';
    }

    await groups();
  }

  async function signOut() {
    if (!db) return;

    clearNote();

    const { error } = await db.auth.signOut();

    if (error) {
      console.error('Sign-out error:', error);
      note(error.message);
      return;
    }

    chat = null;
    note('You have signed out.');
  }

  // ==========================================
  // LOAD GROUPS
  // ==========================================

  async function groups() {
    if (!db || !user) return;

    const container = $('groups');

    if (!container) return;

    container.textContent = 'Loading groups...';

    try {
      const { data, error } = await db
        .from('chat_members')
        .select('chat_id,chats(id,name)')
        .eq('user_id', user.id);

      if (error) {
        console.error('Group loading error:', error);
        container.textContent = 'Could not load groups.';
        note('Could not load groups: ' + error.message);
        return;
      }

      container.replaceChildren();

      const memberships = data || [];
      const availableGroups = memberships
        .map((item) => item.chats)
        .filter(Boolean);

      if (availableGroups.length === 0) {
        container.textContent = 'No groups yet. Create one!';
        return;
      }

      availableGroups.forEach((group) => {
        const button = document.createElement('button');

        button.type = 'button';
        button.textContent = group.name || 'Unnamed group';
        button.className = 'group-button';

        if (chat?.id === group.id) {
          button.classList.add('active');
        }

        button.addEventListener('click', () => {
          void selectChat(group);
        });

        container.appendChild(button);
      });

    } catch (error) {
      console.error('Group loading exception:', error);
      container.textContent = 'Could not load groups.';
      note(error.message);
    }
  }

  // ==========================================
  // CREATE GROUP
  // ==========================================

  async function createGroup() {
    clearNote();

    if (!db || !user) {
      note('Sign in before creating a group.');
      return;
    }

    const name = prompt('Enter a group name:', 'Chatt Group');

    if (name === null || !name.trim()) return;

    try {
      const { data, error } = await db
        .from('chats')
        .insert({
          name: name.trim().slice(0, 60),
          created_by: user.id
        })
        .select('id,name')
        .single();

      if (error) {
        console.error('Group creation failed:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          userId: user.id
        });

        note('Could not create group: ' + error.message);
        return;
      }

      // The database trigger should add the creator
      // to chat_members. Do not insert them twice here.
      await groups();
      await selectChat(data);

      note('Group created successfully.');

    } catch (error) {
      console.error('Group creation exception:', error);
      note('Could not create group: ' + error.message);
    }
  }

  // ==========================================
  // OPEN A GROUP
  // ==========================================

  async function selectChat(group) {
    if (!group || !group.id) return;

    chat = group;

    if ($('title')) {
      $('title').textContent = group.name || 'Chat';
    }

    await groups();
    await loadMessages();
  }

  // ==========================================
  // LOAD MESSAGES
  // ==========================================

  async function loadMessages() {
    if (!db || !user || !chat || loadingMessages) return;

    loadingMessages = true;

    try {
      const { data, error } = await db
        .from('messages')
        .select('id,sender_id,content,created_at,expires_at')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Message loading error:', error);
        note('Could not load messages: ' + error.message);
        return;
      }

      const container = $('messages');

      if (!container) return;

      container.replaceChildren();

      const now = Date.now();

      (data || []).forEach((message) => {
        // Do not display messages that have expired.
        if (
          message.expires_at &&
          new Date(message.expires_at).getTime() <= now
        ) {
          return;
        }

        const item = document.createElement('div');
        item.className = 'message';

        const sender = document.createElement('strong');
        sender.textContent =
          message.sender_id === user.id ? 'You' : 'Member';

        const content = document.createElement('p');
        content.textContent = message.content || '';

        const timestamp = document.createElement('small');
        timestamp.textContent = message.created_at
          ? new Date(message.created_at).toLocaleString()
          : '';

        item.append(sender, content, timestamp);
        container.appendChild(item);
      });

      container.scrollTop = container.scrollHeight;

      startMessageSubscription();

    } catch (error) {
      console.error('Message loading exception:', error);
      note('Could not load messages: ' + error.message);

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

    if (!db || !user || !chat) {
      note('Select a group before sending a message.');
      return;
    }

    const input = $('message');
    const content = input?.value.trim();

    if (!content) return;

    const sendButton = $('sendform')?.querySelector(
      'button[type="submit"], button:not([type])'
    );

    if (sendButton) sendButton.disabled = true;

    try {
      const expiryValue = $('expiry')?.value;
      let expiresAt = null;

      // Expiry is measured in hours.
      if (expiryValue && expiryValue !== 'never') {
        const hours = Number(expiryValue);

        if (Number.isFinite(hours) && hours > 0) {
          expiresAt = new Date(
            Date.now() + hours * 60 * 60 * 1000
          ).toISOString();
        }
      }

      const { error } = await db
        .from('messages')
        .insert({
          chat_id: chat.id,
          sender_id: user.id,
          content,
          message_type: 'text',
          expires_at: expiresAt
        });

      if (error) {
        console.error('Message sending error:', error);
        note('Could not send message: ' + error.message);
        return;
      }

      if (input) input.value = '';

      await loadMessages();

    } catch (error) {
      console.error('Message sending exception:', error);
      note('Could not send message: ' + error.message);

    } finally {
      if (sendButton) sendButton.disabled = false;
    }
  }

  // ==========================================
  // LIVE MESSAGE UPDATES
  // ==========================================

  function stopMessageSubscription() {
    if (messageSubscription && db) {
      db.removeChannel(messageSubscription);
    }

    messageSubscription = null;
  }

  function startMessageSubscription() {
    if (!db || !chat) return;

    stopMessageSubscription();

    const currentChatId = chat.id;

    messageSubscription = db
      .channel('chat-messages-' + currentChatId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: 'chat_id=eq.' + currentChatId
        },
        () => {
          void loadMessages();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Live message subscription failed.');
        }
      });
  }

  // ==========================================
  // START CHATT
  // ==========================================

  void init();

})();
