import { fetchIncidents, ack } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');

// id -> incident, merged across polls so new incidents are added and nothing is lost.
const incidents = new Map();
// id -> ackedAt, kept here so a re-render keeps the acked mark.
const acked = new Map();
// id of the incident waiting for confirmation, kept here so a re-render keeps the confirm.
let pendingAck = null;
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

// id -> row element. Rows are updated in place and new rows are inserted; existing rows are never rebuilt,
// so a row under the pointer stays the same element while the list changes.
const rowEls = new Map();

function actionFor(i) {
  if (acked.has(i.id)) return { key: 'acked', html: `<span data-testid="acked" class="acked">acked</span>` };
  if (pendingAck === i.id) {
    return {
      key: 'confirm',
      html: `<span class="confirm">
          <span data-testid="confirm">Ack ${escapeHtml(i.id)}?</span>
          <button data-testid="confirm-ack" data-id="${escapeHtml(i.id)}" type="button">Confirm</button>
          <button data-testid="confirm-cancel" type="button">Cancel</button>
        </span>`,
    };
  }
  return { key: 'ack', html: `<button data-testid="ack" data-id="${escapeHtml(i.id)}" type="button">Ack</button>` };
}

function createRow(i) {
  const el = document.createElement('li');
  el.dataset.testid = 'incident-row';
  el.dataset.id = i.id;
  el.className = `row ${i.severity}`;
  el.innerHTML = `
    <span class="id">${escapeHtml(i.id)}</span>
    <span class="sev">${escapeHtml(i.severity)}</span>
    <span class="what">${escapeHtml(i.service)} · ${escapeHtml(i.region)} · ${escapeHtml(i.summary)}</span>
    <time datetime="${escapeHtml(i.openedAt)}">${escapeHtml(formatTime(i.openedAt))}</time>
    <span class="action"></span>`;
  return el;
}

function render() {
  const rows = [...incidents.values()].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  rows.forEach((i, index) => {
    let el = rowEls.get(i.id);
    if (!el) {
      el = createRow(i);
      rowEls.set(i.id, el);
      list.insertBefore(el, list.children[index] || null);
    }
    const action = actionFor(i);
    const actionEl = el.querySelector('.action');
    if (actionEl.dataset.key !== action.key) {
      actionEl.dataset.key = action.key;
      actionEl.innerHTML = action.html;
    }
  });
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
  // Ack opens the confirm for the row that was clicked; nothing is sent yet.
  const ackButton = event.target.closest('[data-testid="ack"]');
  if (ackButton) {
    pendingAck = ackButton.dataset.id;
    render();
    return;
  }
  if (event.target.closest('[data-testid="confirm-cancel"]')) {
    pendingAck = null;
    render();
    return;
  }
  // Confirm acks the id named in the confirm, not whatever row is under the pointer now.
  const confirmButton = event.target.closest('[data-testid="confirm-ack"]');
  if (!confirmButton) return;
  const id = confirmButton.dataset.id;
  confirmButton.disabled = true;
  try {
    const reply = await ack(id);
    acked.set(id, reply.ackedAt);
    pendingAck = null;
    render();
  } catch (err) {
    confirmButton.disabled = false;
    console.error(err);
  }
});

await refresh();
setInterval(refresh, 2000);
