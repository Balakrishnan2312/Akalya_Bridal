const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const GalleryImage = require('../models/GalleryImage');
const { protectAdmin } = require('../middleware/authMiddleware');
const { ensureDbConnected } = require('../utils/db');
const { isSupportedImageBuffer } = require('../utils/imageValidation');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_CATEGORIES = new Set(['all', 'bridal', 'engagement', 'hair', 'party']);

const upload = multer({
  // Store the binary in MongoDB so uploads survive server restarts and
  // deployments that use an ephemeral filesystem.
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPG, JPEG, PNG, WEBP, GIF) under 5MB are allowed!'));
  }
});

const formatImageObj = (doc) => ({
  id: doc._id.toString(),
  _id: doc._id.toString(),
  img: doc.imageUrl,
  imageUrl: doc.imageUrl,
  cat: doc.category,
  category: doc.category,
  title: doc.title,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt
});

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

// GET /api/gallery & /images - Public get all images
const getGallery = async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      return res.status(503).json({ success: false, message: 'Gallery database is temporarily unavailable.' });
    }
    const docs = await GalleryImage.find().select('-imageData').sort({ createdAt: -1 });
    const formatted = docs.map(formatImageObj);
    return res.json(formatted);
  } catch (err) {
    console.error('[GALLERY] Database error:', err.message);
    return res.status(503).json({ success: false, message: 'Gallery database is temporarily unavailable.' });
  }
};

// GET /api/gallery/:id/image - Public image stream backed by MongoDB
const getGalleryImage = async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      return res.status(503).json({ success: false, message: 'Gallery database is temporarily unavailable.' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Image not found.' });
    }

    const doc = await GalleryImage.findById(req.params.id)
      .select('+imageData imageContentType imageUrl imagePath');

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Image not found.' });
    }

    if (doc.imageData && doc.imageData.length > 0) {
      res.set({
        'Content-Type': doc.imageContentType || 'application/octet-stream',
        'Content-Length': doc.imageData.length,
        'Cache-Control': 'public, max-age=86400'
      });
      return res.send(doc.imageData);
    }

    const legacyPath = getLegacyUploadPath(doc);
    if (legacyPath) {
      return res.sendFile(legacyPath);
    }

    return res.status(404).json({ success: false, message: 'Image data not found.' });
  } catch (err) {
    console.error('[GALLERY] Error serving image:', err.message);
    return res.status(500).json({ success: false, message: 'Unable to load image.' });
  }
};

// POST /api/gallery & /upload - Protected upload image
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image file.' });
    }
    if (!isSupportedImageBuffer(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'The uploaded file content is not a valid supported image.' });
    }

    // Verify MongoDB connection BEFORE saving document
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      console.error('[GALLERY] MongoDB connection unavailable during gallery upload.');
      return res.status(503).json({
        success: false,
        message: 'Gallery upload failed: Database connection unavailable.'
      });
    }

    const title = String(req.body.title || 'Studio Photo').trim();
    const category = String(req.body.category || 'all').trim().toLowerCase();
    if (title.length > 160) {
      return res.status(400).json({ success: false, message: 'Image title must be 160 characters or fewer.' });
    }
    if (!ALLOWED_CATEGORIES.has(category)) {
      return res.status(400).json({ success: false, message: 'Please select a valid gallery category.' });
    }

    const newDoc = new GalleryImage({
      title,
      category,
      imageUrl: 'pending',
      imagePath: '',
      imageData: req.file.buffer,
      imageContentType: req.file.mimetype
    });
    newDoc.imageUrl = `/api/gallery/${newDoc._id}/image`;
    await newDoc.save();

    console.log(`[GALLERY] Uploaded image: ${newDoc._id} (${title})`);

    res.status(201).json({
      success: true,
      message: 'Photo uploaded successfully to the gallery!',
      imageUrl: newDoc.imageUrl,
      image: formatImageObj(newDoc)
    });
  } catch (err) {
    console.error('[GALLERY] Exception uploading image:', err.message);
    const isDbErr = err.message && (err.message.includes('buffering') || err.message.includes('connect') || err.name === 'MongooseError');
    const responseMsg = isDbErr ? 'Gallery upload failed: Database connection unavailable.' : (err.message || 'Image upload failed.');
    res.status(500).json({ success: false, message: responseMsg });
  }
};

// PUT /api/gallery/:id & /image/:id - Protected update category
const updateImage = async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      return res.status(500).json({ success: false, message: 'Database connection unavailable.' });
    }

    const { id } = req.params;
    const { category, title } = req.body;

    const doc = await GalleryImage.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Image record not found.' });
    }

    if (category) {
      const normalizedCategory = String(category).trim().toLowerCase();
      if (!ALLOWED_CATEGORIES.has(normalizedCategory)) {
        return res.status(400).json({ success: false, message: 'Please select a valid gallery category.' });
      }
      doc.category = normalizedCategory;
    }
    if (title) {
      const normalizedTitle = String(title).trim();
      if (normalizedTitle.length > 160) {
        return res.status(400).json({ success: false, message: 'Image title must be 160 characters or fewer.' });
      }
      doc.title = normalizedTitle;
    }

    await doc.save();
    console.log(`[GALLERY] Updated image ${id}: category=${doc.category}`);

    res.json({
      success: true,
      message: 'Image category updated successfully.',
      image: formatImageObj(doc)
    });
  } catch (err) {
    console.error('[GALLERY] Exception updating image:', err.message);
    res.status(500).json({ success: false, message: 'Error updating image.' });
  }
};

// DELETE /api/gallery/:id & /image/:id - Protected delete image
const deleteImage = async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      return res.status(500).json({ success: false, message: 'Database connection unavailable.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Image record not found.' });
    }

    const doc = await GalleryImage.findById(id).select('+imageData');
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Image record not found.' });
    }

    const legacyPath = getLegacyUploadPath(doc);
    await GalleryImage.findByIdAndDelete(doc._id);

    if (legacyPath) {
      try {
        fs.unlinkSync(legacyPath);
      } catch (e) {
        console.warn(`[GALLERY] Failed to delete legacy file: ${e.message}`);
      }
    }
    console.log(`[GALLERY] Deleted MongoDB gallery record ID: ${doc._id}`);

    return res.json({
      success: true,
      message: 'Image deleted successfully.'
    });
  } catch (err) {
    console.error('[GALLERY] Exception deleting image:', err);
    return res.status(500).json({ success: false, message: 'Error deleting image.' });
  }
};

router.get('/', getGallery);
router.get('/:id/image', getGalleryImage);

router.post('/', protectAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, uploadImage);

router.put('/:id', protectAdmin, updateImage);
router.delete('/:id', protectAdmin, deleteImage);

module.exports = {
  router,
  getGallery,
  getGalleryImage,
  uploadImage,
  updateImage,
  deleteImage,
  upload
};
