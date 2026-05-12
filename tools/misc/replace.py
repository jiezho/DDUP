import os
import re

def replace_in_dir(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.ts', '.tsx', '.css')):
                full_path = os.path.join(root, file)
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Replace paths like from "../lib/api" or from "../../lib/api" or import "../../styles/tokens.css"
                content = re.sub(r'from\s+["\'](?:\.\./)+lib/api["\']', 'from "@ddup/shared/lib/api"', content)
                content = re.sub(r'from\s+["\'](?:\.\./)+contexts/displayMode["\']', 'from "@ddup/shared/contexts/displayMode"', content)
                content = re.sub(r'from\s+["\'](?:\.\./)+ui["\']', 'from "@ddup/shared/ui"', content)
                content = re.sub(r'from\s+["\'](?:\.\./)+ui/([^"\']+)["\']', r'from "@ddup/shared/ui/\1"', content)
                content = re.sub(r'import\s+["\'](?:\.\./)+styles/([^"\']+)["\']', r'import "@ddup/shared/styles/\1"', content)
                
                # Also handle ./ imports if they exist (e.g., in App.tsx they might be ./lib/api)
                content = re.sub(r'from\s+["\']\./lib/api["\']', 'from "@ddup/shared/lib/api"', content)
                content = re.sub(r'from\s+["\']\./contexts/displayMode["\']', 'from "@ddup/shared/contexts/displayMode"', content)
                content = re.sub(r'from\s+["\']\./ui["\']', 'from "@ddup/shared/ui"', content)
                content = re.sub(r'from\s+["\']\./ui/([^"\']+)["\']', r'from "@ddup/shared/ui/\1"', content)
                content = re.sub(r'import\s+["\']\./styles/([^"\']+)["\']', r'import "@ddup/shared/styles/\1"', content)
                
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content)

replace_in_dir('apps/pc/src')
replace_in_dir('apps/mobile/src')
