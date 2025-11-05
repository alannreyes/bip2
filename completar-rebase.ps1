# Script para completar el rebase y subir cambios
# Ejecutar: .\completar-rebase.ps1

# Configurar Git para no usar pager
$env:GIT_PAGER = ""

# Marcar conflicto resuelto
git add backend/Dockerfile

# Continuar rebase
git rebase --continue

# Agregar archivo de documentación
git add PORTAINER_FIX_ERROR_127.md

# Commit
git commit -m "docs: Agregar guía de solución para error 127 en Portainer"

# Push
git push origin main

Write-Host "¡Proceso completado!" -ForegroundColor Green

