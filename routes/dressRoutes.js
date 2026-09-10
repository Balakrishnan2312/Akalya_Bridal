const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Dress = require('../models/Dress');
const { protectAdmin } = require('../middleware/authMiddleware');
const { ensureDbConnected } = require('../utils/db');
const { isSupportedImageBuffer } = require('../utils/imageValidation');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  // Keep uploads in memory only until they are persisted in MongoDB.
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPG, JPEG, PNG, WEBP, GIF) under 8MB are allowed!'));
  }
});

const formatDressObj = (doc) => {
  let imageUrl = doc.imageUrl;
  if (imageUrl && imageUrl.startsWith('/api/dresses/') && doc.updatedAt) {
    imageUrl = `${imageUrl}?v=${new Date(doc.updatedAt).getTime()}`;
  }

  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    name: doc.name,
    price: doc.price,
    description: doc.description || '',
    imageUrl,
    img: imageUrl,
    isAvailable: doc.isAvailable,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
};

const getLegacyUploadPath = (doc) => {
  let candidate = '';

  if (doc.imagePath) {
    const storedPath = path.resolve(doc.imagePath);
    if (storedPath.startsWith(`${path.resolve(uploadsDir)}${path.sep}`)) {
      candidate = storedPath;
    }
  }

  if (!candidate && doc.imageUrl && doc.imageUrl.includes('/uploads/')) {
    candidate = path.join(uploadsDir, path.basename(doc.imageUrl));
  }

  return candidate && fs.existsSync(candidate) ? candidate : '';
};

// GET /api/dresses - Public list all dresses
const getDresses = async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      return res.status(503).json({ success: false, message: 'Dress catalog database is temporarily unavailable.' });
    }
    const docs = await Dress.find().select('-imageData').sort({ createdAt: -1 });
    const formatted = docs.map(formatDressObj);
    return res.json(formatted);
  } catch (err) {
    console.error('[DRESSES] Database error:', err.message);
    return res.status(503).json({ success: false, message: 'Dress catalog database is temporarily unavailable.' });
  }
};

// GET /api/dresses/:id/image - Public image stream backed by MongoDB
const getDressImage = async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      return res.status(503).json({ success: false, message: 'Dress catalog database is temporarily unavailable.' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Dress image not found.' });
    }

    const doc = await Dress.findById(req.params.id)
      .select('+imageData imageContentType imageUrl imagePath');

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Dress image not found.' });
    }

    if (doc.imageData && doc.imageData.length > 0) {
      res.set({
        'Content-Type': doc.imageContentType || 'application/octet-stream',
        'Content-Length': doc.imageData.length,
        'Cache-Control': 'public, max-age=3600'
      });
      return res.send(doc.imageData);
    }

    const legacyPath = getLegacyUploadPath(doc);
    if (legacyPath) {
      return res.sendFile(legacyPath);
    }

    return res.status(404).json({ success: false, message: 'Dress image data not found.' });
  } catch (err) {
    console.error('[DRESSES] Error serving image:', err.message);
    return res.status(500).json({ success: false, message: 'Unable to load dress image.' });
  }
};

// GET /api/dresses/:id - Public get single dress
const getDressById = async (req, res) => {
  try {
    const { id } = req.params;
    const isConnected = await ensureDbConnected();

    if (!isConnected) {
      return res.status(503).json({ success: false, message: 'Dress catalog database is temporarily unavailable.' });
    }

    if (mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Dress.findById(id);
      if (doc) return res.json(formatDressObj(doc));
    }

    return res.status(404).json({ success: false, message: 'Dress not found.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error retrieving dress.' });
  }
};

// POST /api/dresses - Protected create dress
const createDress = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a dress image.' });
    }
    if (!isSupportedImageBuffer(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'The uploaded file content is not a valid supported image.' });
    }

    const { name, price, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Dress name is required.' });
    }
    if (name.trim().length > 120) {
      return res.status(400).json({ success: false, message: 'Dress name must be 120 characters or fewer.' });
    }
    if (description && String(description).trim().length > 1200) {
      return res.status(400).json({ success: false, message: 'Dress description must be 1200 characters or fewer.' });
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ success: false, message: 'Please enter a valid price in ₹.' });
    }

    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      return res.status(503).json({ success: false, message: 'Database connection unavailable.' });
    }

    const newDoc = new Dress({
      name: name.trim(),
      price: numericPrice,
      description: description ? description.trim() : '',
      imageUrl: 'pending',
      imagePath: '',
      imageData: req.file.buffer,
      imageContentType: req.file.mimetype,
      isAvailable: true
    });
    newDoc.imageUrl = `/api/dresses/${newDoc._id}/image`;
    await newDoc.save();

    console.log(`[DRESSES] Published new dress: ${newDoc._id} (${newDoc.name}) - ₹${newDoc.price}`);

    return res.status(201).json({
      success: true,
      message: 'Dress published successfully!',
      dress: formatDressObj(newDoc)
    });
  } catch (err) {
    console.error('[DRESSES] Exception publishing dress:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to publish dress.' });
  }
};

// PUT /api/dresses/:id - Protected update dress
const updateDress = async (req, res) => {
  try {
    if (req.file && !isSupportedImageBuffer(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'The uploaded file content is not a valid supported image.' });
    }

    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      return res.status(500).json({ success: false, message: 'Database connection unavailable.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Dress record not found.' });
    }

    const doc = await Dress.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Dress record not found.' });
    }

    const { name, price, description, isAvailable } = req.body;

    if (name && name.trim()) {
      if (name.trim().length > 120) {
        return res.status(400).json({ success: false, message: 'Dress name must be 120 characters or fewer.' });
      }
      doc.name = name.trim();
    }
    if (price !== undefined && price !== '') {
      const numericPrice = parseFloat(price);
      if (isNaN(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ success: false, message: 'Please enter a valid price in ₹.' });
      }
      doc.price = numericPrice;
    }
    if (description !== undefined) {
      const normalizedDescription = String(description).trim();
      if (normalizedDescription.length > 1200) {
        return res.status(400).json({ success: false, message: 'Dress description must be 1200 characters or fewer.' });
      }
      doc.description = normalizedDescription;
    }
    if (isAvailable !== undefined) {
      doc.isAvailable = (isAvailable === 'true' || isAvailable === true);
    }

    // If a new image is uploaded, replace the MongoDB-backed binary.
    const oldLegacyPath = getLegacyUploadPath(doc);
    if (req.file) {
      doc.imageUrl = `/api/dresses/${doc._id}/image`;
      doc.imagePath = '';
      doc.imageData = req.file.buffer;
      doc.imageContentType = req.file.mimetype;
    }

    await doc.save();

    if (req.file && oldLegacyPath) {
      try { fs.unlinkSync(oldLegacyPath); } catch (e) { console.warn('Could not unlink old dress file:', e.message); }
    }
    console.log(`[DRESSES] Updated dress ${id}: ${doc.name} - ₹${doc.price}`);

    return res.json({
      success: true,
      message: 'Dress details updated successfully!',
      dress: formatDressObj(doc)
    });
  } catch (err) {
    console.error('[DRESSES] Exception updating dress:', err.message);
    return res.status(500).json({ success: false, message: 'Error updating dress details.' });
  }
};

// DELETE /api/dresses/:id - Protected delete dress
const deleteDress = async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      return res.status(500).json({ success: false, message: 'Database connection unavailable.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Dress record not found.' });
    }

    const doc = await Dress.findById(id).select('+imageData');
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Dress record not found.' });
    }

    const targetFilePath = getLegacyUploadPath(doc);
    await Dress.findByIdAndDelete(id);

    if (targetFilePath) {
      try {
        fs.unlinkSync(targetFilePath);
      } catch (e) {
        console.warn('[DRESSES] Legacy image cleanup failed:', e.message);
      }
    }
    console.log(`[DRESSES] Deleted dress record ID: ${id}`);

    return res.json({
      success: true,
      message: 'Dress deleted successfully.'
    });
  } catch (err) {
    console.error('[DRESSES] Exception deleting dress:', err);
    return res.status(500).json({ success: false, message: 'Error deleting dress.' });
  }
};

router.get('/', getDresses);
router.get('/:id/image', getDressImage);
router.get('/:id', getDressById);
router.post('/', protectAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, createDress);
router.put('/:id', protectAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, updateDress);
router.delete('/:id', protectAdmin, deleteDress);

module.exports = {
  router,
  getDresses,
  getDressImage,
  createDress,
  updateDress,
  deleteDress,
  upload
};
