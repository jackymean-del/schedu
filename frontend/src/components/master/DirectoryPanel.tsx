/**
 * Directory — visibility + maintenance for the shared cross-schedule staff &
 * venue roster (store/directoryStore.ts). Renaming or merging here cascades
 * into every active schedule's own local roster via lib/directoryManagement.ts
 * so the directory never silently drifts from what schedules actually show.
 */
import { useMemo, useState } from 'react'
import { Users, Building2, Merge, Trash2 } from 'lucide-react'
import { useDirectoryStore, type DirectoryStaff, type DirectoryVenue } from '@/store/directoryStore'
import { renameLinkedEntries, mergeLinkedEntries, usageOf, type DirectoryKind } from '@/lib/directoryManagement'
import { P, P_D, P_L, P_B, InlineEdit, TABLE_CARD } from '@/components/resources/shared'

function EntryRow<T extends { id: string; name: string }>({
  entry, kind, others, onRename, onMerge, onRemove,
}: {
  entry: T
  kind: DirectoryKind
  others: T[]
  onRename: (name: string) => void
  onMerge: (targetId: string) => void
  onRemove: () => void
}) {
  const [mergePick, setMergePick] = useState('')
  const usage = useMemo(() => usageOf(entry.id, kind), [entry.id, kind])
  const mergeable = others.filter(o => o.id !== entry.id)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px',
      borderBottom: '1px solid #F3F1FF',
    }}>
      <div style={{ flex: '0 0 220px', minWidth: 0 }}>
        <InlineEdit value={entry.name} onSave={(v) => v.trim() && v.trim() !== entry.name && onRename(v.trim())}
          style={{ fontWeight: 700, fontSize: 13 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#8B87AD' }}>
        {usage.length === 0
          ? <span style={{ fontStyle: 'italic', color: '#C4C0DC' }}>Not used by any active schedule</span>
          : <>Used in: {usage.join(', ')}</>}
      </div>
      <select value={mergePick} onChange={e => setMergePick(e.target.value)}
        disabled={mergeable.length === 0}
        style={{ fontSize: 11.5, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #E4E0FF', color: '#4B5275', fontFamily: 'inherit', background: '#FAFAFE', maxWidth: 160 }}>
        <option value="">Merge into…</option>
        {mergeable.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <button
        disabled={!mergePick}
        onClick={() => { onMerge(mergePick); setMergePick('') }}
        title="Merge this entry into the selected one — every schedule using this entry switches to the target"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6,
          border: `1.5px solid ${mergePick ? P_B : '#E4E0FF'}`, background: mergePick ? P_L : '#fff',
          color: mergePick ? P_D : '#C4C0DC', fontSize: 11, fontWeight: 700,
          cursor: mergePick ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
        }}>
        <Merge size={12} /> Merge
      </button>
      <button onClick={onRemove} title="Remove from directory (does not delete existing schedule rows)"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0BBDD', padding: 4, display: 'inline-flex' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
        onMouseLeave={e => (e.currentTarget.style.color = '#C0BBDD')}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function DirectorySection<T extends { id: string; name: string }>({
  title, icon, entries, kind, rename, remove,
}: {
  title: string
  icon: React.ReactNode
  entries: T[]
  kind: DirectoryKind
  rename: (id: string, name: string) => void
  remove: (id: string) => void
}) {
  function handleRename(entry: T, name: string) {
    rename(entry.id, name)
    renameLinkedEntries(entry.id, name, kind)
  }
  function handleMerge(entry: T, targetId: string) {
    const target = entries.find(e => e.id === targetId)
    if (!target) return
    mergeLinkedEntries(target.id, target.name, entry.id, kind)
    remove(entry.id)
  }

  return (
    <div style={{ ...TABLE_CARD, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid #ECEAFB' }}>
        <span style={{ color: P }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111028' }}>{title}</span>
        <span style={{ fontSize: 10, color: P, background: P_L, borderRadius: 4, padding: '1px 6px 2px', fontWeight: 700, border: `1px solid ${P_B}` }}>
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12, color: '#C4C0DC' }}>
          Nothing here yet — entries are added automatically as schedules use them.
        </div>
      ) : entries.map(entry => (
        <EntryRow key={entry.id} entry={entry} kind={kind} others={entries}
          onRename={(name) => handleRename(entry, name)}
          onMerge={(targetId) => handleMerge(entry, targetId)}
          onRemove={() => remove(entry.id)}
        />
      ))}
    </div>
  )
}

export function DirectoryPanel() {
  const staff = useDirectoryStore(s => s.staff)
  const venues = useDirectoryStore(s => s.venues)
  const renameStaff = useDirectoryStore(s => s.renameStaff)
  const renameVenue = useDirectoryStore(s => s.renameVenue)
  const removeStaff = useDirectoryStore(s => s.removeStaff)
  const removeVenue = useDirectoryStore(s => s.removeVenue)

  return (
    <div>
      <div style={{ fontSize: 11.5, color: '#8B87AD', marginBottom: 14, lineHeight: 1.6 }}>
        The single roster every schedule's Faculty/Venues tabs check against, so the same real
        teacher or room is recognized across schedules instead of guessed from a matching name.
        Renaming or merging here updates every active schedule that uses it.
      </div>
      <DirectorySection<DirectoryStaff> title="Staff Directory" icon={<Users size={16} />}
        entries={staff} kind="staff" rename={renameStaff} remove={removeStaff} />
      <DirectorySection<DirectoryVenue> title="Venue Directory" icon={<Building2 size={16} />}
        entries={venues} kind="venue" rename={renameVenue} remove={removeVenue} />
    </div>
  )
}
