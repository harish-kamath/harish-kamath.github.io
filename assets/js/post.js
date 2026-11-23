(function () {
  // tabs
  document.querySelectorAll('[data-tabs]').forEach(function (box) {
    var buttons = box.querySelectorAll('[data-tab]');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', b === btn); });
        box.querySelectorAll('[data-panel]').forEach(function (p) { p.classList.toggle('active', p.dataset.panel === btn.dataset.tab); });
      });
    });
  });
  // table of contents
  var toc = document.querySelector('.toc'), body = document.querySelector('.post-body');
  if (!toc || !body) return;
  var heads = body.querySelectorAll('h1[id], h2[id]');
  if (heads.length < 4) return;
  var list = toc.querySelector('ol'), links = [];
  heads.forEach(function (h) {
    var li = document.createElement('li'), a = document.createElement('a');
    if (h.tagName === 'H2') li.className = 'sub';
    a.href = '#' + h.id; a.textContent = h.textContent;
    li.appendChild(a); list.appendChild(li); links.push([h, a]);
  });
  toc.hidden = false;
  if (!window.matchMedia('(min-width: 90rem)').matches) toc.querySelector('details').open = false;
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function () {
      var cur = null;
      links.forEach(function (l) { if (l[0].getBoundingClientRect().top < 120) cur = l[1]; });
      links.forEach(function (l) { l[1].classList.toggle('current', l[1] === cur); });
    }, { rootMargin: '0px 0px -70% 0px' });
    heads.forEach(function (h) { obs.observe(h); });
  }
})();
