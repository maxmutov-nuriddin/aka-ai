#!/usr/bin/env bash
# Jigar EcoSystem — serverni BIR MARTA tayyorlash (Ubuntu 22.04/24.04 yoki Debian 12). root sifatida:
#   sudo bash setup-server.sh
# Nima qiladi:
#   1) tizim yangilanadi, xavfsizlik yangilanishlari avtomatik o'rnatiladigan bo'ladi (unattended-upgrades);
#   2) faervol (ufw): faqat SSH, 80 va 443 ochiq — qolgan hamma port yopiq;
#   3) fail2ban: SSH'ga parol tanlab urinishlar bloklanadi;
#   4) SSH: root parol bilan kira olmaydi; SSH kaliti o'rnatilgan bo'lsa — parol bilan kirish butunlay o'chadi;
#   5) Docker (rasmiy ombordan) o'rnatiladi; Jigar uchun /opt/jigar papkasi yaratiladi.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "root sifatida ishga tushiring: sudo bash $0" >&2
  exit 1
fi
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" ]]; then
  echo "Bu skript Ubuntu/Debian uchun. Sizda: ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

APP_DIR=/opt/jigar
export DEBIAN_FRONTEND=noninteractive

echo "== 1. Tizim yangilanmoqda"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades rsync
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== 2. Faervol: faqat SSH, 80, 443"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== 3. fail2ban (SSH)"
cat > /etc/fail2ban/jail.d/jigar-sshd.conf <<'JAIL'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
JAIL
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "== 4. SSH"
SSHD_DROPIN=/etc/ssh/sshd_config.d/10-jigar.conf
has_keys=0
for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
  [[ -s "$f" ]] && has_keys=1
done
{
  echo "# Jigar: root faqat SSH kaliti bilan"
  echo "PermitRootLogin prohibit-password"
  echo "MaxAuthTries 4"
  if [[ $has_keys -eq 1 ]]; then
    echo "PasswordAuthentication no"
    echo "KbdInteractiveAuthentication no"
  fi
} > "$SSHD_DROPIN"
if sshd -t; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
else
  rm -f "$SSHD_DROPIN"
  echo "SSH sozlamasida xato — o'zgarish qaytarildi." >&2
fi
if [[ $has_keys -eq 0 ]]; then
  echo "DIQQAT: SSH kaliti topilmadi — parol bilan kirish OCHIQ qoldi."
  echo "  Mac'da: ssh-copy-id root@<server-ip>   keyin bu skriptni qayta ishga tushiring."
fi

echo "== 5. Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "== 6. Jigar papkasi: $APP_DIR"
mkdir -p "$APP_DIR/downloads"
chmod 750 "$APP_DIR"

echo
echo "Tayyor. Keyingi qadam — Mac'da: bash EcoSystem/deploy/upload.sh root@<server-ip>"
