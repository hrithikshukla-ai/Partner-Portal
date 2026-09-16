const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

function diskStorage(subdir) {
  const dir = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });
}

const CERTIFICATE_TYPES = { '.pdf': 'pdf', '.jpeg': 'jpeg', '.jpg': 'jpg', '.png': 'png' };

const uploadCertificate = multer({
  storage: diskStorage('certificates'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!CERTIFICATE_TYPES[ext]) return cb(new Error('Only PDF, JPEG, JPG or PNG files are allowed'));
    cb(null, true);
  },
});

const uploadDocument = multer({
  storage: diskStorage('documents'),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function fileTypeFromExt(filename) {
  return CERTIFICATE_TYPES[path.extname(filename).toLowerCase()] || null;
}

module.exports = { UPLOAD_ROOT, uploadCertificate, uploadDocument, fileTypeFromExt };
