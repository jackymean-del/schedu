/**
 * Block / Building Distance Matrix editor — Blueprint v3, Step 2 (Resources).
 *
 * The admin records how far apart the school's blocks/buildings are, on their own
 * relative scale (lower = closer). Only each unordered pair is entered once; the
 * matrix is symmetric and a block's distance to itself is always 0.
 *
 * schedU uses this in Step 4's AND logic: when a parallel session spans blocks it
 * prefers nearer ones, so students walk as little as possible between sessions.
 *
 * Blocks are seeded from the buildings already present on the venue list, and the
 * admin can add more. Values persist globally (Master Data), reused every cycle.
 */
import { useMemo, useState } from 'react'
import { useBlockDistance, pairKey, allPairs, missingPairs } from '@/lib/blockDistance'
import { Plus, X, Route } from 'lucide-react'

const P = '#685DBC'

export function BlockDistanceMatrix({ venueBuildings }: { venueBuildings: string[] }) {
  const { blocks, distances, addBlock, removeBlock, setDistance, setBlocks } = useBlockDistance()
  const [newBlock, setNewBlock] = useState('')

  // Blocks the venue list knows about but the matrix doesn't yet.
  const unlisted = useMemo(
    () => [...new Set(venueBuildings.map(b => (b || '').trim()).filter(Boolean))].filter(b => !blocks.includes(b)),
    [venueBuildings, blocks],
  )
  const pairs = useMemo(() => allPairs(blocks), [blocks])
  const missing = useMemo(() => missingPairs(blocks, distances), [blocks, distances])

  const single = blocks.length < 2

  return (
    <div style={{ border: '1px solid #E4E0FF', borderRadius: 10, background: '#fff', padding: 14, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Route size={14} color={P} />
        <div style={{ fontSize: 13, fontWeight: 800, color: '#13111E' }}>Block / building distances</div>
        <div style={{ flex: 1 }} />
        {blocks.length >= 2 && (
          <span style={{ fontSize: 11, color: missing.length ? '#B45309' : '#067647', fontWeight: 700 }}>
            {missing.length ? `${missing.length} pair${missing.length > 1 ? 's' : ''} to fill` : 'All pairs set ✓'}
          </span>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: '#6D6A8A', margin: '0 0 10px' }}>
        Only needed if your school spans multiple blocks. Use your own relative scale — <strong>lower = closer</strong>
        {' '}(e.g. A–B 1, A–C 2). schedU prefers nearer blocks when a parallel session spans buildings, so students walk less.
      </p>

      {/* Blocks */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        {blocks.map(b => (
          <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#F5F3FF', border: '1px solid #E4E0FF', borderRadius: 999, padding: '3px 9px', fontSize: 11.5, fontWeight: 700, color: '#4B41C4' }}>
            {b}
            <X size={11} style={{ cursor: 'pointer' }} onClick={() => removeBlock(b)} />
          </span>
        ))}
        <input
          value={newBlock}
          onChange={e => setNewBlock(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newBlock.trim()) { addBlock(newBlock); setNewBlock('') } }}
          placeholder="Add block…"
          style={{ padding: '4px 9px', border: '1px dashed #C8C2F0', borderRadius: 999, fontSize: 11.5, fontFamily: 'inherit', outline: 'none', width: 110 }}
        />
        {newBlock.trim() && (
          <button onClick={() => { addBlock(newBlock); setNewBlock('') }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: P, color: '#fff', border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={11} /> Add
          </button>
        )}
        {unlisted.length > 0 && (
          <button onClick={() => setBlocks([...blocks, ...unlisted])}
            title={`Add the blocks already used by your venues: ${unlisted.join(', ')}`}
            style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Import {unlisted.length} from venues
          </button>
        )}
      </div>

      {single ? (
        <div style={{ fontSize: 11.5, color: '#777391', fontStyle: 'italic' }}>
          Add at least two blocks to record distances between them.
        </div>
      ) : (
        <>
          {/* Pair inputs — each unordered pair once */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
            {pairs.map(([a, b]) => {
              const k = pairKey(a, b)
              const v = distances[k]
              return (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ color: '#4B5275', fontWeight: 600, whiteSpace: 'nowrap' }}>{a} – {b}</span>
                  <input
                    type="number" min={0} step="0.5" value={v ?? ''} placeholder="—"
                    onChange={e => setDistance(a, b, e.target.value === '' ? undefined : Number(e.target.value))}
                    style={{
                      width: 56, padding: '4px 7px', borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
                      border: `1px solid ${v == null ? '#FBBF24' : '#E4E0FF'}`, background: v == null ? '#FFFBEB' : '#fff',
                      outline: 'none', textAlign: 'center',
                    }}
                  />
                </label>
              )
            })}
          </div>

          {/* Resulting symmetric matrix */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr>
                  <th style={cell(true)}>From \ To</th>
                  {blocks.map(b => <th key={b} style={cell(true)}>{b}</th>)}
                </tr>
              </thead>
              <tbody>
                {blocks.map(r => (
                  <tr key={r}>
                    <th style={cell(true)}>{r}</th>
                    {blocks.map(c => {
                      const same = r === c
                      const v = same ? 0 : distances[pairKey(r, c)]
                      return (
                        <td key={c} style={{ ...cell(false), color: same ? '#C9C3EC' : v == null ? '#B45309' : '#13111E' }}>
                          {same ? '—' : (v ?? '·')}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

const cell = (head: boolean): React.CSSProperties => ({
  border: '1px solid #E3E0F0', padding: '4px 10px', textAlign: 'center',
  background: head ? '#F3F1FC' : '#fff', fontWeight: head ? 700 : 500,
  fontVariantNumeric: 'tabular-nums',
})
