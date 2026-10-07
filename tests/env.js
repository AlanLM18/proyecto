const os = require('os');
const path = require('path');

// Las pruebas usan una BD en memoria (no tocan data/practica3.db) y una carpeta temporal para backups
process.env.DB_PATH = ':memory:';
process.env.BACKUP_DIR = path.join(os.tmpdir(), 'practica3-backups-test');
