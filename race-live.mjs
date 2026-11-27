export function watchResults(main, current, refresh, txt, incomingPrepResults) {
  const interval = 5 * 60_000;
  let data, request, readAt = 0, displayedVersion;
  const revisions = new Map();

  function show(incoming) {
    const route = current();
    if (!route || !data || main.getAttribute("aria-busy") === "true") return;
    const { page, id, version } = route;
    const meets = page === "prepare" ? [...main.querySelectorAll("[data-linked-result]")].map(a => a.dataset.linkedResult) : [id];
    const entries = meets.map(meet => data.events[meet]).filter(Boolean);
    const entry = entries.find(item => item.failed) || entries[0];
    if (!version) return;
    if (version !== displayedVersion) {
      displayedVersion = version;
      revisions.clear();
    }
    if (version === data.generation) {
      for (const meet of meets) revisions.set(meet, data.events[meet]?.updated || null);
    }
    const newLinks = incoming && (incoming.length !== meets.length || incoming.some(meet => !meets.includes(meet)));
    const changed = data.generation !== version && (newLinks || meets.some(meet => {
      const latest = data.events[meet];
      if (!latest) return false;
      if (revisions.has(meet)) return revisions.get(meet) !== (latest.updated || null);
      return Date.parse(latest.updated) > Date.parse(route.published);
    }));
    const parent = main.querySelector(".event-heading .metadata") || (page === "prepare" && main.querySelector("h1")?.parentElement);
    let panel = main.querySelector(".live-check");
    if (!parent || (!entry && !changed)) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "live-check";
      panel.setAttribute("aria-live", "polite");
      panel.append(document.createElement("span"));
      parent.after(panel);
    }
    const stamp = Date.parse(entry?.checked);
    const checked = Number.isFinite(stamp)
      ? txt("Results source checked ", "成绩来源检查于 ", "Source des résultats vérifiée le ") + new Date(stamp).toLocaleString(txt("en-CA", "zh-CN", "fr-CA"), { dateStyle: "short", timeStyle: "short" }) : "";
    const overdue = Date.parse(entry?.watch_until) > Date.now() && (!Number.isFinite(stamp) || Date.now() - stamp >= 3600_000);
    const issue = overdue ? txt("Source check overdue", "成绩来源检查延迟", "Vérification de la source en retard") : entry?.failed ? txt("Last check unsuccessful", "上次检查未成功", "Dernière vérification échouée") : "";
    const message = [checked, issue].filter(Boolean).join(" · ");
    const text = panel.firstElementChild;
    if (text.textContent !== message) text.textContent = message;
    let button = panel.querySelector("button");
    if (changed && !button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "under";
      button.textContent = txt("View updated results", "查看最新成绩", "Voir les résultats actualisés");
      button.onclick = async () => {
        button.disabled = true;
        try { await refresh(); }
        catch {
          button.disabled = false;
          button.textContent = txt("Retry results update", "重新读取最新成绩", "Relancer la mise à jour des résultats");
        }
      };
      panel.append(button);
    } else if (!changed && button) button.remove();
    panel.hidden = !changed && !message;
  }

  async function check(force = false) {
    if (document.hidden || !current()) return;
    if (!request && (force || Date.now() - readAt >= interval)) {
      readAt = Date.now();
      request = fetch("./data/live.json", { cache: "no-cache" }).then(async response => {
        if (response.ok) {
          const info = await response.json();
          if (info.generation && info.events) data = info;
        }
      }).catch(() => {}).finally(() => { request = null; });
    }
    await request;
    const route = current();
    let incoming;
    if (route?.page === "prepare" && route.version && data && route.version !== data.generation) {
      const generation = data.generation;
      try { incoming = await incomingPrepResults(route.id, generation); } catch { /* Keep the displayed meet while the archive is unavailable. */ }
      const now = current();
      if (now?.page !== route.page || now.id !== route.id || now.version !== route.version || data.generation !== generation) return;
    }
    show(incoming);
  }
  setInterval(() => check(true), interval);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(true); });
  return check;
}
