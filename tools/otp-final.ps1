$json = Get-Content 'c:\temp\otp_payload.json' -Raw
$h = @{'apikey'='sb_publishable_hx7_k2pa5FUS4-aCyG7Mdg_CsHEWcpm';'Content-Type'='application/json'}
try {
  $r = Invoke-RestMethod -Uri 'https://jqzsylkegjawhvlqaizj.supabase.co/auth/v1/otp' -Method Post -Headers $h -Body $json -TimeoutSec 30 -ContentType 'application/json'
  Write-Output ('HTTP ' + $r.StatusCode + ' : ' + ($r | ConvertTo-Json -Depth 4))
} catch {
  $e = $_
  Write-Output ('EXC: ' + $e.Exception.Message)
  if ($e.Exception.Response) {
    $s = $e.Exception.Response.GetResponseStream()
    $r2 = New-Object System.IO.StreamReader($s)
    Write-Output ('BODY: ' + $r2.ReadToEnd())
  }
}
