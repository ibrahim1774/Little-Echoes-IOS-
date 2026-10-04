# Little Echoes iOS — Design

Date: 2026-10-04
Status: awaiting review

## Goal

Ship Little Echoes as an iOS app that looks and behaves like the existing web app
(`github.com/ibrahim1774/LittleEchoes`), using the same Supabase project for accounts and
data, with App Store subscriptions through Superwall instead of Stripe.

Success means: a parent can install the app, go through onboarding, create an account,
add a child, subscribe, record audio and video, see those memories, and find the same
data when signing in on the web — with no known bugs, verified by automated tests and an
end-to-end run of the real app.

## Decisions made with the owner

| Topic | Decision |
| --- | --- |
| Stack | Expo / React Native, TypeScript, development build |
| Bundle ID | `com.ibrahim1774.littleechoes` |
| Expo project ID | `dcf0a4bb-84dc-4fa9-94f2-03e2cb312c64` |
| Plans | Basic $4.99/mo (audio only, no trial), Pro $9.99/mo, Pro $59.99/yr (3-day trial on both Pro plans) |
| Sign-in | Email + password, and Google. **Sign in with Apple is deferred** (see Open items) |
| Paywall | Hard gate, same as web: nothing in the main app is usable without a subscription |
| App record | The owner creates the App Store Connect app record once the bundle ID exists |

## Existing systems

- **Supabase** project `caeuzqwznmoweiakycls` ("Little Echoes"). Tables `profiles`
  (`id`, `parent` jsonb, `children` jsonb, `paid`, `tier`), `recordings`, `sessions`,
  `videos` (each `id`, `user_id`, `data` jsonb, `created_at`). Private buckets
  `recordings` and `videos`, files at `<user_id>/<item_id>.<ext>`. Row-level security is
  on. 12 users, none marked paid.
- **Superwall** project `42595`, iOS app `57235`, one `pro` entitlement, no products,
  no bundle ID, no paywall.
- **App Store Connect**: no Little Echoes app yet. Reachable through `superwall asc`.

## Architecture

### App shell

- Expo with `expo-router` (file-based routes) and a development build; Expo Go is not
  usable because Superwall and AppsFlyer ship native code.
- NativeWind for styling so the web app's Tailwind classes and theme tokens
  (`echo-coral #FF6B6B`, `echo-cream #FFF9F0`, and the rest of `tailwind.config.ts`)
  carry over. Fonts: Nunito and Inter. Dark mode via the same `dark:` classes.
- Global state stays a reducer in `AppContext`, same shape and actions as the web.

### Routes

| Route | Web source | Notes |
| --- | --- | --- |
| `/` (entry) | `Splash` logic | Sends the user to onboarding, sign-in, setup, paywall or home based on state |
| `/onboarding` | `OnboardingFlow3` | The 6 screens, same copy and images |
| `/signup`, `/signin` | `SignupScreen`, `SigninScreen` | Email + Google |
| `/setup/parent`, `/setup/child` | `ParentSetup`, `AddChild` | |
| `/paywall` | `OnboardingPaywall3` | A holding screen that triggers the Superwall paywall; shown whenever the user has no active subscription |
| `/(tabs)/home` | `Home` | |
| `/(tabs)/today` | `TodayScreen` + `QuestionDisplay`, `RecordingView`, `ReviewRecording`, `SessionComplete` | |
| `/(tabs)/videos` | `VideoScreen`, `VideoUpgradeScreen` | Upgrade screen for Basic |
| `/(tabs)/memories` | `Memories` | Timeline, calendar, growth |
| `/(tabs)/settings` | `Settings` | Plus Restore Purchases, Manage Subscription, Delete Account |

Not ported: both landing pages, onboarding variants 1, 2, 4 and 5, both pricing
screens, the payment-success screen, Stripe API routes, Facebook pixel, Clarity, the
debug console, the service worker.

### Units

Each unit has one job and a small interface so it can be tested alone.

- `services/db` — SQLite (`expo-sqlite`) replacing Dexie. Same seven stores: parents,
  children, questions, sessions, recordings, streaks, videos. Seeds starter questions.
- `services/storage` — the web's `storage.ts` function set, unchanged signatures
  (`getParent`, `saveRecording`, `updateStreak`, `getQuestionsForChild`, …). Recordings
  hold a local file URI instead of a Blob.
- `services/files` — writes, reads and deletes media files in the app's documents
  directory.
- `services/cloudSync` — `syncToCloud`, `loadFromCloud`, delete and download helpers.
  Same table rows and storage paths as the web so the two clients interoperate.
- `services/supabase` — client with session persisted in secure storage.
- `services/auth` — email sign-up/sign-in, Google sign-in (native Google SDK →
  `signInWithIdToken`), sign-out, delete account.
- `services/subscription` — wraps Superwall: configure, identify with the Supabase user
  id, expose `{ isPaid, tier }` from active entitlements, register placements, restore.
- `services/notifications` — schedules weekly local notifications for the chosen days
  and time; cancels when the day's session is complete or reminders are turned off.
- `services/analytics` — one `track(event, props)` that fans out to PostHog and
  AppsFlyer.
- `hooks/useRecording`, `hooks/useVideoRecording` — same return shape as the web hooks
  (state, elapsed seconds, start/stop/reset), built on `expo-audio` and `expo-camera`.
  Audio is recorded as `.m4a` (`audio/mp4`). Video is capped at 15 seconds, `.mp4`.
- `data/questions` — copied as-is.
- Pure logic extracted for tests: `calcAgeGroup`, streak calculation, question
  selection, sync row mapping, entitlement → tier mapping.

### Data flow

1. Recording finishes → file saved locally → row saved in SQLite → UI moves on.
2. Sync runs in the background: upload file to the bucket, upsert the row. Failures are
   logged and retried on the next sync; the user is never blocked.
3. On sign-in and app start: `loadFromCloud` pulls profile, children, recordings,
   sessions and videos, and removes local items deleted elsewhere.
4. Playback uses the local file when present, otherwise downloads from the bucket and
   caches it.

Known limit: recordings made on the web in WebM (Chrome, Android) cannot be decoded on
iOS. They appear in Memories with a "Recorded on another device — not playable here"
note instead of a broken player.

### Subscriptions

- App Store Connect: one subscription group "Little Echoes".
  - `littleechoes_basic_monthly` — $4.99/month, level 2.
  - `littleechoes_pro_monthly` — $9.99/month, 3-day free trial, level 1.
  - `littleechoes_pro_yearly` — $59.99/year, 3-day free trial, level 1.
- Superwall: entitlements `basic` (Basic product) and `pro` (both Pro products).
- Tier resolution: `pro` entitlement → `pro`; else `basic` entitlement → `basic`; else
  unpaid. The admin email `ibrahim3709@gmail.com` always resolves to Pro, as on the web.
- Placements:
  - `onboarding_paywall` — after the first child is added, and whenever an unpaid user
    reaches the app.
  - `video_gate` — a Basic user opens the Video tab or taps upgrade there.
  - `settings_upgrade` — "Upgrade to Pro" in Settings.
- The paywall is built in the Superwall editor to match the web "Choose your plan"
  screen: three selectable plan cards, trial and best-value badges, features of the
  selected plan, coral CTA, plus the Restore, Terms and Privacy links Apple requires.
- After a purchase or restore the app writes `paid` and `tier` to `profiles` so the web
  app treats the user as subscribed. This is client-written, as it is on the web today.
- Settings: "Restore Purchases" and "Manage subscription" (opens Apple's subscription
  page).

### Account deletion

Supabase Edge Function `delete-account`: verifies the caller's token, removes their
files from both buckets, deletes their rows from the four tables, deletes the auth
user. The app then clears local data and returns to onboarding. Confirmation dialog
first.

### Permissions

Microphone, camera, notifications, and App Tracking Transparency (asked once after
onboarding, for ad attribution). Each has a plain-language usage string.

### Error handling

- Auth errors show the server message inline, as on the web.
- Permission denied → an explanation with a button to open iOS Settings.
- Offline → recording and browsing still work from local data; sync resumes later.
- Purchase cancelled → the user stays on the paywall, no error. Purchase failure → the
  message from the store.
- A failed Superwall config load must not grant access; the user stays gated and can
  retry.

### Secrets

Client-side keys (Supabase URL and anon key, Superwall public key, AppsFlyer dev key,
PostHog project key, Google client IDs) go in app config through environment files that
are not committed. The App Store Connect private key is never placed in the repo.

## Testing

- **Unit tests (Jest)** for all pure logic: age groups, streaks across day boundaries,
  question selection and daily caching, sync row mapping in both directions, tier
  resolution including the admin override.
- **Service tests** against an in-memory SQLite and a mocked Supabase client: storage
  functions, sync upload/download/delete, deletion reconciliation.
- **Type check and lint** clean.
- **End-to-end on the iOS simulator**, driving the real app through every flow:
  onboarding, sign-up, sign-in, parent and child setup, paywall presentation, audio
  session with all three questions, free-form recording, video capture, Memories in all
  three views, playback, delete, settings changes, reminders, dark mode, sign-out,
  account deletion. Verified against the Supabase database after each write.
- **Cross-client check**: data created on iOS appears on the web app and the reverse.
- **Purchases**: Superwall test mode on the simulator for all three plans, upgrade from
  Basic to Pro, restore; then StoreKit sandbox on a TestFlight build.
- **Independent review** of the finished code by a separate reviewer before hand-off.

Purchases against real App Store products can only be confirmed after the owner creates
the app record; until then they are verified in Superwall test mode and reported as
such.

## Open items

1. **Sign in with Apple** is deferred at the owner's request. Apple's review guideline
   4.8 requires it when Google sign-in is offered, so it must be added before
   submitting for App Store review. TestFlight testing is unaffected.
2. **Owner tasks**: create the App Store Connect app record for
   `com.ibrahim1774.littleechoes`; confirm the Paid Apps agreement; create an iOS OAuth
   client in Google Cloud and add it to Supabase's Google provider.
3. **PostHog project key**: needs the owner's go-ahead to look it up with the personal
   key provided, or the `phc_` key directly.
4. **Superwall editor pairing code** is likely to expire before paywall work starts; a
   fresh one will be requested then.
