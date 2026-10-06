/*
 * Composition runtime.
 *
 * A composition calls `defineComposition({ duration, fps, build })`, where `build`
 * returns a GSAP timeline (or `{ timeline, onSeek }` when some state is derived
 * from tweened values after every seek). Everything that moves must live on that timeline,
 * so any point in time can be rendered deterministically via `composition.seek(t)`.
 *
 *   index.html            → live preview (scaled to the window, loops, scrubbable)
 *   index.html?t=12.5     → preview starting at 12.5 s
 *   index.html?render     → 1080×1920 without preview chrome (used by render.mjs)
 */
(function () {
  const params = new URLSearchParams(location.search);
  const RENDER = params.has('render');
  if (RENDER) document.documentElement.classList.add('render');

  function fontsReady() {
    const faces = [
      '400 40px "Inter Tight"', '500 40px "Inter Tight"', '600 40px "Inter Tight"', '700 40px "Inter Tight"', '800 40px "Inter Tight"',
      '400 40px "Instrument Serif"', 'italic 400 40px "Instrument Serif"',
    ];
    return Promise.all(faces.map((f) => document.fonts.load(f, 'AaÄäÖöÜü0123456789'))).then(() => document.fonts.ready);
  }

  function imagesReady() {
    return Promise.all([...document.images].map((img) => (img.complete ? img.decode().catch(() => {}) : img.decode().catch(() => {}))));
  }

  /** Fill every [data-text="key"] element with C[key] (keeps on-screen texts editable in one place). */
  window.applyTexts = function (C) {
    document.querySelectorAll('[data-text]').forEach((el) => {
      const v = C[el.dataset.text];
      if (v !== undefined) el.textContent = v;
    });
  };

  window.defineComposition = function ({ duration, fps = 30, build }) {
    let tl;
    let onSeek = null;
    const ready = Promise.all([fontsReady(), imagesReady()]).then(() => {
      const built = build();
      tl = built.timeline || built;
      onSeek = built.onSeek || null;
      tl.pause(0);
      if (onSeek) onSeek(0);
      return true;
    });

    window.composition = {
      duration,
      fps,
      ready,
      seek(t) {
        tl.totalTime(Math.max(0, Math.min(t, duration)), true);
        if (onSeek) onSeek(t);
      },
    };

    if (RENDER) {
      document.body.classList.add('render');
      return;
    }

    // ---------- Preview mode ----------
    const stage = document.getElementById('stage');
    const fit = () => {
      const s = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
      stage.style.transform = `translate(${(window.innerWidth - 1080 * s) / 2}px, ${(window.innerHeight - 1920 * s) / 2}px) scale(${s})`;
    };
    window.addEventListener('resize', fit);
    fit();

    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = '<span id="hud-t">0.00s</span> <input id="hud-r" type="range" min="0" step="0.01"> <span>Leertaste: Play/Pause</span>';
    document.body.appendChild(hud);
    const label = hud.querySelector('#hud-t');
    const range = hud.querySelector('#hud-r');
    range.max = duration;

    ready.then(() => {
      let playing = true;
      let t = parseFloat(params.get('t') || '0');
      let last = performance.now();
      range.addEventListener('input', () => { t = parseFloat(range.value); });
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') { playing = !playing; e.preventDefault(); }
        if (e.code === 'ArrowRight') t = Math.min(duration, t + 1 / fps);
        if (e.code === 'ArrowLeft') t = Math.max(0, t - 1 / fps);
      });
      const loop = (now) => {
        if (playing) t += (now - last) / 1000;
        last = now;
        if (t > duration + 0.5) t = 0;
        window.composition.seek(t);
        label.textContent = Math.min(t, duration).toFixed(2) + 's';
        range.value = t;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  };
})();
