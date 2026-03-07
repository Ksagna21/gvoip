#!/bin/bash
# Usage: ./setup-freepbx.sh IP AMI_USER AMI_PASSWORD SSH_USER SSH_PASSWORD SSH_SUDO_PASSWORD
IP=$1
AMI_USER=${2:-gvoip}
AMI_PASSWORD=${3:-gvoip2024}
SSH_USER=${4:-root}
SSH_PASSWORD=${5:-}
SSH_SUDO_PASSWORD=${6:-}
SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')

echo "Configuration de $IP (user=$SSH_USER)..."

# Construire la commande SSH avec sshpass si mot de passe fourni
SSH_CMD="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10"
if [[ -n "$SSH_PASSWORD" ]]; then
  export SSHPASS="$SSH_PASSWORD"
  SSH_CMD="sshpass -e $SSH_CMD"
fi

# Wrapper pour exécuter en root (via su si non-root)
run_as_root() {
  local cmd="$1"
  if [[ "$SSH_USER" == "root" ]]; then
    $SSH_CMD root@$IP "$cmd"
  else
    local sudo_pass="${SSH_SUDO_PASSWORD:-$SSH_PASSWORD}"
    $SSH_CMD ${SSH_USER}@$IP "echo '$sudo_pass' | su -c '$cmd'"
  fi
}

$SSH_CMD ${SSH_USER}@$IP << SSHEOF
# 1. Ajouter utilisateur AMI si pas existant
if ! grep -q "\[$AMI_USER\]" /etc/asterisk/manager_additional.conf; then
cat >> /etc/asterisk/manager_additional.conf << EOF

[$AMI_USER]
secret = $AMI_PASSWORD
deny=0.0.0.0/0.0.0.0
permit=127.0.0.1/255.255.255.0
permit=$SERVER_IP/255.255.255.255
read = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate
write = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate
writetimeout = 100
EOF
echo "Utilisateur AMI $AMI_USER créé"
else
  # Mettre à jour le permit si déjà existant
  sed -i "/\[$AMI_USER\]/,/^$/s|permit=127.0.0.1.*|permit=127.0.0.1/255.255.255.0\npermit=$SERVER_IP/255.255.255.255|" /etc/asterisk/manager_additional.conf
  echo "Utilisateur AMI $AMI_USER mis à jour"
fi

# 2. Ouvrir bindaddr
sed -i 's/bindaddr = 127.0.0.1/bindaddr = 0.0.0.0/' /etc/asterisk/manager.conf

# 3. Recharger AMI
asterisk -rx "manager reload"

# 4. Fail2ban whitelist
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 192.168.1.0/24
EOF
fail2ban-client reload 2>/dev/null

# 5. Firewall FreePBX
fwconsole firewall trust $SERVER_IP 2>/dev/null

# 6. Règle iptables persistante
iptables -I fpbxfirewall -s $SERVER_IP -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -s $SERVER_IP -j ACCEPT

cat > /usr/local/bin/allow-ami.sh << EOF
#!/bin/bash
sleep 30
iptables -I fpbxfirewall -s $SERVER_IP -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -s $SERVER_IP -j ACCEPT
EOF
chmod +x /usr/local/bin/allow-ami.sh
(crontab -l 2>/dev/null | grep -v allow-ami; echo "@reboot /usr/local/bin/allow-ami.sh") | crontab -
/usr/local/bin/allow-ami.sh

# 7. Sauvegarder iptables
iptables-save > /etc/sysconfig/iptables 2>/dev/null

echo "Configuration terminée !"
SSHEOF

# Installer sshpass si besoin
command -v sshpass &>/dev/null || apt-get install -y -qq sshpass 2>/dev/null || yum install -y -q sshpass 2>/dev/null || true

echo "Test de connexion AMI..."
sleep 2
RESULT=$(echo -e "Action: Login\r\nUsername: $AMI_USER\r\nSecret: $AMI_PASSWORD\r\n\r\n" | nc -w 3 $IP 5038)
if echo "$RESULT" | grep -q "Authentication accepted"; then
  echo "✅ AMI $IP connecté avec succès !"
  exit 0
else
  echo "❌ Échec connexion AMI sur $IP"
  echo "$RESULT"
  exit 1
fi
