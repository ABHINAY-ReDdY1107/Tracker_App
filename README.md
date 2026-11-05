# Gym Tracker — Firebase Edition

A personal React + Vite tracker with Google sign-in and Cloud Firestore sync.

## 1. Install and run

```bash
npm install
cp .env.example .env
npm run dev
```

Fill `.env` with your Firebase web-app configuration before signing in.

## 2. Firebase setup (Spark plan)

1. Create a project at https://console.firebase.google.com/.
2. Add a Web App and copy its Firebase config into `.env`.
3. In **Authentication → Sign-in method**, enable **Google**.
4. In **Authentication → Settings → Authorized domains**, add:
   - `localhost`
   - `abhinay-reddy1107.github.io`
5. In **Firestore Database**, create a database (production mode is fine).
6. Open **Firestore → Rules**, paste the contents of `firestore.rules`, and publish.
7. Keep the project on the **Spark** plan. Do not link a billing account.

Firebase web config values are public client configuration, not admin credentials. The Firestore rules are what protect each account's data. Never put service-account keys in this project.

## 3. Deploy to GitHub Pages

The Vite base path is currently `/GYM-TRACKER-FIREBASE/`. If your repository has a different name, update `base` in `vite.config.js`.

Add the Firebase variables as GitHub Actions repository secrets (or repository variables) named exactly as in `.env.example`. Build and deploy the `dist` directory with GitHub Pages. For a simple manual deployment, run `npm run build` and publish `dist` using your preferred GitHub Pages workflow.

For local testing, `.env` is read by Vite and must not be committed.

## 4. Existing data migration

On the first successful Google login, the app checks the cloud document for existing data. If no cloud record exists, it imports the browser's existing `gymDays`, `foodLogs`, `workoutLogs`, and `theme` localStorage values and writes a migration marker to Firestore. It keeps the browser's localStorage untouched. If a cloud record already exists, it is never replaced by local data.

Important: the original localStorage data can only be migrated from the browser/device where it currently exists. Open this app on that same browser for the first login if you want to migrate those records. If you have used the old app on multiple devices/browsers, export/copy data from each before switching.

## 5. Data backup

Use Settings → Export backup to download a JSON backup. Import validates the file and asks before replacing cloud data.

## 6. Notes

- Google login uses Firebase Authentication.
- Each user has one private Firestore document at `users/{uid}/tracker/main`.
- Firestore local persistence supports offline reads/writes and later synchronization.
- Firestore on Spark has quotas. If quotas are exceeded, requests may be paused until the next quota period. No paid services are enabled by this project.
