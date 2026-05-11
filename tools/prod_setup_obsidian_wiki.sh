set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  apt-get update -y >/dev/null
  apt-get install -y git >/dev/null
fi

getent group ddupwiki >/dev/null 2>&1 || groupadd ddupwiki
id hermes | grep -q ddupwiki || usermod -aG ddupwiki hermes

mkdir -p /opt/ddup/wiki-vault/_raw
chown -R hermes:ddupwiki /opt/ddup/wiki-vault
chmod 2775 /opt/ddup/wiki-vault /opt/ddup/wiki-vault/_raw

sudo -iu hermes bash -lc 'cd /opt/hermes && (test -d obsidian-wiki/.git && (cd obsidian-wiki && git pull) || git clone https://github.com/Ar9av/obsidian-wiki.git)'

sudo -iu hermes bash -lc 'set -e; src=/opt/hermes/obsidian-wiki/.skills; dst=/opt/hermes/.hermes/skills; test -d "$src"; mkdir -p "$dst"; for d in "$src"/*; do name=$(basename "$d"); if [ -e "$dst/$name" ]; then ln -sfn "$d" "$dst/obswiki-$name"; else ln -sfn "$d" "$dst/$name"; fi; done'

sudo -iu hermes bash -lc 'mkdir -p /opt/hermes/.obsidian-wiki; printf "OBSIDIAN_VAULT_PATH=/opt/ddup/wiki-vault\nOBSIDIAN_WIKI_REPO=/opt/hermes/obsidian-wiki\n" > /opt/hermes/.obsidian-wiki/config; chmod 600 /opt/hermes/.obsidian-wiki/config'

sudo -iu hermes bash -lc 'echo test > /opt/ddup/wiki-vault/_raw/.hermes_write_check && rm -f /opt/ddup/wiki-vault/_raw/.hermes_write_check'
