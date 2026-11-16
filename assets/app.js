/* Yeshwanth L M — page renderers + a real little shell. No dependencies. */
(() => {
  "use strict";
  const S = window.SITE;
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const talksAll = Object.entries(S.talks).sort((a, b) => b[0] - a[0]);

  /* ───────── theme ───────── */
  const setTheme = (t) => { document.documentElement.dataset.theme = t; try { localStorage.setItem("ylm-theme", t); } catch {} };
  $("#themeBtn").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  /* ───────── hero headline: cycles through the three, lands on all three ───────── */
  (async () => {
    const el = $("#rot"); if (!el || reduced) return;
    const words = ["Cloud", "DevOps", "AI", "Cloud, DevOps & AI"];
    const final = el.textContent; el.textContent = words[0];
    await sleep(1600);
    for (let w = 1; w < words.length; w++) {
      for (let i = el.textContent.length; i >= 0; i--) { el.textContent = el.textContent.slice(0, i); await sleep(40); }
      for (const ch of words[w]) { el.textContent += ch; await sleep(75); }
      if (w < words.length - 1) await sleep(1300);
    }
    el.textContent = final;
  })();

  /* ───────── stats ───────── */
  const stats = [["10,000", "+", "learners trained"], ["50", "+", "talks & workshops"], ["3M", "+", "views"], ["40,000", "+", "followers"]];
  $("#stats").innerHTML = stats.map(([n, s, k]) => `<div><dd data-n="${n}">${n}<small>${s}</small></dd><dt>${k}</dt></div>`).join("");

  /* ───────── about ───────── */
  $("#aboutText").innerHTML = S.about.map((p) => `<p>${md(p)}</p>`).join("");
  $("#skills tbody").innerHTML = S.skills.slice(0, 9).map(([n, k]) => `<tr><td>${n}</td><td>${k}</td><td>● Running</td></tr>`).join("") +
    `<tr><td class="d" colspan="3">… and ${S.skills.length - 9} more</td></tr>`;

  /* ───────── work ───────── */
  $("#impact").innerHTML = [["3", "clouds", "AWS · Azure · Google Cloud"], ["40%", "faster", "deployments after IaC automation"], ["−25%", "errors", "manual errors after automation"]]
    .map(([n, u, t]) => `<div><b>${n}</b> <span class="mono">${u}</span><p>${t}</p></div>`).join("");
  $("#jobs").innerHTML = S.experience.map((x) => `
    <li class="job reveal${x.now ? " now" : ""}${x.across ? " across" : ""}">
      <div class="job__co"><span class="job__dot" aria-hidden="true"></span><h3>${esc(x.co)}</h3>${x.now ? '<span class="job__now mono">current</span>' : ""}</div>
      <div class="job__b">
        <p class="job__role">${esc(x.role)}</p>
        ${x.pts.length ? `<ul>${x.pts.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${x.tags.length ? `<p class="job__tags mono">${x.tags.map((t) => `#${t}`).join(" ")}</p>` : ""}
      </div>
    </li>`).join("");

  /* ───────── talks ───────── */
  const tabs = $("#yearTabs"), list = $("#talkList"), gitline = $("#gitline");
  const showYear = (y) => {
    $$("button", tabs).forEach((b) => b.setAttribute("aria-selected", b.dataset.y === y));
    const items = y === "all" ? talksAll.flatMap(([, t]) => t) : S.talks[y];
    gitline.innerHTML = `$ git log --oneline ${y === "all" ? "" : `--since=${y}-01-01 --until=${y}-12-31`} <span>·</span> <b>highlights</b>`;
    list.innerHTML = items.map(([t, u], i) => {
      const k = t.lastIndexOf(", ");
      const title = k > 12 ? `${esc(t.slice(0, k))}<span>, ${esc(t.slice(k + 2))}</span>` : esc(t);
      return u ? `<li style="--i:${i}"><a href="${u}" target="_blank" rel="noopener"><span class="t">${title}</span><span class="go">view ↗</span></a></li>` : `<li style="--i:${i}"><div class="row"><span class="t">${title}</span></div></li>`;
    }).join("");
  };
  ["all", ...talksAll.map(([y]) => y)].forEach((y) => {
    const b = document.createElement("button"); b.type = "button"; b.role = "tab"; b.dataset.y = y; b.textContent = y;
    b.addEventListener("click", () => showYear(y)); tabs.appendChild(b);
  });
  showYear(talksAll[0][0]);

  /* ───────── videos (assets/videos.json, refreshed by scripts/fetch-videos.mjs) ───────── */
  let VIDEOS = [];
  const ago = (iso) => {
    const d = (Date.now() - new Date(iso)) / 864e5;
    if (d < 1) return "today"; if (d < 2) return "yesterday"; if (d < 30) return `${Math.floor(d)} days ago`;
    if (d < 365) { const m = Math.floor(d / 30); return `${m} month${m > 1 ? "s" : ""} ago`; }
    const y = Math.floor(d / 365); return `${y} year${y > 1 ? "s" : ""} ago`;
  };
  const views = (n) => n == null ? "" : `${n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : n} views`;
  const dur = (s) => { if (!s) return ""; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };
  (() => {
    const grid = $("#vgrid"), feat = $("#vfeat"), more = $("#vmore"), q = $("#vq"), vtabs = $("#vtabs"), vline = $("#vline");
    const pageSize = () => (kind === "shorts" ? 10 : 9);
    let kind = "videos", shown = 9;
    const meta = (v) => [v.published ? ago(v.published) : "", views(v.views)].filter(Boolean).join(" · ");
    const list = () => {
      const t = q.value.trim().toLowerCase();
      return VIDEOS.filter((v) => (kind === "shorts") === !!v.short && (!t || v.title.toLowerCase().includes(t)));
    };
    const card = (v, i) => v.short ? `
      <a class="vcard vcard--short" href="https://www.youtube.com/shorts/${v.id}" target="_blank" rel="noopener" style="--i:${i % 10}">
        <span class="vthumb vthumb--short"><img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" loading="lazy">
          <span class="vplay" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
          ${v.views != null ? `<span class="vviews mono">▶ ${views(v.views).replace(" views", "")}</span>` : ""}</span>
        <span class="vt">${esc(v.title)}</span>
      </a>` : `
      <a class="vcard" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener" style="--i:${i % 9}">
        <span class="vthumb"><img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" loading="lazy">
          <span class="vplay" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
          ${v.duration ? `<span class="vdur mono">${dur(v.duration)}</span>` : ""}</span>
        <span class="vmeta"><span class="vt">${esc(v.title)}</span><span class="vs mono">${meta(v)}</span></span>
      </a>`;
    const render = () => {
      const all = list();
      const showFeat = kind === "videos" && !q.value.trim() && all.length > 0;
      if (showFeat) {
        const v = all[0];
        feat.hidden = false;
        feat.innerHTML = `
          <a class="vfeat__thumb" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener" aria-label="Watch on YouTube: ${esc(v.title)}">
            <img src="https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg" data-fallback="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="">
            <span class="vplay vplay--big" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
            ${v.duration ? `<span class="vdur mono">${dur(v.duration)}</span>` : ""}
          </a>
          <div class="vfeat__body">
            <p class="label">// latest upload</p>
            <h3 class="vfeat__t">${esc(v.title)}</h3>
            <p class="vs mono">${meta(v)}</p>
            <div class="vfeat__cta">
              <a class="btn" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">Watch on YouTube <span aria-hidden="true">▶</span></a>
              <a class="btn btn--ghost" href="https://www.youtube.com/@techwithyeshwanth?sub_confirmation=1" target="_blank" rel="noopener">Subscribe ↗</a>
            </div>
          </div>`;
        const fi = $("img[data-fallback]", feat);
        fi.addEventListener("error", () => { fi.src = fi.dataset.fallback; fi.removeAttribute("data-fallback"); }, { once: true });
      } else { feat.hidden = true; feat.innerHTML = ""; }
      const rest = showFeat ? all.slice(1) : all;
      grid.className = `vgrid${kind === "shorts" ? " vgrid--shorts" : ""}`;
      grid.innerHTML = rest.length ? rest.slice(0, shown).map(card).join("") : (showFeat ? "" : `<p class="vempty mono">no ${kind} match “${esc(q.value)}”</p>`);
      more.hidden = rest.length <= shown;
      more.textContent = `Load more (${rest.length - Math.min(shown, rest.length)} left)`;
    };
    q.addEventListener("input", () => { shown = pageSize(); render(); });
    more.addEventListener("click", () => { shown += pageSize(); render(); });
    fetch("assets/videos.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
      VIDEOS = d.videos || [];
      const n = VIDEOS.length, shorts = VIDEOS.filter((v) => v.short).length;
      vline.innerHTML = `$ yt list @techwithyeshwanth <span>·</span> <b>${n} uploads</b> <span>· synced ${ago(d.channel.synced)}</span>`;
      const tabs = [["videos", "Videos", n - shorts], ...(shorts ? [["shorts", "Shorts", shorts]] : [])];
      vtabs.innerHTML = tabs.map(([k, l, c]) => `<button type="button" role="tab" data-k="${k}" aria-selected="${k === kind}">${l} <span class="tabn">${c}</span></button>`).join("");
      vtabs.hidden = tabs.length < 2;
      vtabs.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; kind = b.dataset.k; shown = pageSize(); $$("button", vtabs).forEach((x) => x.setAttribute("aria-selected", x === b)); render(); });
      render();
    }).catch(() => { vline.textContent = "$ yt list @techwithyeshwanth — offline"; grid.innerHTML = `<p class="vempty mono">couldn't load videos — <a class="link-arrow" href="https://www.youtube.com/@techwithyeshwanth" target="_blank" rel="noopener">open the channel ↗</a></p>`; });
  })();

  /* ───────── testimonials ───────── */
  (() => {
    const R = S.reviewSummary, ALL = S.testimonials || [];
    if (!R || !ALL.length) return;
    const star = (n) => `<span class="stars" aria-label="${n} out of 5">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;
    const fdate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    const initials = (n) => n === "Anonymous" ? "?" : n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    const F = ALL.find((t) => t.featured) || ALL[0], T = ALL.filter((t) => t !== F);

    $("#tfeat").innerHTML = `
      <span class="tfeat__mark" aria-hidden="true">“</span>
      <blockquote>${esc(F.text)}</blockquote>
      <figcaption><span class="avatar">${initials(F.name)}</span><span><b>${esc(F.name === "Anonymous" ? "Mentee, interview prep" : F.name)}</b><span class="quote__meta mono">${star(F.stars)} · ${fdate(F.date)} · via Topmate</span></span></figcaption>`;
    $("#rsum").innerHTML = `
      <p class="label">// topmate rating</p>
      <div class="rsum__score"><b>${R.rating}</b><span>${star(5)}<span class="mono">${R.ratings} ratings · ${R.count} reviews</span></span></div>
      <ul class="rsum__tags">${R.tags.map(([t, n]) => `<li><span>${t}</span><b class="mono">${n}</b></li>`).join("")}</ul>
      <a class="btn btn--full" href="${S.booking}" target="_blank" rel="noopener">Book a 1:1 session <span aria-hidden="true">↗</span></a>`;

    const box = $("#quotes"), btn = $("#qmore"), FIRST = 6;
    const card = (t, i) => `<figure class="quote" style="--i:${i % 6}">
      <span class="quote__stars">${star(t.stars)}</span>
      <blockquote class="clamp">${esc(t.text)}</blockquote>
      <button class="quote__more mono" type="button" hidden>Read more</button>
      <figcaption><span class="avatar">${initials(t.name)}</span><span><b>${esc(t.name)}</b><span class="quote__meta mono">${fdate(t.date)}</span></span></figcaption></figure>`;
    let all = false;
    const draw = () => {
      box.innerHTML = (all ? T : T.slice(0, FIRST)).map(card).join("");
      btn.hidden = all || T.length <= FIRST; btn.textContent = `Show all ${ALL.length} reviews`;
      requestAnimationFrame(() => $$(".quote", box).forEach((q) => { const bq = $("blockquote", q); if (bq.scrollHeight > bq.clientHeight + 2) $(".quote__more", q).hidden = false; }));
    };
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".quote__more"); if (!b) return;
      const bq = b.previousElementSibling, open = bq.classList.toggle("clamp") === false;
      b.textContent = open ? "Show less" : "Read more";
    });
    btn.addEventListener("click", () => { all = true; draw(); });
    draw();
  })();

  /* ───────── ieee ───────── */
  $("#ieeeCount").textContent = S.ieee.length;
  $("#roles").innerHTML = S.ieee.map(([y, r, now]) => `<li class="${now ? "now" : ""}"><span class="y">${y}</span><span class="r">${esc(r)}</span></li>`).join("");

  /* ───────── awards ───────── */
  const yearOf = (t) => (t.match(/(20\d\d)/) || [, ""])[1];
  $("#awardGrid").innerHTML = S.awards.map(([k, t], i) => `
    <div class="award reveal${i === 0 ? " feat" : ""}"><div class="k"><span>${k}</span><span>${yearOf(t)}</span></div><p>${esc(t)}</p></div>`).join("");

  /* ───────── contact json + footer ───────── */
  const so = S.social;
  const j = (k, v, href, last) => `  <span class="k">"${k}"</span><span class="p">:</span> <span class="s"><a href="${href}"${href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>"${esc(v)}"</a></span>${last ? "" : '<span class="p">,</span>'}`;
  $("#social").innerHTML = Object.entries(so).map(([k, v]) => `<li><a href="${v}" target="_blank" rel="noopener">${k}</a></li>`).join("");
  $("#yr").textContent = new Date().getFullYear();

  /* ═════════════ the shell ═════════════ */
  const quake = $("#quake");
  let lastFocus = null;
  const openQuake = () => { if (!quake.hidden) return; lastFocus = document.activeElement; quake.hidden = false; $("#qCmd").focus(); };
  const closeQuake = () => { if (quake.hidden) return; quake.hidden = true; lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true }); };
  const goTo = (id) => { closeQuake(); const t = document.getElementById(id); if (t) setTimeout(() => t.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }), 180); };

  const PS1 = `<span class="ps1"><span class="u">yeshwanth@cloud</span>:<span class="p">~</span>$</span>`;
  const hist = [];

  function makeShell(root) {
    const out = $("[data-out]", root), input = $("[data-input]", root), ghost = $("[data-ghost]", root), scroller = $("[data-scroll]", root);
    const print = (html) => { const d = document.createElement("p"); d.className = "ln"; d.innerHTML = html; out.appendChild(d); scroller.scrollTop = scroller.scrollHeight; return d; };
    const jump = (id, note) => { print(`<span class="d">${note} →</span>`); setTimeout(() => goTo(id), 350); };
    let hIdx = hist.length;

    const C = {
      help: () => print(`<span class="grid2">${[
        ["whoami", "the short version"], ["about", "the long version"], ["work", "where I've worked"], ["talks", "where I've spoken"], ["videos", "latest on YouTube"], ["community", "talks · mentoring · ieee"],
        ["ieee", "volunteer roles"], ["awards", "recognition"], ["invite", "book me for your event"], ["ping", "send me a message"], ["book", "book a 1:1 call"], ["reviews", "what mentees say"], ["social", "find me online"],
        ["theme", "toggle light / dark"], ["accent", "orange | green"], ["clear", "clean slate"],
      ].map(([a, b]) => `<span>${a}</span><span class="d">${b}</span>`).join("")}</span>`),
      whoami: () => print(`<b>${S.name}</b>\n${S.role} <span class="d">@</span> Confluent\n<span class="d">data · ai · cloud · aws community builder · ug leader mysuru · mct</span>`),
      about: () => jump("about", "cat about.md"),
      work: () => { S.experience.filter((x) => !x.across).forEach((x) => print(`<span class="${x.now ? "ok" : "w"}">${x.co.padEnd(15)}</span>${esc(x.role)}`)); jump("work", "git log --format=career"); },
      talks: () => { print(`50+ talks & workshops. latest:`); print(`  <span class="d">›</span> ${esc(talksAll[0][1][0][0])}`); jump("talks", "opening ~/talks"); },
      videos: () => {
        if (!VIDEOS.length) return jump("videos", "opening ~/videos");
        const longform = VIDEOS.filter((v) => !v.short);
        print(`<span class="w">Tech With Yeshwanth</span> <span class="d">· latest uploads</span>`);
        longform.slice(0, 3).forEach((v) => print(`  <span class="d">${(v.published ? ago(v.published) : "").padEnd(14)}</span><a href="https://youtu.be/${v.id}" target="_blank" rel="noopener">${esc(v.title)}</a>`));
        jump("videos", `${VIDEOS.length} uploads`);
      },
      ping: async () => {
        print(`PING yeshwanth (mysuru.in): 56 data bytes`);
        await sleep(reduced ? 0 : 300);
        print(`64 bytes from <span class="ok">yeshwanth</span>: icmp_seq=1 ttl=64 time=${12 + Math.floor(Math.random() * 30)} ms`);
        print(`<span class="d">opening the message box →</span>`);
        goTo("invite"); setTimeout(() => $("#msg").focus({ preventScroll: true }), 900);
      },
      book: () => { print(`<span class="ok">✓</span> opening topmate.io/techwithyeshwanth`); window.open(S.booking, "_blank", "noopener"); },
      reviews: () => { const R = S.reviewSummary; print(`<span class="w">★★★★★</span> ${R.rating} <span class="d">·</span> ${R.ratings} ratings <span class="d">·</span> ${R.count} testimonials`); print(`  <span class="d">“${esc(S.testimonials[0].text.slice(0, 90))}…”</span>`); jump("mentoring", "opening testimonials"); },
      community: () => { ["aws user group mysuru · leader", "ieee bangalore section · execom"].forEach((c) => print(`<span class="ok">●</span> ${c}`)); jump("community", "opening ~/community"); },
      ieee: () => { print(`<span class="ok">●</span> ieee.service — <span class="ok">active (running)</span> since 2019`); print(`  current: ${esc(S.ieee[0][1])}`); jump("ieee", "systemctl status ieee"); },
      awards: () => { print(`<span class="ok">PASS</span> ${S.awards.length}/${S.awards.length} achievements`); jump("awards", "npm test"); },
      invite: () => { print(`<span class="ok">✓</span> opening the message box`); goTo("invite"); setTimeout(() => $("#msg").focus({ preventScroll: true }), 900); },
      social: () => Object.entries(so).forEach(([k, v]) => print(`<span class="ok">${k.padEnd(10)}</span><a href="${v}" target="_blank" rel="noopener">${esc(v.replace(/^https:\/\/(www\.)?/, ""))}</a>`)),
      contact: () => { print(`email  <a href="mailto:${S.email}">${S.email}</a>`); jump("invite", "opening contact"); },
      ls: () => print(`<span class="bl">talks/</span>  <span class="bl">ieee/</span>  about.md  awards.txt  <span class="ok">invite.sh</span>`),
      cat: (a) => { const f = (a[0] || "").replace(/^\.?\/?/, ""); const m = { "about.md": "about", "awards.txt": "awards" }; m[f] ? jump(m[f], `cat ${f}`) : print(`<span class="err">cat: ${esc(f || "")}: No such file or directory</span>`); },
      cd: (a) => { const t = (a[0] || "").replace(/[~/.]/g, ""); const m = { talks: "talks", ieee: "ieee", "": "top" }; m[t] !== undefined ? goTo(m[t]) : print(`<span class="err">cd: no such file or directory: ${esc(a[0])}</span>`); },
      accent: (a) => {
        const v = a[0] === "green" ? "green" : a[0] === "orange" ? "orange" : (document.documentElement.dataset.accent === "green" ? "orange" : "green");
        if (v === "orange") delete document.documentElement.dataset.accent; else document.documentElement.dataset.accent = v;
        try { v === "orange" ? localStorage.removeItem("ylm-accent") : localStorage.setItem("ylm-accent", v); } catch {}
        print(`<span class="ok">✓</span> accent → ${v}`);
      },
      theme: (a) => { const t = a[0] === "light" || a[0] === "dark" ? a[0] : (document.documentElement.dataset.theme === "dark" ? "light" : "dark"); setTheme(t); print(`<span class="ok">✓</span> theme → ${t}`); },
      date: () => print(new Date().toString()),
      uptime: () => print(`up ${new Date().getFullYear() - 2019} years in IEEE · load average: 10,000+ learners, 50+ talks`),
      echo: (a) => print(esc(a.join(" "))),
      history: () => hist.forEach((h, i) => print(`<span class="d">${String(i + 1).padStart(4)}</span>  ${esc(h)}`)),
      clear: () => { out.innerHTML = ""; },
      sudo: () => print(`<span class="w">yeshwanth is not in the sudoers file. This incident will be reported.</span>\n<span class="d">(to the IEEE Ethics and Member Conduct Committee, probably)</span>`),
      rm: () => print(`<span class="err">rm: operation not permitted</span> <span class="d">— nice try</span>`),
      kafka: async () => {
        print(`<span class="d">$ kafka-console-consumer --topic hello.visitor --from-beginning</span>`);
        for (const [i, m] of ["hello, world", "thanks for stopping by", "type 'invite' to book a talk"].entries()) { await sleep(reduced ? 0 : 360); print(`<span class="d">[${i}]</span> {"msg": <span class="ok">"${m}"</span>}`); }
        print(`<span class="d">% reached end of topic at offset 3</span>`);
      },
      exit: () => { if (!quake.hidden) closeQuake(); else print(`<span class="d">there's no escape — but there is more below ↓</span>`); },
    };
    const A = { topmate: "book", call: "book", testimonials: "reviews", youtube: "videos", yt: "videos", experience: "work", career: "work", "?": "help", man: "help", achievements: "awards", communities: "community", hire: "invite", email: "contact", cls: "clear", vim: "exit", "./invite.sh": "invite", "invite.sh": "invite" };
    const NAMES = Object.keys(C).sort();

    const run = async (raw) => {
      const line = raw.trim();
      print(`${PS1} ${esc(line)}`);
      if (!line) return;
      hist.push(line); hIdx = hist.length;
      const [c0, ...args] = line.split(/\s+/);
      const key = A[c0.toLowerCase()] || c0.toLowerCase();
      if (C[key]) await C[key](args);
      else print(`<span class="err">command not found: ${esc(c0)}</span> <span class="d">— try</span> help`);
    };
    const suggest = () => {
      const v = input.value;
      const hit = v && !v.includes(" ") ? NAMES.find((n) => n.startsWith(v.toLowerCase()) && n !== v) : null;
      ghost.textContent = hit ? hit.slice(v.length) : "";
      if (hit) ghost.style.left = `calc(${input.offsetLeft}px + ${v.length}ch)`;
      return hit;
    };
    input.addEventListener("input", suggest);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Tab" || (e.key === "ArrowRight" && input.selectionStart === input.value.length && ghost.textContent)) {
        const h = suggest(); if (h || e.key === "Tab") e.preventDefault(); if (h) { input.value = h; suggest(); }
      } else if (e.key === "ArrowUp") { e.preventDefault(); if (hIdx > 0) input.value = hist[--hIdx]; suggest(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); hIdx = Math.min(hist.length, hIdx + 1); input.value = hist[hIdx] || ""; suggest(); }
      else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); C.clear(); }
    });
    $("[data-form]", root).addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; ghost.textContent = ""; run(v); });
    scroller.addEventListener("click", (e) => { if (!e.target.closest("a,button") && !getSelection().toString()) input.focus({ preventScroll: true }); });
    return { print, run, input };
  }

  const hero = makeShell($("#heroTerm"));
  const qs = makeShell(quake);
  qs.print(`<span class="d">drop-down terminal · type</span> help <span class="d">· esc to close</span>`);

  const chipBox = $("[data-chips]", $("#heroTerm"));
  ["help", "whoami", "work", "talks", "videos", "community", "invite", "kafka"].forEach((c) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = c;
    b.addEventListener("click", () => hero.run(c)); chipBox.appendChild(b);
  });

  /* boot sequence in the hero terminal */
  (async () => {
    let fast = reduced;
    const skip = () => { fast = true; };
    hero.input.addEventListener("focus", skip, { once: true });
    const typeLine = async (cmd) => {
      const l = hero.print(`${PS1} <span class="tc"></span><span class="cur"></span>`);
      const t = $(".tc", l);
      if (!fast) await sleep(350);
      for (const ch of cmd) { t.textContent += ch; if (!fast) await sleep(45 + Math.random() * 50); }
      $(".cur", l).remove();
      if (!fast) await sleep(180);
    };
    const d = new Date();
    hero.print(`<span class="d">Last login: ${d.toDateString()} ${d.toTimeString().slice(0, 5)} on ttys001</span>`);
    await typeLine("whoami");
    hero.print(`solutions engineer / architect <span class="d">@</span> confluent`);
    await typeLine("stack --streaming");
    hero.print(`<span class="bl">kafka</span> · <span class="bl">flink</span> · <span class="bl">spark</span> · <span class="bl">databricks</span> <span class="d">on</span> aws · azure · gcp`);
    await typeLine("certs --list");
    hero.print(`<span class="w">aws-sa-pro</span> <span class="d">·</span> <span class="w">mct</span> <span class="d">·</span> <span class="w">aws-community-builder</span>`);
    await typeLine("community --roles");
    hero.print(`aws ug leader mysuru <span class="d">·</span> execom, ieee bangalore section`);
    await typeLine("now");
    hero.print(`architecting · teaching · speaking <span class="d">— type</span> <span class="ok">help</span>`);
  })();

  /* quake open/close */
  $("#openTerm").addEventListener("click", openQuake);
  $("#closeTerm").addEventListener("click", closeQuake);
  quake.addEventListener("click", (e) => { if (e.target === quake) closeQuake(); });
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((e.key === "`" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); quake.hidden ? openQuake() : closeQuake(); }
    else if (e.key === "Escape" && !quake.hidden) closeQuake();
    else if (e.key === "Tab" && !quake.hidden) { /* keep focus inside dialog */
      const f = $$("button, input", quake); const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ───────── scroll: reveal, nav state ───────── */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((el) => io.observe(el));
  const nav = $("#nav"), links = $$(".nav__links a");
  const onScroll = () => {
    nav.classList.toggle("scrolled", scrollY > 8);
    let cur = "";
    ["about", "work", "videos", "community", "talks", "mentoring", "ieee", "awards", "invite"].forEach((id) => { const s = document.getElementById(id); if (s.getBoundingClientRect().top < innerHeight * 0.4) cur = id; });
    const group = ["community", "talks", "mentoring", "ieee"].includes(cur);
    links.forEach((a) => {
      const h = a.getAttribute("href");
      a.classList.toggle("on", a.classList.contains("dd__btn") ? group : h === `#${cur}`);
    });
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
})();
