const $ = (selector) => document.querySelector(selector);
const stages = ['Idea', 'Planning', 'Ready to shoot', 'Filming', 'Editing', 'Done'];
const priorityOrder = { High: 0, Normal: 1, Low: 2 };
const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = value => JSON.parse(JSON.stringify(value));
let projects = [], view = 'board', section = 'all', draft = null, original = '', busy = false, uploading = false, loading = false, toastTimer;
let accessKey = sessionStorage.getItem('film-board-key') || '';

function message(text) {
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function errorIn(selector, text = '') {
  $(selector).textContent = text;
  $(selector).hidden = !text;
}

async function api(path = '', method = 'GET', body) {
  const response = await fetch('/api/projects' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(accessKey ? { Authorization: 'Bearer ' + accessKey } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !$('#access-dialog').open) $('#access-dialog').showModal();
    throw new Error(result.error || 'Could not save. Please try again.');
  }
  return result;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const upcoming = p => p.shootDate && p.shootDate >= today() && p.stage !== 'Done';
const prettyDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date yet';

async function refresh() {
  if (loading || busy) return;
  loading = true;
  try {
    const data = await api();
    const changed = JSON.stringify(data.projects) !== JSON.stringify(projects);
    projects = data.projects;
    $('#connection').textContent = 'Board connected';
    $('#refresh-note').textContent = 'Shared board · refreshes every 8 seconds';
    errorIn('#load-error');
    if (changed || !$('#content').children.length) render();
  } catch (error) {
    $('#connection').textContent = 'Connection needed';
    errorIn('#load-error', error.message + ' Your unsaved edits are still here.');
  } finally { loading = false; }
}

function filteredProjects() {
  const query = $('#search').value.toLowerCase().trim();
  const selectedStage = $('#stage-filter').value, priority = $('#priority-filter').value;
  return projects.filter(p => (!query || [p.title, p.summary, p.owner, p.notes].some(t => t.toLowerCase().includes(query)))
    && (!selectedStage || selectedStage === p.stage) && (!priority || priority === p.priority)
    && (section !== 'upcoming' || upcoming(p)) && (section !== 'done' || p.stage === 'Done'))
    .sort((a, b) => {
      const kind = $('#sort').value;
      if (kind === 'title') return a.title.localeCompare(b.title);
      if (kind === 'date') return (a.shootDate || '9999').localeCompare(b.shootDate || '9999') || a.title.localeCompare(b.title);
      if (kind === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority] || b.updatedAt.localeCompare(a.updatedAt);
      if (kind === 'stage') return stages.indexOf(a.stage) - stages.indexOf(b.stage) || a.title.localeCompare(b.title);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

function card(p) {
  const initials = (p.owner || '?').split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const checks = p.checklist.filter(i => i.done).length;
  return `<article class="card" tabindex="0" role="button" data-open="${p.id}" aria-label="Open ${escape(p.title)}">
    ${p.images.length ? `<img class="card-image" src="${escape(p.images[0].url)}" alt="${escape(p.images[0].label || p.title + ' reference')}" loading="lazy" referrerpolicy="no-referrer">` : ''}
    <div class="card-main"><div class="card-top"><span class="priority p-${p.priority.toLowerCase()}">${p.priority === 'High' ? '↗ ' : ''}${p.priority} priority</span><span aria-hidden="true">↗</span></div>
    <h3>${escape(p.title)}</h3>${p.summary ? `<p>${escape(p.summary)}</p>` : '<p>Add a pitch. Make it happen.</p>'}
    <div class="card-meta"><span>☑ ${checks}/${p.checklist.length}</span><span>↗ ${p.links.length} links</span>${p.images.length ? `<span>▧ ${p.images.length}</span>` : ''}</div>
    <div class="card-bottom"><span class="owner"><span class="avatar">${escape(initials)}</span><span class="owner-name">${escape(p.owner || 'Unassigned')}</span></span><span class="date">${prettyDate(p.shootDate)}</span></div></div></article>`;
}

function render() {
  const list = filteredProjects();
  $('#total').textContent = projects.length;
  $('#production').textContent = projects.filter(p => !['Idea', 'Done'].includes(p.stage)).length;
  $('#shoots').textContent = projects.filter(upcoming).length;
  $('#done').textContent = projects.filter(p => p.stage === 'Done').length;
  $('#nav-count').textContent = projects.length;
  $('#view-title').innerHTML = `${section === 'upcoming' ? 'Upcoming shoots' : section === 'done' ? 'Completed productions' : 'All productions'} <span id="result-count">${list.length}</span>`;
  for (const [id, value] of [['all-projects', 'all'], ['upcoming', 'upcoming'], ['completed', 'done']]) $('#' + id).classList.toggle('active', section === value);
  for (const kind of ['board', 'table']) {
    $('#' + kind + '-view').classList.toggle('selected', view === kind);
    $('#' + kind + '-view').setAttribute('aria-pressed', String(view === kind));
  }
  if (!projects.length) {
    $('#content').innerHTML = `<div class="empty"><div class="empty-symbol">▰ / ▰ / ▰</div><h3>A blank slate. A good place to start.</h3><p>Capture an idea, bring in your references, and take it all the way to the final cut.<br>Your crew's next production starts with one video.</p><div class="empty-actions"><button class="primary" data-new="Idea">+ Create your first video</button><button id="sample-projects">Try three example videos</button></div></div>`;
    return;
  }
  if (!list.length) {
    $('#content').innerHTML = '<div class="empty"><h3>No videos here yet.</h3><p>Try another search or filter, or add a new video.</p><button id="clear-filters">Show all productions</button></div>';
    return;
  }
  if (view === 'board') {
    const visibleStages = $('#stage-filter').value ? [$('#stage-filter').value] : section === 'done' ? ['Done'] : stages;
    $('#content').innerHTML = `<div class="board">${visibleStages.map(stage => {
      const items = list.filter(p => p.stage === stage);
      return `<section class="column s${stages.indexOf(stage)}"><div class="column-heading"><span class="stage-dot"></span>${stage}<span class="column-count">${items.length}</span><button data-new="${stage}" aria-label="Add video to ${stage}">+</button></div>${items.map(card).join('') || '<div class="column-empty">Room for the next idea</div>'}<button class="add-card" data-new="${stage}">+ Add video</button></section>`;
    }).join('')}</div>`;
  } else {
    $('#content').innerHTML = `<div class="table-wrap"><table><thead><tr><th>VIDEO</th><th>STAGE</th><th>PRIORITY</th><th>OWNER</th><th>SHOOT DATE</th><th>CHECKLIST</th></tr></thead><tbody>${list.map(p => `<tr><td><button data-open="${p.id}">${escape(p.title)}</button><small>${escape(p.summary.slice(0, 85))}</small></td><td><span class="stage-label s${stages.indexOf(p.stage)}"><span class="stage-dot"></span>${p.stage}</span></td><td><span class="priority p-${p.priority.toLowerCase()}">${p.priority}</span></td><td>${escape(p.owner || 'Unassigned')}</td><td>${prettyDate(p.shootDate)}</td><td>${p.checklist.filter(c => c.done).length} / ${p.checklist.length}</td></tr>`).join('')}</tbody></table></div>`;
  }
}

function readForm() {
  for (const key of ['title', 'summary', 'stage', 'priority', 'owner', 'shootDate', 'notes']) draft[key] = $('#project-form').elements.namedItem(key).value;
  return draft;
}

function openEditor(id, stage = 'Idea') {
  const found = projects.find(p => p.id === id);
  draft = found ? clone(found) : { title: '', summary: '', stage, priority: 'Normal', owner: '', shootDate: '', notes: '', links: [], images: [], checklist: [] };
  $('#project-form').reset();
  for (const key of ['title', 'summary', 'stage', 'priority', 'owner', 'shootDate', 'notes']) $('#project-form').elements.namedItem(key).value = draft[key];
  original = JSON.stringify(draft);
  $('#editor-title').textContent = found ? 'The production notebook' : 'Start something good';
  $('#delete-project').hidden = !found;
  errorIn('#editor-error');
  renderDetails();
  $('#editor').showModal();
  $('#project-form').elements.namedItem('title').focus();
}

function renderDetails() {
  $('#check-progress').textContent = `${draft.checklist.filter(c => c.done).length}/${draft.checklist.length} complete`;
  $('#checklist-items').innerHTML = draft.checklist.map((item, i) => `<div class="detail-row"><label class="${item.done ? 'checked' : ''}"><input type="checkbox" data-check="${i}" ${item.done ? 'checked' : ''}>${escape(item.label)}</label><button class="remove" type="button" data-remove="checklist" data-index="${i}" aria-label="Remove checklist item">×</button></div>`).join('');
  $('#link-items').innerHTML = draft.links.map((item, i) => `<div class="detail-row"><span>↗</span><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.label || item.url)}</a><button class="remove" type="button" data-remove="links" data-index="${i}" aria-label="Remove reference link">×</button></div>`).join('');
  $('#image-items').innerHTML = draft.images.map((item, i) => `<div class="image-tile"><img src="${escape(item.url)}" alt="${escape(item.label || 'Visual reference')}" referrerpolicy="no-referrer"><button class="remove" type="button" data-remove="images" data-index="${i}" aria-label="Remove reference image">×</button></div>`).join('');
}

function closeEditor() {
  if (busy || uploading) return;
  const pending = ['#check-label', '#link-label', '#link-url', '#image-url'].some(s => $(s).value.trim());
  if ((JSON.stringify(readForm()) !== original || pending) && !confirm('Discard your unsaved changes?')) return;
  $('#editor').close();
}

function validUrl(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !!u.hostname; } catch { return false; }
}

function addLink() {
  const url = $('#link-url').value.trim();
  if (!validUrl(url)) { errorIn('#editor-error', 'Use a complete reference URL starting with https:// or http://.'); return false; }
  if (draft.links.length >= 40) { errorIn('#editor-error', 'Each video can have up to 40 links.'); return false; }
  draft.links.push({ label: $('#link-label').value.trim(), url });
  $('#link-url').value = $('#link-label').value = '';
  renderDetails(); errorIn('#editor-error'); return true;
}

function addCheck() {
  const label = $('#check-label').value.trim();
  if (!label) return true;
  if (draft.checklist.length >= 100) { errorIn('#editor-error', 'Each video can have up to 100 checklist items.'); return false; }
  draft.checklist.push({ label, done: false });
  $('#check-label').value = ''; renderDetails(); return true;
}

function addImageUrl() {
  const url = $('#image-url').value.trim();
  if (!validUrl(url)) { errorIn('#editor-error', 'Use a complete image URL starting with https:// or http://.'); return false; }
  if (draft.images.length >= 12) { errorIn('#editor-error', 'Each video can have up to 12 images.'); return false; }
  draft.images.push({ url, label: 'Image reference' });
  $('#image-url').value = ''; renderDetails(); errorIn('#editor-error'); return true;
}

async function resizeImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP, or GIF image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let url = canvas.toDataURL('image/jpeg', .8);
    if (url.length > 1100000) url = canvas.toDataURL('image/jpeg', .5);
    if (url.length > 1100000) throw new Error('This image is too detailed to fit. Try a smaller image.');
    return { label: file.name.slice(0, 500), url };
  } finally { bitmap.close(); }
}

$('#image-upload').addEventListener('change', async event => {
  if (uploading) return;
  const files = [...event.target.files];
  if (draft.images.length + files.length > 12) { errorIn('#editor-error', 'Each video can have up to 12 images.'); event.target.value = ''; return; }
  uploading = true; $('#save').disabled = true; $('#save').textContent = 'Preparing images…';
  try {
    const images = [];
    for (const file of files) images.push(await resizeImage(file));
    draft.images.push(...images); renderDetails(); errorIn('#editor-error');
  } catch (error) { errorIn('#editor-error', error.message); }
  finally { uploading = false; $('#save').disabled = false; $('#save').textContent = 'Save video'; event.target.value = ''; }
});

$('#project-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || uploading) return;
  errorIn('#editor-error');
  if (!addCheck()) return;
  if (($('#link-url').value.trim() || $('#link-label').value.trim()) && !addLink()) return;
  if ($('#image-url').value.trim() && !addImageUrl()) return;
  busy = true; $('#save').disabled = true; $('#save').textContent = 'Saving…';
  try {
    readForm();
    const saved = await api(draft.id ? '/' + draft.id : '', draft.id ? 'PUT' : 'POST', draft);
    projects = projects.filter(p => p.id !== saved.id).concat(saved);
    $('#editor').close(); render(); message('Video saved to the board.');
  } catch (error) { errorIn('#editor-error', error.message); }
  finally { busy = false; $('#save').disabled = false; $('#save').textContent = 'Save video'; await refresh(); }
});

$('#delete-project').addEventListener('click', async () => {
  if (busy || uploading || !confirm(`Delete “${draft.title}” and its notes, links, and images? This cannot be undone.`)) return;
  busy = true;
  try {
    await api('/' + draft.id, 'DELETE', { revision: draft.revision });
    projects = projects.filter(p => p.id !== draft.id);
    $('#editor').close(); render(); message('Video deleted.');
  } catch (error) { errorIn('#editor-error', error.message); }
  finally { busy = false; await refresh(); }
});

$('#editor').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
$('#close-editor').addEventListener('click', closeEditor);
$('#add-check').addEventListener('click', addCheck);
$('#add-link').addEventListener('click', addLink);
$('#add-image').addEventListener('click', addImageUrl);
for (const [selector, action] of [['#check-label', addCheck], ['#link-url', addLink], ['#link-label', addLink], ['#image-url', addImageUrl]]) $(selector).addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); action(); } });
$('#editor').addEventListener('click', event => {
  const button = event.target.closest('[data-remove]');
  if (button && !busy) { draft[button.dataset.remove].splice(Number(button.dataset.index), 1); renderDetails(); }
});
$('#editor').addEventListener('change', event => {
  if (event.target.matches('[data-check]')) { draft.checklist[Number(event.target.dataset.check)].done = event.target.checked; renderDetails(); }
});

for (const selector of ['#stage-filter', '#editor-stage']) $(selector).insertAdjacentHTML('beforeend', stages.map(s => `<option>${s}</option>`).join(''));
for (const selector of ['#search', '#stage-filter', '#priority-filter', '#sort']) $(selector).addEventListener('input', render);
for (const kind of ['board', 'table']) $('#' + kind + '-view').addEventListener('click', () => { view = kind; render(); });
for (const [id, value] of [['all-projects', 'all'], ['upcoming', 'upcoming'], ['completed', 'done']]) $('#' + id).addEventListener('click', () => {
  section = value; $('#stage-filter').value = ''; $('#priority-filter').value = ''; $('#search').value = '';
  if (value === 'upcoming') $('#sort').value = 'date';
  render();
});
$('#new-project').addEventListener('click', () => openEditor());
$('#content').addEventListener('click', async event => {
  const open = event.target.closest('[data-open]'), add = event.target.closest('[data-new]');
  if (open) openEditor(open.dataset.open);
  if (add) openEditor(null, add.dataset.new);
  if (event.target.closest('#clear-filters')) $('#all-projects').click();
  if (event.target.closest('#sample-projects')) await addExamples();
});
$('#content').addEventListener('keydown', event => {
  const card = event.target.closest('.card');
  if (card && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openEditor(card.dataset.open); }
});

async function addExamples() {
  if (busy) return;
  busy = true; $('#sample-projects').disabled = true;
  try {
    for (const example of [
      { title: 'A city before it wakes', summary: 'A short portrait of quiet streets and the people who start early.', stage: 'Idea', priority: 'Normal', notes: 'Example video. Replace these notes with your treatment.\n\nVisual approach: natural light, patient framing, close-up details.', checklist: [{ label: 'Find three locations', done: false }] },
      { title: 'One room, one conversation', summary: 'An intimate interview about making things with your friends.', stage: 'Planning', priority: 'High', notes: 'Example video.\n\nA simple two-camera interview. Leave room for a few unscripted moments.', checklist: [{ label: 'Write interview questions', done: true }, { label: 'Confirm location and sound kit', done: false }] },
      { title: 'The 60-second challenge', summary: 'Tell a complete story in a minute. One location. No dialogue.', stage: 'Editing', priority: 'Low', notes: 'Example video.\n\nTry three different opening shots before locking the cut.', checklist: [{ label: 'Shoot the sequence', done: true }, { label: 'Assemble a first cut', done: true }, { label: 'Review together', done: false }] },
    ]) await api('', 'POST', example);
    message('Example videos added. Edit or delete them as you like.');
  } catch (error) { errorIn('#load-error', error.message); }
  finally { busy = false; await refresh(); }
}

async function exportBoard() {
  try {
    const latest = await api();
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...latest }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `film-board-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('Board backup downloaded.');
  } catch (error) { errorIn('#load-error', error.message); }
}
$('#export').addEventListener('click', exportBoard);
$('#export-mobile').addEventListener('click', exportBoard);

$('#access-form').addEventListener('submit', async event => {
  event.preventDefault(); accessKey = $('#access-key').value;
  try {
    await api(); sessionStorage.setItem('film-board-key', accessKey); $('#access-dialog').close(); errorIn('#access-error'); await refresh();
  } catch (error) { errorIn('#access-error', error.message); }
});
window.addEventListener('beforeunload', event => {
  if ($('#editor').open && (uploading || busy || JSON.stringify(readForm()) !== original)) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(() => { if (!document.hidden && !$('#access-dialog').open) refresh(); }, 8000);
await refresh();
