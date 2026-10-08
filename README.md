# LearnUp Quiz Frontend ⚡

React frontend powered by Vite, Tailwind CSS, Lucide Icons, and Socket.IO Client.

## Tech Stack
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS + Custom Dark Theme Design System
- **Real-Time Engine**: Socket.IO Client
- **Icons**: Lucide React

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```

The frontend will run at `http://localhost:5173` and on the LAN at `http://<laptop-ip>:5173`.

## Running the Live Event
| Screen | URL | Notes |
| :--- | :--- | :--- |
| Admin | `/admin` | Log in with the backend's admin account. Refreshing restores the exact live state. |
| Projector | `/live` (or `/projector`) | Click anywhere once to unlock sound, then use the **Fullscreen** button in the footer. The welcome screen (title, subtitle, badge, QR code, team list) is edited from the admin's Welcome deck. |
| Team phones | `/buzzer` | Team ID (e.g. `T-01`) or team number + PIN. One phone per team; logging in on another phone closes the first. |

The admin dashboard shows a live 16:9 preview of the stage. It is only a preview: the **Projector** badge in the header turns green only when a real projector screen is connected.

**Teams and scores:** register teams (name, Team ID, number, institution, team lead, PIN) from **Teams**. Scores can be corrected from the leaderboard deck: quick +/- buttons, or **Manual Score Override** to set each round's score.

**Question Bank:** in the admin sidebar, open **Questions Bank** to create, edit, delete and reorder questions for each round, upload clips for the audio-visual round (with preview), and export/import the bank as JSON. **Upload CSV** adds the questions in a spreadsheet to the selected round (download **Sample CSV** for the columns; questions already in the round are skipped). For audio-visual rows the *Media File* column names a clip that is already in the media library, so upload the clips first. **Delete Round** clears one round and keeps the others.

**Clips play without buffering:** logging in as admin downloads every audio-visual clip into the browser's local storage (IndexedDB) and tells every connected projector to do the same. The projector plays its local copy. Watch **Clips: projector N/N** in the admin header and wait for it to be complete before Round 2. A projector tab in the same browser as the admin shares the downloaded clips.

Admin hotkeys: **Space** reveal next option, **Enter** start 3-2-1 countdown, **Esc** reset buzzer (Round 1); **Z / X / C** correct / wrong / pass (Rapid Fire).

If the projector page is opened on `localhost`, the QR code uses the laptop's LAN IP reported by the backend; check it matches the venue Wi-Fi address. The demo PIN list on the launchpad only appears on the dev server.
