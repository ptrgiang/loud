// Points the download buttons at the latest release's installer for this computer. Without JavaScript, or if GitHub
// does not answer, the buttons keep linking to the release page.
(() => {
  const REPO = "ptrgiang/loud";
  const ua = navigator.userAgent;
  const os = /Windows/i.test(ua)
    ? "win"
    : /Mac OS X|Macintosh/i.test(ua)
      ? "mac"
      : /Linux/i.test(ua)
        ? "linux"
        : null;
  const NAMES = { win: "Windows", mac: "macOS", linux: "Linux" };

  const pick = (assets, test, prefer) => {
    const all = assets.filter((a) => test.test(a.name));
    return all.find((a) => prefer.test(a.name)) ?? all[0] ?? null;
  };

  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((release) => {
      const assets = release.assets ?? [];
      const version = String(release.tag_name ?? "").replace(/^v/, "");
      const files = {
        win: pick(assets, /\.exe$/i, /x64/i),
        mac: pick(assets, /\.dmg$/i, /arm64/i),
        macIntel: pick(assets, /\.dmg$/i, /x64/i),
        linux: pick(assets, /\.AppImage$/i, /x86_64|x64/i),
      };

      if (version)
        for (const el of document.querySelectorAll("[data-version]")) el.textContent = version;

      const mine = os && files[os];
      if (mine) {
        for (const a of document.querySelectorAll("[data-download]"))
          a.href = mine.browser_download_url;
        for (const s of document.querySelectorAll("[data-download-label]"))
          s.textContent = `Download for ${NAMES[os]}`;
        const note = document.querySelector("[data-download-note]");
        if (note) note.textContent = `Version ${version} · ${(mine.size / 1048576).toFixed(0)} MB`;
      }

      const list = document.querySelector("[data-platforms]");
      if (!list) return;
      const links = [
        ["Windows", files.win],
        ["macOS, Apple silicon", files.mac],
        ["macOS, Intel", files.macIntel !== files.mac ? files.macIntel : null],
        ["Linux AppImage", files.linux],
      ];
      for (const [label, file] of links.toReversed()) {
        if (!file) continue;
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = file.browser_download_url;
        a.textContent = label;
        li.append(a);
        list.prepend(li);
      }
    })
    .catch(() => {
      // keep the release-page links
    });
})();

// Fills "In the open" from /api/stats. Without it the section keeps its dashes.
(() => {
  const root = document.querySelector("[data-stats]");
  if (!root) return;
  const NAMES = { threads: "Threads", ig: "Instagram", fb: "Facebook Page", x: "X" };
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const pct = (n, of) => (of > 0 ? `${fmt(n)} (${Math.round((n / of) * 100)}%)` : fmt(n));

  fetch("/api/stats")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((stats) => {
      const set = (key, value) => {
        const el = document.querySelector(`[data-stat="${key}"]`);
        if (el) el.textContent = value;
      };
      set("days7", fmt(stats.active.days7));
      set("days30", fmt(stats.active.days30));
      if (stats.downloads) set("installers", fmt(stats.downloads.installers));

      const body = document.querySelector("[data-collect]");
      if (body) {
        body.replaceChildren();
        for (const [id, name] of Object.entries(NAMES)) {
          const t = stats.collect[id] ?? { runs: 0, done: 0, failed: 0, blocked: 0 };
          const tr = document.createElement("tr");
          const cells = [
            name,
            fmt(stats.platforms[id] ?? 0),
            fmt(t.runs),
            pct(t.done, t.runs),
            pct(t.blocked, t.runs),
            pct(t.failed, t.runs),
          ];
          cells.forEach((text, i) => {
            const td = document.createElement(i === 0 ? "th" : "td");
            if (i === 0) td.scope = "row";
            td.textContent = text;
            tr.append(td);
          });
          body.append(tr);
        }
      }

      const note = document.querySelector("[data-stats-note]");
      if (note) {
        const when = new Date(stats.generated).toUTCString().replace(" GMT", " UTC");
        const checks = stats.downloads
          ? ` The update file was fetched ${fmt(stats.downloads.updateChecks)} times; each copy with update checks on asks at start and every 6 hours.`
          : "";
        note.textContent = `Counted ${when}.${checks}`;
      }
    })
    .catch(() => {
      // keep the dashes
    });
})();
