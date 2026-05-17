// ===== JK概率 - App JS =====

// ----- API -----
const API_BASE = '';

async function fetchSubmissions() {
  try {
    const res = await fetch(`${API_BASE}/api/submissions`);
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch (e) {
    return [];
  }
}

async function postSubmission(name, probability) {
  const res = await fetch(`${API_BASE}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, probability }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Submit failed');
  return data.data;
}

// Chart.js instances
let pieChartInstance = null;
let lineChartInstance = null;

// ----- DOM refs -----
const form = document.getElementById('jk-form');
const nameInput = document.getElementById('name-input');
const charNum = document.getElementById('char-num');
const probSlider = document.getElementById('prob-slider');
const probNumber = document.getElementById('prob-number');
const submitBtn = document.getElementById('submit-btn');
const toast = document.getElementById('toast');
const dotsContainer = document.getElementById('dots');
const ticksContainer = document.getElementById('ticks');
const emptyState = document.getElementById('empty-state');
const entriesListSection = document.getElementById('entries-list-section');
const entriesGrid = document.getElementById('entries-grid');
const entryCount = document.getElementById('entry-count');
const statsSection = document.getElementById('stats-section');
const calligraphySection = document.getElementById('calligraphy-section');
const calligraphyText = document.getElementById('calligraphy-text');

function initBgVideo() {
  const video = document.getElementById('bg-video');
  const audio = document.getElementById('bg-audio');
  if (!video) return;
  video.addEventListener('canplay', () => {
    video.style.opacity = '1';
  }, { once: true });
  video.play().catch(() => {});
  if (audio) {
    audio.play().catch(() => {});
    const btn = document.createElement('button');
    btn.id = 'audio-toggle';
    btn.innerHTML = '🔇';
    btn.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:10;background:rgba(14,14,22,0.7);border:1px solid rgba(168,180,200,0.2);border-radius:4px;color:rgba(168,180,200,0.6);font-size:1rem;padding:0.4rem 0.6rem;cursor:pointer;backdrop-filter:blur(6px);';
    document.body.appendChild(btn);
    let muted = false;
    audio.muted = false;
    btn.innerHTML = '🔊';
    btn.addEventListener('click', () => {
      muted = !muted;
      audio.muted = muted;
      btn.innerHTML = muted ? '🔇' : '🔊';
    });
  }
}

// ----- Draw ticks -----
function drawTicks() {
  ticksContainer.innerHTML = '';
  for (let i = 0; i <= 100; i += 5) {
    const isMajor = i % 10 === 0;
    const div = document.createElement('div');
    div.className = `tick ${isMajor ? 'major' : 'minor'}`;
    div.style.left = `${i}%`;
    div.innerHTML = `
      <div class="tick-mark"></div>
      ${isMajor ? `<span class="tick-label">${i}%</span>` : ''}
    `;
    ticksContainer.appendChild(div);
  }
}

// ----- Slider: 滑块1-100，数字框独立输入精确值 -----
let currentProb = 50.00;
// 滑块拖动 → 实时更新（1-1000映射到0.1-100.0）
probSlider.addEventListener('input', () => {
  const sliderVal = parseInt(probSlider.value);
  currentProb = sliderVal / 10;
  probNumber.value = (sliderVal / 10).toFixed(1);
  updateSliderVisual(sliderVal);
});

function updateSliderVisual(val) {
  const pct = ((val - 1) / 999) * 100;
  probSlider.style.background = `linear-gradient(90deg, rgba(168, 180, 200, 0.5) 0%, rgba(168, 180, 200, 0.5) ${pct}%, rgba(168, 180, 200, 0.1) ${pct}%, rgba(168, 180, 200, 0.1) 100%)`;
}

// 数字框输入 → 同步滑块
probNumber.addEventListener('input', () => {
  let v = parseFloat(probNumber.value);
  if (isNaN(v)) return;
  v = Math.max(0.1, Math.min(100, v));
  currentProb = v;
  probSlider.value = Math.round(v * 10);
  updateSliderVisual(Math.round(v * 10));
});

probNumber.addEventListener('blur', () => {
  probNumber.value = currentProb.toFixed(1);
});

// ----- Char count -----
nameInput.addEventListener('input', () => {
  charNum.textContent = nameInput.value.length;
});

// ----- Render dots on number line -----
function renderDots(newEntryId = null) {
  dotsContainer.innerHTML = '';

  if (submissions.length === 0) {
    emptyState.classList.add('visible');
    entriesListSection.classList.remove('visible');
    statsSection.classList.remove('visible');
    calligraphySection.classList.remove('visible');
    return;
  }

  emptyState.classList.remove('visible');
  entriesListSection.classList.add('visible');
  statsSection.classList.add('visible');
  entryCount.textContent = submissions.length;
  renderCalligraphy();

  // 按概率分组找偏移
  const probGroups = {};
  submissions.forEach(s => {
    const key = parseFloat(s.probability).toFixed(2);
    if (!probGroups[key]) probGroups[key] = [];
    probGroups[key].push(s);
  });

  submissions.forEach((sub) => {
    const marker = document.createElement('div');
    marker.className = 'dot-marker';
    if (newEntryId === sub.id) marker.classList.add('entering');
    marker.style.left = `${sub.probability}%`;

    // 计算垂直偏移（同概率上下错开）
    const key = parseFloat(sub.probability).toFixed(2);
    const group = probGroups[key];
    const idx = group.indexOf(sub);
    const half = Math.floor(group.length / 2);
    const offsetY = (idx - half) * 26;

    marker.style.top = `calc(50% + ${offsetY}px)`;

    marker.innerHTML = `
      <div class="dot-name-label" title="${escapeHtml(sub.name)}">${escapeHtml(sub.name)}</div>
      <div class="dot-point"></div>
      <div class="dot-prob-label">${parseFloat(sub.probability).toFixed(2)}%</div>
    `;

    dotsContainer.appendChild(marker);
  });

  renderEntries();
  renderCharts();
}

// ----- Entries chips -----
function renderEntries() {
  entriesGrid.innerHTML = '';
  [...submissions].reverse().forEach(sub => {
    const chip = document.createElement('div');
    chip.className = 'entry-chip';
    chip.innerHTML = `<span>${escapeHtml(sub.name)}</span><span class="prob-badge">${parseFloat(sub.probability).toFixed(2)}%</span>`;
    entriesGrid.appendChild(chip);
  });
}

// ----- Charts -----
const PIE_COLORS = [
  'rgba(168, 180, 200, 0.85)',
  'rgba(184, 168, 200, 0.85)',
  'rgba(200, 168, 160, 0.85)',
  'rgba(168, 176, 192, 0.85)',
];

const PIE_LABELS = ['0 ~ 25%', '25 ~ 50%', '50 ~ 75%', '75 ~ 100%'];

function getPieData() {
  const buckets = [0, 0, 0, 0];
  submissions.forEach(s => {
    const p = parseFloat(s.probability);
    if (p < 25) buckets[0]++;
    else if (p < 50) buckets[1]++;
    else if (p < 75) buckets[2]++;
    else buckets[3]++;
  });
  return buckets;
}

function renderCharts() {
  renderPieChart();
  renderLineChart();
}

function renderPieChart() {
  const buckets = getPieData();
  const total = submissions.length;

  // Legend
  const pieLegend = document.getElementById('pie-legend');
  pieLegend.innerHTML = '';
  buckets.forEach((count, i) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${PIE_COLORS[i]}"></span>${PIE_LABELS[i]} (${pct}%)`;
    pieLegend.appendChild(item);
  });

  const data = {
    labels: PIE_LABELS,
    datasets: [{
      data: buckets,
      backgroundColor: PIE_COLORS,
      borderColor: 'rgba(14, 14, 22, 0.8)',
      borderWidth: 1,
      hoverOffset: 8,
    }]
  };

  if (pieChartInstance) pieChartInstance.destroy();

  pieChartInstance = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(14, 14, 22, 0.95)',
          borderColor: 'rgba(168, 180, 200, 0.25)',
          borderWidth: 1,
          titleColor: 'rgba(168, 180, 200, 0.85)',
          bodyColor: 'rgba(106, 110, 120, 0.8)',
          titleFont: { family: "'Noto Serif SC', serif", size: 11 },
          bodyFont: { family: "'Noto Serif SC', serif", size: 11 },
          callbacks: {
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.parsed) / total * 100).toFixed(1) : 0;
              return `  ${ctx.parsed} 人 (${pct}%)`;
            }
          }
        }
      },
      animation: { duration: 600, easing: 'easeOutQuart' }
    }
  });
}

function renderLineChart() {
  const sortedByTime = [...submissions].sort((a, b) => a.createdAt - b.createdAt);
  const labels = sortedByTime.map(s => {
    const d = new Date(s.createdAt);
    const time = `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    return `${s.name}\n${time}`;
  });
  const data = sortedByTime.map(s => parseFloat(s.probability));

  const lineData = {
    labels,
    datasets: [{
      label: '概率',
      data,
      borderColor: 'rgba(168, 180, 200, 0.8)',
      backgroundColor: 'rgba(168, 180, 200, 0.08)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(168, 180, 200, 0.9)',
      pointBorderColor: '#0a0a0f',
      pointBorderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      fill: true,
      tension: 0.35,
    }]
  };

  if (lineChartInstance) lineChartInstance.destroy();

  lineChartInstance = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: lineData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(168, 180, 200, 0.06)' },
          ticks: {
            color: 'rgba(106, 110, 120, 0.7)',
            font: { family: "'Noto Serif SC', serif", size: 9 },
            maxRotation: 0,
            callback: function(val, idx) {
              const label = this.getLabelForValue(val);
              if (typeof label === 'string' && label.includes('\n')) {
                return label.split('\n')[0];
              }
              return label;
            }
          }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(168, 180, 200, 0.06)' },
          ticks: {
            color: 'rgba(106, 110, 120, 0.7)',
            font: { family: "'Noto Serif SC', serif", size: 9 },
            callback: v => v + '%'
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(14, 14, 22, 0.95)',
          borderColor: 'rgba(168, 180, 200, 0.25)',
          borderWidth: 1,
          titleColor: 'rgba(168, 180, 200, 0.85)',
          bodyColor: 'rgba(106, 110, 120, 0.8)',
          titleFont: { family: "'Noto Serif SC', serif", size: 11 },
          bodyFont: { family: "'Noto Serif SC', serif", size: 11 },
          callbacks: {
            title: function(ctx) {
              const label = ctx[0].label;
              if (typeof label === 'string' && label.includes('\n')) {
                return label.replace('\n', ' ');
              }
              return label;
            },
            label: (ctx) => `  ${ctx.parsed.y}%`
          }
        }
      },
      animation: { duration: 600, easing: 'easeOutQuart' }
    }
  });
}

// ----- Form submit -----
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }

  // 彩蛋：输入 zcy 跳转 B站空间
  if (name.toLowerCase() === 'zcy') {
    window.location.href = 'https://space.bilibili.com/3493263354890441';
    return;
  }

  const probVal = currentProb;

  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

  try {
    const newSub = await postSubmission(name, probVal.toFixed(1));
    submissions.push(newSub);
    renderDots(newSub.id);
    renderCharts();
  } catch (e) {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
    alert('提交失败，请重试');
    return;
  }

  // Reset form
  nameInput.value = '';
  probSlider.value = 500;
  probNumber.value = '50.0';
  currentProb = 50.00;
  updateSliderVisual(500);
  charNum.textContent = '0';

  submitBtn.classList.remove('loading');
  submitBtn.disabled = false;

  showToast();
});

// ----- Toast -----
function showToast() {
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ----- Utils -----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ----- Calligraphy -----
const CALLIGRAPHY_LINES = [
  '唉，我不知道为什么我会在这个年纪叹气',
  '我时常觉得我不行了，时常觉得自己做不到',
  '时常觉得自己干什么都干到一半就放弃',
  '曾经那个"跑得快"的人也成了过去式。',
  '感叹曾经的自己，羡慕曾经的自己。',
  '如果当时再努力一点，再爆发一点，再快一点',
  '400米是不是也可以跑进1分钟',
  '是不是也可以为班级拿到运动会奖牌',
  '是不是也可以成为别人眼里的"快"。',
  '我想回到过去，但80天不到的时间又不允许',
  '我要不要尝试，要不要去挑战呢',
  '感慨曾经，恨视如今，迷茫未来',
  '是我对"自我"太执着了吧…',
];

function renderCalligraphy() {
  if (submissions.length === 0) {
    calligraphySection.classList.remove('visible');
    return;
  }
  calligraphySection.classList.add('visible');
  calligraphyText.innerHTML = CALLIGRAPHY_LINES.map(l => `<span class="line">${l}</span>`).join('');
}

// ----- Init -----
async function init() {
  initBgVideo();
  drawTicks();
  updateSliderVisual(500);
  
  // Load submissions from server
  submissions = await fetchSubmissions();
  renderDots();
  renderCalligraphy();
}

if (typeof Chart !== 'undefined') {
  init();
} else {
  window.addEventListener('DOMContentLoaded', init);
}