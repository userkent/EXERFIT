/* FILE PURPOSE: Renders completed outdoor activities and workout history. */
/* =========================================================
   FILE: activity-history.js
   PURPOSE: Displays completed GPS activities and completed indoor workouts.
   It does not mix saved route plans with completed activity history.
========================================================= */
import { getUserData, saveUserData } from './storage.js';
import { drawHistoryTrack, centerOn, refreshDataLayers } from './map.js';
import { openModal, showToast, formatDistance, formatDuration, escapeHTML, refreshIcons } from './ui.js';

export function mountHistoryPanel(container) {
  const data = getUserData();
  const filter = container.querySelector('#history-filter')?.value || 'all';
  const activities = data.activities.map(item => ({ ...item, recordKind: 'activity' }));
  const workouts = data.workouts.filter(item => item.status === 'completed').map(item => ({ ...item, recordKind: 'workout' }));
  const records = [...activities, ...workouts].sort((a,b) => new Date(b.finishedAt || b.completedAt || b.date || 0) - new Date(a.finishedAt || a.completedAt || a.date || 0)).filter(item => filter === 'all' || item.recordKind === filter);
  const list = records.length ? records.map(item => item.recordKind === 'activity' ? `
    <article class="list-card"><div class="list-card-top"><div><h3>${escapeHTML(item.type[0].toUpperCase() + item.type.slice(1))}</h3><p>${new Date(item.startedAt).toLocaleString()}</p></div><span class="recording-status">GPS activity</span></div>
      <div class="list-card-meta"><span><i data-lucide="route"></i>${formatDistance(item.distanceMeters)}</span><span><i data-lucide="clock"></i>${formatDuration(item.durationMs)}</span><span><i data-lucide="map-pin"></i>${item.points?.length || 0} points</span></div>
      <div class="list-card-actions"><button class="button button-secondary" type="button" data-show-activity="${escapeHTML(item.id)}"><i data-lucide="map"></i> View route</button><button class="button button-secondary" type="button" data-detail-activity="${escapeHTML(item.id)}"><i data-lucide="file-text"></i> Details</button><button class="button button-danger" type="button" data-delete-activity="${escapeHTML(item.id)}"><i data-lucide="trash-2"></i></button></div></article>` : `
    <article class="list-card"><div class="list-card-top"><div><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.category)} · ${new Date(`${item.date}T00:00:00`).toLocaleDateString()}</p></div><span class="recording-status">Indoor workout</span></div><div class="list-card-meta"><span><i data-lucide="dumbbell"></i>${item.exercises.length} exercises</span><span><i data-lucide="check-circle"></i>Completed</span></div><div class="list-card-actions"><button class="button button-secondary" type="button" data-detail-workout="${escapeHTML(item.id)}"><i data-lucide="file-text"></i> Details</button></div></article>`).join('') : `<div class="empty-state"><i data-lucide="history"></i><strong>No history records</strong><p>Completed activities and finished workouts will appear here.</p></div>`;
  container.innerHTML = `<p class="panel-intro">Review actual GPS activity tracks and workouts that you have marked as completed.</p><div class="form-field"><label for="history-filter">Show records</label><select id="history-filter"><option value="all" ${filter === 'all' ? 'selected' : ''}>All history</option><option value="activity" ${filter === 'activity' ? 'selected' : ''}>Outdoor activities</option><option value="workout" ${filter === 'workout' ? 'selected' : ''}>Completed workouts</option></select></div><div class="panel-section-title"><span>History</span><small>${records.length} records</small></div><div class="panel-list">${list}</div>`;
  container.dataset.panel = 'history';
  refreshIcons(container);
  container.querySelector('#history-filter').addEventListener('change', () => mountHistoryPanel(container));
  container.querySelectorAll('[data-show-activity]').forEach(button => button.addEventListener('click', () => {
    const activity = data.activities.find(item => item.id === button.dataset.showActivity); if (!activity?.points?.length) { showToast('This activity has no saved GPS points.', 'warning'); return; }
    drawHistoryTrack(activity.points); const first = activity.points[0]; centerOn(first.lat, first.lon, 15); showToast('Showing the recorded GPS path on the map.', 'info');
  }));
  container.querySelectorAll('[data-detail-activity]').forEach(button => button.addEventListener('click', () => {
    const item = data.activities.find(activity => activity.id === button.dataset.detailActivity); if (!item) return;
    const pace = item.averagePaceMinutes ? `${Math.floor(item.averagePaceMinutes)}:${String(Math.round((item.averagePaceMinutes % 1) * 60)).padStart(2,'0')} min/km` : '—';
    openModal({ title: 'Activity details', content: `<div class="profile-stat-grid"><div class="metric-card"><small>Type</small><strong>${escapeHTML(item.type)}</strong></div><div class="metric-card"><small>Distance</small><strong>${formatDistance(item.distanceMeters)}</strong></div><div class="metric-card"><small>Duration</small><strong>${formatDuration(item.durationMs)}</strong></div><div class="metric-card"><small>Average pace</small><strong>${pace}</strong></div></div><p>Started: ${new Date(item.startedAt).toLocaleString()}</p><p>Finished: ${new Date(item.finishedAt).toLocaleString()}</p><p>GPS points: ${item.points?.length || 0}</p>` , showCancel: false, confirmText: 'Close', onConfirm: close => close() });
  }));
  container.querySelectorAll('[data-delete-activity]').forEach(button => button.addEventListener('click', () => {
    openModal({ title: 'Delete activity record?', content: '<p>This removes the activity and its GPS track from your history. Saved route plans are not affected.</p>', confirmText: 'Delete activity', confirmVariant: 'button-danger', onConfirm: close => {
      const latest = getUserData(); latest.activities = latest.activities.filter(item => item.id !== button.dataset.deleteActivity); saveUserData(latest); close(); mountHistoryPanel(container); refreshDataLayers(); showToast('Activity deleted.', 'info');
    } });
  }));
  container.querySelectorAll('[data-detail-workout]').forEach(button => button.addEventListener('click', () => {
    const item = data.workouts.find(workout => workout.id === button.dataset.detailWorkout); if (!item) return;
    const exercises = item.exercises.map(exercise => `<li><strong>${escapeHTML(exercise.name)}</strong> — ${exercise.sets} sets × ${exercise.reps} reps · ${exercise.duration} min · ${exercise.rest}s rest</li>`).join('');
    openModal({ title: escapeHTML(item.name), content: `<p>${escapeHTML(item.category)} · completed ${new Date(item.completedAt).toLocaleString()}</p><ul>${exercises}</ul>${item.notes ? `<p>Notes: ${escapeHTML(item.notes)}</p>` : ''}`, showCancel: false, confirmText: 'Close', onConfirm: close => close() });
  }));
}
