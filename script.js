// ========== SUPABASE CONFIGURATION ==========
const SUPABASE_URL = 'https://zqqrajzjncirvywmewkf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxcXJhanpqbmNpcnZ5d21ld2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjY1NDIsImV4cCI6MjA5NjEwMjU0Mn0.mVCtw5SbvSxlgMWeiMW2k-uwpqqs23_-MU868_eR8OY';

let supabaseClient;
let customArtists = [];
let customTracks = [];
let trendingSongs = [];
let tapCount = 0;
let tapTimer = null;
let currentPlayingSongId = null;
let navigationHistory = [];
let currentPage = 1;
let itemsPerPage = 15;
let currentArtistTracks = [];
let isAdminLoggedIn = false;

const ADMIN_PASSWORD = 'Buliisa2024';

// Admin selection sets for bulk delete
let selectedSongsForDelete = new Set();
let selectedArtistsForDelete = new Set();

// ========== HELPER FUNCTIONS ==========
function showToast(msg, isError = false) {
  let t = document.createElement('div');
  t.className = 'toast-notification';
  t.style.background = isError ? '#dc2626' : '#1f2937';
  t.style.borderLeftColor = isError ? '#dc2626' : '#f59e0b';
  t.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-info-circle'} mr-2"></i>${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatTime(s) {
  if (isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function showCircularLoading() {
  const overlay = document.querySelector('.circular-loading-overlay');
  if (overlay) overlay.classList.add('active');
}

function hideCircularLoading() {
  const overlay = document.querySelector('.circular-loading-overlay');
  if (overlay) overlay.classList.remove('active');
}

// ========== APK DOWNLOAD ==========
function downloadApk() {
  const apkUrl = 'https://zqqrajzjncirvywmewkf.supabase.co/storage/v1/object/public/apks/buliisa-expose.apk';
  window.location.href = apkUrl;
}

// ========== LOAD DATA FROM SUPABASE ==========
async function loadDataFromSupabase() {
  showCircularLoading();
  try {
    const { data: artists } = await supabaseClient.from('artists').select('*').order('name');
    const { data: tracks } = await supabaseClient.from('tracks').select('*').order('created_at', { ascending: false });
    const { data: trending } = await supabaseClient.from('trending').select('track_id');
    
    customArtists = artists || [];
    customTracks = tracks || [];
    trendingSongs = trending?.map(t => t.track_id) || [];
    
    renderAllSections();
    if (isAdminLoggedIn) {
      renderAdminSongsTable();
      renderAdminArtistsTable();
    }
    hideCircularLoading();
  } catch (e) {
    hideCircularLoading();
    console.error(e);
    showToast('Error loading data', true);
  }
}

// ========== RENDER FUNCTIONS ==========
function renderSongCard(track, rank = null) {
  const playCount = parseInt(track.plays || 0);
  const downloadCount = parseInt(track.downloads || 0);
  const rankHtml = rank ? `<div class="most-played-rank">${rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}</div>` : '';
  const coverImg = track.cover_image || 'https://placehold.co/400x400/1a1a2e/ffffff?text=No+Cover';
  
  return `
    <div class="track-card" data-track-id="${track.id}">
      <div class="relative cursor-pointer" onclick="goToArtistProfile('${escapeHtml(track.artist)}')">
        ${rankHtml}
        <div class="play-count"><i class="fas fa-headphones"></i> ${formatNumber(playCount)}</div>
        <div class="aspect-square"><img src="${coverImg}" class="w-full h-full object-cover" loading="lazy" onerror="this.src='https://placehold.co/400x400/1a1a2e/ffffff?text=Music'"></div>
      </div>
      <div class="p-4">
        <h3 class="font-bold truncate text-white cursor-pointer hover:text-amber-400" onclick="goToArtistProfile('${escapeHtml(track.artist)}')">${escapeHtml(track.title)}</h3>
        <p class="text-amber-300 text-sm truncate cursor-pointer hover:text-amber-200" onclick="goToArtistProfile('${escapeHtml(track.artist)}')">${escapeHtml(track.artist)}</p>
        <div class="flex justify-between mt-2 text-xs text-gray-500">
          <span><i class="fas fa-download"></i> ${formatNumber(downloadCount)}</span>
          <span><i class="fas fa-play"></i> ${formatNumber(playCount)}</span>
        </div>
        <div class="flex justify-between items-center mt-3 gap-2">
          <button class="card-play-btn flex-1 text-white px-4 py-2 rounded-lg text-sm" data-id="${track.id}" data-url="${track.audio_url}" data-title="${escapeHtml(track.title)}" data-artist="${escapeHtml(track.artist)}"><i class="fas fa-play"></i> Play</button>
          <button class="card-download-btn bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm" data-id="${track.id}" data-url="${track.audio_url}" data-title="${escapeHtml(track.title)}"><i class="fas fa-download"></i></button>
        </div>
      </div>
    </div>
  `;
}

function renderFeaturedArtists() {
  const grid = document.getElementById('artistsGrid');
  if (!grid) return;
  if (!customArtists.length) {
    grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-400">No artists found</div>';
    return;
  }
  let html = '';
  customArtists.slice(0, 12).forEach(artist => {
    const imgUrl = artist.image_url || 'https://placehold.co/400x400/1a1a2e/ffffff?text=Artist';
    html += `<div class="featured-artist-card" data-artist='${JSON.stringify(artist)}'><div class="artist-circle"><img src="${imgUrl}" loading="lazy" onerror="this.src='https://placehold.co/400x400/1a1a2e/ffffff?text=Artist'"><div class="artist-name"><span>${escapeHtml(artist.name)}</span></div></div></div>`;
  });
  grid.innerHTML = html;
  document.querySelectorAll('.featured-artist-card').forEach(card => {
    card.addEventListener('click', () => {
      const artist = JSON.parse(card.dataset.artist);
      showArtistMusic(artist);
    });
  });
}

function renderTrendingSongs() {
  const grid = document.getElementById('trendingGrid');
  if (!grid) return;
  const trending = customTracks.filter(t => trendingSongs.includes(t.id));
  if (!trending.length) {
    grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-400">No trending songs</div>';
    return;
  }
  let html = '';
  trending.slice(0, 8).forEach(track => { html += renderSongCard(track); });
  grid.innerHTML = html;
  attachCardButtonEvents();
}

function renderNewSongs() {
  const grid = document.getElementById('newSongsGrid');
  if (!grid) return;
  const news = customTracks.filter(t => t.is_new === true);
  if (!news.length) {
    grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-400">No new releases</div>';
    return;
  }
  let html = '';
  news.slice(0, 8).forEach(track => { html += renderSongCard(track); });
  grid.innerHTML = html;
  attachCardButtonEvents();
}

function renderMostPlayedSongs() {
  const grid = document.getElementById('mostPlayedGrid');
  if (!grid) return;
  let mostPlayed = [...customTracks].sort((a, b) => parseInt(b.plays || 0) - parseInt(a.plays || 0)).slice(0, 8);
  let html = '';
  mostPlayed.forEach((track, index) => { html += renderSongCard(track, index + 1); });
  grid.innerHTML = html;
  attachCardButtonEvents();
}

function renderCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;
  const categories = [
    { name: "Ugandan Music", icon: "fas fa-flag-africa" },
    { name: "Alur Music", icon: "fas fa-drumstick-bite" },
    { name: "Lugungu Music", icon: "fas fa-language" },
    { name: "Kadongo Kamu", icon: "fas fa-guitar" },
    { name: "Old Music", icon: "fas fa-clock" },
    { name: "Home Gospel", icon: "fas fa-home" },
    { name: "Ligala Music", icon: "fas fa-church" },
    { name: "Afrobeats", icon: "fas fa-drum" },
    { name: "R&B", icon: "fas fa-heart" },
    { name: "Pop", icon: "fas fa-star" }
  ];
  let html = '';
  categories.forEach(cat => {
    const count = customArtists.filter(a => a.category === cat.name).length;
    html += `<div class="category-chip" data-category='${JSON.stringify(cat)}'><i class="${cat.icon} text-amber-400 mr-2"></i><span>${cat.name}</span><span class="ml-2 text-xs text-gray-400">(${count})</span></div>`;
  });
  grid.innerHTML = html;
  document.querySelectorAll('.category-chip').forEach(el => {
    el.addEventListener('click', () => {
      const cat = JSON.parse(el.dataset.category);
      showCategoryArtists(cat);
    });
  });
}

function renderAllSections() {
  renderCategories();
  renderFeaturedArtists();
  renderNewSongs();
  renderTrendingSongs();
  renderMostPlayedSongs();
}

// ========== ARTIST MUSIC VIEW ==========
async function showArtistMusic(artist, addToHistory = true) {
  showCircularLoading();
  await new Promise(resolve => setTimeout(resolve, 100));
  
  currentArtistTracks = customTracks.filter(t => t.artist === artist.name);
  currentPage = 1;
  
  document.getElementById('mainContent')?.classList.add('hidden');
  document.getElementById('categoryArtistsSection')?.classList.add('hidden');
  document.getElementById('searchResultsSection')?.classList.add('hidden');
  document.getElementById('artistMusicSection')?.classList.remove('hidden');
  
  document.getElementById('selectedArtistName').innerText = artist.name;
  document.getElementById('artistTrackCount').innerText = `${currentArtistTracks.length} songs`;
  
  const imgDiv = document.getElementById('selectedArtistImage');
  const imgUrl = artist.image_url || 'https://placehold.co/400x400/1a1a2e/ffffff?text=Artist';
  imgDiv.innerHTML = `<img src="${imgUrl}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/400x400/1a1a2e/ffffff?text=Artist'">`;
  
  renderArtistTracksList();
  showSimilarArtists(artist.id);
  showRandomMusicRecommendations(artist.name);
  
  if (addToHistory) pushToHistory('artist', artist);
  hideCircularLoading();
}

function renderArtistTracksList() {
  const container = document.getElementById('artistTracksGrid');
  if (!container) return;
  
  const start = (currentPage - 1) * itemsPerPage;
  const paginated = currentArtistTracks.slice(start, start + itemsPerPage);
  const totalPages = Math.ceil(currentArtistTracks.length / itemsPerPage);
  
  if (!paginated.length) {
    container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-400">No tracks found</div>';
    return;
  }
  
  let html = '<div class="artist-songs-list">';
  paginated.forEach((track, index) => {
    const playCount = parseInt(track.plays || 0);
    const downloadCount = parseInt(track.downloads || 0);
    const globalRank = (currentPage - 1) * itemsPerPage + index + 1;
    
    html += `
      <div class="song-list-item">
        <div class="song-list-content">
          <div class="song-rank-number">
            <span class="rank-number">${globalRank}</span>
          </div>
          <div class="song-title-section">
            <div class="song-title">
              <span class="song-title-main">${escapeHtml(track.title)}</span>
            </div>
            <div class="song-artist-name"><i class="fas fa-microphone-alt text-amber-400 mr-1"></i> ${escapeHtml(track.artist)}</div>
          </div>
          <div class="song-actions">
            <div class="song-stats">
              <span><i class="fas fa-headphones text-blue-400"></i> ${formatNumber(playCount)}</span>
              <span><i class="fas fa-download text-green-400"></i> ${formatNumber(downloadCount)}</span>
            </div>
            <button class="song-play-btn-list" data-id="${track.id}" data-url="${track.audio_url}" data-title="${escapeHtml(track.title)}" data-artist="${escapeHtml(track.artist)}"><i class="fas fa-play"></i> Play</button>
            <button class="song-download-btn-list" data-id="${track.id}" data-url="${track.audio_url}" data-title="${escapeHtml(track.title)}"><i class="fas fa-download"></i></button>
          </div>
        </div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
  
  if (totalPages > 1) {
    let paginationHtml = `<div class="pagination-container"><button class="pagination-btn prev-page" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> Previous</button><span class="page-info">${currentPage} / ${totalPages}</span><button class="pagination-btn next-page" ${currentPage === totalPages ? 'disabled' : ''}>Next <i class="fas fa-chevron-right"></i></button></div>`;
    container.insertAdjacentHTML('beforeend', paginationHtml);
    document.querySelector('.prev-page')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderArtistTracksList(); window.scrollTo({ top: 0 }); } });
    document.querySelector('.next-page')?.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; renderArtistTracksList(); window.scrollTo({ top: 0 }); } });
  }
  
  attachListButtonEvents();
}

function attachListButtonEvents() {
  document.querySelectorAll('.song-play-btn-list').forEach(btn => {
    btn.removeEventListener('click', handleListPlay);
    btn.addEventListener('click', handleListPlay);
  });
  document.querySelectorAll('.song-download-btn-list').forEach(btn => {
    btn.removeEventListener('click', handleListDownload);
    btn.addEventListener('click', handleListDownload);
  });
}

function handleListPlay(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const songId = parseInt(btn.dataset.id);
  const url = btn.dataset.url;
  const title = btn.dataset.title;
  const artist = btn.dataset.artist;
  
  if (currentPlayingSongId === songId && window.audioEl && !window.audioEl.paused) {
    window.audioEl.pause();
    document.getElementById('playPauseIcon')?.classList.replace('fa-pause', 'fa-play');
    btn.innerHTML = '<i class="fas fa-play"></i> Play';
  } else {
    playTrack(url, title, artist, songId);
    btn.innerHTML = '<i class="fas fa-pause"></i> Playing';
    document.querySelectorAll('.song-play-btn-list').forEach(otherBtn => {
      if (otherBtn !== btn) otherBtn.innerHTML = '<i class="fas fa-play"></i> Play';
    });
  }
}

function handleListDownload(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  window.open(btn.dataset.url, '_blank');
  showToast(`Downloading ${btn.dataset.title}`);
  const trackId = parseInt(btn.dataset.id);
  const track = customTracks.find(t => t.id === trackId);
  if (track) {
    const newDownloads = (parseInt(track.downloads || 0) + 1).toString();
    track.downloads = newDownloads;
    supabaseClient.from('tracks').update({ downloads: newDownloads }).eq('id', trackId);
  }
}

function attachCardButtonEvents() {
  document.querySelectorAll('.card-play-btn').forEach(btn => {
    btn.removeEventListener('click', handleCardPlay);
    btn.addEventListener('click', handleCardPlay);
  });
  document.querySelectorAll('.card-download-btn').forEach(btn => {
    btn.removeEventListener('click', handleCardDownload);
    btn.addEventListener('click', handleCardDownload);
  });
}

function handleCardPlay(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const songId = parseInt(btn.dataset.id);
  const url = btn.dataset.url;
  const title = btn.dataset.title;
  const artist = btn.dataset.artist;
  
  if (currentPlayingSongId === songId && window.audioEl && !window.audioEl.paused) {
    window.audioEl.pause();
    document.getElementById('playPauseIcon')?.classList.replace('fa-pause', 'fa-play');
    btn.innerHTML = '<i class="fas fa-play"></i> Play';
  } else {
    playTrack(url, title, artist, songId);
    btn.innerHTML = '<i class="fas fa-pause"></i> Playing';
    document.querySelectorAll('.card-play-btn').forEach(otherBtn => {
      if (otherBtn !== btn) otherBtn.innerHTML = '<i class="fas fa-play"></i> Play';
    });
  }
}

function handleCardDownload(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  window.open(btn.dataset.url, '_blank');
  showToast(`Downloading ${btn.dataset.title}`);
  const trackId = parseInt(btn.dataset.id);
  const track = customTracks.find(t => t.id === trackId);
  if (track) {
    const newDownloads = (parseInt(track.downloads || 0) + 1).toString();
    track.downloads = newDownloads;
    supabaseClient.from('tracks').update({ downloads: newDownloads }).eq('id', trackId);
  }
}

function playTrack(url, title, artist, songId) {
  const player = document.getElementById('globalAudioPlayer');
  const audio = document.getElementById('globalAudio');
  if (player) player.style.display = 'flex';
  audio.src = url;
  audio.play();
  
  document.getElementById('nowPlayingTitle').innerText = title;
  document.getElementById('nowPlayingArtist').innerText = artist;
  document.getElementById('playPauseIcon')?.classList.replace('fa-play', 'fa-pause');
  currentPlayingSongId = songId;
  
  const track = customTracks.find(t => t.id === songId);
  if (track) {
    const newPlays = (parseInt(track.plays || 0) + 1).toString();
    track.plays = newPlays;
    supabaseClient.from('tracks').update({ plays: newPlays }).eq('id', songId);
  }
}

async function showSimilarArtists(currentArtistId) {
  const similar = customArtists.filter(a => a.id !== currentArtistId).slice(0, 6);
  const section = document.getElementById('similarArtistsSection');
  const grid = document.getElementById('similarArtistsGrid');
  if (!similar.length || !section || !grid) { if (section) section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  let html = '';
  similar.forEach(artist => {
    const imgUrl = artist.image_url || 'https://placehold.co/400x400/1a1a2e/ffffff?text=Artist';
    html += `<div class="similar-artist-card" data-artist='${JSON.stringify(artist)}'><img src="${imgUrl}" onerror="this.src='https://placehold.co/400x400/1a1a2e/ffffff?text=Artist'"><div class="artist-name"><span>${escapeHtml(artist.name)}</span></div></div>`;
  });
  grid.innerHTML = html;
  document.querySelectorAll('.similar-artist-card').forEach(card => {
    card.addEventListener('click', () => { const artist = JSON.parse(card.dataset.artist); showArtistMusic(artist); });
  });
}

function showRandomMusicRecommendations(currentArtist) {
  const randomTracks = customTracks.filter(t => t.artist !== currentArtist).sort(() => 0.5 - Math.random()).slice(0, 8);
  const section = document.getElementById('moreMusicYouMayLikeSection');
  const grid = document.getElementById('moreMusicGrid');
  if (!randomTracks.length || !section || !grid) { if (section) section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  let html = '';
  randomTracks.forEach(track => {
    const coverImg = track.cover_image || 'https://placehold.co/400x400/1a1a2e/ffffff?text=Music';
    html += `<div class="more-music-card" onclick="goToArtistProfile('${escapeHtml(track.artist)}')"><img src="${coverImg}" loading="lazy" onerror="this.src='https://placehold.co/400x400/1a1a2e/ffffff?text=Music'"><div class="p-3"><h3 class="font-bold truncate">${escapeHtml(track.title)}</h3><p class="text-amber-300 text-xs truncate">${escapeHtml(track.artist)}</p></div></div>`;
  });
  grid.innerHTML = html;
}

async function showCategoryArtists(cat, addToHistory = true) {
  showCircularLoading();
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const artists = customArtists.filter(a => a.category === cat.name);
  document.getElementById('mainContent')?.classList.add('hidden');
  document.getElementById('artistMusicSection')?.classList.add('hidden');
  document.getElementById('searchResultsSection')?.classList.add('hidden');
  document.getElementById('categoryArtistsSection')?.classList.remove('hidden');
  
  document.getElementById('selectedCategoryName').innerHTML = `<i class="${cat.icon} text-amber-400 mr-2"></i> ${cat.name} Artists`;
  document.getElementById('categoryArtistCount').innerHTML = `${artists.length} artists found`;
  
  const grid = document.getElementById('categoryArtistsGrid');
  if (!artists.length) { grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-400">No artists found</div>'; hideCircularLoading(); return; }
  
  let html = '';
  artists.forEach(artist => {
    const imgUrl = artist.image_url || 'https://placehold.co/400x400/1a1a2e/ffffff?text=Artist';
    html += `<div class="category-artist-card" data-artist='${JSON.stringify(artist)}'><img src="${imgUrl}" onerror="this.src='https://placehold.co/400x400/1a1a2e/ffffff?text=Artist'"><div class="artist-name"><span>${escapeHtml(artist.name)}</span></div></div>`;
  });
  grid.innerHTML = html;
  
  document.querySelectorAll('.category-artist-card').forEach(card => {
    card.addEventListener('click', () => { const artist = JSON.parse(card.dataset.artist); showArtistMusic(artist); });
  });
  
  if (addToHistory) pushToHistory('category', cat);
  hideCircularLoading();
}

window.goToArtistProfile = function(artistName) {
  const artist = customArtists.find(a => a.name === artistName);
  if (artist) showArtistMusic(artist);
  else showToast('Artist not found', true);
};

function pushToHistory(section, data) { navigationHistory.push({ section, data }); updateBackButton(); }
function updateBackButton() { const btn = document.getElementById('backNavigationBtn'); if (btn) { if (navigationHistory.length > 1) btn.classList.remove('hidden'); else btn.classList.add('hidden'); } }

function goBack() { 
  if (navigationHistory.length > 1) { 
    navigationHistory.pop(); 
    const prev = navigationHistory[navigationHistory.length - 1]; 
    if (prev.section === 'home') showHomepage(); 
    else if (prev.section === 'artist') showArtistMusic(prev.data, false); 
    else if (prev.section === 'category') showCategoryArtists(prev.data, false); 
  } else { 
    showHomepage(); 
  } 
  updateBackButton(); 
}

function showHomepage() { 
  document.getElementById('mainContent')?.classList.remove('hidden'); 
  document.getElementById('categoryArtistsSection')?.classList.add('hidden'); 
  document.getElementById('artistMusicSection')?.classList.add('hidden'); 
  document.getElementById('searchResultsSection')?.classList.add('hidden'); 
  navigationHistory = [{ section: 'home' }]; 
  updateBackButton(); 
  window.scrollTo({ top: 0 }); 
}

async function performSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return showHomepage();
  
  showCircularLoading();
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const results = [...customTracks.filter(t => t.title.toLowerCase().includes(query.toLowerCase()) || t.artist.toLowerCase().includes(query.toLowerCase())), ...customArtists.filter(a => a.name.toLowerCase().includes(query.toLowerCase()))].slice(0, 20);
  
  document.getElementById('mainContent').classList.add('hidden');
  document.getElementById('searchResultsSection').classList.remove('hidden');
  
  const grid = document.getElementById('searchResultsGrid');
  if (!results.length) { 
    grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-400">No results</div>'; 
    hideCircularLoading(); 
    return; 
  }
  
  let html = '';
  results.forEach(r => {
    if (r.title) { 
      html += renderSongCard(r); 
    } else { 
      const imgUrl = r.image_url || 'https://placehold.co/400x400/1a1a2e/ffffff?text=Artist'; 
      html += `<div class="featured-artist-card cursor-pointer" onclick='showArtistMusic(${JSON.stringify(r)})'><div class="artist-circle"><img src="${imgUrl}" class="rounded-full border-2 border-amber-500"><div class="artist-name mt-2"><span>${escapeHtml(r.name)}</span></div></div></div>`; 
    }
  });
  grid.innerHTML = html;
  attachCardButtonEvents();
  hideCircularLoading();
}

// ========== ADMIN PANEL FUNCTIONS ==========
function showAdminLogin() {
  const password = prompt('Enter admin password:');
  if (password === ADMIN_PASSWORD) {
    isAdminLoggedIn = true;
    document.getElementById('adminModal').classList.add('active');
    renderAdminSongsTable();
    renderAdminArtistsTable();
    setupAdminTabs();
    showToast('Admin access granted');
  } else if (password !== null) {
    showToast('Wrong password!', true);
  }
}

function closeAdminPanel() {
  document.getElementById('adminModal').classList.remove('active');
}

function setupAdminTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tabId}Panel`).classList.add('active');
      
      if (tabId === 'songs') renderAdminSongsTable();
      if (tabId === 'artists') renderAdminArtistsTable();
    });
  });
}

function renderAdminSongsTable() {
  const searchTerm = document.getElementById('songSearchInput')?.value.toLowerCase() || '';
  let filteredSongs = [...customTracks];
  
  if (searchTerm) {
    filteredSongs = filteredSongs.filter(song => 
      song.title.toLowerCase().includes(searchTerm) || 
      song.artist.toLowerCase().includes(searchTerm)
    );
  }
  
  if (!filteredSongs.length) {
    document.getElementById('songsTableContainer').innerHTML = '<div class="text-center py-8 text-gray-400">No songs found</div>';
    return;
  }
  
  let html = `<table class="w-full"><thead><tr class="border-b border-gray-700"><th class="p-3 text-left"><input type="checkbox" id="adminSelectAllSongs" class="admin-checkbox"></th><th class="p-3 text-left">#</th><th class="p-3 text-left">Cover</th><th class="p-3 text-left">Title</th><th class="p-3 text-left">Artist</th><th class="p-3 text-left">Plays</th><th class="p-3 text-left">Downloads</th><th class="p-3 text-left">Action</th></tr></thead><tbody>`;
  
  filteredSongs.forEach((song, index) => {
    const isChecked = selectedSongsForDelete.has(song.id);
    const coverImg = song.cover_image || 'https://placehold.co/50x50/1a1a2e/ffffff?text=No+Cover';
    html += `<tr class="border-b border-gray-800 hover:bg-gray-800/50"><td class="p-3"><input type="checkbox" class="song-checkbox admin-checkbox" data-id="${song.id}" ${isChecked ? 'checked' : ''}></td><td class="p-3">${index + 1}</td><td class="p-3"><img src="${coverImg}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 8px;"></td><td class="p-3">${escapeHtml(song.title)}</td><td class="p-3">${escapeHtml(song.artist)}</td><td class="p-3">${formatNumber(song.plays || 0)}</td><td class="p-3">${formatNumber(song.downloads || 0)}</td><td class="p-3"><button class="delete-btn" onclick="deleteSingleSong(${song.id})"><i class="fas fa-trash"></i> Delete</button></td></tr>`;
  });
  
  html += '</tbody></table>';
  document.getElementById('songsTableContainer').innerHTML = html;
  
  document.querySelectorAll('.song-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      if (e.target.checked) selectedSongsForDelete.add(id);
      else selectedSongsForDelete.delete(id);
    });
  });
  
  const selectAllBtn = document.getElementById('adminSelectAllSongs');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('change', (e) => {
      document.querySelectorAll('.song-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
        const id = parseInt(cb.dataset.id);
        if (e.target.checked) selectedSongsForDelete.add(id);
        else selectedSongsForDelete.delete(id);
      });
    });
  }
}

function renderAdminArtistsTable() {
  const searchTerm = document.getElementById('artistSearchInput')?.value.toLowerCase() || '';
  let filteredArtists = [...customArtists];
  
  if (searchTerm) {
    filteredArtists = filteredArtists.filter(artist => 
      artist.name.toLowerCase().includes(searchTerm)
    );
  }
  
  if (!filteredArtists.length) {
    document.getElementById('artistsTableContainer').innerHTML = '<div class="text-center py-8 text-gray-400">No artists found</div>';
    return;
  }
  
  let html = `<table class="w-full"><thead><tr class="border-b border-gray-700"><th class="p-3 text-left"><input type="checkbox" id="adminSelectAllArtists" class="admin-checkbox"></th><th class="p-3 text-left">#</th><th class="p-3 text-left">Image</th><th class="p-3 text-left">Name</th><th class="p-3 text-left">Category</th><th class="p-3 text-left">Songs</th><th class="p-3 text-left">Action</th></tr></thead><tbody>`;
  
  filteredArtists.forEach((artist, index) => {
    const isChecked = selectedArtistsForDelete.has(artist.id);
    const imgUrl = artist.image_url || 'https://placehold.co/50x50/1a1a2e/ffffff?text=Artist';
    const songCount = customTracks.filter(t => t.artist === artist.name).length;
    
    html += `<tr class="border-b border-gray-800 hover:bg-gray-800/50"><td class="p-3"><input type="checkbox" class="artist-checkbox admin-checkbox" data-id="${artist.id}" ${isChecked ? 'checked' : ''}></td><td class="p-3">${index + 1}</td><td class="p-3"><img src="${imgUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 50%;"></td><td class="p-3">${escapeHtml(artist.name)}</td><td class="p-3">${escapeHtml(artist.category || 'Uncategorized')}</td><td class="p-3">${songCount}</td><td class="p-3"><button class="delete-btn" onclick="deleteSingleArtist(${artist.id})"><i class="fas fa-trash"></i> Delete</button></td></tr>`;
  });
  
  html += '</tbody></table>';
  document.getElementById('artistsTableContainer').innerHTML = html;
  
  document.querySelectorAll('.artist-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      if (e.target.checked) selectedArtistsForDelete.add(id);
      else selectedArtistsForDelete.delete(id);
    });
  });
  
  const selectAllBtn = document.getElementById('adminSelectAllArtists');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('change', (e) => {
      document.querySelectorAll('.artist-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
        const id = parseInt(cb.dataset.id);
        if (e.target.checked) selectedArtistsForDelete.add(id);
        else selectedArtistsForDelete.delete(id);
      });
    });
  }
}

window.deleteSingleSong = async function(songId) {
  if (confirm('Are you sure you want to delete this song?')) {
    showCircularLoading();
    const { error } = await supabaseClient.from('tracks').delete().eq('id', songId);
    if (error) {
      showToast('Error deleting song', true);
    } else {
      showToast('Song deleted successfully');
      await loadDataFromSupabase();
      if (isAdminLoggedIn) renderAdminSongsTable();
    }
    hideCircularLoading();
  }
};

window.deleteSingleArtist = async function(artistId) {
  const artist = customArtists.find(a => a.id === artistId);
  if (confirm(`Delete "${artist?.name}" and ALL their songs? This cannot be undone!`)) {
    showCircularLoading();
    
    const artistSongs = customTracks.filter(t => t.artist === artist?.name);
    for (const song of artistSongs) {
      await supabaseClient.from('tracks').delete().eq('id', song.id);
    }
    
    const { error } = await supabaseClient.from('artists').delete().eq('id', artistId);
    
    if (error) {
      showToast('Error deleting artist', true);
    } else {
      showToast(`Deleted "${artist?.name}" and ${artistSongs.length} songs`);
      await loadDataFromSupabase();
      if (isAdminLoggedIn) renderAdminArtistsTable();
    }
    hideCircularLoading();
  }
};

// Batch Upload using your existing buckets
document.getElementById('processBatchUpload')?.addEventListener('click', async () => {
  const musicFiles = document.getElementById('musicFilesInput').files;
  const coverFiles = document.getElementById('coverImagesInput').files;
  
  if (!musicFiles.length) {
    showToast('Please select music files', true);
    return;
  }
  
  if (musicFiles.length > 20) {
    showToast('Maximum 20 songs per batch', true);
    return;
  }
  
  showCircularLoading();
  let successCount = 0;
  
  for (let i = 0; i < musicFiles.length; i++) {
    const musicFile = musicFiles[i];
    const coverFile = coverFiles[i] || (coverFiles.length ? coverFiles[0] : null);
    
    let title = musicFile.name.replace(/\.[^/.]+$/, '');
    title = title.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    
    const artist = prompt(`Enter artist name for "${title}" (${i+1}/${musicFiles.length}):`);
    
    if (!artist) {
      showToast(`Skipped "${title}" - no artist name`, true);
      continue;
    }
    
    try {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const safeFileName = `${timestamp}_${randomId}_${musicFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      // Upload to music-files bucket
      const { error: musicError } = await supabaseClient.storage
        .from('music-files')
        .upload(safeFileName, musicFile);
      
      if (musicError) throw musicError;
      
      const { data: urlData } = supabaseClient.storage
        .from('music-files')
        .getPublicUrl(safeFileName);
      
      const musicUrl = urlData.publicUrl;
      
      // Upload cover to artist_images bucket
      let coverUrl = null;
      if (coverFile) {
        const coverFileName = `cover_${timestamp}_${randomId}_${coverFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const { error: coverError } = await supabaseClient.storage
          .from('artist_images')
          .upload(coverFileName, coverFile);
        
        if (!coverError) {
          const { data: coverUrlData } = supabaseClient.storage
            .from('artist_images')
            .getPublicUrl(coverFileName);
          coverUrl = coverUrlData.publicUrl;
        }
      }
      
      // Save to database
      const { error: insertError } = await supabaseClient.from('tracks').insert({
        title: title,
        artist: artist,
        audio_url: musicUrl,
        cover_image: coverUrl,
        plays: '0',
        downloads: '0',
        is_new: true,
        created_at: new Date().toISOString()
      });
      
      if (insertError) throw insertError;
      
      successCount++;
      showToast(`✓ Uploaded: ${title} by ${artist}`);
      
    } catch (error) {
      console.error(error);
      showToast(`Failed to upload "${title}"`, true);
    }
  }
  
  showToast(`✅ Complete! ${successCount} songs uploaded`);
  if (successCount > 0) {
    await loadDataFromSupabase();
    if (isAdminLoggedIn) renderAdminSongsTable();
  }
  
  document.getElementById('musicFilesInput').value = '';
  document.getElementById('coverImagesInput').value = '';
  document.getElementById('uploadPreview').innerHTML = '';
  hideCircularLoading();
});

// Preview files
document.getElementById('musicFilesInput')?.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  const preview = document.getElementById('uploadPreview');
  if (files.length) {
    let html = `<h3 class="font-bold mb-2 text-amber-400">Selected (${files.length}):</h3>`;
    files.forEach(file => {
      html += `<div class="upload-item"><span><i class="fas fa-music"></i> ${file.name}</span><span class="text-green-400">Ready</span></div>`;
    });
    preview.innerHTML = html;
  } else {
    preview.innerHTML = '';
  }
});

// Bulk delete event listeners
document.getElementById('bulkDeleteSongsBtn')?.addEventListener('click', async () => {
  if (selectedSongsForDelete.size === 0) {
    showToast('No songs selected', true);
    return;
  }
  if (confirm(`Delete ${selectedSongsForDelete.size} selected songs?`)) {
    showCircularLoading();
    for (const songId of selectedSongsForDelete) {
      await supabaseClient.from('tracks').delete().eq('id', songId);
    }
    selectedSongsForDelete.clear();
    await loadDataFromSupabase();
    renderAdminSongsTable();
    hideCircularLoading();
    showToast('Songs deleted');
  }
});

document.getElementById('bulkDeleteArtistsBtn')?.addEventListener('click', async () => {
  if (selectedArtistsForDelete.size === 0) {
    showToast('No artists selected', true);
    return;
  }
  if (confirm(`Delete ${selectedArtistsForDelete.size} artists and ALL their songs?`)) {
    showCircularLoading();
    for (const artistId of selectedArtistsForDelete) {
      const artist = customArtists.find(a => a.id === artistId);
      const artistSongs = customTracks.filter(t => t.artist === artist?.name);
      for (const song of artistSongs) {
        await supabaseClient.from('tracks').delete().eq('id', song.id);
      }
      await supabaseClient.from('artists').delete().eq('id', artistId);
    }
    selectedArtistsForDelete.clear();
    await loadDataFromSupabase();
    renderAdminArtistsTable();
    hideCircularLoading();
    showToast('Artists and their songs deleted');
  }
});

document.getElementById('selectAllSongsBtn')?.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('.song-checkbox');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
    const id = parseInt(cb.dataset.id);
    if (cb.checked) selectedSongsForDelete.add(id);
    else selectedSongsForDelete.delete(id);
  });
});

document.getElementById('selectAllArtistsBtn')?.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('.artist-checkbox');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
    const id = parseInt(cb.dataset.id);
    if (cb.checked) selectedArtistsForDelete.add(id);
    else selectedArtistsForDelete.delete(id);
  });
});

document.getElementById('songSearchInput')?.addEventListener('input', () => renderAdminSongsTable());
document.getElementById('artistSearchInput')?.addEventListener('input', () => renderAdminArtistsTable());

// ========== INITIALIZE ==========
const supabaseScript = document.createElement('script');
supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
supabaseScript.onload = () => {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  init();
};
document.head.appendChild(supabaseScript);

async function init() {
  await loadDataFromSupabase();
  
  window.audioEl = document.getElementById('globalAudio');
  document.getElementById('playPauseBtn')?.addEventListener('click', () => { if (window.audioEl.paused) window.audioEl.play(); else window.audioEl.pause(); });
  document.getElementById('progressBar')?.addEventListener('input', (e) => { if (window.audioEl.duration) window.audioEl.currentTime = (e.target.value / 100) * window.audioEl.duration; });
  document.getElementById('closePlayerBtn')?.addEventListener('click', () => { document.getElementById('globalAudioPlayer').style.display = 'none'; window.audioEl.pause(); });
  
  window.audioEl.addEventListener('timeupdate', () => { if (window.audioEl.duration) { document.getElementById('progressBar').value = (window.audioEl.currentTime / window.audioEl.duration) * 100; document.getElementById('currentTime').innerText = formatTime(window.audioEl.currentTime); } });
  window.audioEl.addEventListener('loadedmetadata', () => { document.getElementById('duration').innerText = formatTime(window.audioEl.duration); });
  window.audioEl.addEventListener('play', () => { document.getElementById('playPauseIcon')?.classList.replace('fa-play', 'fa-pause'); });
  window.audioEl.addEventListener('pause', () => { document.getElementById('playPauseIcon')?.classList.replace('fa-pause', 'fa-play'); });
  
  document.getElementById('homeBtn')?.addEventListener('click', showHomepage);
  document.getElementById('backToCategoriesBtn')?.addEventListener('click', showHomepage);
  document.getElementById('backToArtistsBtn')?.addEventListener('click', showHomepage);
  document.getElementById('clearSearchBtn')?.addEventListener('click', () => { document.getElementById('searchInput').value = ''; showHomepage(); });
  document.getElementById('searchSubmitBtn')?.addEventListener('click', performSearch);
  document.getElementById('searchInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
  document.getElementById('backNavigationBtn')?.addEventListener('click', goBack);
  document.getElementById('downloadApkBtn')?.addEventListener('click', (e) => { e.preventDefault(); downloadApk(); });
  
  // Admin unlock (5 taps on logo)
  document.getElementById('homeBtn')?.addEventListener('click', () => { 
    tapCount++; 
    if (tapTimer) clearTimeout(tapTimer); 
    tapTimer = setTimeout(() => { tapCount = 0; }, 1000); 
    if (tapCount >= 5) { 
      document.getElementById('adminToggleBtn').classList.add('admin-visible'); 
      showToast('Admin unlocked - Tap the shield icon'); 
      tapCount = 0; 
    } 
  });
  
  document.getElementById('adminToggleBtn')?.addEventListener('click', showAdminLogin);
  document.querySelector('.close-admin-btn')?.addEventListener('click', closeAdminPanel);
  
  navigationHistory = [{ section: 'home' }];
  updateBackButton();
  showToast('Welcome to Albertine Music! 🎵');
}