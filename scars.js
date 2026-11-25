'use strict';

const scarAssets = 'assets/scars/';
let scarMapRequest;

async function showScars() {
  chapterShell('scars', 'Clear the Cosmic Throne to open the Atlas. Start at T9 and descend through new layers of familiar dungeons.');
  const host = document.createElement('div');
  host.className = 'scar-atlas';
  host.setAttribute('aria-busy', 'true');
  host.textContent = t('Loading the Atlas map…');
  $('chapter').replaceChildren(host);

  scarMapRequest ??= fetch(scarAssets + 'map.json').then(response => {
    if (!response.ok) throw new Error('Atlas map unavailable');
    return response.json();
  }).catch(error => {
    scarMapRequest = undefined;
    throw error;
  });

  try {
    const atlas = await scarMapRequest;
    if (host.isConnected && activeRoute === 'scars') renderScars(host, atlas);
  } catch (error) {
    if (host.isConnected) host.textContent = t('The Atlas map could not load. Open the section again to retry.');
  } finally {
    host.removeAttribute('aria-busy');
  }
}

function renderScars(host, atlas) {
  const [worldWidth, worldHeight] = atlas.world_size;
  const locale = window.NNBI18n.locale;
  const local = values => values[locale] || values.en;
  const art = (file, className = '', lazy = true) =>
    '<img class="' + className + '" src="' + rawEsc(scarAssets + file) + '" alt=""' + (lazy ? ' loading="lazy"' : '') + '>';
  const pos = (x, y) => 'left:' + (100 * x / worldWidth) + '%;top:' + (100 * y / worldHeight) + '%';
  const destinations = atlas.hosts.map(({dungeon_id, position}) => {
    const record = byId.get(dungeon_id);
    return {id: dungeon_id, position, name: record?.name || dungeon_id,
      tier: atlas.tiers.first_tier + (record?.tier || record?.data.tier_min || 1) - 1};
  });
  const {max_layers: depth, milestone_interval: segment} = atlas.tower;
  const gate = tier => Math.min(depth, atlas.tiers.gate_layers.base + atlas.tiers.gate_layers.per_tier * (tier - atlas.tiers.first_tier));
  const {restore_price: restorePrice, boost_price: boostPrice} = atlas.statue;
  const labels = {
    choice: 'Pick a modifier', elite: 'Elite room', fountain: 'Fountain', blacksmith: 'Blacksmith',
    milestone: 'Milestone boss', statue: 'Statue', checkpoint: 'Checkpoint',
  };

  const tiles = atlas.tiles.map(({rect: [x, y, width, height], image}, index) =>
    '<div class="scar-tile" style="' + pos(x,y) + ';width:' + (100 * width / worldWidth) + '%;height:' +
      (100 * height / worldHeight) + '%">' + art(image, '', index > 0) + '</div>'
  ).join('');
  const pins = destinations.map(({id, name, tier, position}) =>
    '<button type="button" class="scar-pin" style="' + pos(...position) + '" data-host="' + rawEsc(id) +
      '" aria-label="' + rawEsc(name) + '" aria-pressed="false">T' + tier + '</button>'
  ).join('');
  const options = destinations.map(({id, name, tier}) =>
    '<option value="' + rawEsc(id) + '">T' + tier + ' · ' + rawEsc(name) + '</option>'
  ).join('');

  const scenarios = [
    {label:'First ascent', note:'Defeat the first milestone boss. The statue opens before the next modifier choice.',
      steps:[['choice',1], ['fountain',segment - 1], ['milestone',segment], ['statue',segment], ['checkpoint',segment + 1]]},
    {label:'Visit the Blacksmith', note:'Take a branch through the Blacksmith, choose one contract, then climb to the boss.',
      steps:[['choice',1], ['elite',4], ['blacksmith',atlas.blacksmith_layer], ['fountain',segment - 1], ['milestone',segment]]},
    {label:'Resume at a checkpoint', note:'At layer 11, make both modifier choices before the start. Checkpoints belong to each dungeon.',
      steps:[['checkpoint',segment + 1], ['choice',segment + 1], ['fountain',2 * segment - 1], ['milestone',2 * segment], ['checkpoint',2 * segment + 1]]},
  ];
  const contracts = atlas.contracts.map(contract =>
    '<li class="scar-contract">' + art(contract.image) + '<div><h4>' + rawEsc(local(contract.name)) +
      '</h4><p>' + rawEsc(local(contract.text)) + '</p>' +
       (contract.sealed ? '<small>' + esc('Online: sealed until settlement') + '</small>' : '') + '</div></li>'
  ).join('');
  const modifiers = atlas.modifiers.map(modifier =>
    '<li class="scar-modifier">' + art(modifier.image) + '<div><h4>' + rawEsc(local(modifier.name)) + '</h4><p>' +
      rawEsc(local(modifier.text).replace(/\{value\}|%[df]/g, String(modifier.value))
        .replace('{element}', t('offered element'))) + '</p></div></li>'
  ).join('');

  host.innerHTML = html(
    '<div class="scar-map-shell"><div class="scar-map-controls">' +
      '<label for="scar-destination">Choose dungeon</label><select id="scar-destination">' + options + '</select></div>' +
      '<div class="scar-world-viewport" tabindex="0" aria-label="' + esc('Atlas world map, scroll horizontally') + '">' +
      '<div class="scar-world" style="--map-ratio:' + worldWidth / worldHeight + '">' + tiles + pins + '</div></div>' +
      '<div class="scar-destination-caption" aria-live="polite"></div></div>' +
    '<dl class="scar-rules"><div><dt>' + esc('Depth') + '</dt><dd>' +
      esc(t('Up to {depth} layers. Every {segment}th layer has a milestone boss.', {depth, segment})) + '</dd></div>' +
    '<div><dt>' + esc('Progression') + '</dt><dd>' +
      esc('Reach the depth target in every dungeon of the tier and meet the layer, boss and elite quotas. Defeat the guardian to open the next tier.') + '</dd></div>' +
    '<div><dt>' + esc('Loot') + '</dt><dd>' +
      esc(t('Deeper layers improve drops. Item rank follows the tier up to {rank}; retreat or finish to keep the loot.', {rank:atlas.rank_cap})) + '</dd></div></dl>' +
    '<section class="scar-section" aria-labelledby="scar-routes-heading"><h3 id="scar-routes-heading">Example routes</h3>' +
      '<p>Room layouts vary by run. These routes show where the main choices happen.</p>' +
      '<div class="scar-route-buttons" aria-label="' + esc('Example routes') + '">' +
      scenarios.map(({label}, i) => '<button type="button" data-scar-route="' + i + '" aria-pressed="false">' + esc(label) + '</button>').join('') +
      '</div><div class="scar-route-results" aria-live="polite"></div></section>' +
    '<section class="scar-section scar-workshop" aria-labelledby="scar-forge-heading"><div class="scar-forge-intro">' +
      art(atlas.icons.forge) + '<div><h3 id="scar-forge-heading">Blacksmith</h3>' +
      '<p>Trade three pieces from the run inventory or its auto-salvage queue for one result. Equipped items and the stash are unavailable.</p>' +
      '<p>One contract per visit. The result is kept when you retreat or finish the run. If you die, the spent inputs stay spent.</p></div></div>' +
      '<ol class="scar-contracts" aria-label="' + esc('Blacksmith contracts') + '">' + contracts + '</ol></section>' +
    '<section class="scar-section scar-milestone"><h3>After a milestone</h3><div class="scar-milestone-grid">' +
      '<div>' + art(atlas.icons.statue) + '<h4>Statue</h4><p>' +
      esc(t('Spend {restore} Votive Embers to restore health and resource, or {boost} for a small boost for the rest of the run.',
        {restore:restorePrice,boost:boostPrice})) + '</p></div>' +
      '<div>' + art(atlas.icons.tier_guardian) + '<h4>Tier guardian</h4><p>Victory unlocks the next tier at layer 1.</p></div>' +
      '<div>' + art(atlas.icons.cycle_guardian) + '<h4>Cycle guardian</h4><p>At the end of each eight-tier cycle, this guardian replaces the tier guardian. The first victory rewards a unique.</p></div></div>' +
      '<details class="scar-modifier-list"><summary>Atlas modifiers</summary>' +
      '<p>Choose one of three before the start and after each milestone. Your choices last for the rest of the run.</p>' +
      '<ul>' + modifiers + '</ul></details></section>'
  );

  const viewport = host.querySelector('.scar-world-viewport');
  const select = host.querySelector('#scar-destination');
  const caption = host.querySelector('.scar-destination-caption');
  const buttons = [...host.querySelectorAll('.scar-pin')];
  const routeButtons = [...host.querySelectorAll('[data-scar-route]')];
  const routeResults = host.querySelector('.scar-route-results');

  function selectDestination(id) {
    const destination = destinations.find(candidate => candidate.id === id);
    if (!destination) return;
    select.value = id;
    let target;
    for (const button of buttons) {
      const selected = button.dataset.host === id;
      button.setAttribute('aria-pressed', String(selected));
      if (selected) target = button;
    }
    viewport.scrollLeft = target.offsetLeft - viewport.clientWidth / 2;
    caption.innerHTML = '<div><h3>' + rawEsc(destination.name) + '</h3><p>T' + destination.tier + ' · ' +
      esc(t('Depth target: {depth}', {depth:gate(destination.tier)})) + '</p></div>' +
      '<a class="text-link" href="#entry/' + encodeURIComponent(id) + '">' + esc('View dungeon entry') + ' →</a>';
  }

  function selectScenario(index) {
    const scenario = scenarios[index];
    routeButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    routeResults.innerHTML = '<ol class="scar-route">' + scenario.steps.map(([type, layer]) =>
      '<li data-room="' + type + '">' + art(atlas.icons[type], '', false) + '<span>' +
      esc(t('Layer {layer}', {layer})) + '</span><strong>' + esc(labels[type]) + '</strong></li>'
    ).join('') + '</ol><p>' + esc(scenario.note) + '</p>';
  }

  select.addEventListener('change', () => selectDestination(select.value));
  buttons.forEach(button => button.addEventListener('click', () => selectDestination(button.dataset.host)));
  routeButtons.forEach((button, i) => button.addEventListener('click', () => selectScenario(i)));
  selectDestination(destinations[0].id);
  selectScenario(0);
}
