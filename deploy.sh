#!/bin/bash
set -e
echo "=== Deploy Ikas-Txiki ==="
cd /var/www/ikastxiki

echo "→ Actualizando código..."
git fetch origin
git reset --hard origin/main

echo "→ Instalando dependencias frontend..."
cd frontend
yarn install --frozen-lockfile 2>/dev/null || yarn install
echo "→ Construyendo frontend..."

# CRA assigns a content hash to each JavaScript chunk.  Keeping the previous
# static assets prevents an already open browser/PWA from failing while it
# refreshes from its old entry bundle to the new one.
ASSET_BACKUP="$(mktemp -d)"
cleanup_assets() {
    rm -rf "$ASSET_BACKUP"
}
trap cleanup_assets EXIT
if [ -d build/static ]; then
    cp -a build/static "$ASSET_BACKUP/static"
fi
yarn build
if [ -d "$ASSET_BACKUP/static" ]; then
    while IFS= read -r -d '' OLD_ASSET; do
        RELATIVE_PATH="${OLD_ASSET#"$ASSET_BACKUP/static/"}"
        NEW_ASSET="build/static/$RELATIVE_PATH"
        if [ ! -e "$NEW_ASSET" ]; then
            mkdir -p "$(dirname "$NEW_ASSET")"
            cp -a "$OLD_ASSET" "$NEW_ASSET"
        fi
    done < <(find "$ASSET_BACKUP/static" -type f -print0)
fi

# The build can inherit a restrictive umask (for example 0077), which makes
# index.html or static/ unreadable to Apache and causes a 403 response.
echo "→ Normalizando permisos públicos del frontend..."
find build -type d -exec chmod 755 {} +
find build -type f -exec chmod 644 {} +
cd ..

echo "→ Verificando proxy /uploads en Apache..."
SSL_CONF="/etc/apache2/sites-available/ikasfutbase-le-ssl.conf"
HTTP_CONF="/etc/apache2/sites-available/ikasfutbase.conf"
for CONF in "$SSL_CONF" "$HTTP_CONF"; do
    if [ -f "$CONF" ] && ! grep -q "ProxyPass /uploads" "$CONF"; then
        sed -i "/ProxyPass \/api/a\    ProxyPass /uploads http://127.0.0.1:8003/uploads\n    ProxyPassReverse /uploads http://127.0.0.1:8003/uploads" "$CONF"
        echo "  → Proxy /uploads añadido a $CONF"
    fi
done

echo "→ Reiniciando backend..."
sudo systemctl restart ikastxiki-backend

echo "→ Recargando Apache..."
sudo apache2ctl configtest && sudo systemctl reload apache2

echo ""
echo "✓ Deploy completado: $(date)"
