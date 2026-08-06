$ErrorActionPreference = "Stop"

Push-Location $PSScriptRoot
try {
    Write-Host "Fuehre Tests aus ..."
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Tests fehlgeschlagen (Exit-Code $LASTEXITCODE) - Publish abgebrochen."
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

$publishDir = Join-Path $PSScriptRoot "publish"

if (Test-Path $publishDir) {
    Remove-Item $publishDir -Recurse -Force
}
New-Item -ItemType Directory -Path $publishDir | Out-Null

$files = @(
    "obfuscator.html",
    "obfuscator.css",
    "obfuscator-core.js",
    "obfuscator.js",
    "COHeader.jpg",
    "COIcon.jpg",
    "README.md"
)

foreach ($file in $files) {
    $src = Join-Path $PSScriptRoot $file
    $dst = Join-Path $publishDir $file
    Copy-Item $src $dst
    Write-Host "  Kopiert: $file"
}

Write-Host ""
Write-Host "Publish-Ordner bereit: $publishDir"
