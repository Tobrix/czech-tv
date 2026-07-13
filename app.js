// ==========================================================================
// State
// ==========================================================================
const STORAGE_FAVORITES = "tv.favorites.v1";
const STORAGE_RECENTS = "tv.recents.v1";

const state = {
  activeGroup: "__all",
  query: "",
  favorites: loadJSON(STORAGE_FAVORITES, []),
  recents: loadJSON(STORAGE_RECENTS, []), // array of channel ids, most recent first
  currentChannel: null,
  hls: null,
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

const channelById = Object.fromEntries(CHANNELS.map(c => [c.id, c]));

// A channel is at risk of being blocked by the browser's mixed-content policy
// when this app is served over https but the stream itself is plain http.
function isMixedContentRisk(url) {
  return location.protocol === "https:" && /^http:\/\//i.test(url);
}

// ==========================================================================
// DOM refs
// ==========================================================================
const el = (id) => document.getElementById(id);
const sidebarGroups = el("sidebarGroups");
const sidebarList = el("sidebarList");
const categorySheetList = el("categorySheetList");
const channelSections = el("channelSections");
const emptyState = el("emptyState");
const emptyStateText = el("emptyStateText");
const continueRow = el("continueRow");
const continueScroll = el("continueScroll");
const topbarTitle = el("topbarTitle");

const channelCardTpl = el("channelCardTpl");
const continueCardTpl = el("continueCardTpl");
const playerChipTpl = el("playerChipTpl");

// ==========================================================================
// Build sidebar / tab groups
// ==========================================================================
function groupsWithCounts() {
  const counts = {};
  CHANNELS.forEach(c => { counts[c.group] = (counts[c.group] || 0) + 1; });
  return CHANNEL_GROUP_ORDER
    .filter(g => counts[g])
    .map(g => ({ key: g, label: CHANNEL_GROUP_LABELS[g] || g, count: counts[g] }));
}

function iconForGroup() {
  return `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>`;
}

function renderSidebarGroups() {
  const groups = groupsWithCounts();
  sidebarGroups.innerHTML = groups.map(g => `
    <li><button class="sidebar-item" data-group="${g.key}">
      ${iconForGroup()}
      <span>${g.label}</span>
    </button></li>
  `).join("");

  categorySheetList.innerHTML = `
    <li><button data-group="__all" class="${state.activeGroup === '__all' ? 'active' : ''}">
      <span>Vše</span><span class="count">${CHANNELS.length}</span>
    </button></li>
    <li><button data-group="__favorites" class="${state.activeGroup === '__favorites' ? 'active' : ''}">
      <span>Oblíbené</span><span class="count">${state.favorites.length}</span>
    </button></li>
  ` + groups.map(g => `
    <li><button data-group="${g.key}" class="${state.activeGroup === g.key ? 'active' : ''}">
      <span>${g.label}</span><span class="count">${g.count}</span>
    </button></li>
  `).join("");
}

function groupLabel(key) {
  if (key === "__all") return "Vše";
  if (key === "__favorites") return "Oblíbené";
  return CHANNEL_GROUP_LABELS[key] || key;
}

// ==========================================================================
// Filtering + rendering channel grid
// ==========================================================================
function matchesQuery(channel, q) {
  if (!q) return true;
  const hay = (channel.name + " " + channel.group).toLowerCase();
  return hay.includes(q.toLowerCase());
}

function getFilteredChannels() {
  let list = CHANNELS;
  if (state.activeGroup === "__favorites") {
    list = CHANNELS.filter(c => state.favorites.includes(c.id));
  } else if (state.activeGroup !== "__all") {
    list = CHANNELS.filter(c => c.group === state.activeGroup);
  }
  if (state.query) {
    list = list.filter(c => matchesQuery(c, state.query));
  }
  return list;
}

function buildChannelCard(channel) {
  const node = channelCardTpl.content.firstElementChild.cloneNode(true);
  const img = node.querySelector(".channel-logo");
  img.src = channel.logo || "";
  img.alt = channel.name;
  img.onerror = () => { img.style.visibility = "hidden"; };
  node.querySelector(".channel-name").textContent = channel.name;
  node.querySelector(".channel-group").textContent = groupLabel(channel.group);
  const favDot = node.querySelector(".fav-dot");
  if (state.favorites.includes(channel.id)) favDot.classList.add("on");
  if (isMixedContentRisk(channel.url)) {
    node.querySelector(".insecure-badge").classList.remove("hidden");
  }
  node.addEventListener("click", () => openPlayer(channel.id));
  return node;
}

function renderGrid() {
  const filtered = getFilteredChannels();
  channelSections.innerHTML = "";

  // "Vše" or search or favorites: single grid grouped by category headers (if __all/search), flat if favorites
  if (state.activeGroup === "__favorites") {
    if (filtered.length === 0) {
      showEmpty("Zatím nemáte žádné oblíbené kanály. Klepnutím na srdce v přehrávači kanál přidáte.");
      topbarTitle.textContent = "Oblíbené";
      return;
    }
    hideEmpty();
    topbarTitle.textContent = "Oblíbené";
    channelSections.appendChild(buildFlatGrid(filtered));
    return;
  }

  if (filtered.length === 0) {
    showEmpty(state.query ? `Nic jsme nenašli pro „${state.query}“` : "Nic jsme nenašli");
    topbarTitle.textContent = state.query ? "Hledat" : groupLabel(state.activeGroup);
    return;
  }
  hideEmpty();

  if (state.activeGroup !== "__all" || state.query) {
    // flat grid for a single category or a search result
    topbarTitle.textContent = state.query ? "Hledat" : groupLabel(state.activeGroup);
    channelSections.appendChild(buildFlatGrid(filtered));
    return;
  }

  // __all with no query: grouped shelves by category, in defined order
  topbarTitle.textContent = "Vše";
  const groups = groupsWithCounts();
  groups.forEach(g => {
    const items = CHANNELS.filter(c => c.group === g.key);
    if (!items.length) return;
    const section = document.createElement("section");
    section.className = "group-section";
    section.innerHTML = `
      <div class="group-header">
        <h3 class="group-title">${g.label}</h3>
        <span class="group-count">${items.length} ${items.length === 1 ? "kanál" : (items.length < 5 ? "kanály" : "kanálů")}</span>
      </div>
    `;
    const grid = document.createElement("div");
    grid.className = "channel-grid";
    items.forEach(c => grid.appendChild(buildChannelCard(c)));
    section.appendChild(grid);
    channelSections.appendChild(section);
  });
}

function buildFlatGrid(items) {
  const grid = document.createElement("div");
  grid.className = "channel-grid";
  items.forEach(c => grid.appendChild(buildChannelCard(c)));
  return grid;
}

function showEmpty(text) {
  emptyStateText.textContent = text;
  emptyState.classList.remove("hidden");
}
function hideEmpty() {
  emptyState.classList.add("hidden");
}

function renderContinueRow() {
  const recentChannels = state.recents.map(id => channelById[id]).filter(Boolean).slice(0, 12);
  if (!recentChannels.length || state.activeGroup !== "__all" || state.query) {
    continueRow.classList.add("hidden");
    return;
  }
  continueRow.classList.remove("hidden");
  continueScroll.innerHTML = "";
  recentChannels.forEach(c => {
    const node = continueCardTpl.content.firstElementChild.cloneNode(true);
    const img = node.querySelector(".continue-logo");
    img.src = c.logo || "";
    img.alt = c.name;
    img.onerror = () => { img.style.visibility = "hidden"; };
    node.querySelector(".continue-name").textContent = c.name;
    node.addEventListener("click", () => openPlayer(c.id));
    continueScroll.appendChild(node);
  });
}

function renderAll() {
  renderSidebarGroups();
  renderContinueRow();
  renderGrid();
  syncActiveNav();
}

function syncActiveNav() {
  document.querySelectorAll(".sidebar-item, .tab-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.group === state.activeGroup);
  });
}

// ==========================================================================
// Navigation events
// ==========================================================================
document.addEventListener("click", (e) => {
  const groupBtn = e.target.closest("[data-group]");
  if (groupBtn && groupBtn.closest("#sidebar, #tabbar, #categorySheet")) {
    const g = groupBtn.dataset.group;
    if (g === "__categories") {
      openCategorySheet();
      return;
    }
    state.activeGroup = g;
    state.query = "";
    el("searchInput").value = "";
    el("searchInputMobile").value = "";
    closeCategorySheet();
    renderAll();
    el("content").scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
});

el("searchInput").addEventListener("input", (e) => {
  state.query = e.target.value.trim();
  renderGrid();
  renderContinueRow();
});
el("searchInputMobile").addEventListener("input", (e) => {
  state.query = e.target.value.trim();
  renderGrid();
  renderContinueRow();
});

el("topbarSearchBtn").addEventListener("click", () => {
  el("topbarSearchBar").classList.add("show");
  el("searchInputMobile").focus();
});
el("topbarSearchClose").addEventListener("click", () => {
  el("topbarSearchBar").classList.remove("show");
  el("searchInputMobile").value = "";
  state.query = "";
  renderGrid();
  renderContinueRow();
});

// Category sheet
function openCategorySheet() {
  renderSidebarGroups();
  el("categorySheet").classList.remove("hidden");
}
function closeCategorySheet() {
  el("categorySheet").classList.add("hidden");
}
document.querySelector("#categorySheet .sheet-backdrop").addEventListener("click", closeCategorySheet);

// ==========================================================================
// Player
// ==========================================================================
const videoEl = el("video");
const playerEl = el("player");
const miniPlayerEl = el("miniPlayer");
const playerLoading = el("playerLoading");
const playerError = el("playerError");

function pushRecent(id) {
  state.recents = [id, ...state.recents.filter(x => x !== id)].slice(0, 20);
  saveJSON(STORAGE_RECENTS, state.recents);
}

function openPlayer(id) {
  const channel = channelById[id];
  if (!channel) return;
  state.currentChannel = channel;
  pushRecent(id);

  el("playerLogo").src = channel.logo || "";
  el("playerLogo").onerror = () => { el("playerLogo").style.visibility = "hidden"; };
  el("playerLogo").style.visibility = "visible";
  el("playerName").textContent = channel.name;
  el("playerGroup").textContent = groupLabel(channel.group);
  updateFavButton();

  el("miniLogo").src = channel.logo || "";
  el("miniLogo").onerror = () => { el("miniLogo").style.visibility = "hidden"; };
  el("miniLogo").style.visibility = "visible";
  el("miniName").textContent = channel.name;
  el("miniGroup").textContent = groupLabel(channel.group);

  playerEl.classList.remove("hidden");
  miniPlayerEl.classList.add("hidden");
  document.body.style.overflow = "hidden";

  renderPlayerChips();
  loadStream(channel);
  renderAll(); // refresh fav dots / recents shelf
}

function closePlayerToMini() {
  playerEl.classList.add("hidden");
  document.body.style.overflow = "";
  if (state.currentChannel) miniPlayerEl.classList.remove("hidden");
}

function stopPlayback() {
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  videoEl.pause();
  videoEl.removeAttribute("src");
  videoEl.load();
}

function fullyClosePlayer() {
  stopPlayback();
  state.currentChannel = null;
  playerEl.classList.add("hidden");
  miniPlayerEl.classList.add("hidden");
  document.body.style.overflow = "";
}

function showPlayerError(message, { offerCopy = false, url = "", offerRetry = true } = {}) {
  playerLoading.classList.add("hidden");
  el("playerErrorText").textContent = message;
  const copyBtn = el("playerCopyUrl");
  const retryBtn = el("playerRetry");
  retryBtn.classList.toggle("hidden", !offerRetry);
  if (offerCopy) {
    copyBtn.classList.remove("hidden");
    copyBtn.onclick = () => {
      navigator.clipboard?.writeText(url).then(() => {
        copyBtn.textContent = "Zkopírováno";
        setTimeout(() => { copyBtn.textContent = "Zkopírovat adresu streamu"; }, 1500);
      }).catch(() => {});
    };
  } else {
    copyBtn.classList.add("hidden");
  }
  playerError.classList.remove("hidden");
}

function loadStream(channel) {
  stopPlayback();
  playerError.classList.add("hidden");
  el("playerCopyUrl").classList.add("hidden");

  const url = channel.url;

  // Browsers block http:// streams on an https:// page (mixed content) —
  // this fails silently at the network layer, so we catch it up front
  // instead of showing a generic "couldn't load" message.
  if (isMixedContentRisk(url)) {
    showPlayerError(
      "Tento kanál používá nezabezpečené (http) spojení, které prohlížeč na zabezpečené (https) stránce blokuje. Zkopíruj si adresu streamu a přehraj ji např. ve VLC, nebo appku hostuj přes http.",
      { offerCopy: true, url, offerRetry: false }
    );
    return;
  }

  playerLoading.classList.remove("hidden");
  const useNativeHls = videoEl.canPlayType("application/vnd.apple.mpegurl");

  const onReady = () => {
    playerLoading.classList.add("hidden");
    videoEl.play().catch(() => {});
  };
  const onError = () => {
    showPlayerError("Kanál se nepodařilo načíst. Zdroj může být dočasně nedostupný.", { offerCopy: true, url });
  };

  if (useNativeHls) {
    // Safari / iOS: native HLS support
    videoEl.src = url;
    videoEl.addEventListener("loadedmetadata", onReady, { once: true });
    videoEl.addEventListener("error", onError, { once: true });
  } else if (window.Hls && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, liveSyncDurationCount: 3 });
    state.hls = hls;
    hls.on(Hls.Events.MANIFEST_PARSED, onReady);
    hls.on(Hls.Events.ERROR, (evt, data) => {
      if (data.fatal) onError();
    });
    hls.loadSource(url);
    hls.attachMedia(videoEl);
  } else {
    onError();
  }
}

el("playerClose").addEventListener("click", closePlayerToMini);
el("playerRetry").addEventListener("click", () => {
  if (state.currentChannel) loadStream(state.currentChannel);
});
miniPlayerEl.addEventListener("click", () => {
  if (!state.currentChannel) return;
  playerEl.classList.remove("hidden");
  miniPlayerEl.classList.add("hidden");
  document.body.style.overflow = "hidden";
});

el("playerMute").addEventListener("click", () => {
  videoEl.muted = !videoEl.muted;
  el("playerMute").classList.toggle("on", videoEl.muted);
});

el("playerFullscreen").addEventListener("click", () => {
  if (videoEl.requestFullscreen) videoEl.requestFullscreen();
  else if (videoEl.webkitEnterFullscreen) videoEl.webkitEnterFullscreen(); // iOS Safari
});

el("playerFav").addEventListener("click", () => {
  if (!state.currentChannel) return;
  toggleFavorite(state.currentChannel.id);
  updateFavButton();
});

function updateFavButton() {
  const on = state.currentChannel && state.favorites.includes(state.currentChannel.id);
  el("playerFav").classList.toggle("on", !!on);
}

function toggleFavorite(id) {
  if (state.favorites.includes(id)) {
    state.favorites = state.favorites.filter(x => x !== id);
  } else {
    state.favorites = [...state.favorites, id];
  }
  saveJSON(STORAGE_FAVORITES, state.favorites);
  renderAll();
}

function renderPlayerChips() {
  const scroll = el("playerChannelsScroll");
  scroll.innerHTML = "";
  let list = getFilteredChannels();
  if (!list.length) list = CHANNELS;
  list.forEach(c => {
    const chip = playerChipTpl.content.firstElementChild.cloneNode(true);
    const img = chip.querySelector("img");
    img.src = c.logo || "";
    img.onerror = () => { img.style.visibility = "hidden"; };
    chip.querySelector("span").textContent = c.name;
    if (state.currentChannel && c.id === state.currentChannel.id) chip.classList.add("active");
    chip.addEventListener("click", () => openPlayer(c.id));
    scroll.appendChild(chip);
  });
}

// Keyboard: Esc closes player
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !playerEl.classList.contains("hidden")) {
    closePlayerToMini();
  }
});

// ==========================================================================
// Init
// ==========================================================================
renderAll();

// Register service worker for installability / offline app shell
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
