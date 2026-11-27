# ExerFit

## Problem

People who exercise outdoors or indoors often use different tools to find routes, track activities, and manage workouts. ExerFit brings these activities together in one web application so users can explore routes, record outdoor movement, and organize indoor training without switching between separate pages or tools.

## Target Users

- People who walk, run, cycle, or hike outdoors.
- Users who want to explore locations and save routes.
- People who plan home or gym workouts.
- Fitness users who want to review their activity history and progress.

## Solution

ExerFit provides an interactive map workspace with route search, GPS activity tracking, saved routes, workout planning, activity history, weather information, and profile settings. The application uses browser storage for prototype account and activity data.

## Main Feature

The main feature is the interactive fitness dashboard. Users can explore the map, search for destinations, create and save routes, record GPS-based outdoor activities, plan workouts, and review their progress from one workspace.

The dashboard also includes a Strava-style side hide/reveal control for the floating cards. Clicking the side arrow slides the card outside the map display while keeping a small tab available to bring it back.

## Pages

- Homepage: Introduces ExerFit, its features, workflow, and purpose.
- App page: Interactive map dashboard for routes, outdoor activity tracking, workouts, history, weather, and settings.
- Cart or Subscription page: Not included in the current prototype.

## Team

- Add team members here.

## Live Link

- Add the deployed ExerFit website link here.

## Project Structure

- `index.html` — ExerFit landing page.
- `pages/login.html` — Login page.
- `pages/signup.html` — Sign-up page.
- `pages/dashboard.html` — Main application dashboard.
- `css/` — Stylesheets for the landing page, dashboard, authentication screens, responsive layout, and themes.
- `JS/` — JavaScript modules for authentication, maps, GPS tracking, routing, activities, workouts, history, weather, storage, and UI.
- `assets/images/` — Local PNG images used by the website.
- `assets/icons/` — Local PNG icon assets.
- `assets/logo/exerfit-logo-dark.png` — Dark-green logo used in light mode.
- `assets/logo/exerfit-logo-light.png` — Bright-green logo used in dark mode and on fixed dark authentication sidebars.
- The transparent logo variants switch automatically with the selected site theme.

## Notes

- ExerFit is a learning/prototype project.
- GPS features require browser location permission.
- Map and routing features depend on external map services and browser internet access.
- Account, workout, route, and activity prototype data is stored in the user's browser.

## GitHub Pages Deployment

- Keep the JavaScript folder named exactly `JS` (uppercase), matching the paths used by the HTML pages. GitHub Pages runs on a case-sensitive Linux filesystem; `JS` and `js` are different paths even if they appear identical on some Windows setups.
- The HTML entry points load `JS/auth.js`, `JS/dashboard.js`, and `JS/theme.js` using paths that match the repository folder name.
- After pushing changes, open the published site and use a hard refresh (Ctrl+F5) to avoid an older cached copy.
- Sign-up and login in this prototype use `localStorage`. Accounts are saved only in the browser and website origin where they are created; they are not shared with other browsers or devices.
- This project does not currently connect to a hosted authentication database or server. Do not use a real password for this prototype.
