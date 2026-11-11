(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const csrf = () => ($('meta[name="csrf-token"]') || {}).content || '';

  /* ---- toasts: fade out after a few seconds ---- */
  $$('.flash').forEach(el => {
    setTimeout(() => el.classList.add('out'), 5000);
    el.addEventListener('click', () => el.classList.add('out'));
  });

  /* ---- confirm dialogs on destructive forms ---- */
  document.addEventListener('submit', e => {
    const f = e.target.closest && e.target.closest('form[data-confirm]');
    if (f && !window.confirm(f.dataset.confirm)) e.preventDefault();
  });

  /* ---- auto-submit selects (admin filter) ---- */
  document.addEventListener('change', e => {
    if (e.target.matches('select[data-autosubmit]')) e.target.form.submit();
  });

  /* ---- image upload preview ---- */
  document.addEventListener('change', e => {
    const inp = e.target;
    if (!inp.matches || !inp.matches('input[type=file][data-preview]')) return;
    const img = document.getElementById(inp.dataset.preview);
    const file = inp.files && inp.files[0];
    if (img && file) { img.src = URL.createObjectURL(file); img.hidden = false; }
  });

  /* ---- search + filter on the home page ---- */
  const grid = $('#postGrid');
  if (grid) {
    const chips = $$('.chip[data-filter]');
    const q = $('#postSearch');
    const none = $('#noMatch');
    let kind = 'all';
    const apply = () => {
      const term = ((q && q.value) || '').trim().toLowerCase();
      let shown = 0;
      $$('.post-card', grid).forEach(c => {
        const ok = (kind === 'all' || c.dataset.kind === kind) && (!term || c.dataset.search.includes(term));
        c.hidden = !ok;
        if (ok) shown++;
      });
      if (none) none.hidden = shown !== 0;
    };
    chips.forEach(ch => ch.addEventListener('click', () => {
      kind = ch.dataset.filter;
      chips.forEach(c => c.classList.toggle('active', c === ch));
      apply();
    }));
    let st = 0;
    if (q) q.addEventListener('input', () => { clearTimeout(st); st = setTimeout(apply, 120); });
  }

  /* ---- mobile tab bar: highlight the section in view ---- */
  const tabs = $$('.tabbar a[data-tab]');
  if (tabs.length && 'IntersectionObserver' in window) {
    const set = id => tabs.forEach(t => t.setAttribute('aria-current', t.dataset.tab === id ? 'true' : 'false'));
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) set(en.target.id); });
    }, { rootMargin: '-40% 0px -50% 0px' });
    ['home', 'links', 'work', 'videos'].forEach(id => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---- tap a card -> bottom sheet with the written summary ---- */
  const sheet = $('#sheet');
  if (sheet) {
    const panel = $('#sheetPanel');
    const body = $('#sheetBody');
    const grab = $('#sheetGrab');
    let lastFocus = null;

    const show = () => {
      lastFocus = document.activeElement;
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lock');
      panel.focus({ preventScroll: true });
    };
    const hide = () => {
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lock');
      setTimeout(() => { if (!sheet.classList.contains('open')) body.innerHTML = ''; }, 350);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    };
    const close = () => {
      if (history.state && history.state.post) history.back(); else hide();
    };

    const openPost = async (url, push) => {
      body.innerHTML = '<div class="sheet-loading">Loading…</div>';
      body.scrollTop = 0;
      show();
      try {
        const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'partial=1', { headers: { 'X-Requested-With': 'fetch' } });
        if (!res.ok) throw new Error('bad status');
        body.innerHTML = await res.text();
        if (push) history.pushState({ post: url }, '', url);
      } catch (err) {
        window.location.href = url;   // fall back to the normal page
      }
    };

    document.addEventListener('click', e => {
      const card = e.target.closest('.post-card');
      if (card && !e.defaultPrevented && e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
        e.preventDefault();
        openPost(card.getAttribute('href'), true);
        return;
      }
      if (e.target.closest('[data-close]') && sheet.classList.contains('open')) close();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) close(); });
    window.addEventListener('popstate', e => {
      if (e.state && e.state.post) openPost(e.state.post, false);
      else if (sheet.classList.contains('open')) hide();
    });

    /* swipe the handle down to close */
    let sy = null;
    grab.addEventListener('touchstart', e => { sy = e.touches[0].clientY; panel.style.transition = 'none'; }, { passive: true });
    grab.addEventListener('touchmove', e => {
      if (sy === null) return;
      panel.style.transform = 'translateY(' + Math.max(0, e.touches[0].clientY - sy) + 'px)';
    }, { passive: true });
    grab.addEventListener('touchend', e => {
      if (sy === null) return;
      const dy = e.changedTouches[0].clientY - sy;
      sy = null; panel.style.transition = ''; panel.style.transform = '';
      if (dy > 90) close();
    });
  }


  /* ---- admin: easy video upload (drag & drop, auto cover, progress bar) ---- */
  const vf = $('#videoFile');
  if (vf) {
    const form = vf.closest('form');
    const drop = $('#videoDrop');
    const nameEl = $('#videoName');
    const msg = $('#formMsg');
    const thumbIn = $('input[name=thumb]', form);
    const thumbPrev = $('#thumbPrev');
    const maxMb = Number(form.dataset.maxMb) || 1024;
    const mb = n => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';
    const say = (t, cls) => { if (msg) { msg.className = 'form-msg ' + (cls || ''); msg.textContent = t; } };

    const grabFrame = file => new Promise(resolve => {
      const v = document.createElement('video');
      const url = URL.createObjectURL(file);
      const done = b => { URL.revokeObjectURL(url); resolve(b); };
      v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url;
      v.onerror = () => done(null);
      v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 4); };
      v.onseeked = () => {
        try {
          if (!v.videoWidth) return done(null);
          const c = document.createElement('canvas');
          c.width = Math.min(1280, v.videoWidth);
          c.height = Math.round(c.width * v.videoHeight / v.videoWidth);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(done, 'image/jpeg', .82);
        } catch (_) { done(null); }
      };
      setTimeout(() => done(null), 8000);
    });

    const picked = async () => {
      const file = vf.files && vf.files[0];
      if (!file) { nameEl.textContent = 'Tap to choose a video, or drop it here'; return; }
      if (file.size > maxMb * 1048576) {
        window.alert('This video is ' + mb(file.size) + '. The limit is ' + maxMb + ' MB.');
        vf.value = ''; picked(); return;
      }
      nameEl.textContent = file.name + ' · ' + mb(file.size);
      if (thumbIn && thumbPrev && thumbPrev.hidden && !(thumbIn.files && thumbIn.files.length)) {
        const blob = await grabFrame(file);
        if (blob && !(thumbIn.files && thumbIn.files.length)) {
          const dt = new DataTransfer();
          dt.items.add(new File([blob], 'cover.jpg', { type: 'image/jpeg' }));
          thumbIn.files = dt.files;
          thumbPrev.src = URL.createObjectURL(blob); thumbPrev.hidden = false;
        }
      }
    };
    vf.addEventListener('change', picked);
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files.length) { vf.files = e.dataTransfer.files; picked(); }
    });
    if (location.hash === '#video-upload') drop.scrollIntoView({ block: 'center' });

    form.addEventListener('submit', e => {
      if (!(vf.files && vf.files[0])) return;          // no video: normal save
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      const bar = $('#uploadProgress'); const fill = $('i', bar); const label = $('span', bar);
      const fail = t => { btn.disabled = false; bar.hidden = true; say(t, 'err'); };
      btn.disabled = true; bar.hidden = false; say('Please keep this page open until the upload finishes.');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', form.action || location.href);
      xhr.setRequestHeader('X-Requested-With', 'fetch');
      xhr.upload.onprogress = ev => {
        if (!ev.lengthComputable) return;
        const pct = Math.round(ev.loaded / ev.total * 100);
        fill.style.width = pct + '%';
        label.textContent = pct < 100 ? 'Uploading… ' + pct + '%' : 'Saving…';
      };
      xhr.onload = () => {
        let d = {}; try { d = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status < 400 && d.ok) { location.href = d.redirect || location.href; }
        else fail(d.error || 'The upload did not work (error ' + xhr.status + '). Please try again.');
      };
      xhr.onerror = () => fail('The connection was lost. Please check your internet and try again.');
      xhr.send(new FormData(form));
    });
  }

  /* ---- Shadhin, the welcome bot ---- */
  const bot = $('#shadhin');
  if (bot) {
    const panel = $('#shPanel'), fab = $('#shFab'), teaser = $('#shTeaser'), log = $('#shLog');
    const lines = $$('#shMsgs li').map(li => li.textContent.trim()).filter(Boolean);
    const store = { get: k => { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
                    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) {} } };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    let played = false, open = false;

    const bubble = (text, who) => {
      const d = document.createElement('div');
      d.className = 'sh-msg ' + who; d.textContent = text;
      log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
    };
    const play = async () => {
      if (played || !lines.length) return;
      played = true;
      for (const t of lines) {
        const dots = document.createElement('div');
        dots.className = 'sh-msg bot sh-typing'; dots.innerHTML = '<i></i><i></i><i></i>';
        log.appendChild(dots); log.scrollTop = log.scrollHeight;
        await wait(650 + Math.min(900, t.length * 12));
        dots.remove(); bubble(t, 'bot');
        await wait(250);
      }
    };
    const setOpen = v => {
      open = v;
      panel.classList.toggle('open', v);
      panel.setAttribute('aria-hidden', v ? 'false' : 'true');
      fab.setAttribute('aria-expanded', v ? 'true' : 'false');
      teaser.hidden = true; fab.classList.remove('wiggle');
      if (v) { store.set('shadhin-seen', '1'); play(); }
    };
    fab.addEventListener('click', () => setOpen(!open));
    teaser.addEventListener('click', () => setOpen(true));
    bot.addEventListener('click', e => { if (e.target.closest('[data-sh-close]')) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) setOpen(false); });

    $$('.sh-chip', bot).forEach(ch => ch.addEventListener('click', async e => {
      e.preventDefault();
      bubble(ch.textContent.trim(), 'me');
      await wait(350); bubble(ch.dataset.reply || 'Here you go 👇', 'bot');
      await wait(700); setOpen(false);
      const target = document.querySelector(ch.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    }));

    /* pop up with the greeting once per visit */
    if (lines.length && !store.get('shadhin-seen')) {
      setTimeout(() => {
        if (open) return;
        teaser.textContent = lines[0]; teaser.hidden = false; fab.classList.add('wiggle');
        setTimeout(() => { teaser.hidden = true; }, 10000);
      }, 1500);
    }
  }

  /* ---- inside a post (sheet or full page) ---- */
  document.addEventListener('click', async e => {
    /* play the video in place */
    const watch = e.target.closest('.js-watch');
    if (watch) {
      const media = watch.closest('.post-media');
      const src = media && media.dataset.embed;
      if (src) {
        const f = document.createElement('iframe');
        f.src = src; f.title = 'Video player'; f.loading = 'lazy'; f.referrerPolicy = 'strict-origin-when-cross-origin';
        f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.setAttribute('allowfullscreen', '');
        media.innerHTML = '';
        media.appendChild(f);
      }
      return;
    }

    /* share / copy link */
    const share = e.target.closest('.js-share');
    if (share) {
      const art = share.closest('.post');
      const url = new URL(art.dataset.url, location.origin).href;
      const title = art.dataset.title;
      if (navigator.share) { try { await navigator.share({ title, url }); } catch (_) {} return; }
      try {
        await navigator.clipboard.writeText(url);
        const old = share.innerHTML; share.textContent = 'Link copied ✓';
        setTimeout(() => { share.innerHTML = old; }, 1800);
      } catch (_) { window.prompt('Copy this link:', url); }
      return;
    }

    /* admin: delete a comment without leaving the page */
    const del = e.target.closest('.js-del-comment');
    if (del) {
      if (!window.confirm('Delete this comment?')) return;
      del.disabled = true;
      try {
        const res = await fetch(del.dataset.url, { method: 'POST', headers: { 'X-CSRF-Token': csrf(), 'X-Requested-With': 'fetch' } });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not delete');
        const li = del.closest('.comment');
        const art = del.closest('.post');
        li.style.transition = 'opacity .25s, transform .25s';
        li.style.opacity = '0'; li.style.transform = 'scale(.96)';
        setTimeout(() => {
          const list = li.parentElement;
          li.remove();
          if (art) {
            $$('[data-comment-count]', art).forEach(n => { n.textContent = data.count; });
            const empty = $('.empty-comments', art);
            if (empty) empty.hidden = data.count > 0;
          } else if (list && !list.children.length) {
            list.insertAdjacentHTML('afterend', '<p class="muted">No comments yet.</p>');
          }
        }, 250);
      } catch (err) {
        del.disabled = false;
        window.alert(err.message || 'Could not delete the comment.');
      }
    }
  });

  /* post a comment without reloading */
  document.addEventListener('submit', async e => {
    const form = e.target.closest && e.target.closest('.js-comment-form');
    if (!form) return;
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    const msg = $('.form-msg', form);
    const art = form.closest('.post');
    btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Posting…';
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'X-Requested-With': 'fetch' } });
      let data = {};
      try { data = await res.json(); } catch (_) {}
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not post your comment. Please try again.');
      if (data.html) {
        $('[data-comment-list]', art).insertAdjacentHTML('afterbegin', data.html);
        $$('[data-comment-count]', art).forEach(n => { n.textContent = data.count; });
        const empty = $('.empty-comments', art); if (empty) empty.hidden = true;
      }
      form.reset();
      msg.classList.add('ok'); msg.textContent = 'Posted ✓';
    } catch (err) {
      msg.classList.add('err'); msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
})();
