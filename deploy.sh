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
yarn build
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
