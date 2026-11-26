/* =========================================================
   FILE: statistics.js
   PURPOSE: Calculates dashboard and profile numbers from saved records.
   No sample distance, activity, or workout statistics are hardcoded.
========================================================= */
import { getUserData } from './storage.js';
import { formatDistance, formatDuration } from './ui.js';

export function calculateStatistics() {
  const data = getUserData();
  const activities = data.activities || [];
  const workouts = data.workouts || [];
  const distance = activities.reduce((sum, item) => sum + Number(item.distanceMeters || 0), 0);
  const outdoorTime = activities.reduce((sum, item) => sum + Number(item.durationMs || 0), 0);
  const completedWorkouts = workouts.filter(item => item.status === 'completed');
  const workoutMinutes = completedWorkouts.reduce((sum, item) => sum + (item.exercises || []).reduce((exerciseSum, exercise) => exerciseSum + Number(exercise.duration || 0), 0), 0);
  return { distance, activities: activities.length, outdoorTime, workouts: workouts.length, completedWorkouts: completedWorkouts.length, workoutTime: workoutMinutes * 60000, totalRecords: activities.length + completedWorkouts.length };
}
export function profileStatisticsMarkup() {
  const stats = calculateStatistics();
  return `<div class="profile-stat-grid"><div class="metric-card"><small>Total distance</small><strong>${formatDistance(stats.distance)}</strong></div><div class="metric-card"><small>Outdoor activities</small><strong>${stats.activities}</strong></div><div class="metric-card"><small>Outdoor time</small><strong>${formatDuration(stats.outdoorTime)}</strong></div><div class="metric-card"><small>Completed workouts</small><strong>${stats.completedWorkouts}</strong></div><div class="metric-card"><small>Workout time*</small><strong>${formatDuration(stats.workoutTime)}</strong></div><div class="metric-card"><small>Total records</small><strong>${stats.totalRecords}</strong></div></div><p class="settings-note">*Workout time is the sum of exercise durations entered in your plans, not an actual workout timer.</p>`;
}
export function refreshDashboardStats() {
  const stats = calculateStatistics();
  const distance = document.getElementById('dashboard-total-distance');
  const activityCount = document.getElementById('dashboard-activity-count');
  const workoutCount = document.getElementById('dashboard-workout-count');
  if (distance) distance.textContent = formatDistance(stats.distance);
  if (activityCount) activityCount.textContent = String(stats.activities);
  if (workoutCount) workoutCount.textContent = String(stats.completedWorkouts);
  return stats;
}
