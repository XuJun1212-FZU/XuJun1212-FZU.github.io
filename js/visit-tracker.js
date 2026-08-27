(function () {
  // TODO: Configure personal Cloudflare analytics
  const DEFAULT_ANALYTICS_BASE = "";
  const OFFLINE_KEY = "xujun_analytics_offline_v1";
  const QUEUE_KEY = "xujun_analytics_queue_v1";
  const VISITOR_KEY = "xujun_visitor_id_v1";

  const configuredBase = typeof window !== "undefined" && typeof window.__ANALYTICS_BASE__ === "string"
    ? window.__ANALYTICS_BASE__.trim()
    : "";
  const analyticsBase = (configuredBase || DEFAULT_ANALYTICS_BASE).replace(/\/+$/, "");
  const endpoint = analyticsBase ? `${analyticsBase}/api/visit` : "";
  const visit = {
    path: location.pathname + location.search,
    title: document.title || "",
    referrer: document.referrer || ""
  };

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage errors
    }
  }

  function dayKey(ts) {
    return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  }

  function getVisitorId() {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VISITOR_KEY, created);
    return created;
  }

  function normalizeProvince(name) {
    const raw = String(name || "").trim();
    return raw || "未知";
  }

  function updateOfflineStats(province) {
    const now = Date.now();
    const day = dayKey(now);
    const visitorId = getVisitorId();
    const provinceName = normalizeProvince(province);
    const stats = readStorage(OFFLINE_KEY, {
      total: 0,
      days: {},
      provinces: {},
      visitors: {},
      recent: []
    });

    stats.total += 1;
    if (!stats.days[day]) stats.days[day] = { total: 0, unique: 0 };
    stats.days[day].total += 1;

    const uniqueTag = `${day}|${visitorId}`;
    if (!stats.visitors[uniqueTag]) {
      stats.visitors[uniqueTag] = 1;
      stats.days[day].unique += 1;
    }

    stats.provinces[provinceName] = (stats.provinces[provinceName] || 0) + 1;
    stats.recent.unshift({
      ts: now,
      province: provinceName,
      path: visit.path,
      hash: visitorId.slice(-8)
    });
    stats.recent = stats.recent.slice(0, 20);
    writeStorage(OFFLINE_KEY, stats);
  }

  function buildGetUrl(payload) {
    const params = new URLSearchParams({
      path: payload.path,
      title: payload.title,
      referrer: payload.referrer,
      ts: String(Date.now())
    });
    if (payload.province) {
      params.set("province", payload.province);
    }
    return `${endpoint}?${params.toString()}`;
  }

  async function sendPayload(payload) {
    if (!endpoint) return false;
    const url = buildGetUrl(payload);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    try {
      await fetch(url, {
        method: "GET",
        mode: "no-cors",
        keepalive: true,
        credentials: "omit",
        signal: controller.signal
      });
      return true;
    } catch {
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
      } catch {
        // ignore
      }
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function queuePayload(payload) {
    const queue = readStorage(QUEUE_KEY, []);
    queue.push(payload);
    writeStorage(QUEUE_KEY, queue.slice(-100));
  }

  async function flushQueue(limit) {
    const queue = readStorage(QUEUE_KEY, []);
    if (!queue.length) return;

    const max = Math.max(1, Number(limit || 3));
    const head = queue.slice(0, max);
    const tail = queue.slice(max);
    const remain = [];

    for (const item of head) {
      const ok = await sendPayload(item);
      if (!ok) remain.push(item);
    }

    writeStorage(QUEUE_KEY, remain.concat(tail).slice(-100));
  }

  function scheduleBackgroundFlush() {
    if (!endpoint) return;
    const task = function () {
      flushQueue(3).catch(function () {
        // ignore
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(task, { timeout: 1500 });
      return;
    }

    setTimeout(task, 1200);
  }

  function run() {
    const payload = {
      path: visit.path,
      title: visit.title,
      referrer: visit.referrer,
      province: ""
    };

    updateOfflineStats(payload.province);

    if (!endpoint) return;

    sendPayload(payload).then(function (ok) {
      if (!ok) queuePayload(payload);
    });

    scheduleBackgroundFlush();
  }

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 1200 });
  } else {
    setTimeout(run, 0);
  }
})();
