# Step Tracker App — Systematic Technical Knowledge

## 1. Objective

Build a React Native step-tracking application that:

- Counts daily steps accurately.
- Continues collecting step data when the app UI is closed.
- Works offline for core step tracking.
- Uses native Android/iOS motion and health APIs instead of implementing step detection from scratch.
- Stores historical data locally.
- Can later synchronize data to a cloud backend.
- Can integrate with platform health ecosystems such as Android Health Connect and Apple HealthKit.
- Handles difficult cases such as backgrounding, force-kills, device reboots, permissions, time zones, and multiple data sources.

---

# 2. Core Principle

The most important architectural principle is:

> **The app should not be responsible for detecting every individual step. The operating system and device sensors should do that work. The app should retrieve, process, store, and display the resulting activity data.**

### High-level architecture

```text
                PHONE HARDWARE
                      │
             Accelerometer / IMU
                      │
                      ▼
              ANDROID / iOS OS
                      │
          ┌───────────┴───────────┐
          │                       │
     Step sensors            Health system
          │                       │
          ▼                       ▼
  Android Step APIs       Health Connect / HealthKit
          │                       │
          └───────────┬───────────┘
                      ▼
              Native integration
                      │
                      ▼
              React Native layer
                      │
                      ▼
                Local database
                      │
              ┌───────┴────────┐
              │                │
             UI          Optional cloud sync
```

---

# 3. What a Step Counter Actually Does

A phone has motion sensors, primarily an accelerometer and often a gyroscope.

The raw accelerometer measures acceleration along three axes:

```text
X → left/right
Y → up/down
Z → forward/backward
```

A simplified motion magnitude can be represented as:

```text
A = sqrt(x² + y² + z²)
```

A walking pattern creates repeated movement characteristics.

A basic custom algorithm could conceptually look for repeated peaks:

```text
Acceleration
    │
    │       /\        /\        /\
    │      /  \      /  \      /  \
────┼─────/────\────/────\────/────\────
    │
    └──────────────────────────────────► time

          step 1     step 2     step 3
```

However, **our app should generally not implement this algorithm itself**.

Modern Android/iOS systems can perform step detection using device hardware and OS-level processing.

---

# 4. Why Use Native Step / Motion APIs?

If we process raw accelerometer data ourselves, we would need to solve:

- Noise filtering.
- Phone orientation.
- Pocket vs hand vs bag placement.
- Walking vs running.
- Vehicle vibration.
- False positives.
- Missed steps.
- Different walking patterns.
- Sampling rates.
- Battery consumption.
- Background execution.
- Android/iOS differences.

The native platform already handles much of this.

Therefore:

```text
BAD / unnecessarily complex

Accelerometer
     ↓
React Native
     ↓
Our own step algorithm
     ↓
Steps
```

Preferred:

```text
Preferred

Phone sensors
     ↓
Android/iOS step detection
     ↓
Native step / health APIs
     ↓
React Native
     ↓
Our application
```

---

# 5. Native APIs Are Not Internet APIs

The term "API" does not mean an HTTP request to a remote server.

For step tracking, these are **local device/OS APIs**.

Example:

```text
Phone sensor
     ↓
Android OS
     ↓
TYPE_STEP_COUNTER
     ↓
Our app
```

No internet request is required.

Likewise on iOS:

```text
iPhone sensors
     ↓
iOS
     ↓
Core Motion / CMPedometer
     ↓
Our app
```

### Core functionality can therefore work offline

| Feature | Internet required? |
|---|---|
| Step detection | No |
| Reading today's steps | No |
| Daily goal | No |
| Local history | No |
| Local database | No |
| Progress calculations | No |
| Cloud backup | Yes |
| Account/login | Yes |
| Cloud synchronization | Yes |
| Online leaderboard | Yes |

---

# 6. Android Step Sensors

Android exposes step-related sensors including:

## `TYPE_STEP_COUNTER`

This is the important sensor for our architecture.

It provides a cumulative step count.

Example:

```text
Phone starts / sensor state
        ↓
Counter = 0

Walk 1,000 steps
        ↓
Counter = 1,000

Walk another 2,000
        ↓
Counter = 3,000
```

The application can read the current cumulative value rather than having to manually count every individual step.

## `TYPE_STEP_DETECTOR`

This is an event-oriented sensor that can report individual detected steps.

Conceptually:

```text
step detected → event
step detected → event
step detected → event
```

For the application's daily total, `TYPE_STEP_COUNTER` is generally the more useful primitive.

---

# 7. The Critical Background-Tracking Concept

The application should NOT depend on React Native JavaScript running continuously.

Instead:

```text
                 APP CLOSED
                     │
                     X
            React Native JS stops
                     │
                     │
                     ▼
             Android OS remains
                     │
                     ▼
             Step sensor subsystem
                     │
                     ▼
             Step data accumulates
                     │
                     ▼
            User opens our app
                     │
                     ▼
             App reads current data
```

This is the fundamental reason the architecture can work even when the app UI is closed.

---

# 8. Example: App Closed for Several Hours

At 8:00 AM:

```text
Android step counter = 45,000
```

Our app stores:

```text
baseline = 45,000
```

The user closes the app.

Between 8:00 AM and 1:00 PM:

```text
User walks ≈ 4,000 steps
```

The React Native application does not need to be running.

The device-side counter can become:

```text
49,000
```

At 1:00 PM, the user opens the app.

The app reads:

```text
current counter = 49,000
```

Then:

```text
Today's steps
= current counter - baseline

= 49,000 - 45,000

= 4,000
```

---

# 9. Important Problem: Device Reboots

A cumulative step counter can reset after a device reboot.

Example:

```text
Before reboot:

Sensor = 80,000

       ↓
   PHONE REBOOTS
       ↓

After reboot:

Sensor = 500
```

Naively calculating:

```text
500 - 80,000
```

would produce an invalid result.

Therefore our application needs a sensor-state layer.

Example:

```text
SensorState

lastSensorValue
lastReadingTime
lastKnownBoot/session state
currentDailyBaseline
```

When a reset is detected:

```text
Old value = 80,000
New value = 500

        ↓

Counter reset detected

        ↓

Start a new sensor baseline

        ↓

Continue calculating today's activity correctly
```

The exact reboot/recovery implementation must be validated on target Android versions and devices.

---

# 10. Android Health Connect

Health Connect is an important part of the architecture.

It is a platform health-data layer rather than the physical sensor itself.

Conceptually:

```text
Phone sensors
      │
      ▼
Android system
      │
      ▼
Health Connect
      │
      ▼
Our app
```

Health Connect can also contain health/activity information supplied by other applications or devices, depending on available integrations and user permissions.

Example:

```text
Phone ─────────────┐
                   │
Smartwatch ────────┼──► Health Connect ──► Our app
                   │
Other health app ──┘
```

This is useful when the user has multiple sources of activity data.

---

# 11. Why Health Connect Is Useful

A major benefit is that it provides a standardized health-data layer.

Instead of our application needing a custom integration for every possible fitness application/device:

```text
Our app
 ├── Google integration
 ├── Samsung integration
 ├── Fitbit integration
 ├── Watch integration
 ├── Device-specific integration
 └── ...
```

we can use:

```text
Our app
      ↓
Health Connect
      ↓
Available health-data sources
```

This significantly simplifies the architecture.

---

# 12. Health Connect Does Not Replace the Sensor

Important distinction:

```text
Sensor
  =
physical/system mechanism that detects movement
```

while:

```text
Health Connect
  =
standardized health-data storage/access layer
```

A simplified chain can be:

```text
Accelerometer / step sensor
          ↓
Android OS
          ↓
Health Connect
          ↓
Our application
```

Health Connect is therefore not "the thing that detects your foot."

---

# 13. Health Connect and App-Closed Operation

A desired architecture is:

```text
User walks
     ↓
Android detects steps
     ↓
Health Connect / system health data
     ↓
Our React Native app is closed
     ↓
Data remains available
     ↓
User opens app
     ↓
Our app queries accumulated data
     ↓
Dashboard updates
```

This is preferable to keeping a React Native process alive continuously.

---

# 14. Aggregation and Double Counting

This is one of the most important issues in a serious health app.

Suppose:

```text
Phone = 5,000 steps
Watch = 4,000 steps
```

It is WRONG to automatically assume:

```text
5,000 + 4,000 = 9,000
```

The phone and watch could have measured the same walking activity.

Therefore:

```text
              Multiple sources
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
     Phone         Watch      Other app
       │            │            │
       └────────────┼────────────┘
                    ▼
               Aggregation
                    │
                    ▼
              Deduplicated total
```

The application should use platform-supported aggregation where available rather than blindly summing raw records.

---

# 15. Android Health Connect Strategy

A robust Android architecture should consider two layers:

```text
                 ANDROID
                    │
          ┌─────────┴─────────┐
          │                   │
   Native step sensor    Health Connect
          │                   │
          └─────────┬─────────┘
                    ▼
              Step repository
                    │
                    ▼
             Data normalization
                    │
                    ▼
             Local application DB
```

The exact precedence and fallback rules need to be defined so that we do not double-count the same activity.

---

# 16. Background Execution vs Background Data

This distinction is critical.

We do NOT necessarily need:

```text
React Native JS
      ↓
running every second
      ↓
all day
```

Instead:

```text
OS / health system
      ↓
collects activity
      ↓
stores/maintains data
      ↓
our app reads it when needed
```

Background execution is only needed if we want our own application state/database to synchronize periodically without the user opening the app.

---

# 17. WorkManager / Background Synchronization

On Android, a background scheduling mechanism such as `WorkManager` can be considered for periodic background work.

Conceptually:

```text
Health Connect
      │
      │ accumulated data
      ▼
WorkManager
      │
      │ periodic sync
      ▼
Our native data layer
      │
      ▼
Local database
```

The application should avoid unnecessarily waking up every second.

That would waste battery and would be a poor mobile architecture.

---

# 18. iOS Architecture

iOS has its own system framework for pedestrian activity:

## `CMPedometer`

It can provide information such as:

- Steps
- Distance
- Floors
- Pace
- Cadence

It supports historical queries and live updates.

Conceptually:

```text
iPhone sensors
      ↓
iOS
      ↓
Core Motion / CMPedometer
      ↓
React Native native bridge
      ↓
Our app
```

The iOS architecture should be implemented separately from Android because the platform APIs and background rules are different.

---

# 19. HealthKit on iOS

For broader health-data integration, iOS provides HealthKit.

A future architecture can be:

```text
             iOS
              │
      ┌───────┴────────┐
      │                │
 Core Motion        HealthKit
      │                │
      └───────┬────────┘
              ▼
       Our native layer
              ▼
        React Native
```

As with Android, permissions and data-source behavior must be explicitly handled.

---

# 20. React Native Abstraction

React Native should not contain platform-specific business logic everywhere.

Create a common abstraction such as:

```text
StepDataSource

getTodaySteps()
getSteps(startDate, endDate)
getDistance(startDate, endDate)
getFloors(startDate, endDate)
getPace(startDate, endDate)
```

Then:

```text
                   React Native
                        │
                  StepDataSource
                        │
             ┌──────────┴──────────┐
             │                     │
          Android                 iOS
             │                     │
       Step Sensor +          CMPedometer +
       Health Connect          HealthKit
```

The React Native UI can then use the same application-level interface on both platforms.

---

# 21. Local Database

The app should have a local database so the core product remains offline-first.

A simplified table could be:

```text
daily_activity

date
steps
distance
floors
active_minutes
calories
source
last_updated
```

Example:

```text
2026-08-20 → 8,421 steps
2026-08-21 → 10,832 steps
2026-08-22 → 7,921 steps
2026-08-23 → 5,481 steps
```

The exact schema should eventually be expanded for source provenance, synchronization state, and conflict handling.

---

# 22. Offline-First Architecture

The preferred data flow is:

```text
             PLATFORM HEALTH DATA
                      │
                      ▼
              Native data layer
                      │
                      ▼
              Local application DB
                      │
                      ▼
               React Native UI
                      │
              Optional cloud sync
                      │
                      ▼
                  Backend
```

Internet should be an optional synchronization layer, not a requirement for basic step tracking.

---

# 23. Cloud Synchronization

If accounts and multi-device synchronization are added:

```text
             React Native
                  │
                  ▼
             Local DB
                  │
             Sync engine
                  │
              Internet
                  │
                  ▼
              Backend API
                  │
                  ▼
             PostgreSQL
```

Potential cloud features:

- Account login
- Backup
- Cross-device synchronization
- Historical recovery
- Leaderboards
- Social features
- Cloud analytics

---

# 24. Daily Step Calculation

If using a cumulative device counter, a basic calculation is:

```text
todaySteps = currentSensorValue - dailyBaseline
```

Example:

```text
Morning baseline = 47,210
Current value    = 52,381

Today's steps = 52,381 - 47,210
              = 5,171
```

However, a production implementation must account for:

- Reboots
- Counter resets
- Sensor availability
- Date boundaries
- Time zones
- Permission changes
- Data source changes
- Historical corrections

For Health Connect, prefer platform aggregation of cumulative step data rather than blindly adding overlapping records.

---

# 25. Time Zones and Midnight

The application needs explicit rules for daily boundaries.

For example:

```text
23:59 → previous day
00:00 → new day
```

But the user could travel across time zones.

Therefore, daily activity records should have carefully defined timezone semantics.

Do not simply assume the server timezone or UTC midnight is the user's "day."

---

# 26. Force-Killed App

There are multiple meanings of "closed."

### User leaves the app

```text
App foreground
      ↓
Home button / gesture
      ↓
App backgrounded
```

The OS can continue managing the underlying sensor/health data.

### App process is suspended

The OS may stop executing our JavaScript.

That is why the design should not depend on continuous JS execution.

### User force-stops the application

This is different.

The app should not assume arbitrary background work will continue after a force-stop.

The robust strategy is:

```text
Do not rely on our app process
        ↓
Rely on OS / health-system data
        ↓
Recover accumulated data when permitted
        ↓
Sync when the app becomes active
```

Exact behavior must be tested on real Android/iOS devices and target OS versions.

---

# 27. Phone Reboot

The application needs reboot recovery.

Conceptually:

```text
Before reboot
     ↓
Sensor counter = 80,000
     ↓
Phone reboots
     ↓
Sensor counter = 500
     ↓
Detect reset
     ↓
Start new sensor epoch/baseline
     ↓
Continue daily calculation
```

The database should preserve enough metadata to identify counter epochs and prevent invalid subtraction.

---

# 28. Distance

Distance can be estimated from steps:

```text
distance ≈ steps × stride_length
```

Example:

```text
8,000 steps × 0.72 m
≈ 5.76 km
```

A better implementation should personalize stride length when possible.

Platform-provided distance data can also be used when available.

---

# 29. Calories

Calories should not be calculated using a single universal:

```text
steps × constant
```

A better estimate can consider:

- Body weight
- Height
- Age
- Sex
- Distance
- Pace
- Activity intensity

For health applications, estimates should be clearly labeled as estimates.

---

# 30. Desired App Architecture

A complete architecture could look like:

```text
                           MOBILE APP
                               │
                       ┌───────▼───────┐
                       │ React Native  │
                       │ UI + Domain   │
                       └───────┬───────┘
                               │
                     ┌─────────▼─────────┐
                     │ Step Repository   │
                     └─────────┬─────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
          Android Native                iOS Native
                 │                           │
       ┌─────────┴─────────┐         ┌───────┴────────┐
       │                   │         │                │
 Step Counter        Health Connect Core Motion    HealthKit
       │                   │         │                │
       └─────────┬─────────┘         └───────┬────────┘
                 │                           │
                 └─────────────┬─────────────┘
                               ▼
                        Data normalization
                               │
                               ▼
                       Deduplication/
                         aggregation
                               │
                               ▼
                         Local database
                               │
                  ┌────────────┴────────────┐
                  │                         │
                 UI                    Sync engine
                                            │
                                         Internet
                                            │
                                            ▼
                                       Backend API
                                            │
                                            ▼
                                       PostgreSQL
```

---

# 31. Features We Can Build

## V1 — Core

- Today's steps
- Daily goal
- Progress indicator
- Offline tracking
- Local history

## V2 — Analytics

- Weekly steps
- Monthly steps
- Daily averages
- Best day
- Streaks
- Personal records
- Distance
- Calories
- Floors
- Pace where available

## V3 — Platform health integration

- Android Health Connect
- iOS HealthKit
- Multiple activity sources
- Source provenance
- Deduplication/aggregation

## V4 — Cloud

- Authentication
- Cloud backup
- Multi-device sync
- Data recovery
- Social features
- Leaderboards

---

# 32. Example Dashboard

```text
┌───────────────────────────────────┐
│           TODAY                    │
│                                   │
│             7,842                 │
│             STEPS                 │
│                                   │
│       ███████████████░░░          │
│             78.4%                 │
│                                   │
│ Goal          10,000              │
│ Distance      5.6 km              │
│ Calories      310 kcal*           │
│                                   │
│ *estimated                       │
└───────────────────────────────────┘
```

---

# 33. Reliability Strategy

To make the tracker robust:

1. Use native platform step/health APIs.
2. Avoid custom accelerometer-based step detection unless there is a specific reason.
3. Do not depend on React Native JavaScript running continuously.
4. Use OS-managed activity/health data for closed-app periods.
5. Use Health Connect on Android where appropriate.
6. Use Core Motion/HealthKit on iOS where appropriate.
7. Maintain a local database.
8. Track sensor-counter epochs and handle reboots.
9. Handle permissions explicitly.
10. Handle time zones and date boundaries.
11. Prevent duplicate counting from multiple sources.
12. Use background scheduling only when needed for synchronization.
13. Treat internet as optional for core functionality.
14. Test on real devices rather than relying only on emulators.
15. Test background, suspended, force-stopped, rebooted, offline, and permission-change scenarios.

---

# 34. Important Testing Matrix

The app should eventually be tested under:

```text
┌──────────────────────────────┐
│ Test Scenario                │
├──────────────────────────────┤
│ App open                     │
│ App backgrounded             │
│ App suspended                │
│ App force-stopped            │
│ Phone locked                 │
│ Phone rebooted               │
│ No internet                  │
│ Wi-Fi only                   │
│ Mobile data only             │
│ Permission revoked           │
│ Permission restored          │
│ Timezone changed             │
│ Midnight boundary            │
│ Phone carried in pocket      │
│ Phone carried in hand        │
│ Phone in backpack            │
│ Phone left stationary        │
│ Phone + smartwatch            │
│ Multiple health-data sources │
└──────────────────────────────┘
```

---

# 35. Final Mental Model

The entire system can be remembered as:

```text
                 MOVEMENT
                    │
                    ▼
             PHONE HARDWARE
                    │
                    ▼
              MOBILE OS
                    │
        ┌───────────┴───────────┐
        │                       │
   Step sensors            Health layer
        │                       │
        └───────────┬───────────┘
                    ▼
              Native APIs
                    │
                    ▼
             React Native
                    │
                    ▼
              Local database
                    │
          ┌─────────┴─────────┐
          │                   │
        Display           Cloud sync
          │                   │
          ▼                   ▼
       Dashboard          Backend
```

## The single most important design decision

**Do not build the step counter around a permanently running React Native process.**

Build it around:

```text
OS-level sensor/health data
          ↓
native platform API
          ↓
React Native data layer
          ↓
local database
          ↓
optional cloud synchronization
```

That is the foundation for making the app work reliably even when the user is not actively using the application.
