set -euo pipefail

getent group ddupwiki >/dev/null 2>&1 || groupadd ddupwiki
id hermes | grep -q ddupwiki || usermod -aG ddupwiki hermes

test -d /opt/hermes/obsidian-wiki/.skills

mkdir -p /opt/ddup/wiki-vault/_raw
chown -R hermes:ddupwiki /opt/ddup/wiki-vault
chmod 2775 /opt/ddup/wiki-vault /opt/ddup/wiki-vault/_raw

chown -R hermes:hermes /opt/hermes/obsidian-wiki

sudo -iu hermes bash -lc 'set -e; src=/opt/hermes/obsidian-wiki/.skills; dst=/opt/hermes/.hermes/skills; mkdir -p "$dst"; for d in "$src"/*; do name=$(basename "$d"); if [ -e "$dst/$name" ]; then ln -sfn "$d" "$dst/obswiki-$name"; else ln -sfn "$d" "$dst/$name"; fi; done'

sudo -iu hermes bash -lc 'mkdir -p /opt/hermes/.obsidian-wiki; printf "OBSIDIAN_VAULT_PATH=/opt/ddup/wiki-vault\nOBSIDIAN_WIKI_REPO=/opt/hermes/obsidian-wiki\n" > /opt/hermes/.obsidian-wiki/config; chmod 600 /opt/hermes/.obsidian-wiki/config'
