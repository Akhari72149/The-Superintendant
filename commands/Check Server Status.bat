@echo off
setlocal

set "SERVER=arma.101stdoombattalion.com"
set "PORT=2301"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$server = '%SERVER%';" ^
"$port = %PORT%;" ^
"$udp = New-Object System.Net.Sockets.UdpClient;" ^
"$udp.Client.ReceiveTimeout = 5000;" ^
"try {" ^
"  $addresses = [System.Net.Dns]::GetHostAddresses($server);" ^
"  $ip = $addresses | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1;" ^
"  if (-not $ip) { throw 'No IPv4 address found'; }" ^
"  $endpoint = New-Object System.Net.IPEndPoint($ip, $port);" ^
"  $packet = [byte[]](0xFF,0xFF,0xFF,0xFF,0x54) + [System.Text.Encoding]::ASCII.GetBytes('Source Engine Query') + [byte[]](0x00);" ^
"  [void]$udp.Send($packet, $packet.Length, $endpoint);" ^
"  $remote = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0);" ^
"  $response = $udp.Receive([ref]$remote);" ^
"  if ($response.Length -gt 0) {" ^
"    Write-Output 'Arma server is online';" ^
"    Write-Output ('Address: ' + $server + ':' + $port);" ^
"  } else {" ^
"    Write-Output 'Arma server is offline';" ^
"  }" ^
"} catch {" ^
"  Write-Output 'Arma server is offline';" ^
"  Write-Output ('Reason: ' + $_.Exception.Message);" ^
"} finally {" ^
"  $udp.Close();" ^
"}"

endlocal