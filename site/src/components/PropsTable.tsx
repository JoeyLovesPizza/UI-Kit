export interface PropRow {
  name: string
  type: string
  default?: string
  description: string
}

export function PropsTable({ rows }: { rows: PropRow[] }) {
  return (
    <div className="props-table-wrap">
      <table className="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>
                <code>{row.name}</code>
              </td>
              <td>
                <code>{row.type}</code>
              </td>
              <td>{row.default ? <code>{row.default}</code> : '—'}</td>
              <td>{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
