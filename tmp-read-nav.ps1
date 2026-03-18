$result = & git -C "c:\Users\USER\Downloads\rillcod-academy-main\rillcod-academy-main" show "c9ebfea:src/components/layout/DashboardNavigation.tsx" 2>&1
$result | Out-File -FilePath "c:\Users\USER\Downloads\rillcod-academy-main\rillcod-academy-main\tmp-nav-old.txt" -Encoding UTF8
Write-Host "Done. Lines: $($result.Count)"
