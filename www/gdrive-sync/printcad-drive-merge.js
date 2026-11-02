/* PrintCaddy Drive de-duplication + merge engine (no DOM; unit-tested with a mocked Drive).
 * Every design has a stable designId (the app's project id) and a lastModified time (ms, updated on every edit).
 * Drive design files carry both in appProperties: { kind:'design'|'thumb', designId, lastModified, createdAt, name }.
 * Legacy files have no appProperties: their id comes from the "<name>__<id>.lyl" file name, or, failing that, the name.
 * Rules: one Drive file per design; the newest lastModified wins; older copies are MOVED into the appData folder
 * "old-duplicates" (never deleted); a restore reuses the design's id, so it never makes a second local copy. */
(function (root) {
  'use strict';
  var BACKUP = 'old-duplicates';
  function safe(n) { return String(n || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80).trim() || 'Untitled'; }
  function fileName(id, name) { return safe(name) + '__' + id + '.lyl'; }
  function parseName(f) { var m = /^(.*)__([^_].*)\.(lyl|png)$/.exec(f); return m ? { name: m[1], id: m[2] } : { name: String(f).replace(/\.(lyl|png)$/, ''), id: null }; }
  function props(f) { return f.appProperties || {}; }
  function isLyl(f) { return /\.lyl$/.test(f.name) || props(f).kind === 'design'; }
  function isPng(f) { return /\.png$/.test(f.name) || props(f).kind === 'thumb'; }
  function designId(f) { return props(f).designId || parseName(f.name).id || null; }
  function baseName(f) { return props(f).name ? safe(props(f).name) : parseName(f.name).name; }
  function lastMod(f) { var p = Number(props(f).lastModified); return p > 0 ? p : (Date.parse(f.modifiedTime) || 0); }
  function createdAt(f) { var c = Number(props(f).createdAt); return c > 0 ? c : null; }
  function newer(a, b) { return lastMod(a) - lastMod(b) || (Date.parse(a.modifiedTime) || 0) - (Date.parse(b.modifiedTime) || 0) || (a.id < b.id ? 1 : -1); }
  function newestFirst(list) { return list.slice().sort(function (a, b) { return newer(b, a); }); }

  /* Group live design files into "same design" sets: same designId; or no id and same name;
   * or same name + same createdAt (one design that got a second id on another device). Union-find. */
  function groupDuplicates(files) {
    var parent = {}, by = {};
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function join(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
    files.forEach(function (f) {
      parent[f.id] = f.id;
      var id = designId(f), keys = [id ? 'id:' + id : 'name:' + baseName(f)];
      if (createdAt(f)) keys.push('lin:' + baseName(f) + '|' + createdAt(f));
      keys.forEach(function (k) { if (by[k]) join(f.id, by[k]); else by[k] = f.id; });
    });
    var groups = {};
    files.forEach(function (f) { var r = find(f.id); (groups[r] = groups[r] || []).push(f); });
    return Object.keys(groups).map(function (k) { return newestFirst(groups[k]); });
  }
  /* Local designs: same id can't happen; same name + same createdAt = a copy made by an older restore. */
  function groupLocal(designs) {
    var g = {};
    designs.forEach(function (d) { var k = safe(d.name) + '|' + (d.createdAt || 'x:' + d.id); (g[k] = g[k] || []).push(d); });
    return Object.keys(g).map(function (k) { return g[k].slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }); });
  }

  function createEngine(drive, app, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    var locks = {}, all = Promise.resolve();
    /* Saves of one design run one at a time; a cleanup/sync runs alone. */
    function withLock(key, fn) {
      var prev = Promise.all([locks[key] || Promise.resolve(), all]).catch(function () {});
      var p = prev.then(fn); locks[key] = p.catch(function () {}); return p;
    }
    function exclusive(fn) {
      var pend = Object.keys(locks).map(function (k) { return locks[k]; });
      var p = Promise.all(pend.concat([all])).catch(function () {}).then(fn); all = p.catch(function () {}); return p;
    }
    var folderP = null;
    function backupFolder() { return folderP || (folderP = drive.ensureFolder(BACKUP).catch(function (e) { folderP = null; throw e; })); }
    function live(files, folder) {
      return files.filter(function (f) { return f.mimeType !== 'application/vnd.google-apps.folder' && props(f).kind !== 'old-duplicate' && (f.parents || []).indexOf(folder) < 0 && f.name !== BACKUP; });
    }
    function listLive() { return backupFolder().then(function (folder) { return drive.listMeta().then(function (fs) { return { folder: folder, files: live(fs, folder) }; }); }); }
    function thumbsOf(file, files) {
      var id = designId(file), png = file.name.replace(/\.lyl$/, '.png');
      return files.filter(function (f) { return isPng(f) && (f.name === png || (id && props(f).designId === id)); });
    }
    /* Keep the data: move into old-duplicates and tag it. Nothing is ever deleted from Drive here. */
    function retire(f, folder) {
      var p = Object.assign({}, props(f), { kind: 'old-duplicate', retiredAt: String(Date.now()) });
      return drive.updateMeta(f.id, { appProperties: p }, folder, (f.parents || []).filter(function (x) { return x !== folder; }));
    }
    function retireGroup(group, files, folder) {
      var keep = group[0], moved = [];
      return group.slice(1).reduce(function (p, f) {
        return p.then(function () { return retire(f, folder); }).then(function () { moved.push(f);
          return Promise.all(thumbsOf(f, files).filter(function (t) { return thumbsOf(keep, files).indexOf(t) < 0; }).map(function (t) { return retire(t, folder); })); });
      }, Promise.resolve()).then(function () { return { keep: keep, moved: moved }; });
    }

    /* Upload one local design: overwrite its one Drive file only if the local copy is newer. */
    function saveDesign(d) { return withLock(d.id, function () { return saveDesignInner(d); }); }
    function saveDesignInner(d) {
      {
        return listLive().then(function (L) {
          var mine = L.files.filter(function (f) { return isLyl(f) && (designId(f) === d.id || (!designId(f) && baseName(f) === safe(d.name))); });
          var g = newestFirst(mine), target = g[0] || null;
          var chain = g.length > 1 ? retireGroup(g, L.files, L.folder) : Promise.resolve();
          return chain.then(function () {
            if (target && lastMod(target) >= d.lastModified) { log('skip ' + d.id + ': Drive copy is as new or newer'); return { status: 'remote-newer', file: target }; }
            var p = { kind: 'design', designId: d.id, lastModified: String(d.lastModified), name: String(d.name || '').slice(0, 90) };
            if (d.createdAt) p.createdAt = String(d.createdAt);
            return drive.putFile(target ? target.id : null, fileName(d.id, d.name), d.bytes, p).then(function (f) {
              var thumbs = target ? thumbsOf(target, L.files) : [];
              var t = d.thumb ? drive.putFile(thumbs[0] ? thumbs[0].id : null, fileName(d.id, d.name).replace(/\.lyl$/, '.png'), d.thumb,
                { kind: 'thumb', designId: d.id, lastModified: String(d.lastModified) }) : Promise.resolve();
              return t.then(function () { return afterWrite(d.id, f); }).then(function () { return { status: target ? 'updated' : 'created', file: f }; });
            });
          });
        });
      }
    }
    /* Another device may have created the same design at the same moment: keep the newest, move the rest. */
    function afterWrite(id, f) {
      return listLive().then(function (L) {
        var same = newestFirst(L.files.filter(function (x) { return isLyl(x) && designId(x) === id; }));
        if (same.length > 1) return retireGroup(same, L.files, L.folder);
      });
    }

    /* Bring Drive designs into this device. Never makes a second local copy: the design's id is reused and a local
     * copy (same id, or same name with no id / same name+created) is overwritten only when Drive's is newer. */
    function restoreFiles(files, allFiles, ro) {
      var locals = app.listDesigns(), res = { added: 0, updated: 0, skipped: 0, uploaded: 0 };
      return files.reduce(function (p, f) {
        return p.then(function () {
          var id = designId(f), cr = createdAt(f);
          var local = (id && locals.filter(function (d) { return d.id === id; })[0]) ||
            locals.filter(function (d) { return safe(d.name) === baseName(f) && (!id || (cr && d.createdAt === cr)); })[0] || null;
          if (!local && ro && ro.onlyExisting) { res.skipped++; return; }
          if (local && (local.updatedAt || 0) >= lastMod(f)) {
            if ((local.updatedAt || 0) === lastMod(f)) { res.skipped++; return; }
            return app.designBytes(local.id).then(function (b) { if (!b) return;
              res.uploaded++; return saveDesignInner({ id: local.id, name: local.name, createdAt: local.createdAt, lastModified: local.updatedAt, bytes: b }); });
          }
          return drive.load(f.id, 'arraybuffer').then(function (buf) {
            var thumb = thumbsOf(f, allFiles || files)[0];
            return (thumb ? drive.load(thumb.id, 'arraybuffer').catch(function () { return null; }) : Promise.resolve(null)).then(function (tb) {
              var useId = id || (local && local.id) || null;
              return app.upsertDesign({ id: useId, bytes: new Uint8Array(buf), updatedAt: lastMod(f), thumbnail: tb ? new Uint8Array(tb) : null,
                replaceIds: local && local.id !== useId ? [local.id] : [] });
            }).then(function (r) {
              if (!r || r.status === 'skipped') { res.skipped++; return; }
              if (local) res.updated++; else res.added++;
              if (!id || props(f).designId !== r.id) { // backfill the id on a legacy Drive file
                var p = Object.assign({}, props(f), { kind: 'design', designId: r.id, lastModified: String(lastMod(f)), name: baseName(f) });
                return drive.updateMeta(f.id, { name: fileName(r.id, baseName(f)), appProperties: p });
              }
            });
          });
        });
      }, Promise.resolve()).then(function () { return res; });
    }
    function sync(ro) {
      return exclusive(function () { return cleanupDrive(); }).then(function (c) {
        return exclusive(function () { return listLive().then(function (L) { return restoreFiles(L.files.filter(isLyl), L.files, ro); }); })
          .then(function (r) { r.cleanup = c; return r; });
      });
    }

    /* One-time cleanup. Backfills ids/created times on legacy Drive files, then keeps the newest of each set. */
    function cleanupDrive() {
      return listLive().then(function (L) {
        var need = L.files.filter(function (f) { return isLyl(f) && (!props(f).designId || !createdAt(f)); });
        return need.reduce(function (p, f) {
          return p.then(function () {
            return drive.load(f.id, 'arraybuffer').then(function (b) { return app.inspectDesign ? app.inspectDesign(new Uint8Array(b)) : null; }).then(function (info) {
              var id = designId(f) || (info && info.id) || (opts.newId ? opts.newId() : 'project-' + Math.random().toString(36).slice(2));
              var p2 = Object.assign({}, props(f), { kind: 'design', designId: id, lastModified: String(lastMod(f)), name: (info && info.name) || baseName(f) });
              if (info && info.createdAt) p2.createdAt = String(info.createdAt);
              f.appProperties = p2;
              return drive.updateMeta(f.id, { appProperties: p2 });
            }).catch(function (e) { log('backfill failed ' + f.name + ': ' + e); });
          });
        }, Promise.resolve()).then(function () {
          var groups = groupDuplicates(L.files.filter(isLyl)).filter(function (g) { return g.length > 1; }), moved = 0;
          return groups.reduce(function (p, g) { return p.then(function () { return retireGroup(g, L.files, L.folder).then(function (r) { moved += r.moved.length; }); }); }, Promise.resolve())
            .then(function () { return { groups: groups.length, moved: moved }; });
        });
      });
    }
    /* Local copies of one design (same name + same created time): keep the newest edited; the older ones are first
     * copied into Drive's old-duplicates folder, and are only removed here once that copy is safely up. */
    function cleanupLocal() {
      return exclusive(function () {
        var groups = groupLocal(app.listDesigns()).filter(function (g) { return g.length > 1; }), removed = [];
        return backupFolder().then(function (folder) {
          return groups.reduce(function (p, g) {
            return p.then(function () {
              return g.slice(1).reduce(function (q, d) {
                return q.then(function () { return app.designBytes(d.id); }).then(function (b) {
                  if (!b) return;
                  return drive.putFile(null, fileName(d.id, d.name), b, { kind: 'old-duplicate', designId: d.id, lastModified: String(d.updatedAt || 0), keptAs: g[0].id }, folder)
                    .then(function () { removed.push(d.id); });
                });
              }, Promise.resolve());
            });
          }, Promise.resolve()).then(function () { return removed.length ? app.deleteDesigns(removed) : null; })
            .then(function () { return { groups: groups.length, removed: removed }; });
        });
      });
    }
    function cleanupAll() { return exclusive(cleanupDrive).then(function (d) { return cleanupLocal().then(function (l) { return { drive: d, local: l }; }); }); }

    return { saveDesign: saveDesign, restoreFiles: function (f, a, ro) { return exclusive(function () { return restoreFiles(f, a, ro); }); }, sync: sync,
      cleanupDrive: function () { return exclusive(cleanupDrive); }, cleanupLocal: cleanupLocal, cleanupAll: cleanupAll, listLive: listLive };
  }
  var M = { createEngine: createEngine, groupDuplicates: groupDuplicates, groupLocal: groupLocal, fileName: fileName, parseName: parseName, safe: safe, designId: designId, lastMod: lastMod, BACKUP: BACKUP };
  root.PrintCADDriveMerge = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
