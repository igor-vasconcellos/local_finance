# Desliga o Local Finance: encontra o processo que escuta na porta 3000 e
# fecha a janela do servidor aberta pelo iniciar.bat (cmd /k), com tudo dentro.
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) {
  Write-Host " O Local Finance nao estava rodando."
  exit 0
}

$target = $conn.OwningProcess
$cur = $conn.OwningProcess
for ($i = 0; $i -lt 8; $i++) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$cur" -ErrorAction SilentlyContinue
  if (-not $p) { break }
  if ($p.Name -eq 'cmd.exe' -and $p.CommandLine -match '/k') { $target = $p.ProcessId; break }
  $cur = $p.ParentProcessId
}

taskkill /PID $target /T /F | Out-Null
Write-Host " Local Finance desligado."
