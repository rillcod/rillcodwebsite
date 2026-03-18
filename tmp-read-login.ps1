$result = & git -C "c:\Users\USER\Downloads\rillcod-academy-main\rillcod-academy-main" show "c9ebfea:src/app/login/page.tsx" 2>&1
$result | Out-File -FilePath "c:\Users\USER\Downloads\rillcod-academy-main\rillcod-academy-main\tmp-login-old.txt" -Encoding UTF8
Write-Host "Done. Lines: $($result.Count)"
