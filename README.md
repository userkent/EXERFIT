# ExerFit
ExerFit: A Smart Fitness Monitoring and Physical Activity Tracking System

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
- `js/` — JavaScript modules for authentication, maps, GPS tracking, routing, activities, workouts, history, weather, storage, and UI.
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

## Map Route Planning

- Route planning is separate from the Activity/GPS recorder.
- Click the icon-only **Set destination on map** control below the zoom buttons.
- After destination mode is enabled, click any point on the map.
- ExerFit uses the current GPS position as the route start and the clicked point as the destination.
- The planned GPS route is displayed before navigation starts.
- Click **Navigate** in the route summary to begin route guidance.
- Normal map clicks do nothing when destination mode is off.
- The user's current location uses the PNG asset `assets/icons/map-pin.png` instead of a CSS-drawn marker.
