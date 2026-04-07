# Kanban Task Board

A full-stack Kanban-style task management application built with React, TypeScript, and Supabase.

The app allows users to create and manage tasks across four workflow stages — **To Do, In Progress, In Review, and Done** — using a drag-and-drop interface. Tasks can include descriptions, priority levels, due dates, labels, comments, and activity history.

The board is designed to stay simple and fast to use, while more advanced functionality (editing, comments, and history) is handled through a dedicated task detail modal. A separate stats view provides an overview of project progress and key metrics.

The application uses anonymous authentication and Row Level Security (RLS) to ensure each user only has access to their own data.

Demo: https://kanban-task-board-inky.vercel.app/

## Tech Stack

- React + TypeScript
- Vite + Tailwind CSS
- Supabase (PostgreSQL + Auth)
- @dnd-kit (drag and drop)
- Vercel (deployment)