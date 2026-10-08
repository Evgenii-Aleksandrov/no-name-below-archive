/* Finite route decoration. Routing and content remain owned by app.js. */
(function () {
  'use strict';
  const EVENT = 'nnb:orb-motion';
  const ASSETS = 'engine/idle-game-engine/assets/textures/items/';
  const ART = ['chaos_orb.png', 'orb_of_regret.png', 'orb_of_transmutation.png', 'orb_of_alchemy.png', 'divine_orb.png', 'exalted_orb.png', 'regal_orb.png'];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const resolve = value => typeof value === 'string' ? document.querySelector(value) : value;
  let state = null;

  // Native route choreography; frames() retains the older companion proof API.
  function layout(width, height) {
    const base = clamp(width * .12, 72, 150), step = base * .78;
    return Array.from({ length: (Math.ceil(height / step) + 3) * 2 }, (_, i) => {
      const column = i % 2, row = Math.floor(i / 2);
      const depth = [ .9, 1.12, .98, 1.04, .86, 1.16 ][i % 6];
      const size = Math.round(base * depth);
      return { size, x: (column ? 1 : -1) * base * .28 + Math.sin(i * 2.4) * base * .035,
        y: (row - 1 + column * .5) * step + Math.cos(i * 1.7) * base * .04 - size / 2,
        swayX: Math.sin(i * 1.3) * base * .04, swayY: Math.cos(i * 2.1) * base * .025,
        rotation: Math.sin(i * 1.9) * .32, turn: (column ? -1 : 1) * (.35 + i % 3 * .13),
        drift: 0, delay: 0, opacity: 1, layer: i * 7 % 5 };
    });
  }

  function frames(travel = innerWidth, size = 80, direction = 1, drift = 0, opacity = .94) {
    const start = direction > 0 ? -size * 2 : travel + size;
    const end = direction > 0 ? travel + size : -size * 2;
    const pose = (p, scale, alpha) => ({
      transform: `translate3d(${start + (end - start) * p}px,${Math.sin(p * Math.PI) * drift}px,0) rotate(${direction * (-.2 + p * .8)}rad) scale(${scale})`,
      opacity: alpha, offset: p
    });
    return {
      orb: [pose(0, .86, 0), pose(.14, .96, opacity), pose(.48, 1.04, opacity), pose(.82, 1, opacity), pose(1, .9, 0)],
      veil: [{ opacity: 0, offset: 0 }, { opacity: .76, offset: .24 }, { opacity: .46, offset: .56 }, { opacity: 0, offset: 1 }]
    };
  }

  function carrierRange(width, height, direction) {
    const gutter = Math.max(...layout(width, height).map(flight => flight.size));
    return direction > 0 ? [-gutter, width + gutter] : [width + gutter, -gutter];
  }

  function revealFrames(rect, width, height, direction = 1, outgoing = false) {
    const [start, end] = carrierRange(width, height, direction);
    const times = new Set([0, 1]);
    for (const edge of [rect.left, rect.left + rect.width]) {
      const time = (edge - start) / (end - start);
      if (time > 0 && time < 1) times.add(time);
    }
    return [...times].sort((a, b) => a - b).map(offset => {
      const frontier = clamp(start + (end - start) * offset - rect.left, 0, rect.width);
      const fromLeft = (direction > 0) !== outgoing;
      return { clipPath: fromLeft ? `inset(0px ${(rect.width - frontier).toFixed(2)}px 0px 0px)` :
        `inset(0px 0px 0px ${frontier.toFixed(2)}px)`, offset };
    });
  }

  function visibleSources(sources) {
    const values = typeof sources === 'function' ? sources(state.route) : sources;
    return [...(values ? (Array.isArray(values) ? values : [values]) : document.body.children)]
      .map(resolve).filter(node => {
        if (!(node instanceof HTMLElement) || node === state.overlay || node instanceof HTMLDialogElement) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      });
  }

  function cachedStyles() {
    return [...document.styleSheets].map(sheet => {
      try {
        return [...sheet.cssRules].map(rule => rule.cssText).join('\n').replace(/:root\b/g, ':host')
          .replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (match, quote, url) =>
            url.startsWith('data:') || url.startsWith('#') ? match : `url("${new URL(url, sheet.href || document.baseURI).href}")`);
      } catch { return ''; }
    }).join('\n');
  }

  function snapshotClone(node, copies) {
    const copy = node.cloneNode(false);
    if (!(node instanceof Element)) return copy;
    copies.set(node, copy);
    // Hidden retained routes may contain the entire Armory. Keep their shell
    // for selector-dependent styling, without cloning thousands of descendants.
    if (node.hidden) return copy;
    if (node.matches('.tier-section,.card,.craft-action,.guide-block,.search-result')) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom < -48 || rect.top > innerHeight + 48) {
        Object.assign(copy.style, { height: rect.height + 'px', minHeight: rect.height + 'px', visibility: 'hidden' });
        return copy;
      }
    }
    if (node instanceof HTMLCanvasElement) copy.getContext('2d')?.drawImage(node, 0, 0);
    else if (node.matches('input,select,textarea')) {
      // Select options must exist before restoring their selected value.
      node.childNodes.forEach(child => copy.append(child.cloneNode(true)));
      copy.value = node.value;
      if ('checked' in node) copy.checked = node.checked;
      return copy;
    }
    node.childNodes.forEach(child => copy.append(snapshotClone(child, copies)));
    return copy;
  }

  // Capture synchronously while the old route, scroll and canvas still exist.
  function prepare(options = {}) {
    if (!state) return false;
    cancel('superseded');
    if (state.reduced() || document.hidden || !state.overlay.animate || ![...state.textures.values()].some(entry => entry.loaded)) return false;
    state.preparedSources = options.snapshotSources || state.snapshotSources;
    const sources = visibleSources(state.preparedSources);
    if (!sources.length) return false;
    const snapshot = document.createElement('div');
    snapshot.className = 'nnb-orb-snapshot';
    snapshot.dataset.outgoingRoute = state.route ?? '';
    snapshot.dataset.sourceCount = sources.length;
    // Closed isolation preserves IDs and selector-dependent styling without
    // exposing duplicate controls to the live document or browser locators.
    const shadow = snapshot.attachShadow({ mode: 'closed' });
    const styles = document.createElement('style');
    styles.textContent = state.styles + '\n*,*::before,*::after{animation-play-state:paused!important;transition:none!important;pointer-events:none!important}';
    const body = document.body.cloneNode(false);
    Object.assign(body.style, { position: 'absolute', left: '0', top: -scrollY + 'px',
      width: document.body.getBoundingClientRect().width + 'px', height: document.body.scrollHeight + 'px', margin: '0' });
    for (const source of sources) {
      const copies = new Map(), clone = snapshotClone(source, copies), rect = source.getBoundingClientRect();
      // Only these existing site elements own scene/sprite animations. A
      // subtree animation lookup also forces styles for offscreen records.
      for (const [node, copy] of copies) {
        if (node.hidden || copy.style.visibility === 'hidden' || !node.matches('.hero-art,.intro h1,.intro .lede,.planner-heading,.section-title,#cards .card,.combat-sprite .sprite-strip') || !node.getAnimations().length) continue;
        const css = getComputedStyle(node);
        Object.assign(copy.style, { transform: css.transform, opacity: css.opacity, filter: css.filter,
          clipPath: css.clipPath, animation: 'none' });
      }
      Object.assign(clone.style, { position: 'absolute', left: rect.left + 'px', top: rect.top + scrollY + 'px',
        width: rect.width + 'px', height: rect.height + 'px', margin: '0', transform: 'none' });
      body.append(clone);
    }
    shadow.append(styles, body);
    state.snapshot = snapshot;
    state.overlay.append(snapshot);
    state.overlay.hidden = false;
    return true;
  }

  function emit(type, extra = {}) {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: {
      type, route: state?.route ?? null, reducedMotion: !!state?.reduced(), ...extra
    } }));
  }

  function preload(owner, src) {
    if (owner.textures.has(src)) return;
    const image = new Image();
    const entry = { image, loaded: false };
    owner.textures.set(src, entry);
    image.decoding = 'async';
    image.onload = async () => {
      try { if (image.decode) await image.decode(); }
      catch { return; }
      if (state !== owner) return;
      entry.loaded = true;
      emit('texture-change', { src });
    };
    image.onerror = () => {
      if (state === owner) emit('asset-error', { src, fallback: owner.defaultSrc });
    };
    image.src = src;
  }

  function cancel(reason) {
    if (!state) return;
    const active = state.animations.length > 0;
    for (const animation of state.animations) {
      animation.onfinish = null;
      animation.cancel();
    }
    state.animations = [];
    state.overlay.hidden = true;
    state.overlay.replaceChildren();
    state.tokens = [];
    state.snapshot = null;
    if (active && reason !== 'complete') emit('route-cancel', { reason });
  }

  function settle(reason) {
    if (!state || (!state.animations.length && !state.snapshot)) return;
    cancel(reason);
    emit('route-settle', { instant: true, reason });
  }

  function motionChanged() { if (state?.reduced()) settle('motion-preference'); }
  function visibilityChanged() { if (document.hidden) settle('page-hidden'); }
  function resized() { settle('resize'); }

  function destroy() {
    if (!state) return;
    cancel('destroy');
    window.removeEventListener('resize', resized);
    window.visualViewport?.removeEventListener('resize', resized);
    document.removeEventListener('visibilitychange', visibilityChanged);
    state.media.removeEventListener('change', motionChanged);
    state.overlay.remove();
    for (const { image } of state.textures.values()) image.onload = image.onerror = null;
    emit('destroy');
    state = null;
  }

  function init(options = {}) {
    if (!(resolve(options.routeHost) instanceof HTMLElement)) {
      throw new TypeError('NNBOrbMotion.init needs a routeHost element.');
    }
    destroy();
    const overlay = document.createElement('div');
    overlay.className = 'nnb-orb-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    overlay.hidden = true;
    // Body ownership avoids transformed headings clipping the viewport overlay.
    document.body.append(overlay);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const defaultSrc = options.orbSrc || ASSETS + ART[0];
    state = { overlay, media, defaultSrc, contentHost: options.contentHost,
      snapshotSources: options.snapshotSources, snapshot: null, styles: cachedStyles(),
      route: options.initialRoute ?? null, duration: clamp(Number(options.duration) || 940, 750, 1000),
      order: options.routeOrder || [], routeTextures: options.routeTextures || {},
      reduced: () => options.reducedMotion === true || media.matches,
      textures: new Map(), tokens: [], animations: [] };
    for (const src of new Set([defaultSrc, ...ART.map(name => ASSETS + name), ...Object.values(state.routeTextures)])) {
      if (typeof src === 'string' && src) preload(state, src);
    }
    media.addEventListener('change', motionChanged);
    window.addEventListener('resize', resized, { passive: true });
    window.visualViewport?.addEventListener('resize', resized, { passive: true });
    document.addEventListener('visibilitychange', visibilityChanged);
    emit('ready', { nativeScroll: false });
    return window.NNBOrbMotion;
  }

  function route(id, options = {}) {
    if (!state) return false;
    if (id === state.route) { cancel('unchanged'); return false; }
    const owner = state, previous = owner.route;
    const a = owner.order.indexOf(previous), b = owner.order.indexOf(id);
    const direction = options.direction === -1 || (options.direction !== 1 && a >= 0 && b >= 0 && b < a) ? -1 : 1;
    if (owner.animations.length) cancel('superseded');
    owner.route = id;
    emit('route-start', { previous, transition: 'orb-swarm' });
    const loaded = [...owner.textures].filter(([, entry]) => entry.loaded).map(([src]) => src);
    if (!owner.snapshot || owner.reduced() || document.hidden || !owner.overlay.animate || !loaded.length) {
      cancel('instant');
      emit('route-settle', { instant: true });
      return true;
    }
    const requested = owner.routeTextures[id] || owner.defaultSrc;
    const palette = [...new Set([requested, ...loaded])].filter(src => owner.textures.get(src)?.loaded);
    owner.overlay.hidden = false;
    // The mobile browser's dynamic viewport can be shorter than innerHeight.
    // Measure the actual fixed overlay used by the sprites and reveal together.
    const viewport = owner.overlay.getBoundingClientRect();
    const choreography = layout(viewport.width, viewport.height);
    const carrier = document.createElement('div');
    carrier.className = 'nnb-orb-carrier';
    owner.overlay.append(carrier);
    const animate = (node, rows) => {
      const animation = node.animate(rows, { duration: owner.duration, easing: 'linear', fill: 'both' });
      // All pending native animations start together on the next render tick;
      // an explicit timeline timestamp can be stale after synchronous routing.
      owner.animations.push(animation);
      return animation;
    };
    const [start, end] = carrierRange(viewport.width, viewport.height, direction);
    const clock = animate(carrier, [{ transform: `translate3d(${start}px,0,0)` },
      { transform: `translate3d(${end}px,0,0)` }]);
    choreography.forEach((flight, i) => {
      const token = document.createElement('span');
      token.className = 'nnb-orb-token';
      const image = owner.textures.get(palette[i % palette.length]).image.cloneNode();
      image.alt = '';
      image.draggable = false;
      image.width = image.height = flight.size;
      token.append(image);
      owner.tokens.push(token);
      carrier.append(token);
      Object.assign(token.style, { left: flight.x - flight.size / 2 + 'px', top: flight.y + 'px',
        width: flight.size + 'px', height: flight.size + 'px', zIndex: flight.layer });
      token.style.setProperty('--nnb-orb-direction', direction);
      animate(token, [
        { transform: `translate(0px,0px) rotate(${flight.rotation}rad)` },
        { transform: `translate(${flight.swayX}px,${flight.swayY}px) rotate(${flight.rotation + direction * flight.turn * .5}rad)` },
        { transform: `translate(0px,0px) rotate(${flight.rotation + direction * flight.turn}rad)` }
      ]);
    });
    animate(owner.snapshot, revealFrames({ left: 0, width: viewport.width },
      viewport.width, viewport.height, direction, true));
    const host = typeof owner.contentHost === 'function' ? owner.contentHost(id) : owner.contentHost;
    const content = resolve(host);
    for (const node of new Set([...visibleSources(options.snapshotSources || owner.preparedSources), content])) {
      if (!node?.animate) continue;
      const rect = node.getBoundingClientRect();
      animate(node, revealFrames({ left: rect.left - viewport.left, width: rect.width },
        viewport.width, viewport.height, direction));
    }
    clock.onfinish = () => {
      if (state !== owner || !owner.animations.includes(clock)) return;
      cancel('complete');
      emit('route-settle', { instant: false, transition: 'orb-swarm' });
    };
    return true;
  }

  window.NNBOrbMotion = Object.freeze({ init, prepare, route, destroy, frames, layout, revealFrames });
}());
