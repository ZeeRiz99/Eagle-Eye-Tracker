import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { storeAudio } from '../services/audioStorage';

export const uploadRouter = Router();

// 10 MB ceiling is far above a 30s audio clip; keeps a malformed body from
// exhausting memory while still allowing generous headroom.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith('audio/') || file.originalname.endsWith('.m4a');
    cb(null, ok);
  },
});

uploadRouter.post('/audio', requireAuth, upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Audio file required' });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const { url, local } = await storeAudio(req.file.buffer, req.file.mimetype, baseUrl);

  return res.status(201).json({ url, local });
});
