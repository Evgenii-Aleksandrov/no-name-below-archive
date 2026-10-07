/* Native decorative motion. Routing and content remain owned by app.js. */
(function () {
  'use strict';
  const EVENT = 'nnb:orb-motion';
  let state = null;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const resolve = value => typeof value === 'string' ? document.querySelector(value) : value;
  const ASSETS = 'engine/idle-game-engine/assets/textures/items/';

  function preloadTexture(owner, src) {
    if (owner.textures.has(src)) return owner.textures.get(src);
    const loaded = new Promise(done => {
      const image = new Image();
      owner.textureImages.set(src, image);
      image.decoding = 'async';
      image.onload = async () => {
        try { if (image.decode) await image.decode(); done(true); }
        catch { done(false); }
      };
      image.onerror = () => done(false);
      image.src = src;
    });
    owner.textures.set(src, loaded);
    return loaded;
  }

  function selectTexture(owner, id) {
    const sequence = ++owner.textureSequence;
    const requested = Object.hasOwn(owner.routeTextures, id)
      ? owner.routeTextures[id] : owner.defaultSrc;
    const reportMissing = src => {
      if (owner.textureErrors.has(src)) return;
      owner.textureErrors.add(src);
      emit('asset-error', { src, fallback: owner.currentSrc || owner.defaultSrc });
    };
    preloadTexture(owner, requested).then(async loaded => {
      if (state !== owner || sequence !== owner.textureSequence) return;
      let src = requested;
      if (!loaded) {
        reportMissing(src);
        // Keep the last decoded artwork, even while a replacement is loading.
        if (owner.currentSrc) return;
        src = owner.defaultSrc;
        if (!await preloadTexture(owner, src)) {
          if (state === owner && sequence === owner.textureSequence) reportMissing(src);
          return;
        }
      }
      if (state !== owner || sequence !== owner.textureSequence) return;
      // Install the already decoded image; assigning src again can refetch when
      // browser caching is disabled. The single animated token never changes.
      owner.image = owner.textureImages.get(src);
      owner.image.alt = '';
      owner.image.width = owner.image.height = owner.size;
      owner.image.draggable = false;
      owner.token.replaceChildren(owner.image);
      owner.currentSrc = src;
      owner.token.hidden = false;
      emit('texture-change', { src });
    });
  }

  function emit(type, extra = {}) {
    window.dispatchEvent(new CustomEvent(EVENT, {
      detail: { type, route: state?.route ?? null, reducedMotion: !!state?.reduced(), ...extra }
    }));
  }

  function cancel(reason) {
    if (!state?.animation) return;
    const animation = state.animation;
    state.animation = null;
    animation.onfinish = null;
    animation.cancel();
    emit('route-cancel', { reason });
  }

  function progress() {
    const scrolling = document.scrollingElement || document.documentElement;
    const range = scrolling.scrollHeight - scrolling.clientHeight;
    return range > 0 ? clamp(scrolling.scrollTop / range, 0, 1) : 0;
  }

  function updateScroll() {
    if (!state) return;
    state.frame = 0;
    if (state.mode !== 'scroll') return;
    state.scrollRoot.dataset.nativeScroll = String(state.nativeScroll && !state.reduced());
    if (state.section) {
      const scrolling = document.scrollingElement || document.documentElement;
      const p = clamp((scrolling.scrollTop - state.scrollAnchor) / state.scrollRange, 0, 1);
      const direction = state.scrollBase > state.routeTravel / 2 ? -1 : 1;
      const x = state.reduced() ? state.routeTravel : state.scrollBase + direction * p * state.scrollTravel;
      const rotation = state.reduced() ? 0 : state.scrollRotation + (x - state.scrollBase) / (state.size / 2);
      state.token.style.transform = `translateX(${x}px) rotate(${rotation}rad)`;
      return;
    }
    const y = state.reduced() ? 0 : progress() * state.scrollTravel;
    state.token.style.transform = state.nativeScroll && !state.reduced()
      ? '' : `translateY(${y}px) rotate(${y / (state.size / 2)}rad)`;
  }

  function scheduleScroll() {
    if (!state || state.frame || document.hidden) return;
    state.frame = requestAnimationFrame(updateScroll);
  }

  function showScroll() {
    if (!state) return;
    state.mode = 'scroll';
    state.token.classList.add('nnb-orb-token-scroll');
    state.token.style.opacity = '1';
    state.token.style.willChange = '';
    if (state.section) {
      state.scrollAnchor = (document.scrollingElement || document.documentElement).scrollTop;
      state.scrollBase = state.settledX;
      state.scrollRotation = state.settledRotation;
    }
    state.scrollRoot.append(state.token);
    updateScroll();
  }

  function motionChanged() {
    cancel('motion-preference');
    showScroll();
  }

  function visibilityChanged() {
    if (document.hidden) {
      cancel('page-hidden');
      if (state?.frame) cancelAnimationFrame(state.frame);
      if (state) state.frame = 0;
      showScroll();
    } else scheduleScroll();
  }

  function destroy() {
    if (!state) return;
    cancel('destroy');
    if (state.frame) cancelAnimationFrame(state.frame);
    window.removeEventListener('scroll', scheduleScroll);
    window.removeEventListener('resize', scheduleScroll);
    document.removeEventListener('visibilitychange', visibilityChanged);
    state.media.removeEventListener('change', motionChanged);
    state.observer?.disconnect();
    state.routeRoot.remove();
    state.scrollRoot.remove();
    emit('destroy');
    state = null;
  }

  function init(options = {}) {
    const routeHost = resolve(options.routeHost);
    const scrollHost = resolve(options.scrollHost);
    if (!(routeHost instanceof HTMLElement) || !(scrollHost instanceof HTMLElement)) {
      throw new TypeError('NNBOrbMotion.init needs routeHost and scrollHost elements.');
    }
    destroy();
    const section = options.presentation === 'section';
    const size = section ? clamp(Number(options.size) || 88, 64, 88) : clamp(Number(options.size) || 36, 32, 40);
    const routeTravel = clamp(Number(options.routeTravel) || 96, 48, 160);
    const scrollTravel = section ? clamp(Number(options.scrollTravel) || 64, 24, 64) : clamp(Number(options.scrollTravel) || 160, 64, 240);
    const routeRoot = document.createElement('span');
    const scrollRoot = document.createElement('span');
    routeRoot.className = 'nnb-orb-rail nnb-orb-route';
    scrollRoot.className = 'nnb-orb-rail nnb-orb-scroll';
    for (const root of [routeRoot, scrollRoot]) {
      if (section) root.classList.add('nnb-orb-section');
      root.setAttribute('aria-hidden', 'true');
      root.style.setProperty('--nnb-orb-size', size + 'px');
      root.style.setProperty('--nnb-orb-crest-span', routeTravel + 'px');
    }
    routeRoot.style.setProperty('--nnb-orb-travel', routeTravel + 'px');
    scrollRoot.style.setProperty('--nnb-orb-travel', scrollTravel + 'px');
    scrollRoot.style.setProperty('--nnb-orb-turn', scrollTravel / (size / 2) + 'rad');
    const token = document.createElement('span');
    token.className = 'nnb-orb-token';
    const image = document.createElement('img');
    const defaultSrc = options.orbSrc || ASSETS + 'chaos_orb.png';
    image.alt = '';
    image.width = image.height = size;
    image.draggable = false;
    token.hidden = true;
    token.append(image);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const nativeScroll = !section && options.scrollTimeline !== false && CSS.supports('animation-timeline: scroll(root block)');
    state = {
      routeRoot, scrollRoot, token, image, media, size, routeTravel, scrollTravel,
      duration: section ? clamp(Number(options.duration) || 680, 560, 720) : clamp(Number(options.duration) || 560, 480, 620),
      section, scrollRange: clamp(Number(options.scrollRange) || 320, 240, 480),
      settledX: 0, settledRotation: 0, scrollAnchor: 0, scrollBase: 0, scrollRotation: 0,
      reduced: () => options.reducedMotion === true || media.matches,
      nativeScroll, mode: 'scroll', animation: null, frame: 0,
      defaultSrc, currentSrc: null, textureSequence: 0, textures: new Map(), textureImages: new Map(), textureErrors: new Set(),
      routeTextures: {
        items: defaultSrc, armory: defaultSrc,
        planner: ASSETS + 'orb_of_regret.png', talents: ASSETS + 'orb_of_regret.png',
        crafting: ASSETS + 'orb_of_transmutation.png',
        ...Object.fromEntries(Object.entries(options.routeTextures || {}).filter(([, src]) => typeof src === 'string' && src))
      },
      route: options.initialRoute ?? null,
      order: options.routeOrder || ['items', 'classes', 'skills', 'talents', 'planner', 'enemies', 'dungeons', 'affixes', 'mechanics', 'crafting', 'orbs', 'showcase']
    };
    scrollRoot.dataset.nativeScroll = String(nativeScroll);
    routeHost.append(routeRoot);
    scrollHost.append(scrollRoot);
    media.addEventListener('change', motionChanged);
    window.addEventListener('resize', scheduleScroll, { passive: true });
    document.addEventListener('visibilitychange', visibilityChanged);
    if (!nativeScroll) window.addEventListener('scroll', scheduleScroll, { passive: true });
    if ('ResizeObserver' in window) {
      state.observer = new ResizeObserver(scheduleScroll);
      state.observer.observe(document.body);
    }
    showScroll();
    for (const src of new Set([defaultSrc, ...Object.values(state.routeTextures)])) preloadTexture(state, src);
    selectTexture(state, state.route);
    emit('ready', { nativeScroll });
    return window.NNBOrbMotion;
  }

  function route(id, options = {}) {
    if (!state || id === state.route) return false;
    const previous = state.route;
    const a = state.order.indexOf(previous), b = state.order.indexOf(id);
    const direction = options.direction === -1 || (options.direction !== 1 && a >= 0 && b >= 0 && b < a) ? -1 : 1;
    let x = direction > 0 ? 0 : state.routeTravel;
    let rotation = 0;
    const interrupted = !!state.animation;
    if (interrupted) {
      // Preserve the rendered pose before cancelling a rapid route change.
      const matrix = new DOMMatrixReadOnly(getComputedStyle(state.token).transform);
      x = matrix.m41;
      rotation = Math.atan2(matrix.m12, matrix.m11);
      cancel('superseded');
    }
    if (state.section && !interrupted && !state.token.hidden) {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(state.token).transform);
      x = matrix.m41;
      rotation = Math.atan2(matrix.m12, matrix.m11);
    }
    state.route = id;
    selectTexture(state, id);
    emit('route-start', { previous });
    if (state.reduced() || document.hidden || !state.token.animate || state.token.hidden) {
      showScroll();
      emit('route-settle', { instant: true });
      return true;
    }
    state.mode = 'route';
    state.token.classList.remove('nnb-orb-token-scroll');
    state.token.style.willChange = 'transform, opacity';
    state.routeRoot.append(state.token);
    const end = state.section && options.direction === undefined
      ? (x > state.routeTravel / 2 ? 0 : state.routeTravel) : (direction > 0 ? state.routeTravel : 0);
    const endRotation = rotation + (end - x) / (state.size / 2);
    const from = `translateX(${x}px) rotate(${rotation}rad)`;
    const to = `translateX(${end}px) rotate(${endRotation}rad)`;
    state.token.style.transform = from;
    const overshoot = end + (end >= x ? 4 : -4);
    const overRotation = rotation + (overshoot - x) / (state.size / 2);
    const frames = state.section ? [
      { transform: from, opacity: 1, offset: 0, easing: 'cubic-bezier(.22,1,.36,1)' },
      { transform: `translateX(${overshoot}px) rotate(${overRotation}rad)`, opacity: 1, offset: .82, easing: 'cubic-bezier(.2,.8,.2,1)' },
      { transform: to, opacity: 1, offset: 1 }
    ] : [
      { transform: from, opacity: interrupted ? 1 : 0 },
      { opacity: 1, offset: .15 },
      { opacity: 1, offset: .85 },
      { transform: to, opacity: 0 }
    ];
    const animation = state.token.animate(frames, {
      duration: state.duration, easing: state.section ? 'linear' : 'cubic-bezier(.22,1,.36,1)', fill: 'forwards'
    });
    state.animation = animation;
    animation.onfinish = () => {
      if (!state || state.animation !== animation) return;
      state.animation = null;
      if (state.section) { state.settledX = end; state.settledRotation = endRotation; }
      animation.cancel();
      showScroll();
      emit('route-settle', { instant: false });
    };
    return true;
  }

  window.NNBOrbMotion = Object.freeze({ init, route, destroy });
}());
