#!/bin/bash
# Usage: ./setup-freepbx.sh IP AMI_USER AMI_PASSWORD SERVER_IP
IP=$1
AMI_USER=${2:-gvoip}
AMI_PASSWORD=${3:-gvoip2024}
SERVER_IP=${4:-$(ip route get 1 2>/dev/null | awk '{print $7; exit}')}

echo "Configuration de $IP..."

ssh -o StrictHostKeyChecking=no root@$IP << SSHEOF
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
