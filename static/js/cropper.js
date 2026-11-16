/* Picture crop + zoom for the admin Profile page (profile picture and cover banner).
   Pick a photo, drag to move, slide/scroll/pinch to zoom, then "Use photo".
   The cropped image replaces the file in the form. No libraries. */
(() => {
  'use strict';
  const MODES = {
    avatar: { title: 'Adjust profile picture', w: 280, h: 280, outW: 800,  outH: 800,  round: true,  name: 'avatar.jpg' },
    cover:  { title: 'Adjust cover picture',   w: 320, h: 180, outW: 1600, outH: 900,  round: false, name: 'cover.jpg'  }
  };
  const inputs = Array.from(document.querySelectorAll('input[type=file][data-crop]'));
  if (!inputs.length) return;

  /* ---- build the dialog once ---- */
  const dlg = document.createElement('dialog');
  dlg.className = 'crop-dlg glass';
  dlg.innerHTML = `
    <form method="dialog" class="crop-form">
      <h2 id="cropTitle">Adjust picture</h2>
      <p class="muted">Drag to move. Use the slider or scroll to zoom.</p>
      <div class="crop-stage" id="cropStage">
        <img id="cropImg" alt="" draggable="false">
        <div class="crop-ring" id="cropRing"></div>
      </div>
      <input id="cropZoom" class="crop-zoom" type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom">
      <div class="form-actions">
        <button type="button" class="btn btn-glass" id="cropCancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="cropOk">Use photo</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const stage = dlg.querySelector('#cropStage');
  const ring = dlg.querySelector('#cropRing');
  const img = dlg.querySelector('#cropImg');
  const zoom = dlg.querySelector('#cropZoom');
  const title = dlg.querySelector('#cropTitle');

  let cur = null, mode = MODES.avatar;
  let BW = 280, BH = 280;          // crop box size on screen
  let nw = 0, nh = 0;              // natural image size
  let base = 1;                    // scale that just covers the box
  let z = 1, x = 0, y = 0;         // zoom, offset of image centre from box centre (screen px)

  const clamp = () => {
    const w = nw * base * z, h = nh * base * z;
    const mx = Math.max(0, (w - BW) / 2), my = Math.max(0, (h - BH) / 2);
    x = Math.min(mx, Math.max(-mx, x));
    y = Math.min(my, Math.max(-my, y));
  };
  const paint = () => {
    clamp();
    const w = nw * base * z, h = nh * base * z;
    img.style.width = w + 'px';
    img.style.height = h + 'px';
    img.style.transform = `translate(${(BW - w) / 2 + x}px, ${(BH - h) / 2 + y}px)`;
  };
  const setZoom = (nz) => {
    const k = nz / z;
    x *= k; y *= k;                // keep the centre point steady while zooming
    z = nz; zoom.value = String(nz); paint();
  };

  const open = (src, input, revoke) => {
    cur = input;
    mode = MODES[input.dataset.crop] || MODES.avatar;
    BW = mode.w; BH = mode.h;
    stage.style.width = BW + 'px'; stage.style.height = BH + 'px';
    stage.style.borderRadius = mode.round ? '22px' : '16px';
    ring.className = 'crop-ring' + (mode.round ? '' : ' rect');
    title.textContent = mode.title;
    img.onload = () => {
      nw = img.naturalWidth; nh = img.naturalHeight;
      base = Math.max(BW / nw, BH / nh);
      z = 1; x = y = 0; zoom.value = '1'; paint();
      if (!dlg.open) dlg.showModal();
      if (revoke) URL.revokeObjectURL(src);
    };
    img.onerror = () => { if (revoke) URL.revokeObjectURL(src); cur = null; };
    img.src = src;
  };

  /* ---- drag (mouse / touch / pen) + pinch ---- */
  const pts = new Map();
  let startDist = 0, startZ = 1;
  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      startDist = Math.hypot(a.x - b.x, a.y - b.y); startZ = z;
    }
  });
  stage.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 2) {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (startDist) setZoom(Math.min(4, Math.max(1, startZ * d / startDist)));
      return;
    }
    x += e.clientX - p.x; y += e.clientY - p.y;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    paint();
  });
  const up = e => { pts.delete(e.pointerId); };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    setZoom(Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))));
  }, { passive: false });
  zoom.addEventListener('input', () => setZoom(parseFloat(zoom.value)));

  /* arrow keys nudge, +/- zoom (keyboard access) */
  stage.tabIndex = 0;
  stage.addEventListener('keydown', e => {
    const s = 10;
    if (e.key === 'ArrowLeft') x += s; else if (e.key === 'ArrowRight') x -= s;
    else if (e.key === 'ArrowUp') y += s; else if (e.key === 'ArrowDown') y -= s;
    else if (e.key === '+' || e.key === '=') return setZoom(Math.min(4, z + 0.1));
    else if (e.key === '-') return setZoom(Math.max(1, z - 0.1));
    else return;
    e.preventDefault(); paint();
  });

  /* ---- finish ---- */
  const close = () => { if (dlg.open) dlg.close(); cur = null; };
  dlg.querySelector('#cropCancel').addEventListener('click', () => {
    if (cur && cur.dataset.fromPick) cur.value = '';   // discard a freshly picked file
    close();
  });
  dlg.addEventListener('cancel', () => { if (cur && cur.dataset.fromPick) cur.value = ''; cur = null; });

  dlg.querySelector('#cropOk').addEventListener('click', () => {
    if (!cur) return;
    const scale = base * z;                       // screen px per source px
    const sw = BW / scale, sh = BH / scale;       // source rectangle
    const sx = nw / 2 - (x / scale) - sw / 2;
    const sy = nh / 2 - (y / scale) - sh / 2;
    const c = document.createElement('canvas');
    c.width = mode.outW; c.height = mode.outH;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const input = cur, m = mode;
    c.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], m.name, { type: 'image/jpeg' });
      const dt = new DataTransfer(); dt.items.add(file);
      input.files = dt.files;
      const prev = document.getElementById(input.dataset.preview);
      if (prev) { prev.src = URL.createObjectURL(blob); prev.hidden = false; }
      const rm = input.form && input.form.querySelector(`input[name=remove_${input.name}]`);
      if (rm) rm.checked = false;
      delete input.dataset.fromPick;
      close();
    }, 'image/jpeg', 0.92);
  });

  /* ---- hook up inputs ---- */
  inputs.forEach(inp => {
    inp.addEventListener('change', e => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      e.stopImmediatePropagation();               // skip the plain preview handler in main.js
      inp.dataset.fromPick = '1';
      open(URL.createObjectURL(f), inp, true);
    }, true);
  });

  /* "Adjust current picture" buttons re-open the saved image for re-cropping */
  document.querySelectorAll('[data-crop-existing]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.cropExisting);
      const src = btn.dataset.src;
      if (inp && src) { delete inp.dataset.fromPick; open(src, inp, false); }
    });
  });
})();
