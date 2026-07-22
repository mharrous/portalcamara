param(
  [string]$OutputDirectory = ".\backups"
)

$ErrorActionPreference = "Stop"
$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\$OutputDirectory"))
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outputFile = Join-Path $resolvedOutput "portal-camara-auth-$timestamp.sql"

Write-Host "Exportando portal-camara-auth a $outputFile"
& npx wrangler d1 export portal-camara-auth --remote --output $outputFile
if ($LASTEXITCODE -ne 0) {
  throw "La exportación de D1 no se completó."
}

Write-Host "Copia creada correctamente. Guárdala cifrada y fuera del repositorio."
