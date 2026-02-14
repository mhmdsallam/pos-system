$ErrorActionPreference = "Stop"

Write-Host "STARTING FULL CLEAN PRODUCTION BUILD..."

# 1. CLEANUP
Write-Host "Cleaning ..."
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "dist-packaged") { Remove-Item -Recurse -Force "dist-packaged" }
if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
if (Test-Path "app/frontend/dist") { Remove-Item -Recurse -Force "app/frontend/dist" }

# 2. BUILD FRONTEND
Write-Host "Building Frontend..."
Set-Location "app/frontend"
if (!(Test-Path "node_modules")) { npm install }
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed!"; exit 1 }
Set-Location -Path "..\.."

# 3. PREPARE STAGING AREA
Write-Host "Preparing Staging Area..."
New-Item -ItemType Directory -Force -Path "build" | Out-Null
New-Item -ItemType Directory -Force -Path "build/frontend" | Out-Null

Copy-Item -Recurse "app/backend" "build/"
Copy-Item -Recurse "app/electron" "build/"
Copy-Item -Recurse "app/frontend/dist" "build/frontend/"
Copy-Item "app/package.json" "build/package.json"

# 4. INSTALL DEPENDENCIES
Write-Host "Installing Dependencies..."
Set-Location "build"

npm install
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }

Write-Host "Rebuilding SQLite..."
npx electron-builder install-app-deps
if ($LASTEXITCODE -ne 0) { Write-Error "Native rebuild failed"; exit 1 }

# 5. PACKAGE
Write-Host "Packaging..."
# Install electron-packager if not present
if (!(Test-Path "node_modules/.bin/electron-packager")) {
    npm install electron-packager --save-dev
}

npx electron-packager . "Restaurant POS" --platform=win32 --arch=x64 --out=../dist-packaged --overwrite --icon=../frontend/dist/vite.svg --prune=true
if ($LASTEXITCODE -ne 0) { Write-Error "Packaging failed!"; exit 1 }

Set-Location ..

Write-Host "BUILD COMPLETE!"
Write-Host "Location: dist-packaged/Restaurant POS-win32-x64/Restaurant POS.exe"
