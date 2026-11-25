const ORIGIN = 'https://bytxwifkdqchoaxqqhiz.supabase.co';
const BASE = `${ORIGIN}/functions/v1/robokassa/sandbox/web`;
const PRODUCT = 'premium_monthly';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_ID = /^[0-9a-f]{32}$/;
const $ = id => document.getElementById(id);
const EMBEDDED = window.top !== window.self;
let session = null, account = null, order = null, requestId = null, busy = false, epoch = 0, retryAt = 0;
let controller = null;
let alreadyOwned = false;

function premiumActive() {
  return alreadyOwned || (account?.active_until_ms || 0) > Date.now();
}

function message(text, error = false) {
  $('status').textContent = text;
  $('status').dataset.error = String(error);
}
function checkoutURL(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.origin === ORIGIN && !url.username && !url.password && !url.search && !url.hash &&
      /^\/functions\/v1\/robokassa\/sandbox\/web\/checkout\/[a-f0-9]{64}$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}
function render() {
  $('login-form').hidden = Boolean(session);
  $('signed-in').hidden = !session;
  $('account-link').href = session ? '#product-title' : '#account-title';
  $('account-link').firstChild.textContent = session ? 'К PREMIUM ' : 'ВОЙТИ В АККАУНТ ';
  $('account-email').textContent = session?.email || '';
  $('account-id').textContent = account ? `Аккаунт ${account.account_id.slice(0, 8)}…${account.account_id.slice(-4)}` : '';
  const product = account?.product;
  const active = premiumActive();
  $('premium-active').hidden = !active;
  $('premium-active').textContent = active ? account?.active_until_ms > Date.now() ? `Premium активен до ${new Intl.DateTimeFormat('ru-RU', {dateStyle:'long'}).format(account.active_until_ms)} Автопродления нет.` : 'Premium уже активен. Срок доступа можно проверить в игре. Автопродления нет.' : '';
  $('price').textContent = product ? `${new Intl.NumberFormat('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(product.amount_minor) / 100)} ₽` : session ? 'Цена пока недоступна' : 'Цена после входа';
  $('availability').textContent = !session ? 'Войдите в игровой аккаунт, чтобы проверить доступность Premium.' : !account ? 'Доступность Premium не загружена. Выйдите и войдите снова.' : active ? 'Новая покупка не требуется, пока действует ваш доступ.' : !product || !account.checkout_enabled ? 'Оплата ещё не подключена. Покупка и списание денег сейчас недоступны.' : 'Разовый платёж за календарный месяц Premium для указанного аккаунта.';
  $('buy').hidden = !session || !product || !account.checkout_enabled || active || Boolean(order);
  $('buy').textContent = requestId ? 'ПОВТОРИТЬ СОЗДАНИЕ ЗАКАЗА' : 'СОЗДАТЬ ЗАКАЗ';
  $('order').hidden = !order;
  const labels = {created:'Заказ создан', pending:'Ожидает оплаты', paid:'Оплата получена', fulfilled:'Доступ к Premium предоставлен', cancelled:'Заказ отменён', failed:'Заказ не завершён', expired:'Срок заказа истёк', provider_not_configured:'Ожидает подключения оплаты'};
  $('order-state').textContent = order ? (labels[order.state] || 'Статус заказа обновлён. Подтверждение доступа к Premium пока не получено.') : '';
  $('order-reference').textContent = order ? `Заказ ${order.order_id}` : '';
  const url = !active && order?.state !== 'fulfilled' && account?.checkout_enabled && checkoutURL(order?.checkout_url);
  $('checkout').hidden = !url;
  $('checkout-notice').hidden = !url;
  if (url) $('checkout').href = url; else $('checkout').removeAttribute('href');
  for (const id of ['login', 'buy', 'refresh-order']) $(id).disabled = busy || EMBEDDED;
  $('login-form').setAttribute('aria-busy', String(busy && !session));
}
function signout() {
  epoch++;
  controller?.abort();
  session = account = order = requestId = null;
  alreadyOwned = false;
  busy = false;
  $('password').value = '';
  $('email').value = '';
  render();
}
async function api(url, options = {}) {
  const active = new AbortController();
  const version = epoch;
  controller = active;
  const timeout = setTimeout(() => active.abort(), 15000);
  try {
    const response = await fetch(url, {method:'GET', mode:'cors', credentials:'omit', cache:'no-store', redirect:'error', referrerPolicy:'no-referrer', ...options, signal:active.signal});
    if (version !== epoch) throw new DOMException('Stale session', 'AbortError');
    if (response.status === 429) {
      const wait = Number(response.headers.get('Retry-After'));
      retryAt = Date.now() + Math.max(60, Number.isFinite(wait) ? wait : 60) * 1000;
      throw new Error('Слишком много попыток. Подождите минуту и повторите действие.');
    }
    const data = await response.json();
    if (version !== epoch) throw new DOMException('Stale session', 'AbortError');
    if (response.status === 403 && data.reason === 'SANDBOX_ACCOUNT_REQUIRED') {
      if (session) signout();
      const text = 'Используйте существующий тестовый игровой аккаунт No Name Below. Этот аккаунт не подключён к тестовой оплате.';
      message(text, true);
      throw new Error(text);
    }
    if (response.status === 401 || response.status === 403) {
      if (session) { signout(); message('Сессия истекла или доступ запрещён. Войдите снова.', true); throw new Error('Сессия истекла.'); }
      throw new Error('Не удалось войти. Проверьте почту, пароль и подтверждение почты.');
    }
    if (data.reason === 'CHECKOUT_DISABLED' || data.reason === 'provider_not_configured' || data.reason === 'checkout_disabled') throw new Error('Оплата ещё не подключена. Деньги не списаны.');
    if (data.reason === 'PRODUCT_ALREADY_OWNED') {
      alreadyOwned = true;
      throw new Error('Premium уже активен. Повторная покупка сейчас не требуется.');
    }
    if (!response.ok) throw new Error('Сервис временно недоступен. Повторите действие позже.');
    if (data.status && data.status !== 'ok') throw new Error('Действие сейчас недоступно. Повторите позже.');
    return data;
  } finally { clearTimeout(timeout); if (controller === active) controller = null; }
}
function validateOrder(value) {
  if (!value || !ORDER_ID.test(value.order_id) || typeof value.state !== 'string') throw new Error('Сервис вернул некорректный заказ. Покупка не продолжена.');
  if (value.checkout_url && !checkoutURL(value.checkout_url)) throw new Error('Платёжная ссылка не прошла проверку. Покупка не продолжена.');
  if (value.active_until_ms !== undefined && (!Number.isSafeInteger(value.active_until_ms) || value.active_until_ms < 0 || value.active_until_ms > 8640000000000000)) throw new Error('Не удалось проверить срок Premium в заказе.');
  return value;
}
async function run(action) {
  if (busy) return;
  if (Date.now() < retryAt) { message('Подождите минуту после последней попытки и повторите действие.', true); return; }
  busy = true;
  const version = epoch;
  render();
  try { await action(); }
  catch (error) {
    if (version === epoch) message(error instanceof TypeError || error.name === 'AbortError' ? 'Не удалось связаться с сервисом. Проверьте соединение и повторите действие. Если заказ уже создан, повторная попытка использует тот же запрос.' : error.message, true);
  } finally { if (version === epoch) { busy = false; render(); } }
}
function authorization() {
  if (!session || session.expires <= Date.now()) {
    signout(); message('Сессия истекла. Войдите снова.', true);
    throw new Error('Сессия истекла. Войдите снова.');
  }
  return {Authorization:`Bearer ${session.token}`};
}
async function login() {
  if (EMBEDDED) return;
  if (!$('login-form').reportValidity()) return;
  const email = $('email').value.trim();
  let password = $('password').value;
  await run(async () => {
    message('Входим в игровой аккаунт…');
    const config = await api(`${BASE}/config`, {cache:'default'});
    if (typeof config.publishable_key !== 'string' || !config.publishable_key) throw new Error('Авторизация временно недоступна.');
    const auth = await api(`${ORIGIN}/auth/v1/token?grant_type=password`, {method:'POST', headers:{'Content-Type':'application/json', apikey:config.publishable_key}, body:JSON.stringify({email, password})});
    delete auth.refresh_token;
    password = ''; $('password').value = '';
    if (!auth.user?.email_confirmed_at || !UUID.test(auth.user.id) || !auth.user.email || typeof auth.access_token !== 'string' || !auth.access_token || !Number.isFinite(auth.expires_in) || auth.expires_in <= 0) throw new Error('Для входа требуется аккаунт с подтверждённой почтой.');
    session = {token:auth.access_token, email:auth.user.email, id:auth.user.id, expires:Date.now() + auth.expires_in * 1000};
    const data = await api(`${BASE}/account`, {headers:authorization()});
    if (data.status !== 'ok' || !UUID.test(data.account_id) || data.auth_subject !== session.id || typeof data.checkout_enabled !== 'boolean') throw new Error('Не удалось подтвердить игровой аккаунт. Выйдите и войдите снова.');
    if (data.product !== null && (!data.product || data.product.product_id !== PRODUCT || data.product.currency !== 'RUB' || !/^[1-9][0-9]{0,12}$/.test(data.product.amount_minor) || typeof data.product.amount_minor !== 'string')) throw new Error('Не удалось проверить стоимость Premium. Выйдите и войдите снова.');
    if (data.active_until_ms !== undefined && (!Number.isSafeInteger(data.active_until_ms) || data.active_until_ms < 0 || data.active_until_ms > 8640000000000000)) throw new Error('Не удалось проверить срок Premium. Выйдите и войдите снова.');
    account = data;
    order = data.order ? validateOrder(data.order) : null;
    message('Вход выполнен. Проверьте аккаунт перед созданием заказа.');
  });
  password = ''; $('password').value = '';
}
$('login-form').addEventListener('submit', event => { event.preventDefault(); login(); });
$('login').addEventListener('click', login);
$('login-form').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); login(); } });
$('signout').addEventListener('click', () => { signout(); message('Вы вышли из аккаунта.'); $('email').focus(); });
$('buy').addEventListener('click', () => run(async () => {
  if (!account?.checkout_enabled || !account.product || premiumActive() || order) return;
  const headers = authorization();
  requestId ||= crypto.randomUUID();
  message('Создаём заказ…');
  const data = await api(`${BASE}/orders`, {method:'POST', headers:{...headers, 'Content-Type':'application/json'}, body:JSON.stringify({request_id:requestId, product_id:PRODUCT})});
  if (data.status !== 'ok') throw new Error('Не удалось подтвердить создание заказа. Повторите действие.');
  order = validateOrder(data.order);
  if (order.active_until_ms !== undefined) account.active_until_ms = order.active_until_ms;
  message('Заказ создан. Открытие оплаты — отдельное действие.');
}));
$('refresh-order').addEventListener('click', () => run(async () => {
  if (!order) return;
  const expected = order.order_id;
  const data = await api(`${BASE}/orders/${encodeURIComponent(expected)}`, {headers:authorization()});
  if (data.status !== 'ok') throw new Error('Не удалось проверить заказ.');
  const updated = validateOrder(data.order);
  if (updated.order_id !== expected) throw new Error('Сервис вернул другой заказ. Обновление отклонено.');
  order = updated;
  if (updated.active_until_ms !== undefined) account.active_until_ms = updated.active_until_ms;
  message('Статус проверен. Автоматических проверок нет.');
}));
window.addEventListener('pagehide', signout);
render();
if (EMBEDDED) {
  $('email').disabled = $('password').disabled = true;
  message('Для входа откройте магазин в отдельной вкладке браузера. Во встроенном окне вход недоступен.');
}
