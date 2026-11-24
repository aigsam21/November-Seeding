
const f = n => n.toLocaleString('ko-KR');
const root = document.querySelector('#report');

const heading = (n, t) => `
<h2><b class="number">${n}</b>${t}</h2>`;

const table = (heads, rows) => `
<div class="scroll">
<table>
<thead>
<tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr>
</thead>
<tbody>
${rows.map(([cls, ...cells]) => `
<tr class="${cls}">
${cells.map(x => `<td>${x}</td>`).join('')}
</tr>`).join('')}
</tbody>
</table>
</div>`;

const card = (a, b, cls = '') => `
<div class="metric ${cls}">
<small>${a}</small>
<strong>${b}</strong>
</div>`;

const owners = ['강미경', '신유', '유연식']
.map(n => DATA.owner.find(r => r[0] === n));

// 01. Общие показатели

root.innerHTML = `
<section>
${heading('01', '11월 콘텐츠 및 크리에이터 현황')}

<div class="metrics summary">
${card('총 콘텐츠', f(DATA.total[1]) + '<sub>개</sub>', 'black')}
${card('총 크리에이터', f(DATA.total[0]) + '<sub>명</sub>')}
</div>

<p class="note">
크리에이터 ID 및 콘텐츠 URL 중복 제거 기준
</p>
</section>

<section class="owner">
${heading('02', '담당자별 11월 KPI')}

${table(
['담당자', '콘텐츠', '크리에이터', '조회수'],
[
...owners.map(([n, c, v]) => ['', n, v + '개', c + '명', '—']),
['total', 'TOTAL', DATA.total[1] + '개', DATA.total[0] + '명', '—']
]
)}
</section>`;

// Сравнение с предыдущими месяцами

const hist = [
[145,145,106,106,153,131,108,98,168,116,117,117],
[119,119,108,107,116,106,106,95,147,99,120,118],
[100,100,101,97,171,134,108,101,99,98,132,131],
[364,364,315,310,440,371,322,294,414,313,369,366]
];

const pairs = a => Array.from(
{length: a.length / 2},
(_, i) => `<strong>${a[2*i]}</strong> <span class="secondary">/ ${a[2*i+1]}</span>`
);

root.innerHTML += `
<section class="history">

<h2>5–11월 콘텐츠 및 크리에이터 현황</h2>

<p class="note">월별 콘텐츠 / 크리에이터 수</p>

${table(
[
'담당자',
...Array.from(
{length: 7},
(_, i) => `${i+5}월<small>콘텐츠 / 크리에이터</small>`
)
],
hist.map((a, i) => [
i === 3 ? 'total' : '',
i === 3 ? 'TOTAL' : owners[i][0],
...pairs([
...a,
...(i === 3
? [DATA.total[1], DATA.total[0]]
: [owners[i][2], owners[i][1]])
])
])
)}

</section>`;

// 03. Аналитика просмотров TikTok

root.innerHTML += `
<section>

${heading('03', '11월 TikTok 조회수 분석')}

<div class="metrics">
${[
'TOTAL VIEWS',
'AVERAGE VIEWS',
'조회수 확인 영상',
...owners.map(r => r[0] + ' · 조회수')
].map(n => card(n, '—')).join('')}
</div>

<p class="note">
11월 원본 파일에 조회수 데이터가 없어 집계 대기 중입니다.
</p>

<h3>조회수 TOP 10</h3>

${table(
['순위', '담당자', '크리에이터', '조회수', '영상'],
[
['', '—', '—', '조회수 데이터 확인 후 업데이트', '—', '—']
]
)}

</section>`;

// 04. Статистика по платформам

const max = Math.max(
...DATA.platform.flatMap(r => r.slice(1))
);

root.innerHTML += `
<section>

${heading('04', '플랫폼별 콘텐츠 현황')}

<div class="chartcard">

<div class="legend">
🔹 크리에이터 수 (상단)　🔵 콘텐츠 수 (하단)
</div>

${DATA.platform.map(([n, c, v]) => `
<div class="item">

<div>${n}</div>

<div class="bars">

<div class="track">
<div class="bar creator" style="width:${c/max*100}%"></div>
</div>

<div class="track">
<div class="bar" style="width:${v/max*100}%"></div>
</div>

</div>

<div class="nums">
${f(c)}<br>${f(v)}
</div>

</div>
`).join('')}

</div>

<p class="note">
플랫폼별 중복 크리에이터 포함 · 기타 링크는 별도 집계
</p>

</section>`;
