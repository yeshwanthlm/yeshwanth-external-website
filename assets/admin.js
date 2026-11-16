/* /admin inbox: Cognito sign-in (auth code + PKCE), then list / mark read / delete messages.
   ?demo shows sample data so the page can be previewed before the backend is deployed. */
(() => {
  "use strict";
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const C = window.YLM_CONFIG || {};
  const LOCAL = ["127.0.0.1", "localhost"].includes(location.hostname); // demo + setup hints only on your own machine
  const DEMO = LOCAL && new URLSearchParams(location.search).has("demo");
  const REDIRECT = `${location.origin}/admin/`;
  const TOPICS = ["Talk or workshop", "Question", "Collaboration", "Video feedback", "Just saying hi"];

  const setTheme = (t) => { document.documentElement.dataset.theme = t; try { localStorage.setItem("ylm-theme", t); } catch {} };
  $("#themeBtn").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  /* ───────── auth: Cognito hosted UI, authorization code + PKCE ───────── */
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const randomStr = (n = 48) => b64url(crypto.getRandomValues(new Uint8Array(n)));
  const store = sessionStorage;

  async function login() {
    const verifier = randomStr(64), state = randomStr(16);
    store.setItem("pkce_verifier", verifier); store.setItem("pkce_state", state);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const u = new URL(`${C.cognitoDomain}/oauth2/authorize`);
    Object.entries({ response_type: "code", client_id: C.cognitoClient, redirect_uri: REDIRECT, scope: "openid email", code_challenge_method: "S256", code_challenge: challenge, state })
      .forEach(([k, v]) => u.searchParams.set(k, v));
    location.assign(u);
  }

  async function finishLogin(code, state) {
    if (state !== store.getItem("pkce_state")) throw new Error("Sign-in state mismatch. Try again.");
    const r = await fetch(`${C.cognitoDomain}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: C.cognitoClient, code, redirect_uri: REDIRECT, code_verifier: store.getItem("pkce_verifier") }),
    });
    if (!r.ok) throw new Error("Sign-in failed. Try again.");
    const t = await r.json();
    store.setItem("tokens", JSON.stringify({ access: t.access_token, id: t.id_token, exp: Date.now() + t.expires_in * 1000 }));
    store.removeItem("pkce_verifier"); store.removeItem("pkce_state");
    history.replaceState(null, "", REDIRECT);
  }

  const tokens = () => { try { const t = JSON.parse(store.getItem("tokens")); return t && t.exp > Date.now() + 30_000 ? t : null; } catch { return null; } };
  const emailOf = (idToken) => { try { return JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email; } catch { return ""; } };
  function logout() {
    store.removeItem("tokens");
    if (DEMO || !C.cognitoDomain) return location.assign("/admin/");
    const u = new URL(`${C.cognitoDomain}/logout`); u.searchParams.set("client_id", C.cognitoClient); u.searchParams.set("logout_uri", REDIRECT);
    location.assign(u);
  }

  /* ───────── API ───────── */
  const api = async (method, path, body) => {
    const r = await fetch(`${C.apiUrl.replace(/\/$/, "")}${path}`, {
      method, headers: { Authorization: `Bearer ${tokens().access}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { store.removeItem("tokens"); showGate("Your session expired. Sign in again."); throw new Error("unauthorized"); }
    if (!r.ok) throw new Error(`API error ${r.status}`);
    return r.json();
  };

  /* ───────── demo data ───────── */
  const demoItems = () => {
    const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    return [
      ["Talk or workshop", "IEEE YP Summit 2027, Bengaluru, 12 Feb, around 400 people. Would love a keynote on agentic AI on AWS. Can we get on a call next week?", "Ananya R", "ananya@example.org", 2, false],
      ["Question", "How do you handle memory across sessions in AgentCore when the user comes back days later? Loved the video!", "Rahul", "rahul.dev@example.com", 9, false],
      ["Video feedback", "The Lambda MicroVMs walkthrough was great. A follow-up on cold-start numbers with bigger images would help a lot.", "", "", 30, true],
      ["Collaboration", "We run a Kafka meetup in Hyderabad and would love to co-host a session with AWS UG Mysuru.", "Meera K", "meera@example.net", 52, false],
      ["Just saying hi", "Your channel helped me land my first cloud job. Thank you!", "Arjun", "", 120, true],
    ].map(([topic, message, name, email, h, read], i) => { const id = `00000000-0000-4000-8000-00000000000${i}`, createdAt = ago(h); return { id, sk: `${createdAt}#${id}`, createdAt, topic, message, name, email, read }; });
  };

  /* ───────── views ───────── */
  const gate = $("#gate"), inbox = $("#inbox");
  function showGate(note) {
    inbox.hidden = true; gate.hidden = false; $("#logout").hidden = true; $("#who").hidden = true;
    if (!C.apiUrl || !C.cognitoDomain) {
      if (!LOCAL) { gate.innerHTML = `<div class="adm__login"><p class="lede">This page isn't available.</p><p class="adm__hint mono"><a class="link-arrow" href="/">← back to the site</a></p></div>`; return; }
      gate.innerHTML = `
        <div class="term term--card">
          <div class="term__bar"><span class="lights" aria-hidden="true"><i></i><i></i><i></i></span><span class="term__title">~ — setup</span></div>
          <div class="term__body term__body--static">
            <p class="ln"><span class="err">✗</span> backend not deployed yet</p>
            <p class="ln d">the inbox needs the AWS backend in <span class="w">infra/</span>. deploy it once:</p>
            <p class="ln"><span class="u">$</span> cd infra</p>
            <p class="ln"><span class="u">$</span> terraform init</p>
            <p class="ln"><span class="u">$</span> terraform apply</p>
            <p class="ln d">then reload this page.</p>
          </div>
        </div>
        <p class="adm__hint mono"><a class="link-arrow" href="?demo">preview the inbox with sample data →</a></p>`;
      return;
    }
    gate.innerHTML = `
      <div class="adm__login">
        <p class="lede">${esc(note || "Only you can see these messages. Sign in to continue.")}</p>
        <button class="btn" id="signin" type="button">Sign in <span aria-hidden="true">→</span></button>
        <p class="adm__hint mono">private · owner only</p>
      </div>`;
    $("#signin").addEventListener("click", login);
  }

  let ITEMS = [], filter = "unread";
  const fmt = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const since = (iso) => { const m = (Date.now() - new Date(iso)) / 6e4; if (m < 60) return `${Math.max(1, Math.round(m))}m ago`; const h = m / 60; if (h < 24) return `${Math.round(h)}h ago`; return `${Math.round(h / 24)}d ago`; };

  function render() {
    const q = $("#q").value.trim().toLowerCase();
    const unread = ITEMS.filter((m) => !m.read).length;
    const byTopic = Object.fromEntries(TOPICS.map((t) => [t, ITEMS.filter((m) => m.topic === t).length]));
    $("#stats").innerHTML = [
      ["total", ITEMS.length], ["unread", unread], ["talk invites", byTopic["Talk or workshop"]], ["this week", ITEMS.filter((m) => Date.now() - new Date(m.createdAt) < 7 * 864e5).length],
    ].map(([k, v]) => `<div><b>${v}</b><span class="mono">${k}</span></div>`).join("");

    const tabs = [["unread", `Unread ${unread}`], ["all", `All ${ITEMS.length}`], ...TOPICS.filter((t) => byTopic[t]).map((t) => [t, `${t.replace("Talk or workshop", "Talks")} ${byTopic[t]}`])];
    $("#filters").innerHTML = tabs.map(([k, l]) => `<button type="button" role="tab" data-f="${esc(k)}" aria-selected="${k === filter}">${esc(l)}</button>`).join("");

    const shown = ITEMS.filter((m) => (filter === "all" || (filter === "unread" ? !m.read : m.topic === filter)) &&
      (!q || [m.name, m.email, m.message, m.topic].some((v) => (v || "").toLowerCase().includes(q))));
    $("#status").innerHTML = `$ inbox ls --${filter === "all" ? "all" : filter === "unread" ? "unread" : "topic"} <span>·</span> <b>${shown.length} shown</b>${DEMO ? ' <span>· demo data</span>' : ""}`;
    $("#list").innerHTML = shown.length ? shown.map((m) => `
      <li class="msg${m.read ? " is-read" : ""}" data-id="${esc(m.id)}" data-sk="${esc(m.sk)}">
        <div class="msg__head">
          <span class="msg__dot" aria-label="${m.read ? "read" : "unread"}"></span>
          <span class="msg__topic mono">${esc(m.topic)}</span>
          <span class="msg__who"><b>${esc(m.name || "Anonymous")}</b>${m.email ? ` <a class="link-arrow mono" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("Re: your message on yeshwanthlm.in")}">${esc(m.email)}</a>` : ' <span class="dim mono">no email</span>'}</span>
          <time class="msg__time mono" datetime="${esc(m.createdAt)}" title="${esc(fmt(m.createdAt))}">${since(m.createdAt)}</time>
        </div>
        <p class="msg__body">${esc(m.message)}</p>
        <div class="msg__actions">
          ${m.email ? `<a class="btn btn--sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("Re: your message on yeshwanthlm.in")}&body=${encodeURIComponent(`\n\n---\n${m.message}`)}">Reply</a>` : ""}
          <button class="btn btn--sm btn--ghost" data-act="read" type="button">${m.read ? "Mark unread" : "Mark read"}</button>
          <button class="btn btn--sm btn--ghost btn--danger" data-act="delete" type="button">Delete</button>
        </div>
      </li>`).join("") : `<li class="msgs__empty mono">${ITEMS.length ? "nothing here 🎉 inbox zero for this filter" : "no messages yet. they'll appear here as soon as someone pings you."}</li>`;
  }

  async function load() {
    $("#status").textContent = "$ inbox ls … loading";
    ITEMS = DEMO ? demoItems() : (await api("GET", "/admin/messages")).items;
    render();
  }

  $("#filters").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { filter = b.dataset.f; render(); } });
  $("#q").addEventListener("input", render);
  $("#refresh").addEventListener("click", () => load().catch((e) => { $("#status").textContent = `✗ ${e.message}`; }));
  $("#logout").addEventListener("click", logout);
  $("#list").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const li = b.closest(".msg"), m = ITEMS.find((x) => x.id === li.dataset.id); if (!m) return;
    b.disabled = true;
    try {
      if (b.dataset.act === "read") {
        if (!DEMO) await api("PATCH", `/admin/messages/${encodeURIComponent(m.id)}`, { sk: m.sk, read: !m.read });
        m.read = !m.read;
      } else {
        if (!confirm(`Delete this message${m.name ? ` from ${m.name}` : ""}? This cannot be undone.`)) { b.disabled = false; return; }
        if (!DEMO) await api("DELETE", `/admin/messages/${encodeURIComponent(m.id)}`, { sk: m.sk });
        ITEMS = ITEMS.filter((x) => x !== m);
      }
      render();
    } catch (err) { b.disabled = false; $("#status").textContent = `✗ ${err.message}`; }
  });

  function showInbox(email) {
    gate.hidden = true; inbox.hidden = false; $("#logout").hidden = false;
    const who = $("#who"); who.hidden = !email; who.textContent = email || "";
    load().catch((e) => { if (e.message !== "unauthorized") $("#status").textContent = `✗ ${e.message}`; });
  }

  /* ───────── boot ───────── */
  (async () => {
    if (DEMO) return showInbox("demo mode");
    if (!C.apiUrl || !C.cognitoDomain) return showGate();
    const p = new URLSearchParams(location.search);
    if (p.get("code")) { try { await finishLogin(p.get("code"), p.get("state")); } catch (e) { return showGate(e.message); } }
    const t = tokens();
    t ? showInbox(emailOf(t.id)) : showGate();
  })();
})();
