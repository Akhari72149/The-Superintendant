$server = "arma.101stdoombattalion.com"
$timeoutMilliseconds = 5000

$serversToCheck = @(
    @{
        Name = "Server 1"
        Port = 2101
    },
    @{
        Name = "Server 2"
        Port = 2201
    },
    @{
        Name = "Server 3"
        Port = 2301
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

    $packet = [byte[]](0xFF, 0xFF, 0xFF, 0xFF, 0x54) +
        [System.Text.Encoding]::ASCII.GetBytes("Source Engine Query") +
        [byte[]](0x00)

    foreach ($serverEntry in $serversToCheck) {
        $serverName = $serverEntry.Name
        $port = $serverEntry.Port
        $udp = $null

        Write-Output "Checking $serverName on port $port..."

        try {
            $udp = New-Object System.Net.Sockets.UdpClient
            $udp.Client.ReceiveTimeout = $timeoutMilliseconds

            $endpoint = New-Object System.Net.IPEndPoint($ip, $port)

            [void]$udp.Send(
                $packet,
                $packet.Length,
                $endpoint
            )

            $remoteEndpoint = New-Object System.Net.IPEndPoint(
                [System.Net.IPAddress]::Any,
                0
            )

            $response = $udp.Receive([ref]$remoteEndpoint)

            if ($response.Length -gt 0) {
                Write-Output "$serverName is ONLINE"
                Write-Output "Server address: $server"
                Write-Output "Query port: $port"
                Write-Output "Resolved IP: $ip"
            }
            else {
                Write-Output "$serverName is OFFLINE"
                Write-Output "No response was returned."
            }
        }
        catch {
            Write-Output "$serverName is OFFLINE"
            Write-Output "Server address: $server"
            Write-Output "Query port: $port"
            Write-Output "Reason: $($_.Exception.Message)"
        }
        finally {
            if ($null -ne $udp) {
                $udp.Close()
                $udp.Dispose()
            }
        }

        Write-Output ""
    }
}
catch {
    Write-Output "Unable to check the Arma 3 servers."
    Write-Output "Server address: $server"
    Write-Output "Reason: $($_.Exception.Message)"
}