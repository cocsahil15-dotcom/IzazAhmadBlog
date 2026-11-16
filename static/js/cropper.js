/* Profile picture crop + zoom. Pick a photo, drag to move, slide/scroll/pinch to zoom,
   then "Use photo". The cropped square replaces the file in the form. No libraries. */
(() => {
  'use strict';
  const OUT = 800;            // exported size in px
  const BOX = 280;            // on-screen crop circle size
  const inputs = Array.from(document.querySelectorAll('input[type=file][data-crop]'));
  if (!inputs.length) return;

  /* ---- build the dialog once ---- */
  const dlg = document.createElement('dialog');
  dlg.className = 'crop-dlg glass';
  dlg.innerHTML = `
    <form method="dialog" class="crop-form">
      <h2>Adjust profile picture</h2>
      <p class="muted">Drag to move. Use the slider or scroll to zoom.</p>
      <div class="crop-stage" id="cropStage" style="width:${BOX}px;height:${BOX}px">
        <img id="cropImg" alt="" draggable="false">
        <div class="crop-ring"></div>
      </div>
      <input id="cropZoom" class="crop-zoom" type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom">
      <div class="form-actions">
        <button type="button" class="btn btn-glass" id="cropCancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="cropOk">Use photo</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const stage = dlg.querySelector('#cropStage');
  const img = dlg.querySelector('#cropImg');
  const zoom = dlg.querySelector('#cropZoom');

  let cur = null;                 // the file input being edited
  let nw = 0, nh = 0;             // natural image size
  let base = 1;                   // scale that just covers the box
  let z = 1, x = 0, y = 0;        // zoom, offset of image centre from box centre (screen px)

  const clamp = () => {
    const w = nw * base * z, h = nh * base * z;
    const mx = Math.max(0, (w - BOX) / 2), my = Math.max(0, (h - BOX) / 2);
    x = Math.min(mx, Math.max(-mx, x));
    y = Math.min(my, Math.max(-my, y));
  };
  const paint = () => {
    clamp();
    const w = nw * base * z, h = nh * base * z;
    img.style.width = w + 'px';
    img.style.height = h + 'px';
    img.style.transform = `translate(${(BOX - w) / 2 + x}px, ${(BOX - h) / 2 + y}px)`;
  };
  const setZoom = (nz) => {
    const k = nz / z;
    x *= k; y *= k;             // keep the centre point steady while zooming
    z = nz; zoom.value = String(nz); paint();
  };

  const open = (src, input, revoke) => {
    cur = input;
    img.onload = () => {
      nw = img.naturalWidth; nh = img.naturalHeight;
      base = BOX / Math.min(nw, nh);
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
    const sw = BOX / scale;                       // source square size
    const sx = nw / 2 - (x / scale) - sw / 2;
    const sy = nh / 2 - (y / scale) - sw / 2;
    const c = document.createElement('canvas');
    c.width = c.height = OUT;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#fff'; g.fillRect(0, 0, OUT, OUT);
    g.drawImage(img, sx, sy, sw, sw, 0, 0, OUT, OUT);
    const input = cur;
    c.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer(); dt.items.add(file);
      input.files = dt.files;
      const prev = document.getElementById(input.dataset.preview);
      if (prev) { prev.src = URL.createObjectURL(blob); prev.hidden = false; }
      const rm = input.form && input.form.querySelector('input[name=remove_avatar]');
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

  /* "Adjust current picture" button re-opens the saved image for re-cropping */
  document.querySelectorAll('[data-crop-existing]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.cropExisting);
      const src = btn.dataset.src;
      if (inp && src) { delete inp.dataset.fromPick; open(src, inp, false); }
    });
  });
})();
