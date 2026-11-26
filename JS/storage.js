/* FILE PURPOSE: Centralizes browser-local storage for users, activities, workouts, and routes. */
/* =========================================================
   FILE: storage.js
   PURPOSE: Centralizes localStorage access for users and app data.
   IMPORTANT: localStorage is a prototype store, not a secure database.
========================================================= */
import { STORAGE_PREFIX } from './config.js';

const USERS_KEY = `${STORAGE_PREFIX}.users`;
const SESSION_KEY = `${STORAGE_PREFIX}.session`;
const DATA_KEY = `${STORAGE_PREFIX}.data`;

// Read JSON safely. Invalid or missing data becomes the supplied fallback.
function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`Could not read ${key} from localStorage:`, error);
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Could not save ${key} to localStorage:`, error);
    return false;
  }
}

export function getUsers() { return readJSON(USERS_KEY, []); }
export function saveUsers(users) { return writeJSON(USERS_KEY, users); }
export function getSession() { return readJSON(SESSION_KEY, null); }
export function setSession(userId) { return writeJSON(SESSION_KEY, { userId, signedInAt: new Date().toISOString() }); }
export function clearSession() { localStorage.removeItem(SESSION_KEY); }
export function getCurrentUser() {
  const session = getSession();
  if (!session?.userId) return null;
  return getUsers().find(user => user.id === session.userId) || null;
}
export function findUser(identity) {
  const normalized = String(identity || '').trim().toLowerCase();
  return getUsers().find(user => user.email.toLowerCase() === normalized || user.nickname.toLowerCase() === normalized) || null;
}
export function createUser(user) {
  const users = getUsers();
  users.push(user);
  if (!saveUsers(users)) throw new Error('Your browser storage is full or unavailable.');
  writeJSON(`${DATA_KEY}.${user.id}`, { routes: [], activities: [], workouts: [], preferences: { mapType: 'standard', savedLayer: true, activityLayer: true, heatmap: 'off' } });
  return user;
}
export function updateUser(userId, changes) {
  const users = getUsers();
  const index = users.findIndex(user => user.id === userId);
  if (index < 0) throw new Error('Account could not be found.');
  users[index] = { ...users[index], ...changes };
  if (!saveUsers(users)) throw new Error('Your browser storage is full or unavailable.');
  return users[index];
}
export function getUserData(userId = getCurrentUser()?.id) {
  if (!userId) return { routes: [], activities: [], workouts: [], preferences: {} };
  const key = `${DATA_KEY}.${userId}`;
  const data = readJSON(key, null) || { routes: [], activities: [], workouts: [], preferences: {} };
  data.routes ||= []; data.activities ||= []; data.workouts ||= []; data.preferences ||= {};
  return data;
}
export function saveUserData(data, userId = getCurrentUser()?.id) {
  if (!userId) return false;
  const saved = writeJSON(`${DATA_KEY}.${userId}`, data);
  if (saved) window.dispatchEvent(new CustomEvent('exerfit:data-changed'));
  return saved;
}
export function updatePreferences(changes, userId = getCurrentUser()?.id) {
  const data = getUserData(userId);
  data.preferences = { ...data.preferences, ...changes };
  saveUserData(data, userId);
  return data.preferences;
}
export function createId(prefix = 'item') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
export function getWeatherKey(userId = getCurrentUser()?.id) {
  return userId ? localStorage.getItem(`${STORAGE_PREFIX}.weather.${userId}`) || '' : '';
}
export function saveWeatherKey(key, userId = getCurrentUser()?.id) {
  if (!userId) return;
  if (key) localStorage.setItem(`${STORAGE_PREFIX}.weather.${userId}`, key);
  else localStorage.removeItem(`${STORAGE_PREFIX}.weather.${userId}`);
}
