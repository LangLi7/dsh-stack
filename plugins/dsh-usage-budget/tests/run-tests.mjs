// Testeinstieg ohne Kindprozesse: Die Sandbox erlaubt `node --test` keine
// spawns (EPERM), deshalb werden die Testdateien direkt importiert. Der
// Node-Testrunner läuft dann im selben Prozess und meldet über TAP.
for (const file of process.argv.slice(2)) {
  await import(new URL(`./${file}`, import.meta.url).href)
}
