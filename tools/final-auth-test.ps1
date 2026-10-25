# pulse/tools/final-auth-test.ps1
# Final attempt at Supabase auth flows for siwonikuayomide@gmail.com

$Project = "jqzsylkegjawhvlqaizj"
$Anon = "sb_publishable_hx7_k2pa5FUS4-aCyG7Mdg_CsHEWcpm"
$Email = "siwonikuayomide@gmail.com"
$Pass = "PulseTestPass123!"
$Base = "https://$Project.supabase.co"

function Send-Request {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Body,
    [hashtable]$Query
  )
  $uri = "$Base$Path"
  if ($Query) {
    $qs = ($Query.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '&'
    $uri = "$uri?$qs"
  }
  $h = @{"apikey" = $Anon; "Content-Type" = "application/json"}
  $json = if ($Body) { $Body | ConvertTo-Json -Compress } else { $null }
  try {
    $r = Invoke-RestMethod -Uri $uri -Method $Method -Headers $h -Body $json -TimeoutSec 30 -ContentType "application/json"
    Write-Output ("HTTP {0} : {1}" -f $r.StatusCode, ($r | ConvertTo-Json -Depth 4))
  } catch {
    $e = $_
    Write-Output ("EXC: {0}" -f $e.Exception.Message)
    if ($e.Exception.Response) {
      $s = $e.Exception.Response.GetResponseStream()
      $r2 = New-Object System.IO.StreamReader($s)
      Write-Output ("BODY: {0}" -f $r2.ReadToEnd())
    }
  }
}

Write-Output "========== 1. Password grant in URL query =========="
Send-Request -Method Post -Path "/auth/v1/token" -Query @{ grant_type = "password" } -Body @{ email = $Email; password = $Pass }

Write-Output "========== 2. OTP / magic link =========="
Send-Request -Method Post -Path "/auth/v1/otp" -Body @{ email = $Email; create_user = $false }

Write-Output "========== 3. Signup with email_confirm =========="
Send-Request -Method Post -Path "/auth/v1/signup" -Body @{ email = $Email; password = $Pass; email_confirm = $true }

Write-Output "========== Done =========="
