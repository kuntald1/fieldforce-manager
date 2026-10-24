// Builds a CSV from data already loaded in the browser (no server-side
// generation needed for this — the report endpoints already return the
// full dataset as JSON for display; this just re-serializes it).
export function downloadCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) return;

  const header = columns.map((c) => c.label).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const value = typeof c.value === "function" ? c.value(row) : row[c.value];
        const text = value == null ? "" : String(value);
        // Quote any field containing a comma, quote, or newline — basic CSV escaping.
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(",")
  );
  const csv = [header, ...lines].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
