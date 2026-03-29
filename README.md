# SM-2 Flashcard App

A React + Vite flashcard app with cloud sync and spaced repetition scheduling using the SM-2 algorithm.

## Features

- **User Accounts** - Sign up / sign in with email & password (Firebase Auth)
- **Cloud Sync** - Cards, history, and settings sync across devices
- **Offline Support** - Works without account (localStorage fallback)
- **Add flashcards** - Create cards with front and back text
- **Bulk Import** - Paste tab-separated cards to import multiple at once
- **Anki-style Review** - Show answer button, then grade with Again/Hard/Good/Easy
- **SM-2 Scheduling** - Spaced repetition algorithm for optimal retention
- **Statistics** - Track reviews per day, streak, and average
- **Settings** - Configure daily review limit and new cards per day
- **Dark Theme** - Futuristic dark UI

## Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Authentication** > **Email/Password** sign-in method
4. Enable **Cloud Firestore** database
   - Start in test mode or configure security rules (see below)
5. Go to **Project Settings** > **Your Apps** > Add web app
6. Copy the config values to `.env`:

```env
VITE_FIREBASE_API_KEY=AIzaSyDidIhTx0rHiCoTDYd5x1zQkBk0ieDY_oU
VITE_FIREBASE_AUTH_DOMAIN=steel-br.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=steel-br
VITE_FIREBASE_STORAGE_BUCKET=steel-br.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1026910405417
VITE_FIREBASE_APP_ID=1:1026910405417:web:d524fa5e14b1fff9b12d38
```

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## SM-2 Update Rules

Given quality `q` in [0..5]:

- `EF' = max(1.3, EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)))`
- If `q >= 3`:
  - if reps = 0 => interval = 1
  - if reps = 1 => interval = 6
  - else interval = round(interval * EF')
  - reps = reps + 1
- If `q < 3`:
  - reps = 0
  - interval = 1
- Next due date = today + interval days

## Run

1. Install Node.js 18+
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env` file with Firebase config (see above)
4. Start dev server:
   ```bash
   npm run dev
   ```
5. Build production bundle:
   ```bash
   npm run build
   ```

## Data Storage

- **Logged in**: Data stored in Firestore under `users/{uid}`
- **Not logged in**: Data stored in localStorage (keys: `sm2_flashcards_v1`, `sm2_review_history_v1`, `sm2_settings_v1`)
- When signing in, local data is migrated to the cloud if the user is new
