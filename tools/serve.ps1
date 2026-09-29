# 開発用ローカルサーバー
#   powershell -ExecutionPolicy Bypass -File tools/serve.ps1
#   → http://localhost:8766/
# PUT /__build でビルド結果を docs/scenario.data.js に書き込む（build.html から使用）

$root = Split-Path $PSScriptRoot -Parent
$port = 8766
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$port/")
$l.Start()
Write-Host "serving $root at http://localhost:$port/"

$types = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"
  ".css" = "text/css; charset=utf-8"; ".json" = "application/json"; ".md" = "text/plain; charset=utf-8"
  ".png" = "image/png"; ".svg" = "image/svg+xml"
}

while ($l.IsListening) {
  $c = $l.GetContext()
  $req = $c.Request; $res = $c.Response
  try {
    $p = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart("/"))

    if ($req.HttpMethod -eq "PUT" -and $p -eq "__build") {
      $body = (New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
      [IO.File]::WriteAllText((Join-Path $root "docs\scenario.data.js"), $body, (New-Object Text.UTF8Encoding($false)))
      Write-Host "built docs/scenario.data.js ($($body.Length) chars)"
      $res.StatusCode = 204
      continue
    }

    if ($p -eq "") { $res.Redirect("/docs/"); continue }
    $f = [IO.Path]::GetFullPath((Join-Path $root $p))
    if (-not $f.StartsWith($root)) { $res.StatusCode = 403; continue }
    if (Test-Path $f -PathType Container) {
      if (-not $req.Url.AbsolutePath.EndsWith("/")) { $res.Redirect($req.Url.AbsolutePath + "/"); continue }
      $f = Join-Path $f "index.html"
    }
    if (Test-Path $f -PathType Leaf) {
      $b = [IO.File]::ReadAllBytes($f)
      $ext = [IO.Path]::GetExtension($f)
      if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] }
      $res.AddHeader("Cache-Control", "no-store")
      $res.OutputStream.Write($b, 0, $b.Length)
    } else { $res.StatusCode = 404 }
  } catch {
    Write-Host $_
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
