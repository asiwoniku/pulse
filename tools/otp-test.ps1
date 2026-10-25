# pulse/tools/otp-test.ps1
# Test OTP/magic-link flow for siwonikuayomide@gmail.com

$Project = "jqzsylkegjawhvlqaizj"
$Anon = "sb_publishable_hx7_k2pa5FUS4-aCyG7Mdg_CsHEWcpm"
$Email = "siwonikuayomide@gmail.com"
$Base = "https://$Project.supabase.co"

function Send-AuthRequest {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Body
  )
  $uri = "$Base$Path"
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

Write-Output "========== OTP / magic link (POST /auth/v1/otp) =========="
Write-Output ("EMAIL: " + $Email)
Send-AuthRequest -Method Post -Path "/auth/v1/otp" -Body @{ email = $Email; create_user = $false }

Write-Output "========== Resend confirmation (POST /auth/v1/otp with email) =========="
Send-AuthRequest -Method Post -Path "/auth/v1/otp" -Body @{ email = $Email; data = @{ email_confirm = $true } }

Write-Output "========== Token grant retry (POST /auth/v1/token) =========="
Send-AuthRequest -Method Post -Path "/auth/v1/token?grant_type=password" -Body @{ email = $Email; password = "PulseTestPass123!" }

Write-Output "========== Done =========="
