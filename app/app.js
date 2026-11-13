import { fetchIncidents, ack } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');

// id -> incident, merged across polls so new incidents are added and nothing is lost.
const incidents = new Map();
// id -> ackedAt, kept here so a re-render keeps the acked mark.
const acked = new Map();
let loaded = false;
let polling = false;

// Day before month for EU locales (dd/mm); everything else uses the viewer's own locale.
const EU_LANG = /^(de|fr|es|it|pl|nl|pt|cs|sk|sv|da|fi|el|hu|ro|bg|hr|sl|et|lv|lt|ga|mt)\b/i;
const euFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
const localFormat = new Intl.DateTimeFormat(navigator.language, { dateStyle: 'short', timeStyle: 'short' });

function formatTime(iso) {
  const d = new Date(iso);
  return EU_LANG.test(navigator.language) ? euFormat.format(d) : localFormat.format(d);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function render() {
  const rows = [...incidents.values()].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  list.innerHTML = rows
    .map((i) => {
      const action = acked.has(i.id)
        ? `<span data-testid="acked" class="acked">acked</span>`
        : `<button data-testid="ack" data-id="${escapeHtml(i.id)}" type="button">Ack</button>`;
      return `<li data-testid="incident-row" data-id="${escapeHtml(i.id)}" class="row ${escapeHtml(i.severity)}">
        <span class="id">${escapeHtml(i.id)}</span>
        <span class="sev">${escapeHtml(i.severity)}</span>
        <span class="what">${escapeHtml(i.service)} · ${escapeHtml(i.region)} · ${escapeHtml(i.summary)}</span>
        <time datetime="${escapeHtml(i.openedAt)}">${escapeHtml(formatTime(i.openedAt))}</time>
        ${action}
      </li>`;
    })
    .join('');
  empty.hidden = rows.length > 0;
}

async function refresh() {
  if (polling) return;
  polling = true;
  try {
    const page = await fetchIncidents();
    for (const i of page.incidents) incidents.set(i.id, i);
    if (!loaded) {
      loaded = true;
      loader.remove();
    }
    render();
  } catch (err) {
    console.error(err);
  } finally {
    polling = false;
  }
}

list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-testid="ack"]');
  if (!button) return;
  const id = button.dataset.id;
  button.disabled = true;
  try {
    const reply = await ack(id);
    acked.set(id, reply.ackedAt);
    render();
  } catch (err) {
    button.disabled = false;
    console.error(err);
  }
});

await refresh();
setInterval(refresh, 2000);
