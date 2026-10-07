// Telefon-Markup mit echten (bereinigten) App-Screens. Masse in App-Pixeln @3x.
window.phone = function (screen) {
  const img = (f) => `<img src="../teaser/img/${f}" alt="">`;
  let inner = '';
  if (screen === 'dokumente') {
    const docs = ['DEMO-001', 'DEMO-002', 'DEMO-003'];
    inner = img('dokumente-anon.png') + docs.map((d, k) => `<div class="lay" style="left:30px;top:${604 + 315 * k}px;width:1110px;height:325px">
      <div class="ov ov-nr" style="left:439px;top:${194 - 0.85 * 34.5}px">${d}</div>
      <div class="ov ov-date" style="left:424px;top:${261 - 0.85 * 34.5}px">••.••.••••</div>
      <div class="ov ov-prem" style="right:52px;top:${261 - 0.85 * 36}px">•••.•• CHF/Jahr</div></div>`).join('');
  } else inner = img(`${screen}.png`);
  return `<div class="scr">${inner}</div><div class="island"></div><div class="glare"></div>`;
};
// Schriften + Bilder geladen → window.ready
window.ready = Promise.all([
  document.fonts.load('800 40px "Inter Tight"'), document.fonts.load('500 40px "Inter Tight"'), document.fonts.load('700 40px "Inter Tight"'),
  document.fonts.load('italic 400 40px "Instrument Serif"'), document.fonts.load('400 40px Poppins'), document.fonts.load('500 40px Poppins'),
]).then(() => new Promise((r) => setTimeout(r, 50))).then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
