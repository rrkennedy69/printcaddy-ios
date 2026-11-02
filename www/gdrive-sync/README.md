# PrintCAD Google Drive sync

Dependency-free browser module: Google sign-in (Google Identity Services token flow) + backup to the hidden Drive **appDataFolder** (scope `https://www.googleapis.com/auth/drive.appdata`; the app only sees its own files).

Files: `gdrive-sync.js` (core, global `PrintCADSync`), `gdrive-sync-ui.js` + `gdrive-sync-ui.css` (optional floating widget with Restore dialog), `demo.html`, `test/gdrive-sync.test.js`.

## API
| Call | Notes |
|---|---|
| `init({clientId, appName:'PrintCAD', debounceMs?})` → Promise<bool> | Silent reconnect (`prompt:''`) if the user signed in before. |
| `signIn()` / `signOut()` / `isSignedIn()` | signIn must run from a click. signOut revokes the token. |
| `save(name, data)` | Debounced ~2s. data: string, JSON object, Blob, ArrayBuffer. Multipart upload; PATCHes the existing file of that name instead of duplicating. Queued while offline/signed-out, flushed on `online` / sign-in. |
| `saveNow()` → Promise | Flush immediately. |
| `list()` → `[{id,name,modifiedTime,size}]` | Newest first. |
| `load(id, as?)` | Default: parsed JSON or text; `as`='text'\|'blob'\|'arraybuffer'. |
| `remove(id)` | Deletes the file. |
| `onStatus(cb)` → unsubscribe | States: `signed-out, connecting, signed-in, pending, saving, saved, error, offline`. |

Expired tokens are refreshed silently and any 401 is retried once with a new token.

## Integrate into the CAD app
```html
<link rel="stylesheet" href="gdrive-sync/gdrive-sync-ui.css">
<script src="gdrive-sync/gdrive-sync.js"></script>
<script src="gdrive-sync/gdrive-sync-ui.js"></script>
<script>
PrintCADSync.init({ clientId: 'XXXX.apps.googleusercontent.com', appName: 'PrintCAD' }).then(async ok => {
  if (ok) { const f = (await PrintCADSync.list()).find(x => x.name === 'current.pcad');
            if (f) app.loadDesign(await PrintCADSync.load(f.id)); }
});
app.on('change', () => PrintCADSync.save('current.pcad', app.serialize()));   // hook the change event
PrintCADSyncUI.mount({ onRestore: (file, data) => app.loadDesign(data) });
</script>
```

## Google Cloud setup (OAuth Web client)
1. console.cloud.google.com → create/select project → **APIs & Services → Library** → enable **Google Drive API**.
2. **OAuth consent screen**: External, add scope `.../auth/drive.appdata`, add test users (or publish).
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Under **Authorized JavaScript origins** add each hosting origin exactly (scheme+host+port, no path), e.g. `https://yourname.github.io`, `http://localhost:8080`. No redirect URIs needed for the token flow.
5. Copy the **Client ID** into `init()`. The client ID is public; **never** put the client secret in browser code (it is not used).

## Test
`node test/gdrive-sync.test.js`
