
const f = n => Number(n || 0).toLocaleString('ko-KR');

const esc = x => String(x ?? '').replace(
    /[&<>"']/g,
    c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[c]
);

const root = document.querySelector('#report');

const heading = (n, t) => `
<h2><b class="number">${n}</b>${t}</h2>`;

const card = (a, b, cls = '') => `
<div class="metric ${cls}">
    <small>${a}</small>
    <strong>${b}</strong>
</div>`;

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

const owners = ['강미경', '신유', '유연식']
    .map(n =>
        (DATA.owner || []).find(r => r[0] === n)
        || [n, 0, 0]
    );

const total = DATA.total || [0, 0];

const levels = Array.isArray(DATA.level)
    ? DATA.level.filter(r => Number(r[1]) > 0)
    : [];

const venn = DATA.venn || {};

const platformCount = name =>
    (DATA.platform || []).find(r => r[0] === name)?.[2] || 0;

const hist = [
    [145,145,106,106,153,131,108,98,168,116,117,117],
    [119,119,108,107,116,106,106,95,147,99,120,118],
    [100,100,101,97,171,134,108,101,99,98,132,131],
    [364,364,315,310,440,371,322,294,414,313,369,366]
];

const pairs = a => Array.from(
    {length: a.length / 2},
    (_, i) => `
    <strong>${a[2*i]}</strong>
    <span class="secondary">/ ${a[2*i+1]}</span>`
);

// 01. Общие показатели

root.innerHTML = `
<section>

${heading('01', '11월 콘텐츠 및 크리에이터 현황')}

<div class="metrics summary">
    ${card('총 콘텐츠', f(total[1]) + '<sub>개</sub>', 'black')}
    ${card('총 크리에이터', f(total[0]) + '<sub>명</sub>')}
</div>

<p class="note">
크리에이터 ID 및 콘텐츠 URL 중복 제거 기준
</p>

</section>

<section class="owner" id="owner"></section>

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
                ? [total[1], total[0]]
                : [owners[i][2], owners[i][1]])
        ])
    ])
)}

</section>

<section id="views"></section>

<section>

${heading('04', '콘텐츠가 게시된 플랫폼')}

<div class="chartcard">

<svg
    class="venn"
    viewBox="0 0 560 310"
    style="width:100%;max-width:700px;display:block;margin:auto"
    role="img"
    aria-label="플랫폼별 크리에이터 현황">

    <circle
        cx="205" cy="150" r="140"
        fill="#376ab2"
        fill-opacity=".18"
        stroke="#376ab2"/>

    <circle
        cx="355" cy="150" r="105"
        fill="#cf6898"
        fill-opacity=".20"
        stroke="#cf6898"/>

    <circle
        cx="285" cy="190" r="30"
        fill="#aaa"
        fill-opacity=".35"
        stroke="#888"/>

    <g text-anchor="middle" fill="currentColor">

        <text x="155" y="105" font-size="17">
            TikTok
        </text>

        <text x="155" y="140" font-size="34" font-weight="bold">
            ${venn.tiktokOnly ?? '—'}
        </text>

        <text x="285" y="100" font-size="16">
            Both
        </text>

        <text x="285" y="135" font-size="30" font-weight="bold">
            ${venn.bothOnly ?? '—'}
        </text>

        <text x="405" y="105" font-size="17">
            Instagram
        </text>

        <text x="405" y="140" font-size="34" font-weight="bold">
            ${venn.instagramOnly ?? '—'}
        </text>

        <text x="285" y="184" font-size="12">
            기타
        </text>

        <text x="285" y="205" font-size="21" font-weight="bold">
            ${venn.allThree ?? '—'}
        </text>

        <text x="285" y="238" font-size="11">
            YouTube · Facebook
        </text>

    </g>

</svg>

<div class="metrics platform-counts">

    ${card('TikTok · 콘텐츠', f(platformCount('TikTok')) + '개')}

    ${card('Instagram · 콘텐츠', f(platformCount('Instagram')) + '개')}

    ${card('기타 · 콘텐츠', f(platformCount('기타')) + '개')}

</div>

</div>

</section>

<section>

${heading('05', '크리에이터 Level별 현황')}

<div class="chartcard">

${levels.length
    ? levels.map(([n, c]) => {

        const percent = total[0]
            ? c / total[0] * 100
            : 0;

        return `
        <div class="item level"
             style="grid-template-columns:100px 1fr 110px">

            <div>${esc(n)}</div>

            <div class="track">
                <div class="bar"
                     style="width:${percent}%">
                </div>
            </div>

            <div class="nums">
                ${f(c)}명 · ${percent.toFixed(1)}%
            </div>

        </div>`;
    }).join('')
    : '<p class="note">크리에이터 레벨 데이터 집계 대기 중</p>'
}

</div>

</section>`;

// 02 и 03. KPI и просмотры

function render(groups) {

    const videos = groups.flatMap(g => g.videos || []);

    const sum = a => a.reduce(
        (s, v) => s + v.views,
        0
    );

    const value = a => a.length
        ? f(sum(a))
        : '—';

    const own = n => videos.filter(v => v.owner === n);

    document.querySelector('#owner').innerHTML = `

    ${heading('02', '담당자별 11월 KPI')}

    ${table(
        ['담당자', '콘텐츠', '크리에이터', '조회수'],
        [
            ...owners.map(([n, c, v]) => [
                '',
                n,
                f(v) + '개',
                f(c) + '명',
                value(own(n))
            ]),
            [
                'total',
                'TOTAL',
                f(total[1]) + '개',
                f(total[0]) + '명',
                value(videos)
            ]
        ]
    )}`;

    const top = [...videos]
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

    document.querySelector('#views').innerHTML = `

    ${heading('03', '11월 조회수 분석')}

    <div class="metrics">

        ${card('TOTAL VIEWS', value(videos), 'black')}

        ${groups.map(g =>
            card(g.name + ' 조회수', value(g.videos))
        ).join('')}

        ${card(
            'AVERAGE VIEWS',
            videos.length
                ? f(Math.round(sum(videos) / videos.length))
                : '—'
        )}

        ${card('조회수 확인 영상', f(videos.length) + '개')}

    </div>

    <h3>조회수 TOP 10</h3>

    ${table(
        ['순위', '플랫폼', '담당자', '크리에이터', '조회수', '영상'],
        top.length
            ? top.map((v, i) => [
                '',
                i + 1,
                esc(v.platform),
                esc(v.owner),
                esc(v.creator),
                f(v.views),
                link(v)
            ])
            : [['', '—', '—', '—', '집계 대기', '—', '—']]
    )}

    `;
}

// Безопасные ссылки

function link(v) {

    try {

        const u = new URL(v.url);

        if (
            u.protocol === 'https:' &&
            /(^|\.)(tiktok|instagram)\.com$/.test(u.hostname)
        ) {
            return `
            <a href="${esc(u.href)}"
               target="_blank"
               rel="noopener noreferrer">
               ${esc(v.platform)} ↗
            </a>`;
        }

    } catch {}

    return '—';
}

// Нормализация ссылок

const norm = u => String(u ?? '')
    .split(/[?#]/)[0]
    .replace(/\/+$/, '');

const code = u => String(u ?? '')
    .match(/\/(?:reels?|p|tv)\/([^/?#]+)/)?.[1];

// Загрузка просмотров

async function load(name, metric, input) {

    try {

        const get = async p => {

            const r = await fetch(
                './' + p + '?t=' + Date.now(),
                {cache: 'no-store'}
            );

            if (!r.ok) {
                throw new Error(p);
            }

            return r.json();
        };

        const [m, source] = await Promise.all([
            get(metric),
            get(input)
        ]);

        const src = Array.isArray(source)
            ? source
            : Array.isArray(source.videos)
                ? source.videos
                : [];

        const ids = new Set(
            src.map(v =>
                name === 'Instagram'
                    ? code(v.url)
                    : String(v.video_id || '')
            ).filter(Boolean)
        );

        const urls = new Set(
            src.map(v => norm(v.url)).filter(Boolean)
        );

        const unique = new Map();

        for (const v of m.videos || []) {

            if (
                !v.video_id ||
                !Number.isFinite(v.views) ||
                v.views < 0
            ) {
                continue;
            }

            const exact =
                ids.has(String(v.video_id)) ||
                urls.has(norm(v.url)) ||
                (
                    v.original_url &&
                    urls.has(norm(v.original_url))
                ) ||
                (
                    v.source_url &&
                    urls.has(norm(v.source_url))
                );

            if (!exact) {
                continue;
            }

            unique.set(
                String(v.video_id),
                {...v, platform: name}
            );
        }

        return {
            name,
            videos: [...unique.values()],
            status: m.test_mode
                ? '테스트'
                : '수집 완료',
            date: m.updated_at
        };

    } catch (e) {

        console.error(name, e);

        return {
            name,
            videos: [],
            status: '데이터 로드 실패'
        };
    }
}

// Первоначальное отображение

const groups = [
    {
        name: 'TikTok',
        videos: [],
        status: '로딩 중'
    },
    {
        name: 'Instagram',
        videos: [],
        status: '로딩 중'
    }
];

render(groups);

// Независимая загрузка каждой платформы

load(
    'TikTok',
    'metrics.json',
    'tiktok_videos.json'
).then(result => {
    groups[0] = result;
    render(groups);
});

load(
    'Instagram',
    'instagram_metrics.json',
    'instagram_videos.json'
).then(result => {
    groups[1] = result;
    render(groups);
});
