/* PrintCADSync: Google sign-in + Drive appDataFolder backup. No dependencies. */
(function (root) {
  'use strict';
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var API = 'https://www.googleapis.com/drive/v3/files';
  var UP = 'https://www.googleapis.com/upload/drive/v3/files';
  var GIS = 'https://accounts.google.com/gsi/client';
  var S = { clientId: '', appName: 'PrintCAD', debounce: 2000, token: null, exp: 0, tc: null, gisP: null,
    pend: null, queue: {}, timer: null, listeners: [], status: 'signed-out', ids: {}, hint: '' };
  var LS = 'printcad.gsync';
  function ls(k, v) { try { var o = JSON.parse(root.localStorage.getItem(LS) || '{}'); if (v === undefined) return o[k]; o[k] = v; root.localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  function emit(st, detail) { S.status = st; S.listeners.slice().forEach(function (cb) { try { cb(st, detail); } catch (e) {} }); }
  var DESK = !!(root.navigator && /Electron/i.test(root.navigator.userAgent || ''));
  var IOS = !!(root.navigator && (/iP(hone|ad|od)/.test(root.navigator.userAgent || '') || (root.navigator.platform === 'MacIntel' && root.navigator.maxTouchPoints > 1)));
  function saveTok() { ls('tok', S.token ? { t: S.token, e: S.exp } : null); }
  function loadTok() { var o = ls('tok'); if (o && o.t && o.e > Date.now() + 30000) { S.token = o.t; S.exp = o.e; return true; } return false; }
  function fresh() { return !!S.token && Date.now() < S.exp; }
  function schedule() { // proactive refresh while open: desktop can refresh silently; web needs a user gesture
    clearTimeout(S.rt); if (!S.token) return;
    var ms = Math.max(5000, S.exp - Date.now() - 5 * 60000);
    S.rt = setTimeout(function () {
      if (DESK) getToken(false).then(function () { emit('signed-in'); }, function () {});
      else if (!fresh()) emit('signed-out', { reconnect: true });
    }, Math.min(ms, 2147483000)); if (S.rt && S.rt.unref) S.rt.unref();
  }
  function fetchHint() {
    if (S.hint) return;
    root.fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: 'Bearer ' + S.token } })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { var m = j && j.user && j.user.emailAddress; if (m) { S.hint = m; ls('hint', m); } }).catch(function () {});
  }
  function online() { return !root.navigator || root.navigator.onLine !== false; }

  function loadGIS() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    if (S.gisP) return S.gisP;
    S.gisP = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = GIS; s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { S.gisP = null; no(new Error('Could not load Google sign-in')); };
      document.head.appendChild(s);
    });
    return S.gisP;
  }
  function tokenClient() {
    if (S.tc) return S.tc;
    S.tc = root.google.accounts.oauth2.initTokenClient({ client_id: S.clientId, scope: SCOPE, callback: function (r) {
      var p = S.pend; S.pend = null; if (!p) return;
      if (r && r.access_token) { S.token = r.access_token; S.exp = Date.now() + ((r.expires_in || 3600) - 60) * 1000; saveTok(); schedule(); try { fetchHint(); } catch (e) {} p.ok(r.access_token); }
      else p.no(new Error((r && r.error) || 'Sign-in failed'));
    }, error_callback: function (e) { var p = S.pend; S.pend = null; if (p) p.no(new Error((e && e.type) || 'Sign-in cancelled')); } });
    return S.tc;
  }
  function getToken(interactive) {
    if (!S.clientId) return Promise.reject(new Error('PrintCADSync.init({clientId}) not called'));
    return loadGIS().then(function () {
      return new Promise(function (ok, no) {
        var tc = tokenClient(); if (S.pend) S.pend.no(new Error('superseded'));
        S.pend = { ok: ok, no: no };
        var cfg = { prompt: interactive ? 'consent' : '' }; if (S.hint) cfg.login_hint = S.hint;
        if (interactive && ls('on')) cfg.prompt = '';
        tc.requestAccessToken(cfg);
      });
    });
  }
  function gfetch(url, opt, retried) {
    opt = opt || {};
    var tk = fresh() ? Promise.resolve(S.token) : (DESK || userGesture() ? getToken(false) : Promise.reject(needReconnect()));
    return tk.then(function (t) {
      var h = Object.assign({}, opt.headers || {}, { Authorization: 'Bearer ' + t });
      return root.fetch(url, Object.assign({}, opt, { headers: h }));
    }).then(function (r) {
      if (r.status === 401 && !retried) { S.token = null; S.exp = 0; saveTok(); return gfetch(url, opt, true); }
      if (!r.ok) { var e = new Error('Drive HTTP ' + r.status); e.status = r.status; throw e; }
      return r;
    });
  }
  function userGesture() { var u = root.navigator && root.navigator.userActivation; return !!(u && u.isActive); }
  function needReconnect() { var e = new Error('Drive needs reconnecting – tap Reconnect Drive'); e.reconnect = true; emit('signed-out', { reconnect: true }); return e; }
  function esc(n) { return String(n).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function findByName(name) {
    if (S.ids[name]) return Promise.resolve(S.ids[name]);
    return gfetch(API + '?spaces=appDataFolder&q=' + encodeURIComponent("name='" + esc(name) + "' and trashed=false") + '&fields=files(id,name)')
      .then(function (r) { return r.json(); }).then(function (j) { var f = j.files && j.files[0]; if (f) S.ids[name] = f.id; return f ? f.id : null; });
  }
  function toBody(data) {
    if (typeof Blob !== 'undefined' && data instanceof Blob) return { body: data, type: data.type || 'application/octet-stream' };
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return { body: data, type: 'application/octet-stream' };
    if (typeof data === 'string') return { body: data, type: 'text/plain' };
    return { body: JSON.stringify(data), type: 'application/json' };
  }
  function upload(name, data) {
    var b = toBody(data);
    return findByName(name).then(function (id) {
      var meta = id ? { name: name, mimeType: b.type } : { name: name, mimeType: b.type, parents: ['appDataFolder'], appProperties: { app: S.appName } };
      var bd = 'pcad' + Math.random().toString(36).slice(2);
      var body = new Blob(['--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + bd + '\r\nContent-Type: ' + b.type + '\r\n\r\n', b.body, '\r\n--' + bd + '--'], { type: 'multipart/related; boundary=' + bd });
      var url = id ? UP + '/' + encodeURIComponent(id) + '?uploadType=multipart&fields=id,name,modifiedTime,size' : UP + '?uploadType=multipart&fields=id,name,modifiedTime,size';
      return gfetch(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body: body });
    }).then(function (r) { return r.json(); }).then(function (f) { S.ids[name] = f.id; return f; });
  }
  function flush() {
    clearTimeout(S.timer); S.timer = null;
    var names = Object.keys(S.queue); if (!names.length) return Promise.resolve([]);
    if (!isSignedIn()) { emit('signed-out', { pending: names.length, reconnect: wantsDrive() }); return Promise.resolve([]); }
    if (!online()) { emit('offline', { pending: names.length }); return Promise.resolve([]); }
    var q = S.queue; S.queue = {}; emit('saving');
    return Promise.all(names.map(function (n) { return upload(n, q[n]); })).then(function (res) {
      ls('last', Date.now()); emit('saved', { files: res }); return res;
    }, function (e) {
      names.forEach(function (n) { if (!(n in S.queue)) S.queue[n] = q[n]; });
      emit(online() ? 'error' : 'offline', { error: e }); throw e;
    });
  }
  function isSignedIn() { return fresh(); }
  function wantsDrive() { return !!ls('on'); }

  var API_ = {
    init: function (o) {
      o = o || {}; S.clientId = o.clientId || ''; if (o.appName) S.appName = o.appName; if (o.debounceMs != null) S.debounce = o.debounceMs;
      S.hint = ls('hint') || '';
      if (root.addEventListener) root.addEventListener('online', function () { if (Object.keys(S.queue).length) flush().catch(function () {}); });
      if (ls('on') && S.clientId) {
        if (loadTok()) { schedule(); emit('signed-in'); loadGIS().catch(function () {}); return flush().then(function () { return true; }, function () { return true; }); }
        if (!DESK) { // web: GIS needs a popup, which iOS/most browsers block without a tap. Don't nag; offer Reconnect.
          loadGIS().catch(function () {});
          if (root.addEventListener && !IOS) { // desktop browsers: refresh silently on the first click/keypress
            var g = function () { root.removeEventListener('pointerdown', g, true); root.removeEventListener('keydown', g, true);
              if (!fresh()) API_.reconnect().catch(function () {}); };
            root.addEventListener('pointerdown', g, true); root.addEventListener('keydown', g, true);
          }
          emit('signed-out', { reconnect: true }); return Promise.resolve(false);
        }
        emit('connecting');
        return getToken(false).then(function () { emit('signed-in'); return flush(); }).then(function () { return true; }, function () { emit('signed-out', { reconnect: true }); return false; });
      }
      emit('signed-out'); return Promise.resolve(false);
    },
    reconnect: function () { // call from a tap: silent (prompt:'') re-grant using the remembered account
      emit('connecting');
      return getToken(false).then(function () { emit('signed-in'); return flush(); }).then(function () { return true; },
        function (e) { emit('signed-out', { reconnect: true, error: e }); throw e; });
    },
    wantsDrive: wantsDrive,
    signIn: function () {
      emit('connecting');
      return getToken(true).then(function () { ls('on', true); emit('signed-in'); return flush(); }).then(function () { return true; },
        function (e) { emit('error', { error: e }); throw e; });
    },
    signOut: function () {
      var t = S.token; S.token = null; S.exp = 0; S.ids = {}; ls('on', false); ls('tok', null); ls('hint', ''); S.hint = ''; clearTimeout(S.rt);
      try { if (t && root.google && root.google.accounts) root.google.accounts.oauth2.revoke(t, function () {}); } catch (e) {}
      emit('signed-out');
    },
    isSignedIn: isSignedIn,
    save: function (name, data) {
      S.queue[name] = data; clearTimeout(S.timer);
      S.timer = setTimeout(function () { flush().catch(function () {}); }, S.debounce);
      emit('pending');
    },
    saveNow: function () { return flush(); },
    list: function () {
      return gfetch(API + '?spaces=appDataFolder&q=' + encodeURIComponent('trashed=false') + '&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=100')
        .then(function (r) { return r.json(); }).then(function (j) {
          return (j.files || []).map(function (f) { S.ids[f.name] = S.ids[f.name] || f.id; return { id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: f.size != null ? Number(f.size) : 0 }; });
        });
    },
    load: function (id, as) {
      return gfetch(API + '/' + encodeURIComponent(id) + '?alt=media').then(function (r) {
        if (as === 'blob') return r.blob(); if (as === 'arraybuffer') return r.arrayBuffer();
        return r.text().then(function (t) { if (as === 'text') return t; try { return JSON.parse(t); } catch (e) { return t; } });
      });
    },
    remove: function (id) {
      return gfetch(API + '/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
        Object.keys(S.ids).forEach(function (n) { if (S.ids[n] === id) delete S.ids[n]; }); return true;
      });
    },
    /* Files with their appProperties and parents (all pages). q is an extra Drive query, ANDed with trashed=false. */
    listMeta: function (q) {
      var out = [];
      function page(tok) {
        var url = API + '?spaces=appDataFolder&q=' + encodeURIComponent('trashed=false' + (q ? ' and (' + q + ')' : '')) +
          '&fields=' + encodeURIComponent('nextPageToken,files(id,name,modifiedTime,size,appProperties,parents)') + '&pageSize=1000' + (tok ? '&pageToken=' + encodeURIComponent(tok) : '');
        return gfetch(url).then(function (r) { return r.json(); }).then(function (j) {
          (j.files || []).forEach(function (f) { out.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: f.size != null ? Number(f.size) : 0, appProperties: f.appProperties || {}, parents: f.parents || [] }); });
          return j.nextPageToken ? page(j.nextPageToken) : out;
        });
      }
      return page(null);
    },
    /* Create (id null) or overwrite file id with data + appProperties. parent: folder id for new files (default appDataFolder). */
    putFile: function (id, name, data, props, parent) {
      var b = toBody(data), meta = { name: name, mimeType: b.type, appProperties: props || {} };
      if (!id) meta.parents = [parent || 'appDataFolder'];
      var bd = 'pcad' + Math.random().toString(36).slice(2);
      var body = new Blob(['--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + bd + '\r\nContent-Type: ' + b.type + '\r\n\r\n', b.body, '\r\n--' + bd + '--'], { type: 'multipart/related; boundary=' + bd });
      var f = '&fields=' + encodeURIComponent('id,name,modifiedTime,size,appProperties,parents');
      return gfetch(id ? UP + '/' + encodeURIComponent(id) + '?uploadType=multipart' + f : UP + '?uploadType=multipart' + f,
        { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body: body }).then(function (r) { return r.json(); });
    },
    /* Metadata-only change: rename, appProperties, and/or move between folders (nothing is deleted). */
    updateMeta: function (id, meta, addParent, removeParents) {
      var qs = '?fields=' + encodeURIComponent('id,name,modifiedTime,appProperties,parents') + (addParent ? '&addParents=' + encodeURIComponent(addParent) : '') + (removeParents && removeParents.length ? '&removeParents=' + encodeURIComponent(removeParents.join(',')) : '');
      return gfetch(API + '/' + encodeURIComponent(id) + qs, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta || {}) }).then(function (r) { return r.json(); });
    },
    /* A folder inside appDataFolder, made once. */
    ensureFolder: function (name) {
      var key = 'folder:' + name; if (S.ids[key]) return Promise.resolve(S.ids[key]);
      return API_.listMeta("mimeType='application/vnd.google-apps.folder' and name='" + esc(name) + "'").then(function (fs) {
        if (fs.length) return (S.ids[key] = fs[0].id);
        return gfetch(API + '?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder', parents: ['appDataFolder'] }) })
          .then(function (r) { return r.json(); }).then(function (j) { return (S.ids[key] = j.id); });
      });
    },
    onStatus: function (cb) { S.listeners.push(cb); cb(S.status); return function () { S.listeners = S.listeners.filter(function (x) { return x !== cb; }); }; },
    status: function () { return S.status; },
    lastSaved: function () { return ls('last') || null; }
  };
  root.PrintCADSync = API_;
  if (typeof module !== 'undefined' && module.exports) module.exports = API_;
})(typeof window !== 'undefined' ? window : globalThis);
