/* The message form in the Invite section; sending is shown as a real `ping`. No dependencies. */
(() => {
  "use strict";
  const $ = (q) => document.querySelector(q);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CFG = window.YLM_CONFIG || {};
  const API = (CFG.apiUrl || "").replace(/\/$/, "");

  /* ── Cloudflare Turnstile: invisible human check, only shows a box if it is unsure ── */
  let tsToken = null, tsWidget = null;
  const tsReady = new Promise((resolve) => {
    if (!CFG.turnstileSiteKey) return resolve(false);
    window.__ylmTs = () => {
      tsWidget = window.turnstile.render("#ts", {
        sitekey: CFG.turnstileSiteKey, action: "contact", appearance: "interaction-only",
        theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
        callback: (t) => { tsToken = t; }, "expired-callback": () => { tsToken = null; }, "error-callback": () => { tsToken = null; },
      });
      resolve(true);
    };
    const sc = document.createElement("script");
    sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__ylmTs";
    sc.async = true; sc.defer = true; sc.onerror = () => resolve(false);
    document.head.appendChild(sc);
  });
  const waitForToken = async (ms = 8000) => {
    const end = Date.now() + ms;
    while (!tsToken && Date.now() < end) await new Promise((r) => setTimeout(r, 150));
    return tsToken;
  };


  const form = $("#pingForm"), msg = $("#msg"), count = $("#count"), term = $("#term"), send = $("#send"), state = $("#state");
  const line = (html, cls = "") => { const p = document.createElement("p"); p.className = `ln ${cls}`; p.innerHTML = html; term.appendChild(p); return p; };
  const bytes = () => new TextEncoder().encode(msg.value).length;
  const topic = () => (form.querySelector('input[name="topic"]:checked') || {}).value || "Question";

  /* idle screen: updates live as you type */
  const idle = () => {
    term.innerHTML = "";
    line(`<span class="u">$</span> ping -c 1 yeshwanth`);
    line(`<span class="d">PING yeshwanth (mysuru.in): <b class="w" id="sz">${bytes()}</b> data bytes · topic: <span class="bl" id="tp">${esc(topic())}</span></span>`);
    line(`<span class="d">waiting for your message…</span><span class="cur"></span>`);
  };
  idle();
  const refresh = () => {
    const n = msg.value.length;
    count.textContent = `${n.toLocaleString()} / 5000`;
    count.classList.toggle("warn", n > 4500);
    const sz = $("#sz"), tp = $("#tp");
    if (sz) sz.textContent = bytes();
    if (tp) tp.textContent = topic();
  };
  msg.addEventListener("input", refresh);
  form.addEventListener("change", refresh);

  let busy = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!msg.value.trim()) { msg.focus(); term.innerHTML = ""; line(`<span class="u">$</span> ping -c 1 yeshwanth`); line(`<span class="err">ping: cannot send an empty packet. Write a message first.</span>`); return; }
    const email = form.email.value.trim();
    if (email && !form.email.checkValidity()) { form.email.focus(); line(`<span class="err">ping: "${esc(email)}" doesn't look like an email address</span>`); return; }
    if (form._honey.value) return; // bot

    busy = true; send.disabled = true; send.classList.add("is-busy");
    state.innerHTML = `<span class="pulse" aria-hidden="true"></span>sending`;
    term.innerHTML = "";
    line(`<span class="u">$</span> ping -c 1 yeshwanth`);
    line(`PING yeshwanth (mysuru.in): ${bytes()} data bytes`);
    const wait = line(`<span class="d">transmitting</span><span class="dots"></span>`);

    const t0 = performance.now();
    // One path only: our API (bot check + rate limit + store + email to me). No third-party form service.
    let ok = false, reason = "";
    if (!API || !(await tsReady)) reason = "the message service isn't set up yet";
    else {
      const token = await waitForToken();
      if (!token) reason = "please complete the human check below the form";
      else {
        try {
          const r = await fetch(`${API}/messages`, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: topic(), message: msg.value, name: form.name.value.trim(), email, turnstileToken: token, _honey: form._honey.value }) });
          const j = await r.json().catch(() => ({}));
          ok = r.status === 201;
          if (!ok) reason = (j.error && j.error.message) || `error ${r.status}`;
        } catch { reason = "network error"; }
        tsToken = null; if (window.turnstile && tsWidget !== null) window.turnstile.reset(tsWidget); // tokens are single-use
      }
    }
    const ms = Math.max(1, Math.round(performance.now() - t0));
    await sleep(350);
    wait.remove();

    if (ok) {
      line(`64 bytes from <span class="ok">yeshwanth</span>: icmp_seq=1 ttl=64 time=${ms} ms`);
      await sleep(250);
      line(`<span class="d">--- yeshwanth ping statistics ---</span>`);
      line(`1 packet transmitted, <span class="ok">1 received</span>, 0% packet loss`);
      await sleep(200);
      line(`<span class="ok">✓</span> delivered. ${email ? "I'll reply to <span class=\"bl\">" + esc(email) + "</span>." : "No email given, so this one's a one-way ping. Thank you!"}`);
      state.innerHTML = `<span class="pulse" aria-hidden="true"></span>delivered`;
      form.reset(); refresh();
      send.innerHTML = `<span class="mono">$</span> ping again <span aria-hidden="true">⏎</span>`;
    } else {
      line(`<span class="err">Request timeout for icmp_seq 1</span>${reason ? ` <span class="d">(${esc(reason)})</span>` : ""}`);
      line(`<span class="d">--- yeshwanth ping statistics ---</span>`);
      line(`1 packet transmitted, 0 received, <span class="err">100% packet loss</span>`);
      line(`<span class="d">your message is still in the box. try again, or</span> <a href="mailto:techwithyeshwanth@gmail.com?subject=${encodeURIComponent("Ping: " + topic())}&body=${encodeURIComponent(msg.value)}">send it by email</a>`);
      state.innerHTML = `<span class="pulse" aria-hidden="true"></span>retry`;
    }
    busy = false; send.disabled = false; send.classList.remove("is-busy");
  });
})();
