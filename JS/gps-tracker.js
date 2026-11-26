/* =========================================================
   FILE: gps-tracker.js
   PURPOSE: Captures real device GPS points for outdoor activities.
   Responsibilities: permission handling, filtering noisy GPS points,
   pause/resume, distance accumulation, and elapsed active time.
   MODIFY HERE: Adjust MIN_ACCURACY_METERS, MIN_POINT_DISTANCE_METERS,
   and MAX_SPEED_METERS_PER_SECOND to tune GPS filtering.
========================================================= */
const MIN_ACCURACY_METERS = 45; // Ignore GPS fixes less accurate than this.
const MIN_POINT_DISTANCE_METERS = 4; // Avoid adding points for stationary GPS jitter.
const MAX_SPEED_METERS_PER_SECOND = 45; // Reject obvious GPS jumps (about 162 km/h).

function haversine(a, b) {
  const radius = 6371000;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export default class GPSTracker {
  constructor({ onUpdate, onError, onStatus } = {}) {
    this.onUpdate = onUpdate || (() => {});
    this.onError = onError || (() => {});
    this.onStatus = onStatus || (() => {});
    this.watchId = null;
    this.points = [];
    this.distanceMeters = 0;
    this.isRecording = false;
    this.isPaused = false;
    this.activeStartedAt = null;
    this.accumulatedActiveMs = 0;
    this.startedAt = null;
    this.lastSpeed = 0;
    this.lastAccuracy = null;
  }
  start() {
    if (!navigator.geolocation) { this.onError('This browser does not support GPS location.'); return false; }
    if (this.isRecording) return true;
    this.points = [];
    this.distanceMeters = 0;
    this.accumulatedActiveMs = 0;
    this.startedAt = new Date().toISOString();
    this.activeStartedAt = Date.now();
    this.isRecording = true;
    this.isPaused = false;
    this.watchPosition();
    this.onStatus('recording');
    return true;
  }
  watchPosition() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = navigator.geolocation.watchPosition(position => this.handlePosition(position), error => this.handleError(error), {
      enableHighAccuracy: true, maximumAge: 1000, timeout: 20000
    });
  }
  handlePosition(position) {
    if (!this.isRecording || this.isPaused) return;
    const { latitude, longitude, accuracy, speed } = position.coords;
    const timestamp = position.timestamp || Date.now();
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
    if (Number.isFinite(accuracy) && accuracy > MIN_ACCURACY_METERS) {
      this.lastAccuracy = accuracy;
      this.onUpdate(this.getSnapshot(), { accepted: false, reason: 'accuracy' });
      return;
    }
    const point = { lat: latitude, lon: longitude, timestamp, accuracy: Number.isFinite(accuracy) ? accuracy : null, speed: Number.isFinite(speed) && speed >= 0 ? speed : null };
    const previous = this.points[this.points.length - 1];
    if (previous) {
      const segmentMeters = haversine(previous, point);
      const seconds = Math.max((timestamp - previous.timestamp) / 1000, 0.5);
      if (segmentMeters < MIN_POINT_DISTANCE_METERS) return;
      if (segmentMeters / seconds > MAX_SPEED_METERS_PER_SECOND) {
        this.onUpdate(this.getSnapshot(), { accepted: false, reason: 'gps-jump' });
        return;
      }
      this.distanceMeters += segmentMeters;
      this.lastSpeed = segmentMeters / seconds;
    } else this.lastSpeed = point.speed || 0;
    this.lastAccuracy = point.accuracy;
    this.points.push(point);
    this.onUpdate(this.getSnapshot(), { accepted: true, point });
  }
  handleError(error) {
    this.stopWatch();
    // Keep the current activity and already recorded points so the user can retry GPS or finish and save the track.
    if (this.activeStartedAt) this.accumulatedActiveMs += Date.now() - this.activeStartedAt;
    this.activeStartedAt = null;
    this.isPaused = true;
    this.onStatus('paused');
    const messages = {
      1: 'GPS permission was denied. Allow location access in your browser settings.',
      2: 'Your current location is unavailable. Try moving to an open area.',
      3: 'GPS timed out. Keep the page open and try again.'
    };
    this.onError(messages[error.code] || error.message || 'A GPS error occurred.');
  }
  pause() {
    if (!this.isRecording || this.isPaused) return;
    this.accumulatedActiveMs += Date.now() - this.activeStartedAt;
    this.isPaused = true;
    this.activeStartedAt = null;
    this.stopWatch();
    this.onStatus('paused');
  }
  resume() {
    if (!this.isRecording || !this.isPaused) return;
    this.isPaused = false;
    this.activeStartedAt = Date.now();
    this.watchPosition();
    this.onStatus('recording');
  }
  stopWatch() {
    if (this.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
  getElapsedMs() {
    return this.accumulatedActiveMs + (this.isRecording && !this.isPaused && this.activeStartedAt ? Date.now() - this.activeStartedAt : 0);
  }
  getSnapshot() {
    const elapsedMs = this.getElapsedMs();
    const elapsedSeconds = elapsedMs / 1000;
    const averageSpeed = elapsedSeconds > 0 ? this.distanceMeters / elapsedSeconds : 0;
    const paceMinutes = this.distanceMeters > 0 ? elapsedSeconds / 60 / (this.distanceMeters / 1000) : null;
    return { points: [...this.points], distanceMeters: this.distanceMeters, elapsedMs, currentSpeed: this.lastSpeed, averageSpeed, paceMinutes, accuracy: this.lastAccuracy, startedAt: this.startedAt };
  }
  finish() {
    if (!this.isRecording) return this.getSnapshot();
    if (!this.isPaused && this.activeStartedAt) this.accumulatedActiveMs += Date.now() - this.activeStartedAt;
    this.stopWatch();
    this.isRecording = false;
    this.isPaused = false;
    this.activeStartedAt = null;
    this.onStatus('finished');
    return this.getSnapshot();
  }
}
