import os
import re
import stat
import sys
import zipfile

# The archive is untrusted. Validate the entire directory before extracting any file.
try:
    if len(sys.argv) != 3:
        raise ValueError()
    archive, target = sys.argv[1:]
    if os.path.getsize(archive) > 60 * 1024 * 1024 or os.path.lexists(target):
        raise ValueError()
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        if len(entries) > 2000:
            raise ValueError()
        total = 0
        names = set()
        for entry in entries:
            name = entry.filename
            parts = name.rstrip('/').split('/')
            mode = entry.external_attr >> 16
            if (not name or len(name) > 512 or len(parts) > 16 or
                any(not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', p) or p in ('.', '..') for p in parts) or
                parts[0] not in ('server', 'client') or name in names or
                stat.S_ISLNK(mode) or (mode and stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)) or
                entry.flag_bits & 1 or entry.file_size > 10 * 1024 * 1024):
                raise ValueError()
            names.add(name)
            total += entry.file_size
            if total > 50 * 1024 * 1024:
                raise ValueError()
        os.mkdir(target)
        for entry in entries:
            path = os.path.join(target, entry.filename)
            if entry.is_dir():
                os.makedirs(path, exist_ok=True)
            else:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with z.open(entry) as source, open(path, 'xb') as dest:
                    remaining = entry.file_size
                    while remaining:
                        data = source.read(min(remaining, 65536))
                        if not data:
                            raise ValueError()
                        dest.write(data)
                        remaining -= len(data)
                    if source.read(1):
                        raise ValueError()
except Exception:
    sys.stderr.write('Preview build archive rejected.\n')
    sys.exit(1)
