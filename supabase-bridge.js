/* LedgerPro Supabase bridge.
 * Include this file before the application's inline script in index.html.
 * Run supabase/schema.sql in the Supabase SQL Editor first.
 */
(() => {
  'use strict';

  const APP_KEY = 'ledgerpro_v1';
  const PROJECT_URL = 'https://kwcfxgwgjafhkqxoesub.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_8e-apGVQRAJjkBeFVUJItg_MkW5V5y7';
  const TABLE = 'ledgerpro_state';
  const originalSetItem = Storage.prototype.setItem;
  let client;
  let activeUser = null;
  let syncing = false;
  let syncTimer;
  let pendingWrite = Promise.resolve();
  let gate;
  let statusNode;

  function setStatus(message, isError = false) {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.style.color = isError ? '#b42318' : '#516273';
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #ledgerpro-cloud-gate { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(18,38,58,.92); font:14px system-ui,sans-serif; }
      #ledgerpro-cloud-card { width:min(440px,100%); background:#fff; color:#17212b; border-radius:14px; padding:24px; box-shadow:0 16px 50px #0004; }
      #ledgerpro-cloud-card h2 { margin:0 0 8px; font:600 24px Georgia,serif; }
      #ledgerpro-cloud-card p { color:#667585; line-height:1.5; }
      #ledgerpro-cloud-card input { display:block; width:100%; margin:10px 0; padding:11px; border:1px solid #dde4e0; border-radius:8px; font:inherit; }
      #ledgerpro-cloud-card button { margin:6px 6px 0 0; padding:10px 13px; border:1px solid #ccd5d1; border-radius:8px; background:#fff; color:#17212b; cursor:pointer; font:inherit; }
      #ledgerpro-cloud-card button.primary { color:#fff; background:#0e7c66; border-color:#0e7c66; }
      #ledgerpro-cloud-card button:disabled { opacity:.55; cursor:wait; }
      #ledgerpro-cloud-status { min-height:22px; margin-top:12px; }
      #ledgerpro-cloud-account { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    `;
    document.head.appendChild(style);
  }

  function createGate() {
    addStyles();
    gate = document.createElement('section');
    gate.id = 'ledgerpro-cloud-gate';
    gate.innerHTML = `
      <div id="ledgerpro-cloud-card" role="dialog" aria-modal="true" aria-labelledby="ledgerpro-cloud-title">
        <h2 id="ledgerpro-cloud-title">LedgerPro secure sign-in</h2>
        <p>Sign in to sync this company's accounting data to its private Supabase account. Each account is isolated by row-level security.</p>
        <div id="ledgerpro-cloud-account" hidden><span id="ledgerpro-cloud-email"></span><button id="ledgerpro-cloud-signout">Sign out</button></div>
        <div id="ledgerpro-cloud-auth">
          <label for="ledgerpro-cloud-email-input">Email</label>
          <input id="ledgerpro-cloud-email-input" type="email" autocomplete="username" required>
          <label for="ledgerpro-cloud-password">Password</label>
          <input id="ledgerpro-cloud-password" type="password" autocomplete="current-password" minlength="6" required>
          <button class="primary" id="ledgerpro-cloud-login">Sign in</button>
          <button id="ledgerpro-cloud-signup">Create account</button>
        </div>
        <div id="ledgerpro-cloud-choice" hidden>
          <p>No cloud data exists for this account. Choose whether to upload the data currently stored in this browser or start with an empty company. Only choose upload if this browser's data belongs to this account.</p>
          <button class="primary" id="ledgerpro-cloud-upload">Upload this browser's data</button>
          <button id="ledgerpro-cloud-empty">Start with empty data</button>
        </div>
        <p id="ledgerpro-cloud-status" role="status" aria-live="polite">Connecting securely…</p>
      </div>`;
    document.body.appendChild(gate);
    statusNode = gate.querySelector('#ledgerpro-cloud-status');
    gate.querySelector('#ledgerpro-cloud-login').addEventListener('click', signIn);
    gate.querySelector('#ledgerpro-cloud-signup').addEventListener('click', signUp);
    gate.querySelector('#ledgerpro-cloud-signout').addEventListener('click', signOut);
    gate.querySelector('#ledgerpro-cloud-upload').addEventListener('click', () => initializeAccount(true));
    gate.querySelector('#ledgerpro-cloud-empty').addEventListener('click', () => initializeAccount(false));
    gate.querySelectorAll('input').forEach((input) => input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') signIn();
    }));
  }

  function setBusy(busy) {
    gate.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
  }

  function showAuth() {
    gate.querySelector('#ledgerpro-cloud-auth').hidden = false;
    gate.querySelector('#ledgerpro-cloud-account').hidden = true;
    gate.querySelector('#ledgerpro-cloud-choice').hidden = true;
    setStatus('Sign in or create an account to continue.');
  }

  function showSignedIn(user) {
    gate.querySelector('#ledgerpro-cloud-auth').hidden = true;
    gate.querySelector('#ledgerpro-cloud-account').hidden = false;
    gate.querySelector('#ledgerpro-cloud-email').textContent = user.email || 'Signed in';
  }

  async function signIn() {
    const email = gate.querySelector('#ledgerpro-cloud-email-input').value.trim();
    const password = gate.querySelector('#ledgerpro-cloud-password').value;
    if (!email || !password) return setStatus('Enter your email and password.', true);
    setBusy(true);
    const { error } = await client.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setStatus(error.message, true);
  }

  async function signUp() {
    const email = gate.querySelector('#ledgerpro-cloud-email-input').value.trim();
    const password = gate.querySelector('#ledgerpro-cloud-password').value;
    if (!email || password.length < 6) return setStatus('Enter a valid email and a password of at least 6 characters.', true);
    setBusy(true);
    const { data, error } = await client.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setStatus(error.message, true);
    if (!data.session) setStatus('Check your email to confirm the account, then sign in.');
    else setStatus('Account created. Checking for existing cloud data…');
  }

  async function signOut() {
    setBusy(true);
    const { error } = await client.auth.signOut();
    setBusy(false);
    if (error) setStatus(error.message, true);
  }

  function readLocalState() {
    try {
      const raw = localStorage.getItem(APP_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  async function saveCloudState(payload) {
    if (!activeUser || syncing) return;
    const { error } = await client.from(TABLE).upsert({
      user_id: activeUser.id,
      payload,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) throw error;
  }

  async function initializeAccount(uploadLocal) {
    setBusy(true);
    setStatus('Setting up your private company data…');
    try {
      if (uploadLocal) {
        const localState = readLocalState();
        if (localState) await saveCloudState(localState);
      } else {
        localStorage.removeItem(APP_KEY);
        // Force a fresh default app state on reload; it will be synced on the first change.
      }
      syncing = true;
      gate.remove();
      location.reload();
    } catch (error) {
      setStatus(`Could not initialize cloud data: ${error.message}`, true);
      setBusy(false);
    }
  }

  async function loadUserState(user) {
    activeUser = user;
    showSignedIn(user);
    setStatus('Loading your private cloud data…');
    const { data, error } = await client.from(TABLE).select('payload').eq('user_id', user.id).maybeSingle();
    if (error) {
      setStatus(`Cloud load failed: ${error.message}. Check that supabase/schema.sql has been run.`, true);
      return;
    }
    if (data && data.payload) {
      syncing = true;
      originalSetItem.call(localStorage, APP_KEY, JSON.stringify(data.payload));
      gate.remove();
      location.reload();
      return;
    }
    gate.querySelector('#ledgerpro-cloud-choice').hidden = false;
    setStatus('Choose how to initialize this Supabase account.');
  }

  function scheduleCloudSave() {
    if (!activeUser || syncing) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      const state = readLocalState();
      if (!state) return;
      pendingWrite = pendingWrite.then(() => saveCloudState(state)).then(() => {
        setStatus('All changes saved to Supabase.');
      }).catch((error) => {
        setStatus(`Cloud save failed: ${error.message}`, true);
        console.error('LedgerPro Supabase save failed:', error);
      });
    }, 500);
  }

  // The existing app writes its complete state to this localStorage key. Mirror those
  // writes to the authenticated user's single RLS-protected cloud row.
  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (key === APP_KEY) scheduleCloudSave();
  };

  async function loadSupabaseLibrary() {
    if (window.supabase?.createClient) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Supabase client library did not load. Check network access.'));
      document.head.appendChild(script);
    });
  }

  async function start() {
    createGate();
    try {
      await loadSupabaseLibrary();
      client = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data: { session }, error } = await client.auth.getSession();
      if (error) throw error;
      if (session?.user) await loadUserState(session.user);
      else showAuth();
      client.auth.onAuthStateChange((event, sessionState) => {
        if (event === 'SIGNED_IN' && sessionState?.user) {
          // Avoid doing Supabase queries inside the auth callback's lock; defer to a task.
          setTimeout(() => loadUserState(sessionState.user), 0);
        } else if (event === 'SIGNED_OUT') {
          activeUser = null;
          if (!gate.isConnected) document.body.appendChild(gate);
          showAuth();
        }
      });
    } catch (error) {
      setStatus(`Supabase connection error: ${error.message}`, true);
      console.error('LedgerPro Supabase initialization failed:', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
