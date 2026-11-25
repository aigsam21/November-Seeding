
import fs from 'node:fs';

const token = process.env.APIFY_TOKEN;
if (!token) throw new Error('Missing APIFY_TOKEN');

const test = process.env.TEST_MODE === 'true';
const file = 'instagram_metrics.json';

const all = JSON.parse(
  fs.readFileSync('instagram_videos.json', 'utf8')
);

const selected = test ? all.slice(0, 3) : all;

const old = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, 'utf8'))
  : { videos: [] };

const results = new Map(
  (old.videos || []).map(v => [v.video_id, v])
);

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function getCode(url) {
  return String(url || '')
    .match(/\/(?:reel|reels|p|tv)\/([^/?#]+)/)?.[1];
}

const sources = new Map();

for (const v of selected) {
  const id = getCode(v.url) || v.shortCode;
  if (id && !sources.has(id)) sources.set(id, v);
}

async function scrape(batch, type) {
  const resp = await fetch(
    'https://api.apify.com/v2/acts/apify~instagram-scraper/runs?maxTotalChargeUsd=1',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        directUrls: batch.map(v => v.url),
        resultsType: type,
        resultsLimit: 1
      })
    }
  );

  if (!resp.ok) {
    throw new Error(`Apify start failed: ${resp.status}`);
  }

  const run = (await resp.json()).data;
  let state = run.status;

  const terminal = [
    'SUCCEEDED', 'FAILED',
    'ABORTED', 'TIMED-OUT'
  ];

  for (
    let i = 0;
    i < 100 && !terminal.includes(state);
    i++
  ) {
    await sleep(6000);

    const check = await fetch(
      `https://api.apify.com/v2/actor-runs/${run.id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!check.ok) {
      throw new Error(`Status failed: ${check.status}`);
    }

    state = (await check.json()).data.status;
  }

  if (state !== 'SUCCEEDED') {
    throw new Error(`Apify run: ${state}`);
  }

  const dataset = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?format=json&clean=true`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!dataset.ok) {
    throw new Error(`Dataset failed: ${dataset.status}`);
  }

  return dataset.json();
}

let matched = 0;

const videos = [...sources.values()];

const groups = [
  {
    type: 'reels',
    videos: videos.filter(v =>
      /\/reels?\//.test(v.url)
    )
  },
  {
    type: 'posts',
    videos: videos.filter(v =>
      !/\/reels?\//.test(v.url)
    )
  }
];

for (const group of groups) {
  for (
    let offset = 0;
    offset < group.videos.length;
    offset += 25
  ) {
    const batch = group.videos.slice(
      offset, offset + 25
    );

    const allowed = new Set(
      batch.map(v => getCode(v.url) || v.shortCode)
    );

    const items = await scrape(batch, group.type);

    let found = 0;

    for (const item of items) {
      if (item.error || item.errorCode) continue;

      const id = item.shortCode || getCode(item.url);
      const source = sources.get(id);

      if (!source || !allowed.has(id)) continue;

      const raw = item.videoPlayCount;

      if (
        typeof raw !== 'number' &&
        !(typeof raw === 'string' && /^\d+$/.test(raw))
      ) continue;

      const views = Number(raw);

      if (!Number.isFinite(views) || views < 0) {
        continue;
      }

      results.set(id, {
        ...source,
        platform: 'Instagram',
        video_id: id,
        shortCode: id,
        url: item.url || source.url,
        views,
        likes: item.likesCount ?? null,
        comments: item.commentsCount ?? null,
        timestamp: item.timestamp ?? null
      });

      found++;
      matched++;
    }

    console.log(
      `${group.type}: ${found}/${batch.length} matched`
    );
  }
}

if (!matched) {
  throw new Error(
    'No valid Instagram views; metrics unchanged'
  );
}

const output = {
  updated_at: new Date().toISOString(),
  test_mode: test,
  videos: [...results.values()]
};

fs.writeFileSync(
  file,
  JSON.stringify(output, null, 2) + '\n'
);

console.log(`New matches: ${matched}`);
console.log(`Saved videos: ${results.size}`);
console.log(`Mode: ${test ? 'TEST' : 'FULL'}`);
