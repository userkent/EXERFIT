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

## Live Link

# github actions: https://userkent.github.io/EXERFIT/

# vercel: https://exerfitkj.vercel.app/


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

## Map Route Planning

The dashboard keeps route planning separate from the Activity recorder. Use the **route icon under the map zoom controls** to enter destination mode, then click any point on the map. ExerFit requests the user's current GPS position, calculates a route to the selected point, draws the route, and shows a separate **Navigate** action. Clicking the map normally does not create a route.

### Map styles and satellite labels

The Base Map control is icon-only. It provides two choices:
- **OpenStreetMap** — the standard map view.
- **Satellite View** — Esri satellite imagery with transparent place/boundary labels and transportation/road-label overlays.

The satellite reference overlays are separate Esri tile services and may show geographic names, road names, and transportation labels according to source coverage and zoom level. Specific business/venue POI icons are not guaranteed by these reference layers.

### Map Layers and Personal Heatmap

Map Settings includes the restored **Map Layers** toggles for Saved Routes and Recorded Activities. The **Personal Heatmap** section reuses the original `map.js` functions and supports Off, All Activities, This Week, and Night. The overlay is drawn from the signed-in user's saved GPS tracks; it does not add sample activity data.

### Travel mode selector

The dashboard header search field sits immediately to the right of the ExerFit logo. The map travel-mode card has an icon-only collapse control: when collapsed, the current mode icon and selected mode remain visible; expand it to choose **Walking**, **Cycling**, or **Driving**. After changing modes, use **Refresh route** in the destination card to recalculate the distance, estimated time, and turn instructions for the new mode.

### Responsive dashboard

The dashboard map and panels include dedicated tablet and mobile layouts. Controls remain touch-sized, panels become bottom sheets on phones, and the map remains usable behind the navigation bar.

## Mobile and tablet support

- The dashboard uses touch-sized controls on phones and tablets.
- Dashboard navigation becomes a fixed bottom navigation bar on phones.
- Map cards and route summaries stay inside the usable screen area.
- The route-planning button remains separate from Activity recording.

## Map controls

- The Map Settings button opens only two base-map choices: **OpenStreetMap** and **Satellite View**.
- The route button below the zoom controls enables destination picking.
- Zooming is capped at the providers' native range so the interface does not show a misleading "map data unavailable" message at extreme zoom levels.

## Routing and Navigation Update

- The default route uses the routing service's normal fastest route for the selected travel mode. For driving this generally favors faster/main roads where the routing data permits; walking and cycling follow roads permitted by their profiles.
- The routing service returns its recommended route plus up to three alternative candidates when available. ExerFit sorts returned candidates by estimated travel time, initially selects the fastest estimate, and lets **Find another route** cycle through the other available candidates.
- During navigation, the map follows the current GPS position and updates the location marker. The routing provider's profile controls which roads are legal for walking, cycling, and driving; the prototype cannot guarantee a particular named highway or live traffic-aware route.
- Route planning remains separate from the Activity recorder.
- The route picker is activated with the map route icon before clicking a destination on the map.

## Weather on the Map

- Activate the **Weather on map** icon, then click any map location to display its current weather in the bottom-left weather card.
- When a GPS route is created, ExerFit also requests weather for the route destination and shows it inside the destination/route card, as well as the floating map weather card.
- The destination card has its own weather refresh icon. The separate **Refresh route** button recalculates the route from the latest GPS position using the selected Walking, Cycling, or Driving mode.
- Weather uses the user's OpenWeatherMap API key.
- The Weather settings now include **Test API key** before saving. A key is not saved when the API test fails.
- The key is stored in browser localStorage for this prototype. A production deployment should use a backend proxy/server-side secret instead of exposing an API key in browser storage.


## Routing, map overlay, and maintenance notes

- Satellite View places the Esri World Boundaries and Places reference tiles and World Transportation reference tiles above Esri World Imagery. The overlays supply geographic/place and road/transportation labels where the map provider has coverage; they do not promise individual shop or restaurant POI icons.
- The router requests up to three route alternatives where the service can provide them, sorts available options by estimated duration, and starts with the quickest estimated option. **Find another route** cycles through the alternatives and updates the navigation route. The routing service cannot guarantee that a particular named highway will always be used; route choice depends on the road network and the selected walking, cycling, or driving profile.
- During active navigation, GPS updates move the user's PNG marker and keep the map camera following the current position. Selecting an alternative from either the route summary or live guidance updates the active navigation route without disconnecting Activity's shared GPS watcher.
- Map Settings restores the original Saved Routes and Recorded Activities toggles and the Off / All Activities / This Week / Night personal activity overlay options.
- Approved dead-code cleanup removed only verified unused imports, the empty `bindMapWeatherClicks()` wrapper, the write-only `tileErrorShown` flag, the unreferenced `estimateWalkPace()` helper, and obsolete styles for unused map-mode thumbnails. Existing map layer, heatmap, activity, navigation, and weather functions were retained.


## Dashboard search and travel controls

- Place search is located in the dashboard header immediately to the right of the ExerFit logo. Search results open directly below the search field.
- The travel-mode card on the map can be collapsed and expanded using its icon-only chevron button. When collapsed, the selected travel-mode icon and label stay visible.
- After choosing a different travel mode, select **Refresh route** in the destination card to request a new route for that mode. The route card also shows destination weather and has a separate weather refresh button.

## Mobile GPS and workout reminders

- Live location, GPS recording, and live navigation require a secure browser context. Use an HTTPS URL when opening ExerFit on a phone or tablet. A LAN address such as `http://192.168.x.x:3000` is not a secure context in common mobile browsers, so location access may be unavailable. The user must also grant the browser's location permission.
- Workout reminders are checked while the ExerFit dashboard page is open. The app plays a short in-page alarm and can show a browser notification when notification permission is granted. Browser autoplay rules mean the user should test the alarm once or interact with the page to enable audio. A browser tab cannot guarantee an alarm after the page is closed or suspended by the operating system; use a native device alarm for critical reminders.
- The public OpenStreetMap search and FOSSGIS routing endpoints are demonstration services. They need an internet connection and may occasionally be unavailable; keep their attribution and use limits in place.
