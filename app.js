
(() => {
  const $ = (id) => document.getElementById(id);

  let db = null;
  let user = null;
  let chat = null;
  let channel = null;

  const cfg = window.CIRCLE_CONFIG || {};

  function note(message) {
    const notice = $('notice');
    if (!notice) {
      alert(message);
      return;
    }

    notice.textContent = message;
    notice.classList.add('show');

    setTimeout(() => {
      notice.classList.remove('show');
    }, 4000);
  }

  function setVisible(id, visible) {
    const element = $(id);
    if (element) element.hidden = !visible;
  }

  async function loggedIn(nextUser) {
    user = nextUser || null;

    setVisible('auth', !user);
    setVisible('user', !!user);

    if ($('who')) {
      $('who').textContent = user?.email || '';
    }

    if (!user) {
      chat = null;

      if (channel && db) {
        await db.removeChannel(channel);
        channel = null;
      }

      if ($('messages')) $('messages').innerHTML = '';
      if ($('groups')) $('groups').innerHTML = '';

      if ($('title')) $('title').textContent = 'Your Chatt';
      setVisible('sendform', false);
      return;
    }

    await groups();
  }

  async function groups() {
    if (!user || !db) return;

    const { data, error } = await db
  .from('chats')
  .insert({
    name: name.trim().slice(0, 60),
    created_by: user.id
  })
  .select('id,name')
  .single();
      .select('chat_id,chats(id,name)')
      .eq('user_id', user.id);

    if (error) {
      note('Could not load groups: ' + error.message);
      return;
    }

    const container = $('groups');
    container.innerHTML = '';

    (data || []).forEach((row) => {
      if (!row.chats) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'alt';
      button.textContent = row.chats.name;
      button.onclick = () => selectChat(row.chats);

      container.appendChild(button);
    });

    if (!chat && data?.[0]?.chats) {
      await selectChat(data[0].chats);
    }
  }

  async function selectChat(selectedChat) {
    chat = selectedChat;

    $('title').textContent = selectedChat.name;
    setVisible('sendform', true);

    if (channel) {
      await db.removeChannel(channel);
      channel = null;
    }

    await loadMessages();

    channel = db
      .channel('chat-' + selectedChat.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: 'chat_id=eq.' + selectedChat.id
        },
        () => loadMessages()
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          note('Live updates failed. Try refreshing messages.');
        }
      });
  }

  async function loadMessages() {
    if (!chat || !user || !db) return;

    const { data, error } = await db
      .from('messages')
      .select('id,sender_id,content,created_at,expires_at')
      .eq('chat_id', chat.id)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      note('Could not load messages: ' + error.message);
      return;
    }

    const area = $('messages');
    area.innerHTML = '';

    (data || [])
      .filter((message) => {
        return (
          !message.expires_at ||
          new Date(message.expires_at) > new Date()
        );
      })
      .forEach((message) => {
        const article = document.createElement('article');
        article.className =
          'msg' + (message.sender_id === user.id ? ' mine' : '');

        const meta = document.createElement('div');
        meta.className = 'meta';

        meta.textContent =
          (message.sender_id === user.id
            ? 'You'
            : message.sender_id.slice(0, 8)) +
          ' · ' +
          new Date(message.created_at).toLocaleString();

        const body = document.createElement('div');
        body.className = 'body';
        body.textContent = message.content;

        article.append(meta, body);
        area.appendChild(article);
      });

    area.scrollTop = area.scrollHeight;
  }

  async function signInWithEmail() {
    if (!db) return note('Please wait for Chatt to load.');

    const email = $('email').value.trim();
    const password = $('password').value;

    if (!email || !password) {
      return note('Enter your email and password.');
    }

    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) note(error.message);
  }

  async function createAccount() {
    if (!db) return note('Please wait for Chatt to load.');

    const email = $('email').value.trim();
    const password = $('password').value;

    if (!email || !password) {
      return note('Enter your email and password.');
    }

    if (password.length < 6) {
      return note('Use a password with at least 6 characters.');
    }

    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          window.location.origin + window.location.pathname
      }
    });

    if (error) {
      note(error.message);
    } else if (data.session) {
      note('Account created successfully!');
    } else {
      note('Account created. Check your email if confirmation is enabled.');
    }
  }

  async function signInWithGoogle() {
    if (!db) return note('Please wait for Chatt to load.');

    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:
          window.location.origin + window.location.pathname
      }
    });

    if (error) note('Google sign-in failed: ' + error.message);
  }

  async function createGroup() {
    if (!user || !db) {
      return note('Sign in before creating a group.');
    }

    const name = prompt('Enter a group name', 'Chatt Group');

    if (!name || !name.trim()) return;

    const { data, error } = await db
      .from('chats')
      .insert({
        name: name.trim().slice(0, 60),
        created_by: user.id
      })
      .select('id,name')
      .single();

    if (error) {
      note('Could not create group: ' + error.message);
      return;
    }

    const { error: memberError } = await db.from('chat_members').insert({
      chat_id: data.id,
      user_id: user.id
    });

    if (memberError) {
      note('Could not add you to the group: ' + memberError.message);
      return;
    }

    chat = null;
    await groups();
    await selectChat(data);

    note('Group created.');
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (!user || !chat || !db) {
      return note('Sign in and select a group first.');
    }

    const text = $('message').value.trim();

    if (!text) return;

    const seconds = Number($('expiry').value);

    const expiresAt = seconds
      ? new Date(Date.now() + seconds * 1000).toISOString()
      : null;

    const { error } = await db.from('messages').insert({
      chat_id: chat.id,
      sender_id: user.id,
      content: text,
      message_type: 'text',
      expires_at: expiresAt
    });

    if (error) {
      note('Could not send message: ' + error.message);
    } else {
      $('message').value = '';
      await loadMessages();
    }
  }

  async function init() {
    if (
      !cfg.SUPABASE_URL ||
      !cfg.SUPABASE_PUBLISHABLE_KEY ||
      cfg.SUPABASE_URL.includes('PASTE_') ||
      cfg.SUPABASE_PUBLISHABLE_KEY.includes('PASTE_')
    ) {
      note('Add your Supabase URL and publishable key in config.js.');
      return;
    }

    if (!window.supabase) {
      note('Could not load Supabase. Refresh the page and try again.');
      return;
    }

    db = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_PUBLISHABLE_KEY
    );

    const { data, error } = await db.auth.getSession();

    if (error) {
      note(error.message);
      return;
    }

    await loggedIn(data.session?.user || null);

    db.auth.onAuthStateChange((_event, session) => {
      void loggedIn(session?.user || null);
    });
  }

  $('google').onclick = signInWithGoogle;
  $('signin').onclick = signInWithEmail;
  $('signup').onclick = createAccount;
  $('signout').onclick = async () => {
    const { error } = await db.auth.signOut();
    if (error) note(error.message);
  };
  $('create').onclick = createGroup;
  $('refresh').onclick = loadMessages;
  $('sendform').onsubmit = sendMessage;

  $('loginform').addEventListener('submit', (event) => {
    event.preventDefault();
    void signInWithEmail();
  });

  void init();
})();
