export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done'

// this stays close to the database shape so the supabase responses can be used with very little massaging
export type Task = {
    id: string
    title: string
    description: string | null
    status: TaskStatus
    priority: 'low' | 'normal' | 'high' | null
    due_date: string | null
    user_id: string
    created_at: string
}

// comments are intentionally separate so task rows do not become giant text blobs over time
export type CommentRecord = {
    id: string
    task_id: string
    body: string
    user_id: string | null
    created_at: string
}

// activity records are plain english timeline entries that the ui can show without extra formatting work
export type TaskActivityRecord = {
    id: string
    task_id: string
    description: string
    user_id: string | null
    created_at: string
}

// labels are user-owned so each board can develop its own vocabulary
export type LabelRecord = {
    id: string
    name: string
    color: string
    user_id: string | null
    created_at: string
}

// this join table keeps labels flexible without hard-coding arrays into the task record
export type TaskLabelRecord = {
    id: string
    task_id: string
    label_id: string
    created_at: string
}
