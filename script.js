/**
 * Personal Diary — Upgraded UI/UX Engine
 * Lightweight, private, fully offline vanilla JS with localStorage.
 */

// ==========================================
// 1. Storage & State Management
// ==========================================
const STORAGE_KEY = 'personal_diary_entries_v1';

let diaryEntries = [];
let pendingDeleteId = null;
let currentSearchQuery = '';
let currentMoodFilter = 'all';
let currentSortOrder = 'newest'; // 'newest' | 'oldest'

// Map of expanded entry IDs (for "Read more / Read less" toggle)
const expandedEntryIds = new Set();

// ==========================================
// 2. DOM Elements Cache
// ==========================================
const currentDateDisplay = document.getElementById('currentDateDisplay');
const totalEntriesCountEl = document.getElementById('totalEntriesCount');
const totalWordsCountEl = document.getElementById('totalWordsCount');

// Composer elements
const composerCard = document.getElementById('composerCard');
const composerHeading = document.getElementById('composerHeading');
const composerIcon = document.getElementById('composerIcon');
const editingBadge = document.getElementById('editingBadge');
const entryForm = document.getElementById('entryForm');
const entryIdInput = document.getElementById('entryId');
const entryDateInput = document.getElementById('entryDate');
const setTodayBtn = document.getElementById('setTodayBtn');
const entryTitleInput = document.getElementById('entryTitle');
const entryThoughtsInput = document.getElementById('entryThoughts');
const liveWordCount = document.getElementById('liveWordCount');
const saveBtn = document.getElementById('saveBtn');
const saveBtnIcon = document.getElementById('saveBtnIcon');
const saveBtnText = document.getElementById('saveBtnText');
const cancelEditBtn = document.getElementById('cancelEditBtn');

// Toolbar elements
const sortOrderSelect = document.getElementById('sortOrderSelect');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const moodFilterBar = document.getElementById('moodFilterBar');
const filterResultSummary = document.getElementById('filterResultSummary');
const filterSummaryText = document.getElementById('filterSummaryText');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');

// List & Empty state elements
const entriesList = document.getElementById('entriesList');
const emptyState = document.getElementById('emptyState');
const emptyArt = document.getElementById('emptyArt');
const emptyTitle = document.getElementById('emptyTitle');
const emptyMessage = document.getElementById('emptyMessage');
const emptyCtaBtn = document.getElementById('emptyCtaBtn');

// Delete Dialog elements
const deleteConfirmDialog = document.getElementById('deleteConfirmDialog');
const deletePreviewTitle = document.getElementById('deletePreviewTitle');
const deletePreviewMeta = document.getElementById('deletePreviewMeta');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

// Backup & Toast
const exportBackupBtn = document.getElementById('exportBackupBtn');
const importBackupInput = document.getElementById('importBackupInput');
const toastNotification = document.getElementById('toastNotification');
let toastTimer = null;

// ==========================================
// 3. Helper Functions
// ==========================================

/**
 * Returns today's local date in YYYY-MM-DD format.
 */
function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns a human-friendly date string (e.g. "Thursday, Nov 5, 2026").
 */
function formatFriendlyDate(dateString) {
  if (!dateString) return '';
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime())) return dateString;

    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return dateString;
  }
}

/**
 * Formats a short timestamp (e.g., "Edited at 8:45 PM").
 */
function formatFriendlyTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Counts words accurately in a string.
 */
function countWords(str) {
  if (!str) return 0;
  const matches = str.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

/**
 * Calculates estimated reading time (avg 200 words/min).
 */
function getReadingTimeText(words) {
  if (words < 60) return '< 1 min read';
  const mins = Math.ceil(words / 200);
  return `${mins} min read`;
}

/**
 * Displays floating toast message.
 */
function showToast(message) {
  if (toastTimer) clearTimeout(toastTimer);
  toastNotification.textContent = message;
  toastNotification.classList.add('show');
  toastTimer = setTimeout(() => {
    toastNotification.classList.remove('show');
  }, 2800);
}

// Remove validation error on typing
entryTitleInput.addEventListener('input', () => {
  entryTitleInput.classList.remove('is-invalid');
});

entryThoughtsInput.addEventListener('input', () => {
  entryThoughtsInput.classList.remove('is-invalid');
  const words = countWords(entryThoughtsInput.value);
  liveWordCount.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
});

// ==========================================
// 4. Persistence & Metrics
// ==========================================

function loadEntries() {
  const possibleKeys = [
    STORAGE_KEY,
    'personal_diary_entries',
    'diary_entries',
    'dairy_entries',
    'diaryEntries'
  ];

  for (const key of possibleKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`Failed reading key ${key} from storage:`, err);
    }
  }
  return [];
}

function saveEntries() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diaryEntries));
    updateStats();
    return true;
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
    // Keep in-memory copy working even if localStorage has quota issues
    updateStats();
    showToast('Saved in current session (browser storage full or restricted).');
    return false;
  }
}

function updateStats() {
  const totalCount = diaryEntries.length;
  totalEntriesCountEl.textContent = totalCount;

  // Calculate total words across all diary entries
  const totalWords = diaryEntries.reduce((sum, entry) => sum + countWords(entry.thoughts), 0);
  totalWordsCountEl.textContent = totalWords.toLocaleString();
}

// ==========================================
// 5. Highlighting & Safe DOM Rendering
// ==========================================

function appendHighlightedText(parent, text, query) {
  if (!query || !query.trim()) {
    parent.textContent = text;
    return;
  }

  const trimmed = query.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  parent.innerHTML = '';
  parts.forEach(part => {
    if (part.toLowerCase() === trimmed.toLowerCase()) {
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = part;
      parent.appendChild(mark);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  });
}

// ==========================================
// 6. Rendering Entries Feed
// ==========================================

function renderFeed() {
  const query = currentSearchQuery.trim().toLowerCase();

  // 1. Filter entries by search query and mood filter
  const filtered = diaryEntries.filter(entry => {
    // Mood Filter check
    if (currentMoodFilter !== 'all') {
      const entryMood = entry.mood || '😊';
      if (entryMood !== currentMoodFilter) return false;
    }

    // Search Query check
    if (!query) return true;
    const titleMatch = entry.title && entry.title.toLowerCase().includes(query);
    const thoughtsMatch = entry.thoughts && entry.thoughts.toLowerCase().includes(query);
    const dateMatch = entry.date && (entry.date.includes(query) || formatFriendlyDate(entry.date).toLowerCase().includes(query));
    return titleMatch || thoughtsMatch || dateMatch;
  });

  // 2. Sort entries
  filtered.sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    const dateDiff = dateA.localeCompare(dateB);
    if (dateDiff !== 0) {
      return currentSortOrder === 'newest' ? -dateDiff : dateDiff;
    }
    const timeA = a.createdAt || 0;
    const timeB = b.createdAt || 0;
    return currentSortOrder === 'newest' ? timeB - timeA : timeA - timeB;
  });

  // 3. Search & Filter Bar UI state
  if (clearSearchBtn) {
    if (query) {
      clearSearchBtn.hidden = false;
      clearSearchBtn.style.display = 'flex';
    } else {
      clearSearchBtn.hidden = true;
      clearSearchBtn.style.display = 'none';
    }
  }

  const isFiltered = query.length > 0 || currentMoodFilter !== 'all';
  if (filterResultSummary) {
    if (isFiltered) {
      filterResultSummary.hidden = false;
      filterResultSummary.style.display = 'flex';
      const moodNote = currentMoodFilter !== 'all' ? ` with mood ${currentMoodFilter}` : '';
      const searchNote = query ? ` matching "${currentSearchQuery}"` : '';
      filterSummaryText.textContent = `Showing ${filtered.length} of ${diaryEntries.length} entries${moodNote}${searchNote}`;
    } else {
      filterResultSummary.hidden = true;
      filterResultSummary.style.display = 'none';
    }
  }

  // 4. Clear list
  entriesList.innerHTML = '';

  // 5. Handle Empty States (Explicitly control hidden attribute AND display style)
  if (diaryEntries.length === 0) {
    emptyState.hidden = false;
    emptyState.style.display = 'flex';
    emptyState.classList.remove('is-hidden');
    emptyArt.textContent = '📖';
    emptyTitle.textContent = 'Your diary is empty';
    emptyMessage.textContent = 'Every memorable journey starts with a single reflection. Take a moment to capture what happened today.';
    emptyCtaBtn.hidden = false;
    emptyCtaBtn.style.display = 'inline-flex';
    return;
  }

  if (filtered.length === 0) {
    emptyState.hidden = false;
    emptyState.style.display = 'flex';
    emptyState.classList.remove('is-hidden');
    emptyArt.textContent = '🔍';
    emptyTitle.textContent = 'No matching memories';
    emptyMessage.textContent = 'No entries match your search criteria. Try a different search word or clear the active filters.';
    emptyCtaBtn.hidden = true;
    emptyCtaBtn.style.display = 'none';
    return;
  }

  // Hide empty state completely when there are entries to show
  emptyState.hidden = true;
  emptyState.style.display = 'none';
  emptyState.classList.add('is-hidden');

  // 6. Render Entry Cards
  filtered.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'entry-card';
    li.dataset.id = entry.id;

    // --- Top Bar (Date badge, Mood, Reading stats) ---
    const topBar = document.createElement('div');
    topBar.className = 'card-top-bar';

    const leftMeta = document.createElement('div');
    leftMeta.style.display = 'flex';
    leftMeta.style.alignItems = 'center';
    leftMeta.style.gap = '8px';
    leftMeta.style.flexWrap = 'wrap';

    const dateBadge = document.createElement('span');
    dateBadge.className = 'card-date-badge';
    dateBadge.innerHTML = `<span aria-hidden="true">📅</span> ${formatFriendlyDate(entry.date)}`;
    leftMeta.appendChild(dateBadge);

    if (entry.mood) {
      const moodTag = document.createElement('span');
      moodTag.className = 'card-mood-tag';
      moodTag.textContent = entry.mood;
      moodTag.title = `Mood: ${entry.mood}`;
      leftMeta.appendChild(moodTag);
    }

    topBar.appendChild(leftMeta);

    const rightMeta = document.createElement('div');
    rightMeta.className = 'card-meta-right';

    const words = countWords(entry.thoughts);
    const readingStats = document.createElement('span');
    readingStats.className = 'card-reading-stats';
    readingStats.textContent = `${words} words · ${getReadingTimeText(words)}`;
    rightMeta.appendChild(readingStats);

    topBar.appendChild(rightMeta);
    li.appendChild(topBar);

    // --- Title ---
    const heading = document.createElement('h3');
    heading.className = 'entry-heading';
    appendHighlightedText(heading, entry.title, currentSearchQuery);
    li.appendChild(heading);

    // --- Thoughts body with Read More toggle for lengthy entries ---
    const bodyP = document.createElement('p');
    bodyP.className = 'entry-body';
    appendHighlightedText(bodyP, entry.thoughts, currentSearchQuery);

    const isLong = entry.thoughts.length > 320 || entry.thoughts.split('\n').length > 4;
    const isExpanded = expandedEntryIds.has(entry.id);

    if (isLong && !isExpanded) {
      bodyP.classList.add('is-truncated');
    }
    li.appendChild(bodyP);

    if (isLong) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'read-toggle-btn';
      toggleBtn.textContent = isExpanded ? 'Read less ▲' : 'Read more ▼';
      toggleBtn.addEventListener('click', () => {
        if (expandedEntryIds.has(entry.id)) {
          expandedEntryIds.delete(entry.id);
        } else {
          expandedEntryIds.add(entry.id);
        }
        renderFeed();
      });
      li.appendChild(toggleBtn);
    }

    // --- Footer Bar (Edited status & Action Buttons) ---
    const footer = document.createElement('div');
    footer.className = 'card-footer';

    const timeEdited = document.createElement('span');
    timeEdited.className = 'card-time-edited';
    if (entry.updatedAt && entry.updatedAt !== entry.createdAt) {
      timeEdited.textContent = `Edited ${formatFriendlyTime(entry.updatedAt)}`;
    }
    footer.appendChild(timeEdited);

    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'card-actions-group';

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-action';
    editBtn.innerHTML = '<span aria-hidden="true">✏️</span> Edit';
    editBtn.setAttribute('aria-label', `Edit "${entry.title}"`);
    editBtn.addEventListener('click', () => startEditing(entry.id));

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-action btn-action-delete';
    deleteBtn.innerHTML = '<span aria-hidden="true">🗑️</span> Delete';
    deleteBtn.setAttribute('aria-label', `Delete "${entry.title}"`);
    deleteBtn.addEventListener('click', () => openDeleteDialog(entry.id));

    actionsGroup.appendChild(editBtn);
    actionsGroup.appendChild(deleteBtn);
    footer.appendChild(actionsGroup);

    li.appendChild(footer);
    entriesList.appendChild(li);
  });
}

// ==========================================
// 7. Composition & Edit Mode
// ==========================================

function getSelectedMood() {
  const checked = document.querySelector('input[name="entryMood"]:checked');
  return checked ? checked.value : '😊';
}

function setSelectedMood(moodValue) {
  const radio = document.querySelector(`input[name="entryMood"][value="${moodValue}"]`);
  if (radio) {
    radio.checked = true;
  }
}

function resetForm() {
  entryIdInput.value = '';
  entryForm.reset();
  entryDateInput.value = getTodayLocalDate();
  setSelectedMood('😊');
  liveWordCount.textContent = '0 words';

  entryTitleInput.classList.remove('is-invalid');
  entryThoughtsInput.classList.remove('is-invalid');

  composerHeading.textContent = 'Write in Your Diary';
  composerIcon.textContent = '✨';
  saveBtnText.textContent = 'Save to Diary';
  saveBtnIcon.textContent = '🌿';
  cancelEditBtn.hidden = true;
  cancelEditBtn.style.display = 'none';
  editingBadge.hidden = true;
  editingBadge.style.display = 'none';
  composerCard.classList.remove('is-editing');
}

function startEditing(id) {
  const entry = diaryEntries.find(item => item.id === id);
  if (!entry) return;

  entryIdInput.value = entry.id;
  entryDateInput.value = entry.date || getTodayLocalDate();
  setSelectedMood(entry.mood || '😊');
  entryTitleInput.value = entry.title || '';
  entryThoughtsInput.value = entry.thoughts || '';

  const words = countWords(entry.thoughts);
  liveWordCount.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;

  composerHeading.textContent = 'Edit Diary Entry';
  composerIcon.textContent = '✏️';
  saveBtnText.textContent = 'Update Entry';
  saveBtnIcon.textContent = '✨';
  cancelEditBtn.hidden = false;
  cancelEditBtn.style.display = 'inline-flex';
  editingBadge.hidden = false;
  editingBadge.style.display = 'inline-block';
  composerCard.classList.add('is-editing');

  composerCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  entryTitleInput.focus();
}

// Quick "Today" date button
setTodayBtn.addEventListener('click', () => {
  entryDateInput.value = getTodayLocalDate();
  entryDateInput.focus();
});

// Form submission (Save / Update)
entryForm.addEventListener('submit', event => {
  event.preventDefault();

  const id = entryIdInput.value.trim();
  let date = entryDateInput.value.trim();
  const title = entryTitleInput.value.trim();
  const thoughts = entryThoughtsInput.value.trim();
  const mood = getSelectedMood();

  // If date was left empty or cleared, automatically fallback to today's date
  if (!date) {
    date = getTodayLocalDate();
    entryDateInput.value = date;
  }

  // Clear previous validation error styles
  entryTitleInput.classList.remove('is-invalid');
  entryThoughtsInput.classList.remove('is-invalid');

  // Validate Title
  if (!title) {
    entryTitleInput.classList.add('is-invalid');
    entryTitleInput.focus();
    showToast('Please give your diary entry a title.');
    return;
  }

  // Validate Thoughts
  if (!thoughts) {
    entryThoughtsInput.classList.add('is-invalid');
    entryThoughtsInput.focus();
    showToast('Please write your thoughts before saving.');
    return;
  }

  const now = Date.now();
  let savedId = id;

  if (id) {
    // Edit existing entry
    const index = diaryEntries.findIndex(item => item.id === id);
    if (index !== -1) {
      diaryEntries[index] = {
        ...diaryEntries[index],
        date,
        title,
        thoughts,
        mood,
        updatedAt: now
      };
      saveEntries();
      showToast('Entry updated successfully ✨');
    }
  } else {
    // Create new entry
    savedId = `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newEntry = {
      id: savedId,
      date,
      title,
      thoughts,
      mood,
      createdAt: now,
      updatedAt: now
    };
    diaryEntries.unshift(newEntry);
    saveEntries();
    showToast('Saved to your personal diary 📖');
  }

  // Reset any active search/filter so the new entry is immediately visible!
  currentSearchQuery = '';
  if (searchInput) searchInput.value = '';
  currentMoodFilter = 'all';
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.mood === 'all');
  });

  resetForm();
  renderFeed();

  // Smoothly highlight and show the newly saved card
  setTimeout(() => {
    const cardEl = entriesList.querySelector(`[data-id="${savedId}"]`);
    if (cardEl) {
      cardEl.classList.add('just-added');
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => cardEl.classList.remove('just-added'), 1800);
    }
  }, 100);
});

// Keyboard shortcut: Cmd/Ctrl + Enter to save
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    if (document.activeElement === entryTitleInput || document.activeElement === entryThoughtsInput) {
      event.preventDefault();
      saveBtn.click();
    }
  }
});

// Cancel Edit Button
cancelEditBtn.addEventListener('click', () => {
  resetForm();
  showToast('Editing cancelled');
});

// Empty State CTA Button
emptyCtaBtn.addEventListener('click', () => {
  composerCard.classList.add('composer-highlight');
  composerCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  entryTitleInput.focus();
  setTimeout(() => {
    composerCard.classList.remove('composer-highlight');
  }, 1200);
});

// ==========================================
// 8. Delete Confirmation Flow
// ==========================================

function openDeleteDialog(id) {
  const entry = diaryEntries.find(item => item.id === id);
  if (!entry) return;

  pendingDeleteId = id;
  deletePreviewTitle.textContent = `"${entry.title}"`;
  deletePreviewMeta.textContent = `${formatFriendlyDate(entry.date)} · ${countWords(entry.thoughts)} words`;

  if (typeof deleteConfirmDialog.showModal === 'function') {
    deleteConfirmDialog.showModal();
    cancelDeleteBtn.focus();
  } else {
    const confirmed = window.confirm(`Delete "${entry.title}"?\n\nThis cannot be undone.`);
    if (confirmed) executeDelete(id);
  }
}

function closeDeleteDialog() {
  pendingDeleteId = null;
  if (typeof deleteConfirmDialog.close === 'function') {
    deleteConfirmDialog.close();
  }
}

function executeDelete(id) {
  const index = diaryEntries.findIndex(item => item.id === id);
  if (index === -1) return;

  const [removed] = diaryEntries.splice(index, 1);
  saveEntries();

  // If this entry was currently open in edit mode, reset the form
  if (entryIdInput.value === id) {
    resetForm();
  }

  renderFeed();
  showToast(`Deleted "${removed.title}"`);
}

confirmDeleteBtn.addEventListener('click', () => {
  if (pendingDeleteId) executeDelete(pendingDeleteId);
  closeDeleteDialog();
});

cancelDeleteBtn.addEventListener('click', closeDeleteDialog);

deleteConfirmDialog.addEventListener('click', event => {
  if (event.target === deleteConfirmDialog) closeDeleteDialog();
});

// ==========================================
// 9. Search, Filter & Sort Events
// ==========================================

searchInput.addEventListener('input', e => {
  currentSearchQuery = e.target.value;
  renderFeed();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  currentSearchQuery = '';
  searchInput.focus();
  renderFeed();
});

sortOrderSelect.addEventListener('change', e => {
  currentSortOrder = e.target.value;
  renderFeed();
});

moodFilterBar.addEventListener('click', e => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;

  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');

  currentMoodFilter = chip.dataset.mood;
  renderFeed();
});

resetFiltersBtn.addEventListener('click', () => {
  searchInput.value = '';
  currentSearchQuery = '';
  currentMoodFilter = 'all';

  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.mood === 'all');
  });

  renderFeed();
});

// ==========================================
// 10. Backup & Restore (Local Peace-of-Mind)
// ==========================================

exportBackupBtn.addEventListener('click', () => {
  if (diaryEntries.length === 0) {
    showToast('Your diary is empty. Nothing to export.');
    return;
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    entries: diaryEntries
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `personal-diary-backup-${getTodayLocalDate()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Backup downloaded successfully 📥');
});

importBackupInput.addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const imported = Array.isArray(data) ? data : data.entries;

      if (!Array.isArray(imported)) {
        throw new Error('Invalid backup file structure.');
      }

      if (confirm(`Restore ${imported.length} entries? This will merge with your current diary.`)) {
        // Merge without duplicating existing IDs
        const existingIds = new Set(diaryEntries.map(entry => entry.id));
        let addedCount = 0;

        imported.forEach(entry => {
          if (entry.id && !existingIds.has(entry.id)) {
            diaryEntries.push(entry);
            addedCount++;
          }
        });

        saveEntries();
        renderFeed();
        showToast(`Restored ${addedCount} entries from backup! ✨`);
      }
    } catch (err) {
      alert('Could not read backup file: ' + err.message);
    }
    importBackupInput.value = '';
  };
  reader.readAsText(file);
});

// ==========================================
// 11. App Initialization
// ==========================================

function initApp() {
  // Display today's formatted date in header
  const today = new Date();
  if (currentDateDisplay) {
    currentDateDisplay.textContent = today.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // Load entries and initialize date input
  diaryEntries = loadEntries();
  if (entryDateInput) {
    entryDateInput.value = getTodayLocalDate();
  }

  updateStats();
  renderFeed();
}

// Ensure initApp runs whether DOMContentLoaded has already fired or is pending
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
