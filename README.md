# Kanban Task Board

A Kanban-style task board built with React and TypeScript for static demo hosting.

The app lets users create and manage notes across four workflow stages: **To Do, In Progress, In Review, and Done**. Notes support descriptions, priorities, due dates, labels, comments, drag-and-drop movement, and an activity history panel.

The board now stores all data locally in the browser with `localStorage`, so it works without a backend and remains available after refreshes on the same device/browser profile. That makes it safe to demo on GitHub Pages or any other static host.

## Run Locally

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal, typically `http://localhost:5173`.

## Build For Demo Hosting

```bash
npm run build
```

The generated static site will be written to `dist/`.

## Tech Stack

- React + TypeScript
- Vite
- @dnd-kit
- Browser `localStorage`
