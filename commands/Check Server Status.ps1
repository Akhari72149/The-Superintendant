$server = "arma.101stdoombattalion.com"
$port = 2302
$timeoutMilliseconds = 5000

$udp = $null

try {
    $addresses = [System.Net.Dns]::GetHostAddresses($server)

    $ip = $addresses |
        Where-Object {
            $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork
        } |
        Select-Object -First 1

    if (-not $ip) {
        throw "No IPv4 address was found for $server."
    }

    $udp = New-Object System.Net.Sockets.UdpClient
    $udp.Client.ReceiveTimeout = $timeoutMilliseconds

    $endpoint = New-Object System.Net.IPEndPoint($ip, $port)

    $packet = [byte[]](0xFF, 0xFF, 0xFF, 0xFF, 0x54) +
        [System.Text.Encoding]::ASCII.GetBytes("Source Engine Query") +
        [byte[]](0x00)

    [void]$udp.Send($packet, $packet.Length, $endpoint)

    $remoteEndpoint = New-Object System.Net.IPEndPoint(
        [System.Net.IPAddress]::Any,
        0
    )

    $response = $udp.Receive([ref]$remoteEndpoint)

    if ($response.Length -gt 0) {
        Write-Output "Arma 3 server is online"
        Write-Output "Server: $server"
        Write-Output "Query port: $port"
        Write-Output "Resolved IP: $ip"
    }
    else {
        Write-Output "Arma 3 server is offline"
        Write-Output "No response was returned."
    }
}
catch {
    Write-Output "Arma 3 server is offline"
    Write-Output "Server: $server"
    Write-Output "Query port: $port"
    Write-Output "Reason: $($_.Exception.Message)"
}
finally {
    if ($null -ne $udp) {
        $udp.Close()
        $udp.Dispose()
    }
}