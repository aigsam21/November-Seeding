
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
    v.webVideoUrl,
    v.url,
    v.id,
    v.videoId,
    v.aweme_id,
    v.input
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

// Resolve short TikTok URLs.

async function resolveVideo(v) {
  const source = {
    ...v,
    original_url: v.url,
    video_id: extractId(v.video_id)
      || extractId(v.url)
  };

  if (source.video_id) return source;

  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const id = extractId(response.url);

    if (response.body) {
      await response.body.cancel();
    }

    if (id) {
      return {
        ...source,
        video_id: id,
        url: response.url.split('?')[0]
      };
    }
  } catch {
    // Apify will attempt the original URL.
  }

  return source;
}

// Resolve URLs in groups of 10.

const prepared = [];

for (let i = 0; i < selected.length; i += 10) {
  const group = selected.slice(i, i + 10);

  prepared.push(
    ...await Promise.all(group.map(resolveVideo))
  );
}

// Remove duplicate inputs.

const unique = new Map();

for (const v of prepared) {
  const key = v.video_id || normalizeUrl(v.url);

  if (key && !unique.has(key)) {
    unique.set(key, v);
  }
}

const videos = [...unique.values()];

const missingOnly =
  !test && process.env.MISSING_ONLY === 'true';

console.log(`Total source links: ${all.length}`);
console.log(`Selected: ${selected.length}`);
console.log(`Unique inputs: ${videos.length}`);

console.log(
  `Unresolved short URLs: ${
    videos.filter(v => !v.video_id).length
  }`
);

// Preserve previous views only for current publications.

const results = new Map();

const previousById = new Map();
const previousByUrl = new Map();

for (const v of old.videos || []) {
  const id = extractId(v.video_id);

  if (
    !id ||
    typeof v.views !== 'number' ||
    !Number.isFinite(v.views) ||
    v.views < 0
  ) continue;

  previousById.set(id, v);

  for (const url of [
    v.original_url,
    v.source_url,
    v.url
  ]) {
    const key = normalizeUrl(url);

    if (key) {
      previousByUrl.set(key, v);
    }
  }
}

for (const source of videos) {
  const previous = source.video_id
    ? previousById.get(String(source.video_id))
    : previousByUrl.get(
        normalizeUrl(source.original_url)
      );

  if (!previous) continue;

  const id = String(previous.video_id);

  results.set(id, {
    ...previous,
    owner: source.owner,
    creator: source.creator,
    original_url: source.original_url,
    source_url: source.original_url
  });
}

console.log(
  `Preserved current metrics: ${results.size}`
);

// Apify TikTok scraper.

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
    throw new Error(
      `Apify start failed: ${resp.status}`
    );
  }

  const run = (await resp.json()).data;
  let state = run.status;

  const terminal = [
    'SUCCEEDED',
    'FAILED',
    'ABORTED',
    'TIMED-OUT'
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
      throw new Error(
        `Status failed: ${check.status}`
      );
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
    throw new Error(
      `Dataset failed: ${dataset.status}`
    );
  }

  return dataset.json();
}

// Track successful matches and failed batches.

const matchedIds = new Set();
const matchedInputs = new Set();

let failedBatches = 0;
let stopCollection = false;

function isCriticalError(error) {
  return /Apify start failed: (401|402|403|429)\b/
    .test(error.message);
}

function saveItem(item, source) {
  if (item.errorCode || item.error) return false;

  const id = getId(item);
  const views = getViews(item);

  if (!id || views === null || !source) {
    return false;
  }

  if (
    source.video_id &&
    String(source.video_id) !== id
  ) {
    return false;
  }

  const url = [
    item.webVideoUrl,
    item.url,
    source.url
  ].find(u =>
    typeof u === 'string' &&
    /^https?:\/\//.test(u) &&
    extractId(u) === id
  ) || source.url;

  const originalUrl =
    source.original_url || source.url;

  const previous = results.get(id);

  results.set(id, {
    ...source,
    platform: 'TikTok',
    video_id: id,
    url,
    owner: previous?.owner ?? source.owner,
    creator: previous?.creator ?? source.creator,
    original_url: originalUrl,
    source_url: originalUrl,
    views
  });

  matchedIds.add(id);

  matchedInputs.add(
    source.video_id ||
    normalizeUrl(source.original_url)
  );

  return true;
}

// Collect videos with known IDs in batches of 25.

const known = videos.filter(v =>
  v.video_id &&
  (!missingOnly || !results.has(String(v.video_id)))
);

for (
  let offset = 0;
  offset < known.length;
  offset += 25
) {
  const batch = known.slice(offset, offset + 25);

  const byId = new Map(
    batch.map(v => [String(v.video_id), v])
  );

  try {
    const items = await scrape(batch);

    const found = new Set();

    for (const item of items) {
      const id = getId(item);

      if (saveItem(item, byId.get(id))) {
        found.add(id);
      }
    }

    console.log(
      `Batch ${Math.floor(offset / 25) + 1}: ` +
      `${found.size}/${batch.length} matched`
    );

  } catch (error) {
    failedBatches++;

    console.error(
      `Batch failed: ${error.message}`
    );

    if (isCriticalError(error)) {
      stopCollection = true;
      break;
    }
  }
}

// Process unresolved short URLs separately.

const unresolved = videos.filter(v => !v.video_id);

for (const source of unresolved) {
  if (stopCollection) break;

  try {
    const items = await scrape([source]);

    const valid = items.filter(item =>
      !item.errorCode &&
      !item.error &&
      getId(item) &&
      getViews(item) !== null
    );

    const exact = valid.find(item =>
      [
        item.input,
        item.inputUrl,
        item.webVideoUrl,
        item.url
      ].some(u =>
        typeof u === 'string' &&
        normalizeUrl(u) ===
          normalizeUrl(source.original_url)
      )
    );

    const ids = new Set(valid.map(getId));

    const item =
      exact || (ids.size === 1 ? valid[0] : null);

    if (item && saveItem(item, source)) {
      console.log(
        `Short URL matched: ${source.creator}`
      );
    } else {
      console.log(
        `Short URL unmatched: ${source.creator}`
      );
    }

  } catch (error) {
    failedBatches++;

    console.error(
      `Short URL failed: ${source.creator}: ${error.message}`
    );

    if (isCriticalError(error)) {
      stopCollection = true;
      break;
    }
  }
}

// Do not overwrite metrics if collection failed completely.

if (!matchedIds.size) {
  throw new Error(
    'No new valid views collected; metrics.json unchanged'
  );
}

// Save test results separately from the live report.

const outputFile = test
  ? 'metrics_test.json'
  : 'metrics.json';

const output = {
  updated_at: new Date().toISOString(),
  test_mode: test,
  partial:
    failedBatches > 0 ||
    stopCollection ||
    matchedInputs.size < videos.length,
  videos: [...results.values()]
};

fs.writeFileSync(
  outputFile,
  JSON.stringify(output, null, 2) + '\n'
);

console.log(`Total source links: ${all.length}`);
console.log(`Unique inputs: ${videos.length}`);
console.log(`New matches: ${matchedIds.size}`);
console.log(`Matched inputs: ${matchedInputs.size}`);
console.log(`Saved unique videos: ${results.size}`);
console.log(`Failed batches: ${failedBatches}`);
console.log(`Partial: ${output.partial}`);
console.log(`Mode: ${test ? 'TEST' : 'FULL'}`);
console.log(`Saved to: ${outputFile}`);
