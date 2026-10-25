# pulse/tools/auth-suite.ps1
# Helpers for the live-auth test account setup.

$Project = "jqzsylkegjawhvlqaizj"
$Anon = "sb_publishable_hx7_k2pa5FUS4-aCyG7Mdg_CsHEWcpm"
$Email = "siwonikuayomide@gmail.com"
$Pass = "PulseTestPass123!"

function Invoke-SupabaseRestHeader {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Body,
    [hashtable]$Headers
  )
  $uri = "https://$Project.supabase.co$Path"
  $h = @{"apikey" = $Anon; "Content-Type" = "application/json"}
  if ($Headers) {
    foreach ($k in $Headers.Keys) { $h[$k] = $Headers[$k] }
  }
  try {
    $json = $Body | ConvertTo-Json -Compress
    return Invoke-RestMethod -Uri $uri -Method $Method -Body $json -Headers $h -TimeoutSec 30
  } catch {
    if ($_.Exception.Response) {
      $s = $_.Exception.Response.GetResponseStream()
      $r = New-Object System.IO.StreamReader($s)
      $txt = $r.ReadToEnd()
      Write-Output "ERR (HTTP $_): $txt"
    } else {
      Write-Output ("ERR: " + $_.Exception.Message)
    }
  }
}


function Invoke-SupabaseRestForm {
  param([string]$Method, [string]$Path, [hashtable]$Body)
  $uri = "https://$Project.supabase.co$Path"
  $h = @{"apikey" = $Anon; "Content-Type" = "application/x-www-form-urlencoded"}
  try {
    $enc = @()
    foreach ($k in $Body.Keys) { $enc += "$k=" + [Uri]::EscapeDataString($Body[$k]) }
    $body = $enc -join "&"
    return Invoke-RestMethod -Uri $uri -Method $Method -Body $body -Headers $h -TimeoutSec 30
  } catch {
    if ($_.Exception.Response) {
      $s = $_.Exception.Response.GetResponseStream()
      $r = New-Object System.IO.StreamReader($s)
      $txt = $r.ReadToEnd()
      Write-Output "ERR (HTTP $_): $txt"
    } else {
      Write-Output ("ERR: " + $_.Exception.Message)
    }
  }
}
Write-Output "=== Test 1: Supabase user/token (password grant) ==="
$result = Invoke-SupabaseRestHeader -Method Post -Path "/auth/v1/user/token" -Body @{
  email = $Email
  password = $Pass
  grant_type = "password"
}
if ($result -is [string]) {
  Write-Output $result
} else {
  Write-Output ($result | ConvertTo-Json -Depth 4)
  $tok = $result.access_token
  if ($tok) {
    Write-Output "=== Test 2a: authenticated user record (from token) ==="
    Invoke-SupabaseRestHeader -Method Get -Path "/auth/v1/user" -Headers @{
      Authorization = "Bearer $tok"
    }
  }
}

Write-Output "=== Test 2b: sign-in to the Pulse service ==="
$result2 = Invoke-SupabaseRestHeader -Method Post -Path "/api/auth/signin" -Body @{
  email = $Email
  password = $Pass
}
Write-Output ($result2 | ConvertTo-Json -Depth 4)
