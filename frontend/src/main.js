const $ = (id) => document.getElementById(id);

async function checkHealth() {
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    $('status').textContent = r.ok ? `OK (db: ${j.db})` : 'KO';
  } catch { $('status').textContent = 'KO'; }
}

async function load() {
  const notes = await (await fetch('/api/notes')).json();
  $('notes').innerHTML = '';
  for (const n of notes) {
    const li = document.createElement('li');
    li.textContent = n.content + ' ';
    const s = document.createElement('small');
    s.textContent = new Date(n.created_at).toLocaleString();
    li.appendChild(s);
    $('notes').appendChild(li);
  }
}

$('add').addEventListener('click', async () => {
  const content = $('content').value.trim();
  if (!content) return;
  await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  $('content').value = '';
  load();
});

checkHealth();
load();
