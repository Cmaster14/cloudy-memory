'use strict';

// Renderer for the Custom Reminders window. Talks to the app only through the
// small `window.cloudy` bridge from preload.js, and only ever writes text with
// textContent, so a note can never inject markup.

const $ = (id) => document.getElementById(id);
const form = $('new');
const amount = $('amount');
const unit = $('unit');
const note = $('note');
const errorEl = $('error');

let current = { pending: [], fired: [] };

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "in 25 minutes", "in 2 hours 5 minutes", "in 3 days", "due now". */
function relative(ms) {
  if (ms <= 30 * 1000) return 'due now';
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return `in ${plural(totalMin, 'minute')}`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) return mins ? `in ${plural(hours, 'hour')} ${plural(mins, 'minute')}` : `in ${plural(hours, 'hour')}`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `in ${plural(days, 'day')} ${plural(remHours, 'hour')}` : `in ${plural(days, 'day')}`;
}

function absolute(ts) {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today at ${time}` : `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })} at ${time}`;
}

function buildItem(reminder, { isDue }) {
  const li = document.createElement('li');
  li.className = `item${isDue ? ' due' : ''}`;

  const text = document.createElement('div');
  text.className = `text${reminder.note ? '' : ' none'}`;
  text.textContent = reminder.note || 'No note';

  const when = document.createElement('p');
  when.className = 'when';
  when.textContent = isDue ? `Was due ${absolute(reminder.dueAt)}` : `${relative(reminder.dueAt - Date.now())}, ${absolute(reminder.dueAt)}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = isDue ? 'Dismiss' : 'Cancel';
  button.setAttribute('aria-label', `${isDue ? 'Dismiss' : 'Cancel'} reminder: ${reminder.note || 'no note'}`);
  button.addEventListener('click', async () => {
    button.disabled = true;
    await window.cloudy.cancel(reminder.id);
    // The main process also pushes a change event; refresh now so it is instant.
    refresh();
  });

  li.append(text, when, button);
  return li;
}

function render() {
  const due = $('due');
  const waiting = $('waiting');
  due.replaceChildren(...current.fired.map((r) => buildItem(r, { isDue: true })));
  waiting.replaceChildren(...current.pending.map((r) => buildItem(r, { isDue: false })));
  $('due-section').hidden = current.fired.length === 0;
  $('waiting-heading').hidden = current.pending.length === 0;
  $('empty').hidden = current.pending.length + current.fired.length > 0;
}

async function refresh() {
  try {
    current = await window.cloudy.list();
  } catch {
    current = { pending: [], fired: [] };
  }
  render();
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const value = Number(amount.value);
  if (!amount.value.trim() || !Number.isFinite(value) || value <= 0) {
    showError('Enter an amount greater than zero.');
    amount.focus();
    return;
  }
  const result = await window.cloudy.add({ amount: value, unit: unit.value, note: note.value });
  if (!result.ok) {
    showError(result.error || 'Could not set that reminder.');
    return;
  }
  note.value = '';
  note.focus();
  refresh();
});

amount.addEventListener('input', () => showError(''));

window.cloudy.onChanged(refresh);
// Keeps the "in 25 minutes" text honest while the window stays open.
setInterval(render, 15 * 1000);
refresh();
