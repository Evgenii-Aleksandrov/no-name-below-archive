/* Finite route decoration. Routing and content remain owned by app.js. */
(function () {
  'use strict';
  const EVENT = 'nnb:orb-motion';
  const ASSETS = 'engine/idle-game-engine/assets/textures/items/';
  const ART = ['chaos_orb.png', 'orb_of_regret.png', 'orb_of_transmutation.png', 'orb_of_alchemy.png', 'divine_orb.png', 'exalted_orb.png', 'regal_orb.png'];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const resolve = value => typeof value === 'string' ? document.querySelector(value) : value;
  let state = null;

  // Shared choreography and poses also drive the seekable HyperFrames proof.
  function layout(width, height) {
    const base = clamp(width * .12, 58, 150);
    return Array.from({ length: 14 }, (_, i) => {
      const depth = [ .66, 1, .82, 1.2 ][i % 4];
      const size = Math.round(base * depth);
      return { size, y: height * (.03 + (i * 5 % 14) / 13 * .94) - size / 2,
        drift: (i % 2 ? -1 : 1) * height * .025, delay: (i * 3 % 14) / 13 * .08,
        opacity: depth < .8 ? .64 : .94, layer: Math.round(depth * 10) };
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

  function revealFrames(rect, width, height, direction = 1, starts = []) {
    const flights = layout(width, height).map((flight, i) => {
      const start = direction > 0 ? -flight.size * 2 : width + flight.size;
      const end = direction > 0 ? width + flight.size : -flight.size * 2;
      const rows = [0, .14, .48, .82, 1].map(offset => ({ offset, x: start + (end - start) * offset }));
      if (starts[i]) rows[0].x = new DOMMatrixReadOnly(starts[i].transform).m41;
      return { ...flight, delay: starts.length ? 0 : flight.delay,
        rows };
    });
    // Keep the same piecewise-linear translation clock as the actual orb poses.
    const times = new Set([0, 1]);
    for (const flight of flights) {
      const tail = direction > 0 ? -flight.size * .25 : flight.size * 1.25;
      flight.rows.forEach((row, i) => {
        times.add(Math.min(1, flight.delay + row.offset * .82));
        if (!i) return;
        const previous = flight.rows[i - 1];
        // A clamped edge needs its own keyframe: otherwise interpolation
        // starts revealing before the last orb reaches this host's boundary.
        for (const edge of [rect.left, rect.left + rect.width]) {
          const p = (edge - tail - previous.x) / (row.x - previous.x);
          if (p > 0 && p < 1) times.add(flight.delay +
            (previous.offset + (row.offset - previous.offset) * p) * .82);
        }
      });
    }
    return [...times].sort((a, b) => a - b).map(time => {
      const tails = flights.map(flight => {
        const phase = clamp((time - flight.delay) / .82, 0, 1);
        const next = flight.rows.findIndex(row => row.offset >= phase);
        const b = flight.rows[Math.max(0, next)], a = flight.rows[Math.max(0, next - 1)];
        const p = b.offset > a.offset ? (phase - a.offset) / (b.offset - a.offset) : 0;
        const x = a.x + (b.x - a.x) * p;
        // Reveal behind the entire rotating sprite, rather than its leading edge.
        return x + (direction > 0 ? -flight.size * .25 : flight.size * 1.25);
      });
      // One full-height native clip follows the last orb, so no destination
      // region appears ahead of the passage and no row-shaped holes are cut.
      const tail = direction > 0 ? Math.min(...tails) : Math.max(...tails);
      const frontier = clamp(tail - rect.left, 0, rect.width);
      return { clipPath: direction > 0 ? `inset(0px ${(rect.width - frontier).toFixed(2)}px 0px 0px)` :
        `inset(0px 0px 0px ${frontier.toFixed(2)}px)`, offset: time };
    });
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

  function cancel(reason, keepOverlay = false) {
    if (!state) return;
    const active = state.animations.length > 0;
    for (const animation of state.animations) {
      animation.onfinish = null;
      animation.cancel();
    }
    state.animations = [];
    if (!keepOverlay) {
      state.overlay.hidden = true;
      state.overlay.replaceChildren(state.veil);
      state.tokens = [];
    }
    if (active && reason !== 'complete') emit('route-cancel', { reason });
  }

  function settle(reason) {
    if (!state?.animations.length) return;
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
    const veil = document.createElement('span');
    veil.className = 'nnb-orb-veil';
    overlay.append(veil);
    // Body ownership avoids transformed headings clipping the viewport overlay.
    document.body.append(overlay);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const defaultSrc = options.orbSrc || ASSETS + ART[0];
    state = { overlay, veil, media, defaultSrc, contentHost: options.contentHost,
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
    if (!state || id === state.route) return false;
    const owner = state, previous = owner.route;
    const a = owner.order.indexOf(previous), b = owner.order.indexOf(id);
    const direction = options.direction === -1 || (options.direction !== 1 && a >= 0 && b >= 0 && b < a) ? -1 : 1;
    // Read every visible pose before supersession; the same sprites continue
    // their flight, rather than flashing off and restarting at the screen edge.
    const poses = owner.tokens.map(token => {
      const css = getComputedStyle(token);
      return { transform: css.transform, opacity: css.opacity, offset: 0 };
    });
    const veilOpacity = getComputedStyle(owner.veil).opacity;
    cancel('superseded', poses.length > 0);
    owner.route = id;
    emit('route-start', { previous, transition: 'orb-swarm' });
    const loaded = [...owner.textures].filter(([, entry]) => entry.loaded).map(([src]) => src);
    if (owner.reduced() || document.hidden || !owner.overlay.animate || !loaded.length) {
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
    choreography.forEach((flight, i) => {
      let token = owner.tokens[i];
      if (!token) {
        token = document.createElement('span');
        token.className = 'nnb-orb-token';
        const image = owner.textures.get(palette[i % palette.length]).image.cloneNode();
        image.alt = '';
        image.draggable = false;
        image.width = image.height = flight.size;
        image.onerror = () => { token.hidden = true; };
        token.append(image);
        owner.tokens.push(token);
        owner.overlay.append(token);
      }
      Object.assign(token.style, { top: flight.y + 'px', width: flight.size + 'px', height: flight.size + 'px', zIndex: flight.layer });
      token.style.setProperty('--nnb-orb-direction', direction);
      const rows = frames(viewport.width, flight.size, direction, flight.drift, flight.opacity).orb;
      if (poses[i]) rows[0] = poses[i];
      owner.animations.push(token.animate(rows, {
        duration: owner.duration * .82, delay: poses.length ? 0 : owner.duration * flight.delay,
        easing: 'linear', fill: 'both'
      }));
    });
    const shared = frames();
    if (poses.length) shared.veil[0].opacity = Number(veilOpacity);
    const clock = owner.veil.animate(shared.veil, { duration: owner.duration, fill: 'both' });
    owner.animations.push(clock);
    const host = typeof owner.contentHost === 'function' ? owner.contentHost(id) : owner.contentHost;
    const content = resolve(host);
    if (content?.animate) {
      const rect = content.getBoundingClientRect();
      const reveal = revealFrames({ left: rect.left - viewport.left, width: rect.width },
        viewport.width, viewport.height, direction, poses);
      owner.animations.push(content.animate(reveal, { duration: owner.duration, easing: 'linear', fill: 'both' }));
    }
    clock.onfinish = () => {
      if (state !== owner || !owner.animations.includes(clock)) return;
      cancel('complete');
      emit('route-settle', { instant: false, transition: 'orb-swarm' });
    };
    return true;
  }

  window.NNBOrbMotion = Object.freeze({ init, route, destroy, frames, layout, revealFrames });
}());
