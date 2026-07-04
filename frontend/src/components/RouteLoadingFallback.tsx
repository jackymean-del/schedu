/** Lightweight per-route Suspense fallback for lazy-loaded pages (routeTree.gen.ts).
 *  Deliberately tiny/dependency-free — it renders while the route's own chunk
 *  is still downloading, so it must not itself pull anything heavy. */
export function RouteLoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        border: '3px solid #ECE9FB', borderTopColor: '#7C6FE0',
        animation: 'route-spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes route-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
