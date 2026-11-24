
import fs from 'node:fs';

const token = process.env.APIFY_TOKEN;
if (!token) throw new Error('Missing APIFY_TOKEN');

const all = JSON.parse(
  fs.readFileSync('tiktok_videos.json', 'utf8')
);

const test = process.env.TEST_MODE === 'true';

const selected = test
  ? [
      ...all.filter(v => v.video_id).slice(0, 3),
      ...all.filter(v => !v.video_id).slice(0, 2)
    ]
  : all;

const old = fs.existsSync('metrics.json')
  ? JSON.parse(fs.readFileSync('metrics.json', 'utf8'))
  : { videos: [] };

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function extractId(value) {
  const raw = String(value ?? '');
  return raw.match(/\/video\/(\d+)/)?.[1]
    || raw.match(/^\d{15,22}$/)?.[0]
    || null;
}

function normalizeUrl(value) {
  try {
    const u = new URL(value);
    return (u.hostname + u.pathname)
      .replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function getId(v) {
  for (const value of [
    v.webVideoUrl, v.url, v.id,
    v.videoId, v.aweme_id, v.input
  ]) {
    const id = extractId(value);
    if (id) return id;
  }
  return null;
}

function getViews(v) {
  const candidates = [
    v.playCount,
    v.stats?.playCount,
    v.stats?.play_count,
    v.statistics?.play_count,
    v.video?.stats?.playCount,
    v.views,
    v.viewCount
  ];

  for (const c of candidates) {
    if (
      typeof c === 'number' &&
      Number.isFinite(c) &&
      c >= 0
    ) return c;

    if (
      typeof c === 'string' &&
      /^\d+$/.test(c.trim())
    ) return Number(c);
  }

  return null;
}

// Resolve short TikTok URLs

async function resolveVideo(v) {
  if (v.video_id) return v;

  try {
    const response = await fetch(v.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const id = extractId(response.url);
    if (response.body) await response.body.cancel();

    if (id) {
      return {
        ...v,
        video_id: id,
        url: response.url.split('?')[0]
      };
    }
  } catch {
    // Apify will attempt the original URL.
  }

  return v;
}

const prepared = [];

for (let i = 0; i < selected.length; i += 10) {
  const group = selected.slice(i, i + 10);
  prepared.push(
    ...await Promise.all(group.map(resolveVideo))
  );
}

const unique = new Map();

for (const v of prepared) {
  const key = v.video_id || normalizeUrl(v.url);
  if (!unique.has(key)) unique.set(key, v);
}

const videos = [...unique.values()];

console.log(`Selected: ${selected.length}`);
console.log(`Unique inputs: ${videos.length}`);
console.log(
  `Unresolved short URLs: ${
    videos.filter(v => !v.video_id).length
  }`
);

const results = new Map();

for (const v of old.videos || []) {
  if (
    v.video_id &&
    typeof v.views === 'number' &&
    Number.isFinite(v.views) &&
    v.views >= 0
  ) {
    results.set(String(v.video_id), v);
  }
}

async function scrape(batch) {
  const resp = await fetch(
    'https://api.apify.com/v2/acts/clockworks~tiktok-video-scraper/runs',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        postURLs: batch.map(v => v.url),
        scrapeRelatedVideos: false,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        downloadSubtitlesOptions:
          'NEVER_DOWNLOAD_SUBTITLES'
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

function saveItem(item, source) {
  if (item.errorCode || item.error) return false;

  const id = getId(item);
  const views = getViews(item);

  if (!id || views === null || !source) return false;

  const url = item.webVideoUrl || item.url || source.url;

  results.set(id, {
    ...source,
    video_id: id,
    url,
    views
  });

  matched++;
  return true;
}

// Collect videos with known IDs in batches of 25

const known = videos.filter(v => v.video_id);

for (let offset = 0; offset < known.length; offset += 25) {
  const batch = known.slice(offset, offset + 25);
  const byId = new Map(
    batch.map(v => [String(v.video_id), v])
  );

  const items = await scrape(batch);
  let found = 0;

  for (const item of items) {
    const id = getId(item);
    if (saveItem(item, byId.get(id))) found++;
  }

  console.log(
    `Batch ${Math.floor(offset / 25) + 1}: ` +
    `${found}/${batch.length} matched`
  );
}

// Process unresolved short URLs separately
// to avoid assigning videos to the wrong creator.

const unresolved = videos.filter(v => !v.video_id);

for (const source of unresolved) {
  try {
    const items = await scrape([source]);

    const valid = items.filter(item =>
      !item.errorCode &&
      !item.error &&
      getId(item) &&
      getViews(item) !== null
    );

    const exact = valid.find(item =>
      [item.input, item.inputUrl, item.webVideoUrl, item.url]
        .some(u =>
          typeof u === 'string' &&
          normalizeUrl(u) === normalizeUrl(source.url)
        )
    );

    const ids = new Set(valid.map(getId));
    const item = exact || (ids.size === 1 ? valid[0] : null);

    if (item && saveItem(item, source)) {
      console.log(`Short URL matched: ${source.creator}`);
    } else {
      console.log(`Short URL unmatched: ${source.creator}`);
    }
  } catch (error) {
    console.log(`Short URL failed: ${source.creator}`);
  }
}

if (!matched) {
  throw new Error(
    'No new valid views collected; metrics.json unchanged'
  );
}

const output = {
  updated_at: new Date().toISOString(),
  test_mode: test,
  videos: [...results.values()]
};

fs.writeFileSync(
  'metrics.json',
  JSON.stringify(output, null, 2) + '\n'
);

console.log(`New matches: ${matched}`);
console.log(`Saved unique videos: ${results.size}`);
console.log(`Mode: ${test ? 'TEST' : 'FULL'}`);
