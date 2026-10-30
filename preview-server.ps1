$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8731/")
$listener.Start()
Write-Output "Serving $root on http://127.0.0.1:8731/"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = $ctx.Request.Url.AbsolutePath.TrimStart("/")
    if ($rel -eq "") { $rel = "landing.html" }
    $file = Join-Path $root $rel
    if (Test-Path -LiteralPath $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $types = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css"; ".js"="text/javascript"; ".png"="image/png"; ".jpg"="image/jpeg"; ".webp"="image/webp"; ".svg"="image/svg+xml" }
      $mime = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ctx.Response.StatusCode = 200
      $ctx.Response.ContentType = $mime
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 not found")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.OutputStream.Close()
  }
} finally { $listener.Close() }
