import React from 'react';
import InstallPrompt from './components/InstallPrompt';
import { putTrack, getAllTracks, putBlob, getBlob, getAllCategories, putCategory, deleteCategory, deleteTracks } from './lib/db';
import { hasFS, pickFiles, pickFolder } from './lib/fs';
import type { Track, Category } from './lib/types';
import { fmtMs } from './lib/fmt';

export default function App() {
  const [tracks, setTracks] = React.useState<Track[]>([]);
  const [cats, setCats] = React.useState<Category[]>([]);
  const [activeCat, setActiveCat] = React.useState<string>('all');
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState('');
  const [online, setOnline] = React.useState<boolean>(navigator.onLine);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [view, setView] = React.useState<'grid' | 'list'>('grid');

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const dirInputRef = React.useRef<HTMLInputElement | null>(null);

  // Player
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  React.useEffect(() => {
    (async () => {
      const [t, c] = await Promise.all([getAllTracks(), getAllCategories()]);
      setTracks(t);
      if (c.length === 0) {
        const base: Category = { id: 'favorites', name: 'Favorites', createdAt: Date.now() };
        await putCategory(base);
        setCats([base]);
      } else {
        setCats(c);
      }
      if (navigator.storage?.persist) {
        try { await navigator.storage.persist(); } catch { }
      }
    })();
  }, []);

  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Media Session API
  React.useEffect(() => {
    const ms = (navigator as any).mediaSession;
    if (!ms || !audioRef.current) return;
    try {
      ms.setActionHandler('play', () => resume());
      ms.setActionHandler('pause', () => pause());
      ms.setActionHandler('previoustrack', () => prev());
      ms.setActionHandler('nexttrack', () => next());
      ms.setActionHandler('seekto', (e: any) => {
        if (audioRef.current && typeof e.seekTime === 'number') {
          audioRef.current.currentTime = e.seekTime;
        }
      });
    } catch { }
  }, [currentId]);

  function toggleSelect(id: string) {
    setSelection(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function clearSelection() { setSelection(new Set()); }

  const filtered = tracks.filter(t => {
    const inCat = activeCat === 'all' ? true : (t.categoryIds?.includes(activeCat));
    const inQuery = !query ? true : (t.name?.toLowerCase().includes(query.toLowerCase()));
    return inCat && inQuery;
  });

  // === Select All (hasil filter) ===
  const selectedInFiltered = React.useMemo(
    () => filtered.filter(t => selection.has(t.id)).length,
    [filtered, selection]
  );

  const isAllSelected = filtered.length > 0 && selectedInFiltered === filtered.length;

  function toggleSelectAllFiltered() {
    setSelection(prev => {
      if (filtered.length === 0) return prev;
      const n = new Set(prev);
      const ids = filtered.map(t => t.id);
      const allSelected = ids.every(id => n.has(id));
      if (allSelected) {
        ids.forEach(id => n.delete(id));
      } else {
        ids.forEach(id => n.add(id));
      }
      return n;
    });
  }

  async function addToCategory(catId: string) {
    const ids = Array.from(selection);
    if (ids.length === 0) return;
    const updated = tracks.map(t => ids.includes(t.id)
      ? { ...t, categoryIds: Array.from(new Set([...(t.categoryIds || []), catId])) }
      : t);
    setTracks(updated);
    await Promise.all(updated.filter(t => ids.includes(t.id)).map(putTrack));
    clearSelection();
  }

  async function removeFromCategory(catId: string) {
    const ids = Array.from(selection);
    const updated = tracks.map(t => ids.includes(t.id)
      ? { ...t, categoryIds: (t.categoryIds || []).filter(id => id !== catId) }
      : t);
    setTracks(updated);
    await Promise.all(updated.filter(t => ids.includes(t.id)).map(putTrack));
    clearSelection();
  }

  async function createCategory() {
    const name = prompt('Nama folder/kategori?');
    if (!name) return;
    const cat: Category = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    await putCategory(cat);
    setCats(prev => [...prev, cat]);
  }

  async function removeCategory(catId: string) {
    if (!confirm('Hapus folder/kategori ini? (Track tetap ada, hanya dilepas dari kategori)')) return;
    await deleteCategory(catId);
    const updated = tracks.map(t => ({ ...t, categoryIds: (t.categoryIds || []).filter(id => id !== catId) }));
    await Promise.all(updated.map(putTrack));
    setTracks(updated);
    setCats(prev => prev.filter(c => c.id !== catId));
    setActiveCat('all');
  }

  async function handlePickFiles() {
    const result = await pickFiles();
    if (result) {
      await importFiles(result);
      return;
    }
    fileInputRef.current?.click();
  }

  async function handlePickFolder() {
    const result = await pickFolder();
    if (result) {
      await importFiles(result);
      return;
    }
    dirInputRef.current?.click();
  }

  async function importFiles(items: Array<{ file: File; handle?: any }>) {
    const newOnes: Track[] = [];
    for (const it of items) {
      const file = it.file;
      const id = crypto.randomUUID();
      const base: Track = {
        id,
        name: file.name,
        size: file.size,
        type: file.type || 'audio/*',
        createdAt: Date.now(),
        // ⬇️ BARIS BARU: auto masuk ke folder aktif kalau bukan "Semua"
        categoryIds: activeCat !== 'all' ? [activeCat] : [],
        storage: hasFS() && it.handle ? 'handle' : 'blob',
        handle: hasFS() && it.handle ? it.handle : undefined,
      };
      if (base.storage === 'blob') {
        await putBlob(id, file);
      }
      await putTrack(base);
      newOnes.push(base);
    }

    // ⬇️ GANTI: dari append lokal → baca ulang dari DB supaya langsung segar
    const fresh = await getAllTracks();
    setTracks(fresh);

    alert(`Import selesai: ${newOnes.length} file`);
  }


  async function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    await importFiles(files.map(f => ({ file: f })));
    e.target.value = '';
  }
  async function onDirInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const grouped = new Map<string, File[]>();
    for (const f of files) {
      const rel = (f as any).webkitRelativePath || '';
      const segs = rel.split('/');
      const folder = segs.length > 1 ? segs[segs.length - 2] : 'Imported';
      if (!grouped.has(folder)) grouped.set(folder, []);
      grouped.get(folder)!.push(f);
    }
    for (const [folder, fs] of grouped) {
      let cat = cats.find(c => c.name === folder);
      if (!cat) {
        cat = { id: crypto.randomUUID(), name: folder, createdAt: Date.now() };
        await putCategory(cat);
        setCats(prev => [...prev, cat!]);
      }
      const items = fs.map(f => ({ file: f }));
      await importFiles(items);
      const last = await getAllTracks();
      const names = new Set(fs.map(f => f.name));
      const newly = last.filter(t => names.has(t.name));
      for (const t of newly) {
        const updated: Track = { ...t, categoryIds: Array.from(new Set([...(t.categoryIds || []), cat!.id])) };
        await putTrack(updated);
      }
      setTracks(await getAllTracks());
    }
    e.target.value = '';
  }

  async function play(id: string) {
    setCurrentId(id);
    const t = tracks.find(x => x.id === id);
    if (!t) return;
    let blob: Blob | null = null;
    if (t.storage === 'handle' && (t as any).handle?.getFile) {
      try { blob = await (t as any).handle.getFile(); } catch (e) { console.warn('File handle no access', e); }
    }
    if (!blob) blob = await getBlob(t.id);
    if (!blob) { alert('File tidak ditemukan di storage. Impor ulang.'); return; }

    const url = URL.createObjectURL(blob);
    const audio = audioRef.current!;
    audio.src = url;

    const ms = (navigator as any).mediaSession;
    if (ms && (window as any).MediaMetadata) {
      try {
        ms.metadata = new (window as any).MediaMetadata({
          title: t.name,
          artist: '',
          album: 'Musekita',
          artwork: []
        });
      } catch { }
    }

    await audio.play();
    setPlaying(true);
  }

  function pause() { if (audioRef.current) { audioRef.current.pause(); setPlaying(false); } }
  function resume() { if (audioRef.current) { audioRef.current.play(); setPlaying(true); } }
  function next() {
    const list = filtered;
    if (!currentId || list.length === 0) return;
    const idx = list.findIndex(t => t.id === currentId);
    const nxt = list[(idx + 1) % list.length];
    void play(nxt.id);
  }
  function prev() {
    const list = filtered;
    if (!currentId || list.length === 0) return;
    const idx = list.findIndex(t => t.id === currentId);
    const prv = list[(idx - 1 + list.length) % list.length];
    void play(prv.id);
  }
  function onTime() {
    if (!audioRef.current) return;
    setProgress(audioRef.current.currentTime * 1000);
    setDuration((audioRef.current.duration || 0) * 1000);
  }

  async function removeSelected() {
    const ids = Array.from(selection);
    if (ids.length === 0) return;
    if (!confirm(`Hapus ${ids.length} track dari library? (file asli di HP tidak dihapus)`)) return;
    await deleteTracks(ids);
    setTracks(prev => prev.filter(t => !ids.includes(t.id)));
    clearSelection();
  }

  const current = tracks.find(x => x.id === currentId);

  // helper
  const catCount = (id: string) => tracks.filter(t => (t.categoryIds || []).includes(id)).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 selection:bg-brand/30">
      {/* Top banner */}
      <div className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-black/35 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
            >
              ☰
            </button>
            <div className="h-9 w-9 rounded-xl bg-brand/90 text-slate-900 grid place-items-center shadow">🎵</div>
            <div>
              <div className="font-bold leading-4">Musekita</div>
              <div className={`text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${online ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20' : 'bg-rose-500/10 text-rose-300 border-rose-400/20'
                }`}>{online ? 'Online' : 'Offline'}</div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60">🔎</span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Cari judul lagu…"
                className="pl-9 pr-3 py-2 rounded-xl bg-white/5 outline-none border border-white/10 focus:border-white/20 min-w-[20rem]"
                aria-label="Cari judul"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setView('grid')}
                className={`px-3 py-2 rounded-lg border ${view === 'grid' ? 'bg-white/15 border-white/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                title="Grid">▦</button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-2 rounded-lg border ${view === 'list' ? 'bg-white/15 border-white/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                title="List">≣</button>
            </div>
            <InstallPrompt />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handlePickFiles} className="px-3 py-2 rounded-xl bg-brand text-slate-900 font-semibold shadow-sm hover:opacity-95 transition">
              Import File
            </button>
            <button onClick={handlePickFolder} className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 transition">
              Import Folder
            </button>

            <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={onFileInput} />
            <input
              ref={dirInputRef}
              type="file"
              accept="directory"
              multiple
              className="hidden"
              onChange={onDirInput}
              {...(window as any).webkit ? { webkitdirectory: "" } : {}}
            />
          </div>
        </div>

        {/* Mobile search + quick controls */}
        <div className="md:hidden max-w-6xl mx-auto px-4 pb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60">🔎</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cari judul lagu…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 outline-none border border-white/10 focus:border-white/20"
              aria-label="Cari judul"
            />
          </div>
          <button
            onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15"
            title="Toggle tampilan"
          >
            {view === 'grid' ? '≣' : '▦'}
          </button>
          <InstallPrompt />
        </div>

        {/* Kategori untuk mobile (pills) */}
        <div className="md:hidden px-4 pb-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveCat('all')}
              className={`px-3 py-1.5 rounded-full border text-sm whitespace-nowrap ${activeCat === 'all' ? 'bg-white/15 border-white/25' : 'bg-white/5 border-white/10'
                }`}>Semua</button>
            {cats.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`px-3 py-1.5 rounded-full border text-sm whitespace-nowrap ${activeCat === c.id ? 'bg-white/15 border-white/25' : 'bg-white/5 border-white/10'
                  }`}
                title={c.name}
              >
                {c.name} <span className="opacity-60">({catCount(c.id)})</span>
              </button>
            ))}
            <button onClick={createCategory} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm whitespace-nowrap">+ Folder</button>
          </div>
        </div>
      </div>

      <div className="flex max-w-6xl mx-auto">
        {/* Sidebar (desktop) */}
        <aside className="w-72 shrink-0 border-r border-white/10 p-4 hidden md:flex md:flex-col md:gap-3 backdrop-blur supports-[backdrop-filter]:bg-white/5">
          <div className="text-xs uppercase tracking-wider text-white/50 mb-1.5">Folder</div>
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveCat('all')}
              className={`w-full text-left px-3 py-2 rounded-xl transition border hover:border-white/10 hover:bg-white/5 ${activeCat === 'all' ? 'bg-white/10 border-white/10' : 'border-transparent'
                }`}
            >
              Semua
            </button>
            {cats.map(cat => (
              <div key={cat.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => setActiveCat(cat.id)}
                  className={`flex-1 text-left px-3 py-2 rounded-xl transition border hover:border-white/10 hover:bg-white/5 ${activeCat === cat.id ? 'bg-white/10 border-white/10' : 'border-transparent'
                    }`}
                  title={cat.name}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{cat.name}</span>
                    <span className="text-[11px] opacity-60 tabular-nums">{catCount(cat.id)}</span>
                  </div>
                </button>
                <button
                  className="text-xs opacity-60 hover:opacity-100 px-1.5 py-1 rounded hover:bg-rose-500/10"
                  onClick={() => removeCategory(cat.id)}
                  aria-label={`Hapus folder ${cat.name}`}
                  title="Hapus folder"
                >
                  ✕
                </button>
              </div>
            ))}
          </nav>
          <div className="mt-auto space-y-2">
            <button onClick={createCategory} className="w-full bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 rounded-xl transition">
              + Folder/Kategori
            </button>
            <InstallPrompt />
          </div>
        </aside>

        {/* Mobile Drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-[80%] max-w-xs p-4 border-r border-white/10 bg-slate-950/90 backdrop-blur">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-brand/80 text-slate-900 grid place-items-center">🎵</div>
                  <h2 className="font-semibold">Musekita</h2>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="px-2 py-1 rounded-lg bg-white/10 border border-white/10">✕</button>
              </div>
              <div className="text-xs uppercase tracking-wider text-white/50 mb-1.5">Folder</div>
              <nav className="space-y-1.5">
                <button
                  onClick={() => { setActiveCat('all'); setSidebarOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-xl transition border hover:border-white/10 hover:bg-white/5 ${activeCat === 'all' ? 'bg-white/10 border-white/10' : 'border-transparent'
                    }`}
                >
                  Semua
                </button>
                {cats.map(cat => (
                  <div key={cat.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() => { setActiveCat(cat.id); setSidebarOpen(false); }}
                      className={`flex-1 text-left px-3 py-2 rounded-xl transition border hover:border-white/10 hover:bg-white/5 ${activeCat === cat.id ? 'bg-white/10 border-white/10' : 'border-transparent'
                        }`}
                      title={cat.name}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{cat.name}</span>
                        <span className="text-[11px] opacity-60 tabular-nums">{catCount(cat.id)}</span>
                      </div>
                    </button>
                    <button
                      className="text-xs opacity-60 hover:opacity-100 px-1.5 py-1 rounded hover:bg-rose-500/10"
                      onClick={() => removeCategory(cat.id)}
                      aria-label={`Hapus folder ${cat.name}`}
                      title="Hapus folder"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </nav>
              <div className="mt-4">
                <button onClick={createCategory} className="w-full bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 rounded-xl transition">
                  + Folder/Kategori
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main */}
        <main className="flex-1 min-h-[calc(100vh-140px)]">
          {/* Selection toolbar */}
          {selection.size > 0 && (
            <div className="md:sticky md:top-[64px] fixed inset-x-0 bottom-[76px] z-40
                  bg-black/60 backdrop-blur md:border-b border-t border-white/10 md:bottom-auto">
              {/* 2 kolom: kiri scrollable, kanan tombol hapus fix */}
              <div className="max-w-6xl mx-auto px-4 py-2 grid grid-cols-[1fr_auto] items-center gap-2">
                {/* Kiri: strip aksi, bisa di-scroll horizontal */}
                <div className="min-w-0 flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar">
                  <span className="text-sm opacity-80 shrink-0">Terpilih: <b>{selection.size}</b></span>
                  <button
                    onClick={toggleSelectAllFiltered}
                    className="px-2.5 py-1.5 rounded-full bg-white/10 border border-white/10 text-sm shrink-0"
                  >
                    {isAllSelected ? `Batal pilih (${selectedInFiltered})` : `Pilih semua (${filtered.length})`}
                  </button>
                  <div className="h-4 w-px bg-white/15 mx-1" />
                  <span className="text-sm opacity-80 shrink-0">Tambah ke folder:</span>
                  <div className="flex items-center gap-2">
                    {cats.map(c => (
                      <button
                        key={c.id}
                        onClick={() => addToCategory(c.id)}
                        className="px-2.5 py-1.5 rounded-full bg-white/7 border border-white/10 hover:bg-white/12 text-sm shrink-0"
                      >
                        {c.name}
                      </button>
                    ))}
                    {activeCat !== 'all' && (
                      <button
                        onClick={() => removeFromCategory(activeCat)}
                        className="px-2.5 py-1.5 rounded-full bg-white/7 border border-white/10 hover:bg-white/12 text-sm shrink-0"
                      >
                        Lepas dari folder aktif
                      </button>
                    )}
                    <button onClick={createCategory} className="px-2.5 py-1.5 rounded-full bg-white/7 border border-white/10 hover:bg-white/12 text-sm shrink-0">
                      + Folder baru
                    </button>
                  </div>
                  <div className="justify-self-end shrink-0">
                    <button
                      onClick={removeSelected}
                      className="px-3 py-2 rounded-full border transition whitespace-nowrap bg-rose-500/10 border-rose-400/20 hover:bg-rose-500/15"
                      title="Hapus track terpilih"
                    >
                      Hapus ({selection.size})
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="max-w-6xl mx-auto px-4 py-6">
            {/* Header row (stats & view toggle for desktop already above) */}
            <div className="mb-3 text-sm opacity-70">
              {filtered.length} track {activeCat !== 'all' && <>• Folder <span className="opacity-90">{cats.find(c => c.id === activeCat)?.name}</span></>}
              {query && <> • Pencarian: “{query}”</>}
            </div>

            {filtered.length === 0 ? (
              <div className="border border-dashed border-white/10 rounded-2xl p-10 text-center bg-white/5">
                <div className="text-3xl mb-2">🗂️</div>
                <p className="text-sm opacity-80">Belum ada track untuk filter/kata kunci ini.</p>
                <p className="text-sm opacity-60">Coba hapus pencarian, pilih folder lain, atau import file/folder.</p>
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map(t => {
                  const isActive = currentId === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`p-3 rounded-2xl border bg-white/5 hover:bg-white/7 transition group relative
                        ${isActive ? 'border-brand/50 ring-2 ring-brand/60' : 'border-white/10'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`h-12 w-12 rounded-xl grid place-items-center text-xl 
                            ${isActive ? 'bg-brand/20 text-brand-foreground' : 'bg-gradient-to-br from-white/10 to-white/5'}`}>
                            🎧
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{t.name}</div>
                            <div className="text-xs opacity-70">{(t.size / 1024 / 1024).toFixed(2)} MB</div>
                          </div>
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm md:text-xs opacity-80 hover:opacity-100 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selection.has(t.id)}
                            onChange={() => toggleSelect(t.id)}
                            className="accent-brand"
                            aria-label={`Pilih ${t.name}`}
                          />
                          Pilih
                        </label>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => void play(t.id)}
                          className={`px-3 py-1.5 rounded-lg border transition ${isActive ? 'bg-brand text-slate-900 border-transparent' : 'bg-white/10 border-white/10 hover:bg-white/15'
                            }`}
                        >
                          {isActive ? (playing ? 'Mainkan ulang' : 'Lanjutkan') : 'Play'}
                        </button>
                        {isActive && playing && (
                          <button onClick={pause} className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition">
                            Pause
                          </button>
                        )}
                        {isActive && !playing && (
                          <button onClick={resume} className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition">
                            Resume
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 overflow-hidden">
                {filtered.map(t => {
                  const isActive = currentId === t.id;
                  return (
                    <li key={t.id} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] ${isActive ? 'ring-1 ring-brand/60' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selection.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="accent-brand h-5 w-5 md:h-4 md:w-4"
                        aria-label={`Pilih ${t.name}`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-grid h-7 w-7 place-items-center rounded-md ${isActive ? 'bg-brand/30' : 'bg-white/10'}`}>🎧</span>
                          <span className="truncate">{t.name}</span>
                        </div>
                        <div className="text-[11px] opacity-60 pl-9">{(t.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <>
                            {playing ? (
                              <button onClick={pause} className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15">Pause</button>
                            ) : (
                              <button onClick={resume} className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15">Resume</button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => void play(t.id)}
                          className={`px-2.5 py-1.5 rounded-lg border ${isActive ? 'bg-brand text-slate-900 border-transparent' : 'bg-white/10 border-white/10 hover:bg-white/15'}`}
                        >
                          {isActive ? 'Mainkan' : 'Play'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {selection.size > 0 && <div className="h-[84px] md:hidden" />}
          {/* Player bar */}
          <audio ref={audioRef} onTimeUpdate={onTime} onEnded={next} onLoadedMetadata={onTime} className="hidden" />
          <div className="sticky bottom-0 border-t border-white/10 bg-black/60 backdrop-blur px-4 py-3">
            <div className="max-w-6xl mx-auto flex items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-lg bg-white/10 grid place-items-center">🎵</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate opacity-90">{current?.name || 'Tidak ada lagu yang diputar'}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] opacity-60 w-12 tabular-nums">{fmtMs(progress)}</span>
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      value={progress}
                      onChange={e => {
                        const v = Number(e.target.value);
                        if (audioRef.current) { audioRef.current.currentTime = v / 1000; }
                        setProgress(v);
                      }}
                      className="w-full accent-brand"
                      aria-label="Seek"
                    />
                    <span className="text-[11px] opacity-60 w-12 text-right tabular-nums">{fmtMs(duration)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button onClick={prev} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition" aria-label="Sebelumnya">⏮</button>
                {playing ? (
                  <button onClick={pause} className="px-3 py-2 rounded-lg bg-brand text-slate-900 font-semibold shadow-sm" aria-label="Pause">⏸</button>
                ) : (
                  <button onClick={resume} className="px-3 py-2 rounded-lg bg-brand text-slate-900 font-semibold shadow-sm" aria-label="Play">▶️</button>
                )}
                <button onClick={next} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition" aria-label="Berikutnya">⏭</button>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
