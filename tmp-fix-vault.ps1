$file = 'c:\Users\USER\Downloads\rillcod-academy-main\rillcod-academy-main\src\app\dashboard\students\bulk-register\page.tsx'
$lines = [System.IO.File]::ReadAllLines($file)
Write-Host "Total lines: $($lines.Count)"

# Lines 1895-1909 are 0-indexed as 1894-1908
# Replace them with the correct JSX

$newBlock = @(
"                                          <div className=`"flex items-center gap-4 shrink-0`">",
"                                            {editingResultId !== r.id && (",
"                                              <>",
"                                                <span className=`"text-[9px] font-black text-cyan-400/80 bg-cyan-400/10 px-3 py-1.5 border border-cyan-400/20 uppercase tracking-widest hidden sm:block italic`">",
"                                                  {r.class_name || '...'}",
"                                                </span>",
"                                                <div className=`"flex opacity-0 group-hover/it:opacity-100 transition-opacity gap-1`">",
"                                                  <button onClick={() => setEditingResultId(r.id)} className=`"p-2 text-muted-foreground hover:text-cyan-400 transition-colors`">",
"                                                    <PencilIcon className=`"w-4 h-4`" />",
"                                                  </button>",
"                                                  {['admin', 'teacher'].includes(profile?.role || '') && (",
"                                                    <button",
"                                                      onClick={async () => {",
"                                                        if (!confirm('Purge this record from the vault?')) return;",
"                                                        await fetch(`/api/students/bulk-register?resultId=${r.id}`, { method: 'DELETE' });",
"                                                        setBatchResults(prev => prev.filter(x => x.id !== r.id));",
"                                                        fetchHistory();",
"                                                        toast.success('Record purged successfully.');",
"                                                      }}",
"                                                      className=`"p-2 text-muted-foreground hover:text-rose-500 transition-colors`"",
"                                                    >",
"                                                      <TrashIcon className=`"w-4 h-4`" />",
"                                                    </button>",
"                                                  )}",
"                                                </div>",
"                                              </>",
"                                            )}",
"                                          </div>"
)

# Build new array: lines before 1895 (index 1894) + new block + lines from 1910 (index 1909)
$before = $lines[0..1893]
$after = $lines[1909..($lines.Count - 1)]
$result = $before + $newBlock + $after

[System.IO.File]::WriteAllLines($file, $result, [System.Text.Encoding]::UTF8)
Write-Host "Done. New total lines: $($result.Count)"
