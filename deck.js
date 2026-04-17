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

  /* ============================================================
     AUTO TOKENIZER — parte cada texto en spans por letra,
     asignando data-char secuencial. La letra N de cualquier slide
     morphs a la letra N de la siguiente slide (match por ordinal).
     Skip: spans que ya son brand-char (el logo HHA.DIGITAL que
     tiene su propio matching semántico).
     ============================================================ */

  const SKIP_CLASSES = ['brand-char', 'auto-char'];
  /* Contenedores cuyo contenido NO se tokeniza letra por letra.
     El bloque completo morfa como unidad (via view-transition-name: hero
     asignado en CSS) pero evitamos el costo de animar cientos de chars.
     Sin esto, la transición slide 5 → 6 animaba 613 letras simultáneamente
     y superaba 1s. Con el skip baja a ~130 chars y entra en los 500ms. */
  const SKIP_PARENT_CLASSES = [
    'brand-char',         // no re-tokenizar dentro del logo
    'editorial-index',    // 11 ítems de la slide 5
    'terminal-timeline',  // 5 pasos detallados de la slide 6
    'rotating-word',      // texto se cambia vía JS, no debe tokenizarse
  ];

  function shouldSkip(node) {
    let el = node.parentElement;
    while (el) {
      for (const cls of SKIP_CLASSES) {
        if (el.classList && el.classList.contains(cls)) return true;
      }
      for (const cls of SKIP_PARENT_CLASSES) {
        if (el.classList && el.classList.contains(cls)) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function tokenizeSlide(slide) {
    const walker = document.createTreeWalker(
      slide,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (node) => {
        if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        if (!node.textContent || node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }}
    );
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    /* Memoize computed display per parent to avoid layout thrashing in loop */
    const displayCache = new WeakMap();
    function getDisplay(el) {
      if (displayCache.has(el)) return displayCache.get(el);
      const d = getComputedStyle(el).display;
      displayCache.set(el, d);
      return d;
    }

    let charIdx = 0;
    nodes.forEach(textNode => {
      const text = textNode.textContent;
      const parent = textNode.parentElement;
      const parentDisplay = getDisplay(parent);
      const isFlexOrGrid = parentDisplay === 'flex' || parentDisplay === 'grid' ||
                           parentDisplay === 'inline-flex' || parentDisplay === 'inline-grid';

      const frag = document.createDocumentFragment();
      /* Split by whitespace boundaries. Each "word" becomes an inline-block
         wrapper (so line breaks only happen between words, not inside).
         Each char inside a word is a separate <span class="auto-char"> for
         view-transition-name morphing. Whitespace is preserved as text nodes
         between word wrappers. */
      const parts = text.split(/(\s+)/);
      for (const part of parts) {
        if (part.length === 0) continue;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
        } else {
          const wordSpan = document.createElement('span');
          wordSpan.className = 'auto-word';
          for (const ch of part) {
            const span = document.createElement('span');
            span.className = 'auto-char';
            span.dataset.char = String(++charIdx);
            span.textContent = ch;
            wordSpan.appendChild(span);
          }
          frag.appendChild(wordSpan);
        }
      }

      if (isFlexOrGrid) {
        const wrapper = document.createElement('span');
        wrapper.className = 'auto-wrap';
        wrapper.appendChild(frag);
        textNode.parentNode.replaceChild(wrapper, textNode);
      } else {
        textNode.parentNode.replaceChild(frag, textNode);
      }
    });
  }

  function applyAutoNames(slide) {
    slide.querySelectorAll('.auto-char').forEach(s => {
      s.style.viewTransitionName = 'char-' + s.dataset.char;
    });
  }

  function clearAutoNames(slide) {
    slide.querySelectorAll('.auto-char').forEach(s => {
      s.style.viewTransitionName = '';
    });
  }

  /* Tokenize todas las slides al cargar */
  slides.forEach(slide => tokenizeSlide(slide));

  /* Generar CSS de duraciones para las char transitions.
     View-transition pseudo-names no admiten wildcards — hay que listar cada N. */
  const maxChars = Math.max(...Array.from(slides).map(s =>
    s.querySelectorAll('.auto-char').length
  ));
  const charCssStyle = document.createElement('style');
  let charCss = '@supports (view-transition-name: none) {\n';
  for (let i = 1; i <= maxChars; i++) {
    charCss += `::view-transition-group(char-${i}),`;
  }
  charCss = charCss.slice(0, -1) + ' { animation-duration: 500ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }\n';
  for (let i = 1; i <= maxChars; i++) {
    charCss += `::view-transition-old(char-${i}),::view-transition-new(char-${i}),`;
  }
  charCss = charCss.slice(0, -1) + ' { animation-duration: 500ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }\n';
  charCss += '}';
  charCssStyle.textContent = charCss;
  document.head.appendChild(charCssStyle);

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

    /* Apply auto names to outgoing slide BEFORE transition starts
       so the pre-commit snapshot has them. */
    applyAutoNames(slides[current]);

    const commit = () => {
      clearAutoNames(slides[current]);
      slides[current].classList.remove('active');
      current = n;
      slides[current].classList.add('active');
      applyAutoNames(slides[current]);
      if (counter) counter.textContent = String(current + 1).padStart(2, '0');
      updateProgress(current);
      setBodyTheme(current);
      updateButtons();
    };

    isTransitioning = true;
    const cleanup = () => {
      /* Clean auto names from active slide AFTER transition ends.
         view-transition-name causes stacking context + contain:layout paint
         which breaks inline rendering (words stick together). Only applied
         during the transition itself. */
      clearAutoNames(slides[current]);
      isTransitioning = false;
    };

    if (document.startViewTransition) {
      try {
        const t = document.startViewTransition(commit);
        t.finished.finally(cleanup);
      } catch (err) {
        /* If VT API throws (throttling, memory pressure, bug), fallback to
           synchronous commit so the deck never freezes on isTransitioning. */
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

  /* Rotating word en slide 4 (Swiss) — cicla entre verbos cada ~2.6s
     con fade + slide sutil. El data-words es pipe-separated para
     mantener el HTML legible. */
  document.querySelectorAll('.rotating-word[data-words]').forEach(el => {
    const words = (el.dataset.words || '').split('|').filter(Boolean);
    if (words.length < 2) return;
    let i = 0;
    setInterval(() => {
      el.classList.add('is-fading');
      setTimeout(() => {
        i = (i + 1) % words.length;
        el.textContent = words[i];
        el.classList.remove('is-fading');
      }, 230);
    }, 2600);
  });

  /* Reassemble obfuscated email mailto links (anti-scraping):
     <a data-u="apps" data-d="hha.digital">apps[at]hha[dot]digital</a>
     → href="mailto:apps@hha.digital" built at runtime only. */
  document.querySelectorAll('a[data-u][data-d]').forEach(el => {
    el.href = 'mailto:' + el.dataset.u + '@' + el.dataset.d;
  });

  /* Initial state: NO auto names applied in static state.
     They're only applied transiently during navigation (see go()). */
  setBodyTheme(0);
  updateProgress(0);

  /* Legacy deep-link support: si alguien entra con #slide-N de una versión
     anterior, respetamos esa slide pero limpiamos la URL inmediatamente
     para que no quede visible. */
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
