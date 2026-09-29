for (const button of document.querySelectorAll('[data-tab]')) {
  button.addEventListener('click', () => {
    for (const tab of document.querySelectorAll('[data-tab]')) {
      const active = tab === button;
      tab.classList.toggle('active', active);
      if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    }
    for (const panel of document.querySelectorAll('.admin-panel')) panel.hidden = panel.id !== button.dataset.tab;
  });
}

async function refresh() {
  const connected = document.querySelector('#aConnection');
  const capacity = document.querySelector('#aCapacity');
  const queue = document.querySelector('#aQueue');
  const badge = document.querySelector('#aBadge');
  try {
    const response = await fetch('/api/qa/health');
    const health = await response.json();
    if (!response.ok || !health.connected) throw new Error('offline');
    connected.textContent = health.ready ? (health.lastRealSuccessAt ? '真实问答已验证' : '可接收问答，待真实验证') : health.authenticated ? '当前容量为零' : '等待凭证';
    badge.textContent = health.ready ? '知识库 Agent 可用' : '待检查';
    badge.classList.toggle('live', health.ready);
    const schedulable = health.capacity ?? null;
    capacity.textContent = schedulable == null ? '待核对' : String(schedulable);
    const waiting = health.queued ?? null;
    queue.textContent = waiting == null ? '待核对' : String(waiting);
  } catch {
    connected.textContent = '不可连接'; badge.textContent = '不可连接'; badge.classList.remove('live');
    capacity.textContent = '—'; queue.textContent = '—';
  }
}

void refresh();
setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
