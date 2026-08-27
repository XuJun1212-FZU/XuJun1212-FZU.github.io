const PROVINCE_MAP = {
  BJ: "北京",
  SH: "上海",
  TJ: "天津",
  CQ: "重庆",
  HE: "河北",
  SX: "山西",
  NM: "内蒙古",
  LN: "辽宁",
  JL: "吉林",
  HL: "黑龙江",
  JS: "江苏",
  ZJ: "浙江",
  AH: "安徽",
  FJ: "福建",
  JX: "江西",
  SD: "山东",
  HA: "河南",
  HB: "湖北",
  HN: "湖南",
  GD: "广东",
  GX: "广西",
  HI: "海南",
  SC: "四川",
  GZ: "贵州",
  YN: "云南",
  XZ: "西藏",
  SN: "陕西",
  GS: "甘肃",
  QH: "青海",
  NX: "宁夏",
  XJ: "新疆",
  TW: "台湾",
  HK: "香港",
  MO: "澳门"
};

const PROVINCE_ALIAS = {
  "北京市": "北京", "北京": "北京",
  "上海市": "上海", "上海": "上海",
  "天津市": "天津", "天津": "天津",
  "重庆市": "重庆", "重庆": "重庆",
  "河北省": "河北", "河北": "河北",
  "山西省": "山西", "山西": "山西",
  "辽宁省": "辽宁", "辽宁": "辽宁",
  "吉林省": "吉林", "吉林": "吉林",
  "黑龙江省": "黑龙江", "黑龙江": "黑龙江",
  "江苏省": "江苏", "江苏": "江苏",
  "浙江省": "浙江", "浙江": "浙江",
  "安徽省": "安徽", "安徽": "安徽",
  "福建省": "福建", "福建": "福建",
  "江西省": "江西", "江西": "江西",
  "山东省": "山东", "山东": "山东",
  "河南省": "河南", "河南": "河南",
  "湖北省": "湖北", "湖北": "湖北",
  "湖南省": "湖南", "湖南": "湖南",
  "广东省": "广东", "广东": "广东",
  "海南省": "海南", "海南": "海南",
  "四川省": "四川", "四川": "四川",
  "贵州省": "贵州", "贵州": "贵州",
  "云南省": "云南", "云南": "云南",
  "陕西省": "陕西", "陕西": "陕西",
  "甘肃省": "甘肃", "甘肃": "甘肃",
  "青海省": "青海", "青海": "青海",
  "台湾省": "台湾", "台湾": "台湾",
  "内蒙古自治区": "内蒙古", "内蒙古": "内蒙古",
  "广西壮族自治区": "广西", "广西": "广西",
  "西藏自治区": "西藏", "西藏": "西藏",
  "宁夏回族自治区": "宁夏", "宁夏": "宁夏",
  "新疆维吾尔自治区": "新疆", "新疆": "新疆",
  "香港特别行政区": "香港", "香港": "香港",
  "澳门特别行政区": "澳门", "澳门": "澳门"
};

const DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function shanghaiDayKey(ts = Date.now()) {
  return DAY_FORMATTER.format(new Date(ts));
}

function normalizePath(input) {
  const value = String(input || "/").trim();
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeProvinceName(input) {
  const value = String(input || "").trim();
  if (!value) return "未知";
  return PROVINCE_ALIAS[value] || value;
}

function getProvince(request, clientProvince = "") {
  const preferred = normalizeProvinceName(clientProvince);
  if (preferred !== "未知") return preferred;

  const cf = request.cf || {};
  const byRegion = normalizeProvinceName(cf.region || "");
  if (byRegion !== "未知") return byRegion;

  const code = String(cf.regionCode || cf.country || "未知").trim();
  if (PROVINCE_MAP[code]) return PROVINCE_MAP[code];
  return "未知";
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  };
}

function jsonHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders()
  };
}

async function recordVisit(request, env) {
  const body = request.method === "POST" ? await readJsonBody(request) : {};
  const url = new URL(request.url);
  const now = Date.now();
  const day = shanghaiDayKey(now);
  const path = normalizePath(body.path || url.searchParams.get("path") || "/");
  const clientProvince = body.province || url.searchParams.get("province") || "";
  const ua = request.headers.get("user-agent") || "";
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const visitorHash = (await sha256Hex(`${day}|${ip}|${ua}`)).slice(0, 16);
  const province = getProvince(request, clientProvince);

  await env.DB.prepare(
    `INSERT INTO daily_stats(day, total, unique_visitors, updated_at)
     VALUES (?1, 1, 0, ?2)
     ON CONFLICT(day) DO UPDATE SET total = total + 1, updated_at = excluded.updated_at`
  ).bind(day, now).run();

  const seen = await env.DB.prepare(
    `INSERT OR IGNORE INTO visitor_day_seen(day, visitor_hash, first_seen)
     VALUES (?1, ?2, ?3)`
  ).bind(day, visitorHash, now).run();

  if (seen.meta.changes > 0) {
    await env.DB.prepare(
      `UPDATE daily_stats
       SET unique_visitors = unique_visitors + 1, updated_at = ?2
       WHERE day = ?1`
    ).bind(day, now).run();
  }

  await env.DB.prepare(
    `INSERT INTO province_stats(day, province, visits)
     VALUES (?1, ?2, 1)
     ON CONFLICT(day, province) DO UPDATE SET visits = visits + 1`
  ).bind(day, province).run();

  await env.DB.prepare(
    `INSERT INTO visit_log(day, ts, visitor_hash, province, path)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(day, now, visitorHash, province, path).run();

  const cutoff = now - 1000 * 60 * 60 * 24 * 30;
  await env.DB.prepare(`DELETE FROM visit_log WHERE ts < ?1`).bind(cutoff).run();
  await env.DB.prepare(`DELETE FROM visitor_day_seen WHERE first_seen < ?1`).bind(cutoff).run();
  await env.DB.prepare(`DELETE FROM province_stats WHERE day < ?1`).bind(shanghaiDayKey(cutoff)).run();
  await env.DB.prepare(`DELETE FROM daily_stats WHERE day < ?1`).bind(shanghaiDayKey(cutoff)).run();

  return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders() });
}

async function readStats(request, env) {
  const url = new URL(request.url);
  const days = Math.max(7, Math.min(30, Number(url.searchParams.get("days") || 14)));
  const today = shanghaiDayKey();

  const rows = await env.DB.prepare(
    `SELECT day, total, unique_visitors
     FROM daily_stats
     WHERE day <= ?1
     ORDER BY day DESC
     LIMIT ?2`
  ).bind(today, days).all();

  const todayRow = await env.DB.prepare(
    `SELECT day, total, unique_visitors
     FROM daily_stats
     WHERE day = ?1
     LIMIT 1`
  ).bind(today).first();

  const provinceRows = await env.DB.prepare(
    `SELECT province, visits
     FROM province_stats
     WHERE day = ?1
     ORDER BY visits DESC, province ASC`
  ).bind(today).all();

  const recentRows = await env.DB.prepare(
    `SELECT ts, visitor_hash, province, path
     FROM visit_log
     ORDER BY ts DESC
     LIMIT 12`
  ).all();

  const totalRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(unique_visitors), 0) AS unique_visitors
     FROM daily_stats`
  ).first();

  const trend = (rows.results || []).map((row) => ({
    day: row.day,
    total: Number(row.total || 0),
    unique: Number(row.unique_visitors || 0)
  })).reverse();

  const provinces = (provinceRows.results || []).map((row) => ({
    name: row.province,
    value: Number(row.visits || 0)
  }));

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const recent = (recentRows.results || []).map((row) => ({
    time: formatter.format(new Date(row.ts)),
    hash: String(row.visitor_hash || "").slice(0, 8),
    province: row.province || "未知",
    path: row.path || "/"
  }));

  return new Response(JSON.stringify({
    generatedAt: Date.now(),
    today,
    total: Number(totalRow?.total || 0),
    todayTotal: Number(todayRow?.total || 0),
    todayUnique: Number(todayRow?.unique_visitors || 0),
    activeProvinces: provinces.length,
    provinces,
    trend,
    recent
  }), { headers: jsonHeaders() });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }
    if (url.pathname === "/api/visit" && (request.method === "GET" || request.method === "POST")) {
      return recordVisit(request, env);
    }
    if (url.pathname === "/api/analytics" && request.method === "GET") {
      return readStats(request, env);
    }
    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders() });
  }
};
