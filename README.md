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
| Projector | `/projector` | Click **Enter Fullscreen Stage Mode** once (unlocks sound). The welcome screen shows a QR code with the join address. |
| Team phones | `/buzzer` | Team number + PIN. One phone per team; logging in on another phone closes the first. |

Admin hotkeys: **Space** reveal next option, **Enter** start 3-2-1 countdown, **Esc** reset buzzer (Round 1); **Z / X / C** correct / wrong / pass (Rapid Fire).

If the projector page is opened on `localhost`, the QR code uses the laptop's LAN IP reported by the backend; check it matches the venue Wi-Fi address. The demo PIN list on the launchpad only appears on the dev server.
