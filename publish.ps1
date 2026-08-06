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

# U12: package.json ist die einzige Versionsquelle - der Badge in der
# kopierten HTML wird beim Publish daraus gesetzt statt separat gepflegt.
$packageJson = Get-Content (Join-Path $PSScriptRoot "package.json") -Raw | ConvertFrom-Json
$version = $packageJson.version
$htmlPath = Join-Path $publishDir "obfuscator.html"
(Get-Content $htmlPath -Raw) -replace '(?<=class="version-badge">v)[\d.]+(?=</span>)', $version |
    Set-Content $htmlPath -NoNewline
Write-Host "  Version-Badge gesetzt: v$version"

Write-Host ""
Write-Host "Publish-Ordner bereit: $publishDir"
