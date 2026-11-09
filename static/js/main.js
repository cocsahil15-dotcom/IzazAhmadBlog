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

  /* ---- liquid-glass rim light follows the pointer ---- */
  let raf = 0;
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest && e.target.closest('.glass');
    if (!el) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  }, { passive: true });

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
    if (q) q.addEventListener('input', apply);
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
