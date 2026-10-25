# pulse/tools/auth-test.ps1
# Comprehensive test of Supabase auth flows for siwonikuayomide@gmail.com

$Project = "jqzsylkegjawhvlqaizj"
$Anon = "sb_publishable_hx7_k2pa5FUS4-aCyG7Mdg_CsHEWcpm"
$Email = "siwonikuayomide@gmail.com"
$Pass = "PulseTestPass123!"
$Base = "https://$Project.supabase.co"

function Invoke-AuthRequest {
  param(
    [string]$Method,
    [string]$Path,
    [string]$JsonBody,
    [hashtable]$ExtraHeaders
  )
  $uri = "$Base$Path"
  $h = @{"apikey" = $Anon; "Content-Type" = "application/json"}
  if ($ExtraHeaders) {
    foreach ($k in $ExtraHeaders.Keys) { $h[$k] = $ExtraHeaders[$k] }
  }
  $splat = @{
    Uri = $uri
    Method = $Method
    Headers = $h
    TimeoutSec = 30
  }
  if ($JsonBody) { $splat.Body = $JsonBody }
  try {
    $r = Invoke-WebRequest @splat
    Write-Output ("HTTP {0} : {1}" -f $r.StatusCode, $r.Content)
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

Write-Output "========== 1. Password grant (POST /auth/v1/token) =========="
$body1 = @{ email = $Email; password = $Pass; grant_type = "password" } | ConvertTo-Json -Compress
Write-Output ("SENDING: " + $body1)
Invoke-AuthRequest -Method Post -Path "/auth/v1/token" -JsonBody $body1

Write-Output "========== 2. OTP / magic link (POST /auth/v1/otp) =========="
$body2 = @{ email = $Email; create_user = $false } | ConvertTo-Json -Compress
Write-Output ("SENDING: " + $body2)
Invoke-AuthRequest -Method Post -Path "/auth/v1/otp" -JsonBody $body2

Write-Output "========== 3. Signup again (POST /auth/v1/signup) =========="
$body3 = @{ email = $Email; password = $Pass; email_confirm = $true } | ConvertTo-Json -Compress
Write-Output ("SENDING: " + $body3)
Invoke-AuthRequest -Method Post -Path "/auth/v1/signup" -JsonBody $body3

Write-Output "========== 4. Get user (GET /auth/v1/user) WITHOUT token =========="
Invoke-AuthRequest -Method Get -Path "/auth/v1/user"
