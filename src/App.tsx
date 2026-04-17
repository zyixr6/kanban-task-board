import { useEffect, useMemo, useState } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import './App.css'
import {
  loadBoardState,
  makeActivityRecord,
  makeCommentRecord,
  makeLabelRecord,
  makeTaskLabelRecord,
  makeTaskRecord,
  saveBoardState,
} from './lib/localBoard'
import type {
  CommentRecord,
  LabelRecord,
  Task,
  TaskActivityRecord,
  TaskLabelRecord,
  TaskStatus,
} from './types'

type LaneConfig = { key: TaskStatus; label: string }
type PageView = 'board' | 'stats'
type NoteDraft = { title: string; description: string; priority: 'low' | 'normal' | 'high'; dueDate: string }
type DetailDraft = { title: string; description: string; priority: 'low' | 'normal' | 'high'; dueDate: string; status: TaskStatus }

const lanes: LaneConfig[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'In Review' },
  { key: 'done', label: 'Done' },
]

const emptyDraft: NoteDraft = { title: '', description: '', priority: 'normal', dueDate: '' }
const labelColors = ['#20badb', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#eab308']

function App() {
  // this keeps drag pickup feeling intentional instead of firing on tiny accidental clicks
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [userId, setUserId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [activities, setActivities] = useState<TaskActivityRecord[]>([])
  const [labels, setLabels] = useState<LabelRecord[]>([])
  const [taskLabels, setTaskLabels] = useState<TaskLabelRecord[]>([])
  const [drafts, setDrafts] = useState<Record<TaskStatus, NoteDraft>>({
    todo: { ...emptyDraft },
    in_progress: { ...emptyDraft },
    in_review: { ...emptyDraft },
    done: { ...emptyDraft },
  })
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pageView, setPageView] = useState<PageView>('board')
  const [activeLane, setActiveLane] = useState<TaskStatus | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [detailDraft, setDetailDraft] = useState<DetailDraft | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [newLabelName, setNewLabelName] = useState('')
  const [detailSaving, setDetailSaving] = useState(false)

  useEffect(() => {
    const initializeBoard = () => {
      setLoading(true)
      setErrorMessage(null)
      try {
        const boardState = loadBoardState()
        setUserId(boardState.userId)
        setTasks(boardState.tasks)
        setComments(boardState.comments)
        setActivities(boardState.activities)
        setLabels(boardState.labels)
        setTaskLabels(boardState.taskLabels)
      } catch {
        setErrorMessage('Could not load the saved local board state.')
      } finally {
        setLoading(false)
      }
    }

    initializeBoard()
  }, [])

  useEffect(() => {
    if (loading || !userId) return

    saveBoardState({
      userId,
      tasks,
      comments,
      activities,
      labels,
      taskLabels,
    })
  }, [activities, comments, labels, loading, taskLabels, tasks, userId])

  useEffect(() => {
    const task = tasks.find((currentTask) => currentTask.id === selectedTaskId)
    if (!task) {
      setDetailDraft(null)
      return
    }

    // this keeps the modal form synced to the task record
    setDetailDraft({
      title: task.title,
      description: task.description ?? '',
      priority: task.priority ?? 'normal',
      dueDate: task.due_date ?? '',
      status: task.status,
    })
  }, [selectedTaskId, tasks])

  const groupedTasks = useMemo(
    () =>
      // keeping the board grouped here makes rendering dead simple and avoids lane components doing their own filtering
      lanes.reduce<Record<TaskStatus, Task[]>>(
        (groups, lane) => ({ ...groups, [lane.key]: tasks.filter((task) => task.status === lane.key) }),
        { todo: [], in_progress: [], in_review: [], done: [] },
      ),
    [tasks],
  )

  const labelsByTaskId = useMemo(
    () =>
      // this lets cards and the modal ask for labels by task id without repeatedly joining arrays at render time
      taskLabels.reduce<Record<string, LabelRecord[]>>((groups, item) => {
        const label = labels.find((currentLabel) => currentLabel.id === item.label_id)
        if (!label) return groups
        groups[item.task_id] = [...(groups[item.task_id] ?? []), label]
        return groups
      }, {}),
    [labels, taskLabels],
  )

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null
  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? null
  const selectedComments = comments.filter((comment) => comment.task_id === selectedTaskId)
  const selectedActivities = activities.filter((activity) => activity.task_id === selectedTaskId)

  const boardStats = useMemo(() => {
    // the stats page only needs a few summary numbers, so i derive them once from the task list
    const totalTasks = tasks.length
    const completedTasks = tasks.filter((task) => task.status === 'done').length
    const overdueTasks = tasks.filter((task) => isOverdue(task.due_date, task.status)).length
    const dueSoonTasks = tasks.filter((task) => isDueSoon(task.due_date, task.status)).length
    const highPriorityTasks = tasks.filter((task) => task.priority === 'high').length
    return {
      totalTasks,
      completedTasks,
      overdueTasks,
      dueSoonTasks,
      highPriorityTasks,
      completionRate: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
    }
  }, [tasks])

  const logActivity = (taskId: string, description: string) => {
    if (!userId) return
    // activity now stays local so the demo works fully offline and on static hosting
    const record = makeActivityRecord({ task_id: taskId, description, user_id: userId })
    setActivities((currentActivities) => [record, ...currentActivities])
  }

  const createNote = (status: TaskStatus) => {
    const draft = drafts[status]
    if (!draft.title.trim() || !userId) return

    const nextTask = makeTaskRecord({
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      priority: draft.priority,
      due_date: draft.dueDate || null,
      status,
      user_id: userId,
    })
    setTasks((currentTasks) => [nextTask, ...currentTasks])
    setDrafts((currentDrafts) => ({ ...currentDrafts, [status]: { ...emptyDraft } }))
    setActiveLane(null)
    logActivity(nextTask.id, `Created in ${getLaneLabel(status)}.`)
  }

  const moveTask = (taskId: string, nextStatus: TaskStatus) => {
    const previousTask = tasks.find((task) => task.id === taskId)
    setTasks((currentTasks) => currentTasks.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)))
    if (previousTask && previousTask.status !== nextStatus) {
      logActivity(taskId, `Moved from ${getLaneLabel(previousTask.status)} to ${getLaneLabel(nextStatus)}.`)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    // dropping onto either a lane or another card should still resolve to the closest lane
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    setActiveTaskId(null)
    if (!overId) return
    const overTask = tasks.find((task) => task.id === overId)
    const nextStatus = lanes.find((lane) => lane.key === overId)?.key ?? overTask?.status
    if (!nextStatus) return
    moveTask(activeId, nextStatus)
  }

  const saveTaskDetail = async () => {
    if (!selectedTask || !detailDraft) return
    setDetailSaving(true)

    // the modal edits are batched into one update so the activity log can reflect the final result cleanly
    const updates = {
      title: detailDraft.title.trim(),
      description: detailDraft.description.trim() || null,
      priority: detailDraft.priority,
      due_date: detailDraft.dueDate || null,
      status: detailDraft.status,
    }
    const previousTask = selectedTask
    setTasks((currentTasks) => currentTasks.map((task) => (task.id === selectedTask.id ? { ...task, ...updates } : task)))

    const messages: string[] = []
    // i keep these messages plain because they get reused directly in the timeline
    if (previousTask.title !== updates.title) messages.push('Updated the title.')
    if ((previousTask.description ?? '') !== (updates.description ?? '')) messages.push('Updated the description.')
    if ((previousTask.priority ?? 'normal') !== updates.priority) messages.push(`Changed priority to ${getPriorityLabel(updates.priority)}.`)
    if ((previousTask.due_date ?? '') !== (updates.due_date ?? '')) {
      messages.push(updates.due_date ? `Set due date to ${formatDateLong(updates.due_date)}.` : 'Cleared the due date.')
    }
    if (previousTask.status !== updates.status) {
      messages.push(`Moved from ${getLaneLabel(previousTask.status)} to ${getLaneLabel(updates.status)}.`)
    }
    messages.forEach((message) => logActivity(selectedTask.id, message))
    setDetailSaving(false)
  }

  const createLabel = () => {
    if (!newLabelName.trim() || !userId) return
    // rotating through a small palette keeps custom labels visually distinct without adding another design control
    const color = labelColors[labels.length % labelColors.length]
    const label = makeLabelRecord({ name: newLabelName.trim(), color, user_id: userId })
    setLabels((currentLabels) => [...currentLabels, label])
    setNewLabelName('')
  }

  const toggleTaskLabel = (labelId: string) => {
    if (!selectedTask) return
    // labels are many-to-many, so the modal just flips the join record on or off
    const existing = taskLabels.find((item) => item.task_id === selectedTask.id && item.label_id === labelId)
    if (existing) {
      setTaskLabels((currentTaskLabels) => currentTaskLabels.filter((item) => item.id !== existing.id))
      const label = labels.find((currentLabel) => currentLabel.id === labelId)
      if (label) logActivity(selectedTask.id, `Removed label ${label.name}.`)
      return
    }

    const record = makeTaskLabelRecord({ task_id: selectedTask.id, label_id: labelId })
    setTaskLabels((currentTaskLabels) => [...currentTaskLabels, record])
    const label = labels.find((currentLabel) => currentLabel.id === labelId)
    if (label) logActivity(selectedTask.id, `Added label ${label.name}.`)
  }

  const addComment = () => {
    if (!selectedTask || !commentDraft.trim() || !userId) return
    const comment = makeCommentRecord({ task_id: selectedTask.id, body: commentDraft.trim(), user_id: userId })
    setComments((currentComments) => [...currentComments, comment])
    setCommentDraft('')
    logActivity(selectedTask.id, 'Added a comment.')
  }

  const deleteTask = () => {
    if (!selectedTask) return
    const taskId = selectedTask.id
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId))
    setComments((currentComments) => currentComments.filter((comment) => comment.task_id !== taskId))
    setActivities((currentActivities) => currentActivities.filter((activity) => activity.task_id !== taskId))
    setTaskLabels((currentTaskLabels) => currentTaskLabels.filter((item) => item.task_id !== taskId))
    setSelectedTaskId(null)
    setCommentDraft('')
    setNewLabelName('')
  }

  return (
    <div className="boardApp">
      <main className="boardShell">
        <header className="appHeader">
          <div>
            <p className="boardEyebrow">Next Play Assessment</p>
            <h1 className="boardTitle">Kanban Board</h1>
          </div>
          <nav className="topNav">
            <button className={`topNavButton ${pageView === 'board' ? 'topNavButtonActive' : ''}`} onClick={() => setPageView('board')}>Board</button>
            <button className={`topNavButton ${pageView === 'stats' ? 'topNavButtonActive' : ''}`} onClick={() => setPageView('stats')}>Stats</button>
          </nav>
        </header>

        {errorMessage ? <div className="boardError">{errorMessage}</div> : null}

        {pageView === 'stats' ? (
          <StatsPage boardStats={boardStats} groupedTasks={groupedTasks} />
        ) : loading ? (
          <section className="boardLoading">Loading board...</section>
        ) : (
          <>
            <header className="boardHeader">
              <p className="boardSubtitle">Click any empty part of a column to add a note, drag them across the workflow, open task details for deeper edits, and check out the Stats tab for board summary.</p>
              <div className="boardMeta"><span>{tasks.length} Notes</span></div>
            </header>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={(event) => setActiveTaskId(String(event.active.id))}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveTaskId(null)}
            >
              <section className="laneGrid">
                {lanes.map((lane) => (
                  <LaneColumn
                    key={lane.key}
                    lane={lane}
                    tasks={groupedTasks[lane.key]}
                    taskLabels={labelsByTaskId}
                    draft={drafts[lane.key]}
                    isComposerOpen={activeLane === lane.key}
                    onOpenComposer={() => setActiveLane(lane.key)}
                    onCloseComposer={() => setActiveLane(null)}
                    onDraftChange={(field, value) =>
                      setDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [lane.key]: { ...currentDrafts[lane.key], [field]: value },
                      }))
                    }
                    onCreateNote={() => createNote(lane.key)}
                    onSelectTask={setSelectedTaskId}
                  />
                ))}
              </section>
              <DragOverlay adjustScale={false} dropAnimation={null}>
                {activeTask ? <NoteCardOverlay task={activeTask} taskLabels={labelsByTaskId[activeTask.id] ?? []} /> : null}
              </DragOverlay>
            </DndContext>

            {selectedTask && detailDraft ? (
              <TaskDetailModal
                task={selectedTask}
                detailDraft={detailDraft}
                labels={labels}
                activeLabels={labelsByTaskId[selectedTask.id] ?? []}
                comments={selectedComments}
                activities={selectedActivities}
                commentDraft={commentDraft}
                newLabelName={newLabelName}
                saving={detailSaving}
                onClose={() => {
                  setSelectedTaskId(null)
                  setCommentDraft('')
                  setNewLabelName('')
                }}
                onDraftChange={(field, value) => setDetailDraft((currentDraft) => (currentDraft ? { ...currentDraft, [field]: value } : currentDraft))}
                onCommentDraftChange={setCommentDraft}
                onNewLabelNameChange={setNewLabelName}
                onCreateLabel={() => createLabel()}
                onToggleLabel={(labelId) => toggleTaskLabel(labelId)}
                onAddComment={() => addComment()}
                onSave={() => void saveTaskDetail()}
                onDelete={() => deleteTask()}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}

function StatsPage({
  boardStats,
  groupedTasks,
}: {
  boardStats: { totalTasks: number; completedTasks: number; overdueTasks: number; dueSoonTasks: number; highPriorityTasks: number; completionRate: number }
  groupedTasks: Record<TaskStatus, Task[]>
}) {
  return (
    <section className="statsPage">
      {/* the stats page is intentionally lightweight so it feels like a quick snapshot, not a second app */}
      <div className="statsGrid">
        <StatsCard label="Total Tasks" value={boardStats.totalTasks} />
        <StatsCard label="Completed" value={boardStats.completedTasks} />
        <StatsCard label="Overdue" value={boardStats.overdueTasks} />
        <StatsCard label="Due Soon" value={boardStats.dueSoonTasks} />
        <StatsCard label="High Priority" value={boardStats.highPriorityTasks} />
        <StatsCard label="Completion Rate" value={`${boardStats.completionRate}%`} />
      </div>
      <div className="statsBreakdown">
        {lanes.map((lane) => (
          <article key={lane.key} className="statsLaneCard">
            <p>{lane.label}</p>
            <strong>{groupedTasks[lane.key].length}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}

function StatsCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="statsCard">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function LaneColumn({
  lane,
  tasks,
  taskLabels,
  draft,
  isComposerOpen,
  onOpenComposer,
  onCloseComposer,
  onDraftChange,
  onCreateNote,
  onSelectTask,
}: {
  lane: LaneConfig
  tasks: Task[]
  taskLabels: Record<string, LabelRecord[]>
  draft: NoteDraft
  isComposerOpen: boolean
  onOpenComposer: () => void
  onCloseComposer: () => void
  onDraftChange: <Key extends keyof NoteDraft>(field: Key, value: NoteDraft[Key]) => void
  onCreateNote: () => void
  onSelectTask: (taskId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.key })

  return (
    <section ref={setNodeRef} className={`laneColumn ${isOver ? 'laneColumnActive' : ''}`}>
      <div className="laneColumnHeader">
        <div>
          <h2>{lane.label}</h2>
          <span>{tasks.length} notes</span>
        </div>
      </div>

      {isComposerOpen ? (
        <div className="noteComposer">
          {/* the lane composer stays inline so adding work feels like part of the board, not a separate flow */}
          <input value={draft.title} onChange={(event) => onDraftChange('title', event.target.value)} placeholder="Title" className="noteComposerInput" />
          <textarea value={draft.description} onChange={(event) => onDraftChange('description', event.target.value)} placeholder="Description (optional)" rows={4} className="noteComposerInput noteComposerTextarea" />
          <div className="noteComposerMeta">
            <label className="noteComposerField">
              <span>Priority</span>
              <select value={draft.priority} onChange={(event) => onDraftChange('priority', event.target.value as NoteDraft['priority'])} className="noteComposerInput">
                <option value="low">Low Priority</option>
                <option value="normal">Normal Priority</option>
                <option value="high">High Priority</option>
              </select>
            </label>
            <label className="noteComposerField">
              <span>Due Date</span>
              <input type="date" value={draft.dueDate} onChange={(event) => onDraftChange('dueDate', event.target.value)} className="noteComposerInput" />
            </label>
          </div>
          <div className="noteComposerActions">
            <button onClick={onCreateNote} className="primaryAction" disabled={!draft.title.trim()}>Add Note</button>
            <button onClick={onCloseComposer} className="secondaryAction">Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="noteList" onClick={(event) => { if (event.target === event.currentTarget) onOpenComposer() }}>
        <div className="noteListStack">
          {tasks.map((task) => (
            <NoteCard key={task.id} task={task} taskLabels={taskLabels[task.id] ?? []} onOpenTask={() => onSelectTask(task.id)} />
          ))}
        </div>
      </div>
    </section>
  )
}

function NoteCard({ task, taskLabels, onOpenTask }: { task: Task; taskLabels: LabelRecord[]; onOpenTask: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })

  return (
    <article
      ref={setNodeRef}
      // i intentionally stop moving the source card once dragging starts so only the overlay is visible
      style={{ transform: isDragging ? undefined : CSS.Transform.toString(transform) }}
      className={`noteCard ${isDragging ? 'noteCardDragging' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onOpenTask()
      }}
      {...attributes}
      {...listeners}
    >
      <p>{task.title}</p>
      {task.description ? <span className="noteCardDescription">{task.description}</span> : null}
      {task.priority || task.due_date ? (
        <div className="noteCardMeta">
          {task.priority ? <span className={`noteBadge ${getPriorityClass(task.priority)}`}>{getPriorityLabel(task.priority)}</span> : null}
          {task.due_date ? <span className={`noteBadge noteBadgeDate ${getDueDateClass(task.due_date, task.status)}`}>Due {formatDate(task.due_date)}</span> : null}
        </div>
      ) : null}
      {taskLabels.length > 0 ? (
        <div className="noteCardLabels">
          {taskLabels.map((label) => (
            <span key={label.id} className="noteTag" style={{ backgroundColor: `${label.color}20`, borderColor: `${label.color}55`, color: label.color }}>
              {label.name}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function NoteCardOverlay({ task, taskLabels }: { task: Task; taskLabels: LabelRecord[] }) {
  return (
    <article className="noteCard noteCardOverlay">
      <p>{task.title}</p>
      {task.description ? <span className="noteCardDescription">{task.description}</span> : null}
      {task.priority || task.due_date ? (
        <div className="noteCardMeta">
          {task.priority ? <span className={`noteBadge ${getPriorityClass(task.priority)}`}>{getPriorityLabel(task.priority)}</span> : null}
          {task.due_date ? <span className={`noteBadge noteBadgeDate ${getDueDateClass(task.due_date, task.status)}`}>Due {formatDate(task.due_date)}</span> : null}
        </div>
      ) : null}
      {taskLabels.length > 0 ? (
        <div className="noteCardLabels">
          {taskLabels.map((label) => (
            <span key={label.id} className="noteTag" style={{ backgroundColor: `${label.color}20`, borderColor: `${label.color}55`, color: label.color }}>
              {label.name}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function TaskDetailModal({
  task,
  detailDraft,
  labels,
  activeLabels,
  comments,
  activities,
  commentDraft,
  newLabelName,
  saving,
  onClose,
  onDraftChange,
  onCommentDraftChange,
  onNewLabelNameChange,
  onCreateLabel,
  onToggleLabel,
  onAddComment,
  onSave,
  onDelete,
}: {
  task: Task
  detailDraft: DetailDraft
  labels: LabelRecord[]
  activeLabels: LabelRecord[]
  comments: CommentRecord[]
  activities: TaskActivityRecord[]
  commentDraft: string
  newLabelName: string
  saving: boolean
  onClose: () => void
  onDraftChange: <Key extends keyof DetailDraft>(field: Key, value: DetailDraft[Key]) => void
  onCommentDraftChange: (value: string) => void
  onNewLabelNameChange: (value: string) => void
  onCreateLabel: () => void
  onToggleLabel: (labelId: string) => void
  onAddComment: () => void
  onSave: () => void
  onDelete: () => void
}) {
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <section className="taskModal" onClick={(event) => event.stopPropagation()}>
        <div className="taskModalHeader">
          <div>
            <p className="boardEyebrow">Task Detail</p>
            <h2>{task.title}</h2>
          </div>
          <button className="modalCloseButton" onClick={onClose}>Close</button>
        </div>

        <div className="taskModalGrid">
          <div className="taskModalMain">
            <div className="modalSection">
              {/* edits live on the left so the main task fields read top to bottom like a normal form */}
              <h3>Edit Task</h3>
              <div className="modalFieldStack">
                <label className="noteComposerField"><span>Title</span><input value={detailDraft.title} onChange={(event) => onDraftChange('title', event.target.value)} className="noteComposerInput" /></label>
                <label className="noteComposerField"><span>Description</span><textarea value={detailDraft.description} onChange={(event) => onDraftChange('description', event.target.value)} rows={5} className="noteComposerInput noteComposerTextarea" /></label>
                <label className="noteComposerField">
                  <span>Status</span>
                  <select value={detailDraft.status} onChange={(event) => onDraftChange('status', event.target.value as TaskStatus)} className="noteComposerInput">
                    {lanes.map((lane) => <option key={lane.key} value={lane.key}>{lane.label}</option>)}
                  </select>
                </label>
                <label className="noteComposerField">
                  <span>Priority</span>
                  <select value={detailDraft.priority} onChange={(event) => onDraftChange('priority', event.target.value as DetailDraft['priority'])} className="noteComposerInput">
                    <option value="low">Low Priority</option>
                    <option value="normal">Normal Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                </label>
                <label className="noteComposerField"><span>Due Date</span><input type="date" value={detailDraft.dueDate} onChange={(event) => onDraftChange('dueDate', event.target.value)} className="noteComposerInput" /></label>
              </div>
                <div className="modalActionRow">
                  <button className="primaryAction modalSaveButton" onClick={onSave} disabled={saving || !detailDraft.title.trim()}>{saving ? 'Saving...' : 'Save Changes'}</button>
                  <button className="secondaryAction deleteActionButton" onClick={onDelete}>Delete Note</button>
                </div>
              </div>

            <div className="modalSection">
              {/* labels are lightweight metadata, so i keep them close to the edit form instead of burying them below comments */}
              <h3>Labels</h3>
              <div className="labelComposer">
                <input value={newLabelName} onChange={(event) => onNewLabelNameChange(event.target.value)} placeholder="New label" className="noteComposerInput" />
                <button className="secondaryAction" onClick={onCreateLabel}>Add Label</button>
              </div>
              <div className="labelOptions">
                {labels.map((label) => {
                  const isActive = activeLabels.some((activeLabel) => activeLabel.id === label.id)
                  return (
                    <button
                      key={label.id}
                      className={`labelToggle ${isActive ? 'labelToggleActive' : ''}`}
                      onClick={() => onToggleLabel(label.id)}
                      style={{ borderColor: `${label.color}55`, color: label.color, backgroundColor: isActive ? `${label.color}1f` : 'rgba(255,255,255,0.03)' }}
                    >
                      {label.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="taskModalSide">
            <div className="modalSection">
              {/* comments and activity sit together because they both answer "what happened on this task?" */}
              <h3>Comments</h3>
              <div className="commentComposer">
                <textarea value={commentDraft} onChange={(event) => onCommentDraftChange(event.target.value)} rows={3} placeholder="Write a comment" className="noteComposerInput noteComposerTextarea" />
                <button className="primaryAction" onClick={onAddComment} disabled={!commentDraft.trim()}>Add Comment</button>
              </div>
              <div className="commentList">
                {comments.length === 0 ? <p className="emptySectionText">No comments yet.</p> : null}
                {comments.map((comment) => (
                  <article key={comment.id} className="commentCard">
                    <p>{comment.body}</p>
                    <span>{formatDateTime(comment.created_at)}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className="modalSection">
              <h3>Activity</h3>
              <div className="activityList">
                {activities.length === 0 ? <p className="emptySectionText">No activity yet.</p> : null}
                {activities.map((activity) => (
                  <article key={activity.id} className="activityItem">
                    <p>{activity.description}</p>
                    <span>{formatTimeAgo(activity.created_at)}</span>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function getPriorityClass(priority: Task['priority']) {
  if (priority === 'high') return 'noteBadgeHigh'
  if (priority === 'low') return 'noteBadgeLow'
  return 'noteBadgeNormal'
}

function getPriorityLabel(priority: NonNullable<Task['priority']>) {
  if (priority === 'high') return 'High Priority'
  if (priority === 'low') return 'Low Priority'
  return 'Normal Priority'
}

function getLaneLabel(status: TaskStatus) {
  return lanes.find((lane) => lane.key === status)?.label ?? status
}

function isOverdue(dueDate: string | null, status: TaskStatus) {
  if (!dueDate || status === 'done') return false
  return new Date(`${dueDate}T23:59:59`).getTime() < Date.now()
}

function isDueSoon(dueDate: string | null, status: TaskStatus) {
  if (!dueDate || status === 'done') return false
  const dueValue = new Date(`${dueDate}T23:59:59`).getTime()
  const now = Date.now()
  return dueValue >= now && dueValue <= now + 1000 * 60 * 60 * 24 * 3
}

function getDueDateClass(dueDate: string, status: TaskStatus) {
  if (isOverdue(dueDate, status)) return 'noteBadgeOverdue'
  if (isDueSoon(dueDate, status)) return 'noteBadgeSoon'
  return ''
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function formatDateLong(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function formatTimeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${Math.max(minutes, 1)} minute${minutes === 1 ? '' : 's'} ago`
}

export default App
