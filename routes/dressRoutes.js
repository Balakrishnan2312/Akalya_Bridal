const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Dress = require('../models/Dress');
const { protectAdmin } = require('../middleware/authMiddleware');
const { ensureDbConnected } = require('../utils/db');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `dress-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
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

const formatDressObj = (doc) => ({
  id: doc._id.toString(),
  _id: doc._id.toString(),
  name: doc.name,
  price: doc.price,
  description: doc.description || '',
  imageUrl: doc.imageUrl,
  img: doc.imageUrl,
  isAvailable: doc.isAvailable,
  createdAt: doc.createdAt
});

const fallbackDresses = [
  {
    id: "d1",
    _id: "d1",
    name: "Royal Crimson Silk Lehenga",
    price: 34999,
    description: "Exquisite hand-embroidery with intricate zardosi detail on pure raw silk, designed for a timeless bridal look.",
    imageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=900&auto=format&fit=crop",
    img: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=900&auto=format&fit=crop",
    isAvailable: true
  },
  {
    id: "d2",
    _id: "d2",
    name: "Golden Zari Kanjivaram Saree",
    price: 28500,
    description: "Authentic pure silk Kanjivaram saree featuring traditional golden zari weave and rich pallu design.",
    imageUrl: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?q=80&w=900&auto=format&fit=crop",
    img: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?q=80&w=900&auto=format&fit=crop",
    isAvailable: true
  },
  {
    id: "d3",
    _id: "d3",
    name: "Pastel Rose Floral Gown",
    price: 22000,
    description: "Modern romantic reception gown crafted with subtle sequence work and multi-layer organza flare.",
    imageUrl: "https://images.unsplash.com/photo-1594552072238-b8a33785b261?q=80&w=900&auto=format&fit=crop",
    img: "https://images.unsplash.com/photo-1594552072238-b8a33785b261?q=80&w=900&auto=format&fit=crop",
    isAvailable: true
  },
  {
    id: "d4",
    _id: "d4",
    name: "Heritage Velvet Bridal Lehenga",
    price: 42999,
    description: "Heavy velvet bridal lehenga with royal dabka and pearl embellishments for an unforgettable wedding ceremony.",
    imageUrl: "https://images.unsplash.com/photo-1566174053879-31528523f8ae?q=80&w=900&auto=format&fit=crop",
    img: "https://images.unsplash.com/photo-1566174053879-31528523f8ae?q=80&w=900&auto=format&fit=crop",
    isAvailable: true
  }
];

// GET /api/dresses - Public list all dresses
const getDresses = async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      console.warn('[DRESSES] DB offline, serving fallback dresses');
      return res.json(fallbackDresses);
    }
    const docs = await Dress.find().sort({ createdAt: -1 });
    const formatted = docs.map(formatDressObj);
    return res.json(formatted.length > 0 ? formatted : fallbackDresses);
  } catch (err) {
    console.warn('[DRESSES] DB error, serving fallback dresses:', err.message);
    return res.json(fallbackDresses);
  }
};

// GET /api/dresses/:id - Public get single dress
const getDressById = async (req, res) => {
  try {
    const { id } = req.params;
    const isConnected = await ensureDbConnected();

    if (!isConnected) {
      const fb = fallbackDresses.find(d => d.id === id || d._id === id);
      if (fb) return res.json(fb);
      return res.status(404).json({ success: false, message: 'Dress not found.' });
    }

    if (mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Dress.findById(id);
      if (doc) return res.json(formatDressObj(doc));
    }

    const fb = fallbackDresses.find(d => d.id === id || d._id === id);
    if (fb) return res.json(fb);

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

    const { name, price, description } = req.body;
    if (!name || !name.trim()) {
      if (req.file && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
      return res.status(400).json({ success: false, message: 'Dress name is required.' });
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      if (req.file && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
      return res.status(400).json({ success: false, message: 'Please enter a valid price in ₹.' });
    }

    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      if (req.file && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
      return res.status(500).json({ success: false, message: 'Database connection unavailable.' });
    }

    const relativeUrlPath = `/uploads/${req.file.filename}`;

    const newDoc = await Dress.create({
      name: name.trim(),
      price: numericPrice,
      description: description ? description.trim() : '',
      imageUrl: relativeUrlPath,
      imagePath: req.file.path,
      isAvailable: true
    });

    console.log(`[DRESSES] Published new dress: ${newDoc._id} (${newDoc.name}) - ₹${newDoc.price}`);

    return res.status(201).json({
      success: true,
      message: 'Dress published successfully!',
      dress: formatDressObj(newDoc)
    });
  } catch (err) {
    console.error('[DRESSES] Exception publishing dress:', err.message);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(500).json({ success: false, message: err.message || 'Failed to publish dress.' });
  }
};

// PUT /api/dresses/:id - Protected update dress
const updateDress = async (req, res) => {
  try {
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
      if (req.file && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
      return res.status(404).json({ success: false, message: 'Dress record not found.' });
    }

    const { name, price, description, isAvailable } = req.body;

    if (name && name.trim()) {
      doc.name = name.trim();
    }
    if (price !== undefined && price !== '') {
      const numericPrice = parseFloat(price);
      if (!isNaN(numericPrice) && numericPrice >= 0) {
        doc.price = numericPrice;
      }
    }
    if (description !== undefined) {
      doc.description = description.trim();
    }
    if (isAvailable !== undefined) {
      doc.isAvailable = (isAvailable === 'true' || isAvailable === true);
    }

    // If new image uploaded, update image paths and remove old image file
    if (req.file) {
      const oldPath = doc.imagePath;
      doc.imageUrl = `/uploads/${req.file.filename}`;
      doc.imagePath = req.file.path;

      if (oldPath && fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { console.warn('Could not unlink old dress file:', e.message); }
      }
    }

    await doc.save();
    console.log(`[DRESSES] Updated dress ${id}: ${doc.name} - ₹${doc.price}`);

    return res.json({
      success: true,
      message: 'Dress details updated successfully!',
      dress: formatDressObj(doc)
    });
  } catch (err) {
    console.error('[DRESSES] Exception updating dress:', err.message);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
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

    const doc = await Dress.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Dress record not found.' });
    }

    // Clean up physical image file
    let targetFilePath = doc.imagePath;
    if (!targetFilePath && doc.imageUrl && doc.imageUrl.includes('/uploads/')) {
      const filename = path.basename(doc.imageUrl);
      targetFilePath = path.join(uploadsDir, filename);
    }

    if (targetFilePath && fs.existsSync(targetFilePath)) {
      try {
        fs.unlinkSync(targetFilePath);
        console.log(`[DRESSES] Unlinked image file: ${targetFilePath}`);
      } catch (e) {
        console.warn(`[DRESSES] Unlink failed for ${targetFilePath}:`, e.message);
      }
    }

    await Dress.findByIdAndDelete(id);
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
  createDress,
  updateDress,
  deleteDress,
  upload
};
