$server = "arma.101stdoombattalion.com"
$timeoutMilliseconds = 5000

$serversToCheck = @(
    @{
        Name      = "Server 1"
        QueryPort = 2101
        GamePort  = 2100
    },
    @{
        Name      = "Server 2"
        QueryPort = 2201
        GamePort  = 2200
    },
    @{
        Name      = "Server 3"
        QueryPort = 2301
        GamePort  = 2300
    }
)

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

    $packet = [byte[]](
        0xFF,
        0xFF,
        0xFF,
        0xFF,
        0x54
    ) +
    [System.Text.Encoding]::ASCII.GetBytes(
        "Source Engine Query"
    ) +
    [byte[]](0x00)

    foreach ($serverEntry in $serversToCheck) {
        $serverName = $serverEntry.Name
        $queryPort = $serverEntry.QueryPort
        $gamePort = $serverEntry.GamePort
        $udp = $null

        try {
            $udp = New-Object System.Net.Sockets.UdpClient
            $udp.Client.ReceiveTimeout = $timeoutMilliseconds

            $endpoint = New-Object System.Net.IPEndPoint(
                $ip,
                $queryPort
            )

            [void]$udp.Send(
                $packet,
                $packet.Length,
                $endpoint
            )

            $remoteEndpoint = New-Object System.Net.IPEndPoint(
                [System.Net.IPAddress]::Any,
                0
            )

            $response = $udp.Receive(
                [ref]$remoteEndpoint
            )

            if ($response.Length -gt 0) {
                Write-Output "RESULT|$serverName|ONLINE|$gamePort"
            }
            else {
                Write-Output "RESULT|$serverName|OFFLINE|$gamePort"
            }
        }
        catch {
            Write-Output "RESULT|$serverName|OFFLINE|$gamePort"

            Write-Error (
                "$serverName query failed on port ${queryPort}: " +
                $_.Exception.Message
            )
        }
        finally {
            if ($null -ne $udp) {
                $udp.Close()
                $udp.Dispose()
            }
        }
    }
}
catch {
    Write-Error (
        "Unable to resolve or contact ${server}: " +
        $_.Exception.Message
    )

    foreach ($serverEntry in $serversToCheck) {
        Write-Output (
            "RESULT|{0}|OFFLINE|{1}" -f
            $serverEntry.Name,
            $serverEntry.GamePort
        )
    }
}