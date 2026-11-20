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
      for (const [label, file] of links.reverse()) {
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
