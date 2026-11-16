#!/usr/bin/env node
// Pulls every upload from the Tech With Yeshwanth channel into assets/videos.json.
//   YT_API_KEY set   -> YouTube Data API v3: ALL uploads, with duration + views.
//   YT_API_KEY unset -> public RSS feed: latest 15 uploads only.
// The file was seeded once with the full channel (454 uploads); the hourly sync adds new ones.
// No dependencies. Node 18+.
//   node scripts/fetch-videos.mjs
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const CHANNEL_ID = process.env.YT_CHANNEL_ID || "UCwhERUcuzUCwr8x8mQ8zrcw";
const HANDLE = "@techwithyeshwanth";
const KEY = process.env.YT_API_KEY;
const OUT = fileURLToPath(new URL("../assets/videos.json", import.meta.url));
const API = "https://www.googleapis.com/youtube/v3";

const get = async (url) => {
  const r = await fetch(url, { headers: { "user-agent": "yeshwanthlm.in video sync" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url.replace(/key=[^&]+/, "key=***")}`);
  return r;
};

// ISO 8601 duration (PT1H2M3S) -> seconds
const secs = (d = "") => { const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || []; return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0); };

async function viaApi() {
  const uploads = "UU" + CHANNEL_ID.slice(2);
  const items = [];
  let page = "";
  do {
    const r = await (await get(`${API}/playlistItems?part=snippet,contentDetails,status&maxResults=50&playlistId=${uploads}&key=${KEY}${page ? `&pageToken=${page}` : ""}`)).json();
    items.push(...r.items.filter((i) => i.status?.privacyStatus === "public"));
    page = r.nextPageToken || "";
  } while (page);

  const details = new Map();
  for (let i = 0; i < items.length; i += 50) {
    const ids = items.slice(i, i + 50).map((x) => x.contentDetails.videoId).join(",");
    const r = await (await get(`${API}/videos?part=contentDetails,statistics,liveStreamingDetails&id=${ids}&key=${KEY}`)).json();
    r.items.forEach((v) => details.set(v.id, v));
  }

  return items.map((i) => {
    const id = i.contentDetails.videoId, d = details.get(id) || {};
    const duration = secs(d.contentDetails?.duration);
    return {
      id,
      title: i.snippet.title,
      published: i.contentDetails.videoPublishedAt || i.snippet.publishedAt,
      duration,
      views: d.statistics ? +d.statistics.viewCount : null,
      short: duration > 0 && duration <= 180 && !d.liveStreamingDetails,
    };
  }).filter((v) => v.duration > 0); // drops upcoming premieres / removed videos
}

async function viaRss() {
  const xml = await (await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`)).text();
  const un = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const pick = (re) => (e.match(re) || [])[1];
    const link = pick(/<link rel="alternate" href="([^"]+)"/) || "";
    return {
      id: pick(/<yt:videoId>([^<]+)</),
      title: un(pick(/<title>([^<]*)</) || ""),
      published: pick(/<published>([^<]+)</),
      duration: null,
      views: +(pick(/<media:statistics views="(\d+)"/) || 0) || null,
      short: link.includes("/shorts/"),
    };
  });
}

const fresh = KEY ? await viaApi() : await viaRss();
if (!fresh.length) throw new Error("no videos returned; keeping the existing file");

// The RSS feed only holds the latest 15 uploads, so it is merged into the existing list
// (seeded once with the full channel): refresh known videos, put new uploads on top.
// With an API key the API result is the complete list and replaces the file.
let merged = fresh;
if (!KEY) {
  let prev = [];
  try { prev = JSON.parse(await readFile(OUT, "utf8")).videos || []; } catch { /* first run */ }
  const byId = new Map(fresh.map((v) => [v.id, v]));
  const known = new Set(prev.map((v) => v.id));
  const added = fresh.filter((v) => !known.has(v.id)).sort((a, b) => b.published.localeCompare(a.published));
  const kept = prev.map((v) => { const f = byId.get(v.id); return f ? { ...v, title: f.title, published: f.published, views: f.views ?? v.views } : v; });
  merged = [...added, ...kept];
  if (added.length) console.log(`new: ${added.map((v) => v.title).join(" | ")}`);
}

const data = {
  channel: { id: CHANNEL_ID, title: "Tech With Yeshwanth", url: `https://www.youtube.com/${HANDLE}`, source: KEY ? "api" : "rss", synced: new Date().toISOString() },
  videos: merged,
};
await writeFile(OUT, JSON.stringify(data, null, 1) + "\n");
console.log(`wrote ${merged.length} videos (${data.channel.source}) -> assets/videos.json`);
