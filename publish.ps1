$publishDir = Join-Path $PSScriptRoot "publish"

if (Test-Path $publishDir) {
    Remove-Item $publishDir -Recurse -Force
}
New-Item -ItemType Directory -Path $publishDir | Out-Null

$files = @(
    "obfuscator.html",
    "obfuscator.css",
    "obfuscator-core.js",
    "obfuscator.js"
)

foreach ($file in $files) {
    $src = Join-Path $PSScriptRoot $file
    $dst = Join-Path $publishDir $file
    Copy-Item $src $dst
    Write-Host "  Kopiert: $file"
}

Write-Host ""
Write-Host "Publish-Ordner bereit: $publishDir"
