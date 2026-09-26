/** Split a SQL migration file into executable statements. */
export function splitSqlStatements(sqlText: string): string[] {
  const withoutBlockComments = sqlText.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlockComments
    .split(";")
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((part) => part.length > 0);
}
