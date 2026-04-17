(function() {
  const slides = document.querySelectorAll('.slide');
  const progressBar = document.querySelector('.progress-bar');
  const progressFill = document.querySelector('.progress-fill');
  const prevBtn = document.querySelector('.prev');
  const nextBtn = document.querySelector('.next');
  const counter = document.getElementById('current');
  const total = slides.length;
  let current = 0;
  let isTransitioning = false;

  const themeNames = Array.from(slides).map(s => {
    const cls = s.className.split(' ').find(c => c.startsWith('theme-'));
    return cls ? cls.replace('theme-', '') : 'core';
  });

  function updateProgress(idx) {
    const pct = ((idx + 1) / total) * 100;
    progressFill.style.width = pct + '%';
    progressBar.setAttribute('aria-valuenow', idx + 1);
  }

  function setBodyTheme(idx) {
    const themes = themeNames.map(t => 'body-theme-' + t);
    document.body.classList.remove(...themes);
    document.body.classList.add('body-theme-' + themeNames[idx]);
  }

  function go(n) {
    n = Math.max(0, Math.min(total - 1, n));
    if (n === current || isTransitioning) return;

    const commit = () => {
      slides[current].classList.remove('active');
      current = n;
      slides[current].classList.add('active');
      if (counter) counter.textContent = String(current + 1).padStart(2, '0');
      updateProgress(current);
      setBodyTheme(current);
      updateButtons();
    };

    isTransitioning = true;
    const cleanup = () => { isTransitioning = false; };

    if (document.startViewTransition) {
      try {
        const t = document.startViewTransition(commit);
        t.finished.finally(cleanup);
      } catch (err) {
        /* Si VT API tira (throttling, memoria, bug), commit sincrónico para
           que el deck nunca quede congelado en isTransitioning. */
        console.warn('View Transition failed, falling back to direct commit:', err);
        commit();
        cleanup();
      }
    } else {
      commit();
      setTimeout(cleanup, 500);
    }
  }

  function updateButtons() {
    prevBtn.disabled = current === 0;
    /* En la última slide, el botón siguiente se convierte en "reiniciar"
       y lleva de vuelta a la primera — nunca se deshabilita. */
    if (current === total - 1) {
      nextBtn.textContent = '↺';
      nextBtn.setAttribute('aria-label', 'Volver al inicio');
    } else {
      nextBtn.textContent = '→';
      nextBtn.setAttribute('aria-label', 'Siguiente');
    }
    nextBtn.disabled = false;
  }

  function goNext() {
    if (current === total - 1) go(0);
    else go(current + 1);
  }

  prevBtn.addEventListener('click', () => go(current - 1));
  nextBtn.addEventListener('click', goNext);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      go(current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(total - 1);
    }
  });

  let touchStartX = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 60) {
      go(dx > 0 ? current - 1 : current + 1);
    }
  }, { passive: true });

  /* Reassemble obfuscated email mailto links (anti-scraping):
     <a data-u="apps" data-d="hha.digital">apps[at]hha[dot]digital</a>
     → href="mailto:apps@hha.digital" built at runtime only. */
  document.querySelectorAll('a[data-u][data-d]').forEach(el => {
    el.href = 'mailto:' + el.dataset.u + '@' + el.dataset.d;
  });

  setBodyTheme(0);
  updateProgress(0);

  /* Legacy deep-link support: si alguien entra con #slide-N de una versión
     anterior, respetamos esa slide pero limpiamos la URL inmediatamente. */
  const hashMatch = window.location.hash.match(/slide-(\d+)/);
  if (hashMatch) {
    const n = parseInt(hashMatch[1], 10) - 1;
    if (n >= 0 && n < total && n !== 0) {
      slides[0].classList.remove('active');
      current = n;
      slides[current].classList.add('active');
      if (counter) counter.textContent = String(current + 1).padStart(2, '0');
      updateProgress(current);
      setBodyTheme(current);
    }
  }
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  updateButtons();
})();
